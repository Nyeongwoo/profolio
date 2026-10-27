import SwiftUI

/// Go to (⌘K): pages, sections, text on the site and commands in one list.
struct GoToPalette: View {
    @ObservedObject var model: EditorModel
    @State private var query = ""
    @State private var highlighted = 0
    @State private var texts: [SiteIndex.TextHit] = []
    @FocusState private var focused: Bool

    struct Item: Identifiable {
        enum Group: String { case pages = "Pages", sections = "Sections", text = "Text on the site", actions = "Actions" }
        let id: String
        let group: Group
        let title: String
        let detail: String
        let symbol: String
        let run: () -> Void
    }

    var body: some View {
        ZStack(alignment: .top) {
            Color.black.opacity(0.18)
                .ignoresSafeArea()
                .onTapGesture { close() }
            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass").foregroundStyle(.secondary).font(.title3)
                    TextField("Go to a page, section or text", text: $query)
                        .textFieldStyle(.plain)
                        .font(.title3)
                        .focused($focused)
                        .onSubmit { activate() }
                    Text("esc").font(.caption).foregroundStyle(.secondary)
                }
                .padding(.horizontal, 16).frame(height: 52)
                Divider()
                ScrollViewReader { proxy in
                    ScrollView {
                        let items = results
                        VStack(alignment: .leading, spacing: 2) {
                            ForEach(Array(items.enumerated()), id: \.element.id) { i, item in
                                if i == 0 || items[i - 1].group != item.group {
                                    Text(item.group.rawValue).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                                        .padding(.horizontal, 12).padding(.top, 8).padding(.bottom, 2)
                                }
                                row(item, on: i == highlighted)
                                    .id(i)
                                    .onTapGesture { highlighted = i; activate() }
                            }
                            if items.isEmpty {
                                Text("No matches").foregroundStyle(.secondary).padding(16)
                            }
                        }
                        .padding(6)
                    }
                    .frame(maxHeight: 420)
                    .onChange(of: highlighted) { proxy.scrollTo(highlighted) }
                }
                Divider()
                HStack(spacing: 14) {
                    Text("↑ ↓ move"); Text("↩ open")
                    Spacer()
                    Text("Searches pages, sections, text and commands")
                }
                .font(.caption).foregroundStyle(.secondary)
                .padding(.horizontal, 16).padding(.vertical, 8)
            }
            .frame(width: 640)
            .background(.regularMaterial, in: Corner.shape(Corner.panel))
            .overlay(Corner.shape(Corner.panel).strokeBorder(.separator))
            .shadow(color: .black.opacity(0.25), radius: 30, y: 12)
            .padding(.top, 70)
        }
        .onAppear {
            focused = true
            Task { texts = await model.searchableTexts() }
        }
        .onChange(of: query) { highlighted = 0 }
        .onKeyPress(.downArrow) { highlighted = min(highlighted + 1, max(results.count - 1, 0)); return .handled }
        .onKeyPress(.upArrow) { highlighted = max(highlighted - 1, 0); return .handled }
        .onKeyPress(.escape) { close(); return .handled }
    }

    private func row(_ item: Item, on: Bool) -> some View {
        HStack(spacing: 10) {
            Image(systemName: item.symbol)
                .frame(width: 26, height: 26)
                .background(Corner.icon(26).fill(on ? Color.white.opacity(0.2) : Color.secondary.opacity(0.12)))
            VStack(alignment: .leading, spacing: 1) {
                Text(item.title).lineLimit(1)
                if !item.detail.isEmpty {
                    Text(item.detail).font(.caption).foregroundStyle(on ? Color.white.opacity(0.8) : .secondary).lineLimit(1)
                }
            }
            Spacer()
            if on { Text("↩").font(.caption) }
        }
        .padding(.horizontal, 10).frame(height: 42)
        .foregroundStyle(on ? Color.white : Color.primary)
        .background(Corner.shape(Corner.control).fill(on ? Color.accentColor : Color.clear))
        .contentShape(Rectangle())
    }

    private func close() { model.showGoTo = false }

    private func activate() {
        let items = results
        guard items.indices.contains(highlighted) else { return }
        close()
        items[highlighted].run()
    }

    // MARK: - Results

    private var results: [Item] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        let words = q.split(separator: " ").map(String.init)
        func matches(_ s: String) -> Bool { words.allSatisfy { s.lowercased().contains($0) } }

        let nodes = model.index.openable
        var pages: [Item] = []
        var sections: [Item] = []
        for node in nodes {
            let place = [node.subtitle, groupTitle(of: node)].compactMap { $0 }.joined(separator: " › ")
            if q.isEmpty || matches("\(node.title) \(place)") {
                pages.append(Item(id: node.id, group: .pages, title: node.title, detail: place, symbol: node.symbol) { model.open(node.id) })
            }
            if !q.isEmpty {
                for s in node.sections where matches("\(s.label) \(s.typeName) \(node.title)") {
                    sections.append(Item(id: s.id, group: .sections, title: "\(s.label) · \(s.typeName)",
                                         detail: [place, node.title].filter { !$0.isEmpty }.joined(separator: " › "),
                                         symbol: "square.stack") { model.open(s.id) })
                }
            }
        }

        var textItems: [Item] = []
        if q.count >= 3 {
            for (i, hit) in texts.enumerated() where hit.text.lowercased().contains(q) {
                guard let node = model.index.node(hit.nodeID) else { continue }
                let target = hit.sectionIndex.map { "\(node.id)#\($0)" } ?? node.id
                let where_ = [node.title, hit.sectionIndex.flatMap { node.sections.indices.contains($0) ? node.sections[$0].label : nil }]
                    .compactMap { $0 }.joined(separator: " › ")
                textItems.append(Item(id: "text\(i)", group: .text, title: "“\(snippet(hit.text, around: q))”", detail: where_,
                                      symbol: "text.quote") { model.open(target) })
                if textItems.count == 6 { break }
            }
        }

        let actions: [Item] = [
            Item(id: "publish", group: .actions, title: "Publish changes", detail: "⇧⌘P", symbol: "arrow.up.circle") { model.showPublish = true },
            Item(id: "backups", group: .actions, title: "Backups", detail: "⇧⌘B", symbol: "clock.arrow.circlepath") {
                NSApp.sendAction(#selector(EditorWindowController.showBackups(_:)), to: nil, from: nil)
            },
            Item(id: "classic", group: .actions, title: "Open Classic Editor", detail: "The full web editor", symbol: "macwindow") {
                NSApp.sendAction(#selector(EditorWindowController.openClassicEditor(_:)), to: nil, from: nil)
            },
        ] + EditorModel.Device.allCases.map { d in
            Item(id: "device-\(d.rawValue)", group: .actions, title: "Preview: \(d.label)", detail: "", symbol: d.symbol) { model.device = d }
        } + (model.languages.count > 1 ? model.languages : []).map { code, label in
            Item(id: "lang-\(code)", group: .actions, title: "Language: \(label)", detail: "", symbol: "globe") { model.setLanguage(code) }
        }
        let matchingActions = q.isEmpty ? Array(actions.prefix(3)) : actions.filter { matches($0.title) }

        return Array(sections.prefix(8)) + Array(pages.prefix(q.isEmpty ? 8 : 6)) + textItems + matchingActions
    }

    private func groupTitle(of node: SiteIndex.Node) -> String? {
        model.index.tree.first { g in
            g.children?.contains { $0.id == node.id || $0.children?.contains { $0.id == node.id } == true } == true
        }?.title
    }

    private func snippet(_ text: String, around q: String) -> String {
        guard let r = text.lowercased().range(of: q) else { return String(text.prefix(80)) }
        let start = text.index(r.lowerBound, offsetBy: -30, limitedBy: text.startIndex) ?? text.startIndex
        let end = text.index(r.upperBound, offsetBy: 50, limitedBy: text.endIndex) ?? text.endIndex
        return (start > text.startIndex ? "…" : "") + text[start..<end] + (end < text.endIndex ? "…" : "")
    }
}
