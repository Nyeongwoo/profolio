import AppKit
import SwiftUI

/// File ▸ New Site… (⇧⌘N): names, where it goes, then SiteCreator — and the
/// one step left in the browser, connecting Vercel.
struct NewSiteView: View {
    @ObservedObject private var account = GitHubAccount.shared
    var close: () -> Void

    @State private var siteName = ""
    @State private var ownerName = ""
    @State private var repo = ""
    @State private var repoEdited = false
    @State private var isPrivate = true
    @State private var folder: URL?
    @State private var working = false
    @State private var status = ""
    @State private var error: String?
    @State private var result: SiteCreator.Result?
    @State private var presets: [SiteCreator.Preset] = []
    @State private var preset: SiteCreator.Preset?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                Image(nsImage: NSApp.applicationIconImage).resizable().frame(width: 48, height: 48)
                VStack(alignment: .leading, spacing: 2) {
                    Text(result == nil ? "New Site" : "Your site is ready").font(.title3.weight(.semibold))
                    Text(result == nil ? "A new portfolio from Profolio’s starter, with its own GitHub repository."
                                       : "One last step: connect it to Vercel so it goes online.")
                        .font(.callout).foregroundStyle(.secondary)
                }
            }

            if let result {
                finished(result)
            } else if !account.isSignedIn {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Sign in to GitHub first — the site’s files live in a repository of yours.").font(.callout)
                    Button("Sign In…") { account.showWindow() }
                }
            } else {
                form
            }

            if let error { Text(error).font(.callout).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true) }

            HStack {
                if working {
                    ProgressView().controlSize(.small)
                    Text(status).font(.callout).foregroundStyle(.secondary)
                }
                Spacer()
                if result != nil {
                    Button("Done") { close() }.keyboardShortcut(.defaultAction)
                } else {
                    Button("Cancel") { close() }.keyboardShortcut(.cancelAction).disabled(working)
                    Button("Create Site") { Task { await create() } }
                        .keyboardShortcut(.defaultAction)
                        .disabled(!valid || working || !account.isSignedIn)
                }
            }
        }
        .padding(22)
        .frame(width: 560)
        .onChange(of: siteName) { if !repoEdited { repo = NewItemSheet.slugify(siteName) } }
        .task {
            presets = SiteCreator.presets()
            preset = preset ?? presets.first
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !presets.isEmpty { presetPicker }
            fields
        }
    }

    private var presetPicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Layout").font(.callout.weight(.medium))
            HStack(spacing: 10) {
                ForEach(presets) { p in
                    Button { preset = p } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            PresetSketch(preset: p)
                                .frame(height: 74)
                                .padding(6)
                                .background(Corner.shape(Corner.control).fill(Color(nsColor: .textBackgroundColor)))
                            Text(p.name).font(.callout.weight(.medium))
                            Text(p.description).font(.caption).foregroundStyle(.secondary).lineLimit(2, reservesSpace: true)
                        }
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Corner.shape(Corner.group).fill(preset == p ? Color.accentColor.opacity(0.12) : Color.secondary.opacity(0.06)))
                        .overlay(Corner.shape(Corner.group).strokeBorder(preset == p ? Color.accentColor : .clear, lineWidth: 2))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            Text("You can change all of this later in the inspector.").font(.caption).foregroundStyle(.tertiary)
        }
    }

    private var fields: some View {
        Form {
            TextField("Site name", text: $siteName, prompt: Text("e.g. Jane Doe Portfolio"))
            TextField("Your name", text: $ownerName, prompt: Text("Shown on the site"))
            TextField("Repository", text: Binding(get: { repo }, set: { repo = $0; repoEdited = true }),
                      prompt: Text("letters, numbers, - and _"))
            Toggle("Private repository", isOn: $isPrivate)
            LabeledContent("Saved in") {
                HStack {
                    Text(displayPath).lineLimit(1).truncationMode(.middle).foregroundStyle(.secondary)
                    Button("Change…") { chooseFolder() }
                }
            }
        }
        .formStyle(.grouped)
        .scrollDisabled(true)
        .frame(height: 250)
    }

    private func finished(_ r: SiteCreator.Result) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("github.com/\(r.owner)/\(r.repo)", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
            Label(r.package.lastPathComponent + " is open", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
            Text("In Vercel, import the repository with the defaults (it detects Vite). After that, Publish in Profolio puts your changes online.")
                .font(.callout).fixedSize(horizontal: false, vertical: true)
            Button("Connect to Vercel…") {
                let repoURL = "https://github.com/\(r.owner)/\(r.repo)"
                let encoded = repoURL.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? repoURL
                NSWorkspace.shared.open(URL(string: "https://vercel.com/new/import?s=\(encoded)")!)
            }
            .buttonStyle(.borderedProminent)
        }
    }

    private var targetFolder: URL { folder ?? SiteCreator.defaultFolder(repo) }

    private var displayPath: String {
        targetFolder.path
            .replacingOccurrences(of: FileManager.default.homeDirectoryForCurrentUser.path + "/Library/Mobile Documents/com~apple~CloudDocs", with: "iCloud Drive")
            .replacingOccurrences(of: FileManager.default.homeDirectoryForCurrentUser.path, with: "~")
    }

    private var valid: Bool {
        !siteName.trimmingCharacters(in: .whitespaces).isEmpty
            && repo.range(of: "^[A-Za-z0-9._-]+$", options: .regularExpression) != nil
    }

    private func chooseFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.canCreateDirectories = true
        panel.prompt = "Choose"
        if panel.runModal() == .OK { folder = panel.url }
    }

    private func create() async {
        guard let token = account.token else { return }
        working = true
        error = nil
        defer { working = false }
        let options = SiteCreator.Options(siteName: siteName.trimmingCharacters(in: .whitespaces),
                                          ownerName: ownerName.trimmingCharacters(in: .whitespaces).isEmpty ? siteName : ownerName,
                                          repoName: repo, isPrivate: isPrivate, folder: targetFolder, preset: preset)
        let creator = SiteCreator(token: token) { message in
            DispatchQueue.main.async { status = message }
        }
        do {
            let r = try await creator.create(options)
            result = r
            NSDocumentController.shared.openDocument(withContentsOf: r.package, display: true) { _, _, _ in }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// A small drawing of a preset's layout: an optional big featured card, then
/// the project grid at its column count and image ratio.
private struct PresetSketch: View {
    let preset: SiteCreator.Preset

    var body: some View {
        GeometryReader { geo in
            VStack(spacing: 3) {
                Capsule().fill(Color.secondary.opacity(0.35)).frame(width: geo.size.width * 0.3, height: 3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if preset.featured {
                    RoundedRectangle(cornerRadius: 2, style: .continuous).fill(Color.accentColor.opacity(0.55)).frame(height: geo.size.height * 0.34)
                }
                let cols = max(1, preset.columns)
                let gap: CGFloat = 3
                let w = (geo.size.width - gap * CGFloat(cols - 1)) / CGFloat(cols)
                LazyVGrid(columns: Array(repeating: GridItem(.fixed(w), spacing: gap), count: cols), spacing: gap) {
                    ForEach(0..<(cols * 3), id: \.self) { i in
                        RoundedRectangle(cornerRadius: 2, style: .continuous)
                            .fill(Color.accentColor.opacity(0.18 + 0.1 * Double(i % 3)))
                            .frame(width: w, height: w / max(preset.ratio, 0.3))
                    }
                }
            }
            // Laid out at the card's size and cut to it: a one- or
            // two-column layout's cards are taller than the sketch, and
            // would otherwise run out over the label below.
            .frame(width: geo.size.width, height: geo.size.height, alignment: .top)
            .clipped()
        }
    }
}

/// The New Site window (one at a time).
@MainActor
enum NewSiteWindow {
    private static var window: NSWindow?

    static func show() {
        if let window { window.makeKeyAndOrderFront(nil); return }
        let w = NSWindow(contentRect: .zero, styleMask: [.titled, .closable], backing: .buffered, defer: false)
        w.title = "New Site"
        w.isReleasedWhenClosed = false
        w.contentViewController = NSHostingController(rootView: NewSiteView { w.close(); window = nil })
        w.center()
        window = w
        w.makeKeyAndOrderFront(nil)
    }
}
