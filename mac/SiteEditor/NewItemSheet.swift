import SwiftUI

/// File ▸ New… (⌘N): a project, original, blog post or category, made through
/// the editor API's create routes, then opened.
struct NewItemSheet: View {
    @ObservedObject var model: EditorModel
    @Environment(\.dismiss) private var dismiss

    enum Kind: String, CaseIterable, Identifiable {
        case page = "Page", project = "Project", original = "Original", post = "Blog post", category = "Category"
        var id: String { rawValue }
    }

    @State var kind: Kind
    @State var category: String
    @State private var title = ""
    @State private var slug = ""
    @State private var slugEdited = false
    @State private var newCategory = ""
    @State private var categoryType = "projects"
    @State private var blogCategory = "others"
    @State private var error: String?
    @State private var working = false

    private static let newCategoryTag = "__new__"

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("New").font(.headline)
            Picker("Kind", selection: $kind) {
                ForEach(kinds) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            Form {
                switch kind {
                case .project, .original:
                    TextField("Name", text: $title, prompt: Text(kind == .project ? "e.g. Desk Lamp" : "e.g. Sketchbook"))
                    Picker("Category", selection: $category) {
                        ForEach(categories, id: \.self) { Text($0.capitalized).tag($0) }
                        Divider()
                        Text("New category…").tag(Self.newCategoryTag)
                    }
                    if category == Self.newCategoryTag {
                        TextField("New category", text: $newCategory, prompt: Text("lowercase, e.g. furniture"))
                    }
                    slugField
                case .page:
                    TextField("Name", text: $title, prompt: Text("e.g. Research"))
                    TextField("Address", text: Binding(get: { slug }, set: { slug = $0; slugEdited = true }),
                              prompt: Text("letters, numbers and -"))
                        .help("The page’s address, e.g. /\(slug.isEmpty ? "research" : slug) — it goes in the menu too")
                    if Self.reserved.contains(slug) {
                        Text("/\(slug) is one of the site’s own addresses. Pick another.").font(.caption).foregroundStyle(.red)
                    }
                case .post:
                    TextField("Title", text: $title)
                    Picker("Category", selection: $blogCategory) {
                        ForEach(model.blogCategories, id: \.0) { Text($0.1).tag($0.0) }
                    }
                    slugField
                case .category:
                    if model.hasPart("originals") {
                        Picker("In", selection: $categoryType) {
                            Text("Projects").tag("projects")
                            Text("Originals").tag("originals")
                        }
                        .pickerStyle(.segmented)
                    }
                    TextField("Name", text: $newCategory, prompt: Text("lowercase, e.g. furniture"))
                }
            }
            .formStyle(.grouped)
            .scrollDisabled(true)
            .frame(height: kind == .category ? 130 : kind == .page ? (Self.reserved.contains(slug) ? 150 : 130) : (category == Self.newCategoryTag && kind != .post ? 200 : 168))

            if let error { Text(error).foregroundStyle(.red).font(.callout) }

            HStack {
                Spacer()
                Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction)
                Button("Create") { Task { await create() } }
                    .keyboardShortcut(.defaultAction)
                    .disabled(!valid || working)
            }
        }
        .padding(20)
        .frame(width: 440)
        .onChange(of: title) { if !slugEdited { slug = Self.slugify(title) } }
        .onAppear { if category.isEmpty || !categories.contains(category) { category = categories.first ?? Self.newCategoryTag } }
        .onChange(of: kind) { if !categories.contains(category) { category = categories.first ?? Self.newCategoryTag } }
    }

    /// Kinds for the parts the site has (Site Structure).
    private var kinds: [Kind] {
        Kind.allCases.filter { k in
            (k != .original || model.hasPart("originals")) && (k != .post || model.hasPart("blog"))
        }
    }

    private var slugField: some View {
        TextField("Address", text: Binding(get: { slug }, set: { slug = $0; slugEdited = true }),
                  prompt: Text("letters, numbers and -"))
            .help("The page’s address, e.g. /\(kind == .original ? "originals" : "projects")/\(chosenCategory.isEmpty || chosenCategory == Self.newCategoryTag ? "work" : chosenCategory)/\(slug.isEmpty ? "desk-lamp" : slug)")
    }

    private var categories: [String] {
        model.categories(kind == .original ? "originals" : "projects")
    }

    private var chosenCategory: String { category == Self.newCategoryTag ? newCategory : category }

    private var valid: Bool {
        let ok = { (s: String) in s.range(of: "^[a-z0-9_-]+$", options: .regularExpression) != nil }
        switch kind {
        case .project, .original: return !title.trimmingCharacters(in: .whitespaces).isEmpty && ok(slug) && ok(chosenCategory)
        case .post: return !title.trimmingCharacters(in: .whitespaces).isEmpty && ok(slug)
        case .page: return !title.trimmingCharacters(in: .whitespaces).isEmpty && slug.range(of: "^[a-z0-9-]+$", options: .regularExpression) != nil
            && !Self.reserved.contains(slug)
        case .category: return newCategory.range(of: "^[a-z0-9-]+$", options: .regularExpression) != nil
        }
    }

    /// Addresses a page can't take (src/utils/pages.js RESERVED_PATHS).
    static let reserved = Set(["projects", "originals", "blog", "about", "contacts", "archive", "sitemap", "editor", "lab", "profolio", "assets", "api"]
        + EditorModel.otherLanguageCodes)

    static func slugify(_ s: String) -> String {
        let folded = s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current).lowercased()
        let dashed = folded.replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
        return dashed.trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }

    private func create() async {
        working = true
        defer { working = false }
        error = nil
        let result: String?
        switch kind {
        case .project, .original:
            let type = kind == .project ? "projects" : "originals"
            if category == Self.newCategoryTag, let e = await model.addCategory(type, newCategory) { error = e; return }
            result = await model.createItem(kind == .project ? "project" : "original", category: chosenCategory, id: slug, title: title)
        case .page:
            result = await model.createPage(id: slug, title: title.trimmingCharacters(in: .whitespaces), path: "/\(slug)")
        case .post:
            result = await model.createPost(id: slug, title: title, category: blogCategory)
        case .category:
            result = await model.addCategory(categoryType, newCategory)
            if result == nil { model.open("\(categoryType)-cat:\(newCategory)") }
        }
        if let result { error = result } else { dismiss() }
    }
}
