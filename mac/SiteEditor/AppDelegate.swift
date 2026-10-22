import AppKit
import Sparkle

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    /// Sparkle: checks https://nnwoo.com/profolio/appcast.xml (Info.plist
    /// SUFeedURL) once a day and offers new versions, verified against the
    /// EdDSA public key in Info.plist (SUPublicEDKey). Releases are made with
    /// scripts/release-profolio.sh.
    let updater = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: nil, userDriverDelegate: nil)

    @objc func checkForUpdates(_ sender: Any?) {
        updater.checkForUpdates(sender)
    }

    /// Launched (or reopened) with no project to open — AppKit asks this
    /// only then, after any documents passed at launch: offer the Open
    /// panel instead of a blank document (there is none to start from).
    func applicationShouldOpenUntitledFile(_ sender: NSApplication) -> Bool { true }

    func applicationOpenUntitledFile(_ sender: NSApplication) -> Bool {
        NSDocumentController.shared.openDocument(nil)
        return true
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Writing to a pipe whose reader has gone (a Lab agent that just
        // exited) must fail, not kill the app.
        signal(SIGPIPE, SIG_IGN)
        // Checks the saved GitHub sign-in now, so a revoked one asks to sign
        // in again at launch rather than failing at Publish.
        _ = GitHubAccount.shared
    }

    /// Standard About panel: the version (with the RELEASE_STAGE build
    /// setting after it, when there is one), what the app is, and who made it.
    @objc func showAbout(_ sender: Any?) {
        let info = Bundle.main.infoDictionary ?? [:]
        let version = info["CFBundleShortVersionString"] as? String ?? ""
        let stage = info["PFReleaseStage"] as? String ?? ""
        let center = NSMutableParagraphStyle()
        center.alignment = .center
        let small: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 11), .foregroundColor: NSColor.secondaryLabelColor, .paragraphStyle: center]
        let credits = NSMutableAttributedString(string: "A Mac editor for portfolio websites —\nedit, preview and publish in one window.\n\n", attributes: small)
        credits.append(NSAttributedString(string: "Designed and built by Nyeongwoo Kwon\n", attributes: small))
        var link = small
        link[.link] = URL(string: "https://nnwoo.com")!
        credits.append(NSAttributedString(string: "nnwoo.com", attributes: link))
        NSApp.orderFrontStandardAboutPanel(options: [
            .applicationVersion: stage.isEmpty ? version : "\(version) \(stage)",
            .credits: credits,
        ])
    }

    @objc func newSite(_ sender: Any?) {
        NewSiteWindow.show()
    }

    @objc func showGitHubAccount(_ sender: Any?) {
        GitHubAccount.shared.showWindow()
    }

    @objc func sendFeedback(_ sender: Any?) {
        FeedbackWindow.show()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        // No windows: AppKit then asks applicationOpenUntitledFile.
        true
    }
}
