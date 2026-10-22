import SwiftUI

/// Translate (toolbar language KO / ZH): a page's English text beside its
/// translation. The text list and the dictionaries (src/i18n/<lang>.json)
/// come from the editor API's /api/i18n routes, so what counts as text is
/// exactly what the site translates (src/i18n/rules.js).
struct TranslationInspector: View {
    @ObservedObject var model: EditorModel
    /// An /api/i18n source id: a content file (repo-relative) or "ui".
    let sourceID: String
    let title: String

    enum Filter: String, CaseIterable { case todo = "To do", all = "All", outdated = "Outdated" }

    struct Entry: Identifiable { let src: String; var value: String; var id: String { src } }
    struct Stale: Identifiable { let src: String; let value: String; var id: String { src } }

    @State private var filter: Filter = .todo
    @State private var entries: [Entry] = []
    @State private var stale: [Stale] = []
    @State private var loaded = false
    /// Translations typed but not yet sent, by English text.
    @State private var pending: [String: String] = [:]
    @State private var saveTask: Task<Void, Never>?
    /// Rows stay put while typing; the To do list refreshes on reopen.
    @State private var shownTodo: Set<String> = []

    private var lang: String { model.language }
    private var langName: String { lang == "ko" ? "Korean" : lang == "zh" ? "Chinese" : lang.uppercased() }
    private var done: Int { entries.filter { !$0.value.isEmpty }.count }

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Translating \(title) into \(langName)").font(.headline)
                        Text(loaded ? "\(done) of \(entries.count) translated" : "Loading…")
                            .font(.caption).foregroundStyle(.secondary).monospacedDigit()
                    }
                    Spacer()
                }
                if loaded && !entries.isEmpty {
                    ProgressView(value: Double(done), total: Double(max(entries.count, 1)))
                }
                Picker("Show", selection: $filter) {
                    Text("To do · \(entries.count - done)").tag(Filter.todo)
                    Text("All · \(entries.count)").tag(Filter.all)
                    Text("Outdated · \(stale.count)").tag(Filter.outdated)
                }
                .pickerStyle(.segmented)
                .labelsHidden()
            }
            .padding(14)
            Divider()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    switch filter {
                    case .todo, .all:
                        let rows = entries.filter { filter == .all || shownTodo.contains($0.src) }
                        if loaded && rows.isEmpty {
                            Text(filter == .todo ? "Everything on this page is translated." : "This page has no text to translate.")
                                .foregroundStyle(.secondary).padding(16)
                        }
                        ForEach(rows) { entry in row(entry) }
                    case .outdated:
                        Text("Translations whose English was changed or removed. They no longer show on the site.")
                            .font(.caption).foregroundStyle(.secondary).padding(14)
                        ForEach(stale) { s in staleRow(s) }
                    }
                }
            }

            Divider()
            HStack {
                Text(pending.isEmpty ? "Edits save as you type" : "Saving…").font(.caption).foregroundStyle(.secondary)
                Spacer()
                Button("Translated Images…") { model.openWebTranslations() }
                    .controlSize(.small)
                    .help("Replace images for this language (web form)")
            }
            .padding(.horizontal, 14).padding(.vertical, 8)
        }
        .task(id: "\(sourceID)|\(lang)") { await load() }
        .onDisappear { flush() }
    }

    private func row(_ entry: Entry) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(InlineHTML.plain(entry.src))
                .font(.callout)
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
            RichTextField(html: entry.value, placeholder: "Not translated — the English shows") { html in
                set(entry.src, html)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .overlay(alignment: .bottom) { Divider().padding(.leading, 14) }
    }

    private func staleRow(_ s: Stale) -> some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(InlineHTML.plain(s.src)).font(.callout).foregroundStyle(.secondary).strikethrough()
                Text(InlineHTML.plain(s.value)).font(.callout)
            }
            Spacer()
            Button("Delete") {
                Task {
                    _ = await model.callAPI("POST", "/api/i18n/strings", body: ["lang": lang, "entries": [s.src: ""]])
                    stale.removeAll { $0.src == s.src }
                }
            }
            .controlSize(.small)
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .overlay(alignment: .bottom) { Divider().padding(.leading, 14) }
    }

    // MARK: - Data

    private func load() async {
        flush()
        loaded = false
        let encoded = sourceID.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? sourceID
        let r = await model.callAPI("GET", "/api/i18n/source?id=\(encoded)")
        let list = (r.json as? [String: Any])?["strings"] as? [[String: Any]] ?? []
        entries = list.compactMap { s in
            guard let src = s["src"] as? String else { return nil }
            return Entry(src: src, value: s[lang] as? String ?? "")
        }
        shownTodo = Set(entries.filter { $0.value.isEmpty }.map(\.src))
        let o = await model.callAPI("GET", "/api/i18n/outdated")
        stale = ((o.json as? [String: Any])?[lang] as? [[String: Any]] ?? []).compactMap { s in
            guard let src = s["src"] as? String else { return nil }
            return Stale(src: src, value: s["value"] as? String ?? "")
        }
        loaded = true
    }

    private func set(_ src: String, _ html: String) {
        if let i = entries.firstIndex(where: { $0.src == src }) { entries[i].value = html }
        pending[src] = html
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(nanoseconds: 800_000_000)
            guard !Task.isCancelled else { return }
            flush()
        }
    }

    /// Sends typed translations (the dictionary write reloads the preview).
    private func flush() {
        guard !pending.isEmpty else { return }
        let batch = pending.mapValues { InlineHTML.plain($0).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "" : $0 }
        pending = [:]
        let language = lang
        Task { _ = await model.callAPI("POST", "/api/i18n/strings", body: ["lang": language, "entries": batch]) }
    }
}

/// The Translations page: every translatable part of the site with its
/// progress in the toolbar's language; pages open in Translate, the rest
/// (interface text, lists) right here.
struct TranslationsOverview: View {
    @ObservedObject var model: EditorModel
    @State private var sources: [[String: Any]] = []
    @State private var open: (id: String, label: String)?

    var body: some View {
        if model.language == "en" {
            VStack(alignment: .leading, spacing: 10) {
                Text("Translations").font(.headline)
                Text("Choose KO or ZH in the toolbar. Every page then shows its English beside the translation, and this page lists what’s left to translate.")
                    .font(.callout).foregroundStyle(.secondary)
                HStack {
                    Button("Korean") { model.setLanguage("ko") }
                    Button("Chinese") { model.setLanguage("zh") }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        } else if let open {
            VStack(spacing: 0) {
                HStack {
                    Button { self.open = nil } label: { Label("All translations", systemImage: "chevron.left") }
                        .buttonStyle(.borderless)
                    Spacer()
                }
                .padding(.horizontal, 12).padding(.top, 8)
                TranslationInspector(model: model, sourceID: open.id, title: open.label)
            }
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(Array(sources.enumerated()), id: \.offset) { _, s in
                        let id = s["id"] as? String ?? ""
                        let total = s["total"] as? Int ?? 0
                        let done = (s["done"] as? [String: Int])?[model.language] ?? 0
                        Button {
                            if let node = model.index.openable.first(where: { $0.contentPath == id && $0.id != "translations" }), id != "src/data/siteConfig.json" {
                                model.open(node.id)
                            } else {
                                open = (id, s["label"] as? String ?? id)
                            }
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(s["label"] as? String ?? id).lineLimit(1)
                                    Text(s["group"] as? String ?? "").font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text(total == 0 ? "—" : done == total ? "Done" : "\(total - done) to do")
                                    .font(.caption).monospacedDigit()
                                    .foregroundStyle(done == total ? .green : .secondary)
                            }
                            .padding(8)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .background(Corner.shape(Corner.tile).fill(Color.secondary.opacity(0.06)))
                    }
                }
                .padding(12)
            }
            .task(id: model.language) {
                let r = await model.callAPI("GET", "/api/i18n/status")
                sources = (r.json as? [String: Any])?["sources"] as? [[String: Any]] ?? []
            }
        }
    }
}
