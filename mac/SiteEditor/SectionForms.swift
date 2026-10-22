import SwiftUI

/// A project's or original's page: its type, place and folder (sections
/// there have a few more settings, and frames and icons live in its folder).
struct DetailContext {
    let type: String        // projects | originals
    let category: String
    let id: String
    let folder: URL
}

/// Every section type's own settings, natively — what the web form's
/// section editor (src/pages/editor/EditorSectionsEditor.jsx) had, with
/// the same keys. Image lists come from the inspector (`images`), since
/// where they're stored depends on the page.
struct SectionTypeFields: View {
    @ObservedObject var model: EditorModel
    @ObservedObject var doc: ContentDocument
    let base: [Any]
    let type: String
    let scope: SizeScope
    /// An image list editor for (path, label, phone images?).
    let images: ([Any], String, Bool) -> AnyView
    let hasMobileImages: Bool
    /// Opens a card on the Card tab.
    let openCard: (Int) -> Void
    let addCard: () -> Void
    var detail: DetailContext? = nil
    var hasTabletImages = false

    private var section: JSONValue? { doc.root[path: base] }
    private func p(_ keys: Any...) -> [Any] { base + keys }

    var body: some View {
        switch type {
        case "text": text
        case "images": imagesSection
        case "image-text", "image-text-carousel": cards
        case "image-grid": grid
        case "text-columns": textColumns
        case "scroll-animation": scrollAnimation
        case "model-viewer": modelViewer
        case "tab-switcher": tabSwitcher
        case "feature-tabs": featureTabs
        case "image-tab": imageTabs
        case "accordion": accordion
        case "video-background": video
        case "stats": stats
        case "interactive": interactive
        default:
            InspectorGroup(title: "Content") {
                Text("Unknown section type “\(type)”.").font(.callout).foregroundStyle(.secondary)
            }
        }
        if detail != nil {
            InspectorGroup(title: "Background image", defaultOpen: section?["bgImage"] != nil) {
                JTextField(doc: doc, path: p("bgImage"), label: "Image", placeholder: "bg.webp (page folder) or /assets/…")
            }
        }
    }

    // MARK: Text

    @ViewBuilder private var text: some View {
        InspectorGroup(title: "Text") {
            LinesEditor(doc: doc, path: p("lines"), legacyPath: base, scope: scope)
            JSegmented(doc: doc, path: p("textAlign"), label: "Align", options: SiteOptions.align, defaultValue: "left")
            JLengthField(doc: doc, path: p("textMaxWidth"), label: "Max width", placeholder: "700px")
        }
        InspectorGroup(title: "Link", defaultOpen: section?["link"] != nil) {
            JTextField(doc: doc, path: p("link"), label: "Link", placeholder: "https://…")
            JToggle(doc: doc, path: p("linkDisabled"), label: "Disable link")
            JPicker(doc: doc, path: p("previewStyle"), label: "Preview",
                    options: [("", "None — link only"), ("simple", "Simple link chip"), ("og", "Card (title, text, image)")])
            if section?["previewStyle"]?.string == "og" {
                LinkPreviewFetch(model: model, doc: doc, base: base)
                JTextField(doc: doc, path: p("ogTitle"), label: "Card title", typography: true)
                JTextField(doc: doc, path: p("ogDescription"), label: "Card text", typography: true)
                JTextField(doc: doc, path: p("ogSiteName"), label: "Site name", typography: true)
                JTextField(doc: doc, path: p("ogImage"), label: "Image", placeholder: "https://… or /assets/…")
                JLengthField(doc: doc, path: p("ogTitleSize\(suffix)"), label: "Title size", placeholder: same("Default"))
                JLengthField(doc: doc, path: p("ogDescSize\(suffix)"), label: "Text size", placeholder: same("Default"))
                JLengthField(doc: doc, path: p("ogSiteSize\(suffix)"), label: "Site size", placeholder: same("Default"))
                JNumberField(doc: doc, path: p("ogSize\(suffix)"), label: "Card size", placeholder: same("100"), unit: "%")
            }
        }
    }

    // MARK: Images

    @ViewBuilder private var imagesSection: some View {
        InspectorGroup(title: "Images") {
            images(p("images"), "Desktop", false)
            JPicker(doc: doc, path: p("desktopRatio"), label: "Ratio", options: SiteOptions.ratios)
            JPicker(doc: doc, path: p("mobileRatio"), label: "Phone ratio", options: SiteOptions.ratios)
            JToggle(doc: doc, path: p("matchTextPadding"), label: "Keep to the page’s side padding (not edge to edge)")
        }
        InspectorGroup(title: "Text over image", defaultOpen: section?["overlay"] != nil) {
            LinesEditor(doc: doc, path: p("overlay", "lines"), legacyPath: p("overlay"), scope: scope)
            JSegmented(doc: doc, path: p("overlay", "position"), label: "Position",
                       options: [("left", "Left"), ("center", "Center")], defaultValue: "left")
            JLengthField(doc: doc, path: p("overlay", "textMaxWidth"), label: "Max width", placeholder: "320px")
            if detail != nil {
                JLengthField(doc: doc, path: p("overlay", "mobileTextMaxWidth"), label: "Phone max width", placeholder: "320px")
            }
        }
        if hasMobileImages {
            InspectorGroup(title: "Phone images", defaultOpen: !(section?["mobileImages"]?.array?.isEmpty ?? true)) {
                images(p("mobileImages"), "Shown on phones instead (optional)", true)
            }
        }
        if hasTabletImages {
            InspectorGroup(title: "Tablet images", defaultOpen: section?["tabletImages"] != nil) {
                images(p("tabletImages"), "Per image, for tablets (optional)", false)
            }
        }
    }

    // MARK: Image + Text / Carousel

    @ViewBuilder private var cards: some View {
        InspectorGroup(title: "Cards", trailing: AnyView(Button("Add") { addCard() }.controlSize(.small))) {
            CardListView(doc: doc, blocksPath: p("blocks"), open: openCard)
        }
        if type == "image-text" {
            InspectorGroup(title: "Layout") {
                JToggle(doc: doc, path: p("matchTextPadding"), label: "Keep to the page’s side padding (not edge to edge)")
                JToggle(doc: doc, path: p("iconList"), label: "Icon list (small round image left, text right)")
                if section?["iconList"]?.bool == true {
                    JIntPicker(doc: doc, path: p("iconColumns"), label: "Columns", values: [1, 2, 3, 4], defaultValue: 1)
                    JIntPicker(doc: doc, path: p("tabletColumns"), label: "Tablet columns", values: [1, 2, 3, 4], defaultLabel: "Default (2)")
                    JNumberField(doc: doc, path: p("iconSize\(suffix)"), label: "Icon size", placeholder: scope == .mobile ? "44" : same("56"), unit: "px")
                    JNumberField(doc: doc, path: p("iconGap\(suffix)"), label: "Icon gap", placeholder: same("20"), unit: "px")
                }
                JToggle(doc: doc, path: p("limitPreview"), label: "Show 3 cards, then a “Show more” button")
                JNumberField(doc: doc, path: p(scope == .all ? "cardHeight" : "cardHeightTablet"), label: scope == .all ? "Card height" : "Tablet height",
                             placeholder: scope == .all ? "Ratio" : "Same", unit: "px")
                JNumberField(doc: doc, path: p("imageTextGap"), label: "Image–text gap", placeholder: "40", unit: "px")
            }
            if detail != nil {
                InspectorGroup(title: "Columns", defaultOpen: (section?["columns"]?.int ?? 1) > 1) {
                    JIntPicker(doc: doc, path: p("columns"), label: "Columns", values: [1, 2, 3, 4], defaultValue: 1)
                    if (section?["columns"]?.int ?? 1) > 1 {
                        JNumberField(doc: doc, path: p("carouselBreakpoint"), label: "Carousel below", placeholder: "768", unit: "px")
                        JNumberField(doc: doc, path: p("columnGap"), label: "Column gap", placeholder: "40", unit: "px")
                        JNumberField(doc: doc, path: p("rowGap"), label: "Row gap", placeholder: "60", unit: "px")
                        JNumberField(doc: doc, path: p("gridImageWidth"), label: "Image size", placeholder: "100", unit: "%")
                        JNumberField(doc: doc, path: p("imageGap"), label: "Image–caption", placeholder: "20", unit: "px")
                        JPicker(doc: doc, path: p("gridPadding"), label: "Side padding", options: [("", "Default (15%)"), ("0", "Full width")])
                    }
                    JToggle(doc: doc, path: p("sharedText"), label: "One text for all the cards")
                    if section?["sharedText"]?.bool == true {
                        LinesEditor(doc: doc, path: p("sharedLines"), legacyPath: p("sharedLinesLegacy"), scope: scope)
                    }
                    JToggle(doc: doc, path: p("noPaddingDesktop"), label: "No vertical padding on desktop")
                    JToggle(doc: doc, path: p("noPaddingMobile"), label: "No vertical padding on phones")
                }
            }
        } else {
            InspectorGroup(title: "Layout") {
                JPicker(doc: doc, path: p("cardSize"), label: "Card width",
                        options: [("", "Medium — 70%"), ("small", "Small — 40%"), ("large", "Large — 90%")])
                JPicker(doc: doc, path: p("cardRatio"), label: "Card ratio", options: SiteOptions.ratios)
                JNumberField(doc: doc, path: p("cardHeight"), label: "Card height", placeholder: "Width", unit: "px")
                JNumberField(doc: doc, path: p("cardHeightTablet"), label: "Tablet height", placeholder: "Same", unit: "px")
                if detail != nil {
                    JNumberField(doc: doc, path: p("carouselMaxWidth"), label: "Max width", placeholder: "1600", unit: "px")
                }
            }
        }
    }

    // MARK: Grid

    @ViewBuilder private var grid: some View {
        InspectorGroup(title: "Images") {
            images(p("images"), "Images", false)
            JPicker(doc: doc, path: p("desktopRatio"), label: "Ratio", options: SiteOptions.ratios)
            JPicker(doc: doc, path: p("mobileRatio"), label: "Phone ratio", options: SiteOptions.ratios)
        }
        InspectorGroup(title: "Grid") {
            switch scope {
            case .all:
                JIntPicker(doc: doc, path: p("columns"), label: "Columns", values: Array(1...6), defaultValue: 4)
                JIntPicker(doc: doc, path: p("rows"), label: "Rows", values: Array(1...6), defaultLabel: "Auto")
                JLengthField(doc: doc, path: p("gap"), label: "Gap", placeholder: "4px")
            case .tablet:
                JIntPicker(doc: doc, path: p("tabletColumns"), label: "Columns", values: Array(1...6), defaultValue: 3)
                JIntPicker(doc: doc, path: p("tabletRows"), label: "Rows", values: Array(1...6), defaultLabel: "Auto")
            case .mobile:
                JIntPicker(doc: doc, path: p("mobileColumns"), label: "Columns", values: Array(1...4), defaultValue: 2)
                JIntPicker(doc: doc, path: p("mobileRows"), label: "Rows", values: Array(1...4), defaultLabel: "Auto")
                JLengthField(doc: doc, path: p("mobileGap"), label: "Gap", placeholder: "Same")
                JNumberField(doc: doc, path: p("mobilePadding"), label: "Side padding", placeholder: "20", unit: "px")
            }
            JLengthField(doc: doc, path: p("textMaxWidth"), label: "Max width", placeholder: "Default",
                         hint: "Match a Text section next to it so the edges line up")
        }
    }

    // MARK: Text columns

    @ViewBuilder private var textColumns: some View {
        let cols = section?["columns"]?.array ?? []
        InspectorGroup(title: "Columns") {
            FieldRow(label: "Columns") {
                Picker("Columns", selection: Binding(get: { max(2, cols.count) }, set: { setColumnCount($0) })) {
                    ForEach([2, 3, 4], id: \.self) { Text("\($0)").tag($0) }
                }
                .labelsHidden().pickerStyle(.segmented).fixedSize()
            }
            JLengthField(doc: doc, path: p("columnGap"), label: "Column gap", placeholder: "60px")
        }
        ForEach(Array(cols.enumerated()), id: \.offset) { ci, _ in
            InspectorGroup(title: "Column \(ci + 1)") {
                JSegmented(doc: doc, path: p("columns", ci, "textAlign"), label: "Align", options: SiteOptions.align, defaultValue: "left")
                LinesEditor(doc: doc, path: p("columns", ci, "lines"), legacyPath: p("columns", ci), scope: scope)
            }
        }
    }

    private func setColumnCount(_ n: Int) {
        doc.edit("Columns") { root in
            var cols = root[path: base + ["columns"]]?.array ?? [.object([("lines", .array([]))]), .object([("lines", .array([]))])]
            while cols.count < n { cols.append(.object([("lines", .array([]))])) }
            if cols.count > n { cols = Array(cols.prefix(n)) }
            root.set(path: base + ["columns"], .array(cols))
        }
    }

    // MARK: Scroll animation

    @ViewBuilder private var scrollAnimation: some View {
        if let detail {
            ScrollAnimationDetail(model: model, doc: doc, base: base, scope: scope, detail: detail)
        } else {
            scrollAnimationBasic
        }
    }

    @ViewBuilder private var scrollAnimationBasic: some View {
        InspectorGroup(title: "Animation") {
            JTextField(doc: doc, path: p("scrollFolder"), label: "Frames folder", placeholder: "scroll")
            Text("In the page’s image folder; frames named frame-0001.webp, frame-0002.webp, …")
                .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            JNumberField(doc: doc, path: p("frameCount"), label: "Frames", placeholder: "72")
            JNumberField(doc: doc, path: p("scrollVh"), label: "Scroll length", placeholder: "4", unit: "× screen")
            JPicker(doc: doc, path: p("canvasPosition"), label: "Position", options: [("", "Left"), ("center", "Center"), ("right", "Right")])
        }
        InspectorGroup(title: "Text") {
            LinesEditor(doc: doc, path: p("lines"), legacyPath: base, scope: scope)
            JSegmented(doc: doc, path: p("textAlign"), label: "Align", options: SiteOptions.align, defaultValue: "left")
        }
        ItemList(doc: doc, path: p("sideItems"), title: "Side items", noun: "Item",
                 newItem: .object([("image", .string("")), ("title", .string("")), ("subtitle", .string(""))]),
                 caption: { $0["title"]?.string ?? "" }) { item in
            JTextField(doc: doc, path: item + ["image"], label: "Icon", placeholder: "icon.png (page folder)")
            JTextField(doc: doc, path: item + ["title"], label: "Title", typography: true)
            JTextField(doc: doc, path: item + ["subtitle"], label: "Subtitle", typography: true)
        }
    }

    // MARK: 3D model

    @ViewBuilder private var modelViewer: some View {
        InspectorGroup(title: "3D model") {
            JTextField(doc: doc, path: p("modelFile"), label: "Model file", placeholder: "model.glb (page folder)")
            Toggle("Rotate by itself", isOn: Binding(get: { section?["autoRotate"]?.bool != false },
                                                      set: { doc.set(p("autoRotate"), $0 ? nil : .bool(false), name: "Auto Rotate") }))
                .toggleStyle(.checkbox)
        }
        InspectorGroup(title: "Text") {
            LinesEditor(doc: doc, path: p("lines"), legacyPath: base, scope: scope)
        }
    }

    // MARK: Tab switcher

    @ViewBuilder private var tabSwitcher: some View {
        InspectorGroup(title: "Tabs bar") {
            JSegmented(doc: doc, path: p("tabAlign"), label: "Align", options: [("left", "Left"), ("center", "Center")], defaultValue: "left")
        }
        ItemList(doc: doc, path: p("tabs"), title: "Tabs", noun: "Tab",
                 newItem: .object([("label", .string("")), ("title", .string("")), ("body", .string(""))]),
                 caption: { $0["label"]?.string ?? "" }) { tab in
            JTextField(doc: doc, path: tab + ["label"], label: "Tab label", typography: true)
            JNumberField(doc: doc, path: tab + ["image"], label: "Image no.", placeholder: "1")
            JTextField(doc: doc, path: tab + ["ratio"], label: "Ratio", placeholder: "16/9")
            JTextField(doc: doc, path: tab + ["title"], label: "Title", typography: true)
            JIntPicker(doc: doc, path: tab + ["titleGap"], label: "Title gap", values: [0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32],
                       defaultLabel: "Default (4px)", suffix: "px")
            JRichTextField(doc: doc, path: tab + ["body"], label: "Body")
        }
    }

    // MARK: Feature tabs

    @ViewBuilder private var featureTabs: some View {
        ItemList(doc: doc, path: p("items"), title: "Tabs", noun: "Tab",
                 newItem: .object([("icon", .string("")), ("title", .string("")), ("images", .array([])), ("lines", .array([]))]),
                 caption: { $0["title"]?.string ?? "" }) { item in
            JTextField(doc: doc, path: item + ["icon"], label: "Icon", placeholder: "icon.png (page folder)")
            JTextField(doc: doc, path: item + ["title"], label: "Title", typography: true)
            images(item + ["images"], "Images", false)
            JPicker(doc: doc, path: item + ["desktopRatio"], label: "Ratio", options: SiteOptions.ratios)
            JPicker(doc: doc, path: item + ["mobileRatio"], label: "Phone ratio", options: SiteOptions.ratios)
            JSegmented(doc: doc, path: item + ["textAlign"], label: "Align", options: SiteOptions.align, defaultValue: "left")
            LinesEditor(doc: doc, path: item + ["lines"], legacyPath: item, scope: scope)
        }
    }

    // MARK: Image tabs

    @ViewBuilder private var imageTabs: some View {
        InspectorGroup(title: "Tabs") {
            JTextField(doc: doc, path: p("title"), label: "Title", placeholder: "Optional", typography: true)
            JPicker(doc: doc, path: p("tabStyle"), label: "Tab style",
                    options: [("", "Underline"), ("pill", "Pill"), ("swatch", "Swatch (color circle)"), ("dot", "Dot"), ("card", "Card")])
            JPicker(doc: doc, path: p("tabPosition"), label: "Tabs at", options: [("", "Bottom"), ("top", "Top")])
            JPicker(doc: doc, path: p("textPosition"), label: "Text", options: [("", "With the image"), ("below-bar", "Below the tabs")])
            JPicker(doc: doc, path: p("tabSize"), label: "Tab size", options: [("", "Medium"), ("sm", "Small"), ("lg", "Large")])
            JNumberField(doc: doc, path: p("tabGap"), label: "Tab gap", placeholder: "Default", unit: "px")
            JPicker(doc: doc, path: p("tabAlign"), label: "Tabs align", options: [("", "Default"), ("center", "Center"), ("left", "Left")])
            JNumberField(doc: doc, path: p("textMinHeight"), label: "Text min height", placeholder: "None", unit: "px")
            JSegmented(doc: doc, path: p("textAlign"), label: "Text align", options: SiteOptions.align, defaultValue: "left")
            if section?["tabStyle"]?.string == "swatch" {
                JNumberField(doc: doc, path: p("swatchLabelGap"), label: "Label gap", placeholder: "8", unit: "px")
                JNumberField(doc: doc, path: p("swatchLabelSize"), label: "Label size", placeholder: "13", unit: "px")
                JColorField(doc: doc, path: p("swatchRingColor"), label: "Ring color", placeholder: "#0073EB")
            }
        }
        ItemList(doc: doc, path: p("tabs"), title: "Tab contents", noun: "Tab",
                 newItem: .object([("label", .string("")), ("images", .array([])), ("lines", .array([]))]),
                 caption: { $0["label"]?.string ?? "" }) { tab in
            JTextField(doc: doc, path: tab + ["label"], label: "Tab label", typography: true)
            if section?["tabStyle"]?.string == "swatch" {
                JColorField(doc: doc, path: tab + ["swatchColor"], label: "Swatch", placeholder: "#cccccc")
            }
            images(tab + ["images"], "Images", false)
            JPicker(doc: doc, path: tab + ["desktopRatio"], label: "Ratio", options: SiteOptions.ratios)
            JPicker(doc: doc, path: tab + ["mobileRatio"], label: "Phone ratio", options: SiteOptions.ratios)
            JSegmented(doc: doc, path: tab + ["textAlign"], label: "Align", options: SiteOptions.align, defaultValue: "left")
            LinesEditor(doc: doc, path: tab + ["lines"], legacyPath: tab, scope: scope)
            if detail != nil {
                images(tab + ["descImages"], "Description image", false)
                JPicker(doc: doc, path: tab + ["descRatio"], label: "Its ratio", options: SiteOptions.ratios)
                JPicker(doc: doc, path: tab + ["descMobileRatio"], label: "Phone ratio", options: SiteOptions.ratios)
            }
        }
    }

    // MARK: Accordion

    @ViewBuilder private var accordion: some View {
        InspectorGroup(title: "Accordion") {
            JTextField(doc: doc, path: p("title"), label: "Heading", placeholder: "Optional", typography: true)
        }
        ItemList(doc: doc, path: p("items"), title: "Items", noun: "Item",
                 newItem: .object([("title", .string("")), ("images", .array([])), ("lines", .array([]))]),
                 caption: { $0["title"]?.string ?? "" }) { item in
            JTextField(doc: doc, path: item + ["title"], label: "Title", typography: true)
            JIntPicker(doc: doc, path: item + ["titleGap"], label: "Title gap", values: [0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32],
                       defaultLabel: "Default (4px)", suffix: "px")
            images(item + ["images"], "Images", false)
            JPicker(doc: doc, path: item + ["desktopRatio"], label: "Ratio", options: SiteOptions.ratios)
            JPicker(doc: doc, path: item + ["mobileRatio"], label: "Phone ratio", options: SiteOptions.ratios)
            JSegmented(doc: doc, path: item + ["textAlign"], label: "Align", options: SiteOptions.align, defaultValue: "left")
            LinesEditor(doc: doc, path: item + ["lines"], legacyPath: item, scope: scope)
        }
    }

    // MARK: Video

    @ViewBuilder private var video: some View {
        InspectorGroup(title: "Video") {
            if detail != nil {
                JPicker(doc: doc, path: p("videoType"), label: "Source", options: [("", "Uploaded file"), ("youtube", "YouTube")])
            }
            if section?["videoType"]?.string == "youtube" {
                FieldRow(label: "YouTube") {
                    CommitTextField(placeholder: "URL or video ID", value: section?["youtubeId"]?.string ?? "") {
                        doc.set(p("youtubeId"), $0.isEmpty ? nil : .string(Self.youtubeID($0)), name: "YouTube Video")
                    }
                    .textFieldStyle(.roundedBorder)
                }
                JTextField(doc: doc, path: p("videoThumbnail"), label: "Thumbnail", placeholder: "Optional — YouTube’s own otherwise")
            } else {
            JTextField(doc: doc, path: p("videoSrc"), label: "Video file", placeholder: "video.mp4 (page folder)")
            JPicker(doc: doc, path: p("videoRatio"), label: "Ratio", options: [("", "Fill the section (cover)")] + SiteOptions.ratios.dropFirst())
            Toggle("Sound (plays when clicked)", isOn: Binding(get: { section?["videoMuted"]?.bool == false },
                                                                 set: { doc.set(p("videoMuted"), .bool(!$0), name: "Video Sound") }))
                .toggleStyle(.checkbox)
            Toggle("Play once (no loop)", isOn: Binding(get: { section?["videoLoop"]?.bool == false },
                                                         set: { doc.set(p("videoLoop"), .bool(!$0), name: "Video Loop") }))
                .toggleStyle(.checkbox)
            if section?["videoRatio"]?.string?.isEmpty == false {
                JLengthField(doc: doc, path: p("videoMaxWidth"), label: "Video width", placeholder: "900px")
                JPicker(doc: doc, path: p("videoTextPosition"), label: "Text", options: [("", "Above the video"), ("below", "Below the video")])
            }
            }
        }
        InspectorGroup(title: "Text") {
            LinesEditor(doc: doc, path: p("lines"), legacyPath: base, scope: scope)
            JPicker(doc: doc, path: p("overlayPosition"), label: "Align", options: [("", "Center"), ("left", "Left"), ("right", "Right")])
            JLengthField(doc: doc, path: p("textMaxWidth"), label: "Max width")
        }
    }

    // MARK: Stats

    @ViewBuilder private var stats: some View {
        ItemList(doc: doc, path: p("items"), title: "Stats", noun: "Stat",
                 newItem: .object([("icon", .string("")), ("value", .string("")), ("label", .string(""))]),
                 caption: { [$0["value"]?.string, $0["label"]?.string].compactMap { $0 }.joined(separator: " ") }) { item in
            JTextField(doc: doc, path: item + ["value"], label: "Value", placeholder: "50+", typography: true)
            JTextField(doc: doc, path: item + ["label"], label: "Label", placeholder: "Users tested", typography: true)
            JTextField(doc: doc, path: item + ["icon"], label: "Icon", placeholder: "Optional, icon.png (page folder)")
        }
    }

    // MARK: Interactive

    @ViewBuilder private var interactive: some View {
        InspectorGroup(title: "Interactive") {
            JTextField(doc: doc, path: p("labSlug"), label: "Lab piece", placeholder: "Folder in public/lab")
            JNumberField(doc: doc, path: p("height"), label: "Height", placeholder: "600", unit: "px")
            JNumberField(doc: doc, path: p("mobileHeight"), label: "Phone height", placeholder: "Same", unit: "px")
            JToggle(doc: doc, path: p("hideOpenLink"), label: "Hide the “Open full screen” link")
            Text("Lab pieces are code in the site’s git repo; the preview loads them from nnwoo.com.")
                .font(.caption).foregroundStyle(.secondary)
        }
        InspectorGroup(title: "Caption", defaultOpen: section?["lines"] != nil) {
            LinesEditor(doc: doc, path: p("lines"), legacyPath: base, scope: scope)
        }
    }

    // MARK: Helpers

    private var suffix: String { scope == .all ? "" : scope == .tablet ? "Tablet" : "Mobile" }
    private func same(_ desktop: String) -> String { scope == .all ? desktop : "Same" }

    /// "https://youtu.be/abc", "…watch?v=abc", "…/embed/abc" or "abc" → "abc".
    static func youtubeID(_ text: String) -> String {
        let t = text.trimmingCharacters(in: .whitespaces)
        for pattern in ["v=([\\w-]{6,})", "youtu\\.be/([\\w-]{6,})", "embed/([\\w-]{6,})", "shorts/([\\w-]{6,})"] {
            if let r = t.range(of: pattern, options: .regularExpression) {
                let m = String(t[r])
                if let slash = m.lastIndex(where: { $0 == "=" || $0 == "/" }) { return String(m[m.index(after: slash)...]) }
            }
        }
        return t
    }
}

/// A project's scroll animation: its frames folder (and uploading frames),
/// how long it scrolls, where it sticks, the phone version and the side
/// items. Cropping the frames stays in the web form.
struct ScrollAnimationDetail: View {
    @ObservedObject var model: EditorModel
    @ObservedObject var doc: ContentDocument
    let base: [Any]
    let scope: SizeScope
    let detail: DetailContext
    @State private var uploading: String?
    @State private var cropping: (folder: String, cropKey: String, aspectKey: String)?

    private var section: JSONValue? { doc.root[path: base] }
    private func p(_ keys: Any...) -> [Any] { base + keys }
    private var folders: [String] {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: detail.folder.path)) ?? []
        return names.filter { $0.hasPrefix("scroll") }.flatMap { name -> [String] in
            let sub = ((try? FileManager.default.contentsOfDirectory(atPath: detail.folder.appendingPathComponent(name).path)) ?? [])
                .filter { !$0.hasPrefix(".") && !$0.contains(".") }.sorted().map { "\(name)/\($0)" }
            return [name] + sub
        }.sorted()
    }

    var body: some View {
        let folder = section?["scrollFolder"]?.string ?? (section?["scrollIndex"]?.int.map { "scroll-\($0)" } ?? "scroll")
        InspectorGroup(title: "Frames") {
            FieldRow(label: "Folder") {
                Picker("Folder", selection: Binding(get: { folder }, set: { v in
                    doc.edit("Frames Folder") { root in
                        root.set(path: base + ["scrollFolder"], .string(v))
                        root.set(path: base + ["scrollIndex"], nil)
                    }
                })) {
                    ForEach(Array(Set(folders + [folder])).sorted(), id: \.self) { Text($0).tag($0) }
                }
                .labelsHidden().fixedSize()
            }
            JTextField(doc: doc, path: p("scrollFolder"), label: "New folder", placeholder: "e.g. scroll/004")
            JNumberField(doc: doc, path: p("frameCount"), label: "Frames", placeholder: "72")
            Button(uploading == folder ? "Uploading…" : "Upload Frames…") { upload(to: folder, countKey: "frameCount") }
                .controlSize(.small).disabled(uploading != nil)
            Text("Pick the frames in order; they’re saved as frame-0001, frame-0002, … in that folder (PNG as WebP).")
                .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            HStack {
                Button(section?["canvasCrop"] != nil ? "Change Crop…" : "Crop Frames…") { cropping = (folder, "canvasCrop", "canvasAspect") }
                    .controlSize(.small).disabled(firstFrame(folder) == nil)
                if section?["canvasCrop"] != nil {
                    Button("Remove Crop") { doc.edit("Remove Crop") { $0.set(path: base + ["canvasCrop"], nil); $0.set(path: base + ["canvasAspect"], nil) } }
                        .controlSize(.small)
                }
            }
        }
        .sheet(isPresented: Binding(get: { cropping != nil }, set: { if !$0 { cropping = nil } })) {
            if let c = cropping, let url = firstFrame(c.folder), let image = NSImage(contentsOf: url) {
                CropSheet(image: image, initial: section?[c.cropKey]) { crop in
                    doc.edit("Crop Frames") { root in
                        root.set(path: base + [c.cropKey], crop)
                        if let crop, let x1 = crop["x1"]?.string.flatMap(Double.init), let x2 = crop["x2"]?.string.flatMap(Double.init),
                           let y1 = crop["y1"]?.string.flatMap(Double.init), let y2 = crop["y2"]?.string.flatMap(Double.init),
                           let r = crop["imgRatio"]?.string.flatMap(Double.init), y2 > y1 {
                            root.set(path: base + [c.aspectKey], .string(String(format: "%.3f", r * (x2 - x1) / (y2 - y1))))
                        } else {
                            root.set(path: base + [c.aspectKey], nil)
                        }
                    }
                }
            }
        }
        InspectorGroup(title: "Scrolling") {
            JIntPicker(doc: doc, path: p("scrollVh"), label: "Length", values: [2, 3, 4, 5, 6], defaultValue: 4, suffix: "× screen")
            JNumberField(doc: doc, path: p("scrollStart"), label: "Start frame", placeholder: "0", unit: "%")
            JNumberField(doc: doc, path: p("scrollHold"), label: "Hold start", placeholder: "0", unit: "%")
            JNumberField(doc: doc, path: p("stickyPaddingTop"), label: "Content top", placeholder: "Centered", unit: "px")
            JNumberField(doc: doc, path: p("stickyTopOffset"), label: "Sticks at", placeholder: "94", unit: "px")
            JLengthField(doc: doc, path: p("canvasMaxWidth"), label: "Canvas width", placeholder: "Fill")
            JPicker(doc: doc, path: p("canvasPosition"), label: "Canvas", options: [("", "Left"), ("center", "Center"), ("right", "Right")])
            JColorField(doc: doc, path: p("bgColor"), label: "Background")
        }
        InspectorGroup(title: "Text") {
            LinesEditor(doc: doc, path: p("lines"), legacyPath: base, scope: scope)
            JPicker(doc: doc, path: p("textPosition"), label: "Align", options: [("", "Left"), ("center", "Center"), ("right", "Right")])
            JLengthField(doc: doc, path: p("textMaxWidth"), label: "Panel width", placeholder: "300px")
        }
        InspectorGroup(title: "Phones", defaultOpen: scope == .mobile) {
            FieldRow(label: "Layout") {
                Picker("Layout", selection: Binding(
                    get: { section?["mobileStatic"]?.bool == true ? "static" : section?["mobileShowSideItems"]?.bool == true ? "side" : "" },
                    set: { v in doc.edit("Phone Layout") { root in
                        root.set(path: base + ["mobileStatic"], v == "static" ? .bool(true) : .bool(false))
                        root.set(path: base + ["mobileShowSideItems"], .bool(v == "side"))
                    } })) {
                    Text("Animation").tag("")
                    Text("Animation + side items").tag("side")
                    Text("Still image").tag("static")
                }
                .labelsHidden().fixedSize()
            }
            JIntPicker(doc: doc, path: p("mobileScrollVh"), label: "Length", values: [1, 2, 3, 4], defaultLabel: "Same as desktop", suffix: "× screen")
            JNumberField(doc: doc, path: p("mobileStickyTop"), label: "Sticks at", placeholder: "0", unit: "vh")
            JNumberField(doc: doc, path: p("mobileGapBefore"), label: "Gap above", placeholder: "0", unit: "px")
            JNumberField(doc: doc, path: p("mobileGapAfter"), label: "Gap below", placeholder: "0", unit: "px")
            JTextField(doc: doc, path: p("mobileScrollFolder"), label: "Own frames", placeholder: "Same as desktop, or scroll-mobile")
            if let mobile = section?["mobileScrollFolder"]?.string, !mobile.isEmpty {
                JNumberField(doc: doc, path: p("mobileFrameCount"), label: "Frames", placeholder: "Same")
                Button(uploading == mobile ? "Uploading…" : "Upload Phone Frames…") { upload(to: mobile, countKey: "mobileFrameCount") }
                    .controlSize(.small).disabled(uploading != nil)
            }
            let phoneFolder = section?["mobileScrollFolder"]?.string.flatMap { $0.isEmpty ? nil : $0 } ?? folder
            Button(section?["mobileCanvasCrop"] != nil ? "Change Phone Crop…" : "Crop Phone Frames…") {
                cropping = (phoneFolder, "mobileCanvasCrop", "mobileCanvasAspect")
            }
            .controlSize(.small).disabled(firstFrame(phoneFolder) == nil)
        }
        InspectorGroup(title: "Side items layout", defaultOpen: false) {
            JLengthField(doc: doc, path: p("sideItemsWidth"), label: "Width", placeholder: "280px")
            JSegmented(doc: doc, path: p("sideItemsAlign"), label: "Align", options: [("left", "Left"), ("center", "Center")], defaultValue: "left")
        }
        ItemList(doc: doc, path: p("sideItems"), title: "Side items", noun: "Item",
                 newItem: .object([("title", .string("")), ("subtitle", .string(""))]),
                 caption: { $0["title"]?.string ?? "" }) { item in
            JTextField(doc: doc, path: item + ["image"], label: "Icon", placeholder: "icon.png (page’s icons folder)")
            JStyledText(doc: doc, path: item + ["title"], label: "Title", scope: scope, styles: [.size, .color])
            JStyledText(doc: doc, path: item + ["subtitle"], label: "Subtitle", scope: scope, styles: [.size, .color])
            JNumberField(doc: doc, path: item + ["gapAfter"], label: "Gap after", placeholder: "40", unit: "px")
        }
    }

    private func firstFrame(_ folder: String) -> URL? {
        let dir = detail.folder.appendingPathComponent(folder)
        return ["webp", "png", "jpg", "jpeg"].lazy.map { dir.appendingPathComponent("frame-0001.\($0)") }
            .first { FileManager.default.fileExists(atPath: $0.path) }
    }

    private func upload(to folder: String, countKey: String) {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.image]
        panel.allowsMultipleSelection = true
        guard panel.runModal() == .OK else { return }
        let files = panel.urls.sorted { $0.lastPathComponent.localizedStandardCompare($1.lastPathComponent) == .orderedAscending }
        uploading = folder
        Task {
            for (i, url) in files.enumerated() {
                guard let data = try? Data(contentsOf: url) else { continue }
                _ = await model.callAPI("POST", "/api/scroll-frames/\(detail.category)/\(detail.id)/\(folder)/upload",
                                        body: ["name": url.lastPathComponent, "data": data.base64EncodedString(), "frameNum": i + 1])
            }
            doc.set(p(countKey), .number(String(files.count)), name: "Frame Count")
            uploading = nil
            model.refreshChanges()
        }
    }
}

/// One card (block) of an Image + Text or Carousel section: everything the
/// web form's block editor had except image cropping.
struct CardFields: View {
    @ObservedObject var doc: ContentDocument
    let base: [Any]
    let sectionType: String
    let iconList: Bool
    let scope: SizeScope
    let images: ([Any], String, Bool) -> AnyView
    let hasMobileImages: Bool
    var detail: DetailContext? = nil
    var folder: URL? = nil
    var mobileFolder: URL? = nil
    var hasTabletImages = false

    private var block: JSONValue? { doc.root[path: base] }

    var body: some View {
        InspectorGroup(title: "Images") {
            images(base + ["images"], "Desktop", false)
            JPicker(doc: doc, path: base + ["desktopRatio"], label: "Ratio", options: SiteOptions.ratios)
            JPicker(doc: doc, path: base + ["tabletRatio"], label: "Tablet ratio", options: [("", "Same")] + SiteOptions.ratios.dropFirst())
            JPicker(doc: doc, path: base + ["mobileRatio"], label: "Phone ratio", options: SiteOptions.ratios)
            if sectionType == "image-text" && !iconList {
                JPicker(doc: doc, path: base + ["imgWidth"], label: "Image width",
                        options: [("", "Medium — 70%"), ("small", "Small — 50%"), ("large", "Large — 90%"), ("full", "Full — 100%")])
            }
        }
        if sectionType == "image-text" && !iconList {
            InspectorGroup(title: "Layout") {
                JSegmented(doc: doc, path: base + ["blockAlign"], label: "Block", options: SiteOptions.align, defaultValue: "center")
                JToggle(doc: doc, path: base + ["splitLayout"], label: "Image and text side by side on desktop")
                if block?["splitLayout"]?.bool == true {
                    JPicker(doc: doc, path: base + ["mobileImageOrder"], label: "On phones", options: [("", "Image, then text"), ("last", "Text, then image")])
                }
            }
        }
        InspectorGroup(title: "Text") {
            LinesEditor(doc: doc, path: base + ["lines"], legacyPath: base, scope: scope)
            JSegmented(doc: doc, path: base + ["textAlign"], label: "Align", options: SiteOptions.align, defaultValue: "left")
            JLengthField(doc: doc, path: base + ["textMaxWidth"], label: "Max width", placeholder: "480px")
        }
        InspectorGroup(title: "Links", defaultOpen: block?["link"] != nil) {
            JTextField(doc: doc, path: base + ["link"], label: "Link", placeholder: "Makes the whole card clickable")
            JTextField(doc: doc, path: base + ["link2"], label: "Second link", placeholder: "Its own icon next to the first")
            JToggle(doc: doc, path: base + ["linkDisabled"], label: "Disable links")
        }
        InspectorGroup(title: "On click", defaultOpen: block?["clickReveal"] != nil) {
            JPicker(doc: doc, path: base + ["clickReveal"], label: "+ button", options: [("", "Off"), ("image", "Swap the image"), ("text", "Reveal text")])
            switch block?["clickReveal"]?.string {
            case "image"?: images(base + ["clickImages"], "Shown after the click", false)
            case "text"?:
                JTextField(doc: doc, path: base + ["clickTitle"], label: "Title", typography: true)
                JRichTextField(doc: doc, path: base + ["clickContent"], label: "Text")
            default: EmptyView()
            }
        }
        if hasMobileImages {
            InspectorGroup(title: "Phone images", defaultOpen: !((block?["mobileImages"]?.array ?? []).isEmpty)) {
                images(base + ["mobileImages"], "Shown on phones instead (optional)", true)
            }
        }
        if hasTabletImages {
            InspectorGroup(title: "Tablet images", defaultOpen: block?["tabletImages"] != nil) {
                images(base + ["tabletImages"], "Per image, for tablets (optional)", false)
            }
        }
        if let detail {
            InspectorGroup(title: "Callouts", defaultOpen: !((block?["annotations"]?.array ?? []).isEmpty)) {
                AnnotationEditor(doc: doc, block: base, folder: folder, mobileFolder: mobileFolder,
                                 iconsFolder: detail.folder.appendingPathComponent("icons"))
            }
            InspectorGroup(title: "Corners", defaultOpen: false) {
                if sectionType == "image-text-carousel" {
                    JToggle(doc: doc, path: base + ["rounded"], label: "Rounded corners", defaultOn: true)
                }
                JToggle(doc: doc, path: base + ["mobileSquare"], label: "Square corners on phones")
            }
            if detail.type == "originals" && sectionType == "image-text-carousel" {
                InspectorGroup(title: "Image grid", defaultOpen: (block?["gridColumns"]?.int ?? 1) > 1) {
                    JIntPicker(doc: doc, path: base + ["gridColumns"], label: "Columns", values: [1, 2, 3, 4], defaultValue: 1)
                    JIntPicker(doc: doc, path: base + ["gridRows"], label: "Rows", values: [2, 3, 4], defaultLabel: "Auto")
                    JLengthField(doc: doc, path: base + ["gridGap"], label: "Gap", placeholder: "2px")
                }
            }
        }
        InspectorGroup(title: "Visibility", defaultOpen: block?["hidden"]?.bool == true) {
            JToggle(doc: doc, path: base + ["hidden"], label: "Hide this card on the site")
        }
    }
}

/// A section's cards, to open one on the Card tab.
struct CardListView: View {
    @ObservedObject var doc: ContentDocument
    let blocksPath: [Any]
    let open: (Int) -> Void

    var body: some View {
        let blocks = doc.root[path: blocksPath]?.array ?? []
        VStack(spacing: 4) {
            if blocks.isEmpty { Text("No cards yet.").font(.callout).foregroundStyle(.secondary) }
            ForEach(Array(blocks.enumerated()), id: \.offset) { b, block in
                Button { open(b) } label: {
                    HStack {
                        Text("\(b + 1)").font(.caption.monospacedDigit()).foregroundStyle(.secondary).frame(width: 18)
                        Text(Self.caption(block)).lineLimit(1).font(.callout)
                        Spacer()
                        if block["hidden"]?.bool == true { Image(systemName: "eye.slash").foregroundStyle(.tertiary) }
                        Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
                    }
                    .padding(6).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .background(Corner.shape(Corner.tile).fill(Color.secondary.opacity(0.06)))
            }
        }
    }

    static func caption(_ block: JSONValue) -> String {
        let fromLines = block["lines"]?.array?.compactMap { $0["text"]?.string }.map(InlineHTML.plain).first { !$0.isEmpty }
        let legacy = [block["title"]?.string, block["content"]?.string].compactMap { $0 }.map(InlineHTML.plain).first { !$0.isEmpty }
        return fromLines ?? legacy ?? "Untitled card"
    }
}

/// A list of items in a section (tabs, stats, side items…): each one opens
/// to its fields; add, duplicate, reorder and remove.
struct ItemList<Fields: View>: View {
    @ObservedObject var doc: ContentDocument
    let path: [Any]
    let title: String
    let noun: String
    let newItem: JSONValue
    /// When set, Add is a menu of these kinds instead.
    var extraNewItems: [(String, JSONValue)] = []
    let caption: (JSONValue) -> String
    @ViewBuilder let fields: ([Any]) -> Fields
    @State private var open: Int?

    init(doc: ContentDocument, path: [Any], title: String, noun: String, newItem: JSONValue, extraNewItems: [(String, JSONValue)] = [],
         caption: @escaping (JSONValue) -> String, @ViewBuilder fields: @escaping ([Any]) -> Fields) {
        self.doc = doc; self.path = path; self.title = title; self.noun = noun; self.newItem = newItem
        self.extraNewItems = extraNewItems; self.caption = caption; self.fields = fields
    }

    private var addButton: AnyView {
        let count = doc.root[path: path]?.array?.count ?? 0
        if extraNewItems.isEmpty { return AnyView(Button("Add") { add(count, newItem) }.controlSize(.small)) }
        return AnyView(Menu("Add") {
            ForEach(Array(extraNewItems.enumerated()), id: \.offset) { _, kind in Button(kind.0) { add(count, kind.1) } }
        }.controlSize(.small).fixedSize())
    }

    var body: some View {
        let items = doc.root[path: path]?.array ?? []
        InspectorGroup(title: title, trailing: addButton) {
            if items.isEmpty { Text("None yet.").font(.callout).foregroundStyle(.secondary) }
            ForEach(Array(items.enumerated()), id: \.offset) { i, item in
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 6) {
                        Button { open = open == i ? nil : i } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "chevron.right").font(.system(size: 9, weight: .semibold))
                                    .rotationEffect(.degrees(open == i ? 90 : 0)).foregroundStyle(.secondary)
                                Text(label(item, i)).font(.callout).lineLimit(1)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        Spacer()
                        Menu {
                            Button("Move Up") { edit("Move \(noun)") { $0.swapAt(i, i - 1) }; open = i - 1 }.disabled(i == 0)
                            Button("Move Down") { edit("Move \(noun)") { $0.swapAt(i, i + 1) }; open = i + 1 }.disabled(i == items.count - 1)
                            Button("Duplicate") { edit("Duplicate \(noun)") { $0.insert($0[i], at: i + 1) }; open = i + 1 }
                            Divider()
                            Button("Delete \(noun)", role: .destructive) { edit("Delete \(noun)") { $0.remove(at: i) }; open = nil }
                        } label: { Image(systemName: "ellipsis") }
                        .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize()
                    }
                    if open == i {
                        VStack(alignment: .leading, spacing: 8) { fields(path + [i]) }
                            .padding(.leading, 12)
                    }
                }
                .padding(8)
                .background(Corner.shape(Corner.group).fill(Color.secondary.opacity(0.06)))
            }
        }
    }

    private func label(_ item: JSONValue, _ i: Int) -> String {
        let c = InlineHTML.plain(caption(item)).trimmingCharacters(in: .whitespaces)
        return c.isEmpty ? "\(noun) \(i + 1)" : c
    }

    private func add(_ count: Int, _ item: JSONValue) {
        edit("Add \(noun)") { $0.append(item) }
        open = count
    }

    private func edit(_ name: String, _ change: (inout [JSONValue]) -> Void) {
        doc.edit(name) { root in
            var items = root[path: path]?.array ?? []
            change(&items)
            root.set(path: path, .array(items))
        }
    }
}

/// A number chosen from a list, stored as a number (the site compares it).
struct JIntPicker: View {
    @ObservedObject var doc: ContentDocument
    let path: [Any]
    let label: String
    let values: [Int]
    var defaultValue: Int? = nil
    var defaultLabel: String? = nil
    var suffix = ""

    var body: some View {
        FieldRow(label: label) {
            Picker(label, selection: Binding(
                get: { doc.root[path: path]?.int ?? defaultValue ?? -1 },
                set: { (v: Int) in
                    let isDefault = v == -1 || (defaultValue.map { $0 == v } ?? false)
                    doc.set(path, isDefault ? nil : JSONValue.number(String(v)), name: "Change \(label)")
                })) {
                if defaultValue == nil { Text(defaultLabel ?? "Default").tag(-1) }
                ForEach(values, id: \.self) { v in
                    Text(defaultValue.map { $0 == v } ?? false ? "\(v)\(suffix) (default)" : "\(v)\(suffix)").tag(v)
                }
            }
            .labelsHidden().fixedSize()
        }
    }
}

/// Fetches a link's title, description, image and site name (the editor
/// API's /api/link-preview) into the card fields.
struct LinkPreviewFetch: View {
    @ObservedObject var model: EditorModel
    @ObservedObject var doc: ContentDocument
    let base: [Any]
    @State private var fetching = false
    @State private var error: String?

    var body: some View {
        HStack {
            Button(fetching ? "Fetching…" : "Fill from the link") { Task { await fetch() } }
                .controlSize(.small)
                .disabled(fetching || (doc.root[path: base + ["link"]]?.string ?? "").isEmpty)
            if let error { Text(error).font(.caption).foregroundStyle(.red) }
        }
    }

    private func fetch() async {
        guard let link = doc.root[path: base + ["link"]]?.string, !link.isEmpty else { return }
        fetching = true
        error = nil
        defer { fetching = false }
        let r = await model.callAPI("POST", "/api/link-preview", body: ["url": link])
        guard r.status < 400, let d = r.json as? [String: Any] else {
            error = (r.json as? [String: Any])?["error"] as? String ?? "Couldn’t read the page."
            return
        }
        doc.edit("Fill Link Preview") { root in
            for (key, field) in [("ogTitle", "title"), ("ogDescription", "description"), ("ogImage", "image"), ("ogSiteName", "siteName")] {
                if let v = d[field] as? String, !v.isEmpty { root.set(path: base + [key], .string(v)) }
            }
        }
    }
}
