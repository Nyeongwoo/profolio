import AppKit
import SwiftUI

/// Crops one image, the way the web form's CropEditor stored it: the kept
/// region as percentages of the image ({x1, y1, x2, y2}) plus the image's
/// own ratio; nil when the whole image is kept.
struct CropSheet: View {
    let image: NSImage
    let initial: JSONValue?
    let save: (JSONValue?) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var box = CGRect(x: 0, y: 0, width: 100, height: 100)   // percent
    @State private var start: CGRect?
    @State private var lock: Double? = nil

    private let presets: [(String, Double?)] = [("Free", nil), ("16:9", 16.0 / 9), ("3:2", 1.5), ("4:3", 4.0 / 3), ("1:1", 1), ("4:5", 0.8), ("3:4", 0.75), ("9:16", 9.0 / 16)]
    private var imageRatio: Double { image.size.height > 0 ? image.size.width / image.size.height : 1 }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Crop").font(.headline)
            Picker("Ratio", selection: Binding(get: { lock ?? 0 }, set: { v in lock = v == 0 ? nil : v; applyLock() })) {
                ForEach(presets, id: \.0) { Text($0.0).tag($0.1 ?? 0) }
            }
            .pickerStyle(.segmented).labelsHidden()
            GeometryReader { geo in
                let size = fit(geo.size)
                let origin = CGPoint(x: (geo.size.width - size.width) / 2, y: (geo.size.height - size.height) / 2)
                let frame = CGRect(x: origin.x + box.minX / 100 * size.width, y: origin.y + box.minY / 100 * size.height,
                                   width: box.width / 100 * size.width, height: box.height / 100 * size.height)
                ZStack(alignment: .topLeading) {
                    Image(nsImage: image).resizable().frame(width: size.width, height: size.height).offset(x: origin.x, y: origin.y)
                    // Dim outside the kept region.
                    Path { p in
                        p.addRect(CGRect(origin: origin, size: size))
                        p.addRect(frame)
                    }
                    .fill(Color.black.opacity(0.5), style: FillStyle(eoFill: true))
                    Rectangle().stroke(Color.white, lineWidth: 1.5)
                        .frame(width: frame.width, height: frame.height)
                        .offset(x: frame.minX, y: frame.minY)
                        .contentShape(Rectangle())
                        .gesture(DragGesture().onChanged { g in move(g.translation, size) }.onEnded { _ in start = nil })
                    ForEach(0..<4, id: \.self) { corner in
                        let p = CGPoint(x: corner % 2 == 0 ? frame.minX : frame.maxX, y: corner < 2 ? frame.minY : frame.maxY)
                        Circle().fill(Color.white).overlay(Circle().stroke(Color.black.opacity(0.4)))
                            .frame(width: 12, height: 12)
                            .position(p)
                            .gesture(DragGesture().onChanged { g in resize(corner, g.translation, size) }.onEnded { _ in start = nil })
                    }
                }
            }
            .frame(width: 560, height: 360)
            HStack {
                Button("Reset") { box = CGRect(x: 0, y: 0, width: 100, height: 100); lock = nil }
                Spacer()
                Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction)
                Button("Apply") {
                    let full = box.minX <= 0.01 && box.minY <= 0.01 && box.maxX >= 99.99 && box.maxY >= 99.99
                    save(full ? nil : .object([("x1", Self.num(box.minX)), ("y1", Self.num(box.minY)), ("x2", Self.num(box.maxX)),
                                                ("y2", Self.num(box.maxY)), ("imgRatio", .number(String(format: "%.4f", imageRatio)))]))
                    dismiss()
                }
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(16)
        .onAppear {
            if let c = initial, let x1 = c["x1"]?.string.flatMap(Double.init), let y1 = c["y1"]?.string.flatMap(Double.init),
               let x2 = c["x2"]?.string.flatMap(Double.init), let y2 = c["y2"]?.string.flatMap(Double.init) {
                box = CGRect(x: x1, y: y1, width: x2 - x1, height: y2 - y1)
            }
        }
    }

    private static func num(_ v: Double) -> JSONValue { .number(String(format: "%.2f", v)) }

    private func fit(_ area: CGSize) -> CGSize {
        let r = imageRatio
        return area.width / area.height > r ? CGSize(width: area.height * r, height: area.height) : CGSize(width: area.width, height: area.width / r)
    }

    private func move(_ t: CGSize, _ size: CGSize) {
        if start == nil { start = box }
        guard let s = start else { return }
        let dx = t.width / size.width * 100, dy = t.height / size.height * 100
        box.origin = CGPoint(x: min(max(0, s.minX + dx), 100 - s.width), y: min(max(0, s.minY + dy), 100 - s.height))
    }

    /// Drags a corner (0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right).
    private func resize(_ corner: Int, _ t: CGSize, _ size: CGSize) {
        if start == nil { start = box }
        guard let s = start else { return }
        let dx = t.width / size.width * 100, dy = t.height / size.height * 100
        var x1 = s.minX, y1 = s.minY, x2 = s.maxX, y2 = s.maxY
        if corner % 2 == 0 { x1 = min(max(0, x1 + dx), x2 - 2) } else { x2 = max(min(100, x2 + dx), x1 + 2) }
        if corner < 2 { y1 = min(max(0, y1 + dy), y2 - 2) } else { y2 = max(min(100, y2 + dy), y1 + 2) }
        if let lock {
            // Keep the chosen ratio (in pixels): height follows width.
            let w = x2 - x1
            var h = w * imageRatio / lock
            if corner < 2 { h = min(h, y2) ; y1 = y2 - h } else { h = min(h, 100 - y1); y2 = y1 + h }
        }
        box = CGRect(x: x1, y: y1, width: x2 - x1, height: y2 - y1)
    }

    private func applyLock() {
        guard let lock else { return }
        var w = box.width
        var h = w * imageRatio / lock
        if h > 100 { h = 100; w = h * lock / imageRatio }
        let cx = box.midX, cy = box.midY
        box = CGRect(x: min(max(0, cx - w / 2), 100 - w), y: min(max(0, cy - h / 2), 100 - h), width: w, height: h)
    }
}

/// Per-image overrides stored as a map {desktop image number: override
/// number} — a section's tablet images, or phone images kept that way.
struct OverrideMapEditor: View {
    @ObservedObject var doc: ContentDocument
    let path: [Any]
    let desktopPath: [Any]
    let label: String
    let desktopFolder: URL
    let folder: URL
    let upload: (URL) async -> Int?
    @State private var choosing: Int?
    @State private var version = 0

    var body: some View {
        let desktop = doc.root[path: desktopPath]?.array?.compactMap(\.int) ?? []
        let map = doc.root[path: path]
        let files = ImageFolder(url: folder).files
        let desktopFiles = ImageFolder(url: desktopFolder).files
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.callout).foregroundStyle(.secondary)
            if desktop.isEmpty { Text("Add desktop images first.").font(.caption).foregroundStyle(.tertiary) }
            ForEach(desktop, id: \.self) { n in
                let override = map?[String(n)]?.int
                HStack(spacing: 8) {
                    Thumbnail(url: desktopFiles[n], size: 40)
                    Image(systemName: "arrow.right").font(.caption).foregroundStyle(.tertiary)
                    Button { choosing = n } label: {
                        if let o = override { Thumbnail(url: files[o], size: 40).id("\(o)#\(version)") }
                        else {
                            Corner.shape(Corner.control).strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [3]))
                                .foregroundStyle(.secondary).frame(width: 40, height: 40)
                                .overlay(Image(systemName: "plus").font(.caption))
                        }
                    }
                    .buttonStyle(.plain)
                    .popover(isPresented: Binding(get: { choosing == n }, set: { if !$0 { choosing = nil } })) { chooser(n, files) }
                    Text(override.map { "Image \($0)" } ?? "Same as desktop").font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    if override != nil {
                        Button { set(n, nil) } label: { Image(systemName: "xmark.circle.fill") }
                            .buttonStyle(.borderless).foregroundStyle(.tertiary).help("Use the desktop image")
                    }
                }
            }
        }
    }

    private func chooser(_ n: Int, _ files: [Int: URL]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 64), spacing: 8)], spacing: 8) {
                    ForEach(files.keys.sorted(), id: \.self) { o in
                        Button { set(n, o); choosing = nil } label: { Thumbnail(url: files[o], size: 64) }.buttonStyle(.plain)
                    }
                }
            }
            .frame(width: 300, height: 220)
            Button("Upload…") {
                let panel = NSOpenPanel()
                panel.allowedContentTypes = [.image]
                guard panel.runModal() == .OK, let url = panel.url else { return }
                Task {
                    if let o = await upload(url) { set(n, o) }
                    version += 1
                    choosing = nil
                }
            }
        }
        .padding(12)
    }

    private func set(_ n: Int, _ o: Int?) {
        doc.edit("Image Override") { root in
            var map = root[path: path] ?? .object([])
            if case .array = map { map = .object([]) }
            map.set(String(n), o.map { .number(String($0)) })
            root.set(path: path, map)
        }
    }
}
