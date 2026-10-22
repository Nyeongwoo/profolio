import SwiftUI

/// Minimal mode: one switch that trims the site to what a recruiter needs —
/// the picked projects, About and Contacts — without touching any page's own
/// settings, so turning it off brings the full site back as it was. All of
/// it lives in siteConfig.json (minimal, minimalProjects, minimalShow*,
/// minimalReduceMotion); the site reads it through src/utils/minimal.js.
struct MinimalForm: View {
    @ObservedObject var model: EditorModel
    @ObservedObject var doc: ContentDocument

    struct Project: Identifiable {
        let category: String
        let id: String
        let title: String
        let order: Double
        var key: String { "\(category)/\(id)" }
    }

    private var picks: [String] { (doc.root["minimalProjects"]?.array ?? []).compactMap(\.string) }
    private var hiddenEverywhere: [String] { (doc.root["hiddenProjects"]?.array ?? []).compactMap(\.string) }

    var body: some View {
        let all = loadProjects()
        InspectorGroup(title: "Minimal mode") {
            JToggle(doc: doc, path: ["minimal"], label: "Minimal mode is on (visitors see the trimmed site)")
            Text("Shows only the projects picked below, with About and Contacts. Pages left out drop from the menus, footer and search, and their links go to Home. Turn it off to bring everything back.")
                .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
        InspectorGroup(title: "Also keep") {
            JToggle(doc: doc, path: ["minimalShowOriginals"], label: "Originals")
            JToggle(doc: doc, path: ["minimalShowBlog"], label: "Blog")
            JToggle(doc: doc, path: ["minimalShowArchive"], label: "Archive")
            Toggle("Calmer pages (no fade-ins)", isOn: Binding(
                get: { doc.root["minimalReduceMotion"]?.bool != false },
                set: { doc.set(["minimalReduceMotion"], $0 ? nil : .bool(false), name: "Change Calmer pages") }))
                .toggleStyle(.checkbox)
        }
        projectsGroup(all)
    }

    @ViewBuilder private func projectsGroup(_ all: [Project]) -> some View {
        let picked = picks.compactMap { key in all.first { $0.key == key } }
        let rest = all.filter { !picks.contains($0.key) }
        InspectorGroup(title: "Projects", trailing: picks.isEmpty ? nil : AnyView(
            Button("Clear") { doc.set(["minimalProjects"], nil, name: "Clear Minimal projects") }.controlSize(.small))) {
            Text(picks.isEmpty
                 ? "None picked: every project that isn't hidden shows. Check the ones to keep."
                 : "Projects page “All” shows these, in this order. Other projects are left out.")
                .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            ForEach(Array(picked.enumerated()), id: \.element.key) { i, p in
                HStack(spacing: 6) {
                    VStack(spacing: 0) {
                        Button { move(i, -1) } label: { Image(systemName: "chevron.up") }.disabled(i == 0)
                        Button { move(i, 1) } label: { Image(systemName: "chevron.down") }.disabled(i == picked.count - 1)
                    }
                    .buttonStyle(.borderless).font(.system(size: 9, weight: .semibold))
                    row(p, checked: true)
                }
            }
            if !picked.isEmpty && !rest.isEmpty { Divider() }
            ForEach(rest) { p in row(p, checked: false) }
        }
    }

    private func row(_ p: Project, checked: Bool) -> some View {
        let hidden = hiddenEverywhere.contains(p.key)
        return HStack(spacing: 6) {
            Toggle("", isOn: Binding(get: { checked }, set: { _ in toggle(p.key) }))
                .toggleStyle(.checkbox).labelsHidden().disabled(hidden && !checked)
            VStack(alignment: .leading, spacing: 0) {
                Text(p.title).font(.callout).lineLimit(1)
                Text(hidden ? "\(p.category) · hidden on the site" : p.category)
                    .font(.caption).foregroundStyle(.secondary)
            }
            .opacity(hidden ? 0.5 : 1)
            Spacer()
        }
    }

    private func toggle(_ key: String) {
        var list = picks
        if let i = list.firstIndex(of: key) { list.remove(at: i) } else { list.append(key) }
        doc.set(["minimalProjects"], list.isEmpty ? nil : .array(list.map { .string($0) }), name: "Change Minimal projects")
    }

    private func move(_ i: Int, _ d: Int) {
        var list = picks
        guard list.indices.contains(i), list.indices.contains(i + d) else { return }
        list.swapAt(i, i + d)
        doc.set(["minimalProjects"], .array(list.map { .string($0) }), name: "Reorder Minimal projects")
    }

    private func loadProjects() -> [Project] {
        guard let package = model.document.packageURL,
              let data = try? Data(contentsOf: package.appendingPathComponent("site/src/data/projects.json")),
              let list = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
        return list.compactMap { x in
            guard let c = x["category"] as? String, let id = x["id"] as? String else { return nil }
            // A title's {short label} is for small icons; show the full name.
            let title = (x["title"] as? String)?
                .replacingOccurrences(of: #"\s*\{[^}]*\}\s*"#, with: " ", options: .regularExpression)
                .trimmingCharacters(in: .whitespaces)
            return Project(category: c, id: id, title: title.flatMap { $0.isEmpty ? nil : $0 } ?? id,
                           order: (x["order"] as? NSNumber)?.doubleValue ?? 0)
        }
        .sorted { $0.category != $1.category ? $0.category < $1.category : $0.order < $1.order }
    }
}
