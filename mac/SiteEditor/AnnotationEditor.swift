import AppKit
import SwiftUI

/// Callouts on a card's image (project and original pages): a dot on the
/// image, a line to a label with a title and text. Click the image to add
/// one; drag a dot, a label end or a bend to move it. Positions are
/// percentages of the image, as the site stores them (block.annotations /
/// block.mobileAnnotations).
struct AnnotationEditor: View {
    @ObservedObject var doc: ContentDocument
    let block: [Any]
    /// The page's image folders (desktop, phone) and its icons folder.
    let folder: URL?
    let mobileFolder: URL?
    let iconsFolder: URL?

    @State private var phone = false
    @State private var selected: Int?

    enum Part { case dot, label, bend }

    private var key: String { phone ? "mobileAnnotations" : "annotations" }
    private var annotations: [JSONValue] { doc.root[path: block + [key]]?.array ?? [] }

    private var imageURL: URL? {
        let images = doc.root[path: block + ["images"]]?.array?.compactMap(\.int) ?? []
        let mobile = doc.root[path: block + ["mobileImages"]]?.array?.compactMap(\.int) ?? []
        if phone, let n = mobile.first, let f = mobileFolder.flatMap({ ImageFolder(url: $0).files[n] }) { return f }
        return images.first.flatMap { n in folder.flatMap { ImageFolder(url: $0).files[n] } }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Picker("", selection: $phone) {
                Text("Desktop").tag(false)
                Text("Phone").tag(true)
            }
            .pickerStyle(.segmented).labelsHidden().fixedSize()
            .onChange(of: phone) { selected = nil }

            if let url = imageURL, let image = NSImage(contentsOf: url) {
                canvas(image)
                Text("Click the image to add a callout. Drag the dot, the label end (yellow) or the middle square (adds a bend) to move them.")
                    .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            } else {
                Text("Add an image to this card first.").font(.callout).foregroundStyle(.secondary)
            }

            if let i = selected, annotations.indices.contains(i) {
                fields(i)
            }
        }
    }

    // MARK: Canvas

    private func canvas(_ image: NSImage) -> some View {
        let ratio = image.size.width > 0 ? image.size.height / image.size.width : 0.6
        return GeometryReader { geo in
            let size = geo.size
            ZStack(alignment: .topLeading) {
                Image(nsImage: image).resizable().frame(width: size.width, height: size.height)
                    .contentShape(Rectangle())
                    .gesture(SpatialTapGesture().onEnded { add(at: pct($0.location, size)) })
                ForEach(Array(annotations.enumerated()), id: \.offset) { i, a in
                    let dot = point(a, "x", "y", size)
                    let label = point(a, "lineX", "lineY", size)
                    let bend = a["midX"].flatMap { _ in point(a, "midX", "midY", size) }
                    Path { p in
                        p.move(to: dot)
                        if let bend { p.addLine(to: bend) }
                        p.addLine(to: label)
                    }
                    .stroke(selected == i ? Color.accentColor : .white, lineWidth: 1.5)
                    .shadow(radius: 1)
                    .allowsHitTesting(false)
                    handle(Circle(), at: dot, size: 12, color: selected == i ? .accentColor : .white) { drag(i, .dot, $0, size) } end: { endDrag() }
                    handle(RoundedRectangle(cornerRadius: 2), at: label, size: 10, color: selected == i ? .accentColor : .yellow) { drag(i, .label, $0, size) } end: { endDrag() }
                    let mid = bend ?? CGPoint(x: (dot.x + label.x) / 2, y: (dot.y + label.y) / 2)
                    handle(Rectangle(), at: mid, size: 8, color: bend == nil ? .white.opacity(0.35) : .orange) { drag(i, .bend, $0, size) } end: { endDrag() }
                    Text(InlineHTML.plain(a["title"]?.string ?? "").isEmpty ? "\(i + 1)" : InlineHTML.plain(a["title"]?.string ?? ""))
                        .font(.caption2.weight(.semibold)).lineLimit(1)
                        .padding(.horizontal, 4).padding(.vertical, 1)
                        .background(.ultraThinMaterial, in: Capsule())
                        .position(x: label.x + (a["side"]?.string == "left" ? -30 : 30), y: label.y)
                        .onTapGesture { selected = i }
                }
            }
            .coordinateSpace(name: "annotations")
        }
        .aspectRatio(1 / ratio, contentMode: .fit)
        .clipShape(Corner.shape(Corner.tile))
    }

    private func handle<S: Shape>(_ shape: S, at p: CGPoint, size: CGFloat, color: Color,
                                  move: @escaping (CGPoint) -> Void, end: @escaping () -> Void) -> some View {
        shape.fill(color)
            .overlay(shape.stroke(Color.black.opacity(0.5), lineWidth: 1))
            .frame(width: size, height: size)
            .position(p)
            .gesture(DragGesture(minimumDistance: 0, coordinateSpace: .named("annotations"))
                .onChanged { move($0.location) }
                .onEnded { _ in end() })
    }

    private func pct(_ p: CGPoint, _ size: CGSize) -> CGPoint {
        CGPoint(x: max(0, min(100, p.x / size.width * 100)), y: max(0, min(100, p.y / size.height * 100)))
    }

    private func point(_ a: JSONValue, _ kx: String, _ ky: String, _ size: CGSize) -> CGPoint {
        let x = a[kx]?.string.flatMap(Double.init) ?? 0, y = a[ky]?.string.flatMap(Double.init) ?? 0
        return CGPoint(x: x / 100 * size.width, y: y / 100 * size.height)
    }

    private static func num(_ v: Double) -> JSONValue { .number(String(format: "%.1f", v)) }

    private func add(at p: CGPoint) {
        let new: JSONValue = .object([("x", Self.num(p.x)), ("y", Self.num(p.y)), ("lineX", Self.num(min(p.x + 15, 90))), ("lineY", Self.num(p.y)),
                                      ("side", .string("right")), ("title", .string("")), ("content", .string("")), ("hoverMode", .string("hover"))])
        let count = annotations.count
        doc.edit("Add Callout") { root in
            var list = root[path: block + [key]]?.array ?? []
            list.append(new)
            root.set(path: block + [key], .array(list))
        }
        selected = count
    }

    private func drag(_ i: Int, _ part: Part, _ location: CGPoint, _ size: CGSize) {
        let p = pct(location, size)
        selected = i
        let (kx, ky) = part == .dot ? ("x", "y") : part == .label ? ("lineX", "lineY") : ("midX", "midY")
        doc.edit("Move Callout", key: "callout\(i)\(kx)") { root in
            root.set(path: block + [key, i, kx], Self.num(p.x))
            root.set(path: block + [key, i, ky], Self.num(p.y))
        }
    }

    private func endDrag() {}

    // MARK: Fields

    @ViewBuilder private func fields(_ i: Int) -> some View {
        let base = block + [key, i]
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Callout \(i + 1)").font(.callout.weight(.semibold))
                Spacer()
                Button("Delete", role: .destructive) {
                    doc.edit("Delete Callout") { root in
                        var list = root[path: block + [key]]?.array ?? []
                        list.remove(at: i)
                        root.set(path: block + [key], .array(list))
                    }
                    selected = nil
                }
                .controlSize(.small)
            }
            JTextField(doc: doc, path: base + ["title"], label: "Title", typography: true)
            JRichTextField(doc: doc, path: base + ["content"], label: "Text")
            JSegmented(doc: doc, path: base + ["side"], label: "Label side", options: [("right", "Right"), ("left", "Left")], defaultValue: "right")
            JPicker(doc: doc, path: base + ["hoverMode"], label: "Shows", options: [("hover", "On hover"), ("always-on", "Always"), ("always-off", "Never")])
            if let iconsFolder {
                let icons = ((try? FileManager.default.contentsOfDirectory(atPath: iconsFolder.path)) ?? [])
                    .filter { ImageFolder.extensions.contains(($0 as NSString).pathExtension.lowercased()) }.sorted()
                if !icons.isEmpty {
                    JPicker(doc: doc, path: base + ["icon"], label: "Icon", options: [("", "None")] + icons.map { ($0, $0) })
                }
            }
            if doc.root[path: base + ["midX"]] != nil {
                Button("Remove the bend") {
                    doc.edit("Straighten Callout") { root in
                        root.set(path: base + ["midX"], nil)
                        root.set(path: base + ["midY"], nil)
                    }
                }
                .controlSize(.small)
            }
        }
        .padding(8)
        .background(Corner.shape(Corner.group).fill(Color.secondary.opacity(0.06)))
    }
}
