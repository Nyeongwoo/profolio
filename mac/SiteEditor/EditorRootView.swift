import SwiftUI

/// The editor window: pages and sections on the left, the live page in the
/// middle, the selected page's form in the inspector on the right.
struct EditorRootView: View {
    @ObservedObject var model: EditorModel
    @State private var showInspector = true
    /// The inspector's place shows the Assistant instead (⌘J).
    @AppStorage("showAssistant") private var showAssistant = false

    var body: some View {
        NavigationSplitView {
            Sidebar(model: model)
                .navigationSplitViewColumnWidth(min: 220, ideal: 260, max: 360)
        } detail: {
            Group {
                if model.labSlug != nil {
                    LabPreviewArea(model: model, lab: model.lab)
                } else {
                    PreviewArea(model: model)
                }
            }
            .inspector(isPresented: $showInspector) {
                Group {
                    if model.labSlug != nil {
                        LabChat(lab: model.lab)
                    } else if showAssistant {
                        AssistantChat(lab: model.lab, pageID: model.currentNode?.id, pageTitle: model.currentNode?.title)
                    } else {
                        InspectorArea(model: model)
                    }
                }
                .inspectorColumnWidth(min: 380, ideal: 480, max: 760)
            }
        }
        .navigationTitle(model.currentNode?.title ?? model.labSlug ?? "")
        .navigationSubtitle(breadcrumb)
        .toolbar { toolbar }
        .overlay {
            if model.showGoTo {
                GoToPalette(model: model)
            }
        }
        .sheet(isPresented: $model.showPublish) {
            PublishSheet(model: model)
        }
        .sheet(isPresented: $model.showUpdateSite) {
            UpdateSiteSheet(model: model)
        }
        .sheet(isPresented: $model.showCodingAgents) {
            CodingAgentsSheet(model: model)
        }
        .sheet(isPresented: $model.showDomain) {
            DomainSheet(model: model)
        }
        .sheet(isPresented: $model.showTutorial) {
            let repo = model.document.manifest?.repository
            TutorialView(prompt: CodingAgent.handoffPrompt(owner: repo?.owner, repo: repo?.name, branch: repo?.branch)) {
                // After the tour's sheet has gone.
                DispatchQueue.main.async { model.showCodingAgents = true }
            }
        }
        .sheet(item: $model.newItem) { req in
            NewItemSheet(model: model, kind: req.kind, category: req.category)
        }
    }

    private var breadcrumb: String {
        guard let node = model.currentNode else { return "" }
        var parts: [String] = []
        if let group = model.index.tree.first(where: { g in g.children?.contains { $0.id == node.id || $0.children?.contains { $0.id == node.id } == true } == true }) {
            parts.append(group.title)
        }
        if let sub = node.subtitle, node.kind == .item || node.kind == .category { parts.append(sub) }
        if let section = model.currentSection { parts.append(section.label) }
        return parts.joined(separator: " › ")
    }

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .navigation) {
            Button { model.showGoTo = true } label: { Label("Go to", systemImage: "magnifyingglass") }
                .help("Go to a page, section or text (⌘K)")
        }
        ToolbarItemGroup(placement: .principal) {
            Picker("Preview size", selection: $model.device) {
                ForEach(EditorModel.Device.allCases) { d in
                    Label(d.label, systemImage: d.symbol).tag(d)
                }
            }
            .pickerStyle(.segmented)
            .help("Preview size")

            // Once the site has more than English (Site Structure ▸ Languages).
            if model.languages.count > 1 {
                Picker("Language", selection: Binding(get: { model.language }, set: { model.setLanguage($0) })) {
                    ForEach(model.languages, id: \.0) { code, label in Text(label).tag(code) }
                }
                .pickerStyle(.segmented)
                .help("Edit and preview this language")
            }
        }
        // A status, not a button group member: on its own, without the glass
        // capsule the buttons share (inside it, the text ran into its edge).
        if #available(macOS 26, *) {
            ToolbarItem(placement: .primaryAction) { ChangesStatus(model: model) }
                .sharedBackgroundVisibility(.hidden)
        } else {
            ToolbarItem(placement: .primaryAction) { ChangesStatus(model: model) }
        }
        ToolbarItemGroup(placement: .primaryAction) {
            Button { Task { await model.openLiveSite() } } label: {
                Label("Live Site", systemImage: "safari")
            }
            .help("Open this page on the published site (⌥⌘L) — the preview here shows this Mac’s copy")
            Button { NSApp.sendAction(#selector(EditorWindowController.showBackups(_:)), to: nil, from: nil) } label: {
                Label("Backups", systemImage: "clock.arrow.circlepath")
            }
            .help("Backups (⇧⌘B)")
            Button { model.showPublish = true } label: {
                Label("Publish", systemImage: "arrow.up.circle")
            }
            .buttonStyle(.borderedProminent)
            .help("Publish to the site (⇧⌘P)")
            Button {
                showAssistant.toggle()
                showInspector = true
            } label: {
                Label("Assistant", systemImage: showAssistant ? "sparkles.rectangle.stack.fill" : "sparkles")
            }
            .keyboardShortcut("j", modifiers: .command)
            .help(showAssistant ? "Back to the inspector (⌘J)" : "Ask the Assistant about Profolio or your site (⌘J)")
            Button { showInspector.toggle() } label: { Label("Inspector", systemImage: "sidebar.right") }
                .help("Show or hide the inspector")
        }
    }
}

private struct ChangesStatus: View {
    @ObservedObject var model: EditorModel

    var body: some View {
        let count = (model.changes?.upload.count ?? 0) + (model.changes?.delete.count ?? 0)
        Button { model.showPublish = true } label: {
            HStack(spacing: 6) {
                if count > 0 {
                    Circle().fill(Color.orange).frame(width: 6, height: 6)
                }
                Text(model.changes == nil ? "Checking…" : count == 0 ? "Published" : "\(count) unpublished change\(count == 1 ? "" : "s")")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
            .padding(.horizontal, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .fixedSize()
        .disabled(count == 0)
        .help(count == 0 ? "Everything is published" : "See and publish the changes (⇧⌘P)")
    }
}

// MARK: - Sidebar

private struct Sidebar: View {
    @ObservedObject var model: EditorModel
    @State private var expanded: Set<String> = ["projects", "pages"]

    var body: some View {
        List(selection: Binding(get: { model.selection }, set: { model.open($0) })) {
            ForEach(model.index.tree) { group in
                Section {
                    ForEach(group.children ?? []) { node in
                        NodeRows(node: node, model: model, expanded: $expanded)
                    }
                } header: {
                    HStack {
                        Text(group.title)
                        Spacer()
                        if let kind = Self.newKind[group.id] {
                            Button { model.requestNewItem(kind, category: "") } label: { Image(systemName: "plus") }
                                .buttonStyle(.borderless)
                                // In line with the rows' counts, not against the edge.
                                .padding(.trailing, 10)
                                .help("New \(kind.rawValue.lowercased())")
                        }
                    }
                }
            }
            LabSidebarSection(model: model, lab: model.lab)
        }
        .listStyle(.sidebar)
        .onChange(of: model.selection, initial: true) { revealSelection() }
    }

    private static let newKind: [String: NewItemSheet.Kind] = ["pages": .page, "projects": .project, "originals": .original, "blog": .post]

    /// Keeps the selected page's folders (and the page) open.
    private func revealSelection() {
        guard let node = model.currentNode else { return }
        for group in model.index.tree {
            for child in group.children ?? [] where child.children?.contains(where: { $0.id == node.id }) == true {
                expanded.insert(child.id)
            }
        }
        if !node.sections.isEmpty { expanded.insert(node.id) }
    }
}

private struct NodeRows: View {
    let node: SiteIndex.Node
    @ObservedObject var model: EditorModel
    @Binding var expanded: Set<String>

    var body: some View {
        if let children = node.children {
            DisclosureGroup(isExpanded: binding(node.id)) {
                ForEach(children) { child in NodeRows(node: child, model: model, expanded: $expanded) }
            } label: {
                HStack {
                    Label(node.title, systemImage: "folder")
                    Spacer()
                    if let count = node.subtitle { Text(count).foregroundStyle(.secondary).font(.caption) }
                }
                .contextMenu { categoryMenu }
            }
        } else if !node.sections.isEmpty {
            DisclosureGroup(isExpanded: binding(node.id)) {
                ForEach(node.sections) { section in
                    SectionRow(section: section).tag(section.id)
                        .contextMenu { SectionMenu(model: model, section: section) }
                }
            } label: {
                row.tag(node.id)
            }
        } else {
            row.tag(node.id)
        }
    }

    /// projects-group:product → ("projects", "product")
    private var category: (type: String, name: String)? {
        for type in ["projects", "originals"] where node.id.hasPrefix("\(type)-group:") {
            return (type, String(node.id.dropFirst("\(type)-group:".count)))
        }
        return nil
    }

    @ViewBuilder private var categoryMenu: some View {
        if let c = category {
            Button("New \(c.type == "projects" ? "Project" : "Original") in “\(c.name.capitalized)”…") {
                model.requestNewItem(c.type == "projects" ? .project : .original, category: c.name)
            }
            Divider()
            Button("Rename Category…") { model.renameCategory(c.type, c.name) }
            Button("Delete Category…", role: .destructive) { model.deleteCategory(c.type, c.name) }
        }
    }

    @ViewBuilder private var itemMenu: some View {
        let kind = node.id.split(separator: ":").first.map(String.init) ?? ""
        let type = kind == "project" ? "projects" : kind == "original" ? "originals" : nil
        if kind == "project" || kind == "post" {
            Button("Rename…") { model.renameItem(node) }
        }
        if kind == "project" || kind == "original" {
            Button(node.hidden ? "Show on Site" : "Hide on Site") { model.setItemHidden(node, !node.hidden) }
        }
        if let type {
            Menu("Move to Category") {
                ForEach(model.categories(type), id: \.self) { cat in
                    Button(cat.capitalized) { model.moveItem(node, to: cat) }
                        .disabled(cat == node.subtitle?.lowercased())
                }
            }
            let other = type == "projects" ? "originals" : "projects"
            if model.hasPart(other) { Menu("Move to \(other.capitalized)") {
                let cats = model.categories(other)
                ForEach(cats, id: \.self) { cat in
                    Button(cat.capitalized) { model.moveItem(node, toOtherSide: cat) }
                }
                if cats.isEmpty { Text("Make a category in \(other.capitalized) first") }
            } }
        }
        if let path = node.previewPath {
            Divider()
            Button("Open on Live Site") { Task { await model.openLiveSite(path: path) } }
        }
        if kind == "project" || kind == "post" || kind == "page" {
            Divider()
            Button("Delete “\(node.title)”…", role: .destructive) { model.deleteItem(node) }
        }
    }

    private var row: some View {
        HStack(spacing: 6) {
            Label(node.title, systemImage: node.symbol)
                .opacity(node.hidden ? 0.5 : 1)
            Spacer()
            if node.hidden {
                Image(systemName: "eye.slash").foregroundStyle(.tertiary).font(.caption).help("Hidden on the site")
            }
            if model.language != "en", let todo = node.contentPath.flatMap({ model.translationTodo[$0] }), todo > 0,
               node.contentPath != "src/data/siteConfig.json" {
                Text("\(todo)").font(.caption2.weight(.semibold)).monospacedDigit()
                    .padding(.horizontal, 5).padding(.vertical, 1)
                    .background(Capsule().fill(Color.orange.opacity(0.2)))
                    .help("\(todo) not translated yet")
            } else if model.changedNodes.contains(node.id) {
                Circle().fill(Color.accentColor).frame(width: 6, height: 6).help("Unpublished changes")
            }
        }
        .contextMenu { itemMenu }
    }

    private func binding(_ id: String) -> Binding<Bool> {
        Binding(get: { expanded.contains(id) }, set: { if $0 { expanded.insert(id) } else { expanded.remove(id) } })
    }
}

/// Right-click on a section in the sidebar: what the inspector's section
/// menu does, for the page being edited.
private struct SectionMenu: View {
    @ObservedObject var model: EditorModel
    let section: SiteIndex.Section

    var body: some View {
        if model.isEditing(section) {
            let i = section.index
            Button(section.hidden ? "Show on Site" : "Hide on Site") { model.toggleSectionHidden(i) }
            Button("Duplicate") { model.duplicateSection(i) }
            Divider()
            Button("Move Up") { model.moveSection(i, by: -1) }.disabled(i == 0)
            Button("Move Down") { model.moveSection(i, by: 1) }.disabled(i >= model.sectionCount() - 1)
            Divider()
            Button("Delete Section…", role: .destructive) { model.deleteSection(i) }
        } else {
            Button("Open") { model.open(section.id) }
        }
    }
}

private struct SectionRow: View {
    let section: SiteIndex.Section

    var body: some View {
        HStack(spacing: 6) {
            Text(section.label).lineLimit(1)
            Text(section.typeName).foregroundStyle(.secondary).lineLimit(1)
            Spacer()
            if section.hidden { Image(systemName: "eye.slash").foregroundStyle(.tertiary).font(.caption) }
        }
        .font(.callout)
        .opacity(section.hidden ? 0.55 : 1)
    }
}

// MARK: - Preview

private struct PreviewArea: View {
    @ObservedObject var model: EditorModel

    var body: some View {
        GeometryReader { geo in
            let size = model.device.size
            let scale = min(1, (geo.size.width - 40) / size.width)
            VStack(spacing: 0) {
                WebViewHost(webView: model.preview.webView, pageZoom: scale)
                    .frame(width: size.width * scale)
                    .frame(maxHeight: model.device == .desktop ? .infinity : min(geo.size.height - 20, size.height * scale))
                    .clipShape(UnevenRoundedRectangle(topLeadingRadius: Corner.group, topTrailingRadius: Corner.group, style: .continuous))
                    .shadow(color: .black.opacity(0.08), radius: 8, y: 2)
                if model.device != .desktop { Spacer(minLength: 0) }
            }
            .padding(.top, 20)
            .frame(width: geo.size.width, height: geo.size.height)
            .overlay(alignment: .bottom) {
                Text("\(Int(size.width)) × \(Int(size.height))  ·  \(Int((scale * 100).rounded()))%  ·  Click a section to select it")
                    .font(.caption)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(Capsule().fill(.black.opacity(0.75)))
                    .padding(.bottom, 12)
                    .allowsHitTesting(false)
            }
        }
        .background(Color(nsColor: .underPageBackgroundColor))
    }
}

// MARK: - Inspector

private struct InspectorArea: View {
    @ObservedObject var model: EditorModel

    var body: some View {
        if let node = model.currentNode, !model.webForm, node.id == "translations" {
            TranslationsOverview(model: model)
        } else if let node = model.currentNode, !model.webForm, model.language != "en" {
            if let source = node.contentPath {
                TranslationInspector(model: model, sourceID: source, title: node.title).id("\(node.id)|\(model.language)")
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Text("\(node.title) has no text of its own.").font(.headline)
                    Text("Its words come from the interface text and site settings — open Site settings ▸ Translations.")
                        .font(.callout).foregroundStyle(.secondary)
                }
                .padding(16).frame(maxWidth: .infinity, alignment: .topLeading)
            }
        } else if model.usesNativeForm, let doc = model.content, let form = model.form, let node = model.currentNode {
            NativeInspector(model: model, doc: doc, form: form)
                .id(node.id)
        } else {
            webInspector
        }
    }

    private var webInspector: some View {
        VStack(spacing: 0) {
            if model.webForm {
                HStack {
                    Text("Showing the web form.").font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    Button(model.language == "en" ? "Back to Native Form" : "Back to Translate") { model.useNativeForm() }.controlSize(.small)
                }
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(Color.accentColor.opacity(0.08))
            }
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: model.currentSection == nil ? (model.currentNode?.symbol ?? "doc") : "square.stack")
                    .font(.system(size: 15))
                    .foregroundStyle(Color.accentColor)
                    .frame(width: 30, height: 30)
                    .background(Corner.icon(30).fill(Color.accentColor.opacity(0.12)))
                VStack(alignment: .leading, spacing: 2) {
                    if let section = model.currentSection {
                        Text(section.typeName).font(.headline)
                        Text("\(section.label) · section \(section.index + 1) of \(model.currentNode?.sections.count ?? 0)")
                            .font(.caption).foregroundStyle(.secondary)
                    } else {
                        Text(model.currentNode?.title ?? "").font(.headline)
                        Text(model.currentNode?.sections.isEmpty == false ? "\(model.currentNode!.sections.count) sections" : "Page settings")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                Spacer()
            }
            .padding(12)
            Divider()
            WebViewHost(webView: model.inspector.webView)
        }
    }
}
