import AppKit

/// manifest.json of a .siteproj package (docs/siteproj-format.md).
struct SiteManifest: Decodable {
    struct Repository: Decodable {
        let owner: String
        let name: String
        let branch: String
    }
    struct Paths: Decodable {
        let include: [String]
        let exclude: [String]
    }
    static let format = "com.nnwoo.siteproj"
    static let supportedVersion = 1

    let format: String
    let formatVersion: Int
    let repository: Repository
    let paths: Paths
}

/// One open .portfolio package.
///
/// The package is never loaded into memory as a whole (it holds hundreds of
/// MB of assets): reading only validates the manifest, and the editor reads
/// and writes individual files inside the package as it goes. So NSDocument's
/// own save machinery is unused — the document never becomes "edited".
final class SiteDocument: NSDocument {
    private(set) var manifest: SiteManifest?

    /// The package location, readable from any thread (the editor API and
    /// file serving run off the main thread). Follows renames and moves.
    var packageURL: URL? {
        urlLock.lock(); defer { urlLock.unlock() }
        return _packageURL
    }
    private var _packageURL: URL?
    private let urlLock = NSLock()

    override var fileURL: URL? {
        didSet {
            urlLock.lock(); _packageURL = fileURL; urlLock.unlock()
        }
    }

    private(set) lazy var api = EditorAPI(packageURL: { [weak self] in self?.packageURL })

    override class var autosavesInPlace: Bool { true }

    override func read(from url: URL, ofType typeName: String) throws {
        let data = try Data(contentsOf: url.appendingPathComponent("manifest.json"))
        let manifest = try JSONDecoder().decode(SiteManifest.self, from: data)
        guard manifest.format == SiteManifest.format else {
            throw CocoaError(.fileReadCorruptFile, userInfo: [NSURLErrorKey: url])
        }
        guard manifest.formatVersion <= SiteManifest.supportedVersion else {
            throw NSError(domain: NSCocoaErrorDomain, code: CocoaError.fileReadUnknown.rawValue, userInfo: [
                NSLocalizedDescriptionKey: "This project was made with a newer version of Profolio.",
                NSLocalizedRecoverySuggestionErrorKey: "Update the app to open it.",
            ])
        }
        self.manifest = manifest
    }

    override func data(ofType typeName: String) throws -> Data {
        throw CocoaError(.featureUnsupported)
    }

    // Edits are written as they happen (ContentDocument, the editor API),
    // so NSDocument's own saving never runs: something marking the
    // document edited (an undo registered on it) made it autosave, which
    // ends in data(ofType:) and a "feature is not supported" alert.
    override var isDocumentEdited: Bool { false }
    override var hasUnautosavedChanges: Bool { false }
    override func updateChangeCount(_ change: NSDocument.ChangeType) {}
    override func autosave(withImplicitCancellability implicitlyCancellable: Bool, completionHandler: @escaping ((any Error)?) -> Void) {
        completionHandler(nil)
    }
    override func save(to url: URL, ofType typeName: String, for saveOperation: NSDocument.SaveOperationType,
                       completionHandler: @escaping ((any Error)?) -> Void) {
        completionHandler(nil)
    }

    // MARK: - Publishing

    private(set) var isPublishing = false

    /// Publishes to GitHub, reporting progress through `emit` (any thread).
    /// Not signed in → reports it and opens the account window.
    @MainActor
    func publish(only: Set<String>? = nil, note: String? = nil, resolutions: [String: JSONMerge.Side] = [:],
                 emit: @escaping (Publisher.Event) -> Void) {
        guard let manifest, let package = packageURL else { return }
        guard GitHubAccount.shared.loaded || GitHubAccount.shared.token != nil else {
            emit(.init(log: "Still reading the GitHub sign-in from the keychain — answer macOS's question if it asks, then publish again.", done: true, ok: false))
            return
        }
        guard let token = GitHubAccount.shared.token else {
            emit(.init(log: "Sign in to GitHub first (Profolio ▸ GitHub Account…).", done: true, ok: false))
            GitHubAccount.shared.showWindow()
            return
        }
        guard !isPublishing else {
            emit(.init(log: "Already publishing.", done: true, ok: false))
            return
        }
        isPublishing = true
        let publisher = Publisher(package: package, manifest: manifest, token: token, only: only, note: note,
                                  resolutions: resolutions, emit: emit)
        Task {
            _ = await publisher.run()
            self.isPublishing = false
        }
    }

    /// Answer for the editor's /api/git-info: the last synced commit's date
    /// and the last publish.
    func gitInfo() -> [String: Any] {
        guard let package = packageURL else { return [:] }
        let base = try? BaseIndex.load(from: package)
        let manifest = (try? JSONSerialization.jsonObject(with: Data(contentsOf: package.appendingPathComponent("manifest.json")))) as? [String: Any]
        return ["lastCommit": base?.committedAt ?? NSNull(), "lastDeploy": manifest?["lastPublished"] ?? NSNull()]
    }

    // MARK: - Deleting the site

    /// File ▸ Delete Site…: after typing the repository's name to confirm,
    /// the project goes to the Trash (recoverable), and the pages where the
    /// GitHub repository and the Vercel project are deleted open in the
    /// browser — those last steps stay the owner's to confirm.
    @MainActor
    func deleteSite() {
        guard let manifest, let package = packageURL else { return }
        let repo = "\(manifest.repository.owner)/\(manifest.repository.name)"
        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = "Delete “\(displayName ?? package.lastPathComponent)”?"
        alert.informativeText = "This project moves to the Trash. Then GitHub opens on the repository’s settings (Delete this repository is at the bottom), and you can delete its Vercel project too.\n\nType \(manifest.repository.name) to confirm."
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 280, height: 24))
        field.placeholderString = manifest.repository.name
        alert.accessoryView = field
        alert.addButton(withTitle: "Delete")
        alert.addButton(withTitle: "Cancel")
        alert.buttons.first?.hasDestructiveAction = true
        alert.window.initialFirstResponder = field
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        guard field.stringValue.trimmingCharacters(in: .whitespaces) == manifest.repository.name else {
            let wrong = NSAlert()
            wrong.messageText = "The name didn’t match, so nothing was deleted."
            wrong.runModal()
            return
        }
        quitsWhenLastClosed = false
        close()
        NSWorkspace.shared.recycle([package]) { _, error in
            DispatchQueue.main.async {
                let done = NSAlert()
                if let error {
                    done.messageText = "Couldn’t move the project to the Trash."
                    done.informativeText = error.localizedDescription
                    done.runModal()
                    return
                }
                done.messageText = "The project is in the Trash."
                done.informativeText = "To finish, delete the GitHub repository \(repo) and, if you connected one, its Vercel project."
                done.addButton(withTitle: "Open GitHub")
                done.addButton(withTitle: "Open Vercel")
                done.addButton(withTitle: "Done")
                switch done.runModal() {
                case .alertFirstButtonReturn: NSWorkspace.shared.open(URL(string: "https://github.com/\(repo)/settings")!)
                case .alertSecondButtonReturn: NSWorkspace.shared.open(URL(string: "https://vercel.com/dashboard")!)
                default: break
                }
            }
        }
    }

    /// Closing the last project quits the app, unless something else is
    /// still open (New Site, the GitHub account) or a publish is running.
    override func close() {
        super.close()
        guard quitsWhenLastClosed, !isPublishing else { return }
        DispatchQueue.main.async {
            let controller = NSDocumentController.shared
            let others = NSApp.windows.contains { $0.isVisible && !($0 is NSPanel) && $0.className != "NSStatusBarWindow" }
            let publishing = controller.documents.contains { ($0 as? SiteDocument)?.isPublishing == true }
            if controller.documents.isEmpty && !others && !publishing { NSApp.terminate(nil) }
        }
    }

    /// Off while Delete Site closes the project and still has more to say.
    private var quitsWhenLastClosed = true

    override func makeWindowControllers() {
        addWindowController(EditorWindowController(document: self))
    }
}
