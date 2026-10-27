import SwiftUI

/// Publish (⇧⌘P): each change with what it changes — text before → after,
/// images side by side — to include or hold back; then the publish itself,
/// step by step.
struct PublishSheet: View {
    @ObservedObject var model: EditorModel
    @ObservedObject private var account = GitHubAccount.shared
    @Environment(\.dismiss) private var dismiss

    @State private var selected: Set<String> = []
    @State private var details: [String: Detail] = [:]
    @State private var note = ""
    @State private var running = false
    @State private var finished: Bool?
    @State private var step: String?
    @State private var progress = 0
    @State private var log: [String] = []
    /// Left undecided by the last attempt, and the choices made so far.
    @State private var conflicts: [JSONMerge.Conflict] = []
    @State private var choices: [String: JSONMerge.Side] = [:]

    enum Detail {
        case text([JSONDiff.Change])
        case image(old: NSImage?)
        case other
    }

    private static let steps = [("git-add", "Check"), ("git-commit", "Upload"), ("git-push", "Commit"), ("vercel", "Vercel build")]

    private var paths: [(path: String, deleted: Bool)] {
        (model.changes?.upload.map { ($0, false) } ?? []) + (model.changes?.delete.map { ($0, true) } ?? [])
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                Image(systemName: "arrow.up.circle.fill").font(.system(size: 30)).foregroundStyle(Color.accentColor)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Publish to the site").font(.headline)
                    Text(summary).font(.callout).foregroundStyle(.secondary)
                }
                Spacer()
                if let login = account.login { Text("as \(login)").font(.caption).foregroundStyle(.secondary) }
            }

            if !conflicts.isEmpty && !running {
                conflictList
            } else if running || finished != nil {
                progressView
            } else {
                changeList
                TextField("Note (optional) — e.g. Updated the About page", text: $note)
                    .textFieldStyle(.roundedBorder)
            }

            HStack {
                if finished == nil && !running {
                    Text("Changes made on GitHub meanwhile are brought in first.").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                if !conflicts.isEmpty && !running {
                    Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction)
                    Button("Publish") { publish() }
                        .keyboardShortcut(.defaultAction)
                        .disabled(!conflicts.allSatisfy { choices[$0.id] != nil })
                } else if finished != nil {
                    Button("Done") { dismiss() }.keyboardShortcut(.defaultAction)
                } else {
                    Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction).disabled(running)
                    Button(selected.count == paths.count ? "Publish" : "Publish \(selected.count) of \(paths.count)") { publish() }
                        .keyboardShortcut(.defaultAction)
                        .disabled(running || model.document.isPublishing || (selected.isEmpty && !paths.isEmpty))
                }
            }
        }
        .padding(20)
        .frame(width: 640)
        .onAppear {
            model.flushEdits()
            selected = Set(paths.map(\.path))
        }
        .onChange(of: model.changes?.upload) { selected = Set(paths.map(\.path)) }
        .task(id: model.changes?.upload) { await loadDetails() }
    }

    private var summary: String {
        guard model.changes != nil else { return "Checking for changes…" }
        return paths.isEmpty ? "Nothing new since the last publish." : "\(paths.count) changed file\(paths.count == 1 ? "" : "s")"
    }

    // MARK: - Changes

    private var changeList: some View {
        let grouped = Dictionary(grouping: paths) { model.index.node(forPackagePath: $0.path)?.title ?? groupTitle($0.path) }
        return ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                ForEach(grouped.keys.sorted(), id: \.self) { title in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(title.uppercased()).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                        ForEach(grouped[title]!, id: \.path) { item in changeRow(item.path, deleted: item.deleted) }
                    }
                }
                if paths.isEmpty { Text("Everything is published.").foregroundStyle(.secondary) }
                if account.token == nil && !paths.isEmpty {
                    HStack {
                        Text("Sign in to GitHub to see what each change does.").font(.caption).foregroundStyle(.secondary)
                        Button("Sign In…") { account.showWindow() }.controlSize(.small)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
        }
        .frame(height: 340)
        .background(Corner.shape(Corner.group).fill(Color(nsColor: .textBackgroundColor)))
        .overlay(Corner.shape(Corner.group).strokeBorder(.separator))
    }

    private func changeRow(_ path: String, deleted: Bool) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Toggle("", isOn: Binding(get: { selected.contains(path) },
                                     set: { if $0 { selected.insert(path) } else { selected.remove(path) } }))
                .toggleStyle(.checkbox).labelsHidden()
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 6) {
                    tag(deleted ? "Deleted" : isImage(path) ? "Image" : "Text",
                        deleted ? .red : isImage(path) ? .green : .orange)
                    Text(label(path)).font(.callout)
                }
                if !deleted { detail(path) }
            }
        }
    }

    @ViewBuilder private func detail(_ path: String) -> some View {
        switch details[path] {
        case .text(let changes):
            VStack(alignment: .leading, spacing: 4) {
                ForEach(changes.prefix(4)) { c in
                    VStack(alignment: .leading, spacing: 1) {
                        Text(Self.describe(c.path)).font(.caption).foregroundStyle(.tertiary)
                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            if let old = c.now { Text(Self.clip(old)).strikethrough().foregroundStyle(.red) }
                            if c.now != nil && c.snapshot != nil { Image(systemName: "arrow.right").font(.caption2).foregroundStyle(.tertiary) }
                            Text(c.snapshot.map(Self.clip) ?? "(removed)").foregroundStyle(.green)
                        }
                        .font(.caption)
                        .lineLimit(2)
                    }
                }
                if changes.count > 4 { Text("and \(changes.count - 4) more").font(.caption).foregroundStyle(.tertiary) }
                if changes.isEmpty { Text("Formatting only").font(.caption).foregroundStyle(.tertiary) }
            }
        case .image(let old):
            HStack(spacing: 8) {
                if let old {
                    Image(nsImage: old).resizable().scaledToFill().frame(width: 80, height: 50).clipShape(Corner.shape(Corner.control))
                    Image(systemName: "arrow.right").font(.caption).foregroundStyle(.tertiary)
                } else {
                    Text("New").font(.caption).foregroundStyle(.secondary)
                }
                Thumbnail(url: model.document.packageURL?.appendingPathComponent("site").appendingPathComponent(path), size: 50)
            }
        case .other, nil:
            EmptyView()
        }
    }

    private func tag(_ text: String, _ color: Color) -> some View {
        Text(text).font(.system(size: 10, weight: .semibold)).foregroundStyle(color)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(Corner.shape(Corner.tag).fill(color.opacity(0.14)))
    }

    private func isImage(_ path: String) -> Bool {
        ImageFolder.extensions.contains((path as NSString).pathExtension.lowercased())
    }

    private func label(_ path: String) -> String {
        let name = (path as NSString).lastPathComponent
        let folder = ((path as NSString).deletingLastPathComponent as NSString).lastPathComponent
        if name == "info.json" || name == "category-info.json" { return "Page content" }
        if path.hasPrefix("src/i18n/") { return name == "ko.json" ? "Korean translations" : "Chinese translations" }
        if path.hasPrefix("src/data/") { return BackupsView.title(of: path) }
        return "\(folder)/\(name)"
    }

    private func groupTitle(_ path: String) -> String {
        if path.hasPrefix("src/i18n/") { return "Translations" }
        if path.hasPrefix("src/data/") { return "Site" }
        return "Other files"
    }

    /// "sections[2].blocks[0].lines[1].text" → "Section 3 › Card 1 › Line 2 › text"
    static func describe(_ path: String) -> String {
        var out: [String] = []
        for part in path.split(separator: ".") {
            var p = String(part)
            var index: Int?
            if let open = p.firstIndex(of: "["), let close = p.firstIndex(of: "]") {
                index = Int(p[p.index(after: open)..<close])
                p = String(p[..<open])
            }
            let names = ["sections": "Section", "blocks": "Card", "lines": "Line", "images": "Image", "featured": "Featured",
                         "metaFields": "Detail", "footerColumns": "Column", "items": "Item"]
            let word = names[p] ?? p.replacingOccurrences(of: "([a-z])([A-Z])", with: "$1 $2", options: .regularExpression).lowercased()
            out.append(index.map { "\(word) \($0 + 1)" } ?? word)
        }
        return out.joined(separator: " › ")
    }

    static func clip(_ s: String) -> String {
        let plain = InlineHTML.plain(s).replacingOccurrences(of: "\n", with: " ")
        return plain.count > 90 ? String(plain.prefix(90)) + "…" : plain
    }

    /// Fetches the published version of each changed file to compare.
    private func loadDetails() async {
        guard let package = model.document.packageURL else { return }
        for item in paths where !item.deleted && details[item.path] == nil {
            let local = try? Data(contentsOf: package.appendingPathComponent("site").appendingPathComponent(item.path))
            let old = await model.publishedVersion(of: item.path)
            if isImage(item.path) {
                details[item.path] = .image(old: old.flatMap(NSImage.init(data:)))
            } else if item.path.hasSuffix(".json") {
                details[item.path] = old == nil && account.token != nil ? .text(JSONDiff.changes(now: nil, snapshot: local))
                    : old == nil ? .other : .text(JSONDiff.changes(now: old, snapshot: local))
            } else {
                details[item.path] = .other
            }
        }
    }

    // MARK: - Conflicts

    private var conflictList: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("These were changed both here and on GitHub (for example in the web editor). Choose which to keep; everything else was combined.")
                    .font(.callout).fixedSize(horizontal: false, vertical: true)
                Spacer()
                Menu("Choose All") {
                    Button("Keep All of Mine") { conflicts.forEach { choices[$0.id] = .mine } }
                    Button("Use All of GitHub’s") { conflicts.forEach { choices[$0.id] = .theirs } }
                }
                .fixedSize()
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    ForEach(conflicts) { c in conflictRow(c) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
            }
            .frame(height: 300)
            .background(Corner.shape(Corner.group).fill(Color(nsColor: .textBackgroundColor)))
            .overlay(Corner.shape(Corner.group).strokeBorder(.separator))
        }
    }

    private func conflictRow(_ c: JSONMerge.Conflict) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(label(c.path)).font(.callout.weight(.medium))
                if c.key != JSONMerge.wholeFile {
                    Text(Self.describe(c.key)).font(.callout).foregroundStyle(.secondary)
                }
            }
            HStack(spacing: 8) {
                choice(c, .mine, "This Mac", c.mine)
                choice(c, .theirs, "GitHub", c.theirs)
            }
        }
    }

    private func choice(_ c: JSONMerge.Conflict, _ side: JSONMerge.Side, _ title: String, _ value: String?) -> some View {
        let on = choices[c.id] == side
        return Button { choices[c.id] = side } label: {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 5) {
                    Image(systemName: on ? "largecircle.fill.circle" : "circle")
                        .foregroundStyle(on ? Color.accentColor : .secondary)
                    Text(title).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                }
                Text(value.map(Self.clip) ?? "(removed)")
                    .font(.callout)
                    .foregroundStyle(value == nil ? .secondary : .primary)
                    .lineLimit(3)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(8)
            .background(Corner.shape(Corner.control).fill(on ? Color.accentColor.opacity(0.12) : Color.secondary.opacity(0.06)))
            .overlay(Corner.shape(Corner.control).strokeBorder(on ? Color.accentColor : .clear, lineWidth: 1.5))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Publishing

    private var progressView: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                ForEach(Array(Self.steps.enumerated()), id: \.offset) { i, s in
                    let current = Self.steps.firstIndex { $0.0 == step } ?? -1
                    let done = finished == true || i < current
                    HStack(spacing: 5) {
                        Image(systemName: done ? "checkmark.circle.fill" : (i == current ? "circle.dotted" : "circle"))
                            .foregroundStyle(done ? Color.green : (i == current ? Color.accentColor : Color.secondary))
                        Text(s.1).font(.callout).foregroundStyle(i <= current || done ? .primary : .secondary)
                    }
                    if i < Self.steps.count - 1 { Rectangle().fill(.separator).frame(height: 1) }
                }
            }
            ProgressView(value: Double(progress), total: 100)
                .tint(finished == false ? .red : nil)
            ScrollView {
                Text(log.joined(separator: "\n"))
                    .font(.system(.caption, design: .monospaced))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
            }
            .frame(height: 160)
            .padding(8)
            .background(Corner.shape(Corner.group).fill(Color(nsColor: .textBackgroundColor)))
        }
    }

    private func publish() {
        model.flushEdits()
        running = true
        finished = nil
        log = []
        conflicts = []
        let only = selected.count == paths.count ? nil : selected
        model.document.publish(only: only, note: note, resolutions: choices) { event in
            DispatchQueue.main.async {
                if let s = event.step { step = s }
                if let p = event.progress { progress = p }
                if let l = event.log { log.append(l) }
                if event.packageChanged { model.packageChangedByPublish() }
                if event.done {
                    running = false
                    conflicts = event.conflicts
                    finished = event.conflicts.isEmpty ? event.ok : nil
                    model.refreshChanges()
                }
            }
        }
    }
}
