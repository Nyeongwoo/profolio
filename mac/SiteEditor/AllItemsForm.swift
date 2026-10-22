import AppKit
import SwiftUI

/// The All Projects / All Originals page, natively: everything the web
/// form's page had (EditorAllItems.jsx), all of it in siteConfig.json — the
/// grid, its text, the categories and their tabs, the Featured / All tab
/// list with captions, confidential projects, card text colors, and the
/// "Other projects" row under every detail page.
struct AllItemsForm: View {
    @ObservedObject var model: EditorModel
    @ObservedObject var doc: ContentDocument
    let type: String            // projects | originals
    let scope: SizeScope

    private var projects: Bool { type == "projects" }
    private var p: String { projects ? "allProjects" : "allOriginals" }
    private var orderKey: String { projects ? "projectCategoryOrder" : "originalCategoryOrder" }
    private var labelsKey: String { projects ? "projectCategoryLabels" : "originalCategoryLabels" }
    private var textKey: String { projects ? "projectsCategoryText" : "originalsCategoryText" }
    private var hiddenInAllKey: String { projects ? "hiddenInAllProjects" : "hiddenInAllOriginals" }
    private var hiddenItemsKey: String { projects ? "hiddenProjects" : "hiddenOriginals" }
    private var hiddenCategoriesKey: String { projects ? "hiddenProjectCategories" : "hiddenOriginalCategories" }
    private var noun: String { projects ? "project" : "original" }
    private var suffix: String { scope == .all ? "" : scope == .tablet ? "Tablet" : "Mobile" }

    struct Item: Identifiable {
        let category: String
        let id: String
        let title: String
        let tags: [String]
        let order: Double
        var key: String { "\(category)/\(id)" }
    }

    var body: some View {
        let items = loadItems()
        let cats = categories(items)
        grid
        text
        categoriesGroup(cats, items)
        categoryTexts(cats)
        if projects { iconOrder(cats, items) }
        tabList(items, cats)
        if projects { cardText }
        others
    }

    // MARK: Grid and text

    private var hoverStyle: String {
        doc.root["\(p)HoverStyle"]?.string ?? (doc.root["\(p)CaptionEnabled"]?.bool == false ? "plain" : "overlay")
    }

    @ViewBuilder private var grid: some View {
        InspectorGroup(title: "Grid") {
            JSegmented(doc: doc, path: ["\(p)Layout"], label: "Columns", options: [("1", "1"), ("2", "2"), ("3", "3"), ("4", "4")], defaultValue: "3")
            JSegmented(doc: doc, path: ["\(p)MobileLayout"], label: "On phones", options: [("1", "1"), ("2", "2"), ("3", "3")], defaultValue: "1")
            if scope == .mobile {
                JPicker(doc: doc, path: ["\(p)MobileImageRatio"], label: "Image ratio",
                        options: [("", "Same as larger")] + SiteOptions.ratios.dropFirst(), hint: "On phones")
            } else {
                JPicker(doc: doc, path: ["\(p)ImageRatio"], label: "Image ratio", options: SiteOptions.ratios,
                        hint: "Phones use this too unless set under Mobile")
            }
            FieldRow(label: "On hover") {
                Picker("On hover", selection: Binding(get: { hoverStyle }, set: { v in
                    doc.edit("Change On hover") { root in
                        root.set("\(p)HoverStyle", .string(v))
                        root.set("\(p)CaptionEnabled", .bool(v != "plain"))
                    }
                })) {
                    Text("Color overlay").tag("overlay")
                    Text("Zoom + text").tag("zoom")
                    Text("Image only").tag("plain")
                }
                .labelsHidden().fixedSize()
            }
            JToggle(doc: doc, path: ["\(p)CaptionSwap"], label: "Title caption on the right")
            JNumberField(doc: doc, path: [scope == .mobile ? "\(p)TitleGapMobile" : "\(p)TitleGap"],
                         label: "Gap below title", placeholder: scope == .mobile ? "Same" : "32", unit: "px")
            JLengthField(doc: doc, path: ["iconCarouselMobileGap"], label: "Icon gap (phone)", placeholder: "8px")
        }
    }

    @ViewBuilder private var text: some View {
        InspectorGroup(title: "Text") {
            JRichTextField(doc: doc, path: ["\(p)Text"], label: "Intro text", placeholder: "Leave empty to hide")
            JPicker(doc: doc, path: ["\(p)TitleSize"], label: "Card title", options: SiteOptions.fontSizes)
            JPicker(doc: doc, path: ["\(p)TagSize"], label: "Card tags", options: SiteOptions.fontSizes)
            if projects {
                JToggle(doc: doc, path: ["\(p)ArchiveLinkHidden"], label: "Hide “See all work in the Archive”")
            }
        }
    }

    // MARK: Categories

    @ViewBuilder private func categoriesGroup(_ cats: [String], _ items: [Item]) -> some View {
        InspectorGroup(title: "Categories", trailing: AnyView(Button("Add…") { addCategory() }.controlSize(.small))) {
            FieldRow(label: "All tab") {
                field("All", [labelsKey, "all"]).textFieldStyle(.roundedBorder)
            }
            JLengthField(doc: doc, path: ["categoryHeroTitleSize\(suffix)", "all"], label: "Title size", placeholder: scope == .all ? "Default" : "Same")
            JLengthField(doc: doc, path: ["categoryTitleTopGap\(suffix)", "all"], label: "Title top gap", placeholder: scope == .all ? "Default" : "Same")
            Divider()
            ForEach(Array(cats.enumerated()), id: \.element) { i, cat in
                HStack(spacing: 6) {
                    VStack(spacing: 0) {
                        Button { moveCategory(cats, i, -1) } label: { Image(systemName: "chevron.up") }.disabled(i == 0)
                        Button { moveCategory(cats, i, 1) } label: { Image(systemName: "chevron.down") }.disabled(i == cats.count - 1)
                    }
                    .buttonStyle(.borderless).font(.system(size: 9, weight: .semibold))
                    Text(cat).font(.callout.weight(.medium)).frame(width: 84, alignment: .leading).lineLimit(1)
                    field(cat.capitalized, [labelsKey, cat]).textFieldStyle(.roundedBorder)
                        .help("The tab's label on the site")
                    Text("\(items.filter { $0.category == cat }.count)").font(.caption).foregroundStyle(.secondary).monospacedDigit()
                        .help("\(noun.capitalized)s in it")
                    let hidden = doc.root[hiddenCategoriesKey]?.array?.contains(.string(cat)) == true
                    Button { toggle(hiddenCategoriesKey, cat) } label: { Image(systemName: hidden ? "eye.slash" : "eye") }
                        .buttonStyle(.borderless).foregroundStyle(hidden ? .secondary : .primary)
                        .help(hidden ? "Tab hidden, and its \(noun)s left out of the \(projects ? "Featured" : "All") tab (they stay reachable by link)" : "Tab shown")
                    Menu {
                        Button("Rename…") { model.renameCategory(type, cat) }
                        Button("Delete…", role: .destructive) { model.deleteCategory(type, cat) }
                    } label: { Image(systemName: "ellipsis.circle") }
                    .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize()
                }
            }
        }
    }

    @ViewBuilder private func categoryTexts(_ cats: [String]) -> some View {
        InspectorGroup(title: "Category descriptions", defaultOpen: false) {
            ForEach(cats, id: \.self) { cat in
                VStack(alignment: .leading, spacing: 3) {
                    Text(cat).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    field("Leave empty to hide", [textKey, cat], keepEmpty: true, axis: .vertical)
                        .lineLimit(2...6).textFieldStyle(.roundedBorder)
                }
            }
        }
    }

    // MARK: Order in each category

    @ViewBuilder private func iconOrder(_ cats: [String], _ items: [Item]) -> some View {
        InspectorGroup(title: "Order in each category", defaultOpen: false) {
            Text("The icons at the top of each category page, in this order.")
                .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            ForEach(cats, id: \.self) { cat in
                let list = categoryOrder(cat, items)
                if !list.isEmpty {
                    Text(cat).font(.caption.weight(.semibold)).foregroundStyle(.secondary).padding(.top, 4)
                    ForEach(Array(list.enumerated()), id: \.element.key) { i, item in
                        HStack(spacing: 6) {
                            VStack(spacing: 0) {
                                Button { moveInCategory(cat, list, i, -1) } label: { Image(systemName: "chevron.up") }.disabled(i == 0)
                                Button { moveInCategory(cat, list, i, 1) } label: { Image(systemName: "chevron.down") }.disabled(i == list.count - 1)
                            }
                            .buttonStyle(.borderless).font(.system(size: 9, weight: .semibold))
                            Text(item.title).font(.callout).lineLimit(1)
                            Spacer()
                        }
                    }
                }
            }
        }
    }

    /// A category's projects as its page orders them: the saved ids
    /// (categoryProjectOrder), then the rest by `order`. Projects hidden on
    /// the site aren't on the page, so they're left out here too.
    private func categoryOrder(_ cat: String, _ items: [Item]) -> [Item] {
        let order = (doc.root[path: ["categoryProjectOrder", cat]]?.array ?? []).compactMap(\.string)
        let hidden = Set((doc.root[hiddenItemsKey]?.array ?? []).compactMap(\.string))
        func rank(_ x: Item) -> Int { order.firstIndex(of: x.id) ?? Int.max }
        return items.filter { $0.category == cat && !hidden.contains($0.key) }.enumerated().sorted { a, b in
            rank(a.element) != rank(b.element) ? rank(a.element) < rank(b.element) : a.offset < b.offset
        }.map(\.element)
    }

    private func moveInCategory(_ cat: String, _ list: [Item], _ i: Int, _ d: Int) {
        var ids = list.map(\.id)
        guard ids.indices.contains(i + d) else { return }
        ids.swapAt(i, i + d)
        doc.set(["categoryProjectOrder", cat], .array(ids.map { .string($0) }), name: "Reorder \(cat)")
    }

    // MARK: Featured / All tab

    @ViewBuilder private func tabList(_ items: [Item], _ cats: [String]) -> some View {
        let list = tabOrder(items)
        InspectorGroup(title: projects ? "Featured tab" : "All tab") {
            Text(projects ? "Which projects the Projects page opens with, in this order, and the caption on each card. The card title is the project's name (right-click it in the sidebar ▸ Rename). Every project still shows in its own category."
                          : "Originals hidden here still show in their category.")
                .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            ForEach(Array(list.enumerated()), id: \.element.key) { i, item in
                TabRow(form: self, item: item, index: i, count: list.count, list: list)
            }
        }
    }

    fileprivate struct TabRow: View {
        let form: AllItemsForm
        let item: Item
        let index: Int
        let count: Int
        let list: [Item]
        @State private var showText = false

        var body: some View {
            let doc = form.doc
            let shownHere = doc.root[form.hiddenInAllKey]?.array?.contains(.string(item.key)) != true
            let hiddenEverywhere = doc.root[form.hiddenItemsKey]?.array?.contains(.string(item.key)) == true
            let confidential = doc.root["confidentialProjects"]?.array?.contains(.string(item.key)) == true
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 6) {
                    if form.projects {
                        VStack(spacing: 0) {
                            Button { form.moveFeatured(list, index, -1) } label: { Image(systemName: "chevron.up") }.disabled(index == 0)
                            Button { form.moveFeatured(list, index, 1) } label: { Image(systemName: "chevron.down") }.disabled(index == count - 1)
                        }
                        .buttonStyle(.borderless).font(.system(size: 9, weight: .semibold))
                    }
                    Toggle("", isOn: Binding(get: { shownHere }, set: { _ in form.toggle(form.hiddenInAllKey, item.key) }))
                        .toggleStyle(.checkbox).labelsHidden().disabled(hiddenEverywhere)
                        .help(form.projects ? "Show in the Featured tab" : "Show in the All tab")
                    VStack(alignment: .leading, spacing: 0) {
                        Text(item.title).font(.callout).lineLimit(1)
                        Text(hiddenEverywhere ? "\(item.category) · hidden on the site" : item.category)
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    .opacity(hiddenEverywhere ? 0.5 : 1)
                    Spacer()
                    if form.projects {
                        Button { form.toggle("confidentialProjects", item.key) } label: {
                            Image(systemName: confidential ? "lock.fill" : "lock.open")
                        }
                        .buttonStyle(.borderless).foregroundStyle(confidential ? Color.orange : .secondary)
                        .help(confidential ? "Confidential (NDA): orange “Confidential” on hover" : "Public")
                    }
                    if form.projects && form.hoverStyle != "plain" {
                        Button { showText.toggle() } label: { Image(systemName: "paintpalette") }
                            .buttonStyle(.borderless).foregroundStyle(showText ? Color.accentColor : .secondary)
                            .help("This card's text colors and shadow")
                    }
                }
                // The text over the card: shown whenever the hover style has text.
                if form.hoverStyle != "plain" {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 6) {
                            form.field(item.tags.isEmpty ? "Caption" : item.tags.joined(separator: ", "), ["\(form.p)Captions", item.key])
                                .help("Caption under the title (empty: the tags)")
                            form.field("Bottom-right", ["\(form.p)RightCaptions", item.key])
                                .help("Caption in the card's bottom-right corner (optional)")
                        }
                        .textFieldStyle(.roundedBorder).controlSize(.small)
                        if showText && form.projects {
                            CardTextFields(doc: doc, base: ["allProjectsCardText", "items", item.key], inherit: true)
                        }
                    }
                    .padding(.leading, 30)
                }
            }
            .padding(.vertical, 2)
        }
    }

    @ViewBuilder private var cardText: some View {
        InspectorGroup(title: "Card text", defaultOpen: false) {
            Text("Title and caption colors on every card; a project can override them (the palette button in the list above).")
                .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            CardTextFields(doc: doc, base: ["allProjectsCardText"], inherit: false)
        }
    }

    // MARK: Other projects row

    @ViewBuilder private var others: some View {
        InspectorGroup(title: projects ? "Other projects row" : "Other originals row", defaultOpen: false) {
            Text("The heading and icons under every \(noun) page (shared by projects and originals).")
                .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            let same = scope == .all ? "Default" : "Same"
            JLengthField(doc: doc, path: ["othersTitleSize\(suffix)"], label: "Title size", placeholder: scope == .all ? "24px" : same)
            JLengthField(doc: doc, path: ["othersTitleGap\(suffix)"], label: "Title gap", placeholder: scope == .all ? "32px" : same)
            JLengthField(doc: doc, path: ["othersIconSize\(suffix)"], label: "Icon size", placeholder: scope == .all ? "200px" : same)
            JLengthField(doc: doc, path: ["othersIconGap\(suffix)"], label: "Icon gap", placeholder: scope == .all ? "12px" : same)
            JToggle(doc: doc, path: ["othersTitleBold"], label: "Bold title")
        }
    }

    // MARK: Data

    private func loadItems() -> [Item] {
        guard let package = model.document.packageURL,
              let data = try? Data(contentsOf: package.appendingPathComponent("site/src/data/\(type).json")),
              let list = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
        return list.compactMap { x in
            guard let c = x["category"] as? String, let id = x["id"] as? String else { return nil }
            return Item(category: c, id: id, title: (x["title"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? id,
                        tags: x["tags"] as? [String] ?? [], order: (x["order"] as? NSNumber)?.doubleValue ?? 0)
        }
        .sorted { $0.order < $1.order }
    }

    /// Saved order first, then categories that only have items or a
    /// description (one just added), as the web form lists them.
    private func categories(_ items: [Item]) -> [String] {
        var found: [String] = []
        for c in items.map(\.category) + (doc.root[textKey]?.keys ?? []) where !found.contains(c) { found.append(c) }
        let order = (doc.root[orderKey]?.array ?? []).compactMap(\.string)
        return order.filter(found.contains) + found.filter { !order.contains($0) }
    }

    private func tabOrder(_ items: [Item]) -> [Item] {
        guard projects else { return items }
        let order = (doc.root["featuredOrder"]?.array ?? []).compactMap(\.string)
        func rank(_ x: Item) -> Int { order.firstIndex(of: x.key) ?? Int.max }
        return items.enumerated().sorted { a, b in
            rank(a.element) != rank(b.element) ? rank(a.element) < rank(b.element) : a.offset < b.offset
        }.map(\.element)
    }

    fileprivate func moveFeatured(_ list: [Item], _ i: Int, _ d: Int) {
        var keys = list.map(\.key)
        guard keys.indices.contains(i + d) else { return }
        keys.swapAt(i, i + d)
        doc.set(["featuredOrder"], .array(keys.map { .string($0) }), name: "Reorder Featured")
    }

    private func moveCategory(_ cats: [String], _ i: Int, _ d: Int) {
        var list = cats
        guard list.indices.contains(i + d) else { return }
        list.swapAt(i, i + d)
        doc.set([orderKey], .array(list.map { .string($0) }), name: "Reorder Categories")
    }

    /// Adds or removes `value` in the string list at `key`.
    fileprivate func toggle(_ key: String, _ value: String) {
        var list = doc.root[key]?.array ?? []
        if let i = list.firstIndex(of: .string(value)) { list.remove(at: i) } else { list.append(.string(value)) }
        doc.set([key], .array(list), name: "Change \(key)")
    }

    /// A text field on `path` (applied per EditCommit); empty removes the
    /// key, or keeps "" when the site expects every key (category
    /// descriptions).
    fileprivate func field(_ placeholder: String, _ path: [Any], keepEmpty: Bool = false, axis: Axis = .horizontal) -> CommitTextField {
        CommitTextField(placeholder: placeholder, value: doc.root[path: path]?.string ?? "", axis: axis) {
            doc.set(path, $0.isEmpty && !keepEmpty ? nil : .string($0), name: "Edit Text")
        }
    }

    private func addCategory() {
        let alert = NSAlert()
        alert.messageText = "New \(projects ? "project" : "original") category"
        alert.informativeText = "Lowercase letters, numbers and hyphens, e.g. \(projects ? "news" : "music")."
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
        alert.accessoryView = field
        alert.addButton(withTitle: "Add")
        alert.addButton(withTitle: "Cancel")
        alert.window.initialFirstResponder = field
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        let name = field.stringValue.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        model.flushEdits()
        Task {
            if let error = await model.addCategory(type, name) {
                let a = NSAlert()
                a.messageText = error
                a.runModal()
            }
        }
    }
}

/// Title / caption colors and the drop shadow of a Featured card: the
/// defaults, or one project's overrides (`inherit`: unset = the default).
private struct CardTextFields: View {
    @ObservedObject var doc: ContentDocument
    let base: [Any]
    let inherit: Bool

    var body: some View {
        let shadowOff = doc.root[path: base + ["shadow"]]?.bool == false
        JColorField(doc: doc, path: base + ["titleColor"], label: "Title color", placeholder: inherit ? "Default" : "#ffffff")
        JColorField(doc: doc, path: base + ["captionColor"], label: "Caption color", placeholder: inherit ? "Default" : "#ffffff")
        Toggle("Shadow", isOn: Binding(get: { !shadowOff }, set: { on in
            doc.set(base + ["shadow"], on ? nil : .bool(false), name: "Change Shadow")
        }))
        .toggleStyle(.checkbox)
        if !shadowOff {
            JColorField(doc: doc, path: base + ["shadowColor"], label: "Shadow color", placeholder: inherit ? "Default" : "#000000")
            JNumberField(doc: doc, path: base + ["shadowOpacity"], label: "Shadow opacity", placeholder: inherit ? "Default" : "50", unit: "%")
        }
    }
}
