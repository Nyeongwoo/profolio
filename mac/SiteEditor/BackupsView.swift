import SwiftUI

/// File ▸ Backups…: every content document's snapshots, what restoring one
/// would change, and restoring it.
struct BackupsView: View {
    let store: BackupStore
    let inICloud: Bool
    /// After a restore (the editor reloads to show it).
    let onRestored: () -> Void

    @State private var documents: [BackupStore.Document] = []
    @State private var document: BackupStore.Document?
    @State private var snapshot: BackupStore.Snapshot?
    @State private var confirming = false
    @State private var message: String?

    var body: some View {
        NavigationSplitView {
            List(documents, selection: $document) { doc in
                VStack(alignment: .leading, spacing: 2) {
                    Text(Self.title(of: doc.path))
                    Text(doc.latest.formatted(.relative(presentation: .named)))
                        .font(.caption).foregroundStyle(.secondary)
                }
                .tag(doc)
            }
            .navigationSplitViewColumnWidth(min: 200, ideal: 240)
            .overlay { if documents.isEmpty { Text("No backups yet").foregroundStyle(.secondary) } }
        } content: {
            if let document {
                List(store.snapshots(in: document.folder), selection: $snapshot) { snap in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(snap.date.formatted(date: .abbreviated, time: .standard))
                        Text(ByteCountFormatter.string(fromByteCount: Int64(snap.size), countStyle: .file))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    .tag(snap)
                }
                .navigationSplitViewColumnWidth(min: 180, ideal: 210)
            } else {
                Text("Select a document").foregroundStyle(.secondary)
            }
        } detail: {
            detail
        }
        .safeAreaInset(edge: .bottom) { footer }
        .frame(minWidth: 860, minHeight: 480)
        .onAppear(perform: reload)
        .onChange(of: document) { snapshot = nil; message = nil }
        .onChange(of: snapshot) { message = nil }
    }

    @ViewBuilder private var detail: some View {
        if let document, let snapshot {
            let changes = JSONDiff.changes(now: store.currentData(of: document), snapshot: try? Data(contentsOf: snapshot.url))
            VStack(alignment: .leading, spacing: 12) {
                Text(Self.title(of: document.path)).font(.headline)
                Text(document.path).font(.caption).foregroundStyle(.secondary).textSelection(.enabled)
                Text(changes.isEmpty
                     ? "Same as the current version."
                     : "Restoring this snapshot changes \(changes.count) value\(changes.count == 1 ? "" : "s"):")
                    .font(.callout)
                List(changes.prefix(300)) { change in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(change.path).font(.caption.monospaced()).foregroundStyle(.secondary)
                        HStack(alignment: .top, spacing: 6) {
                            Text(change.now ?? "—").strikethrough(change.now != nil).foregroundStyle(.red)
                            Image(systemName: "arrow.right").foregroundStyle(.secondary)
                            Text(change.snapshot ?? "(removed)").foregroundStyle(.green)
                        }
                        .font(.callout).lineLimit(4).textSelection(.enabled)
                    }
                    .padding(.vertical, 2)
                }
                HStack {
                    if let message { Text(message).font(.callout).foregroundStyle(.secondary) }
                    Spacer()
                    Button("Restore This Version…") { confirming = true }
                        .disabled(changes.isEmpty)
                        .keyboardShortcut(.defaultAction)
                }
            }
            .padding()
            .confirmationDialog("Restore this version of \(Self.title(of: document.path))?", isPresented: $confirming) {
                Button("Restore") { restore(snapshot, of: document) }
            } message: {
                Text("The current version is kept as a backup. The editor reloads, so unsaved edits there are lost.")
            }
        } else {
            Text(document == nil ? "" : "Select a backup").foregroundStyle(.secondary)
        }
    }

    private var footer: some View {
        HStack(spacing: 6) {
            Image(systemName: inICloud ? "icloud" : "externaldrive")
            Text(inICloud
                 ? "Backups are kept inside the project and sync with it through iCloud Drive."
                 : "This project isn't in iCloud Drive, so its backups stay on this Mac.")
            Spacer()
            Text("Up to \(BackupStore.keep) per document")
        }
        .font(.caption).foregroundStyle(.secondary)
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(.bar)
    }

    private func reload() {
        documents = store.documents()
    }

    private func restore(_ snapshot: BackupStore.Snapshot, of document: BackupStore.Document) {
        do {
            try store.restore(snapshot, of: document)
            message = "Restored ✓"
            reload()
            self.document = documents.first { $0.path == document.path }
            self.snapshot = nil
            onRestored()
        } catch {
            message = "Couldn't restore: \(error.localizedDescription)"
        }
    }

    /// A readable name for a content document.
    static func title(of path: String) -> String {
        let named = [
            "src/data/home.json": "Home page", "src/data/about.json": "About page",
            "src/data/siteConfig.json": "Site settings", "src/data/blog.json": "Blog post list",
            "src/data/archive.json": "Archive page", "src/data/projects.json": "Project list",
            "src/data/originals.json": "Originals list", "src/i18n/ko.json": "Korean translations",
            "src/i18n/zh.json": "Chinese translations", "public/assets/blog/landing-info.json": "Blog landing",
        ]
        if let name = named[path] { return name }
        let parts = path.split(separator: "/").map(String.init)
        if parts.count == 6, parts[0] == "public", parts[5] == "info.json" {
            return "\(parts[2] == "originals" ? "Original" : "Project"): \(parts[3]) / \(parts[4])"
        }
        if parts.count == 5, parts[4] == "category-info.json" { return "Category page: \(parts[2]) / \(parts[3])" }
        if parts.count == 5, parts[2] == "blog", parts[4] == "info.json" { return "Blog post: \(parts[3])" }
        return path
    }
}
