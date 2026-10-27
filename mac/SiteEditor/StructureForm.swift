import SwiftUI

/// Site settings ▸ Site Structure: what the site has and what its menu
/// holds — the menu's items in order (renamed, hidden, links), parts of the
/// site switched off (Originals, Blog, Archive), and smaller pieces
/// (project icon strip, category pill bar, the bar on project pages, search,
/// footer). All of it is siteConfig.structure; the site reads it through
/// src/utils/structure.js, and the Assistant can change it too.
struct StructureForm: View {
    @ObservedObject var model: EditorModel
    @ObservedObject var doc: ContentDocument

    static let builtins: [(key: String, title: String, path: String)] = [
        ("about", "About", "/about"), ("projects", "Projects", "/projects"), ("originals", "Originals", "/originals"),
        ("blog", "Blog", "/blog"), ("contacts", "Contacts", "/contacts"),
    ]

    /// The menu as stored, or as the older settings (hiddenBuiltinNav,
    /// navCustomItems) describe it — written in the new form on the first edit.
    private var nav: [JSONValue] { Self.nav(in: doc.root) }

    static func nav(in config: JSONValue) -> [JSONValue] {
        if let items = config[path: ["structure", "nav"]]?.array { return items }
        let hidden = (config["hiddenBuiltinNav"]?.array ?? []).compactMap(\.string)
        var items: [JSONValue] = builtins.map { b in
            hidden.contains(b.path) ? .object([("key", .string(b.key)), ("hidden", .bool(true))]) : .object([("key", .string(b.key))])
        }
        for link in config["navCustomItems"]?.array ?? [] {
            var item: [(String, JSONValue)] = [("key", .string("link"))]
            for k in ["label", "path", "href"] { if let v = link[k]?.string { item.append((k, .string(v))) } }
            items.append(.object(item))
        }
        return items
    }

    private func setNav(_ items: [JSONValue], _ name: String) {
        doc.set(["structure", "nav"], .array(items), name: name)
    }

    var body: some View {
        if let notice = codeNotice {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "arrow.triangle.2.circlepath").foregroundStyle(Color.accentColor)
                VStack(alignment: .leading, spacing: 6) {
                    Text(notice).font(.callout).fixedSize(horizontal: false, vertical: true)
                    Button("Update Site…") { model.showUpdateSite = true }.controlSize(.small)
                }
            }
            .padding(10)
            .background(RoundedRectangle(cornerRadius: 8).fill(Color.accentColor.opacity(0.08)))
            .padding(.horizontal, 14).padding(.top, 10)
        }
        InspectorGroup(title: "Menu") {
            Text("The navbar’s items, in order. Untick to keep one out of the menu (its page still works); switch a whole part off below.")
                .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            let items = nav
            ForEach(Array(items.enumerated()), id: \.offset) { i, item in
                navRow(item, at: i, in: items)
            }
            Button { setNav(items + [.object([("key", .string("link")), ("label", .string("")), ("path", .string("")), ("href", .string(""))])], "Add Menu Link") } label: {
                Label("Add Link", systemImage: "plus")
            }
            .buttonStyle(.borderless)
        }
        InspectorGroup(title: "Names") {
            Text("What each part is called on the site — its menu item, page titles, search and “Other …” rows. An organization might use Events and Notices.")
                .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            JTextField(doc: doc, path: ["structure", "names", "projects"], label: "Projects", placeholder: "Projects — e.g. Events, Work")
            JTextField(doc: doc, path: ["structure", "names", "originals"], label: "Originals", placeholder: "Originals")
            JTextField(doc: doc, path: ["structure", "names", "blog"], label: "Blog", placeholder: "Blog — e.g. Notices, News")
            JTextField(doc: doc, path: ["structure", "names", "archive"], label: "Archive", placeholder: "Archive")
        }
        InspectorGroup(title: "Parts of the site") {
            Text("Off: gone from the menu, footer, search and Home, and its addresses go to Home. Its content is kept.")
                .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            JToggle(doc: doc, path: ["structure", "sections", "originals"], label: "Originals", defaultOn: true)
            JToggle(doc: doc, path: ["structure", "sections", "blog"], label: "Blog", defaultOn: true)
            JToggle(doc: doc, path: ["structure", "sections", "archive"], label: "Archive", defaultOn: true)
        }
        InspectorGroup(title: "Languages") {
            LanguagesList(model: model, doc: doc)
        }
        InspectorGroup(title: "Details") {
            JToggle(doc: doc, path: ["structure", "projectIcons"], label: "Project icon strip on category pages (off: a card grid)", defaultOn: true)
            JToggle(doc: doc, path: ["structure", "categoryFilter"], label: "Category pill bar under the navbar", defaultOn: true)
            JToggle(doc: doc, path: ["structure", "detailBar"], label: "Bar under the navbar on project pages", defaultOn: true)
            JToggle(doc: doc, path: ["structure", "search"], label: "Search button", defaultOn: true)
            JToggle(doc: doc, path: ["structure", "footer"], label: "Footer", defaultOn: true)
            Text("The contents bar on project pages is in Navbar ▸ Contents bar.")
                .font(.caption).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func navRow(_ item: JSONValue, at i: Int, in all: [JSONValue]) -> some View {
        let key = item["key"]?.string ?? ""
        let builtin = Self.builtins.first { $0.key == key }
        let page = key == "page" ? pageTitle(item["page"]?.string) : nil
        let isLink = builtin == nil && key != "page"
        let partOff = ["originals", "blog"].contains(key) && doc.root[path: ["structure", "sections", key]]?.bool == false
        let update = { (k: String, v: JSONValue?, name: String) in
            var items = all
            items[i].set(k, v)
            setNav(items, name)
        }
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Toggle("", isOn: Binding(get: { item["hidden"]?.bool != true }, set: { update("hidden", $0 ? nil : .bool(true), "Show in Menu") }))
                    .toggleStyle(.checkbox).labelsHidden()
                    .help("Show in the menu")
                CommitTextField(placeholder: doc.root[path: ["structure", "names", key]]?.string ?? builtin?.title ?? page ?? "Label", value: item["label"]?.string ?? "") { v in
                    let t = v.trimmingCharacters(in: .whitespaces)
                    update("label", !isLink && t.isEmpty ? nil : .string(t), "Rename Menu Item")
                }
                .textFieldStyle(.roundedBorder)
                if partOff {
                    Text("Off").font(.caption).foregroundStyle(.secondary).help("This part of the site is switched off below")
                }
                Button { var items = all; items.swapAt(i, i - 1); setNav(items, "Move Menu Item") } label: { Image(systemName: "chevron.up") }
                    .buttonStyle(.borderless).disabled(i == 0).help("Move up")
                Button { var items = all; items.swapAt(i, i + 1); setNav(items, "Move Menu Item") } label: { Image(systemName: "chevron.down") }
                    .buttonStyle(.borderless).disabled(i == all.count - 1).help("Move down")
                if isLink {
                    Button { var items = all; items.remove(at: i); setNav(items, "Remove Menu Link") } label: { Image(systemName: "minus.circle") }
                        .buttonStyle(.borderless).help("Remove this link")
                }
                if key == "page" {
                    Image(systemName: "doc.plaintext").foregroundStyle(.secondary).help("One of your pages")
                }
            }
            if isLink {
                HStack(spacing: 6) {
                    CommitTextField(placeholder: "/ig", value: item["path"]?.string ?? "") { update("path", .string($0.trimmingCharacters(in: .whitespaces)), "Menu Link Path") }
                        .textFieldStyle(.roundedBorder).frame(width: 90)
                        .help("The address on your site")
                    CommitTextField(placeholder: "https://… (where it goes)", value: item["href"]?.string ?? "") { update("href", .string($0.trimmingCharacters(in: .whitespaces)), "Menu Link Address") }
                        .textFieldStyle(.roundedBorder)
                }
                .padding(.leading, 22)
            }
        }
    }

    /// A page's name from pages.json (the menu shows it unless renamed here).
    private func pageTitle(_ id: String?) -> String? {
        model.sideDocument("src/data/pages.json")?.root.array?.first { $0["id"]?.string == id }?["title"]?.string ?? id
    }

    /// Shown when the site's code predates this Profolio's (the settings
    /// here need the newer code to take effect on the site).
    private var codeNotice: String? {
        guard let package = model.document.packageURL, let starter = SiteUpdater.starterCommit,
              let installed = SiteUpdater.installedCommit(in: package), installed != starter else { return nil }
        return "This site may have been made with an older Profolio. If these settings don’t show on the site, update its code with Update Site."
    }
}

/// Site Structure ▸ Languages: English is always on; each other language
/// adds a version of the site at /<code> (siteConfig.languages) to
/// translate in the toolbar's language picker. Turning one off keeps its
/// translations for when it comes back.
private struct LanguagesList: View {
    @ObservedObject var model: EditorModel
    @ObservedObject var doc: ContentDocument
    @State private var busy = false
    @State private var error: String?

    private var on: [String] { (doc.root["languages"]?.array ?? []).compactMap(\.string) }

    var body: some View {
        Text("The site is written in English. Add a language to translate it: its pages appear at /ko, /ja… and a language menu shows in the footer.")
            .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        Toggle("English", isOn: .constant(true)).toggleStyle(.checkbox).disabled(true)
        ForEach(EditorModel.otherLanguageCodes, id: \.self) { code in
            Toggle(EditorModel.languageName(code), isOn: Binding(get: { on.contains(code) }, set: { set(code, $0) }))
                .toggleStyle(.checkbox)
                .disabled(busy)
        }
        if let error { Text(error).font(.caption).foregroundStyle(.red) }
    }

    private func set(_ code: String, _ enabled: Bool) {
        let codes = enabled ? on + [code] : on.filter { $0 != code }
        busy = true
        Task {
            error = await model.setLanguages(codes)
            busy = false
        }
    }
}
