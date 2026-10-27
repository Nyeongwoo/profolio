import SwiftUI

/// The Page tab of one of the site's own pages: its heading (info.json),
/// and from the site's lists its name, address and place in the menu
/// (src/data/pages.json, siteConfig.structure.nav). Sections are edited in
/// the Section tab like any page's.
struct CustomPageFields: View {
    @ObservedObject var model: EditorModel
    /// public/assets/pages/<id>/info.json
    @ObservedObject var doc: ContentDocument
    let pageID: String

    private var pagesDoc: ContentDocument? { model.sideDocument("src/data/pages.json") }
    private var configDoc: ContentDocument? { model.sideDocument("src/data/siteConfig.json") }

    var body: some View {
        InspectorGroup(title: "Heading") {
            JToggle(doc: doc, path: ["showHeader"], label: "Show a heading above the sections", defaultOn: true)
            JRichTextField(doc: doc, path: ["title"], label: "Title", placeholder: "Research")
            JRichTextField(doc: doc, path: ["description"], label: "Text", placeholder: "A line or two under the title (optional)")
        }
        if let pages = pagesDoc, let i = index(in: pages) {
            PageListFields(model: model, pages: pages, config: configDoc, index: i, pageID: pageID)
        }
        InspectorGroup(title: "Page") {
            Button("Delete This Page…", role: .destructive) {
                if let node = model.index.node("page:\(pageID)") { model.deleteItem(node) }
            }
            .controlSize(.small)
        }
    }

    private func index(in pages: ContentDocument) -> Int? {
        pages.root.array?.firstIndex { $0["id"]?.string == pageID }
    }
}

/// Name, address and menu: the page's entry in pages.json and the menu.
private struct PageListFields: View {
    @ObservedObject var model: EditorModel
    @ObservedObject var pages: ContentDocument
    let config: ContentDocument?
    let index: Int
    let pageID: String
    @State private var addressError: String?

    private var inMenu: Bool {
        config?.root[path: ["structure", "nav"]]?.array?.contains { $0["key"]?.string == "page" && $0["page"]?.string == pageID && $0["hidden"]?.bool != true } ?? false
    }

    var body: some View {
        InspectorGroup(title: "Name and address") {
            FieldRow(label: "Name") {
                CommitTextField(placeholder: "Research", value: pages.root[path: [index, "title"]]?.string ?? "") { v in
                    let t = v.trimmingCharacters(in: .whitespaces)
                    guard !t.isEmpty else { return }
                    pages.set([index, "title"], .string(t), name: "Page Name")
                }
                .textFieldStyle(.roundedBorder)
            }
            Text("Shown in the menu and the sidebar.").font(.caption).foregroundStyle(.secondary)
            FieldRow(label: "Address") {
                HStack(spacing: 2) {
                    Text("/").foregroundStyle(.secondary)
                    CommitTextField(placeholder: "research", value: String((pages.root[path: [index, "path"]]?.string ?? "").dropFirst())) { v in
                        setAddress(v.trimmingCharacters(in: .whitespaces).lowercased())
                    }
                    .textFieldStyle(.roundedBorder)
                }
            }
            if let addressError { Text(addressError).font(.caption).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true) }
            if let config {
                Toggle("In the menu", isOn: Binding(get: { inMenu }, set: { setInMenu($0, config) }))
                    .toggleStyle(.checkbox)
                Text("Its place in the menu is set in Site Structure.").font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func setAddress(_ slug: String) {
        guard slug.range(of: "^[a-z0-9-]+$", options: .regularExpression) != nil else {
            addressError = "Use lowercase letters, numbers and -."
            return
        }
        guard !NewItemSheet.reserved.contains(slug) else {
            addressError = "/\(slug) is one of the site’s own addresses. Pick another."
            return
        }
        let taken = (pages.root.array ?? []).enumerated().contains { $0.offset != index && $0.element["path"]?.string == "/\(slug)" }
        guard !taken else {
            addressError = "/\(slug) is already another page’s address."
            return
        }
        addressError = nil
        pages.set([index, "path"], .string("/\(slug)"), name: "Page Address")
    }

    private func setInMenu(_ on: Bool, _ config: ContentDocument) {
        var nav = StructureForm.nav(in: config.root)
        if let i = nav.firstIndex(where: { $0["key"]?.string == "page" && $0["page"]?.string == pageID }) {
            nav[i].set("hidden", on ? nil : .bool(true))
        } else if on {
            nav.append(.object([("key", .string("page")), ("page", .string(pageID))]))
        }
        config.set(["structure", "nav"], .array(nav), name: "Page in Menu")
    }
}
