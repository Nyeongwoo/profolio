import SwiftUI
import UniformTypeIdentifiers

/// Where a page's section images live and how new ones are uploaded (the
/// editor API's routes for that page).
struct SectionAssets {
    let folder: URL
    let upload: String
    var mobileFolder: URL? = nil
    var mobileUpload: String? = nil

    /// Tablet-only images, where the editor API has routes for them (next
    /// to the phone images; not on Originals pages).
    var tabletFolder: URL? {
        guard tabletUpload != nil else { return nil }
        return mobileFolder?.deletingLastPathComponent().appendingPathComponent("tablet")
    }
    var tabletUpload: String? {
        guard let m = mobileUpload, m.hasSuffix("/mobile/upload"), !m.contains("/original-images/") else { return nil }
        return String(m.dropLast("/mobile/upload".count)) + "/tablet/upload"
    }
}

/// How a page is edited natively: which file, which list of sections, where
/// its images go, and whether the site loads it at runtime (then edits show
/// in the preview live; otherwise the preview reloads after each save).
struct NativeForm {
    enum Page: Equatable {
        case project(String, String), original(String, String), category(String, String)
        case about, home, contacts, archive, navbar, footer, maintenance, minimal, notFound
        case allItems(String), blogLanding, blogList, blogPost(String)
    }

    let page: Page
    let contentPath: String
    let sectionsKey: String
    let assets: SectionAssets?
    /// The content's public URL path when the site fetches it at runtime.
    let livePath: String?

    var hasSections: Bool { !sectionsKey.isEmpty }

    static func make(for node: SiteIndex.Node, package: URL) -> NativeForm? {
        guard let content = node.contentPath else { return nil }
        let assets = package.appendingPathComponent("site/public/assets")
        let parts = node.id.split(separator: ":", maxSplits: 1).map(String.init)
        let rest = parts.count == 2 ? parts[1].split(separator: "/").map(String.init) : []
        let runtime = "/" + content.replacingOccurrences(of: "public/", with: "")

        func form(_ page: Page, assets a: SectionAssets? = nil, live: Bool = false) -> NativeForm {
            NativeForm(page: page, contentPath: content, sectionsKey: node.sectionsKey, assets: a, livePath: live ? runtime : nil)
        }

        switch (parts.first, rest.count) {
        case ("project", 2):
            let base = assets.appendingPathComponent("projects/\(rest[0])/\(rest[1])")
            return form(.project(rest[0], rest[1]), assets: SectionAssets(
                folder: base.appendingPathComponent("sections"), upload: "/api/images/\(rest[0])/\(rest[1])/sections/upload",
                mobileFolder: base.appendingPathComponent("mobile"), mobileUpload: "/api/images/\(rest[0])/\(rest[1])/mobile/upload"), live: true)
        case ("original", 2):
            let base = assets.appendingPathComponent("originals/\(rest[0])/\(rest[1])")
            return form(.original(rest[0], rest[1]), assets: SectionAssets(
                folder: base.appendingPathComponent("sections"), upload: "/api/original-images/\(rest[0])/\(rest[1])/upload",
                mobileFolder: base.appendingPathComponent("mobile"), mobileUpload: "/api/original-images/\(rest[0])/\(rest[1])/mobile/upload"), live: true)
        case ("projects-cat", 1), ("originals-cat", 1):
            let type = parts[0] == "projects-cat" ? "projects" : "originals"
            return form(.category(type, rest[0]), assets: SectionAssets(
                folder: assets.appendingPathComponent("\(type)/\(rest[0])/category"), upload: "/api/category-images/\(type)/\(rest[0])/upload"), live: true)
        case ("post", 1):
            return form(.blogPost(rest[0]), assets: SectionAssets(
                folder: assets.appendingPathComponent("blog/\(rest[0])/sections"), upload: "/api/blog-images/\(rest[0])/upload"), live: true)
        default: break
        }
        switch node.id {
        case "about":
            return form(.about, assets: SectionAssets(
                folder: assets.appendingPathComponent("about/sections"), upload: "/api/about-images/upload",
                mobileFolder: assets.appendingPathComponent("about/sections/mobile"), mobileUpload: "/api/about-images/mobile/upload"))
        case "home":
            return form(.home, assets: SectionAssets(
                folder: assets.appendingPathComponent("home/sections"), upload: "/api/home-images/upload",
                mobileFolder: assets.appendingPathComponent("home/sections/mobile"), mobileUpload: "/api/home-images/mobile/upload"))
        case "contacts":
            return form(.contacts, assets: SectionAssets(
                folder: assets.appendingPathComponent("contacts/sections"), upload: "/api/contacts-images/upload",
                mobileFolder: assets.appendingPathComponent("contacts/sections/mobile"), mobileUpload: "/api/contacts-images/mobile/upload"))
        case "all-projects", "all-originals":
            let type = node.id == "all-projects" ? "projects" : "originals"
            return form(.allItems(type), assets: SectionAssets(
                folder: assets.appendingPathComponent("\(type)/all/sections"), upload: "/api/all-\(type)-images/upload",
                mobileFolder: assets.appendingPathComponent("\(type)/all/sections/mobile"), mobileUpload: "/api/all-\(type)-images/mobile/upload"))
        case "blog-landing":
            return form(.blogLanding, assets: SectionAssets(
                folder: assets.appendingPathComponent("blog/landing"), upload: "/api/blog-landing-images/upload"), live: true)
        case "archive": return form(.archive)
        case "navbar": return form(.navbar)
        case "footer": return form(.footer)
        case "maintenance": return form(.maintenance)
        case "minimal": return form(.minimal)
        case "not-found": return form(.notFound)
        case "blog-list": return form(.blogList)
        default: return nil
        }
    }
}

// MARK: - Page tabs

/// The Page tab for pages other than projects and originals.
struct PageFields: View {
    @ObservedObject var model: EditorModel
    @ObservedObject var doc: ContentDocument
    let form: NativeForm
    let scope: SizeScope

    private var suffix: String { scope == .all ? "" : scope == .tablet ? "Tablet" : "Mobile" }

    private var sizes: [(String, String)] {
        scope == .all ? SiteOptions.fontSizes : [("", "Same as larger")] + SiteOptions.fontSizes.dropFirst()
    }

    var body: some View {
        switch form.page {
        case .about: about
        case .home: home
        case .contacts: contacts
        case .archive: archive
        case .navbar: navbar
        case .footer: footer
        case .maintenance: maintenance
        case .minimal: MinimalForm(model: model, doc: doc)
        case .notFound: notFound
        case .allItems(let type): AllItemsForm(model: model, doc: doc, type: type, scope: scope)
        case .blogList: blogList
        case .category(let type, let cat): CategoryHeroFields(model: model, type: type, category: cat, scope: scope)
        case .blogPost(let id): BlogPostMeta(model: model, postID: id, scope: scope)
        case .blogLanding, .project, .original: EmptyView()
        }
        if form.hasSections { SectionsOverview(model: model, doc: doc, key: form.sectionsKey) }

    }

    @ViewBuilder private var about: some View {
        InspectorGroup(title: "Intro") {
            JStyledText(doc: doc, path: ["intro", "title"], label: "Title", scope: scope)
            JStyledText(doc: doc, path: ["intro", "description"], label: "Description", rich: true, prefix: "desc", scope: scope)
            JToggle(doc: doc, path: ["intro", "alignPhotoBottom"], label: "Line the text up with the photo’s bottom")
            if doc.root[path: ["intro", "alignPhotoBottom"]]?.bool != true {
                JNumberField(doc: doc, path: ["intro", scope == .mobile ? "topGapMobile" : "topGap"], label: "Top gap",
                             placeholder: scope == .mobile ? "40" : "60", unit: "px")
                JNumberField(doc: doc, path: ["intro", scope == .mobile ? "titleGapMobile" : "titleGap"], label: "Title gap",
                             placeholder: scope == .mobile ? "Same" : "20", unit: "px")
            }
        }
        InspectorGroup(title: "Profile photo") {
            ImagePathSlot(model: model, doc: doc, path: ["intro", "profileImage"], label: "Photo", target: "/assets/about/profile")
            ImagePathSlot(model: model, doc: doc, path: ["intro", "profileMobileImage"], label: "Phone & tablet photo",
                          target: "/assets/about/profile-mobile", optional: true)
            JPicker(doc: doc, path: ["intro", "profileDesktopRatio"], label: "Ratio", options: SiteOptions.ratios)
            JPicker(doc: doc, path: ["intro", "profileMobileRatio"], label: "Phone ratio", options: SiteOptions.ratios)
            JNumberField(doc: doc, path: ["intro", "profileSizeDesktop"], label: "Size", placeholder: "360", unit: "px")
            JNumberField(doc: doc, path: ["intro", "profileSizeTablet"], label: "Tablet size", placeholder: "300", unit: "px")
            JPicker(doc: doc, path: ["tabletImageMode"], label: "Tablets use", options: [("", "Phone images"), ("desktop", "Desktop images")])
        }
        InspectorGroup(title: "Photos") {
            JStyledText(doc: doc, path: ["photos", "heading"], label: "Heading", placeholder: "Photos", scope: scope)
            JNumberField(doc: doc, path: ["photos", "headingGap\(scope == .all ? "" : scope == .tablet ? "Tablet" : "Mobile")"],
                         label: "Gap below", placeholder: scope == .all ? "32" : "Same", unit: "px")
            AboutPhotos(model: model, doc: doc)
        }
        InspectorGroup(title: "Page", defaultOpen: doc.root["maintenance"]?.bool == true || doc.root["linksDisabled"]?.bool == true) {
            PageMaintenanceToggle(doc: doc)
            JToggle(doc: doc, path: ["linksDisabled"], label: "Disable every link on this page")
        }
    }

    @ViewBuilder private var home: some View {
        let mobileSuffix = scope == .mobile ? "Mobile" : ""
        InspectorGroup(title: "Hero") {
            ImagePathSlot(model: model, doc: doc, path: ["hero", "image"], label: "Image", target: "/assets/home/hero")
            ImagePathSlot(model: model, doc: doc, path: ["hero", "tabletImage"], label: "Tablet image", target: "/assets/home/hero-tablet", optional: true)
            ImagePathSlot(model: model, doc: doc, path: ["hero", "mobileImage"], label: "Phone image", target: "/assets/home/hero-mobile", optional: true)
            JPicker(doc: doc, path: ["hero", "desktopRatio"], label: "Ratio", options: [("full", "Fullscreen")] + SiteOptions.ratios.dropFirst())
            JPicker(doc: doc, path: ["hero", "tabletRatio"], label: "Tablet ratio", options: [("", "Same"), ("full", "Fullscreen")] + SiteOptions.ratios.dropFirst())
            JPicker(doc: doc, path: ["hero", "mobileRatio"], label: "Phone ratio", options: [("full", "Fullscreen")] + SiteOptions.ratios.dropFirst())
            JToggle(doc: doc, path: ["hero", "nativeSize"], label: "Show at its own pixel size (no scaling)")
            JToggle(doc: doc, path: ["hero", "hideOnMobile"], label: "Hide on phones")
            InsetFields(doc: doc, base: ["hero"], scope: scope, defaultAmount: "12%")
            JNumberField(doc: doc, path: ["hero", "scrollHintDelay"], label: "Scroll hint", placeholder: "5", unit: "s")
        }
        InspectorGroup(title: "Featured cards") {
            JPicker(doc: doc, path: ["featuredSection", "desktopRatio"], label: "Ratio", options: SiteOptions.ratios)
            JPicker(doc: doc, path: ["featuredSection", "tabletRatio"], label: "Tablet ratio", options: [("", "Same")] + SiteOptions.ratios.dropFirst())
            JPicker(doc: doc, path: ["featuredSection", "mobileRatio"], label: "Phone ratio", options: SiteOptions.ratios)
            InsetFields(doc: doc, base: ["featuredSection"], scope: scope, defaultAmount: "12%")
        }
        ItemList(doc: doc, path: ["featured"], title: "Featured", noun: "Card",
                 newItem: .object([("id", .string("")), ("category", .string("")), ("linkType", .string("projects")), ("tagline", .string(""))]),
                 caption: { $0["id"]?.string ?? "" }) { item in
            HomeCardFields(model: model, doc: doc, item: item, scope: scope, inset: doc.root[path: ["featuredSection", "inset"]]?.bool == true, featured: true)
        }
        ItemList(doc: doc, path: ["gridSections"], title: "Grid rows", noun: "Row",
                 newItem: .object([("desktopRatio", .string("5/4")), ("mobileRatio", .string("5/4")), ("hidden", .bool(false)), ("items", .array([]))]),
                 caption: { row in (row["items"]?.array ?? []).compactMap { $0["id"]?.string }.joined(separator: ", ") }) { row in
            JToggle(doc: doc, path: row + ["hidden"], label: "Hide this row")
            JPicker(doc: doc, path: row + ["desktopRatio"], label: "Ratio", options: SiteOptions.ratios)
            JPicker(doc: doc, path: row + ["tabletRatio"], label: "Tablet ratio", options: [("", "Same")] + SiteOptions.ratios.dropFirst())
            JPicker(doc: doc, path: row + ["mobileRatio"], label: "Phone ratio", options: SiteOptions.ratios)
            JLengthField(doc: doc, path: row + [scope == .mobile ? "mobileGap" : "desktopGap"], label: "Gap", placeholder: scope == .mobile ? "Same" : "Default")
            InsetFields(doc: doc, base: row, scope: scope, defaultAmount: "8%")
            ItemList(doc: doc, path: row + ["items"], title: "Cards", noun: "Card",
                     newItem: .object([("id", .string("")), ("category", .string("")), ("linkType", .string("projects")), ("title", .string("")), ("tagline", .string(""))]),
                     caption: { $0["title"]?.string ?? $0["id"]?.string ?? "" }) { item in
                HomeCardFields(model: model, doc: doc, item: item, scope: scope, inset: doc.root[path: row + ["inset"]]?.bool == true, featured: false)
            }
        }
        InspectorGroup(title: "Originals on Home", defaultOpen: false) {
            JToggle(doc: doc, path: ["originalsSection", "hidden"], label: "Hide the Originals carousel")
            JToggle(doc: doc, path: ["originalsSection", "showTitle"], label: "Show title", defaultOn: true)
            JStyledText(doc: doc, path: ["originalsSection", "titleText"], label: "Title", placeholder: "Originals", prefix: "title", scope: scope)
            JToggle(doc: doc, path: ["originalsSection", "showDesc"], label: "Show description")
            JStyledText(doc: doc, path: ["originalsSection", "description"], label: "Description", rich: true, prefix: "desc", scope: scope)
            JToggle(doc: doc, path: ["originalsSection", "showDots"], label: "Show dots")
            JPicker(doc: doc, path: ["originalsSection", "desktopRatio"], label: "Ratio", options: SiteOptions.ratios)
            JPicker(doc: doc, path: ["originalsSection", "mobileRatio"], label: "Phone ratio", options: SiteOptions.ratios)
            JNumberField(doc: doc, path: ["originalsSection", "rotationInterval"], label: "Auto-rotate", placeholder: "5", unit: "s")
            JNumberField(doc: doc, path: ["originalsSection", "gapBefore\(mobileSuffix)"], label: "Gap above", placeholder: scope == .mobile ? "Same" : "Default", unit: "px")
            JNumberField(doc: doc, path: ["originalsSection", "gapAfter\(mobileSuffix)"], label: "Gap below", placeholder: scope == .mobile ? "Same" : "Default", unit: "px")
            InsetFields(doc: doc, base: ["originalsSection"], scope: scope, defaultAmount: "8%")
        }
        // Which originals the carousel shows, in order (homeOriginals; with no
        // list at all the site shows every original).
        ItemList(doc: doc, path: ["homeOriginals"], title: "Originals cards", noun: "Card",
                 newItem: .object([("id", .string("")), ("category", .string(""))]),
                 caption: { card in (card["hidden"]?.bool == true ? "Hidden · " : "") + (card["id"]?.string ?? "") }) { card in
            JToggle(doc: doc, path: card + ["hidden"], label: "Hide on Home")
            JTextField(doc: doc, path: card + ["category"], label: "Category", placeholder: "ip")
            JTextField(doc: doc, path: card + ["id"], label: "Original", placeholder: "wonni-sooni")
        }
    }

    @ViewBuilder private var contacts: some View {
        let mobile = scope == .mobile ? "Mobile" : ""
        InspectorGroup(title: "Intro") {
            JStyledText(doc: doc, path: ["contactsIntroTitle"], label: "Title", placeholder: "Contact", scope: scope)
            JStyledText(doc: doc, path: ["contactsIntroDescription"], label: "Description", rich: true, prefix: "contactsIntroDesc", scope: scope)
            JNumberField(doc: doc, path: ["contactsIntroTopGap\(mobile)"], label: "Top gap", placeholder: scope == .mobile ? "Same" : "Default", unit: "px")
            JNumberField(doc: doc, path: ["contactsIntroTitleGap\(mobile)"], label: "Title gap", placeholder: scope == .mobile ? "Same" : "Default", unit: "px")
        }
        InspectorGroup(title: "Contact form") {
            JToggle(doc: doc, path: ["contactsFormEnabled"], label: "Show the contact form", defaultOn: true)
            JTextField(doc: doc, path: ["contactsFormEndpoint"], label: "Formspree URL", placeholder: "https://formspree.io/f/…")
            JTextField(doc: doc, path: ["contactsFormButtonText"], label: "Button text", placeholder: "Send message")
            JTextField(doc: doc, path: ["contactsFormSuccessText"], label: "After sending", placeholder: "Thanks — your message has been sent.")
            JPicker(doc: doc, path: ["contactsFormFont"], label: "Font", options: [("", "Default"), ("Georgia, serif", "Serif"), ("'Courier New', monospace", "Mono")])
            JColorField(doc: doc, path: ["contactsFormLabelColor"], label: "Labels")
            JColorField(doc: doc, path: ["contactsFormInputColor"], label: "Typed text")
            JColorField(doc: doc, path: ["contactsFormLineColor"], label: "Underline")
            JColorField(doc: doc, path: ["contactsFormButtonColor"], label: "Button")
            JColorField(doc: doc, path: ["contactsFormButtonTextColor"], label: "Button text")
            JNumberField(doc: doc, path: ["contactsFormButtonRadius"], label: "Button corners", placeholder: "Default", unit: "px")
        }
        ItemList(doc: doc, path: ["contactsFormFields"], title: "Extra form fields", noun: "Field",
                 newItem: .object([("id", .string("f_\(Int(Date().timeIntervalSince1970 * 1000))")), ("type", .string("checkbox")),
                                   ("label", .string("")), ("required", .bool(false))]),
                 caption: { $0["label"]?.string ?? "" }) { field in
            JPicker(doc: doc, path: field + ["type"], label: "Type", options: [("checkbox", "Checkbox"), ("text", "Short text"), ("textarea", "Long text")])
            JTextField(doc: doc, path: field + ["label"], label: "Label")
            if doc.root[path: field + ["type"]]?.string != "checkbox" {
                JTextField(doc: doc, path: field + ["placeholder"], label: "Placeholder")
            }
            JToggle(doc: doc, path: field + ["required"], label: "Required")
        }
        InspectorGroup(title: "Contact details", defaultOpen: false) {
            JTextField(doc: doc, path: ["email"], label: "Email")
            JTextField(doc: doc, path: ["instagram"], label: "Instagram")
            JTextField(doc: doc, path: ["linkedin"], label: "LinkedIn")
            JTextField(doc: doc, path: ["linkedinDisplayName"], label: "LinkedIn name")
            JTextField(doc: doc, path: ["whatsapp"], label: "WhatsApp")
            JTextField(doc: doc, path: ["contactMailLabel"], label: "Mail label")
            JTextField(doc: doc, path: ["contactInstagramLabel"], label: "Instagram label")
            JTextField(doc: doc, path: ["contactLinkedinLabel"], label: "LinkedIn label")
            JTextField(doc: doc, path: ["contactWhatsappLabel"], label: "WhatsApp label")
            JTextField(doc: doc, path: ["cvButtonText"], label: "CV button")
            JTextField(doc: doc, path: ["cvFile"], label: "CV file", placeholder: "/assets/….pdf")
        }
        InspectorGroup(title: "Page", defaultOpen: doc.root["contactsMaintenance"]?.bool == true) {
            PageMaintenanceToggle(doc: doc, path: ["contactsMaintenance"])
        }
    }

    @ViewBuilder private var archive: some View {
        InspectorGroup(title: "Archive") {
            JTextField(doc: doc, path: ["title"], label: "Title", typography: true)
            JRichTextField(doc: doc, path: ["description"], label: "Description")
        }
        ItemList(doc: doc, path: ["items"], title: "Entries", noun: "Entry",
                 newItem: ArchiveEntry.new("news"), extraNewItems: [("Portfolio", ArchiveEntry.new("portfolio")), ("News", ArchiveEntry.new("news"))],
                 caption: { "\($0["date"]?.string ?? "") \($0["title"]?.string ?? "")" }) { entry in
            ArchiveEntry(model: model, doc: doc, entry: entry)
        }
    }

    @ViewBuilder private var navbar: some View {
        InspectorGroup(title: "Site") {
            JTextField(doc: doc, path: ["name"], label: "Name")
            JTextField(doc: doc, path: ["tagline"], label: "Tagline")
        }
        InspectorGroup(title: "Fonts") {
            JPicker(doc: doc, path: ["fontFamily"], label: "Font", options: SiteOptions.fonts)
            JPicker(doc: doc, path: ["fontFallback"], label: "Fallback", options: [("", "Inter")] + SiteOptions.fonts.dropFirst().filter { $0.0 != "Inter" },
                    hint: "Used for characters the main font doesn’t have")
            JToggle(doc: doc, path: ["fontFallbackEverywhere"], label: "Use the fallback for all text")
        }
        InspectorGroup(title: "Navbar") {
            JPicker(doc: doc, path: ["navFontSize"], label: "Text size", options: SiteOptions.fontSizes)
            JPicker(doc: doc, path: ["navIconSize"], label: "Icon size", options: SiteOptions.fontSizes)
            JColorField(doc: doc, path: ["navBgColor"], label: "Bar")
            JColorField(doc: doc, path: ["navBottomBgColor"], label: "Sub-bar")
            JColorField(doc: doc, path: ["navBehindBgColor"], label: "Behind the bar")
        }
        InspectorGroup(title: "Menu") {
            ForEach([("/about", "About"), ("/projects", "Projects"), ("/originals", "Originals"), ("/blog", "Blog"), ("/contacts", "Contacts")], id: \.0) { path, title in
                let hidden = doc.root["hiddenBuiltinNav"]?.array?.contains(.string(path)) == true
                Toggle(title, isOn: Binding(get: { !hidden }, set: { on in
                    var list = doc.root["hiddenBuiltinNav"]?.array ?? []
                    list.removeAll { $0 == .string(path) }
                    if !on { list.append(.string(path)) }
                    doc.set(["hiddenBuiltinNav"], .array(list), name: "Menu")
                }))
                .toggleStyle(.checkbox)
            }
        }
        ItemList(doc: doc, path: ["navCustomItems"], title: "Extra menu items", noun: "Item",
                 newItem: .object([("label", .string("")), ("path", .string(""))]),
                 caption: { $0["label"]?.string ?? "" }) { item in
            JTextField(doc: doc, path: item + ["label"], label: "Label")
            JTextField(doc: doc, path: item + ["path"], label: "Path", placeholder: "/ig")
            JTextField(doc: doc, path: item + ["href"], label: "Goes to", placeholder: "https://instagram.com/… (optional)")
        }
        InspectorGroup(title: "Contents bar", defaultOpen: false) {
            JToggle(doc: doc, path: ["tocEnabled"], label: "Show it on project and original pages")
            JToggle(doc: doc, path: ["tocAlwaysShowLabels"], label: "Always show the labels")
            JNumberField(doc: doc, path: ["tocLabelSize"], label: "Label size", placeholder: "Default", unit: "px")
            JColorField(doc: doc, path: ["tocColor"], label: "Text")
            JColorField(doc: doc, path: ["tocActiveColor"], label: "Current item")
            JSegmented(doc: doc, path: ["tocBackgroundStyle"], label: "Style", options: [("pill", "Pill"), ("bar", "Bar")], defaultValue: "pill")
        }
        InspectorGroup(title: "CV button", defaultOpen: false) {
            JStyledText(doc: doc, path: ["cvButtonText"], label: "Text", prefix: "cvButton", scope: scope, styles: [.size, .weight, .color])
            JTextField(doc: doc, path: ["cvFile"], label: "File", placeholder: "/assets/….pdf")
        }
    }

    @ViewBuilder private var footer: some View {
        InspectorGroup(title: "Logo") {
            APIUploadField(model: model, doc: doc, path: ["footerIconUrl"], label: "Icon", endpoint: "/api/footer-images/upload",
                           resultKey: "url", types: [.image])
            JPicker(doc: doc, path: ["footerLogoSize"], label: "Size", options: SiteOptions.fontSizes)
            JToggle(doc: doc, path: ["footerLogoHidden"], label: "Hide the footer logo")
            JToggle(doc: doc, path: ["footerLogoHideHome"], label: "Hide it on Home")
        }
        InspectorGroup(title: "Text") {
            JTextField(doc: doc, path: ["footerTagline"], label: "Tagline", typography: true)
            JColorField(doc: doc, path: ["footerTaglineColor"], label: "Tagline color")
            JToggle(doc: doc, path: ["footerTaglineHidden"], label: "Hide the tagline")
            JTextField(doc: doc, path: ["footerLangText"], label: "Language label")
            JColorField(doc: doc, path: ["footerLangColor"], label: "Language color")
            JToggle(doc: doc, path: ["footerLangHidden"], label: "Hide the language label")
            JTextField(doc: doc, path: ["footerSitemapLinkLabel"], label: "Archive link")
            JColorField(doc: doc, path: ["footerSitemapLinkColor"], label: "Archive link color")
            JToggle(doc: doc, path: ["footerSitemapLinkHidden"], label: "Hide the archive link")
            JColorField(doc: doc, path: ["footerBreadcrumbColor"], label: "Breadcrumb")
            JToggle(doc: doc, path: ["footerBreadcrumbHidden"], label: "Hide the breadcrumb")
            JColorField(doc: doc, path: ["footerCopyrightColor"], label: "Copyright")
            JToggle(doc: doc, path: ["footerCopyrightHidden"], label: "Hide the copyright")
        }
        InspectorGroup(title: "Look") {
            JPicker(doc: doc, path: ["footerTitleSize"], label: "Column titles", options: SiteOptions.fontSizes)
            JPicker(doc: doc, path: ["footerLinkSize"], label: "Links", options: SiteOptions.fontSizes)
            JPicker(doc: doc, path: ["footerBottomSize"], label: "Bottom line", options: SiteOptions.fontSizes)
            JColorField(doc: doc, path: ["footerBgColor"], label: "Background")
            JColorField(doc: doc, path: ["footerLineColor"], label: "Lines")
            JToggle(doc: doc, path: ["footerBottomLineHidden"], label: "Hide the bottom divider")
            JLengthField(doc: doc, path: ["footerColumnGap"], label: "Column gap", placeholder: "Default")
            JLengthField(doc: doc, path: ["footerAccordionRowPadding"], label: "Phone row padding", placeholder: "Default")
        }
        ItemList(doc: doc, path: ["footerColumns"], title: "Columns", noun: "Column",
                 newItem: .object([("title", .string("")), ("items", .array([]))]),
                 caption: { $0["title"]?.string ?? "" }) { col in
            JTextField(doc: doc, path: col + ["title"], label: "Title")
            JToggle(doc: doc, path: col + ["hidden"], label: "Hide this column")
            ItemList(doc: doc, path: col + ["items"], title: "Links", noun: "Link",
                     newItem: .object([("label", .string("")), ("link", .string(""))]),
                     caption: { $0["label"]?.string ?? "" }) { link in
                JTextField(doc: doc, path: link + ["label"], label: "Label")
                JTextField(doc: doc, path: link + ["link"], label: "Goes to", placeholder: "/projects or https://…")
                JToggle(doc: doc, path: link + ["hidden"], label: "Hide")
            }
        }
    }

    @ViewBuilder private var maintenance: some View {
        InspectorGroup(title: "Maintenance page") {
            JToggle(doc: doc, path: ["maintenance"], label: "Site is under maintenance (visitors see this page)")
            JTextField(doc: doc, path: ["maintenanceTitle"], label: "Title", typography: true)
            JRichTextField(doc: doc, path: ["maintenanceDesc"], label: "Message")
            ImagePathSlot(model: model, doc: doc, path: ["maintenanceImage"], label: "Image", target: "/maintenance")
            JTextField(doc: doc, path: ["maintenancePassword"], label: "Password", placeholder: "Lets you in while it’s on")
        }
    }

    @ViewBuilder private var notFound: some View {
        InspectorGroup(title: "404 page") {
            JTextField(doc: doc, path: ["notFoundTitle"], label: "Title", typography: true)
            JRichTextField(doc: doc, path: ["notFoundDesc"], label: "Message")
            ImagePathSlot(model: model, doc: doc, path: ["notFoundImage"], label: "Image", target: "/assets/not-found")
        }
    }

    @ViewBuilder private var blogList: some View {
        InspectorGroup(title: "Blog title") {
            JToggle(doc: doc, path: ["blogTitleBold"], label: "Bold")
            JPicker(doc: doc, path: [scope == .mobile ? "blogTitleSizeMobile" : "blogTitleSize"], label: "Size",
                    options: scope == .mobile ? [("", "Same as larger")] + SiteOptions.fontSizes.dropFirst() : SiteOptions.fontSizes)
            JNumberField(doc: doc, path: [scope == .mobile ? "blogTitleTopGapMobile" : "blogTitleTopGap"], label: "Top gap",
                         placeholder: scope == .mobile ? "Same" : "Default", unit: "px")
            JNumberField(doc: doc, path: [scope == .mobile ? "blogTitleGapMobile" : "blogTitleGap"], label: "Gap below",
                         placeholder: scope == .mobile ? "Same" : "Default", unit: "px")
        }
        ItemList(doc: doc, path: ["blogCategories"], title: "Categories", noun: "Category",
                 newItem: .object([("id", .string("")), ("label", .string(""))]),
                 caption: { $0["label"]?.string ?? $0["id"]?.string ?? "" }) { cat in
            JTextField(doc: doc, path: cat + ["label"], label: "Name")
            JTextField(doc: doc, path: cat + ["id"], label: "ID", placeholder: "lowercase-id")
            Text("Posts refer to a category by its ID.").font(.caption).foregroundStyle(.secondary)
        }
        if let posts = model.sideDocument("src/data/blog.json") {
            BlogPostList(model: model, posts: posts, categories: doc.root["blogCategories"]?.array ?? [])
        }
    }
}

/// A page's sections, to pick one or add another (pages whose Page tab is
/// mostly sections: category pages, the blog).
struct SectionsOverview: View {
    @ObservedObject var model: EditorModel
    @ObservedObject var doc: ContentDocument
    let key: String

    var body: some View {
        let sections = doc.root[key]?.array ?? []
        InspectorGroup(title: "Sections", trailing: AnyView(addMenu)) {
            if sections.isEmpty {
                Text("No sections yet.").font(.callout).foregroundStyle(.secondary)
            }
            ForEach(Array(sections.enumerated()), id: \.offset) { i, s in
                Button { model.selectSection(i) } label: {
                    HStack {
                        Text(s["label"]?.string.flatMap { $0.isEmpty ? nil : $0 } ?? "Section \(i + 1)")
                        Text(SiteIndex.typeNames[s["type"]?.string ?? ""] ?? "").foregroundStyle(.secondary)
                        Spacer()
                        if s["hidden"]?.bool == true { Image(systemName: "eye.slash").foregroundStyle(.tertiary) }
                        Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
                    }
                    .font(.callout)
                    .padding(6)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .background(Corner.shape(Corner.tile).fill(Color.secondary.opacity(0.06)))
            }
        }
    }

    private var addMenu: some View {
        Menu("Add") {
            ForEach(NativeInspector.addableTypes(on: model.form?.page), id: \.0) { t in
                Button(t.1) { model.addSection(type: t.0, after: nil) }
            }
        }
        .menuStyle(.borderlessButton)
        .fixedSize()
        .controlSize(.small)
    }
}


/// The About page's photo carousel: upload, caption, reorder, hide, delete.
struct AboutPhotos: View {
    @ObservedObject var model: EditorModel
    @ObservedObject var doc: ContentDocument
    @State private var uploading = false
    @State private var revision = 0

    private var folder: URL? { model.document.packageURL?.appendingPathComponent("site/public/assets/about/photos") }

    var body: some View {
        let items = doc.root[path: ["photos", "items"]]?.array ?? []
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(items.enumerated()), id: \.offset) { i, item in
                let file = item["file"]?.string ?? ""
                HStack(alignment: .top, spacing: 8) {
                    Thumbnail(url: find(file), size: 52).id("\(file)#\(revision)")
                        .opacity(item["hidden"]?.bool == true ? 0.4 : 1)
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 4) {
                            CommitTextField(placeholder: "Title", value: item["title"]?.string ?? "") {
                                doc.set(["photos", "items", i, "title"], .string($0), name: "Photo Title")
                            }
                            CommitTextField(placeholder: "Year", value: item["year"]?.string ?? "") {
                                doc.set(["photos", "items", i, "year"], $0.isEmpty ? nil : .string($0), name: "Photo Year")
                            }
                            .frame(width: 60)
                        }
                        CommitTextField(placeholder: "Description", value: item["description"]?.string ?? "", axis: .vertical) {
                            doc.set(["photos", "items", i, "description"], .string($0), name: "Photo Description")
                        }
                        CommitTextField(placeholder: "Link (optional)", value: item["link"]?.string ?? "") {
                            doc.set(["photos", "items", i, "link"], $0.isEmpty ? nil : .string($0), name: "Photo Link")
                        }
                    }
                    .textFieldStyle(.roundedBorder).controlSize(.small)
                    Menu {
                        Button("Move Up") { move(items, i, -1) }.disabled(i == 0)
                        Button("Move Down") { move(items, i, 1) }.disabled(i == items.count - 1)
                        Button(item["hidden"]?.bool == true ? "Show on Site" : "Hide on Site") {
                            doc.set(["photos", "items", i, "hidden"], .bool(item["hidden"]?.bool != true), name: "Hide Photo")
                        }
                        Divider()
                        Button("Delete Photo…", role: .destructive) { delete(items, i) }
                    } label: { Image(systemName: "ellipsis") }
                    .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize()
                }
            }
            Button(uploading ? "Uploading…" : "Add Photos…") { add(items) }.controlSize(.small).disabled(uploading)
        }
    }

    private func find(_ base: String) -> URL? {
        guard let folder, !base.isEmpty else { return nil }
        return ImagePathSlot.extensions.lazy.map { folder.appendingPathComponent("\(base).\($0)") }
            .first { FileManager.default.fileExists(atPath: $0.path) }
    }

    private func move(_ items: [JSONValue], _ i: Int, _ d: Int) {
        var l = items; l.swapAt(i, i + d)
        doc.set(["photos", "items"], .array(l), name: "Move Photo")
    }

    private func add(_ items: [JSONValue]) {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.image]
        panel.allowsMultipleSelection = true
        guard panel.runModal() == .OK else { return }
        uploading = true
        Task {
            var list = items
            for url in panel.urls {
                guard let data = try? Data(contentsOf: url) else { continue }
                let r = await model.callAPI("POST", "/api/about-photos/upload", body: ["name": url.lastPathComponent, "data": data.base64EncodedString()])
                if let base = (r.json as? [String: Any])?["baseName"] as? String {
                    list.append(.object([("file", .string(base)), ("title", .string("")), ("description", .string("")), ("hidden", .bool(false))]))
                }
            }
            doc.set(["photos", "items"], .array(list), name: "Add Photos")
            uploading = false
            revision += 1
        }
    }

    private func delete(_ items: [JSONValue], _ i: Int) {
        let file = items[i]["file"]?.string ?? ""
        let alert = NSAlert()
        alert.messageText = "Delete this photo?"
        alert.informativeText = "Its file is removed from the project."
        alert.addButton(withTitle: "Delete")
        alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        var l = items; l.remove(at: i)
        doc.set(["photos", "items"], .array(l), name: "Delete Photo")
        if let url = find(file) {
            Task { _ = await model.callAPI("DELETE", "/api/about-photos/\(url.lastPathComponent)") }
        }
    }
}


/// An inset image block: on/off, the inset per screen and its background.
struct InsetFields: View {
    @ObservedObject var doc: ContentDocument
    let base: [Any]
    let scope: SizeScope
    var defaultAmount = "12%"

    var body: some View {
        JToggle(doc: doc, path: base + ["inset"], label: "Inset (background shows at the edges)")
        if doc.root[path: base + ["inset"]]?.bool == true {
            JLengthField(doc: doc, path: base + [scope == .mobile ? "insetAmountMobile" : "insetAmount"], label: "Inset",
                         placeholder: scope == .mobile ? "Same" : defaultAmount)
            JColorField(doc: doc, path: base + ["bgColor"], label: "Background", placeholder: "#f5f5f7")
        }
    }
}

/// One Home card (Featured or a grid row's): what it links to, its text,
/// images and logo.
struct HomeCardFields: View {
    @ObservedObject var model: EditorModel
    @ObservedObject var doc: ContentDocument
    let item: [Any]
    let scope: SizeScope
    let inset: Bool
    let featured: Bool

    var body: some View {
        let v = doc.root[path: item]
        let id = v?["id"]?.string ?? ""
        let image = v?["image"]?.string.flatMap { $0.isEmpty ? nil : $0 } ?? "/assets/home/projects/\(id.isEmpty ? "card" : id)"
        FieldRow(label: "Links to") {
            Picker("Links to", selection: Binding(
                get: { "\(v?["linkType"]?.string ?? "projects")/\(v?["category"]?.string ?? "")/\(id)" },
                set: { key in
                    let parts = key.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
                    guard parts.count == 3 else { return }
                    doc.edit("Change Card Link") { root in
                        root.set(path: item + ["linkType"], .string(parts[0]))
                        root.set(path: item + ["category"], .string(parts[1]))
                        root.set(path: item + ["id"], .string(parts[2]))
                    }
                })) {
                Text("Choose…").tag("projects//")
                ForEach(["projects", "originals"], id: \.self) { type in
                    Section(type.capitalized) {
                        ForEach(model.itemList(type), id: \.key) { e in Text(e.title).tag("\(type)/\(e.category)/\(e.id)") }
                    }
                }
            }
            .labelsHidden().fixedSize()
        }
        JToggle(doc: doc, path: item + ["hidden"], label: "Hide this card")
        if !featured {
            JTextField(doc: doc, path: item + ["title"], label: "Title", placeholder: "Used as the image description")
        }
        JStyledText(doc: doc, path: item + ["tagline"], label: "Tagline", rich: true, scope: scope)
        JLengthField(doc: doc, path: item + [scope == .mobile ? "taglineTopMobile" : "taglineTop"], label: "Tagline top",
                     placeholder: scope == .mobile ? "Same" : "Bottom", hint: "From the top, e.g. 40px or 30%; empty keeps it at the bottom")
        ImagePathSlot(model: model, doc: doc, path: item + ["image"], label: "Image", target: image)
        ImagePathSlot(model: model, doc: doc, path: item + ["tabletImage"], label: "Tablet image", target: image + "-tablet", optional: true)
        ImagePathSlot(model: model, doc: doc, path: item + ["mobileImage"], label: "Phone image", target: image + "-mobile", optional: true)
        JToggle(doc: doc, path: item + ["nativeSize"], label: "Show at its own pixel size (no scaling)")
        JToggle(doc: doc, path: item + ["hideOnMobile"], label: "Hide the image on phones")
        if inset { JColorField(doc: doc, path: item + ["bgColor"], label: "Background", placeholder: "Row’s") }
        ImagePathSlot(model: model, doc: doc, path: item + ["logo"], label: "Logo", target: image + "-logo", optional: true)
        if v?["logo"]?.string?.isEmpty == false {
            JLengthField(doc: doc, path: item + [scope == .mobile ? "logoHeightMobile" : "logoHeight"], label: "Logo height",
                         placeholder: scope == .mobile ? "Same" : "60px")
            JLengthField(doc: doc, path: item + ["logoGap"], label: "Logo gap", placeholder: "12px")
        }
    }
}


/// One Archive entry (a portfolio PDF or a news item).
struct ArchiveEntry: View {
    @ObservedObject var model: EditorModel
    @ObservedObject var doc: ContentDocument
    let entry: [Any]

    static func new(_ type: String) -> JSONValue {
        let today = String(ISO8601DateFormatter().string(from: Date()).prefix(10))
        var o: JSONValue = .object([("id", .string("\(type)-\(Int(Date().timeIntervalSince1970 * 1000))")), ("type", .string(type)),
                                    ("date", .string(type == "portfolio" ? String(today.prefix(4)) : today)), ("title", .string("")),
                                    ("description", .string("")), ("link", .string("")), ("file", .string("")), ("image", .string("")),
                                    ("hidden", .bool(false))])
        if type == "portfolio" { o.set("access", .string("public")) }
        return o
    }

    var body: some View {
        let portfolio = doc.root[path: entry + ["type"]]?.string == "portfolio"
        JPicker(doc: doc, path: entry + ["type"], label: "Kind", options: [("portfolio", "Portfolio"), ("news", "News")])
        JTextField(doc: doc, path: entry + ["date"], label: portfolio ? "Year" : "Date", placeholder: portfolio ? "2025" : "2026-03-14")
        JTextField(doc: doc, path: entry + ["title"], label: "Title")
        JTextField(doc: doc, path: entry + ["description"], label: "Description")
        if portfolio {
            JPicker(doc: doc, path: entry + ["access"], label: "Access", options: [("public", "Public — link to the file"), ("request", "On request — links to Contacts")])
            APIUploadField(model: model, doc: doc, path: entry + ["file"], label: "PDF", endpoint: "/api/archive/upload", resultKey: "src", types: [.pdf])
        }
        JTextField(doc: doc, path: entry + ["link"], label: "Link", placeholder: "When there’s no file: https://… or /projects/…")
        APIUploadField(model: model, doc: doc, path: entry + ["image"], label: "Thumbnail", endpoint: "/api/archive/upload", resultKey: "src", types: [.image])
        JToggle(doc: doc, path: entry + ["hidden"], label: "Hide this entry")
    }
}

/// A file path that's usually uploaded: the path, plus Upload… through an
/// editor-API route that answers with the stored file's path.
struct APIUploadField: View {
    @ObservedObject var model: EditorModel
    @ObservedObject var doc: ContentDocument
    let path: [Any]
    let label: String
    let endpoint: String
    let resultKey: String
    let types: [UTType]
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        FieldRow(label: label) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    CommitTextField(placeholder: "Path", value: doc.root[path: path]?.string ?? "") {
                        doc.set(path, $0.isEmpty ? nil : .string($0), name: "Change \(label)")
                    }
                    .textFieldStyle(.roundedBorder)
                    Button(busy ? "…" : "Upload…") { upload() }.controlSize(.small).disabled(busy)
                }
                if let error { Text(error).font(.caption).foregroundStyle(.red) }
            }
        }
    }

    private func upload() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = types
        guard panel.runModal() == .OK, let url = panel.url, let data = try? Data(contentsOf: url) else { return }
        busy = true
        error = nil
        Task {
            let r = await model.callAPI("POST", endpoint, body: ["name": url.lastPathComponent, "data": data.base64EncodedString()])
            busy = false
            if let src = (r.json as? [String: Any])?[resultKey] as? String {
                doc.set(path, .string(src), name: "Upload \(label)")
                model.refreshChanges()
                model.preview.reloadKeepingScroll()
            } else {
                error = (r.json as? [String: Any])?["error"] as? String ?? "Upload failed (\(r.status))."
            }
        }
    }
}


/// The blog's posts, in the order the list shows them: title, date and
/// category; new posts and deleting are in the sidebar.
struct BlogPostList: View {
    @ObservedObject var model: EditorModel
    @ObservedObject var posts: ContentDocument
    let categories: [JSONValue]

    var body: some View {
        let list = posts.root.array ?? []
        InspectorGroup(title: "Posts", trailing: AnyView(Button("New Post…") { model.requestNewItem(.post) }.controlSize(.small))) {
            ForEach(Array(list.enumerated()), id: \.offset) { i, post in
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 4) {
                        CommitTextField(placeholder: "Title", value: post["title"]?.string ?? "") {
                            posts.set([i, "title"], .string($0), name: "Post Title")
                        }
                        Menu {
                            Button("Open") { model.open("post:\(post["id"]?.string ?? "")") }
                            Button("Move Up") { move(list, i, -1) }.disabled(i == 0)
                            Button("Move Down") { move(list, i, 1) }.disabled(i == list.count - 1)
                        } label: { Image(systemName: "ellipsis") }
                        .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize()
                    }
                    HStack(spacing: 4) {
                        CommitTextField(placeholder: "2026-03-14", value: post["date"]?.string ?? "") {
                            posts.set([i, "date"], .string($0), name: "Post Date")
                        }
                        .frame(width: 100)
                        Picker("Category", selection: Binding(get: { post["category"]?.string ?? "" },
                                                              set: { posts.set([i, "category"], .string($0), name: "Post Category") })) {
                            ForEach(categories.compactMap { $0["id"]?.string }, id: \.self) { id in
                                Text(categories.first { $0["id"]?.string == id }?["label"]?.string ?? id).tag(id)
                            }
                            if let c = post["category"]?.string, !categories.contains(where: { $0["id"]?.string == c }) { Text(c).tag(c) }
                        }
                        .labelsHidden().fixedSize()
                    }
                }
                .textFieldStyle(.roundedBorder).controlSize(.small)
                .padding(6)
                .background(Corner.shape(Corner.group).fill(Color.secondary.opacity(0.06)))
            }
        }
    }

    private func move(_ list: [JSONValue], _ i: Int, _ d: Int) {
        var l = list; l.swapAt(i, i + d)
        posts.set([], .array(l), name: "Move Post")
    }
}

/// A post's entry in blog.json: title, date, category, the list's preview
/// text and thumbnail.
struct BlogPostMeta: View {
    @ObservedObject var model: EditorModel
    let postID: String
    let scope: SizeScope

    var body: some View {
        if let posts = model.sideDocument("src/data/blog.json"), let config = model.sideDocument("src/data/siteConfig.json") {
            BlogPostMetaFields(model: model, posts: posts, config: config, postID: postID, scope: scope)
        }
    }
}

private struct BlogPostMetaFields: View {
    @ObservedObject var model: EditorModel
    @ObservedObject var posts: ContentDocument
    @ObservedObject var config: ContentDocument
    let postID: String
    let scope: SizeScope

    var body: some View {
        if let i = posts.root.array?.firstIndex(where: { $0["id"]?.string == postID }) {
            let cats = config.root["blogCategories"]?.array ?? []
            InspectorGroup(title: "Post") {
                JTextField(doc: posts, path: [i, "title"], label: "Title")
                JTextField(doc: posts, path: [i, "date"], label: "Date", placeholder: "2026-03-14")
                FieldRow(label: "Category") {
                    Picker("Category", selection: Binding(get: { posts.root[path: [i, "category"]]?.string ?? "" },
                                                          set: { posts.set([i, "category"], .string($0), name: "Post Category") })) {
                        ForEach(cats.compactMap { $0["id"]?.string }, id: \.self) { id in
                            Text(cats.first { $0["id"]?.string == id }?["label"]?.string ?? id).tag(id)
                        }
                    }
                    .labelsHidden().fixedSize()
                }
                FieldRow(label: "Preview") {
                    CommitTextField(placeholder: "Shown in the post list", value: posts.root[path: [i, "preview"]]?.string ?? "", axis: .vertical) {
                        posts.set([i, "preview"], .string($0), name: "Post Preview")
                    }
                    .textFieldStyle(.roundedBorder)
                }
                PageMaintenanceToggle(doc: posts, path: [i, "maintenance"])
            }
            InspectorGroup(title: "Thumbnail") {
                ImagePathSlot(model: model, doc: posts, path: [i, "thumbnail"], label: "Image", target: "/assets/blog/\(postID)/thumbnail")
                ImagePathSlot(model: model, doc: posts, path: [i, "thumbnailTabletImage"], label: "Tablet image",
                              target: "/assets/blog/\(postID)/thumbnail-tablet", optional: true)
                ImagePathSlot(model: model, doc: posts, path: [i, "thumbnailMobileImage"], label: "Phone image",
                              target: "/assets/blog/\(postID)/thumbnail-mobile", optional: true)
                JPicker(doc: posts, path: [i, "thumbnailDesktopRatio"], label: "Ratio", options: SiteOptions.ratios)
                JPicker(doc: posts, path: [i, "thumbnailMobileRatio"], label: "Phone ratio", options: SiteOptions.ratios)
                JToggle(doc: posts, path: [i, "thumbnailNativeSize"], label: "Show at its own pixel size (no scaling)")
                JToggle(doc: posts, path: [i, "thumbnailHideOnMobile"], label: "Hide on phones")
            }
        } else {
            Text("This post isn’t in the post list.").foregroundStyle(.secondary).padding(16)
        }
    }
}

/// A category page's top: its title and icon row, sized per screen and
/// stored per category in siteConfig.json (categoryHeroTitleSize.product …).
struct CategoryHeroFields: View {
    @ObservedObject var model: EditorModel
    let type: String
    let category: String
    let scope: SizeScope

    var body: some View {
        if let config = model.sideDocument("src/data/siteConfig.json") {
            CategoryHeroForm(config: config, category: category, scope: scope)
        }
    }
}

private struct CategoryHeroForm: View {
    @ObservedObject var config: ContentDocument
    let category: String
    let scope: SizeScope

    private var suffix: String { scope == .all ? "" : scope == .tablet ? "Tablet" : "Mobile" }
    private var same: String { scope == .all ? "Default" : "Same" }

    var body: some View {
        InspectorGroup(title: "Top of the page") {
            JLengthField(doc: config, path: ["categoryHeroTitleSize\(suffix)", category], label: "Title size", placeholder: same)
            JLengthField(doc: config, path: ["categoryTitleTopGap\(suffix)", category], label: "Title top gap", placeholder: same)
            JLengthField(doc: config, path: ["categoryHeroGap\(suffix)", category], label: "Title–icons gap", placeholder: same)
            JLengthField(doc: config, path: ["categoryIconSize\(suffix)", category], label: "Icon size", placeholder: same)
            JLengthField(doc: config, path: ["categoryIconGap\(suffix)", category], label: "Icon gap", placeholder: same)
            if scope == .all {
                JNumberField(doc: config, path: ["categoryAnimDuration", category], label: "Animation", placeholder: "Default", unit: "s")
                JNumberField(doc: config, path: ["categoryAnimStagger", category], label: "Stagger", placeholder: "Default", unit: "s")
            }
        }
    }
}
