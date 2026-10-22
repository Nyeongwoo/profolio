import AppKit
import SwiftUI

/// The site's inline text format (what src/utils/sanitizeInline.js keeps):
/// <b>/<strong>, <i>/<em>, <u>, <br>, <a href>, and color via
/// <span style="color: …"> or <font color>. Converted to and from attributed
/// text for editing.
enum InlineHTML {
    static let colorKey = NSAttributedString.Key("pofoleColor")   // CSS color string as written
    static let linkKey = NSAttributedString.Key("pofoleLink")

    static func attributed(_ html: String, font: NSFont) -> NSAttributedString {
        let out = NSMutableAttributedString()
        struct Style { var bold = false, italic = false, underline = false; var color: String?; var link: String? }
        var stack = [Style()]
        var tagStack: [String] = []
        let scanner = Scanner(string: html)
        scanner.charactersToBeSkipped = nil

        func append(_ text: String) {
            guard !text.isEmpty else { return }
            let s = stack.last!
            out.append(NSAttributedString(string: decode(text), attributes: attributes(bold: s.bold, italic: s.italic, underline: s.underline,
                                                                                          color: s.color, link: s.link, font: font)))
        }

        while !scanner.isAtEnd {
            if let text = scanner.scanUpToString("<") { append(text) }
            guard !scanner.isAtEnd, scanner.scanString("<") != nil else { break }
            let tag = scanner.scanUpToString(">") ?? ""
            _ = scanner.scanString(">")
            let closing = tag.hasPrefix("/")
            let name = tag.trimmingCharacters(in: CharacterSet(charactersIn: "/ ")).split(separator: " ").first.map { $0.lowercased() } ?? ""
            if name == "br" { append("\n"); continue }
            if name == "div" || name == "p" {   // legacy line wrappers
                if closing { append("\n") }
                continue
            }
            if closing {
                if let i = tagStack.lastIndex(of: name) {
                    tagStack.remove(at: i)
                    if stack.count > 1 { stack.removeLast() }
                }
                continue
            }
            var s = stack.last!
            switch name {
            case "b", "strong": s.bold = true
            case "i", "em": s.italic = true
            case "u": s.underline = true
            case "a": s.link = attribute("href", in: tag)
            case "span", "font": break
            default: continue
            }
            // Any kept tag may carry color/weight/style (sanitizeInline keeps them).
            if let c = (name == "font" ? attribute("color", in: tag) : nil) ?? style("color", in: tag) { s.color = c }
            if let w = style("font-weight", in: tag), w == "bold" || w == "bolder" || Int(w).map({ $0 >= 600 }) == true { s.bold = true }
            if let fs = style("font-style", in: tag), fs.hasPrefix("italic") || fs.hasPrefix("oblique") { s.italic = true }
            stack.append(s)
            tagStack.append(name)
        }
        return out
    }

    static func attributes(bold: Bool, italic: Bool, underline: Bool, color: String?, link: String?, font: NSFont) -> [NSAttributedString.Key: Any] {
        var traits: NSFontDescriptor.SymbolicTraits = []
        if bold { traits.insert(.bold) }
        if italic { traits.insert(.italic) }
        let f = NSFont(descriptor: font.fontDescriptor.withSymbolicTraits(traits), size: font.pointSize) ?? font
        var a: [NSAttributedString.Key: Any] = [.font: f, .foregroundColor: NSColor.labelColor]
        if underline { a[.underlineStyle] = NSUnderlineStyle.single.rawValue }
        if let color { a[colorKey] = color; a[.foregroundColor] = nsColor(css: color) ?? NSColor.labelColor }
        if let link { a[linkKey] = link; a[.underlineStyle] = NSUnderlineStyle.single.rawValue; a[.foregroundColor] = NSColor.linkColor }
        return a
    }

    static func html(_ text: NSAttributedString) -> String {
        var out = ""
        text.enumerateAttributes(in: NSRange(location: 0, length: text.length)) { attrs, range, _ in
            let chunk = (text.string as NSString).substring(with: range)
            let traits = (attrs[.font] as? NSFont)?.fontDescriptor.symbolicTraits ?? []
            let link = attrs[linkKey] as? String
            let color = attrs[colorKey] as? String
            let underline = link == nil && (attrs[.underlineStyle] as? Int ?? 0) != 0
            var open = "", close = ""
            if let link { open += "<a href=\"\(escape(link))\">"; close = "</a>" + close }
            if let color { open += "<span style=\"color: \(escape(color));\">"; close = "</span>" + close }
            if traits.contains(.bold) { open += "<b>"; close = "</b>" + close }
            if traits.contains(.italic) { open += "<i>"; close = "</i>" + close }
            if underline { open += "<u>"; close = "</u>" + close }
            let body = escape(chunk).replacingOccurrences(of: "\n", with: "<br>")
            out += open + body + close
        }
        return out
    }

    static func plain(_ html: String) -> String {
        decode(html.replacingOccurrences(of: "<br\\s*/?>", with: "\n", options: .regularExpression)
            .replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression))
    }

    private static func escape(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\"", with: "&quot;")
    }

    private static func decode(_ s: String) -> String {
        s.replacingOccurrences(of: "&nbsp;", with: "\u{A0}").replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">").replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "&#39;", with: "'").replacingOccurrences(of: "&amp;", with: "&")
    }

    private static func attribute(_ name: String, in tag: String) -> String? {
        guard let r = tag.range(of: "\(name)\\s*=\\s*(\"[^\"]*\"|'[^']*')", options: [.regularExpression, .caseInsensitive]) else { return nil }
        let v = tag[r].split(separator: "=", maxSplits: 1)[1].trimmingCharacters(in: .whitespaces)
        return String(v.dropFirst().dropLast())
    }

    private static func style(_ prop: String, in tag: String) -> String? {
        guard let css = attribute("style", in: tag) else { return nil }
        for decl in css.split(separator: ";") {
            let kv = decl.split(separator: ":", maxSplits: 1).map { $0.trimmingCharacters(in: .whitespaces) }
            if kv.count == 2, kv[0].lowercased() == prop { return kv[1] }
        }
        return nil
    }

    /// #rgb, #rrggbb, rgb(r, g, b), rgba(…).
    static func nsColor(css: String) -> NSColor? {
        let s = css.trimmingCharacters(in: .whitespaces).lowercased()
        if s.hasPrefix("#") {
            var hex = String(s.dropFirst())
            if hex.count == 3 { hex = hex.map { "\($0)\($0)" }.joined() }
            guard hex.count >= 6, let v = UInt32(hex.prefix(6), radix: 16) else { return nil }
            return NSColor(srgbRed: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255, blue: CGFloat(v & 0xFF) / 255, alpha: 1)
        }
        if s.hasPrefix("rgb") {
            let nums = s.components(separatedBy: CharacterSet(charactersIn: "0123456789.").inverted).compactMap(Double.init)
            guard nums.count >= 3 else { return nil }
            return NSColor(srgbRed: nums[0] / 255, green: nums[1] / 255, blue: nums[2] / 255, alpha: nums.count > 3 ? nums[3] : 1)
        }
        return nil
    }

    static func hex(_ color: NSColor) -> String {
        guard let c = color.usingColorSpace(.sRGB) else { return "#000000" }
        return String(format: "#%02X%02X%02X", Int(round(c.redComponent * 255)), Int(round(c.greenComponent * 255)), Int(round(c.blueComponent * 255)))
    }
}

/// Edits one line of the site's inline text: ⌘B / ⌘I / ⌘U, plus a color
/// and link from the context menu. Grows with its content.
///
/// Edits reach the page (and the preview) on Return, when the field loses
/// focus, or — for text of `EditCommit.longText` characters or more — five
/// seconds after the typing stops. Shift-Return or Option-Return adds a
/// line break.
struct RichTextField: NSViewRepresentable {
    var html: String
    var placeholder = ""
    var fontSize: CGFloat = 13
    var onChange: (String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeNSView(context: Context) -> InlineTextView {
        let view = InlineTextView()
        view.delegate = context.coordinator
        view.isRichText = true
        // Undo is the page's (ContentDocument), not the text view's.
        view.allowsUndo = false
        view.drawsBackground = true
        view.backgroundColor = .textBackgroundColor
        view.textContainerInset = NSSize(width: 4, height: 5)
        view.textContainer?.widthTracksTextView = true
        view.isVerticallyResizable = true
        view.isHorizontallyResizable = false
        view.font = .systemFont(ofSize: fontSize)
        view.placeholder = placeholder
        view.wantsLayer = true
        view.layer?.cornerRadius = Corner.control
        view.layer?.cornerCurve = .continuous
        view.layer?.borderWidth = 1
        view.layer?.borderColor = NSColor.separatorColor.cgColor
        context.coordinator.load(html, into: view)
        let coordinator = context.coordinator
        view.onDetach = { [weak view] in if let view { coordinator.commit(view) } }
        return view
    }

    func updateNSView(_ view: InlineTextView, context: Context) {
        context.coordinator.parent = self
        view.placeholder = placeholder
        // Replace the text only when it changed from outside (undo, reload),
        // never while the viewer is typing in it.
        if html != context.coordinator.lastHTML && view.window?.firstResponder != view {
            context.coordinator.load(html, into: view)
        }
    }

    func sizeThatFits(_ proposal: ProposedViewSize, nsView: InlineTextView, context: Context) -> CGSize? {
        let width = proposal.width ?? 260
        guard let container = nsView.textContainer, let layout = nsView.layoutManager else { return nil }
        container.containerSize = NSSize(width: width - nsView.textContainerInset.width * 2, height: .greatestFiniteMagnitude)
        layout.ensureLayout(for: container)
        let h = layout.usedRect(for: container).height + nsView.textContainerInset.height * 2
        return CGSize(width: width, height: max(h, fontSize + 16))
    }

    final class Coordinator: NSObject, NSTextViewDelegate {
        var parent: RichTextField
        var lastHTML = ""

        init(_ parent: RichTextField) { self.parent = parent }

        private var idle: DispatchWorkItem?

        func load(_ html: String, into view: NSTextView) {
            idle?.cancel()
            lastHTML = html
            view.textStorage?.setAttributedString(InlineHTML.attributed(html, font: .systemFont(ofSize: parent.fontSize)))
            view.typingAttributes = [.font: NSFont.systemFont(ofSize: parent.fontSize), .foregroundColor: NSColor.labelColor]
            view.invalidateIntrinsicContentSize()
        }

        func textDidChange(_ notification: Notification) {
            guard let view = notification.object as? NSTextView else { return }
            view.invalidateIntrinsicContentSize()
            idle?.cancel()
            guard view.string.count >= EditCommit.longText else { return }
            let work = DispatchWorkItem { [weak self, weak view] in
                guard let self, let view else { return }
                self.commit(view)
            }
            idle = work
            DispatchQueue.main.asyncAfter(deadline: .now() + EditCommit.idleDelay, execute: work)
        }

        /// Hands the text to the page, if it changed since the last time.
        func commit(_ view: NSTextView) {
            idle?.cancel()
            guard let storage = view.textStorage else { return }
            let html = InlineHTML.html(storage)
            guard html != lastHTML else { return }
            lastHTML = html
            parent.onChange(html)
        }

        func textDidEndEditing(_ notification: Notification) {
            if let view = notification.object as? NSTextView { commit(view) }
        }

        func textView(_ textView: NSTextView, doCommandBy selector: Selector) -> Bool {
            switch selector {
            case #selector(NSResponder.insertNewline(_:)):
                commit(textView)
                return true
            case #selector(NSResponder.insertLineBreak(_:)), #selector(NSResponder.insertNewlineIgnoringFieldEditor(_:)):
                textView.insertText("\n", replacementRange: textView.selectedRange())
                return true
            default:
                return false
            }
        }
    }
}

final class InlineTextView: NSTextView {
    var placeholder = "" { didSet { needsDisplay = true } }
    /// Leaving the window (another page opened) commits what was typed.
    var onDetach: (() -> Void)?

    override func viewWillMove(toWindow newWindow: NSWindow?) {
        if newWindow == nil { onDetach?() }
        super.viewWillMove(toWindow: newWindow)
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        if string.isEmpty && !placeholder.isEmpty {
            NSAttributedString(string: placeholder, attributes: [.font: font ?? .systemFont(ofSize: 13), .foregroundColor: NSColor.placeholderTextColor])
                .draw(at: NSPoint(x: textContainerInset.width + 5, y: textContainerInset.height))
        }
    }

    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        guard window?.firstResponder == self, event.modifierFlags.intersection(.deviceIndependentFlagsMask) == .command else {
            return super.performKeyEquivalent(with: event)
        }
        switch event.charactersIgnoringModifiers {
        case "b": toggle(.bold); return true
        case "i": toggle(.italic); return true
        case "u": toggleUnderline(); return true
        default: return super.performKeyEquivalent(with: event)
        }
    }

    override func menu(for event: NSEvent) -> NSMenu? {
        let menu = super.menu(for: event) ?? NSMenu()
        menu.insertItem(.separator(), at: 0)
        menu.insertItem(NSMenuItem(title: "Remove Color", action: #selector(removeColor), keyEquivalent: ""), at: 0)
        menu.insertItem(NSMenuItem(title: "Color…", action: #selector(pickColor), keyEquivalent: ""), at: 0)
        menu.insertItem(NSMenuItem(title: "Link…", action: #selector(addLink), keyEquivalent: ""), at: 0)
        menu.insertItem(NSMenuItem(title: "Underline  ⌘U", action: #selector(underlineAction), keyEquivalent: ""), at: 0)
        menu.insertItem(NSMenuItem(title: "Italic  ⌘I", action: #selector(italicAction), keyEquivalent: ""), at: 0)
        menu.insertItem(NSMenuItem(title: "Bold  ⌘B", action: #selector(boldAction), keyEquivalent: ""), at: 0)
        return menu
    }

    @objc private func boldAction() { toggle(.bold) }
    @objc private func italicAction() { toggle(.italic) }
    @objc private func underlineAction() { toggleUnderline() }

    private func edit(_ change: (NSTextStorage, NSRange) -> Void) {
        let range = selectedRange()
        guard range.length > 0, let storage = textStorage, shouldChangeText(in: range, replacementString: nil) else { return }
        storage.beginEditing()
        change(storage, range)
        storage.endEditing()
        didChangeText()
    }

    private func toggle(_ trait: NSFontDescriptor.SymbolicTraits) {
        let range = selectedRange()
        guard range.length > 0, let storage = textStorage else { return }
        let all = (0..<range.length).allSatisfy { i in
            ((storage.attribute(.font, at: range.location + i, effectiveRange: nil) as? NSFont)?.fontDescriptor.symbolicTraits ?? []).contains(trait)
        }
        edit { storage, range in
            storage.enumerateAttribute(.font, in: range) { value, r, _ in
                let f = value as? NSFont ?? .systemFont(ofSize: 13)
                var traits = f.fontDescriptor.symbolicTraits
                if all { traits.remove(trait) } else { traits.insert(trait) }
                storage.addAttribute(.font, value: NSFont(descriptor: f.fontDescriptor.withSymbolicTraits(traits), size: f.pointSize) ?? f, range: r)
            }
        }
    }

    private func toggleUnderline() {
        let range = selectedRange()
        guard range.length > 0, let storage = textStorage else { return }
        let on = (storage.attribute(.underlineStyle, at: range.location, effectiveRange: nil) as? Int ?? 0) != 0
        edit { storage, range in
            if on { storage.removeAttribute(.underlineStyle, range: range) }
            else { storage.addAttribute(.underlineStyle, value: NSUnderlineStyle.single.rawValue, range: range) }
        }
    }

    @objc private func pickColor() {
        let alert = NSAlert()
        alert.messageText = "Text color"
        let well = NSColorWell(frame: NSRect(x: 0, y: 0, width: 60, height: 28))
        well.color = .black
        alert.accessoryView = well
        alert.addButton(withTitle: "Apply")
        alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        let css = InlineHTML.hex(well.color)
        edit { storage, range in
            storage.addAttribute(InlineHTML.colorKey, value: css, range: range)
            storage.addAttribute(.foregroundColor, value: well.color, range: range)
        }
    }

    @objc private func removeColor() {
        edit { storage, range in
            storage.removeAttribute(InlineHTML.colorKey, range: range)
            storage.addAttribute(.foregroundColor, value: NSColor.labelColor, range: range)
        }
    }

    @objc private func addLink() {
        let alert = NSAlert()
        alert.messageText = "Link"
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 320, height: 24))
        field.placeholderString = "https://… or /projects/…"
        alert.accessoryView = field
        alert.addButton(withTitle: "Apply")
        alert.addButton(withTitle: "Remove Link")
        alert.addButton(withTitle: "Cancel")
        alert.window.initialFirstResponder = field
        let response = alert.runModal()
        let url = field.stringValue.trimmingCharacters(in: .whitespaces)
        edit { storage, range in
            if response == .alertFirstButtonReturn, !url.isEmpty {
                storage.addAttribute(InlineHTML.linkKey, value: url, range: range)
                storage.addAttribute(.underlineStyle, value: NSUnderlineStyle.single.rawValue, range: range)
                storage.addAttribute(.foregroundColor, value: NSColor.linkColor, range: range)
            } else if response == .alertSecondButtonReturn {
                storage.removeAttribute(InlineHTML.linkKey, range: range)
                storage.removeAttribute(.underlineStyle, range: range)
                storage.addAttribute(.foregroundColor, value: NSColor.labelColor, range: range)
            }
        }
    }
}
