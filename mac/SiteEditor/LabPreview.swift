import AppKit
import WebKit

/// Serves the code folder's public/ at profolio-lab://site/…, so a lab piece
/// runs in the preview straight from the checkout — no dev server. Also
/// takes the tuning panel's Save (POST /__lab/save, see public/lab/tune.js),
/// writing the JSON it sends under public/lab/.
final class LabSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "profolio-lab"

    /// The checkout's public/ folder.
    var root: URL?
    /// A file was saved through /__lab/save (its path under public/).
    var onSave: ((String) -> Void)?

    func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
        guard let url = task.request.url, let root else { return fail(task, 404) }
        let path = url.path.removingPercentEncoding ?? url.path

        if path == "/__lab/save" {
            return save(task, root: root)
        }
        let file = root.appendingPathComponent(String(path.dropFirst()))
        // Stay inside public/.
        guard file.standardizedFileURL.path.hasPrefix(root.standardizedFileURL.path + "/"),
              let data = try? Data(contentsOf: file) else { return fail(task, 404) }
        respond(task, status: 200, type: Self.mime(file.pathExtension), body: data)
    }

    func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {}

    private func save(_ task: any WKURLSchemeTask, root: URL) {
        var body = task.request.httpBody
        if body == nil, let stream = task.request.httpBodyStream {
            stream.open()
            var data = Data()
            var buffer = [UInt8](repeating: 0, count: 16384)
            while stream.hasBytesAvailable {
                let n = stream.read(&buffer, maxLength: buffer.count)
                if n <= 0 { break }
                data.append(buffer, count: n)
            }
            stream.close()
            body = data
        }
        guard let body, let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
              let rel = json["path"] as? String,
              rel.range(of: #"^lab/[\w-]+/[\w-]+\.json$"#, options: .regularExpression) != nil else {
            return respond(task, status: 400, type: "text/plain", body: Data("Not a lab JSON path".utf8))
        }
        // The panel sends its own formatting (`text`); else format `data`.
        let text: String
        if let t = json["text"] as? String {
            text = t
        } else if let d = json["data"], let out = try? JSONSerialization.data(withJSONObject: d, options: [.prettyPrinted]) {
            text = String(decoding: out, as: UTF8.self) + "\n"
        } else {
            return respond(task, status: 400, type: "text/plain", body: Data("Nothing to save".utf8))
        }
        do {
            try text.write(to: root.appendingPathComponent(rel), atomically: true, encoding: .utf8)
            onSave?(rel)
            respond(task, status: 200, type: "application/json", body: Data(#"{"ok":true}"#.utf8))
        } catch {
            respond(task, status: 500, type: "text/plain", body: Data(error.localizedDescription.utf8))
        }
    }

    private func fail(_ task: any WKURLSchemeTask, _ status: Int) {
        respond(task, status: status, type: "text/plain", body: Data("Not found".utf8))
    }

    private func respond(_ task: any WKURLSchemeTask, status: Int, type: String, body: Data) {
        guard let url = task.request.url,
              let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1",
                                             headerFields: ["Content-Type": type, "Cache-Control": "no-store"]) else { return }
        task.didReceive(response)
        task.didReceive(body)
        task.didFinish()
    }

    static func mime(_ ext: String) -> String {
        switch ext.lowercased() {
        case "html": "text/html; charset=utf-8"
        case "js", "mjs": "text/javascript; charset=utf-8"
        case "css": "text/css; charset=utf-8"
        case "json": "application/json"
        case "svg": "image/svg+xml"
        case "png": "image/png"
        case "jpg", "jpeg": "image/jpeg"
        case "webp": "image/webp"
        case "gif": "image/gif"
        case "glb": "model/gltf-binary"
        case "mp4": "video/mp4"
        case "woff2": "font/woff2"
        default: "application/octet-stream"
        }
    }
}

/// The Lab's preview: one web view showing a lab piece from the checkout,
/// reloaded (keeping its scroll position) whenever the piece's files change.
/// It also keeps the page's console output, for the Lab's tools.
@MainActor
final class LabPreview: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    let webView: WKWebView
    let handler = LabSchemeHandler()
    private(set) var slug: String?
    private(set) var tuning = false
    /// Recent console lines and errors from the page.
    private(set) var console: [String] = []
    var onReload: (() -> Void)?
    /// An element was picked in the preview (Pick mode), described for the agent.
    var onPick: ((String) -> Void)?
    /// Pick mode: the next click in the preview picks an element instead of
    /// acting on it. Ends after one pick (or by setting it false).
    var picking = false {
        didSet { webView.evaluateJavaScript("window.__labPick && window.__labPick(\(picking))") }
    }

    private var stream: FSEventStreamRef?
    private var pendingReload: DispatchWorkItem?
    private var savedAt = Date.distantPast
    private var restoreScroll: Double?

    override init() {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(handler, forURLScheme: LabSchemeHandler.scheme)
        config.preferences.isElementFullscreenEnabled = true
        config.userContentController.addUserScript(WKUserScript(source: Self.consoleScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView = WKWebView(frame: .zero, configuration: config)
        webView.isInspectable = true
        super.init()
        // Through a weak relay: the content controller keeps its handlers.
        let relay = WeakScriptHandler()
        config.userContentController.add(relay, name: "labConsole")
        config.userContentController.add(relay, name: "labPick")
        config.userContentController.addUserScript(WKUserScript(source: Self.pickScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        relay.target = self
        webView.navigationDelegate = self
        handler.onSave = { [weak self] _ in
            DispatchQueue.main.async { self?.savedAt = Date() }
        }
    }

    func setRoot(_ publicFolder: URL?) {
        handler.root = publicFolder
    }

    func show(_ slug: String?, tuning: Bool = false) {
        self.slug = slug
        self.tuning = tuning
        console = []
        restoreScroll = nil
        watch()
        guard let slug, let url = URL(string: "\(LabSchemeHandler.scheme)://site/lab/\(slug)/index.html\(tuning ? "?tune" : "")") else {
            webView.loadHTMLString("", baseURL: nil)
            return
        }
        webView.load(URLRequest(url: url))
    }

    /// Reloads where it was scrolled to.
    func reload() {
        webView.evaluateJavaScript("window.scrollY") { [weak self] y, _ in
            MainActor.assumeIsolated {
                self?.restoreScroll = y as? Double
                self?.webView.reload()
            }
        }
    }

    func snapshot() async -> NSImage? {
        await withCheckedContinuation { cont in
            webView.takeSnapshot(with: nil) { image, _ in cont.resume(returning: image) }
        }
    }

    deinit {
        if let stream {
            FSEventStreamStop(stream)
            FSEventStreamInvalidate(stream)
            FSEventStreamRelease(stream)
        }
    }

    // MARK: - Watching the piece's files

    private func watch() {
        if let stream {
            FSEventStreamStop(stream)
            FSEventStreamInvalidate(stream)
            FSEventStreamRelease(stream)
            self.stream = nil
        }
        guard let slug, let root = handler.root else { return }
        // The piece's folder, and public/lab itself for the shared files.
        let paths = [root.appendingPathComponent("lab/\(slug)").path, root.appendingPathComponent("lab").path] as CFArray
        var context = FSEventStreamContext(version: 0, info: Unmanaged.passUnretained(self).toOpaque(), retain: nil, release: nil, copyDescription: nil)
        let callback: FSEventStreamCallback = { _, info, _, _, _, _ in
            guard let info else { return }
            let me = Unmanaged<LabPreview>.fromOpaque(info).takeUnretainedValue()
            DispatchQueue.main.async { MainActor.assumeIsolated { me.filesChanged() } }
        }
        guard let s = FSEventStreamCreate(nil, callback, &context, paths, FSEventStreamEventId(kFSEventStreamEventIdSinceNow), 0.2,
                                          FSEventStreamCreateFlags(kFSEventStreamCreateFlagFileEvents | kFSEventStreamCreateFlagNoDefer)) else { return }
        FSEventStreamSetDispatchQueue(s, .main)
        FSEventStreamStart(s)
        stream = s
    }

    private func filesChanged() {
        // The tuning panel's own Save: the page already shows those values.
        if Date().timeIntervalSince(savedAt) < 1.5 { return }
        pendingReload?.cancel()
        let work = DispatchWorkItem { [weak self] in
            self?.reload()
            self?.onReload?()
        }
        pendingReload = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3, execute: work)
    }

    // MARK: - Console

    private static let consoleScript = """
    (() => {
      const post = (level, args) => {
        try {
          const text = args.map(a => a instanceof Error ? (a.stack || a.message) : typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
          window.webkit.messageHandlers.labConsole.postMessage({ level, text })
        } catch {}
      }
      for (const level of ['log', 'info', 'warn', 'error']) {
        const original = console[level]
        console[level] = (...args) => { post(level, args); original.apply(console, args) }
      }
      window.addEventListener('error', e => post('error', [e.message + (e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : '')]))
      window.addEventListener('unhandledrejection', e => post('error', ['Unhandled rejection: ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason)]))
    })()
    """

    /// Pick mode in the page: outlines the element under the pointer; a
    /// click describes it (tag, id, classes, a CSS path, its text, where it
    /// is) and posts that instead of clicking it.
    private static let pickScript = """
    (() => {
      let on = false, box = null
      const outline = el => {
        if (!box) {
          box = document.createElement('div')
          box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #ff6a1f;background:rgba(255,106,31,.08);border-radius:3px;transition:all .06s'
          document.documentElement.appendChild(box)
        }
        const r = el.getBoundingClientRect()
        Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', display: 'block' })
      }
      const name = el => {
        let n = el.tagName.toLowerCase()
        if (el.id) return n + '#' + el.id
        const cls = [...el.classList].filter(c => !/^is-/.test(c)).slice(0, 2)
        return n + (cls.length ? '.' + cls.join('.') : '')
      }
      const path = el => {
        const parts = []
        for (let e = el; e && e.nodeType === 1 && parts.length < 6; e = e.parentElement) {
          parts.unshift(name(e))
          if (e.id) break
        }
        return parts.join(' > ')
      }
      const move = e => outline(e.target)
      const click = e => {
        e.preventDefault(); e.stopPropagation()
        const el = e.target, r = el.getBoundingClientRect()
        const group = el.closest('[id]')
        const text = (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 120)
        window.webkit.messageHandlers.labPick.postMessage([
          name(el),
          group && group !== el ? 'inside ' + name(group) : '',
          text ? '“' + text + '”' : '',
          'at ' + Math.round(r.left) + ',' + Math.round(r.top + scrollY) + ' (' + Math.round(r.width) + '×' + Math.round(r.height) + ')',
          'path: ' + path(el),
        ].filter(Boolean).join(' · '))
        set(false)
      }
      const set = v => {
        on = v
        for (const [t, f] of [['mousemove', move], ['click', click]]) {
          document[(v ? 'add' : 'remove') + 'EventListener'](t, f, true)
        }
        document.documentElement.style.cursor = v ? 'crosshair' : ''
        if (!v && box) box.style.display = 'none'
      }
      window.__labPick = set
    })()
    """

    nonisolated func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "labPick", let description = message.body as? String {
            MainActor.assumeIsolated {
                picking = false
                onPick?(description)
            }
            return
        }
        guard let body = message.body as? [String: Any], let text = body["text"] as? String else { return }
        let level = body["level"] as? String ?? "log"
        MainActor.assumeIsolated {
            console.append("[\(level)] \(text)")
            if console.count > 200 { console.removeFirst(console.count - 200) }
        }
    }

    // MARK: - Navigation

    nonisolated func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        MainActor.assumeIsolated {
            if picking { webView.evaluateJavaScript("window.__labPick && window.__labPick(true)") }
            if let y = restoreScroll {
                webView.evaluateJavaScript("window.scrollTo(0, \(y))")
                restoreScroll = nil
            }
        }
    }

    /// Links out of the piece open in the browser.
    nonisolated func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                             decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
        let url = action.request.url
        let leaving = action.navigationType == .linkActivated && url?.scheme != LabSchemeHandler.scheme
        MainActor.assumeIsolated {
            if leaving, let url { NSWorkspace.shared.open(url) }
            decisionHandler(leaving ? .cancel : .allow)
        }
    }
}

/// Passes script messages on without keeping their target alive.
private final class WeakScriptHandler: NSObject, WKScriptMessageHandler {
    weak var target: (any WKScriptMessageHandler)?

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}
