import AppKit
import SwiftUI
import WebKit

/// The live site in the editor window: one page at a device width, its
/// sections outlined on hover and picked with a click.
@MainActor
final class PreviewPane: NSObject {
    let webView: WKWebView
    private let support: WebViewSupport

    /// A section was clicked (its DOM id).
    var onPickSection: ((String) -> Void)?
    /// The page navigated by itself (a link in the site), to this path.
    var onNavigate: ((String) -> Void)?
    /// A page finished loading.
    var onLoad: (() -> Void)?

    init(document: SiteDocument) {
        let relay = MessageRelay()
        (webView, support) = WebViewSupport.makeWebView(document: document, role: "preview") { config in
            config.userContentController.addUserScript(WKUserScript(source: Self.script, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
            config.userContentController.add(relay, name: "pofole")
        }
        super.init()
        relay.target = self
        support.onFinish = { [weak self] _ in self?.onLoad?() }
    }

    /// Returns false when the page is already showing (no load, no onLoad).
    @discardableResult
    func load(path: String, language: String) -> Bool {
        let prefix = language == "en" ? "" : "/\(language)"
        let full = path == "/" && !prefix.isEmpty ? prefix : prefix + path
        guard let url = URL(string: "\(PackageSchemeHandler.scheme)://site\(full)"), webView.url != url else { return false }
        webView.load(URLRequest(url: url))
        return true
    }

    /// The page's sections (DOM ids) and the selected one.
    func show(anchors: [String], selected: String?, scroll: Bool) {
        let list = (try? JSONSerialization.data(withJSONObject: anchors)).flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
        let sel = selected.map { "'\($0.replacingOccurrences(of: "'", with: "\\'"))'" } ?? "null"
        webView.evaluateJavaScript("window.__pofole && window.__pofole.show(\(list), \(sel), \(scroll))")
    }

    /// Unsaved content for the page showing (src/pages/ProjectDetail.jsx
    /// renders it instead of the file); `contentPath` is its public URL path.
    func push(contentPath: String, json: String) {
        guard let pathLiteral = try? JSONSerialization.data(withJSONObject: [contentPath, json]),
              let args = String(data: pathLiteral, encoding: .utf8) else { return }
        webView.evaluateJavaScript("(() => { const [path, json] = \(args); window.postMessage({ type: 'pofole:doc', path, doc: JSON.parse(json) }, '*') })()")
    }

    /// Content changed on disk: reload, staying where the viewer was.
    func reloadKeepingScroll() {
        webView.evaluateJavaScript("window.__pofole ? window.__pofole.reload() : location.reload()")
    }

    fileprivate func receive(_ body: Any) {
        guard let msg = body as? [String: Any] else { return }
        switch msg["type"] as? String {
        case "pick": (msg["anchor"] as? String).map { onPickSection?($0) }
        case "navigate": (msg["path"] as? String).map { onNavigate?($0) }
        default: break
        }
    }

    /// WKUserContentController keeps its handlers alive; this keeps the pane out of that.
    private final class MessageRelay: NSObject, WKScriptMessageHandler {
        weak var target: PreviewPane?
        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            MainActor.assumeIsolated { target?.receive(message.body) }
        }
    }

    private static let script = """
    (() => {
      const P = window.__pofole = { anchors: [], selected: null, scrollPending: false };
      const post = (m) => { try { window.webkit.messageHandlers.pofole.postMessage(m) } catch {} };
      const style = document.createElement('style');
      style.textContent = '[data-pofole-hover]{outline:2px dashed rgba(47,111,219,.6)!important;outline-offset:-2px}'
        + '[data-pofole-selected]{outline:2px solid #2F6FDB!important;outline-offset:-2px}';
      document.documentElement.appendChild(style);

      const sectionOf = (el) => {
        for (; el && el !== document.body; el = el.parentElement) if (el.id && P.anchors.includes(el.id)) return el;
        return null;
      };
      let hovered = null;
      document.addEventListener('mouseover', (e) => {
        const s = sectionOf(e.target);
        if (s === hovered) return;
        if (hovered) hovered.removeAttribute('data-pofole-hover');
        hovered = s;
        if (s && s.id !== P.selected) s.setAttribute('data-pofole-hover', '');
      }, true);
      // First click on a section picks it; once picked, clicks inside go to
      // the page (tabs, carousels) as usual.
      document.addEventListener('click', (e) => {
        const s = sectionOf(e.target);
        if (!s || s.id === P.selected) return;
        e.preventDefault(); e.stopPropagation();
        P.select(s.id, false);
        post({ type: 'pick', anchor: s.id });
      }, true);

      const apply = () => {
        document.querySelectorAll('[data-pofole-selected]').forEach((x) => { if (x.id !== P.selected) x.removeAttribute('data-pofole-selected') });
        const el = P.selected && document.getElementById(P.selected);
        if (!el) return;
        el.setAttribute('data-pofole-selected', '');
        el.removeAttribute('data-pofole-hover');
        if (P.scrollPending) { P.scrollPending = false; el.scrollIntoView({ block: 'start', behavior: 'smooth' }) }
      };
      P.select = (id, scroll) => { P.selected = id; P.scrollPending = !!scroll; apply() };
      P.show = (anchors, selected, scroll) => { P.anchors = anchors; P.select(selected, scroll) };
      // Sections render after their data loads; keep the outline on them.
      let queued = false;
      new MutationObserver(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; apply() });
      }).observe(document.body, { childList: true, subtree: true });

      P.reload = () => { try { sessionStorage.setItem('pofoleScroll', String(window.scrollY)) } catch {} location.reload() };
      try {
        const y = sessionStorage.getItem('pofoleScroll');
        if (y !== null) {
          sessionStorage.removeItem('pofoleScroll');
          for (const t of [60, 400, 1200]) setTimeout(() => window.scrollTo(0, +y), t);
        }
      } catch {}

      let last = location.pathname;
      const report = () => { if (location.pathname !== last) { last = location.pathname; post({ type: 'navigate', path: last }) } };
      const push = history.pushState;
      history.pushState = function (...a) { const r = push.apply(this, a); report(); return r };
      window.addEventListener('popstate', report);
    })();
    """
}

/// The selected page's form: the web editor's page, embedded (?embed=1).
@MainActor
final class InspectorPane {
    let webView: WKWebView
    private let support: WebViewSupport
    private var language = "en"

    init(document: SiteDocument) {
        (webView, support) = WebViewSupport.makeWebView(document: document, role: "inspector")
        installLanguage()
    }

    func load(editorPath: String) {
        guard let url = URL(string: "\(PackageSchemeHandler.scheme)://site\(editorPath)?embed=1") else { return }
        if webView.url == url { return }
        webView.load(URLRequest(url: url))
    }

    /// The editor reads its language (src/pages/editor/EditorLayout.jsx,
    /// "editorLang") before rendering, so it's set as the page starts.
    func setLanguage(_ code: String) {
        guard code != language else { return }
        language = code
        installLanguage()
        webView.reload()
    }

    private func installLanguage() {
        let controller = webView.configuration.userContentController
        controller.removeAllUserScripts()
        WebConsole.addScript(to: controller)
        controller.addUserScript(WKUserScript(source: "try { localStorage.setItem('editorLang', '\(language)') } catch {}",
                                              injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }

    func selectSection(_ index: Int) {
        webView.evaluateJavaScript("window.postMessage({ type: 'pofole:select-section', index: \(index) }, '*')")
    }

    func save() {
        webView.evaluateJavaScript("window.postMessage({ type: 'pofole:save' }, '*')")
    }

    /// Whether the form has edits that weren't saved (src/pages/editor/pofole.js).
    func hasUnsavedEdits() async -> Bool {
        (try? await webView.evaluateJavaScript("window.__pofoleDirty === true")) as? Bool ?? false
    }

    func reload() { webView.reload() }
}

/// Shows a pane's web view in SwiftUI.
struct WebViewHost: NSViewRepresentable {
    let webView: WKWebView
    var pageZoom: CGFloat = 1

    func makeNSView(context: Context) -> WKWebView { webView }

    func updateNSView(_ view: WKWebView, context: Context) {
        if abs(view.pageZoom - pageZoom) > 0.001 { view.pageZoom = pageZoom }
    }
}

/// The site's home page at desktop size, drawn out of sight: Finder shows a
/// package's QuickLook/Thumbnail.png as its icon.
@MainActor
enum HomeThumbnail {
    static func capture(document: SiteDocument, width: Double) async -> CGImage? {
        let size = EditorModel.Device.desktop.size
        // An unseen window's animations never run, so pages fading in would
        // stay blank: everything jumps to how it ends, animated images too.
        let (webView, support) = WebViewSupport.makeWebView(document: document, role: "thumbnail", stillImages: true) { config in
            config.userContentController.addUserScript(WKUserScript(source: Self.stillScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        // WebKit only draws a view in a window; this one sits off every screen.
        let window = NSWindow(contentRect: CGRect(origin: CGPoint(x: -30_000, y: -30_000), size: size),
                              styleMask: .borderless, backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentView = webView
        window.orderBack(nil)
        defer { window.orderOut(nil); window.contentView = nil }

        final class Once { var done = false }
        let once = Once()
        let loaded = await withCheckedContinuation { (c: CheckedContinuation<Bool, Never>) in
            let finish = { (ok: Bool) in if !once.done { once.done = true; c.resume(returning: ok) } }
            support.onFinish = { _ in finish(true) }
            webView.load(URLRequest(url: URL(string: "\(PackageSchemeHandler.scheme)://site/")!))
            DispatchQueue.main.asyncAfter(deadline: .now() + 20) { finish(false) }
        }
        guard loaded else { return nil }
        // Content, fonts, images and entrance animations settle.
        try? await Task.sleep(nanoseconds: 3_000_000_000)
        let config = WKSnapshotConfiguration()
        config.rect = webView.bounds
        config.snapshotWidth = NSNumber(value: width / window.backingScaleFactor)
        config.afterScreenUpdates = true
        return (try? await webView.takeSnapshot(configuration: config))?.cgImage(forProposedRect: nil, context: nil, hints: nil)
    }

    private static let stillScript = """
    (() => {
      const style = document.createElement('style');
      style.textContent = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}';
      document.documentElement.appendChild(style);
    })();
    """
}
