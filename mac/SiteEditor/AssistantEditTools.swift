import Foundation

/// The Assistant's editing tools (⌘J): it changes the site only through
/// these, and each change is a proposal the person sees in the chat —
/// what changes, before → after — and applies or declines. Applied
/// content edits go through the page's ContentDocument, so they show in
/// the preview at once, autosave, and undo with ⌘Z like a form edit.
extension LabModel {
    func registerEditTools() {
        server.register(.init(
            name: "content_edit",
            description: """
            Proposes changes to one content JSON file and applies them if the person accepts. file: the repository path \
            page_read gives (e.g. public/assets/projects/work/desk-lamp/info.json, src/data/home.json) or a translation file \
            (src/i18n/ko.json, src/i18n/zh.json — “strings” maps English text to its translation). Each change: op “set” \
            (path → value; creates missing object keys), “insert” (path ends in an array index; the index = length appends) \
            or “remove” (path). path is an array of keys (strings) and array indexes (integers), e.g. ["sections", 2, "lines", 0, "text"]. \
            summary: one line saying what changes, in the person's language.
            """,
            properties: [
                "file": ["type": "string"],
                "summary": ["type": "string"],
                "changes": ["type": "array", "items": ["type": "object", "properties": [
                    "op": ["type": "string", "enum": ["set", "insert", "remove"]],
                    "path": ["type": "array", "items": [:]],
                    "value": [:],
                ], "required": ["path"]]],
            ],
            required: ["file", "summary", "changes"]) { [weak self] args, caller in
            guard let self else { return .error("No window.") }
            return await self.contentEdit(args, caller: caller)
        })

        server.register(.init(
            name: "section_add",
            description: """
            Proposes adding an empty section to a page (page id from site_outline) and adds it if accepted; returns where it \
            went, to fill with content_edit. type: text, images, image-text, image-text-carousel, image-grid, image-tab, \
            text-columns, scroll-animation, video-background, feature-tabs, tab-switcher, accordion, stats, model-viewer, people, recent-posts, \
            interactive. after: the section index to put it after (omit for the end).
            """,
            properties: ["page": ["type": "string"], "type": ["type": "string"], "after": ["type": "integer"], "label": ["type": "string"]],
            required: ["page", "type"]) { [weak self] args, caller in
            guard let self else { return .error("No window.") }
            return await self.sectionAdd(args, caller: caller)
        })

        server.register(.init(
            name: "item_create",
            description: """
            Proposes making a new page and makes it if accepted. kind: page (one of the site's own pages, with its own menu \
            tab: title, id = its address without the slash, e.g. research → /research), project, original, post (blog post) or category. \
            For project/original: category (an existing one from site_outline), id (lowercase-with-dashes), title. \
            For post: id, title, category (a blog category id). For category: type (project or original) and title (its name).
            """,
            properties: ["kind": ["type": "string", "enum": ["page", "project", "original", "post", "category"]],
                         "category": ["type": "string"], "id": ["type": "string"], "title": ["type": "string"], "type": ["type": "string"]],
            required: ["kind", "title"]) { [weak self] args, caller in
            guard let self else { return .error("No window.") }
            return await self.itemCreate(args, caller: caller)
        })

        server.register(.init(
            name: "translations_find",
            description: "Looks up translations: lang is one of the site's languages besides English (ko, zh, ja…); query matches the English text or the translation (case-insensitive). Up to 60 entries.",
            properties: ["lang": ["type": "string", "enum": EditorModel.otherLanguageCodes], "query": ["type": "string"]],
            required: ["lang"]) { [weak self] args, _ in
            guard let self, let site = self.siteFolder, let lang = args["lang"] as? String,
                  let data = try? Data(contentsOf: site.appendingPathComponent("src/i18n/\(lang).json")),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let strings = json["strings"] as? [String: String] else { return .error("No translations for that language.") }
            let q = (args["query"] as? String ?? "").lowercased()
            let hits = strings.filter { q.isEmpty || $0.key.lowercased().contains(q) || $0.value.lowercased().contains(q) }
                .sorted { $0.key < $1.key }
            let lines = hits.prefix(60).map { "\(Self.quote($0.key)) → \(Self.quote($0.value))" }
            return .text(hits.isEmpty ? "No match among \(strings.count) entries." :
                "\(hits.count) match\(hits.count == 1 ? "" : "es") in src/i18n/\(lang).json (path [\"strings\", <English>]):\n" + lines.joined(separator: "\n"))
        })

        server.register(.init(
            name: "site_publish",
            description: "Proposes publishing every unpublished change to the live site and publishes if accepted. Only when the person asks. note: the commit message.",
            properties: ["note": ["type": "string"]]) { [weak self] args, caller in
            guard let self, let editor = self.editor else { return .error("No window.") }
            editor.flushEdits()
            editor.refreshChanges()
            let files = (editor.changes?.upload ?? []) + (editor.changes?.delete ?? [])
            guard !files.isEmpty else { return .text("Nothing is unpublished.") }
            let shown = files.prefix(12).map { "• \($0)" } + (files.count > 12 ? ["… and \(files.count - 12) more"] : [])
            guard await self.propose("Publish \(files.count) change\(files.count == 1 ? "" : "s") to the live site", details: shown, in: caller)
            else { return .text("The person declined publishing.") }
            let result = await self.publish(nil, note: args["note"] as? String ?? "content: update via Profolio Assistant")
            editor.refreshChanges()
            return .text(result)
        })
    }

    // MARK: - content_edit

    private struct Change {
        enum Op: String { case set, insert, remove }
        let op: Op
        let path: [Any]
        let value: JSONValue?
    }

    private func contentEdit(_ args: [String: Any], caller: String) async -> LabMCPServer.Result {
        guard let editor, let site = siteFolder else { return .error("No window.") }
        let file = (args["file"] as? String ?? "").trimmingCharacters(in: .init(charactersIn: "/ "))
        guard file.hasSuffix(".json"), !file.contains(".."),
              file.hasPrefix("src/data/") || file.hasPrefix("src/i18n/") || (file.hasPrefix("public/") && !file.hasPrefix("public/lab/")),
              FileManager.default.fileExists(atPath: site.appendingPathComponent(file).path) else {
            return .error("Not a content file: \(file). Use the path page_read gives, or src/i18n/ko.json / zh.json.")
        }
        guard let doc = editor.sideDocument(file) else { return .error("\(file) couldn’t be read as JSON.") }

        var changes: [Change] = []
        for (n, raw) in (args["changes"] as? [[String: Any]] ?? []).enumerated() {
            guard let op = Change.Op(rawValue: raw["op"] as? String ?? "set") else { return .error("Change \(n + 1): unknown op.") }
            let path: [Any] = (raw["path"] as? [Any] ?? []).compactMap { p in
                if let s = p as? String { return s }
                if let i = p as? NSNumber { return i.intValue }
                return nil
            }
            guard !path.isEmpty else { return .error("Change \(n + 1): path is empty.") }
            var value: JSONValue?
            if op != .remove {
                guard let v = raw["value"], let j = Self.json(v) else { return .error("Change \(n + 1): value is missing.") }
                value = j
            }
            changes.append(Change(op: op, path: path, value: value))
        }
        guard !changes.isEmpty else { return .error("No changes.") }

        // Check every change against the file, and describe it.
        var preview = doc.root
        var details: [String] = []
        for (n, c) in changes.enumerated() {
            let where_ = c.path.map { "\($0)" }.joined(separator: " › ")
            let parent = Array(c.path.dropLast())
            switch c.op {
            case .set:
                if let i = c.path.last as? Int, !(preview[path: parent]?.array?.indices.contains(i) ?? false) {
                    return .error("Change \(n + 1): \(where_) doesn’t exist (use insert to add to an array).")
                }
                let before = preview[path: c.path]
                details.append("\(where_): \(Self.short(before)) → \(Self.short(c.value))")
                preview.set(path: c.path, c.value)
            case .insert:
                guard let i = c.path.last as? Int, var list = preview[path: parent]?.array, i >= 0, i <= list.count else {
                    return .error("Change \(n + 1): insert needs a path ending in an index of an existing array.")
                }
                list.insert(c.value!, at: i)
                preview.set(path: parent, .array(list))
                details.append("+ \(where_): \(Self.short(c.value))")
            case .remove:
                guard let before = preview[path: c.path] else { return .error("Change \(n + 1): \(where_) doesn’t exist.") }
                preview.set(path: c.path, nil)
                details.append("− \(where_): \(Self.short(before))")
            }
        }

        let summary = (args["summary"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "Edit \(file)"
        guard await propose("\(summary)\n\(file)", details: details, in: caller) else {
            return .text("The person declined this change; nothing was changed.")
        }
        doc.edit("Assistant: \(summary)") { $0 = preview }
        doc.saveNow()
        if file.hasPrefix("src/i18n/") { editor.refreshTranslationStatus() }
        return .text("Applied to \(file). The person can undo it with ⌘Z in the page’s form.")
    }

    // MARK: - section_add

    private func sectionAdd(_ args: [String: Any], caller: String) async -> LabMCPServer.Result {
        guard let editor, let package = document.packageURL, let id = args["page"] as? String,
              let node = editor.index.node(EditorModel.nodeID(of: id)) else { return .error("No page with that id. Use site_outline.") }
        guard let form = NativeForm.make(for: node, package: package), form.hasSections,
              let doc = editor.sideDocument(form.contentPath) else { return .error("\(node.title) has no sections.") }
        let type = args["type"] as? String ?? "text"
        guard NativeInspector.types.contains(where: { $0.0 == type }) else { return .error("Unknown section type \(type).") }
        let key = form.sectionsKey
        let count = doc.root[key]?.array?.count ?? 0
        let at = min(((args["after"] as? NSNumber)?.intValue).map { $0 + 1 } ?? count, count)
        var section = EditorModel.newSection(type: type)
        if let label = args["label"] as? String, !label.isEmpty {
            section.set("label", .string(label))
            section.set("id", .string(EditorModel.newAnchor(label)))
        }
        let name = NativeInspector.types.first { $0.0 == type }?.1 ?? type
        guard await propose("Add a \(name) section to “\(node.title)”", details: ["at position \(at + 1) of \(count + 1)"], in: caller) else {
            return .text("The person declined adding the section.")
        }
        doc.edit("Assistant: Add Section") { root in
            var list = root[key]?.array ?? []
            list.insert(section, at: min(at, list.count))
            root.set(key, .array(list))
        }
        doc.saveNow()
        return .text("Added at \(form.contentPath), path [\"\(key)\", \(at)]. Fill it with content_edit.")
    }

    // MARK: - item_create

    private func itemCreate(_ args: [String: Any], caller: String) async -> LabMCPServer.Result {
        guard let editor else { return .error("No window.") }
        let kind = args["kind"] as? String ?? ""
        let title = (args["title"] as? String ?? "").trimmingCharacters(in: .whitespaces)
        let slug = (args["id"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? Self.slug(title)
        let category = args["category"] as? String ?? ""
        guard !title.isEmpty else { return .error("A title is needed.") }
        let summary: String
        switch kind {
        case "project", "original":
            guard !category.isEmpty else { return .error("A category is needed (site_outline lists them).") }
            summary = "New \(kind) “\(title)” in \(category) (\(slug))"
        case "post": summary = "New blog post “\(title)” (\(slug))"
        case "page":
            guard !NewItemSheet.reserved.contains(slug) else { return .error("/\(slug) is one of the site's own addresses; pick another id.") }
            summary = "New page “\(title)” at /\(slug), added to the menu"
        case "category":
            guard let type = args["type"] as? String, type == "project" || type == "original" else { return .error("type must be project or original.") }
            summary = "New \(type) category “\(title)”"
        default: return .error("Unknown kind.")
        }
        guard await propose(summary, details: [], in: caller) else { return .text("The person declined.") }
        let error: String?
        switch kind {
        case "project", "original": error = await editor.createItem(kind, category: category, id: slug, title: title)
        case "post": error = await editor.createPost(id: slug, title: title, category: category.isEmpty ? "others" : category)
        case "page": error = await editor.createPage(id: slug, title: title, path: "/\(slug)")
        default: error = await editor.addCategory(args["type"] as! String, title)
        }
        if let error { return .error(error) }
        let pageID = kind == "post" ? "post:\(slug)" : kind == "page" ? "page:\(slug)" : kind == "category" ? nil : "\(kind):\(category)/\(slug)"
        return .text("Created\(pageID.map { " — page id \($0); it’s open now. page_read shows its content" } ?? "").")
    }

    // MARK: - Helpers

    /// Any JSON value from the tool's arguments as a JSONValue.
    static func json(_ any: Any) -> JSONValue? {
        guard let data = try? JSONSerialization.data(withJSONObject: [any], options: [.fragmentsAllowed]),
              case .array(let items)? = JSONValue.parse(data) else { return nil }
        return items.first
    }

    static func short(_ v: JSONValue?) -> String {
        guard let v else { return "(nothing)" }
        if case .string(let s) = v { return quote(s) }
        let text = v.compact
        return text.count > 140 ? String(text.prefix(140)) + "…" : text
    }

    static func quote(_ s: String) -> String {
        let one = s.replacingOccurrences(of: "\n", with: "⏎")
        return "“" + (one.count > 140 ? String(one.prefix(140)) + "…" : one) + "”"
    }

    static func slug(_ title: String) -> String {
        let s = title.lowercased().map { $0.isASCII && ($0.isLetter || $0.isNumber) ? String($0) : "-" }.joined()
        return s.split(separator: "-").joined(separator: "-")
    }
}
