import AppKit
import SwiftUI

/// State of one editor window: what's selected, how it's previewed, and what
/// hasn't been published yet.
@MainActor
final class EditorModel: ObservableObject {
    enum Device: String, CaseIterable, Identifiable {
        case desktop, tablet, mobile
        var id: String { rawValue }
        /// Viewport the preview lays the page out at (matches the web
        /// editor's presets).
        var size: CGSize {
            switch self {
            case .desktop: CGSize(width: 1440, height: 810)
            case .tablet: CGSize(width: 820, height: 1180)
            case .mobile: CGSize(width: 390, height: 844)
            }
        }
        var label: String { rawValue.capitalized }
        var symbol: String {
            switch self {
            case .desktop: "desktopcomputer"
            case .tablet: "ipad"
            case .mobile: "iphone"
            }
        }
    }

    static let languages = [("en", "EN"), ("ko", "KO"), ("zh", "ZH")]

    let document: SiteDocument
    let preview: PreviewPane
    let inspector: InspectorPane
    /// The sidebar's Lab: the site's interactive pieces (public/lab).
    let lab: LabModel

    @Published private(set) var index = SiteIndex()
    /// A node id, or a section id ("<node>#<index>").
    @Published private(set) var selection: String?
    @Published var device: Device = .desktop { didSet { UserDefaults.standard.set(device.rawValue, forKey: "previewDevice") } }
    @Published private(set) var language = "en"
    @Published var showGoTo = false
    /// File ▸ New… — what to make, prefilled.
    @Published var newItem: NewItemRequest?
    struct NewItemRequest: Identifiable {
        let id = UUID()
        var kind: NewItemSheet.Kind
        var category: String
    }
    @Published var showPublish = false
    /// Bumped when an item's name or visibility changes outside its form
    /// (the sidebar), so the form reads it again.
    @Published var inspectorRevision = 0
    @Published private(set) var changes: Changes?
    @Published private(set) var changedNodes: Set<String> = []
    /// The page being edited natively (in English), if any, and how.
    @Published private(set) var content: ContentDocument?
    @Published private(set) var form: NativeForm?
    /// Per /api/i18n source (content file): strings not yet translated into
    /// the toolbar's language (KO / ZH only).
    @Published private(set) var translationTodo: [String: Int] = [:]
    private var translationTask: Task<Void, Never>?
    /// The viewer chose the web form for this page (Edit in Web Form).
    @Published private(set) var webForm = false

    /// Whether the inspector shows the native form (else the web form).
    var usesNativeForm: Bool { content != nil && !webForm }
    private var pendingLiveDoc: JSONValue?

    private var pendingScroll = false
    private var observer: NSObjectProtocol?
    private var changesTask: Task<Void, Never>?
    private var texts: [SiteIndex.TextHit]?

    init(document: SiteDocument) {
        self.document = document
        preview = PreviewPane(document: document)
        inspector = InspectorPane(document: document)
        lab = LabModel(document: document)
        device = Device(rawValue: UserDefaults.standard.string(forKey: "previewDevice") ?? "") ?? .desktop

        preview.onLoad = { [weak self] in self?.showSectionsInPreview() }
        preview.onPickSection = { [weak self] anchor in self?.pickSection(anchor: anchor) }
        preview.onNavigate = { [weak self] path in self?.previewNavigated(to: path) }

        observer = NotificationCenter.default.addObserver(forName: EditorAPI.contentChanged, object: document.api, queue: .main) { [weak self] note in
            let paths = note.userInfo?["paths"] as? Set<String> ?? []
            MainActor.assumeIsolated { self?.contentChanged(paths) }
        }

        #if DEBUG
        // SITEEDITOR_DEBUG_EDIT='{"path":["overviewTitle"],"value":"X"}' edits
        // the native form's page 3 s after launch, as typing would.
        if let json = ProcessInfo.processInfo.environment["SITEEDITOR_DEBUG_EDIT"],
           let spec = try? JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any],
           let path = spec["path"] as? [Any], let value = spec["value"] as? String {
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
                self?.content?.set(path, .string(value), name: "Debug Edit")
            }
        }
        #endif

        lab.editor = self
        reloadIndex()
        let start = UserDefaults.standard.string(forKey: selectionKey).flatMap { index.node(Self.nodeID(of: $0)) != nil ? $0 : nil } ?? "home"
        apply(start)
        refreshChanges()
    }

    deinit {
        if let observer { NotificationCenter.default.removeObserver(observer) }
    }

    private var selectionKey: String { "selection:\(document.packageURL?.path ?? "")" }

    // MARK: - Selection

    static func nodeID(of selection: String) -> String {
        selection.split(separator: "#", maxSplits: 1).first.map(String.init) ?? selection
    }

    var currentNode: SiteIndex.Node? { selection.flatMap { index.node(Self.nodeID(of: $0)) } }

    /// The lab piece open, when the selection is one ("lab:<slug>").
    var labSlug: String? { selection.flatMap { $0.hasPrefix("lab:") ? String($0.dropFirst(4)) : nil } }

    var currentSection: SiteIndex.Section? {
        guard let selection, let hash = selection.firstIndex(of: "#"), let i = Int(selection[selection.index(after: hash)...]),
              let node = currentNode, node.sections.indices.contains(i) else { return nil }
        return node.sections[i]
    }

    /// Opens a page or section, asking first if the form has unsaved edits.
    func open(_ id: String?) {
        if let id, id.hasPrefix("lab:"), id != selection {
            Task {
                guard await confirmLeavingForm() else { return }
                flushEdits()
                selection = id
                lab.select(String(id.dropFirst(4)))
            }
            return
        }
        guard let id, id != selection, let target = index.node(Self.nodeID(of: id)), target.editorPath != nil else { return }
        if target.id == currentNode?.id {
            apply(id)
            return
        }
        Task {
            guard await confirmLeavingForm() else { return }
            apply(id)
        }
    }

    private func apply(_ id: String) {
        guard let node = index.node(Self.nodeID(of: id)) else { return }
        let samePage = node.id == currentNode?.id
        selection = id
        UserDefaults.standard.set(id, forKey: selectionKey)
        let section = currentSection

        if !samePage {
            flushEdits()
            (form, content) = makeContent(for: node)
            webForm = false
            pendingScroll = section != nil
            // Already there (the viewer followed a link in the preview).
            if let path = node.previewPath, !preview.load(path: path, language: language) { showSectionsInPreview() }
            if !usesNativeForm, let path = node.editorPath { inspector.load(editorPath: path) }
            if let section, !usesNativeForm { selectInForm(section.index, afterLoad: true) }
        } else {
            preview.show(anchors: node.sections.map(\.anchor), selected: section?.anchor, scroll: section != nil)
            if let section, !usesNativeForm { selectInForm(section.index, afterLoad: false) }
        }
    }

    private func selectInForm(_ index: Int, afterLoad: Bool) {
        guard afterLoad else { return inspector.selectSection(index) }
        // The form renders after its data arrives; ask again once it has.
        for delay in [0.8, 2.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                guard self?.currentSection?.index == index else { return }
                self?.inspector.selectSection(index)
            }
        }
    }

    private func showSectionsInPreview() {
        guard let node = currentNode else { return }
        preview.show(anchors: node.sections.map(\.anchor), selected: currentSection?.anchor, scroll: pendingScroll)
        pendingScroll = false
    }

    private func pickSection(anchor: String) {
        guard let node = currentNode, let section = node.sections.first(where: { $0.anchor == anchor }) else { return }
        selection = section.id
        UserDefaults.standard.set(section.id, forKey: selectionKey)
        if !usesNativeForm { inspector.selectSection(section.index) }
    }

    private func previewNavigated(to path: String) {
        var p = path
        for (code, _) in Self.languages where code != "en" {
            if p == "/\(code)" { p = "/" } else if p.hasPrefix("/\(code)/") { p = String(p.dropFirst(code.count + 1)) }
        }
        guard let node = index.node(forPreviewPath: p), node.id != currentNode?.id else { return }
        open(node.id)
    }

    private func confirmLeavingForm() async -> Bool {
        if usesNativeForm { flushEdits(); return true }
        guard await inspector.hasUnsavedEdits() else { return true }
        let alert = NSAlert()
        alert.messageText = "Save changes to \(currentNode?.title ?? "this page")?"
        alert.informativeText = "Your edits will be lost if you don't save them."
        alert.addButton(withTitle: "Save")
        alert.addButton(withTitle: "Don't Save")
        alert.addButton(withTitle: "Cancel")
        switch alert.runModal() {
        case .alertFirstButtonReturn:
            inspector.save()
            try? await Task.sleep(nanoseconds: 600_000_000)  // let the save reach the package
            return true
        case .alertSecondButtonReturn:
            return true
        default:
            return false
        }
    }

    // MARK: - Preview settings

    func setLanguage(_ code: String) {
        guard code != language else { return }
        language = code
        if let path = currentNode?.previewPath { preview.load(path: path, language: code) }
        inspector.setLanguage(code)
        flushEdits()
        if webForm { useNativeForm() }
        refreshTranslationStatus()
    }

    /// Recounts what's left to translate (Translate's sidebar counts).
    func refreshTranslationStatus() {
        translationTask?.cancel()
        guard language != "en" else { translationTodo = [:]; return }
        let lang = language
        translationTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard let self, !Task.isCancelled else { return }
            let r = await self.callAPI("GET", "/api/i18n/status")
            guard !Task.isCancelled, lang == self.language else { return }
            var todo: [String: Int] = [:]
            for s in (r.json as? [String: Any])?["sources"] as? [[String: Any]] ?? [] {
                guard let id = s["id"] as? String, let total = s["total"] as? Int else { continue }
                todo[id] = total - ((s["done"] as? [String: Int])?[lang] ?? 0)
            }
            self.translationTodo = todo
        }
    }

    /// The web editor's Translations page (per-language images).
    func openWebTranslations() {
        flushEdits()
        webForm = true
        inspector.load(editorPath: "/editor/translations")
    }

    // MARK: - Content

    func save() {
        if usesNativeForm { flushEdits() } else { inspector.save() }
    }

    /// Writes the native form's pending edits now.
    func flushEdits() {
        // A field being typed in hands over its text when it loses focus.
        if let window = NSApp.keyWindow, window.firstResponder is NSText || window.firstResponder is NSTextView {
            window.makeFirstResponder(nil)
        }
        content?.saveNow()
        sideDocs.values.forEach { $0.saveNow() }
    }

    /// Other content files a page's form edits besides its own (a post's
    /// entry in blog.json, a category's hero sizes in siteConfig.json),
    /// opened once and kept; the page's own document when it's that file.
    private var sideDocs: [String: ContentDocument] = [:]

    func sideDocument(_ path: String) -> ContentDocument? {
        if let content, content.path == path { return content }
        if let doc = sideDocs[path] { return doc }
        guard let package = document.packageURL, let doc = ContentDocument(package: package, path: path) else { return nil }
        doc.onSaved = { [weak self] in
            guard let self else { return }
            self.refreshChanges()
            self.reloadIndex()
            self.preview.reloadKeepingScroll()
        }
        sideDocs[path] = doc
        return doc
    }

    /// Changes written through the editor API (the web form, uploads, the
    /// project list): pick them up everywhere.
    private func contentChanged(_ paths: Set<String>) {
        if let content, paths.contains("site/\(content.path)") { content.reloadIfChangedElsewhere() }
        for (path, doc) in sideDocs where paths.isEmpty || paths.contains("site/\(path)") { doc.reloadIfChangedElsewhere() }
        reloadIndex()
        if let content { index.replaceSections(of: currentNode?.id ?? "", with: content.root) }
        preview.reloadKeepingScroll()
        texts = nil
        refreshChanges()
        if paths.contains(where: { $0.hasPrefix("site/src/i18n/") }) || language != "en" { refreshTranslationStatus() }
    }

    // MARK: - Live site

    /// The published site's address: manifest.json's siteURL, else the
    /// GitHub repository's Website field, else asked once and remembered.
    private func liveSiteAddress() async -> URL? {
        guard let package = document.packageURL else { return nil }
        let manifestURL = package.appendingPathComponent("manifest.json")
        let manifest = (try? JSONSerialization.jsonObject(with: Data(contentsOf: manifestURL))) as? [String: Any] ?? [:]
        if let saved = (manifest["siteURL"] as? String).flatMap(Self.siteURL) { return saved }
        if let token = GitHubAccount.shared.token, let repo = document.manifest?.repository,
           let found = try? await GitHubClient(token: token, owner: repo.owner, repo: repo.name).homepage(),
           let url = Self.siteURL(found) {
            saveLiveSiteAddress(url)
            return url
        }
        return askLiveSiteAddress()
    }

    /// Opens the page the preview is showing on the published site.
    /// `path`: a site path to open instead (in the language being edited).
    func openLiveSite(path given: String? = nil) async {
        guard let base = await liveSiteAddress() else { return }
        var path = given.map { language == "en" ? $0 : "/\(language)\($0 == "/" ? "" : $0)" } ?? preview.webView.url?.path ?? "/"
        if path.isEmpty { path = "/" }
        let target = URL(string: base.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + path) ?? base
        NSWorkspace.shared.open(target)
    }

    /// Asks for the published site's address and remembers it.
    @discardableResult
    func askLiveSiteAddress() -> URL? {
        let alert = NSAlert()
        alert.messageText = "Where is this site published?"
        alert.informativeText = "Its address on the web, such as https://example.com or the one Vercel gave it."
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 300, height: 24))
        field.placeholderString = "https://example.com"
        if let package = document.packageURL,
           let manifest = (try? JSONSerialization.jsonObject(with: Data(contentsOf: package.appendingPathComponent("manifest.json")))) as? [String: Any] {
            field.stringValue = manifest["siteURL"] as? String ?? ""
        }
        alert.accessoryView = field
        alert.addButton(withTitle: "Save")
        alert.addButton(withTitle: "Cancel")
        alert.window.initialFirstResponder = field
        guard alert.runModal() == .alertFirstButtonReturn, let url = Self.siteURL(field.stringValue) else { return nil }
        saveLiveSiteAddress(url)
        return url
    }

    private func saveLiveSiteAddress(_ url: URL) {
        guard let package = document.packageURL else { return }
        let manifestURL = package.appendingPathComponent("manifest.json")
        guard var manifest = (try? JSONSerialization.jsonObject(with: Data(contentsOf: manifestURL))) as? [String: Any] else { return }
        manifest["siteURL"] = url.absoluteString
        try? writeJSON(manifest, to: manifestURL)
    }

    /// "nnwoo.com" or "https://nnwoo.com/" → https://nnwoo.com
    private static func siteURL(_ text: String) -> URL? {
        var s = text.trimmingCharacters(in: .whitespaces)
        guard !s.isEmpty else { return nil }
        if !s.contains("://") { s = "https://" + s }
        while s.hasSuffix("/") { s.removeLast() }
        guard let url = URL(string: s), url.scheme?.hasPrefix("http") == true, url.host?.contains(".") == true else { return nil }
        return url
    }

    /// Publishing rewrote files in the package (changes brought in from
    /// GitHub, or merged with them).
    func packageChangedByPublish() {
        guard let content else { return contentChanged([]) }
        contentChanged(["site/\(content.path)"])
    }

    // MARK: - Native form

    private func makeContent(for node: SiteIndex.Node) -> (NativeForm?, ContentDocument?) {
        guard let package = document.packageURL, let form = NativeForm.make(for: node, package: package),
              let doc = ContentDocument(package: package, path: form.contentPath) else { return (nil, nil) }
        let nodeID = node.id
        doc.onLiveChange = { [weak self] value in self?.liveChanged(value, nodeID: nodeID) }
        doc.onSaved = { [weak self] in
            guard let self else { return }
            self.texts = nil
            self.refreshChanges()
            // Content the site bundles at startup (src/data) only shows after a reload.
            if form.livePath == nil && self.currentNode?.id == nodeID { self.preview.reloadKeepingScroll() }
        }
        return (form, doc)
    }

    /// An edit in the native form: the sidebar follows at once, and the
    /// preview gets the new content without a reload.
    private func liveChanged(_ value: JSONValue, nodeID: String) {
        index.replaceSections(of: nodeID, with: value)
        guard nodeID == currentNode?.id else { return }
        let livePath = form?.livePath
        let first = pendingLiveDoc == nil
        pendingLiveDoc = value
        guard first else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
            guard let self, let doc = self.pendingLiveDoc else { return }
            self.pendingLiveDoc = nil
            if let livePath { self.preview.push(contentPath: livePath, json: doc.compact) }
            if let node = self.currentNode {
                self.preview.show(anchors: node.sections.map(\.anchor), selected: self.currentSection?.anchor, scroll: false)
            }
        }
    }

    func editInWebForm() {
        flushEdits()
        webForm = true
        guard let node = currentNode, let path = node.editorPath else { return }
        inspector.load(editorPath: path)
        if let section = currentSection { selectInForm(section.index, afterLoad: true) }
    }

    func useNativeForm() {
        webForm = false
        content?.reloadIfChangedElsewhere()
    }

    private var sectionsKey: String? { form?.hasSections == true ? form?.sectionsKey : nil }

    /// Opens one of the current page's sections.
    func selectSection(_ i: Int) {
        guard let node = currentNode else { return }
        open("\(node.id)#\(i)")
    }

    private func selectSectionQuietly(_ index: Int) {
        guard let node = currentNode else { return }
        selection = "\(node.id)#\(index)"
        UserDefaults.standard.set(selection, forKey: selectionKey)
    }

    func moveSection(_ i: Int, by d: Int) {
        guard let doc = content, let key = sectionsKey else { return }
        doc.edit("Move Section") { root in
            guard var list = root[key]?.array, list.indices.contains(i + d) else { return }
            list.swapAt(i, i + d)
            root.set(key, .array(list))
        }
        selectSectionQuietly(i + d)
    }

    func duplicateSection(_ i: Int) {
        guard let doc = content, let key = sectionsKey else { return }
        doc.edit("Duplicate Section") { root in
            guard var list = root[key]?.array, list.indices.contains(i) else { return }
            var copy = list[i]
            copy.set("id", .string(Self.newAnchor(copy["label"]?.string)))
            list.insert(copy, at: i + 1)
            root.set(key, .array(list))
        }
        selectSectionQuietly(i + 1)
    }

    func toggleSectionHidden(_ i: Int) {
        guard let doc = content, let key = sectionsKey else { return }
        let hidden = doc.root[key]?[i]?["hidden"]?.bool == true
        doc.set([key, i, "hidden"], hidden ? nil : .bool(true), name: hidden ? "Show Section" : "Hide Section")
    }

    /// Whether the section belongs to the page being edited (sidebar
    /// commands act on that page's open document).
    func isEditing(_ section: SiteIndex.Section) -> Bool {
        currentNode?.id == section.nodeID && content != nil && sectionsKey != nil
    }

    func sectionCount() -> Int {
        guard let doc = content, let key = sectionsKey else { return 0 }
        return doc.root[key]?.array?.count ?? 0
    }

    func deleteSection(_ i: Int) {
        guard let doc = content, let key = sectionsKey else { return }
        let alert = NSAlert()
        alert.messageText = "Delete this section?"
        alert.informativeText = "You can undo this with ⌘Z, and the page’s backups keep earlier versions."
        alert.addButton(withTitle: "Delete")
        alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        doc.edit("Delete Section") { root in
            guard var list = root[key]?.array, list.indices.contains(i) else { return }
            list.remove(at: i)
            root.set(key, .array(list))
        }
        let remaining = doc.root[key]?.array?.count ?? 0
        if remaining == 0, let node = currentNode { selection = node.id } else { selectSectionQuietly(min(i, remaining - 1)) }
    }

    func addSection(type: String, after i: Int?) {
        guard let doc = content, let key = sectionsKey else { return }
        let at = (i ?? (doc.root[key]?.array?.count ?? 0) - 1) + 1
        let section = Self.newSection(type: type)
        doc.edit("Add Section") { root in
            var list = root[key]?.array ?? []
            list.insert(section, at: min(at, list.count))
            root.set(key, .array(list))
        }
        selectSectionQuietly(at)
    }

    /// An empty section of `type`, with the fields its form expects.
    static func newSection(type: String) -> JSONValue {
        var section: JSONValue = .object([("id", .string(Self.newAnchor(nil))), ("label", .string("")), ("type", .string(type)),
                                          ("images", .array([]))])
        if type == "image-text" || type == "image-text-carousel" || type == "images" || type == "text" {
            section.set("blocks", .array([.object([("images", .array([])), ("mobileImages", .array([])), ("hoverImages", .array([])),
                                                    ("title", .string("")), ("subtitle", .string("")), ("content", .string(""))])]))
        }
        if type == "text" { section.set("lines", .array([])) }
        let empty: JSONValue = .object([("lines", .array([]))])
        switch type {
        case "text-columns": section.set("columns", .array([empty, empty]))
        case "tab-switcher", "image-tab": section.set("tabs", .array([]))
        case "feature-tabs", "accordion", "stats": section.set("items", .array([]))
        case "scroll-animation": section.set("sideItems", .array([])); section.set("lines", .array([]))
        case "video-background", "model-viewer": section.set("lines", .array([]))
        default: break
        }
        return section
    }

    /// A DOM id for a new section (the preview finds sections by it).
    static func newAnchor(_ label: String?) -> String {
        let base = (label?.isEmpty == false ? label! : "section").replacingOccurrences(of: " ", with: "-")
        return "\(base)-\(String(UUID().uuidString.prefix(4)).lowercased())"
    }

    // MARK: - Making and removing pages

    /// File ▸ New…, prefilled from what's selected.
    func requestNewItem(_ kind: NewItemSheet.Kind? = nil, category: String? = nil) {
        let id = currentNode?.id ?? ""
        let k = kind ?? (id.hasPrefix("original") ? .original : id.hasPrefix("post") || id.hasPrefix("blog") ? .post : .project)
        let cat = category ?? (currentNode?.kind == .item || currentNode?.kind == .category ? currentNode?.subtitle?.lowercased() : nil) ?? ""
        newItem = NewItemRequest(kind: k, category: cat)
    }

    func categories(_ type: String) -> [String] {
        let group = index.tree.first { $0.id == type }
        return (group?.children ?? []).map { $0.id.replacingOccurrences(of: "\(type)-group:", with: "") }
    }

    var blogCategories: [(String, String)] {
        guard let package = document.packageURL,
              let data = try? Data(contentsOf: package.appendingPathComponent("site/src/data/siteConfig.json")),
              let config = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let list = config["blogCategories"] as? [[String: Any]] else { return [("others", "Others")] }
        return list.compactMap { c in (c["id"] as? String).map { ($0, c["label"] as? String ?? $0) } }
    }

    /// nil when it worked, else what went wrong.
    private func run(_ method: String, _ url: String, _ body: [String: Any]? = nil) async -> String? {
        let r = await callAPI(method, url, body: body)
        guard r.status >= 400 else {
            reloadIndex()
            refreshChanges()
            return nil
        }
        return (r.json as? [String: Any])?["error"] as? String ?? "Something went wrong (\(r.status))."
    }

    func createItem(_ type: String, category: String, id: String, title: String) async -> String? {
        if let e = await run("POST", "/api/\(type)-create", ["category": category, "id": id, "title": title]) { return e }
        open("\(type):\(category)/\(id)")
        return nil
    }

    func createPost(id: String, title: String, category: String) async -> String? {
        if let e = await run("POST", "/api/blog-post-create", ["id": id, "title": title, "category": category]) { return e }
        open("post:\(id)")
        return nil
    }

    func addCategory(_ type: String, _ name: String) async -> String? {
        await run("POST", "/api/add-category", ["type": type, "name": name])
    }

    private func confirm(_ message: String, _ info: String, _ button: String) -> Bool {
        let alert = NSAlert()
        alert.messageText = message
        alert.informativeText = info
        alert.addButton(withTitle: button)
        alert.addButton(withTitle: "Cancel")
        if button.hasPrefix("Delete") { alert.buttons.first?.hasDestructiveAction = true }
        return alert.runModal() == .alertFirstButtonReturn
    }

    private func report(_ error: String?) {
        guard let error else { return }
        let alert = NSAlert()
        alert.messageText = error
        alert.runModal()
    }

    func deleteItem(_ node: SiteIndex.Node) {
        let parts = node.id.split(separator: ":", maxSplits: 1).map(String.init)
        guard parts.count == 2 else { return }
        let url: String
        switch parts[0] {
        case "project": url = "/api/project-delete/\(parts[1])"
        case "post": url = "/api/blog-post-delete/\(parts[1])"
        default: return
        }
        guard confirm("Delete “\(node.title)”?", parts[0] == "project"
                      ? "Its page and every image in its folder are removed. Backups of its text stay in the project, and the published site keeps it until you publish."
                      : "It’s removed from the post list. The published site keeps it until you publish.", "Delete") else { return }
        if currentNode?.id == node.id { flushEdits(); content = nil; form = nil }
        Task {
            report(await run("DELETE", url))
            if index.node(selection.map(Self.nodeID)) == nil { apply("home") }
        }
    }

    /// project:cat/id, original:cat/id or post:id → (kind, category, id).
    private func itemParts(_ node: SiteIndex.Node) -> (kind: String, category: String, id: String)? {
        let parts = node.id.split(separator: ":", maxSplits: 1).map(String.init)
        guard parts.count == 2 else { return nil }
        let path = parts[1].split(separator: "/").map(String.init)
        if parts[0] == "post", path.count == 1 { return ("post", "", path[0]) }
        guard ["project", "original"].contains(parts[0]), path.count == 2 else { return nil }
        return (parts[0], path[0], path[1])
    }

    /// Sidebar ▸ Rename…: a project's or post's title.
    func renameItem(_ node: SiteIndex.Node) {
        guard let p = itemParts(node), p.kind != "original" else { return }
        let alert = NSAlert()
        alert.messageText = "Rename “\(node.title)”"
        alert.informativeText = p.kind == "project" ? "The name shown on the site. A short name in {braces} is used under small icons." : "The post’s title."
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 280, height: 24))
        field.stringValue = p.kind == "project" ? (listEntry("project", p.category, p.id)?["title"] as? String ?? node.title) : node.title
        alert.accessoryView = field
        alert.addButton(withTitle: "Rename")
        alert.addButton(withTitle: "Cancel")
        alert.window.initialFirstResponder = field
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        let title = field.stringValue.trimmingCharacters(in: .whitespaces)
        guard !title.isEmpty else { return }
        let url = p.kind == "project" ? "/api/project-title/\(p.category)/\(p.id)" : "/api/blog-post-meta/\(p.id)"
        Task {
            report(await run("POST", url, ["title": title]))
            if currentNode?.id == node.id { inspectorRevision += 1 }
        }
    }

    /// Sidebar ▸ Hide on Site / Show on Site (projects and originals).
    func setItemHidden(_ node: SiteIndex.Node, _ hidden: Bool) {
        guard let p = itemParts(node), p.kind != "post" else { return }
        flushEdits()
        Task {
            report(await run("POST", "/api/\(p.kind)-hidden/\(p.category)/\(p.id)", ["hidden": hidden]))
            if currentNode?.id == node.id { inspectorRevision += 1 }
        }
    }

    func moveItem(_ node: SiteIndex.Node, to category: String) {
        let parts = node.id.split(separator: ":", maxSplits: 1).map(String.init)
        let path = parts.count == 2 ? parts[1].split(separator: "/").map(String.init) : []
        guard path.count == 2, path[0] != category else { return }
        let wasOpen = currentNode?.id == node.id
        if wasOpen { flushEdits() }
        Task {
            if let e = await run("POST", "/api/\(parts[0])-category/\(path[0])/\(path[1])", ["newCategory": category]) { report(e); return }
            if wasOpen { selection = nil; apply("\(parts[0]):\(category)/\(path[1])") }
        }
    }

    func renameCategory(_ type: String, _ name: String) {
        let alert = NSAlert()
        alert.messageText = "Rename “\(name)”"
        alert.informativeText = "Lowercase letters, numbers and hyphens. Its pages and images move along."
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
        field.stringValue = name
        alert.accessoryView = field
        alert.addButton(withTitle: "Rename")
        alert.addButton(withTitle: "Cancel")
        alert.window.initialFirstResponder = field
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        let to = field.stringValue.trimmingCharacters(in: .whitespaces)
        guard !to.isEmpty, to != name else { return }
        flushEdits()
        Task {
            if let e = await run("POST", "/api/rename-category", ["type": type, "from": name, "to": to]) { report(e); return }
            if let id = selection.map(Self.nodeID), index.node(id) == nil {
                let moved = id.replacingOccurrences(of: ":\(name)/", with: ":\(to)/").replacingOccurrences(of: "-cat:\(name)", with: "-cat:\(to)")
                selection = nil
                apply(index.node(moved) != nil ? moved : "home")
            }
        }
    }

    func deleteCategory(_ type: String, _ name: String) {
        guard confirm("Delete the “\(name)” category?", "Only an empty category can be deleted; its category page goes with it.", "Delete") else { return }
        flushEdits()
        Task { report(await run("POST", "/api/delete-category", ["type": type, "name": name])) }
    }

    // MARK: - Editor API, for the native form

    /// One request to the package's editor API (as the web form would make it).
    func callAPI(_ method: String, _ url: String, body: [String: Any]? = nil) async -> (status: Int, json: Any?) {
        let data = body.flatMap { try? JSONSerialization.data(withJSONObject: $0) }
        return await withCheckedContinuation { cont in
            document.api.handle(method: method, url: url, headers: data == nil ? [:] : ["Content-Type": "application/json"], body: data) { r in
                cont.resume(returning: (r.status, try? JSONSerialization.jsonObject(with: r.body)))
            }
        }
    }

    /// Uploads an image through one of the editor API's upload routes; the
    /// API numbers it (the number the page then refers to).
    func uploadImage(_ file: URL, to endpoint: String) async -> Int? {
        guard let data = try? Data(contentsOf: file) else { return nil }
        let r = await callAPI("POST", endpoint, body: ["name": file.lastPathComponent, "data": data.base64EncodedString()])
        return (r.json as? [String: Any])?["num"] as? Int
    }

    /// A project's or original's title / year / tags / hidden, kept in
    /// src/data/projects.json or originals.json.
    func setItemField(_ type: String, _ field: String, _ category: String, _ id: String, _ body: [String: Any]) {
        Task { report(await run("POST", "/api/\(type)-\(field)/\(category)/\(id)", body)) }
    }

    struct ListItem { let category: String; let id: String; let title: String; var key: String { "\(category)/\(id)" } }

    /// Every project or original (src/data/projects.json / originals.json).
    func itemList(_ type: String) -> [ListItem] {
        guard let package = document.packageURL,
              let data = try? Data(contentsOf: package.appendingPathComponent("site/src/data/\(type).json")),
              let list = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
        return list.compactMap { x in
            guard let c = x["category"] as? String, let id = x["id"] as? String else { return nil }
            return ListItem(category: c, id: id, title: (x["title"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? id)
        }
    }

    func listEntry(_ type: String, _ category: String, _ id: String) -> [String: Any]? {
        guard let package = document.packageURL,
              let data = try? Data(contentsOf: package.appendingPathComponent("site/src/data/\(type)s.json")),
              let list = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return nil }
        return list.first { $0["category"] as? String == category && $0["id"] as? String == id }
    }

    private func reloadIndex() {
        guard let package = document.packageURL else { return }
        index = SiteIndex.load(package: package)
    }

    /// Recounts unpublished changes in the background (hashes ~1 s of files).
    func refreshChanges() {
        guard let package = document.packageURL, let manifest = document.manifest else { return }
        changesTask?.cancel()
        changesTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled else { return }
            let result = await Task.detached { try? Publisher.localChanges(package: package, manifest: manifest) }.value
            guard !Task.isCancelled, let self else { return }
            self.changes = result
            let paths = (result?.upload ?? []) + (result?.delete ?? [])
            self.changedNodes = Set(paths.compactMap { self.index.node(forPackagePath: $0)?.id })
        }
    }

    private var publishedCache: [String: Data] = [:]

    /// The file as last published (from GitHub, by its blob id in
    /// base-index.json), to show what a change does. nil when it's new or
    /// GitHub can't be reached.
    func publishedVersion(of path: String) async -> Data? {
        guard let package = document.packageURL, let manifest = document.manifest, let token = GitHubAccount.shared.token,
              let sha = (try? BaseIndex.load(from: package))?.files[path] else { return nil }
        if let cached = publishedCache[sha] { return cached }
        let client = GitHubClient(token: token, owner: manifest.repository.owner, repo: manifest.repository.name)
        guard let data = try? await client.blobData(sha) else { return nil }
        publishedCache[sha] = data
        return data
    }

    /// Visible text of every page, read the first time Go to needs it.
    func searchableTexts() async -> [SiteIndex.TextHit] {
        if let texts { return texts }
        guard let package = document.packageURL else { return [] }
        let index = self.index
        let loaded = await Task.detached { index.collectTexts(package: package) }.value
        texts = loaded
        return loaded
    }
}
