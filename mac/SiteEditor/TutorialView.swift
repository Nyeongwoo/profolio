import AppKit
import SwiftUI

/// A short tour of what Profolio does, a page at a time. Shown the first
/// time a site opens in this copy of the app, and again from Help ▸
/// Profolio Tour.
struct TutorialView: View {
    /// What to paste into an agent Profolio doesn't set up (CodingAgent.handoffPrompt).
    let prompt: String
    /// Opens File ▸ Coding Agents… once the tour has closed.
    let openCodingAgents: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var page = 0
    @State private var copied = false

    static let seenKey = "tutorialSeen"

    private enum Extra { case none, codingAgents, prompt }

    private struct Page {
        let symbol: String
        let title: String
        let text: String
        var keys: String = ""
        var extra: Extra = .none
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
        Page(symbol: "sparkles", title: "Ask the Assistant",
             text: "The Assistant (⌘J) makes changes you describe in words — a new project, reworded text, a section moved — using the same forms you do.",
             keys: "⌘J shows the Assistant"),
        Page(symbol: "terminal", title: "Claude Code or Codex for new designs",
             text: "For new kinds of sections, layouts or interactions, a coding agent can change the site’s code. You need your own Claude (Anthropic) or ChatGPT (OpenAI) account.",
             extra: .codingAgents),
        Page(symbol: "doc.on.clipboard", title: "Already use one? Paste this",
             text: "If installing from Profolio doesn’t work, or you run Claude Code or Codex somewhere else, paste this prompt into it and write your change at the end.",
             extra: .prompt),
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
                switch p.extra {
                case .none: EmptyView()
                case .codingAgents: codingAgentSteps
                case .prompt: promptBox
                }
            }
            .padding(.horizontal, 36).padding(.top, 30)
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
        .frame(width: 540, height: 500)
    }

    private var codingAgentSteps: some View {
        VStack(alignment: .leading, spacing: 8) {
            step(1, "File ▸ Coding Agents… — click Install next to Claude Code or Codex. It installs in Terminal.")
            step(2, "Click Sign In and log in with your own account.")
            step(3, "Click Open Site Code. Profolio downloads your site’s code to ~/Profolio and starts the agent there in Terminal.")
            step(4, "Describe the change in Terminal. When you’re happy, click Push to GitHub; your next Publish brings it into Profolio.")
            Button("Open Coding Agents…") {
                finish()
                openCodingAgents()
            }
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func step(_ n: Int, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("\(n)").font(.callout.weight(.semibold).monospacedDigit()).foregroundStyle(Color.accentColor)
            Text(text).font(.callout).fixedSize(horizontal: false, vertical: true)
        }
    }

    private var promptBox: some View {
        VStack(alignment: .leading, spacing: 8) {
            ScrollView {
                Text(prompt)
                    .font(.caption.monospaced())
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(10)
            }
            .frame(height: 150)
            .background(RoundedRectangle(cornerRadius: 8).fill(Color.secondary.opacity(0.08)))
            HStack {
                Button(copied ? "Copied" : "Copy Prompt") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(prompt, forType: .string)
                    copied = true
                }
                Text("Also in File ▸ Coding Agents…").font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func finish() {
        UserDefaults.standard.set(true, forKey: Self.seenKey)
        dismiss()
    }
}
