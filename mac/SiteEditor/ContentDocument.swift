import AppKit
import Combine

/// One content JSON file (e.g. a project's info.json) being edited natively.
///
/// Edits apply in memory, show in the preview at once (`onLiveChange`), and
/// are written to the package after a short pause — there's no Save step.
/// A snapshot goes to backups/ when editing starts and at most every ten
/// minutes after, rather than on every autosave. Every edit is undoable.
@MainActor
final class ContentDocument: ObservableObject {
    /// Repo-relative path, e.g. public/assets/projects/product/maizy/info.json.
    let path: String
    private let package: URL
    @Published private(set) var root: JSONValue
    @Published private(set) var isDirty = false
    let undoManager = UndoManager()

    /// After every edit, with the new content.
    var onLiveChange: ((JSONValue) -> Void)?
    /// After an autosave reached the package.
    var onSaved: (() -> Void)?

    private var trailingNewline = false
    private var saveTask: Task<Void, Never>?
    private var lastSnapshot: Date?
    private var lastWritten: Data?
    private var lastEditKey: String?
    private var lastEditTime = Date.distantPast

    static let autosaveDelay: UInt64 = 700_000_000
    static let snapshotInterval: TimeInterval = 600

    init?(package: URL, path: String) {
        self.package = package
        self.path = path
        guard let data = try? Data(contentsOf: package.appendingPathComponent("site").appendingPathComponent(path)),
              let value = JSONValue.parse(data) else { return nil }
        root = value
        trailingNewline = data.last == 0x0A
        lastWritten = data
    }

    private var fileURL: URL { package.appendingPathComponent("site").appendingPathComponent(path) }

    // MARK: - Editing

    /// Applies a change. Edits to the same field within a second undo as one
    /// (typing a word is one step, not one per letter).
    func edit(_ name: String, key: String? = nil, _ change: (inout JSONValue) -> Void) {
        var next = root
        change(&next)
        guard next != root else { return }
        let coalesce = key != nil && key == lastEditKey && Date().timeIntervalSince(lastEditTime) < 1
        if !coalesce {
            let before = root
            undoManager.registerUndo(withTarget: self) { doc in
                MainActor.assumeIsolated { doc.restore(before, name: name) }
            }
            undoManager.setActionName(name)
        }
        lastEditKey = key
        lastEditTime = Date()
        apply(next)
    }

    func set(_ path: [Any], _ value: JSONValue?, name: String = "Edit") {
        edit(name, key: path.map { "\($0)" }.joined(separator: ".")) { $0.set(path: path, value) }
    }

    private func restore(_ value: JSONValue, name: String) {
        let current = root
        undoManager.registerUndo(withTarget: self) { doc in
            MainActor.assumeIsolated { doc.restore(current, name: name) }
        }
        undoManager.setActionName(name)
        lastEditKey = nil
        apply(value)
    }

    private func apply(_ value: JSONValue) {
        root = value
        isDirty = true
        onLiveChange?(value)
        scheduleSave()
    }

    // MARK: - Saving

    private func scheduleSave() {
        saveTask?.cancel()
        saveTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: Self.autosaveDelay)
            guard !Task.isCancelled else { return }
            self?.saveNow()
        }
    }

    /// Writes pending edits now (before switching pages, closing, publishing).
    func saveNow() {
        saveTask?.cancel()
        guard isDirty else { return }
        var text = root.formatted
        if trailingNewline { text += "\n" }
        let data = Data(text.utf8)
        if lastSnapshot == nil || Date().timeIntervalSince(lastSnapshot!) > Self.snapshotInterval {
            BackupStore(package: package).snapshot(path)
            lastSnapshot = Date()
        }
        do {
            try data.write(to: fileURL, options: .atomic)
            lastWritten = data
            isDirty = false
            onSaved?()
        } catch {
            NSLog("[content] couldn't save %@: %@", path, error.localizedDescription)
        }
    }

    /// The file changed on disk (the web form, a restore, iCloud). Reload it
    /// unless that's our own write or there are unsaved edits here.
    func reloadIfChangedElsewhere() {
        guard !isDirty, let data = try? Data(contentsOf: fileURL), data != lastWritten,
              let value = JSONValue.parse(data) else { return }
        lastWritten = data
        trailingNewline = data.last == 0x0A
        root = value
        undoManager.removeAllActions()
        onLiveChange?(value)
    }
}
