import AppKit
import SwiftUI

/// Inspector controls bound to a path in a ContentDocument. An empty value
/// removes the key (the site then uses its default), like the web editor.

/// When typed text reaches the page: on Return, on leaving the field, and
/// for long text also after a pause — so the preview isn't redrawn on every
/// keystroke.
enum EditCommit {
    static let longText = 300
    static let idleDelay: TimeInterval = 5
}

/// A text field that keeps what's typed to itself and hands it over per
/// EditCommit. Changes from outside (undo, another field) show when it
/// isn't being edited.
struct CommitTextField: View {
    let placeholder: String
    let value: String
    var axis: Axis = .horizontal
    let commit: (String) -> Void

    @State private var draft = ""
    @State private var editing = false
    @State private var idle: DispatchWorkItem?
    @FocusState private var focused: Bool

    var body: some View {
        TextField(placeholder, text: $draft, axis: axis)
            .focused($focused)
            .onAppear { draft = value }
            .onSubmit { send() }
            .onChange(of: focused) { _, now in
                editing = now
                if !now { send() }
            }
            .onChange(of: value) { _, v in if !focused { draft = v } }
            .onChange(of: draft) { _, d in
                idle?.cancel()
                guard focused, d.count >= EditCommit.longText else { return }
                let work = DispatchWorkItem { send() }
                idle = work
                DispatchQueue.main.asyncAfter(deadline: .now() + EditCommit.idleDelay, execute: work)
            }
            .onDisappear { send() }
    }

    private func send() {
        idle?.cancel()
        if draft != value { commit(draft) }
    }
}

struct InspectorGroup<Content: View>: View {
    let title: String
    var defaultOpen = true
    var trailing: AnyView? = nil
    @ViewBuilder var content: Content
    @State private var open: Bool?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Button {
                    withAnimation(.easeOut(duration: 0.15)) { open = !(open ?? defaultOpen) }
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 9, weight: .semibold))
                            .rotationEffect(.degrees((open ?? defaultOpen) ? 90 : 0))
                            .foregroundStyle(.secondary)
                        Text(title).font(.system(size: 12, weight: .semibold))
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                Spacer()
                trailing
            }
            if open ?? defaultOpen {
                content
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .overlay(alignment: .top) { Divider() }
    }
}

struct FieldRow<Content: View>: View {
    let label: String
    var hint: String? = nil
    @ViewBuilder var content: Content

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(label)
                .font(.callout)
                .foregroundStyle(.secondary)
                .frame(width: 92, alignment: .leading)
                .help(hint ?? label)
            content.frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct JTextField: View {
    @ObservedObject var doc: ContentDocument
    let path: [Any]
    let label: String
    var placeholder = ""
    /// Text shown on the site: offers letter spacing and line height.
    var typography = false

    var body: some View {
        FieldRow(label: label) {
            HStack(spacing: 4) {
                CommitTextField(placeholder: placeholder, value: doc.root[path: path]?.string ?? "") {
                    doc.set(path, $0.isEmpty ? nil : .string($0), name: "Edit \(label)")
                }
                .textFieldStyle(.roundedBorder)
                if typography { TypographyButton(doc: doc, path: path) }
            }
        }
    }
}

/// Letter spacing and line height of one text field, kept beside it as
/// `<key>LetterSpacing` / `<key>LineHeight` (src/utils/typography.js).
struct TypographyButton: View {
    @ObservedObject var doc: ContentDocument
    let path: [Any]
    @State private var open = false
    // Kept for single fields whose size and color live elsewhere.

    static func sibling(_ path: [Any], _ suffix: String) -> [Any] {
        guard let last = path.last as? String else { return path }
        return Array(path.dropLast()) + [last + suffix]
    }

    var body: some View {
        let ls = Self.sibling(path, "LetterSpacing"), lh = Self.sibling(path, "LineHeight")
        let lsValue = doc.root[path: ls]?.string ?? "", lhValue = doc.root[path: lh]?.string ?? ""
        Button { open.toggle() } label: { Image(systemName: "textformat.size") }
            .buttonStyle(.borderless)
            .foregroundStyle(lsValue.isEmpty && lhValue.isEmpty ? .secondary : Color.accentColor)
            .help("Letter spacing and line height")
            .popover(isPresented: $open, arrowEdge: .bottom) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Text style").font(.headline)
                    TypographyFields(letterSpacing: lsValue, lineHeight: lhValue) { key, v in
                        doc.set(key == .letterSpacing ? ls : lh, v, name: key == .letterSpacing ? "Letter Spacing" : "Line Height")
                    }
                }
                .padding(14)
                .frame(minWidth: 300, alignment: .leading)
                .fixedSize()
            }
    }
}

struct JRichTextField: View {
    @ObservedObject var doc: ContentDocument
    let path: [Any]
    let label: String
    var placeholder = ""
    var typography = true

    var body: some View {
        FieldRow(label: label) {
            HStack(alignment: .top, spacing: 4) {
                RichTextField(html: doc.root[path: path]?.string ?? "", placeholder: placeholder) {
                    doc.set(path, .string($0), name: "Edit \(label)")
                }
                if typography { TypographyButton(doc: doc, path: path).padding(.top, 4) }
            }
        }
    }
}

struct JPicker: View {
    @ObservedObject var doc: ContentDocument
    let path: [Any]
    let label: String
    let options: [(String, String)]    // value, title ("" = default)
    var hint: String? = nil

    var body: some View {
        FieldRow(label: label, hint: hint) {
            let current = doc.root[path: path]?.string ?? ""
            Picker(label, selection: Binding(
                get: { current },
                set: { doc.set(path, $0.isEmpty ? nil : .string($0), name: "Change \(label)") })) {
                ForEach(options, id: \.0) { Text($0.1).tag($0.0) }
                if !current.isEmpty && !options.contains(where: { $0.0 == current }) {
                    Text(current).tag(current)
                }
            }
            .labelsHidden()
            .fixedSize()
        }
    }
}

struct JSegmented: View {
    @ObservedObject var doc: ContentDocument
    let path: [Any]
    let label: String
    let options: [(String, String)]
    var defaultValue = ""

    var body: some View {
        FieldRow(label: label) {
            Picker(label, selection: Binding(
                get: { doc.root[path: path]?.string ?? defaultValue },
                set: { doc.set(path, $0 == defaultValue ? nil : .string($0), name: "Change \(label)") })) {
                ForEach(options, id: \.0) { Text($0.1).tag($0.0) }
            }
            .labelsHidden()
            .pickerStyle(.segmented)
            .fixedSize()
        }
    }
}

/// CSS lengths as the site stores them ("80px", "0", "60%").
struct JLengthField: View {
    @ObservedObject var doc: ContentDocument
    let path: [Any]
    let label: String
    var placeholder = "Default"
    var hint: String? = nil

    var body: some View {
        FieldRow(label: label, hint: hint) {
            HStack(spacing: 6) {
                CommitTextField(placeholder: placeholder, value: doc.root[path: path]?.string ?? "") { v in
                    let t = v.trimmingCharacters(in: .whitespaces)
                    doc.set(path, t.isEmpty ? nil : .string(t), name: "Change \(label)")
                }
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 90)
                    .monospacedDigit()
                Text("e.g. 80px").font(.caption).foregroundStyle(.tertiary)
            }
        }
    }
}

struct JNumberField: View {
    @ObservedObject var doc: ContentDocument
    let path: [Any]
    let label: String
    var placeholder = "Default"
    var unit = ""

    var body: some View {
        FieldRow(label: label) {
            HStack(spacing: 6) {
                CommitTextField(placeholder: placeholder, value: doc.root[path: path]?.string ?? "") { v in
                    let t = v.trimmingCharacters(in: .whitespaces)
                    doc.set(path, t.isEmpty ? nil : (Double(t) != nil ? .number(t) : .string(t)), name: "Change \(label)")
                }
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 70)
                    .monospacedDigit()
                if !unit.isEmpty { Text(unit).font(.caption).foregroundStyle(.secondary) }
            }
        }
    }
}

struct JToggle: View {
    @ObservedObject var doc: ContentDocument
    let path: [Any]
    let label: String
    var invert = false
    /// The site treats a missing value as on (it checks `!== false`).
    var defaultOn = false

    var body: some View {
        Toggle(label, isOn: Binding(
            get: { defaultOn ? doc.root[path: path]?.bool != false : (doc.root[path: path]?.bool ?? false) != invert },
            set: { on in
                if defaultOn { doc.set(path, on ? nil : .bool(false), name: label) }
                else { doc.set(path, on != invert ? .bool(true) : nil, name: label) }
            }))
            .toggleStyle(.checkbox)
    }
}

struct JColorField: View {
    @ObservedObject var doc: ContentDocument
    let path: [Any]
    let label: String
    var placeholder = "Default"

    var body: some View {
        FieldRow(label: label) {
            let css = doc.root[path: path]?.string ?? ""
            HStack(spacing: 6) {
                ColorPicker(label, selection: Binding(
                    get: { Color(nsColor: InlineHTML.nsColor(css: css) ?? .clear) },
                    set: { doc.set(path, .string(InlineHTML.hex(NSColor($0))), name: "Change \(label)") }),
                    supportsOpacity: false)
                    .labelsHidden()
                CommitTextField(placeholder: placeholder, value: css) {
                    doc.set(path, $0.isEmpty ? nil : .string($0), name: "Change \(label)")
                }
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 96)
                    .font(.system(.body, design: .monospaced))
                if !css.isEmpty {
                    Button { doc.set(path, nil, name: "Clear \(label)") } label: { Image(systemName: "xmark.circle.fill") }
                        .buttonStyle(.plain).foregroundStyle(.tertiary).help("Use the default")
                }
            }
        }
    }
}

/// Corner radii matched to macOS: continuous ("squircle") corners, sizes as
/// the system uses them, and nested shapes concentric (inner radius = outer
/// radius − the padding between them).
enum Corner {
    /// Badges, tags, number chips.
    static let tag: CGFloat = 4
    /// Text fields, small thumbnails, highlighted rows inside a panel.
    static let control: CGFloat = 6
    /// Thumbnails of 50 pt and up, rows in a list.
    static let tile: CGFloat = 8
    /// Grouped boxes, the preview's frame.
    static let group: CGFloat = 10
    /// Floating panels (Go to, like Spotlight).
    static let panel: CGFloat = 12

    static func shape(_ radius: CGFloat) -> RoundedRectangle { RoundedRectangle(cornerRadius: radius, style: .continuous) }
    /// An icon tile: the app icon's proportion.
    static func icon(_ size: CGFloat) -> RoundedRectangle { shape(size * 0.225) }
}

enum SiteOptions {
    static let fontSizes: [(String, String)] = [("", "Default")]
        + (12...30).map { ("\($0)px", "\($0)px") } + [32, 36, 40, 44, 48].map { ("\($0)px", "\($0)px") }
    static let fonts: [(String, String)] = [("", "Default"), ("Red Hat Display", "Red Hat Display"), ("Inter", "Inter"), ("Poppins", "Poppins"),
        ("DM Sans", "DM Sans"), ("Manrope", "Manrope"), ("Outfit", "Outfit"), ("Plus Jakarta Sans", "Plus Jakarta Sans"), ("Geist", "Geist"),
        ("Nunito Sans", "Nunito Sans"), ("Space Grotesk", "Space Grotesk"), ("Epilogue", "Epilogue"), ("system-ui", "System UI"),
        ("Georgia, serif", "Georgia (serif)"), ("ui-monospace, monospace", "Monospace")]
    static let weights: [(String, String)] = [("", "Default")] + (3...9).map { ("\($0)00", "\($0)00") }
    static let ratios: [(String, String)] = [
        ("", "Default"), ("10/3", "10:3"), ("2/1", "2:1"), ("16/9", "16:9"), ("16/10", "16:10"), ("3/2", "3:2"),
        ("4/3", "4:3"), ("5/4", "5:4"), ("1/1", "1:1"), ("4/5", "4:5"), ("3/4", "3:4"), ("2/3", "2:3"), ("9/16", "9:16"),
    ]
    static let align: [(String, String)] = [("left", "Left"), ("center", "Center"), ("right", "Right")]
}

/// A text the site shows, with its style beside it the way the web form
/// stored it: `<prefix>Size` (and `SizeTablet` / `SizeMobile`), `Weight`,
/// `Color`, `Font`, `LetterSpacing`, `LineHeight` — next to the text in the
/// same object. The style opens from the button at the field's end.
struct JStyledText: View {
    @ObservedObject var doc: ContentDocument
    let path: [Any]
    let label: String
    var placeholder = ""
    var rich = false
    /// Style key prefix; the text's own key when nil ("title" → titleSize).
    var prefix: String? = nil
    var scope: SizeScope = .all
    /// Which style controls apply (the site reads only these for this text).
    var styles: Set<TextStyleKey> = [.size, .weight, .color, .font]

    var body: some View {
        FieldRow(label: label) {
            HStack(alignment: rich ? .top : .center, spacing: 4) {
                if rich {
                    RichTextField(html: doc.root[path: path]?.string ?? "", placeholder: placeholder) {
                        doc.set(path, .string($0), name: "Edit \(label)")
                    }
                } else {
                    CommitTextField(placeholder: placeholder, value: doc.root[path: path]?.string ?? "") {
                        doc.set(path, $0.isEmpty ? nil : .string($0), name: "Edit \(label)")
                    }
                    .textFieldStyle(.roundedBorder)
                }
                TextStyleButton(doc: doc, parent: Array(path.dropLast()), prefix: prefix ?? (path.last as? String ?? ""),
                                scope: scope, styles: styles)
                    .padding(.top, rich ? 4 : 0)
            }
        }
    }
}

enum TextStyleKey: Hashable { case size, weight, color, font, italic }

/// The style popover for one text: the keys `parent + [prefix + "Size"…]`.
struct TextStyleButton: View {
    @ObservedObject var doc: ContentDocument
    let parent: [Any]
    let prefix: String
    var scope: SizeScope = .all
    var styles: Set<TextStyleKey> = [.size, .weight, .color, .font]
    @State private var open = false

    private func key(_ suffix: String) -> [Any] { parent + [prefix + suffix] }
    private func value(_ suffix: String) -> String { doc.root[path: key(suffix)]?.string ?? "" }
    private var sizeSuffix: String { scope == .all ? "Size" : scope == .tablet ? "SizeTablet" : "SizeMobile" }

    private var customized: Bool {
        ["Size", "SizeTablet", "SizeMobile", "Weight", "Color", "Font", "Italic", "LetterSpacing", "LineHeight"]
            .contains { doc.root[path: key($0)].map { $0 != .string("") && $0 != .null && $0 != .bool(false) } ?? false }
    }

    var body: some View {
        Button { open.toggle() } label: { Image(systemName: "textformat.size") }
            .buttonStyle(.borderless)
            .foregroundStyle(customized ? Color.accentColor : .secondary)
            .help("Size, weight, color, font, letter spacing and line height")
            .popover(isPresented: $open, arrowEdge: .bottom) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Text style").font(.headline)
                    if styles.contains(.size) {
                        let sizes = scope == .all ? SiteOptions.fontSizes : [("", "Same as larger")] + SiteOptions.fontSizes.dropFirst()
                        FieldRow(label: scope == .all ? "Size" : "\(scope.label) size") {
                            Picker("Size", selection: Binding(get: { value(sizeSuffix) },
                                                              set: { doc.set(key(sizeSuffix), $0.isEmpty ? nil : .string($0), name: "Text Size") })) {
                                ForEach(sizes, id: \.0) { Text($0.1).tag($0.0) }
                                if !value(sizeSuffix).isEmpty && !sizes.contains(where: { $0.0 == value(sizeSuffix) }) {
                                    Text(value(sizeSuffix)).tag(value(sizeSuffix))
                                }
                            }
                            .labelsHidden().fixedSize()
                        }
                    }
                    if styles.contains(.weight) {
                        FieldRow(label: "Weight") {
                            Picker("Weight", selection: Binding(get: { value("Weight") },
                                                                set: { doc.set(key("Weight"), $0.isEmpty ? nil : .string($0), name: "Text Weight") })) {
                                ForEach(SiteOptions.weights, id: \.0) { Text($0.1).tag($0.0) }
                            }
                            .labelsHidden().fixedSize()
                        }
                    }
                    if styles.contains(.color) {
                        JColorField(doc: doc, path: key("Color"), label: "Color")
                    }
                    if styles.contains(.font) {
                        FieldRow(label: "Font") {
                            Picker("Font", selection: Binding(get: { value("Font") },
                                                              set: { doc.set(key("Font"), $0.isEmpty ? nil : .string($0), name: "Text Font") })) {
                                ForEach(SiteOptions.fonts, id: \.0) { Text($0.1).tag($0.0) }
                                if !value("Font").isEmpty && !SiteOptions.fonts.contains(where: { $0.0 == value("Font") }) {
                                    Text(value("Font")).tag(value("Font"))
                                }
                            }
                            .labelsHidden().fixedSize()
                        }
                    }
                    if styles.contains(.italic) {
                        Toggle("Italic", isOn: Binding(get: { doc.root[path: key("Italic")]?.bool == true },
                                                       set: { doc.set(key("Italic"), $0 ? .bool(true) : nil, name: "Italic") }))
                            .toggleStyle(.checkbox)
                    }
                    Divider()
                    TypographyFields(letterSpacing: value("LetterSpacing"), lineHeight: value("LineHeight")) { k, v in
                        doc.set(key(k == .letterSpacing ? "LetterSpacing" : "LineHeight"), v, name: k == .letterSpacing ? "Letter Spacing" : "Line Height")
                    }
                }
                .padding(14)
                .frame(minWidth: 320, alignment: .leading)
                .fixedSize()
            }
    }
}
