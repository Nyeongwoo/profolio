import AppKit
import SwiftUI
import UniformTypeIdentifiers

/// A project's or original's own images, on its Page tab: the hero at the
/// top of its page (and a phone version), its card on the All grid (and the
/// image shown on hover), and its icon in the category page's top row.
/// Drop an image on a slot or choose one; PNGs are stored as WebP.
struct ItemImages: View {
    @ObservedObject var model: EditorModel
    @ObservedObject var doc: ContentDocument
    let type: String            // project | original
    let category: String
    let itemID: String

    /// Bumped after every change so the thumbnails read the files again.
    @State private var revision = 0
    @State private var error: String?

    private var plural: String { type == "project" ? "projects" : "originals" }
    private var assets: URL? { model.document.packageURL?.appendingPathComponent("site/public/assets/\(plural)") }
    private var folder: URL? { assets?.appendingPathComponent("\(category)/\(itemID)") }

    /// All Projects / All Originals' card shape (its Layout settings).
    private var gridRatio: String {
        let key = type == "project" ? "allProjectsImageRatio" : "allOriginalsImageRatio"
        return ImageRatio.text(model.sideDocument("src/data/siteConfig.json")?.root[key]?.string ?? "16/9", width: 1600)
    }

    var body: some View {
        InspectorGroup(title: "Images") {
            Text("Drop an image on a slot, or click Choose. PNGs are saved as WebP.")
                .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            slot("Hero", hint: "Top of the \(type) page", ratio: ImageRatio.text("16/9"), file: heroFile(mobile: false), remove: nil) { setHero($0, mobile: false) }
            if type == "project" {
                ImagePathSlot(model: model, doc: doc, path: ["heroTabletImage"], label: "Hero (tablet)",
                              target: "/assets/projects/\(category)/\(itemID)/hero-tablet", optional: true, ratio: ImageRatio.text("5/4", width: 1600))
                let mobile = heroFile(mobile: true)
                slot("Hero (phone)", hint: "Optional; phones use the hero otherwise", ratio: ImageRatio.text("5/4", width: 1200), file: mobile,
                     remove: mobile == nil ? nil : { removeMobileHero() }) { setHero($0, mobile: true) }
            }
            Divider()
            slot("Grid", hint: "Card on All \(plural.capitalized)", ratio: gridRatio, file: find(in: "all-thumbnails", "\(category)-\(itemID)"), remove: nil) {
                upload($0, to: "/api/all-thumbnail/\(plural)/\(category)/\(itemID)", slot: "main")
            }
            let hover = find(in: "all-thumbnails", "\(category)-\(itemID)-hover")
            slot("Grid hover", hint: "Optional; shown when the pointer is over the card", ratio: gridRatio, file: hover,
                 remove: hover.map { f in { removeFile(f) } }) {
                upload($0, to: "/api/all-thumbnail/\(plural)/\(category)/\(itemID)", slot: "hover")
            }
            slot("Category icon", hint: "In the row at the top of the \(category.capitalized) page; a GIF can move",
                 ratio: ImageRatio.text("1/1", width: 600) + ", transparent background works",
                 file: find(in: "icon-thumbnails", "\(category)-\(itemID)"), remove: nil) {
                upload($0, to: "/api/thumbnail/\(plural)/\(category)/\(itemID)", slot: "main")
            }
            let iconHover = find(in: "icon-thumbnails", "\(category)-\(itemID)-hover")
            slot("Category icon hover", hint: "Optional; shown when the pointer is over the icon",
                 ratio: ImageRatio.text("1/1", width: 600), file: iconHover,
                 remove: iconHover.map { f in { removeFile(f) } }) {
                upload($0, to: "/api/thumbnail/\(plural)/\(category)/\(itemID)", slot: "hover")
            }
            if let error { Text(error).font(.caption).foregroundStyle(.red) }
        }
    }

    @ViewBuilder
    private func slot(_ label: String, hint: String, ratio: String = "", file: URL?, remove: (() -> Void)?, set: @escaping (URL) -> Void) -> some View {
        HStack(alignment: .center, spacing: 10) {
            Thumbnail(url: file, size: 56)
                .id("\(file?.path ?? label)#\(revision)")
                .overlay(Corner.shape(Corner.tile).strokeBorder(Color.secondary.opacity(0.25)))
                .onDrop(of: [.fileURL], isTargeted: nil) { providers in
                    guard let p = providers.first else { return false }
                    _ = p.loadObject(ofClass: URL.self) { url, _ in
                        guard let url else { return }
                        DispatchQueue.main.async { set(url) }
                    }
                    return true
                }
            VStack(alignment: .leading, spacing: 3) {
                Text(label).font(.callout.weight(.medium))
                Text(file?.lastPathComponent ?? "None").font(.caption).foregroundStyle(.secondary).lineLimit(1).truncationMode(.middle)
                    .help(hint)
                if !ratio.isEmpty { Text("Recommended \(ratio)").font(.caption2).foregroundStyle(.tertiary) }
                HStack(spacing: 6) {
                    Button("Choose…") { choose(set) }.controlSize(.small)
                    if let remove { Button("Remove", action: remove).controlSize(.small) }
                }
            }
            Spacer(minLength: 0)
        }
        .help(hint)
    }

    // MARK: Files

    private static let extensions = ["webp", "png", "jpg", "jpeg", "gif", "svg"]

    /// The file the site would load for `base` (it tries these extensions in turn).
    private func find(in folder: String, _ base: String) -> URL? {
        guard let dir = assets?.appendingPathComponent(folder) else { return nil }
        return find(dir, base)
    }

    private func find(_ dir: URL, _ base: String) -> URL? {
        Self.extensions.lazy.map { dir.appendingPathComponent("\(base).\($0)") }
            .first { FileManager.default.fileExists(atPath: $0.path) }
    }

    /// The hero the page shows: info.json's path when it points elsewhere,
    /// else hero.* (hero-mobile.* only when the page uses it).
    private func heroFile(mobile: Bool) -> URL? {
        guard let folder, let site = model.document.packageURL?.appendingPathComponent("site/public") else { return nil }
        if type == "project", let path = doc.root[mobile ? "heroMobileImage" : "heroImage"]?.string, !path.isEmpty {
            let p = path.replacingOccurrences(of: "\\.(webp|png|jpe?g|gif|svg)$", with: "", options: .regularExpression)
            let url = site.appendingPathComponent(String(p.drop { $0 == "/" }))
            if FileManager.default.fileExists(atPath: url.path) { return url }
            return find(url.deletingLastPathComponent(), url.lastPathComponent)
        }
        return mobile ? nil : find(folder, "hero")
    }

    private func choose(_ set: @escaping (URL) -> Void) {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.image]
        panel.allowsMultipleSelection = false
        if panel.runModal() == .OK, let url = panel.url { set(url) }
    }

    private func isImage(_ url: URL) -> Bool {
        Self.extensions.contains(url.pathExtension.lowercased())
    }

    /// Through the editor API's thumbnail routes (which convert PNGs).
    private func upload(_ file: URL, to endpoint: String, slot: String) {
        guard isImage(file), let data = try? Data(contentsOf: file) else { error = "Not an image the site can show (WebP, PNG, JPEG, GIF or SVG)."; return }
        error = nil
        Task {
            let r = await model.callAPI("POST", endpoint, body: ["slot": slot, "name": file.lastPathComponent, "data": data.base64EncodedString()])
            if r.status >= 400 { error = (r.json as? [String: Any])?["error"] as? String ?? "Upload failed (\(r.status))." }
            changed()
        }
    }

    /// The hero has no upload route: written into the item's folder, any
    /// other extension of it removed (the site would find that first), and
    /// info.json pointed at it.
    private func setHero(_ file: URL, mobile: Bool) {
        guard let folder, isImage(file), var data = try? Data(contentsOf: file) else {
            error = "Not an image the site can show (WebP, PNG, JPEG, GIF or SVG)."; return
        }
        error = nil
        var ext = file.pathExtension.lowercased()
        if ext == "png", let webp = WebP.lossless(fromPNG: data) { data = webp; ext = "webp" }
        let base = mobile ? "hero-mobile" : "hero"
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            for e in Self.extensions { try? AssetTrash.discard(folder.appendingPathComponent("\(base).\(e)")) }
            try data.write(to: folder.appendingPathComponent("\(base).\(ext)"), options: .atomic)
        } catch {
            self.error = error.localizedDescription
            return
        }
        if type == "project" {
            let path = "/assets/projects/\(category)/\(itemID)/\(base)"
            // Desktop: the default path needs no key; phone: the key turns it on.
            doc.set([mobile ? "heroMobileImage" : "heroImage"], mobile ? .string(path) : nil, name: "Change Hero")
            doc.saveNow()
        }
        changed()
    }

    private func removeMobileHero() {
        guard let folder else { return }
        for e in Self.extensions { try? AssetTrash.discard(folder.appendingPathComponent("hero-mobile.\(e)")) }
        doc.set(["heroMobileImage"], nil, name: "Remove Phone Hero")
        doc.saveNow()
        changed()
    }

    private func removeFile(_ url: URL) {
        try? AssetTrash.discard(url)
        changed()
    }

    private func changed() {
        revision += 1
        model.refreshChanges()
        model.preview.reloadKeepingScroll()
    }
}
