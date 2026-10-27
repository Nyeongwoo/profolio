import SwiftUI

/// A short tour of what Profolio does, a page at a time. Shown the first
/// time a site opens in this copy of the app, and again from Help ▸
/// Profolio Tour.
struct TutorialView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var page = 0

    static let seenKey = "tutorialSeen"

    private struct Page {
        let symbol: String
        let title: String
        let text: String
        var keys: String = ""
    }

    private let pages: [Page] = [
        Page(symbol: "paintbrush.pointed", title: "Welcome to Profolio",
             text: "Edit your portfolio site without touching code: change words, images and layout, see the result as you go, and publish it to the web."),
        Page(symbol: "sidebar.left", title: "Every page in the sidebar",
             text: "Home, About, each project and post, and the site settings (Site Structure, Navbar, Footer, Maintenance) are listed on the left. Pick one to open it.",
             keys: "⌘K goes to any page, section or text"),
        Page(symbol: "cursorarrow.rays", title: "Click the preview to edit",
             text: "The middle shows your site as visitors see it. Click a section to select it; its settings open on the right. Switch between desktop, tablet and phone sizes in the toolbar."),
        Page(symbol: "slider.horizontal.3", title: "Forms save as you type",
             text: "The inspector on the right edits the page, the selected section and its cards. Drop images onto a slot — PNGs become WebP. Changes are saved straight away; ⌘Z undoes them."),
        Page(symbol: "globe", title: "Add languages when you need them",
             text: "A site starts in English. In Site Structure ▸ Languages, add Korean, Japanese and others; then pick a language in the toolbar to translate each page beside its English."),
        Page(symbol: "sparkles", title: "Help when you want something new",
             text: "The Assistant (⌘J) makes changes you describe in words. For new kinds of sections or interactions, File ▸ Coding Agents sets up Claude Code or Codex on your site’s code."),
        Page(symbol: "arrow.up.circle", title: "Publish when it’s ready",
             text: "Nothing goes live until you publish. The toolbar shows what has changed; Publish sends it to GitHub and your site updates. Backups keep earlier versions of every page.",
             keys: "⇧⌘P publishes · ⇧⌘B opens Backups"),
    ]

    var body: some View {
        let p = pages[page]
        VStack(spacing: 0) {
            VStack(spacing: 14) {
                Image(systemName: p.symbol)
                    .font(.system(size: 44, weight: .regular))
                    .foregroundStyle(Color.accentColor)
                    .frame(height: 56)
                Text(p.title).font(.title2.weight(.semibold)).multilineTextAlignment(.center)
                Text(p.text)
                    .font(.body).foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                if !p.keys.isEmpty {
                    Text(p.keys).font(.callout.monospaced()).foregroundStyle(.tertiary)
                }
            }
            .padding(.horizontal, 36).padding(.top, 36)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .id(page)
            .transition(.opacity)

            HStack(spacing: 6) {
                ForEach(pages.indices, id: \.self) { i in
                    Circle().fill(i == page ? Color.accentColor : Color.secondary.opacity(0.3)).frame(width: 6, height: 6)
                }
            }
            .padding(.bottom, 16)

            Divider()
            HStack {
                Button("Skip Tour") { finish() }
                    .opacity(page == pages.count - 1 ? 0 : 1)
                    .disabled(page == pages.count - 1)
                Spacer()
                if page > 0 {
                    Button("Back") { withAnimation { page -= 1 } }
                }
                Button(page == pages.count - 1 ? "Start Editing" : "Next") {
                    if page == pages.count - 1 { finish() } else { withAnimation { page += 1 } }
                }
                .keyboardShortcut(.defaultAction)
            }
            .padding(14)
        }
        .frame(width: 480, height: 380)
    }

    private func finish() {
        UserDefaults.standard.set(true, forKey: Self.seenKey)
        dismiss()
    }
}
