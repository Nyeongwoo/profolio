import Foundation
import WebKit

/// Mirrors the web editor's console warnings/errors and uncaught exceptions
/// into the app's log (Xcode console / Console.app), so a broken page can be
/// diagnosed without opening Safari's Web Inspector.
final class WebConsole: NSObject, WKScriptMessageHandler {
    private static let name = "webConsole"

    static func install(in controller: WKUserContentController) {
        addScript(to: controller)
        controller.add(WebConsole(), name: name)
    }

    /// The page-side half only (after removeAllUserScripts()).
    static func addScript(to controller: WKUserContentController) {
        let script = """
        (() => {
          const post = (level, args) => {
            try {
              const text = args.map(a => a instanceof Error ? (a.stack || a.message)
                : typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
              window.webkit.messageHandlers.\(name).postMessage({ level, text, url: location.pathname })
            } catch {}
          }
          for (const level of ['warn', 'error']) {
            const orig = console[level]
            console[level] = (...args) => { post(level, args); orig.apply(console, args) }
          }
          window.addEventListener('error', e => post('uncaught', [e.error || e.message]))
          window.addEventListener('unhandledrejection', e => post('unhandled rejection', [e.reason]))
        })()
        """
        controller.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: false))
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        NSLog("[web %@] %@ — %@", body["level"] as? String ?? "?", body["url"] as? String ?? "", body["text"] as? String ?? "")
    }
}
