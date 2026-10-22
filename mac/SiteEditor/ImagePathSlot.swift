import AppKit
import SwiftUI
import UniformTypeIdentifiers

/// An image the site loads by path without extension (it tries .webp,
/// .png, …), like a profile photo or a hero: shows it, takes a dropped or
/// chosen file, writes it into the package at `target` (PNG as WebP; the
/// image it replaces goes to the Trash) and points `path` at it.
struct ImagePathSlot: View {
    @ObservedObject var model: EditorModel
    @ObservedObject var doc: ContentDocument
    /// Where the path is stored; nil when the site uses `target` as is.
    let path: [Any]?
    let label: String
    /// Public path the upload is written to, without extension ("/assets/about/profile").
    let target: String
    var hint = ""
    /// Whether it can be cleared (an optional override).
    var optional = false

    @State private var revision = 0
    @State private var error: String?

    static let extensions = ["webp", "png", "jpg", "jpeg", "gif", "svg"]

    private var site: URL? { model.document.packageURL?.appendingPathComponent("site/public") }
    private var stored: String? { path.flatMap { doc.root[path: $0]?.string }.flatMap { $0.isEmpty ? nil : $0 } }
    private var shownPath: String? { stored ?? (optional ? nil : target) }

    var body: some View {
        let file = shownPath.flatMap(resolve)
        HStack(spacing: 10) {
            Thumbnail(url: file, size: 52)
                .id("\(file?.path ?? label)#\(revision)")
                .overlay(Corner.shape(Corner.tile).strokeBorder(Color.secondary.opacity(0.25)))
                .onDrop(of: [.fileURL], isTargeted: nil) { providers in
                    guard let p = providers.first else { return false }
                    _ = p.loadObject(ofClass: URL.self) { url, _ in
                        if let url { DispatchQueue.main.async { set(url) } }
                    }
                    return true
                }
            VStack(alignment: .leading, spacing: 3) {
                Text(label).font(.callout.weight(.medium))
                Text(file?.lastPathComponent ?? (optional ? "None" : "Missing")).font(.caption).foregroundStyle(.secondary)
                    .lineLimit(1).truncationMode(.middle)
                HStack(spacing: 6) {
                    Button("Choose…") { choose() }.controlSize(.small)
                    if optional && stored != nil { Button("Remove") { clear() }.controlSize(.small) }
                }
                if let error { Text(error).font(.caption).foregroundStyle(.red) }
            }
            Spacer(minLength: 0)
        }
        .help(hint.isEmpty ? "Drop an image here or click Choose" : hint)
    }

    /// The file for a public path, with or without its extension.
    private func resolve(_ publicPath: String) -> URL? {
        guard let site else { return nil }
        let rel = String(publicPath.drop { $0 == "/" })
        let url = site.appendingPathComponent(rel)
        if !url.pathExtension.isEmpty, FileManager.default.fileExists(atPath: url.path) { return url }
        let base = url.pathExtension.isEmpty ? url : url.deletingPathExtension()
        return Self.extensions.lazy.map { base.appendingPathExtension($0) }.first { FileManager.default.fileExists(atPath: $0.path) }
    }

    private func choose() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.image]
        if panel.runModal() == .OK, let url = panel.url { set(url) }
    }

    private func set(_ file: URL) {
        guard let site, Self.extensions.contains(file.pathExtension.lowercased()), var data = try? Data(contentsOf: file) else {
            error = "Not an image the site can show (WebP, PNG, JPEG, GIF or SVG)."; return
        }
        error = nil
        var ext = file.pathExtension.lowercased()
        if ext == "png", let webp = WebP.lossless(fromPNG: data) { data = webp; ext = "webp" }
        let base = site.appendingPathComponent(String(target.drop { $0 == "/" }))
        do {
            try FileManager.default.createDirectory(at: base.deletingLastPathComponent(), withIntermediateDirectories: true)
            for e in Self.extensions { try? AssetTrash.discard(base.appendingPathExtension(e)) }
            try data.write(to: base.appendingPathExtension(ext), options: .atomic)
        } catch {
            self.error = error.localizedDescription
            return
        }
        if let path { doc.set(path, optional || stored != nil ? .string(target) : nil, name: "Change \(label)"); doc.saveNow() }
        changed()
    }

    private func clear() {
        if let file = stored.flatMap(resolve), stored == target { try? AssetTrash.discard(file) }
        if let path { doc.set(path, nil, name: "Remove \(label)"); doc.saveNow() }
        changed()
    }

    private func changed() {
        revision += 1
        model.refreshChanges()
        model.preview.reloadKeepingScroll()
    }
}

/// A page's own maintenance switch (the page shows the maintenance screen
/// while the rest of the site stays up).
struct PageMaintenanceToggle: View {
    @ObservedObject var doc: ContentDocument
    var path: [Any] = ["maintenance"]

    var body: some View {
        Toggle("Under maintenance (visitors see the maintenance screen on this page)", isOn: Binding(
            get: { doc.root[path: path]?.bool == true },
            set: { doc.set(path, $0 ? .bool(true) : nil, name: "Page Maintenance") }))
            .toggleStyle(.checkbox)
    }
}

/// Files the site shows (images, video, PDFs, 3D models) under site/public
/// are never deleted outright when they're replaced or removed: they go to
/// the Trash, so a mistaken replacement can be taken back from there.
enum AssetTrash {
    static let extensions: Set<String> = ["webp", "png", "jpg", "jpeg", "gif", "svg", "avif", "mp4", "mov", "webm", "pdf", "glb", "gltf"]

    /// Whether `url` is such a file (or a folder of them) inside a package's site/public.
    static func applies(to url: URL) -> Bool {
        guard url.path.contains("/site/public/") else { return false }
        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir) else { return false }
        return isDir.boolValue || extensions.contains(url.pathExtension.lowercased())
    }

    /// Moves `url` to the Trash when it's such a file, deletes it otherwise.
    static func discard(_ url: URL) throws {
        guard FileManager.default.fileExists(atPath: url.path) else { return }
        if applies(to: url) {
            try FileManager.default.trashItem(at: url, resultingItemURL: nil)
        } else {
            try FileManager.default.removeItem(at: url)
        }
    }

    /// Before `url` is overwritten with `data`: the old version to the Trash,
    /// unless it's the same bytes.
    static func keepPrevious(_ url: URL, before data: Data) {
        guard applies(to: url), (try? Data(contentsOf: url, options: .alwaysMapped)) != data else { return }
        try? FileManager.default.trashItem(at: url, resultingItemURL: nil)
    }
}
