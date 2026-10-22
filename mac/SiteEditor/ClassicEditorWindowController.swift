import AppKit
import WebKit

/// The web editor as a whole (its own sidebar, preview and forms) in one
/// window — Profolio 0.1's editor, kept for what the native editor doesn't
/// cover yet (View ▸ Open Classic Editor).
final class ClassicEditorWindowController: NSWindowController {
    private var webView: WKWebView!
    private var support: WebViewSupport!
    private var observer: NSObjectProtocol?

    convenience init(document: SiteDocument) {
        let (webView, support) = WebViewSupport.makeWebView(document: document, role: "classic")
        webView.allowsBackForwardNavigationGestures = true

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false)
        window.minSize = NSSize(width: 800, height: 500)
        window.contentView = webView
        window.center()
        window.setFrameAutosaveName("ClassicEditorWindow")

        self.init(window: window)
        self.webView = webView
        self.support = support
        shouldCloseDocument = false

        // Content JSON saved → public pages reload (the editor's preview
        // iframe, or the site itself in the main frame); see src/main.jsx.
        observer = NotificationCenter.default.addObserver(forName: EditorAPI.contentChanged, object: document.api, queue: .main) { [weak webView] note in
            let paths = note.userInfo?["paths"] as? Set<String> ?? []
            guard paths.contains(where: { $0.hasPrefix("site/src/") }) else { return }
            webView?.evaluateJavaScript("""
                window.postMessage('siteproj:content-changed', '*');
                document.querySelectorAll('iframe').forEach(f => {
                  try { f.contentWindow.postMessage('siteproj:content-changed', '*') } catch {}
                });
                """)
        }
        webView.load(URLRequest(url: PackageSchemeHandler.editorURL))
    }

    deinit {
        if let observer { NotificationCenter.default.removeObserver(observer) }
    }

    @objc func reloadEditor(_ sender: Any?) {
        (document as? SiteDocument)?.api.reset()
        webView.reload()
    }

    override func windowTitle(forDocumentDisplayName displayName: String) -> String {
        "\(displayName) — Classic Editor"
    }
}
