import AppKit
import ImageIO
import SwiftUI
import UniformTypeIdentifiers

/// Which screen size the size controls edit. The site keeps tablet and
/// mobile sizes next to the default one (line.tabletSize / line.mobileSize,
/// overviewSizeTablet / overviewSizeMobile); empty falls back to the larger
/// screen's value.
enum SizeScope: String, CaseIterable, Identifiable {
    case all, tablet, mobile
    var id: String { rawValue }
    var label: String { self == .all ? "All sizes" : rawValue.capitalized }
}

// MARK: - Images

/// A project's numbered images (sections/07.png …), read from the package.
struct ImageFolder {
    let url: URL
    /// Image number → file.
    let files: [Int: URL]

    static let extensions = ["png", "jpg", "jpeg", "webp", "gif", "svg"]

    init(url: URL) {
        self.url = url
        var files: [Int: URL] = [:]
        for name in (try? FileManager.default.contentsOfDirectory(atPath: url.path)) ?? [] {
            let ext = (name as NSString).pathExtension.lowercased()
            guard Self.extensions.contains(ext), let n = Int((name as NSString).deletingPathExtension) else { continue }
            files[n] = url.appendingPathComponent(name)
        }
        self.files = files
    }
}

/// A downsampled thumbnail of a local image, loaded off the main thread.
struct Thumbnail: View {
    let url: URL?
    var size: CGFloat = 64
    @State private var image: NSImage?
    private var radius: CGFloat { size >= 50 ? Corner.tile : Corner.control }

    var body: some View {
        ZStack {
            Corner.shape(radius).fill(Color.secondary.opacity(0.12))
            if let image {
                Image(nsImage: image).resizable().scaledToFill()
            } else if url == nil {
                Image(systemName: "questionmark").foregroundStyle(.tertiary)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Corner.shape(radius))
        .task(id: url) {
            guard let url else { image = nil; return }
            let px = size * 2
            image = await Task.detached {
                guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
                      let cg = CGImageSourceCreateThumbnailAtIndex(src, 0, [
                        kCGImageSourceCreateThumbnailFromImageAlways: true,
                        kCGImageSourceThumbnailMaxPixelSize: px,
                        kCGImageSourceCreateThumbnailWithTransform: true,
                      ] as CFDictionary) else { return NSImage(contentsOf: url) }
                return NSImage(cgImage: cg, size: .zero)
            }.value
        }
    }
}

/// The images of a section or card: a row of thumbnails (by number), added
/// from the project's folder or by dropping files (uploaded through the
/// editor API, which numbers them).
struct ImageListEditor: View {
    @ObservedObject var doc: ContentDocument
    let path: [Any]
    let label: String
    let folder: URL
    /// Uploads a file into the folder; returns its number.
    let upload: (URL) async -> Int?
    @State private var browsing = false
    @State private var uploading = false
    @State private var dropTargeted = false
    @State private var version = 0
    @State private var cropping: Int?

    private var numbers: [Int] { doc.root[path: path]?.array?.compactMap(\.int) ?? [] }

    /// Where crops of these images are kept: images → cropData,
    /// mobileImages → mobileCropData, clickImages → clickCropData …
    private var cropPath: [Any] {
        guard let last = path.last as? String else { return path }
        let key = last == "images" ? "cropData" : last.replacingOccurrences(of: "Images", with: "CropData")
        return Array(path.dropLast()) + [key]
    }

    var body: some View {
        let images = ImageFolder(url: folder)
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.callout).foregroundStyle(.secondary)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 64, maximum: 64), spacing: 8)], alignment: .leading, spacing: 8) {
                ForEach(Array(numbers.enumerated()), id: \.offset) { i, n in
                    Thumbnail(url: images.files[n])
                        .overlay(alignment: .bottomLeading) {
                            Text(String(format: "%02d", n)).font(.system(size: 9, weight: .semibold)).padding(2)
                                .background(.ultraThinMaterial, in: Corner.shape(Corner.tag)).padding(3)
                        }
                        .overlay(alignment: .topTrailing) {
                            if doc.root[path: cropPath + [String(n)]] != nil {
                                Image(systemName: "crop").font(.system(size: 9, weight: .bold)).padding(3)
                                    .background(Color.accentColor, in: Corner.shape(Corner.tag)).foregroundStyle(.white).padding(3)
                            }
                        }
                        .contextMenu {
                            Button("Crop…") { cropping = n }.disabled(images.files[n] == nil)
                            if doc.root[path: cropPath + [String(n)]] != nil {
                                Button("Remove Crop") { doc.set(cropPath + [String(n)], nil, name: "Remove Crop") }
                            }
                            Divider()
                            Button("Move Left") { move(i, by: -1) }.disabled(i == 0)
                            Button("Move Right") { move(i, by: 1) }.disabled(i == numbers.count - 1)
                            Divider()
                            Button("Remove", role: .destructive) { remove(i) }
                            if let url = images.files[n] { Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([url]) } }
                        }
                        .help("Image \(n) — right-click for options")
                }
                Button { browsing = true } label: {
                    ZStack {
                        Corner.shape(Corner.tile).strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [4]))
                            .foregroundStyle(dropTargeted ? Color.accentColor : .secondary)
                        if uploading { ProgressView().controlSize(.small) } else { Image(systemName: "plus") }
                    }
                    .frame(width: 64, height: 64)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("Add images — or drop files here")
                .popover(isPresented: $browsing) { browser(images) }
            }
            .onDrop(of: [.fileURL], isTargeted: $dropTargeted) { providers in
                Task { await drop(providers) }
                return true
            }
        }
        .id(version)
        .sheet(isPresented: Binding(get: { cropping != nil }, set: { if !$0 { cropping = nil } })) {
            if let n = cropping, let url = ImageFolder(url: folder).files[n], let image = NSImage(contentsOf: url) {
                CropSheet(image: image, initial: doc.root[path: cropPath + [String(n)]]) { crop in
                    doc.edit("Crop Image") { root in
                        var map = root[path: cropPath] ?? .object([])
                        if case .object = map {} else { map = .object([]) }
                        map.set(String(n), crop)
                        root.set(path: cropPath, map)
                    }
                }
            }
        }
    }

    private func browser(_ images: ImageFolder) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Images in this project").font(.headline)
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 72, maximum: 72), spacing: 8)], spacing: 8) {
                    ForEach(images.files.keys.sorted(), id: \.self) { n in
                        let on = numbers.contains(n)
                        Button { on ? remove(numbers.firstIndex(of: n)!) : add(n) } label: {
                            Thumbnail(url: images.files[n], size: 72)
                                .overlay(Corner.shape(Corner.tile).strokeBorder(on ? Color.accentColor : .clear, lineWidth: 3))
                                .overlay(alignment: .topTrailing) {
                                    if on { Image(systemName: "checkmark.circle.fill").foregroundStyle(.white, Color.accentColor).padding(3) }
                                }
                                .overlay(alignment: .bottomLeading) {
                                    Text(String(format: "%02d", n)).font(.system(size: 9, weight: .semibold)).padding(2)
                                        .background(.ultraThinMaterial, in: Corner.shape(Corner.tag)).padding(3)
                                }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .frame(width: 340, height: 300)
            HStack {
                Button("Upload…") { pickFiles() }
                Spacer()
                Button("Done") { browsing = false }.keyboardShortcut(.defaultAction)
            }
        }
        .padding(14)
    }

    private func set(_ list: [Int], _ name: String) {
        doc.set(path, .array(list.map { .number(String($0)) }), name: name)
    }
    private func add(_ n: Int) { set(numbers + [n], "Add Image") }
    private func remove(_ i: Int) { var l = numbers; l.remove(at: i); set(l, "Remove Image") }
    private func move(_ i: Int, by d: Int) {
        var l = numbers
        let j = i + d
        guard l.indices.contains(j) else { return }
        l.swapAt(i, j)
        set(l, "Move Image")
    }

    private func pickFiles() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.allowedContentTypes = [.image]
        guard panel.runModal() == .OK else { return }
        Task { await uploadAll(panel.urls) }
    }

    private func drop(_ providers: [NSItemProvider]) async {
        var urls: [URL] = []
        for p in providers {
            if let data = try? await p.loadItem(forTypeIdentifier: UTType.fileURL.identifier) as? Data,
               let url = URL(dataRepresentation: data, relativeTo: nil) { urls.append(url) }
        }
        await uploadAll(urls)
    }

    private func uploadAll(_ urls: [URL]) async {
        uploading = true
        var added: [Int] = []
        for url in urls where ImageFolder.extensions.contains(url.pathExtension.lowercased()) {
            if let n = await upload(url) { added.append(n) }
        }
        uploading = false
        if !added.isEmpty { set(numbers + added, "Add Images") }
        version += 1
    }
}

// MARK: - Text lines

/// The site's stacked text lines (title / subtitle / body / spacer), each
/// with its own size, weight and color.
struct LinesEditor: View {
    @ObservedObject var doc: ContentDocument
    /// Where the lines array lives.
    let path: [Any]
    /// The object that may still hold pre-lines text (title/subtitle/content).
    let legacyPath: [Any]
    let scope: SizeScope

    static let kinds: [(String, String, Color, String, String)] = [   // kind, label, tint, default size, default weight
        ("title", "Title", .blue, "24px", "700"),
        ("subtitle", "Subtitle", .green, "21px", "700"),
        ("body", "Body", .gray, "17px", "500"),
        ("row", "Row", .purple, "17px", "500"),
        ("spacer", "Spacer", .orange, "32px", ""),
    ]
    static let spacerSizes = ["4px", "8px", "12px", "16px", "20px", "24px", "28px", "32px", "40px", "48px", "56px", "64px", "80px", "100px", "120px", "160px", "200px"]

    /// The lines, or the legacy fields shown as lines (src/pages/editor/EditorComponents.jsx autoConvertToLines).
    private var lines: [JSONValue] {
        if let a = doc.root[path: path]?.array { return a }
        let legacy = doc.root[path: legacyPath]
        var out: [JSONValue] = []
        for (kind, key) in [("title", "title"), ("subtitle", "subtitle"), ("body", "content")] {
            guard let text = legacy?[key]?.string, !text.isEmpty else { continue }
            let p = key == "content" ? "content" : key
            out.append(.object([("kind", .string(kind)), ("text", .string(text)), ("size", .string(legacy?["\(p)Size"]?.string ?? "")),
                                ("weight", .string(legacy?["\(p)Weight"]?.string ?? "")), ("color", .string(legacy?["\(p)Color"]?.string ?? "")),
                                ("font", .string(legacy?["\(p)Font"]?.string ?? ""))]))
        }
        return out
    }

    private func write(_ new: [JSONValue], _ name: String, key: String? = nil) {
        doc.edit(name, key: key) { $0.set(path: path, .array(new)) }
    }

    private var sizeKey: String {
        switch scope { case .all: "size"; case .tablet: "tabletSize"; case .mobile: "mobileSize" }
    }

    var body: some View {
        let current = lines
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(current.enumerated()), id: \.offset) { i, line in
                lineRow(line, at: i, in: current)
            }
            Menu {
                ForEach(Self.kinds, id: \.0) { k in
                    Button(k.1) {
                        var l = current
                        var obj: JSONValue = .object([("_id", .string(String(UUID().uuidString.prefix(7)).lowercased())), ("kind", .string(k.0)), ("text", .string("")),
                                                      ("size", .string(k.3)), ("weight", .string(k.4)), ("color", .string("")), ("font", .string(""))])
                        if k.0 == "subtitle" { obj.set("gapAfter", .number("12")) }
                        l.append(obj)
                        write(l, "Add \(k.1)")
                    }
                }
            } label: { Label("Add line", systemImage: "plus") }
            .menuStyle(.borderlessButton)
            .fixedSize()
        }
    }

    @ViewBuilder
    private func lineRow(_ line: JSONValue, at i: Int, in all: [JSONValue]) -> some View {
        let kind = line["kind"]?.string ?? "body"
        let meta = Self.kinds.first { $0.0 == kind } ?? Self.kinds[2]
        let update = { (key: String, value: JSONValue?, name: String) in
            var l = all
            l[i].set(key, value)
            write(l, name, key: "line\(i).\(key)")
        }
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 6) {
                Menu {
                    ForEach(Self.kinds, id: \.0) { k in Button(k.1) { update("kind", .string(k.0), "Change Line Kind") } }
                } label: {
                    Text(meta.1).font(.caption.weight(.semibold)).foregroundStyle(meta.2)
                }
                .menuStyle(.borderlessButton)
                .fixedSize()
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(Capsule().fill(meta.2.opacity(0.14)))

                if kind == "spacer" {
                    Picker("Height", selection: Binding(get: { line["size"]?.string ?? "32px" }, set: { update("size", .string($0), "Spacer Height") })) {
                        ForEach(Self.spacerSizes, id: \.self) { Text($0).tag($0) }
                    }
                    .labelsHidden().fixedSize()
                } else {
                    let sizes = scope == .all ? SiteOptions.fontSizes : [("", "Same as larger")] + SiteOptions.fontSizes.dropFirst()
                    Picker("Size", selection: Binding(get: { line[sizeKey]?.string ?? "" },
                                                      set: { update(sizeKey, $0.isEmpty && scope != .all ? nil : .string($0), "Text Size") })) {
                        ForEach(sizes, id: \.0) { Text($0.1).tag($0.0) }
                    }
                    .labelsHidden().fixedSize()
                    .help(scope == .all ? "Size" : "\(scope.label) size")
                    Picker("Weight", selection: Binding(get: { line["weight"]?.string ?? "" }, set: { update("weight", .string($0), "Text Weight") })) {
                        ForEach(SiteOptions.weights, id: \.0) { Text($0.1).tag($0.0) }
                    }
                    .labelsHidden().fixedSize()
                    ColorPicker("Color", selection: Binding(
                        get: { Color(nsColor: InlineHTML.nsColor(css: line["color"]?.string ?? "") ?? .labelColor) },
                        set: { update("color", .string(InlineHTML.hex(NSColor($0))), "Text Color") }), supportsOpacity: false)
                        .labelsHidden()
                        .help("Line color")
                    LineStyleButton(line: line) { key, value in update(key, value, "Text Style") }
                }
                Spacer(minLength: 0)
                Menu {
                    Button("Move Up") { var l = all; l.swapAt(i, i - 1); write(l, "Move Line") }.disabled(i == 0)
                    Button("Move Down") { var l = all; l.swapAt(i, i + 1); write(l, "Move Line") }.disabled(i == all.count - 1)
                    if !(line["color"]?.string ?? "").isEmpty { Button("Default Color") { update("color", .string(""), "Text Color") } }
                    Divider()
                    Button("Delete Line", role: .destructive) { var l = all; l.remove(at: i); write(l, "Delete Line") }
                } label: { Image(systemName: "ellipsis") }
                .menuStyle(.borderlessButton)
                .menuIndicator(.hidden)
                .fixedSize()
            }
            if kind != "spacer" {
                RichTextField(html: line["text"]?.string ?? "", placeholder: kind == "row" ? "Left | Right — a | splits it into columns" : meta.1,
                              fontSize: kind == "body" || kind == "row" ? 13 : 14) { html in
                    update("text", .string(html), "Typing")
                }
            }
        }
        .padding(8)
        .background(Corner.shape(Corner.group).fill(Color.secondary.opacity(0.06)))
    }
}


/// A line's finer typography, in a popover: font, italic, letter spacing,
/// line height, the gap after it, its own max width and alignment — all
/// the site's renderLines reads.
struct LineStyleButton: View {
    let line: JSONValue
    let set: (String, JSONValue?) -> Void
    @State private var open = false

    private var customized: Bool {
        ["font", "italic", "linkDisabled", "letterSpacing", "lineHeight", "gapAfter", "maxWidth", "textAlign"].contains {
            guard let v = line[$0] else { return false }
            return v != .string("") && v != .null && v != .bool(false)
        }
    }

    var body: some View {
        Button { open.toggle() } label: { Image(systemName: "textformat.size") }
            .buttonStyle(.borderless)
            .foregroundStyle(customized ? Color.accentColor : .secondary)
            .help("Letter spacing, line height, font and more")
            .popover(isPresented: $open, arrowEdge: .bottom) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Text style").font(.headline)
                    TypographyFields(letterSpacing: line["letterSpacing"]?.string ?? "", lineHeight: line["lineHeight"]?.string ?? "") { key, v in
                        set(key == .letterSpacing ? "letterSpacing" : "lineHeight", v)
                    }
                    Divider()
                    FieldRow(label: "Font") {
                        Picker("Font", selection: Binding(get: { line["font"]?.string ?? "" }, set: { set("font", $0.isEmpty ? nil : .string($0)) })) {
                            ForEach(SiteOptions.fonts, id: \.0) { Text($0.1).tag($0.0) }
                        }
                        .labelsHidden().fixedSize()
                    }
                    Toggle("Italic", isOn: Binding(get: { line["italic"]?.bool == true }, set: { set("italic", $0 ? .bool(true) : nil) }))
                        .toggleStyle(.checkbox)
                    if !(line["link"]?.string ?? "").isEmpty {
                        Toggle("Disable link", isOn: Binding(get: { line["linkDisabled"]?.bool == true }, set: { set("linkDisabled", $0 ? .bool(true) : nil) }))
                            .toggleStyle(.checkbox)
                    }
                    FieldRow(label: "Align") {
                        Picker("Align", selection: Binding(get: { line["textAlign"]?.string ?? "" }, set: { set("textAlign", $0.isEmpty ? nil : .string($0)) })) {
                            // Icons keep the segments inside the popover's field column.
                            Text("Section’s").tag("").help("Section’s alignment")
                            Image(systemName: "text.alignleft").tag("left").help("Left")
                            Image(systemName: "text.aligncenter").tag("center").help("Center")
                            Image(systemName: "text.alignright").tag("right").help("Right")
                        }
                        .labelsHidden().pickerStyle(.segmented).fixedSize()
                    }
                    FieldRow(label: "Gap after") {
                        CommitTextField(placeholder: "Default", value: line["gapAfter"]?.string ?? "") { v in
                            let t = v.trimmingCharacters(in: .whitespaces)
                            set("gapAfter", t.isEmpty ? nil : (Double(t) != nil ? .number(t) : .string(t)))
                        }
                        .textFieldStyle(.roundedBorder).frame(width: 90)
                    }
                    FieldRow(label: "Max width") {
                        CommitTextField(placeholder: "None", value: line["maxWidth"]?.string ?? "") { v in
                            let t = v.trimmingCharacters(in: .whitespaces)
                            set("maxWidth", t.isEmpty ? nil : .string(t))
                        }
                        .textFieldStyle(.roundedBorder).frame(width: 90)
                    }
                }
                .padding(14)
                // At least 300, wider if a row needs it — a fixed width clipped
                // the labels when a row ran over.
                .frame(minWidth: 300, alignment: .leading)
                .fixedSize()
            }
    }
}

/// Letter spacing and line height inputs, shared by lines and single text
/// fields. Empty removes the value (the site's default applies).
struct TypographyFields: View {
    enum Key { case letterSpacing, lineHeight }
    let letterSpacing: String
    let lineHeight: String
    let set: (Key, JSONValue?) -> Void

    var body: some View {
        FieldRow(label: "Letter spacing", hint: "e.g. -0.02em, 0.5px (a bare number is px)") {
            HStack(spacing: 6) {
                CommitTextField(placeholder: "Default", value: letterSpacing) { set(.letterSpacing, Self.value($0)) }
                    .textFieldStyle(.roundedBorder).frame(width: 90)
                Text("-0.02em, 1px").font(.caption).foregroundStyle(.tertiary)
            }
        }
        FieldRow(label: "Line height", hint: "e.g. 1.4 (times the size) or 24px") {
            HStack(spacing: 6) {
                CommitTextField(placeholder: "Default", value: lineHeight) { set(.lineHeight, Self.value($0)) }
                    .textFieldStyle(.roundedBorder).frame(width: 90)
                Text("1.4, 24px").font(.caption).foregroundStyle(.tertiary)
            }
        }
    }

    static func value(_ text: String) -> JSONValue? {
        let t = text.trimmingCharacters(in: .whitespaces)
        return t.isEmpty ? nil : .string(t)
    }
}
