import AppKit
import WebKit

/// What every Profolio web view needs: the package served at siteproj://,
/// the web console mirrored to the log, dialogs (WKWebView shows none on its
/// own on macOS), file uploads, and links that leave the package opening in
/// the browser.
final class WebViewSupport: NSObject, WKNavigationDelegate, WKUIDelegate {
    /// Names the view in logs and in SITEEDITOR_EVAL_<ROLE> (debug).
    let role: String
    /// Main-frame loads that finished, with their URL.
    var onFinish: ((URL?) -> Void)?

    init(role: String) {
        self.role = role
    }

    static func makeWebView(document: SiteDocument, role: String, stillImages: Bool = false,
                            configure: (WKWebViewConfiguration) -> Void = { _ in }) -> (WKWebView, WebViewSupport) {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(PackageSchemeHandler(document: document, stillImages: stillImages), forURLScheme: PackageSchemeHandler.scheme)
        config.preferences.isElementFullscreenEnabled = true
        WebConsole.install(in: config.userContentController)
        configure(config)

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isInspectable = true  // Safari ▸ Develop ▸ <this Mac> for debugging
        let support = WebViewSupport(role: role)
        webView.navigationDelegate = support
        webView.uiDelegate = support
        return (webView, support)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        onFinish?(webView.url)
        #if DEBUG
        runDebugEval(in: webView)
        #endif
    }

    #if DEBUG
    // SITEEDITOR_EVAL_<ROLE>="<async JS body>" runs once after this view's
    // first load and logs the result — for checking the app from a shell.
    private var evalDone = false
    private func runDebugEval(in webView: WKWebView) {
        let env = ProcessInfo.processInfo.environment
        guard !evalDone, let script = env["SITEEDITOR_EVAL_\(role.uppercased())"] ?? (role == "classic" ? env["SITEEDITOR_EVAL"] : nil) else { return }
        evalDone = true
        webView.callAsyncJavaScript(script, arguments: [:], in: nil, in: .page) { [role] result in
            switch result {
            case .success(let value): NSLog("[eval %@] %@", role, String(describing: value))
            case .failure(let error): NSLog("[eval %@ error] %@", role, String(describing: error))
            }
        }
    }
    #endif

    // MARK: - Navigation

    // Links leaving the package (the live site, Instagram, …) open in the
    // default browser instead of replacing the page.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url, url.scheme != PackageSchemeHandler.scheme,
              url.scheme != "about", url.scheme != "blob", url.scheme != "data" else {
            return decisionHandler(.allow)
        }
        // Embedded frames (YouTube in the preview) load in place.
        if action.targetFrame?.isMainFrame == false && action.navigationType == .other {
            return decisionHandler(.allow)
        }
        NSWorkspace.shared.open(url)
        decisionHandler(.cancel)
    }

    // target=_blank / window.open: external pages go to the browser; the
    // package's own pages load in this view.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url {
            if url.scheme == PackageSchemeHandler.scheme { webView.load(action.request) }
            else { NSWorkspace.shared.open(url) }
        }
        return nil
    }

    // MARK: - Dialogs

    private func present(_ alert: NSAlert, in webView: WKWebView, done: @escaping (NSApplication.ModalResponse) -> Void) {
        if let window = webView.window { alert.beginSheetModal(for: window, completionHandler: done) }
        else { done(alert.runModal()) }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        present(alert, in: webView) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        present(alert, in: webView) { completionHandler($0 == .alertFirstButtonReturn) }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        let alert = NSAlert()
        alert.messageText = prompt
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 320, height: 24))
        field.stringValue = defaultText ?? ""
        alert.accessoryView = field
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        alert.window.initialFirstResponder = field
        present(alert, in: webView) { completionHandler($0 == .alertFirstButtonReturn ? field.stringValue : nil) }
    }

    // <input type="file"> — image/video uploads in the editor.
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.canChooseFiles = true
        if let window = webView.window {
            panel.beginSheetModal(for: window) { completionHandler($0 == .OK ? panel.urls : nil) }
        } else {
            completionHandler(panel.runModal() == .OK ? panel.urls : nil)
        }
    }
}
