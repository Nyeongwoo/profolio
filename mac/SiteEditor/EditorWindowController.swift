import AppKit
import SwiftUI

/// A document window: the native editor (EditorRootView), plus the menu
/// commands that act on it.
final class EditorWindowController: NSWindowController, NSWindowDelegate {
    private var model: EditorModel!
    private var backupsWindow: NSWindow?

    convenience init(document: SiteDocument) {
        let model = MainActor.assumeIsolated { EditorModel(document: document) }
        let hosting = NSHostingController(rootView: EditorRootView(model: model))
        // The view's title and toolbar become the window's.
        hosting.sceneBridgingOptions = [.title, .toolbars]

        let window = NSWindow(contentViewController: hosting)
        // Content starts below the title bar: with it running underneath, the
        // sidebar's rows scrolled up under the window buttons.
        window.styleMask = [.titled, .closable, .miniaturizable, .resizable]
        window.toolbarStyle = .unified
        window.setContentSize(NSSize(width: 1440, height: 900))
        window.minSize = NSSize(width: 1000, height: 600)
        window.center()
        window.setFrameAutosaveName("EditorWindow")

        self.init(window: window)
        self.model = model
        window.delegate = self
    }

    // Edit ▸ Undo / Redo act on the page being edited natively.
    func windowWillReturnUndoManager(_ window: NSWindow) -> UndoManager? {
        MainActor.assumeIsolated { model.content?.undoManager }
    }

    func windowWillClose(_ notification: Notification) {
        MainActor.assumeIsolated {
            model.flushEdits()
            model.lab.shutDown()
        }
    }

    // MARK: - Menu commands

    @MainActor @objc func showGoTo(_ sender: Any?) { model.showGoTo = true }
    @MainActor @objc func newItem(_ sender: Any?) { model.requestNewItem() }
    @MainActor @objc func deleteSite(_ sender: Any?) {
        model.flushEdits()
        (document as? SiteDocument)?.deleteSite()
    }
    @MainActor @objc func saveEdits(_ sender: Any?) { model.save() }
    @MainActor @objc func showPublish(_ sender: Any?) { model.showPublish = true }
    @MainActor @objc func openLiveSite(_ sender: Any?) { Task { await model.openLiveSite() } }
    @MainActor @objc func changeLiveSiteAddress(_ sender: Any?) { _ = model.askLiveSiteAddress() }
    @MainActor @objc func previewDesktop(_ sender: Any?) { model.device = .desktop }
    @MainActor @objc func previewTablet(_ sender: Any?) { model.device = .tablet }
    @MainActor @objc func previewMobile(_ sender: Any?) { model.device = .mobile }

    /// Also reloads the editor API, so a rebuilt editor is picked up.
    @MainActor @objc func reloadEditor(_ sender: Any?) {
        (document as? SiteDocument)?.api.reset()
        model.preview.webView.reload()
        model.inspector.reload()
    }

    @objc func openClassicEditor(_ sender: Any?) {
        guard let document = document as? SiteDocument else { return }
        if let existing = document.windowControllers.first(where: { $0 is ClassicEditorWindowController }) {
            existing.showWindow(nil)
            return
        }
        let classic = ClassicEditorWindowController(document: document)
        document.addWindowController(classic)
        classic.showWindow(nil)
    }

    @MainActor @objc func showBackups(_ sender: Any?) {
        guard let document = document as? SiteDocument, let package = document.packageURL else { return }
        let inICloud = FileManager.default.isUbiquitousItem(at: package)
        let view = BackupsView(store: BackupStore(package: package), inICloud: inICloud) { [weak self] in
            self?.model.inspector.reload()
            self?.model.preview.reloadKeepingScroll()
            self?.model.refreshChanges()
        }
        // Rebuilt on every open so the lists are current.
        let window = backupsWindow ?? NSWindow(contentRect: .zero, styleMask: [.titled, .closable, .resizable, .miniaturizable],
                                               backing: .buffered, defer: false)
        window.contentViewController = NSHostingController(rootView: view)
        window.title = "Backups — \(document.displayName ?? "")"
        window.isReleasedWhenClosed = false
        if backupsWindow == nil {
            window.setContentSize(NSSize(width: 980, height: 600))
            window.center()
            backupsWindow = window
        }
        window.makeKeyAndOrderFront(nil)
    }

    override func close() {
        backupsWindow?.close()
        super.close()
    }
}
