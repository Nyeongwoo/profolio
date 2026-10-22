import SwiftUI

/// The native form of a page: Page (its own fields), Section (the selected
/// section) and Card (one block of an image + text / carousel section).
/// What the page is — its file, sections and images — comes from NativeForm.
struct NativeInspector: View {
    @ObservedObject var model: EditorModel
    @ObservedObject var doc: ContentDocument
    let form: NativeForm

    enum Tab: String, CaseIterable { case page = "Page", section = "Section", card = "Card" }
    @State private var tab: Tab = .page
    @State private var card = 0
    @State private var scope: SizeScope = .all

    /// Section types the Add menus offer on a page. Interactive (lab embed)
    /// sections only render on project and Originals pages.
    static func addableTypes(on page: NativeForm.Page?) -> [(String, String)] {
        let detail: Bool
        switch page {
        case .project, .original: detail = true
        default: detail = false
        }
        return types.filter { detail || $0.0 != "interactive" }
    }
    static let types: [(String, String)] = [
        ("text", "Text"), ("images", "Images"), ("image-text", "Image + Text"), ("image-text-carousel", "Carousel"),
        ("image-grid", "Image Grid"), ("image-tab", "Image Tabs"), ("text-columns", "Text Columns"),
        ("scroll-animation", "Scroll Animation"), ("video-background", "Video"), ("feature-tabs", "Feature Tabs"),
        ("tab-switcher", "Tab Switcher"), ("accordion", "Accordion"), ("stats", "Stats"), ("model-viewer", "3D Model"),
        ("interactive", "Interactive"),
    ]

    private var key: String { form.sectionsKey }

    /// Project and original pages (their sections have a few more settings).
    private var detail: DetailContext? {
        guard let package = model.document.packageURL else { return nil }
        let assets = package.appendingPathComponent("site/public/assets")
        switch form.page {
        case .project(let c, let i): return DetailContext(type: "projects", category: c, id: i, folder: assets.appendingPathComponent("projects/\(c)/\(i)"))
        case .original(let c, let i): return DetailContext(type: "originals", category: c, id: i, folder: assets.appendingPathComponent("originals/\(c)/\(i)"))
        default: return nil
        }
    }
    private var sectionIndex: Int? { form.hasSections ? model.currentSection?.index : nil }
    private var sections: [JSONValue] { doc.root[key]?.array ?? [] }
    private var section: JSONValue? { sectionIndex.flatMap { doc.root[key]?[$0] } }
    private var sectionType: String { section?["type"]?.string ?? "" }
    private var hasCards: Bool { sectionType == "image-text" || sectionType == "image-text-carousel" }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Picker("", selection: $tab) {
                    Text("Page").tag(Tab.page)
                    Text("Section").tag(Tab.section).disabled(section == nil)
                    Text("Card").tag(Tab.card).disabled(!hasCards)
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .fixedSize()
                Spacer()
                Picker("Applies to", selection: $scope) {
                    ForEach(SizeScope.allCases) { Text($0.label).tag($0) }
                }
                .fixedSize()
                .help("Which screen the text size controls edit")
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    switch tab {
                    case .page:
                        switch form.page {
                        case .project(let c, let i): ItemPageTab(model: model, doc: doc, type: "project", category: c, itemID: i, scope: scope).id(model.inspectorRevision)
                        case .original(let c, let i): ItemPageTab(model: model, doc: doc, type: "original", category: c, itemID: i, scope: scope).id(model.inspectorRevision)
                        default: PageFields(model: model, doc: doc, form: form, scope: scope)
                        }
                    case .section: sectionTab
                    case .card: cardTab
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, 40)
            }
        }
        .onChange(of: model.currentSection?.id, initial: true) { _, id in
            tab = id == nil ? .page : (tab == .page ? .section : tab)
            if tab == .card && !hasCards { tab = .section }
            card = 0
        }
    }

    // MARK: - Section

    @ViewBuilder private var sectionTab: some View {
        if let i = sectionIndex, section != nil {
            let base: [Any] = [key, i]
            SectionHeader(model: model, doc: doc, key: key, index: i, count: sections.count, type: sectionType)

            InspectorGroup(title: "Section") {
                JTextField(doc: doc, path: base + ["label"], label: "Label", placeholder: "Shown in the page’s contents")
                FieldRow(label: "Type") {
                    Picker("Type", selection: Binding(get: { sectionType }, set: { t in doc.set(base + ["type"], .string(t), name: "Change Section Type") })) {
                        ForEach(Self.types, id: \.0) { Text($0.1).tag($0.0) }
                    }
                    .labelsHidden().fixedSize()
                }
            }

            SectionTypeFields(model: model, doc: doc, base: base, type: sectionType, scope: scope,
                              images: imageEditor, hasMobileImages: form.assets?.mobileFolder != nil,
                              openCard: { b in card = b; tab = .card }, addCard: { addCard(base) }, detail: detail,
                              hasTabletImages: form.assets?.tabletFolder != nil)

            InspectorGroup(title: "Spacing") {
                let suffix = scope == .all ? "" : scope == .tablet ? "Tablet" : "Mobile"
                JLengthField(doc: doc, path: base + ["paddingTop\(suffix)"], label: "Top", placeholder: scope == .all ? "80px" : "Same")
                JLengthField(doc: doc, path: base + ["paddingBottom\(suffix)"], label: "Bottom", placeholder: scope == .all ? "80px" : "Same")
            }
            InspectorGroup(title: "Style") {
                JColorField(doc: doc, path: base + ["bgColor"], label: "Background")
                JToggle(doc: doc, path: base + ["hidden"], label: "Hide this section on the site")
            }
            InspectorGroup(title: "Advanced", defaultOpen: false) {
                JTextField(doc: doc, path: base + ["id"], label: "Anchor ID")
                Button("Open in Web Form") { model.editInWebForm() }
                    .help("This section in the web editor")
            }
        }
    }

    // MARK: - Card

    @ViewBuilder private var cardTab: some View {
        if let i = sectionIndex, hasCards {
            let blocks = section?["blocks"]?.array ?? []
            let b = min(card, max(blocks.count - 1, 0))
            let base: [Any] = [key, i, "blocks", b]
            HStack {
                Picker("Card", selection: Binding(get: { b }, set: { card = $0 })) {
                    ForEach(blocks.indices, id: \.self) { Text("Card \($0 + 1)").tag($0) }
                }
                .fixedSize()
                Spacer()
                Menu {
                    Button("Move Left") { moveCard(i, b, -1) }.disabled(b == 0)
                    Button("Move Right") { moveCard(i, b, 1) }.disabled(b >= blocks.count - 1)
                    Button("Duplicate") { duplicateCard(i, b) }
                    Divider()
                    Button("Delete Card", role: .destructive) { deleteCard(i, b) }.disabled(blocks.count <= 1)
                } label: { Image(systemName: "ellipsis.circle") }
                .menuStyle(.borderlessButton).fixedSize()
            }
            .padding(.horizontal, 16).padding(.bottom, 8)

            if blocks.isEmpty {
                Text("No cards yet.").foregroundStyle(.secondary).padding(16)
            } else {
                CardFields(doc: doc, base: base, sectionType: sectionType, iconList: section?["iconList"]?.bool == true, scope: scope,
                           images: imageEditor, hasMobileImages: form.assets?.mobileFolder != nil,
                           detail: detail, folder: form.assets?.folder, mobileFolder: form.assets?.mobileFolder,
                           hasTabletImages: form.assets?.tabletFolder != nil)
            }
        }
    }

    // MARK: - Card operations

    private static func newCard() -> JSONValue {
        .object([("_id", .string(String(UUID().uuidString.prefix(7)).lowercased())), ("images", .array([])), ("mobileImages", .array([])),
                 ("hoverImages", .array([])), ("title", .string("")), ("subtitle", .string("")), ("content", .string("")),
                 ("overlayTitle", .string("")), ("overlayContent", .string("")), ("titleSize", .string("")), ("subtitleSize", .string("")),
                 ("contentSize", .string("")), ("imgWidth", .string("medium")), ("imgTextAlign", .string("image"))])
    }

    private func addCard(_ base: [Any]) {
        let count = doc.root[path: base + ["blocks"]]?.array?.count ?? 0
        doc.edit("Add Card") { root in
            var blocks = root[path: base + ["blocks"]]?.array ?? []
            blocks.append(Self.newCard())
            root.set(path: base + ["blocks"], .array(blocks))
        }
        card = count
        tab = .card
    }

    private func editBlocks(_ i: Int, _ name: String, _ change: (inout [JSONValue]) -> Void) {
        doc.edit(name) { root in
            var blocks = root[path: [key, i, "blocks"]]?.array ?? []
            change(&blocks)
            root.set(path: [key, i, "blocks"], .array(blocks))
        }
    }
    private func moveCard(_ i: Int, _ b: Int, _ d: Int) { editBlocks(i, "Move Card") { $0.swapAt(b, b + d) }; card = b + d }
    private func duplicateCard(_ i: Int, _ b: Int) { editBlocks(i, "Duplicate Card") { $0.insert($0[b], at: b + 1) }; card = b + 1 }
    private func deleteCard(_ i: Int, _ b: Int) { editBlocks(i, "Delete Card") { $0.remove(at: b) }; card = max(0, b - 1) }

    private func imageEditor(_ path: [Any], _ label: String, _ mobile: Bool) -> AnyView {
        AnyView(images(path, label, mobile: mobile))
    }

    @ViewBuilder
    private func images(_ path: [Any], _ label: String, mobile: Bool) -> some View {
        let tablet = (path.last as? String) == "tabletImages"
        let desktopPath = Array(path.dropLast()) + ["images"]
        if let assets = form.assets, tablet, let folder = assets.tabletFolder, let endpoint = assets.tabletUpload {
            OverrideMapEditor(doc: doc, path: path, desktopPath: desktopPath, label: label, desktopFolder: assets.folder, folder: folder) { file in
                await model.uploadImage(file, to: endpoint)
            }
        } else if let assets = form.assets, let folder = mobile ? assets.mobileFolder : assets.folder,
                  let endpoint = mobile ? assets.mobileUpload : assets.upload {
            if case .object? = doc.root[path: path] {
                // Kept as a per-image map (desktop image → its phone version).
                OverrideMapEditor(doc: doc, path: path, desktopPath: desktopPath, label: label, desktopFolder: assets.folder, folder: folder) { file in
                    await model.uploadImage(file, to: endpoint)
                }
            } else {
                ImageListEditor(doc: doc, path: path, label: label, folder: folder) { file in
                    await model.uploadImage(file, to: endpoint)
                }
            }
        }
    }
}

/// The selected section's name and the section-level commands.
private struct SectionHeader: View {
    @ObservedObject var model: EditorModel
    @ObservedObject var doc: ContentDocument
    let key: String
    let index: Int
    let count: Int
    let type: String

    var body: some View {
        let section = doc.root[key]?[index]
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "square.stack")
                .foregroundStyle(Color.accentColor)
                .frame(width: 30, height: 30)
                .background(Corner.icon(30).fill(Color.accentColor.opacity(0.12)))
            VStack(alignment: .leading, spacing: 2) {
                Text(SiteIndex.typeNames[type] ?? type).font(.headline)
                Text("\(section?["label"]?.string ?? "Untitled") · section \(index + 1) of \(count)")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            ControlGroup {
                Button { model.moveSection(index, by: -1) } label: { Image(systemName: "arrow.up") }.disabled(index == 0).help("Move up")
                Button { model.moveSection(index, by: 1) } label: { Image(systemName: "arrow.down") }.disabled(index >= count - 1).help("Move down")
            }
            .fixedSize()
            Menu {
                Button("Duplicate") { model.duplicateSection(index) }
                Button(section?["hidden"]?.bool == true ? "Show on Site" : "Hide on Site") {
                    doc.set([key, index, "hidden"], section?["hidden"]?.bool == true ? nil : .bool(true), name: "Hide Section")
                }
                Divider()
                Menu("Add Section Below") {
                    ForEach(NativeInspector.addableTypes(on: model.form?.page), id: \.0) { t in
                        Button(t.1) { model.addSection(type: t.0, after: index) }
                    }
                }
                Divider()
                Button("Edit in Web Form") { model.editInWebForm() }
                Divider()
                Button("Delete Section", role: .destructive) { model.deleteSection(index) }
            } label: { Image(systemName: "ellipsis.circle") }
            .menuStyle(.borderlessButton).fixedSize()
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
    }
}

/// A project's or original's own fields: name, year, tags and visibility
/// (kept in src/data/projects.json / originals.json, saved through the
/// editor API), and its overview.
private struct ItemPageTab: View {
    @ObservedObject var model: EditorModel
    @ObservedObject var doc: ContentDocument
    let type: String            // project | original
    let category: String
    let itemID: String
    let scope: SizeScope

    @State private var title = ""
    @State private var year = ""
    @State private var tags = ""
    @State private var hidden = false
    @State private var loaded = false

    var body: some View {
        InspectorGroup(title: type == "project" ? "Project" : "Original") {
            FieldRow(label: "Name") {
                if type == "project" {
                    CommitTextField(placeholder: "Project name", value: title) { v in
                        title = v
                        model.setItemField(type, "title", category, itemID, ["title": v])
                    }
                    .textFieldStyle(.roundedBorder)
                        .help("A short name in {braces} is used under small icons")
                } else {
                    Text(title).foregroundStyle(.secondary)
                }
            }
            FieldRow(label: "Year") {
                CommitTextField(placeholder: "2024", value: year) { v in
                    year = v
                    model.setItemField(type, "year", category, itemID, ["year": v])
                }
                .textFieldStyle(.roundedBorder).frame(width: 90)
            }
            FieldRow(label: "Tags") {
                CommitTextField(placeholder: "Comma-separated", value: tags) { v in
                    tags = v
                    let list = v.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
                    model.setItemField(type, "tags", category, itemID, ["tags": list])
                }
                .textFieldStyle(.roundedBorder)
            }
            Toggle("Hide on the site", isOn: Binding(get: { hidden }, set: { v in
                hidden = v
                model.setItemField(type, "hidden", category, itemID, ["hidden": v])
            }))
            .toggleStyle(.checkbox)
        }
        .onAppear(perform: load)

        ItemImages(model: model, doc: doc, type: type, category: category, itemID: itemID)

        InspectorGroup(title: "Overview") {
            let styles: Set<TextStyleKey> = [.size, .weight, .italic]
            JStyledText(doc: doc, path: ["overviewTitle"], label: "Title", placeholder: "Defaults to the project name", scope: scope, styles: styles)
            JStyledText(doc: doc, path: ["overviewSubtitle"], label: "Subtitle", rich: true, scope: scope, styles: styles)
            JStyledText(doc: doc, path: ["overview"], label: "Overview", rich: true, scope: scope, styles: styles)
            JNumberField(doc: doc, path: ["overviewTitleGap\(scope == .all ? "" : scope == .tablet ? "Tablet" : "Mobile")"], label: "Title gap",
                         placeholder: scope == .all ? "Default" : "Same", unit: "px")
            JLengthField(doc: doc, path: ["overviewMaxWidth"], label: "Text width", placeholder: "Default")
            if type == "project" {
                ImagePathSlot(model: model, doc: doc, path: ["overviewLogo"], label: "Logo instead of the title",
                              target: "/assets/projects/\(category)/\(itemID)/overview-logo", optional: true)
                if doc.root["overviewLogo"]?.string?.isEmpty == false {
                    JLengthField(doc: doc, path: ["overviewLogoHeight"], label: "Logo height", placeholder: "40px")
                }
            }
        }

        InspectorGroup(title: "Details") {
            let fields = doc.root["metaFields"]?.array ?? []
            if fields.isEmpty {
                // Pages without a metaFields list show fixed details.
                ForEach(type == "original" ? ["type", "role", "duration", "team"] : ["team", "duration", "role"], id: \.self) { key in
                    HStack(spacing: 6) {
                        Text(key.capitalized).font(.callout).foregroundStyle(.secondary).frame(width: 92, alignment: .leading)
                        CommitTextField(placeholder: key.capitalized, value: doc.root[key]?.string ?? "") {
                            doc.set([key], $0.isEmpty ? nil : .string($0), name: "Edit \(key)")
                        }
                        .textFieldStyle(.roundedBorder)
                        TextStyleButton(doc: doc, parent: [], prefix: key, scope: scope, styles: [.size, .weight, .italic])
                    }
                }
            }
            ForEach(Array(fields.enumerated()), id: \.offset) { i, f in
                let key = f["key"]?.string ?? ""
                HStack(spacing: 6) {
                    CommitTextField(placeholder: "Label", value: f["label"]?.string ?? "") {
                        doc.set(["metaFields", i, "label"], .string($0), name: "Edit Label")
                    }
                    .textFieldStyle(.roundedBorder).frame(width: 92)
                    CommitTextField(placeholder: key.capitalized, value: doc.root[key]?.string ?? "") {
                        doc.set([key], $0.isEmpty ? nil : .string($0), name: "Edit \(key)")
                    }
                    .textFieldStyle(.roundedBorder)
                    if !key.isEmpty { TextStyleButton(doc: doc, parent: [], prefix: key, scope: scope, styles: [.size, .weight, .italic]) }
                    Button {
                        doc.set(["metaFields", i, "hidden"], f["hidden"]?.bool == true ? nil : .bool(true), name: "Toggle Detail")
                    } label: { Image(systemName: f["hidden"]?.bool == true ? "eye.slash" : "eye") }
                    .buttonStyle(.borderless)
                    .help(f["hidden"]?.bool == true ? "Hidden on the site" : "Shown on the site")
                }
            }
            HStack {
                Text("Labels").font(.callout).foregroundStyle(.secondary)
                TextStyleButton(doc: doc, parent: [], prefix: "metaLabel", scope: scope, styles: [.size, .weight])
            }
        }

        InspectorGroup(title: "Contents bar & colors", defaultOpen: false) {
            JStyledText(doc: doc, path: ["navLabel"], label: "Nav label", placeholder: "The project’s name", scope: scope, styles: [.size, .weight, .italic])
            FieldRow(label: "Contents bar") {
                Picker("Contents bar", selection: Binding(
                    get: { doc.root["toc"]?.bool.map { $0 ? "on" : "off" } ?? "" },
                    set: { doc.set(["toc"], $0.isEmpty ? nil : .bool($0 == "on"), name: "Contents Bar") })) {
                    Text("Site setting").tag("")
                    Text("Show").tag("on")
                    Text("Hide").tag("off")
                }
                .labelsHidden().fixedSize()
            }
            JToggle(doc: doc, path: ["darkNav"], label: "Dark navbar on this page")
            JColorField(doc: doc, path: ["overviewBgColor"], label: "Overview bg")
            JColorField(doc: doc, path: ["overviewTextColor"], label: "Overview text")
            JColorField(doc: doc, path: ["navBgColor"], label: "Contents bar")
            JColorField(doc: doc, path: ["navBottomBgColor"], label: "Sub-bar")
            JColorField(doc: doc, path: ["navBehindBgColor"], label: "Behind the bar")
        }

        InspectorGroup(title: "Footnote", defaultOpen: doc.root["footnoteLines"] != nil) {
            LinesEditor(doc: doc, path: ["footnoteLines"], legacyPath: ["footnoteLegacy"], scope: scope)
            JColorField(doc: doc, path: ["footnoteBgColor"], label: "Background")
        }

        InspectorGroup(title: "Page", defaultOpen: doc.root["maintenance"]?.bool == true) {
            JPicker(doc: doc, path: ["tabletImageMode"], label: "Tablets use", options: [("", "Phone images"), ("desktop", "Desktop images")])
            PageMaintenanceToggle(doc: doc)
            Button("Open in Web Form") { model.editInWebForm() }
                .controlSize(.small)
                .help("This page in the web editor")
        }
    }

    private func load() {
        guard !loaded, let entry = model.listEntry(type, category, itemID) else { return }
        loaded = true
        title = entry["title"] as? String ?? ""
        year = (entry["year"] as? String) ?? (entry["year"] as? Int).map(String.init) ?? ""
        tags = (entry["tags"] as? [String] ?? []).joined(separator: ", ")
        hidden = model.index.node("\(type):\(category)/\(itemID)")?.hidden ?? false
    }
}
