import Foundation

/// Everything the editor can open, read from the package: pages, projects,
/// originals, blog posts and settings, each with the site URL that previews
/// it, the web editor route that edits it, and its sections.
///
/// This is where Profolio knows the nnwoo.com site structure (src/App.jsx
/// routes, src/pages/editor routes, the public/assets layout).
struct SiteIndex {
    struct Node: Identifiable, Hashable {
        enum Kind: Hashable { case group, page, category, item, settings }

        let id: String
        var title: String
        var kind: Kind
        var symbol: String
        /// Site path to preview, e.g. /projects/product/maizy.
        var previewPath: String?
        /// Web editor route, e.g. /editor/projects/product/maizy.
        var editorPath: String?
        /// Repo-relative JSON this page is edited in (under site/).
        var contentPath: String?
        /// The key of its sections list in that file ("" = none).
        var sectionsKey = "sections"
        var subtitle: String?
        var hidden = false
        var sections: [Section] = []
        var children: [Node]?
    }

    struct Section: Identifiable, Hashable {
        let nodeID: String
        let index: Int
        let anchor: String       // the DOM id the site renders
        let label: String
        let type: String
        let hidden: Bool
        var id: String { "\(nodeID)#\(index)" }
        var typeName: String { SiteIndex.typeNames[type] ?? type.capitalized }
    }

    /// Text found in a page's content, for Go to.
    struct TextHit: Hashable {
        let nodeID: String
        let sectionIndex: Int?
        let text: String
    }

    var tree: [Node] = []
    private(set) var byID: [String: Node] = [:]
    var texts: [TextHit] = []

    static let typeNames = [
        "text": "Text", "image-text": "Image + Text", "image-text-carousel": "Carousel",
        "images": "Images", "image-grid": "Image Grid", "image-tab": "Image Tabs",
        "text-columns": "Text Columns", "scroll-animation": "Scroll Animation",
        "video-background": "Video", "model-viewer": "3D Model", "tab-switcher": "Tab Switcher",
        "feature-tabs": "Feature Tabs", "accordion": "Accordion", "stats": "Stats",
        "interactive": "Interactive", "people": "People", "recent-posts": "Recent Posts",
    ]

    // MARK: - Building

    static func load(package: URL) -> SiteIndex {
        let site = package.appendingPathComponent("site")
        func json(_ rel: String) -> Any? {
            (try? Data(contentsOf: site.appendingPathComponent(rel))).flatMap { try? JSONSerialization.jsonObject(with: $0) }
        }
        func list(_ rel: String) -> [[String: Any]] { json(rel) as? [[String: Any]] ?? [] }
        func dirs(_ rel: String) -> [String] {
            let url = site.appendingPathComponent(rel)
            return ((try? FileManager.default.contentsOfDirectory(atPath: url.path)) ?? []).filter { name in
                var isDir: ObjCBool = false
                return FileManager.default.fileExists(atPath: url.appendingPathComponent(name).path, isDirectory: &isDir)
                    && isDir.boolValue && !name.hasPrefix(".") && !name.hasSuffix("thumbnails")
            }.sorted()
        }
        let config = json("src/data/siteConfig.json") as? [String: Any] ?? [:]

        var index = SiteIndex()
        func sections(of nodeID: String, at rel: String?, key: String = "sections") -> [Section] {
            guard let rel, !key.isEmpty, let doc = json(rel) as? [String: Any], let list = doc[key] as? [[String: Any]] else { return [] }
            return list.enumerated().map { i, s in
                Section(nodeID: nodeID, index: i, anchor: s["id"] as? String ?? "",
                        label: (s["label"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "Section \(i + 1)",
                        type: s["type"] as? String ?? "", hidden: s["hidden"] as? Bool ?? false)
            }
        }
        func page(_ id: String, _ title: String, _ symbol: String, preview: String?, editor: String,
                  content: String? = nil, sectionsKey: String = "sections", kind: Node.Kind = .page) -> Node {
            var n = Node(id: id, title: title, kind: kind, symbol: symbol, previewPath: preview, editorPath: editor,
                         contentPath: content, sections: sections(of: id, at: content, key: sectionsKey))
            n.sectionsKey = sectionsKey
            return n
        }
        let configFile = "src/data/siteConfig.json"
        func group(_ id: String, _ title: String, _ children: [Node]) -> Node {
            Node(id: id, title: title, kind: .group, symbol: "folder", children: children)
        }

        // Pages
        let pages = [
            page("home", "Home", "house", preview: "/", editor: "/editor/home", content: "src/data/home.json"),
            page("about", "About", "person.crop.circle", preview: "/about", editor: "/editor/about", content: "src/data/about.json"),
            page("contacts", "Contacts", "envelope", preview: "/contacts", editor: "/editor/contacts", content: configFile, sectionsKey: "contactsSections"),
            page("archive", "Archive", "archivebox", preview: "/archive", editor: "/editor/archive", content: "src/data/archive.json", sectionsKey: ""),
        ] + list("src/data/pages.json").compactMap { p -> Node? in
            // The site's own pages (src/data/pages.json; site + adds one).
            guard let id = p["id"] as? String, let path = p["path"] as? String else { return nil }
            let nodeID = "page:\(id)"
            let content = "public/assets/pages/\(id)/info.json"
            var n = Node(id: nodeID, title: p["title"] as? String ?? id, kind: .item, symbol: "doc.plaintext",
                         previewPath: path, editorPath: "/editor", contentPath: content, subtitle: path)
            n.sections = sections(of: nodeID, at: content)
            return n
        }

        // Projects and originals: categories from the list files plus any
        // (possibly empty) category folders, items under each.
        func collection(_ type: String, singular: String, listFile: String, symbol: String) -> [Node] {
            let entries = list(listFile)
            let hiddenCats = Set(config[type == "projects" ? "hiddenProjectCategories" : "hiddenOriginalCategories"] as? [String] ?? [])
            let hiddenItems = Set(config[type == "projects" ? "hiddenProjects" : "hiddenOriginals"] as? [String] ?? [])
            let cats = Set(entries.compactMap { $0["category"] as? String } + dirs("public/assets/\(type)")).sorted()
            return cats.map { cat in
                let catID = "\(type)-cat:\(cat)"
                let items = entries.filter { $0["category"] as? String == cat }.compactMap { e -> Node? in
                    guard let id = e["id"] as? String else { return nil }
                    let nodeID = "\(singular):\(cat)/\(id)"
                    let title = Self.plainTitle(e["title"] as? String ?? id)
                    let content = "public/assets/\(type)/\(cat)/\(id)/info.json"
                    var n = Node(id: nodeID, title: title, kind: .item, symbol: symbol,
                                 previewPath: "/\(type)/\(cat)/\(id)", editorPath: "/editor/\(type)/\(cat)/\(id)",
                                 contentPath: content, subtitle: cat.capitalized)
                    n.hidden = hiddenItems.contains("\(cat)/\(id)")
                    n.sections = sections(of: nodeID, at: content)
                    return n
                }
                let catContent = "public/assets/\(type)/\(cat)/category-info.json"
                var catPage = Node(id: catID, title: "Category page", kind: .category, symbol: "rectangle.grid.2x2",
                                   previewPath: "/\(type)/\(cat)", editorPath: "/editor/\(type)-cat/\(cat)",
                                   contentPath: catContent, subtitle: cat.capitalized)
                catPage.sections = sections(of: catID, at: catContent)
                var g = group("\(type)-group:\(cat)", cat.capitalized, (hiddenCats.contains(cat) ? [] : [catPage]) + items)
                g.subtitle = "\(items.count)"
                return g
            }
        }
        let projects = collection("projects", singular: "project", listFile: "src/data/projects.json", symbol: "doc.richtext")
        let originals = collection("originals", singular: "original", listFile: "src/data/originals.json", symbol: "sparkles")

        // Blog
        var blog = [
            page("blog-landing", "Blog landing", "newspaper", preview: "/blog", editor: "/editor/blog-landing",
                 content: "public/assets/blog/landing-info.json"),
            page("blog-list", "Post list", "list.bullet", preview: "/blog", editor: "/editor/blog", content: configFile, sectionsKey: ""),
        ]
        for p in list("src/data/blog.json") {
            guard let id = p["id"] as? String else { continue }
            let nodeID = "post:\(id)"
            let content = "public/assets/blog/\(id)/info.json"
            var n = Node(id: nodeID, title: p["title"] as? String ?? id, kind: .item, symbol: "doc.text",
                         previewPath: "/blog/post/\(id)", editorPath: "/editor/blog-post/\(id)", contentPath: content,
                         subtitle: (p["category"] as? String)?.capitalized)
            n.sections = sections(of: nodeID, at: content)
            blog.append(n)
        }

        let settings = [
            page("structure", "Site Structure", "square.stack.3d.up", preview: "/", editor: "/editor", content: configFile, sectionsKey: "", kind: .settings),
            page("translations", "Translations", "character.bubble", preview: "/", editor: "/editor/translations", kind: .settings),
            page("navbar", "Navbar", "menubar.rectangle", preview: "/", editor: "/editor/navbar", content: configFile, sectionsKey: "", kind: .settings),
            page("footer", "Footer", "rectangle.bottomthird.inset.filled", preview: "/", editor: "/editor/footer", content: configFile, sectionsKey: "", kind: .settings),
            page("all-projects", "All Projects", "square.grid.3x3", preview: "/projects", editor: "/editor/all-projects",
                 content: configFile, sectionsKey: "allProjectsSections", kind: .settings),
            page("all-originals", "All Originals", "square.grid.3x3", preview: "/originals", editor: "/editor/all-originals",
                 content: configFile, sectionsKey: "allOriginalsSections", kind: .settings),
            page("maintenance", "Maintenance", "lock", preview: "/", editor: "/editor/maintenance", content: configFile, sectionsKey: "", kind: .settings),
            page("minimal", "Minimal mode", "rectangle.compress.vertical", preview: "/", editor: "/editor", content: configFile, sectionsKey: "", kind: .settings),
            page("not-found", "404 Page", "questionmark.square", preview: "/__pofole-404", editor: "/editor/not-found", content: configFile, sectionsKey: "", kind: .settings),
        ]

        // Parts switched off in Site Structure leave the sidebar too (turn
        // them on there to get them back); new sites start without
        // Originals and Blog.
        let parts = (config["structure"] as? [String: Any])?["sections"] as? [String: Any] ?? [:]
        let originalsOn = parts["originals"] as? Bool != false, blogOn = parts["blog"] as? Bool != false
        index.tree = [group("pages", "Site", pages), group("projects", "Projects", projects)]
            + (originalsOn ? [group("originals", "Originals", originals)] : [])
            + (blogOn ? [group("blog", "Blog", blog)] : [])
            + [group("settings", "Site settings", originalsOn ? settings : settings.filter { $0.id != "all-originals" })]
        index.reindex()
        return index
    }

    private mutating func reindex() {
        byID = [:]
        func walk(_ nodes: [Node]) {
            for n in nodes {
                byID[n.id] = n
                walk(n.children ?? [])
            }
        }
        walk(tree)
    }

    func node(_ id: String?) -> Node? { id.flatMap { byID[$0] } }

    /// Re-reads a node's sections from its (edited, unsaved) content.
    mutating func replaceSections(of nodeID: String, with content: JSONValue) {
        guard let key = byID[nodeID]?.sectionsKey, !key.isEmpty else { return }
        let sections = (content[key]?.array ?? []).enumerated().map { i, s in
            Section(nodeID: nodeID, index: i, anchor: s["id"]?.string ?? "",
                    label: s["label"]?.string.flatMap { $0.isEmpty ? nil : $0 } ?? "Section \(i + 1)",
                    type: s["type"]?.string ?? "", hidden: s["hidden"]?.bool ?? false)
        }
        guard sections != byID[nodeID]?.sections else { return }
        func walk(_ nodes: inout [Node]) {
            for i in nodes.indices {
                if nodes[i].id == nodeID { nodes[i].sections = sections; return }
                if nodes[i].children != nil { walk(&nodes[i].children!) }
            }
        }
        walk(&tree)
        reindex()
    }

    /// Every openable node, in sidebar order.
    var openable: [Node] {
        var out: [Node] = []
        func walk(_ nodes: [Node]) {
            for n in nodes {
                if n.editorPath != nil { out.append(n) }
                walk(n.children ?? [])
            }
        }
        walk(tree)
        return out
    }

    /// The node whose preview is this site path (language prefix removed).
    func node(forPreviewPath path: String) -> Node? {
        let p = path.count > 1 && path.hasSuffix("/") ? String(path.dropLast()) : path
        return openable.first { $0.previewPath == p && $0.kind != .settings && $0.id != "blog-list" }
    }

    /// The node a changed package file belongs to (for "unpublished" dots).
    func node(forPackagePath rel: String) -> Node? {
        let path = rel.hasPrefix("site/") ? String(rel.dropFirst(5)) : rel
        return openable.first { n in
            guard let content = n.contentPath, content != "src/data/siteConfig.json" else { return false }
            let folder = (content as NSString).deletingLastPathComponent + "/"
            return path == content || (n.kind == .item && path.hasPrefix(folder))
        }
    }

    // MARK: - Text, for Go to

    static let textKeys: Set<String> = ["text", "title", "subtitle", "content", "label", "description", "caption",
                                         "heading", "overview", "overviewTitle", "overviewSubtitle", "role", "team", "name"]

    /// Visible text of every page with content, read lazily (Go to only).
    func collectTexts(package: URL) -> [TextHit] {
        let site = package.appendingPathComponent("site")
        var hits: [TextHit] = []
        for n in openable {
            guard let rel = n.contentPath,
                  let data = try? Data(contentsOf: site.appendingPathComponent(rel)),
                  let doc = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
            func walk(_ v: Any, _ key: String?, _ section: Int?) {
                switch v {
                case let d as [String: Any]: d.forEach { walk($1, $0, section) }
                case let a as [Any]: a.forEach { walk($0, key, section) }
                case let s as String where key.map(Self.textKeys.contains) == true:
                    let plain = Self.stripTags(s)
                    if plain.count >= 3, plain.rangeOfCharacter(from: .letters) != nil {
                        hits.append(TextHit(nodeID: n.id, sectionIndex: section, text: plain))
                    }
                default: break
                }
            }
            for (k, v) in doc where k != "sections" { walk(v, k, nil) }
            for (i, s) in (doc["sections"] as? [Any] ?? []).enumerated() { walk(s, nil, i) }
        }
        return hits
    }

    static func stripTags(_ s: String) -> String {
        s.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
            .replacingOccurrences(of: "&nbsp;", with: " ").replacingOccurrences(of: "&amp;", with: "&")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// "Data on Older Adults {DOAA}" → "Data on Older Adults" (see src/data/projects.js).
    static func plainTitle(_ t: String) -> String {
        t.replacingOccurrences(of: "\\s*\\{[^}]*\\}\\s*", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
    }
}
