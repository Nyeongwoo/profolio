import SwiftUI
import UniformTypeIdentifiers

// MARK: - Sidebar

/// The sidebar's Lab section: the pieces, and publishing their files.
struct LabSidebarSection: View {
    @ObservedObject var model: EditorModel
    @ObservedObject var lab: LabModel

    var body: some View {
        Section {
            ForEach(lab.pieces, id: \.self) { slug in
                HStack {
                    Label(slug, systemImage: "flask")
                    Spacer()
                    if lab.approvals.contains(where: { $0.slug == slug }) {
                        Image(systemName: "hand.raised.fill").foregroundStyle(.orange).font(.caption).help("Claude is waiting for your answer")
                    } else if lab.working.contains(slug) {
                        ProgressView().controlSize(.mini)
                    } else if lab.unpublished.contains(where: { $0.hasPrefix("public/lab/\(slug)/") }) {
                        Circle().fill(Color.accentColor).frame(width: 6, height: 6).help("Unpublished changes")
                    }
                }
                .tag("lab:\(slug)")
            }
            LabPublishRow(model: model, lab: lab)
        } header: {
            HStack {
                Text("Lab")
                Spacer()
                Button { if let slug = lab.newPiece() { model.open("lab:\(slug)") } } label: { Image(systemName: "plus") }
                    .buttonStyle(.borderless)
                    // In line with the rows' counts, not against the edge.
                    .padding(.trailing, 10)
                    .help("New lab piece")
            }
        }
        .onAppear { lab.refresh() }
    }
}

/// Publish for the Lab's files (the same action the agent can take).
private struct LabPublishRow: View {
    @ObservedObject var model: EditorModel
    @ObservedObject var lab: LabModel

    var body: some View {
        let count = lab.unpublished.count
        VStack(alignment: .leading, spacing: 6) {
            Text(count == 0 ? "Lab is published." : "\(count) unpublished Lab file\(count == 1 ? "" : "s")")
                .font(.caption).foregroundStyle(.secondary)
            HStack(spacing: 6) {
                Button("Publish Lab") { publish() }
                    .disabled(count == 0 || lab.publishing)
                    .help("Publish only the Lab’s files to the site")
                if lab.publishing { ProgressView().controlSize(.small) }
            }
            .controlSize(.small)
            if let status = lab.publishStatus {
                Text(status).font(.caption2).foregroundStyle(.secondary).lineLimit(3).textSelection(.enabled)
            }
        }
        .padding(.vertical, 4)
        .selectionDisabled()
    }

    private func publish() {
        let alert = NSAlert()
        alert.messageText = "Publish the Lab’s changes?"
        alert.informativeText = lab.unpublished.prefix(12).joined(separator: "\n")
            + "\n\nOnly these go out; the rest of the site’s changes stay for Publish."
        alert.addButton(withTitle: "Publish")
        alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        Task { await lab.publish() }
    }
}

// MARK: - Preview

/// The selected lab piece, live from the code folder.
struct LabPreviewArea: View {
    @ObservedObject var model: EditorModel
    @ObservedObject var lab: LabModel
    @State private var capturing = false

    var body: some View {
        Group {
            if lab.colorMode {
                SVGColorEditorView(editor: lab.colors)
            } else {
                preview
            }
        }
        .overlay(alignment: .bottom) { controls }
    }

    private var preview: some View {
        GeometryReader { geo in
            let size = model.device.size
            let scale = min(1, (geo.size.width - 40) / size.width)
            VStack(spacing: 0) {
                WebViewHost(webView: lab.preview.webView, pageZoom: scale)
                    .frame(width: size.width * scale)
                    .frame(maxHeight: model.device == .desktop ? .infinity : min(geo.size.height - 20, size.height * scale))
                    .clipShape(UnevenRoundedRectangle(topLeadingRadius: Corner.group, topTrailingRadius: Corner.group, style: .continuous))
                    .shadow(color: .black.opacity(0.08), radius: 8, y: 2)
                if model.device != .desktop { Spacer(minLength: 0) }
            }
            .padding(.top, 20)
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .background(Color(nsColor: .underPageBackgroundColor))
    }

    private var controls: some View {
        HStack(spacing: 10) {
            Button { lab.togglePicking() } label: {
                Label("Pick", systemImage: "cursorarrow.rays")
            }
            .buttonStyle(.bordered)
            .tint(lab.picking ? .orange : nil)
            .disabled(lab.colorMode)
            .help("Click an element in the preview to point Claude at it")
            Toggle("Tune", isOn: $lab.tuning)
                .toggleStyle(.button)
                .help("Show the piece’s tuning panel (?tune)")
                .disabled(lab.colorMode)
            Button { lab.preview.reload() } label: { Image(systemName: "arrow.clockwise") }
                .help("Reload the preview")
                .disabled(lab.colorMode)
            Button { captureFullPage() } label: {
                Label("Capture", systemImage: "camera.viewfinder")
            }
            .help("Save the whole page, top to bottom, as a PNG image")
            .disabled(lab.colorMode || lab.slug == nil || capturing)
            Button { lab.exportPrompts() } label: {
                Label("Prompts", systemImage: "tablecells")
            }
            .help("Export every prompt sent to Claude in the Lab as an Excel file")
            Toggle(isOn: $lab.colorMode) { Label("Colors", systemImage: "paintpalette") }
                .toggleStyle(.button)
                .help("Recolor the piece’s SVG files: pick shapes, set solid colors or gradients")
            Text("public/lab/\(lab.slug ?? "")").font(.caption).foregroundStyle(.secondary)
        }
        .controlSize(.small)
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(Capsule().fill(.regularMaterial))
        .padding(.bottom, 12)
    }

    /// Captures the preview as it is now, then asks where to save it.
    private func captureFullPage() {
        capturing = true
        Task { @MainActor in
            defer { capturing = false }
            do {
                let result = try await PageCapture.fullPage(of: lab.preview.webView)
                guard let png = PageCapture.png(result.image) else {
                    throw PageCapture.Failure(errorDescription: "The image couldn’t be made.")
                }
                let panel = NSSavePanel()
                panel.title = "Save Full-Page Capture"
                panel.nameFieldStringValue = "\(lab.slug ?? "Lab") \(model.device.rawValue) \(Self.stamp.string(from: Date())).png"
                panel.allowedContentTypes = [.png]
                panel.directoryURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
                guard panel.runModal() == .OK, let url = panel.url else { return }
                try png.write(to: url, options: .atomic)
                NSWorkspace.shared.activateFileViewerSelecting([url])
                if result.truncated {
                    let alert = NSAlert()
                    alert.messageText = "The page was too long to capture whole."
                    alert.informativeText = "The image stops \(Int(PageCapture.maxHeight)) pixels down the page."
                    alert.runModal()
                }
            } catch {
                let alert = NSAlert()
                alert.messageText = "The page couldn’t be captured."
                alert.informativeText = error.localizedDescription
                alert.runModal()
            }
        }
    }

    private static let stamp: DateFormatter = { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH.mm.ss"; return f }()
}

// MARK: - Chat

/// The selected Lab piece's chat.
struct LabChat: View {
    @ObservedObject var lab: LabModel

    var body: some View {
        ChatPanel(lab: lab, scope: lab.slug ?? "", title: "Claude",
                  subtitle: "Changes public/lab/\(lab.slug ?? "") — the preview follows",
                  hint: "Ask for a change — “make the shapes move slower”, “add a title above the grid” — or ask it to publish.",
                  placeholder: "Ask Claude to change this piece…", showsPick: true)
            .id(lab.slug ?? "")
    }
}

/// The site Assistant (the toolbar's Assistant, ⌘J): questions about
/// Profolio and the site. Each page has its own conversation, so a talk
/// about one page doesn't follow you to the next.
struct AssistantChat: View {
    @ObservedObject var lab: LabModel
    /// The page open (nil: none), whose conversation this shows.
    let pageID: String?
    let pageTitle: String?

    var body: some View {
        ChatPanel(lab: lab, scope: LabModel.siteScope(for: pageID), title: "Assistant",
                  subtitle: pageTitle.map { "On “\($0)” — ask about Profolio or your site" } ?? "Ask about Profolio or your site, in any language",
                  hint: "“How do I connect GitHub?”, “I want a new project page but have no ideas”, “What’s still unpublished?”",
                  placeholder: "Ask anything…", showsPick: false)
            // A fresh panel per page: no draft or scroll carried over.
            .id(LabModel.siteScope(for: pageID))
    }
}

/// A conversation with an agent: the Lab's per piece, or the Assistant's.
struct ChatPanel: View {
    @ObservedObject var lab: LabModel
    let scope: String
    let title: String
    let subtitle: String
    let hint: String
    let placeholder: String
    let showsPick: Bool
    @State private var draft = ""
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                    .foregroundStyle(Color.accentColor)
                    .frame(width: 30, height: 30)
                    .background(Corner.icon(30).fill(Color.accentColor.opacity(0.12)))
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.headline)
                    Text(lab.isWorking(in: scope) ? "Working…" : subtitle)
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Menu {
                    Button("Clear Conversation", role: .destructive) { lab.clear(scope) }
                } label: { Image(systemName: "ellipsis.circle") }
                    .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize()
                    .help("Clear this conversation")
            }
            .padding(12)
            Divider()
            if lab.needsSignIn {
                HStack(spacing: 8) {
                    Text("Sign in to Claude Code once in Terminal, then send your message again.")
                        .font(.callout)
                    Spacer()
                    Button("Sign In in Terminal") { lab.signIn() }
                }
                .padding(10)
                .background(Color.orange.opacity(0.12))
            }
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 10) {
                        if lab.messages(in: scope).isEmpty {
                            Text(hint)
                                .font(.callout).foregroundStyle(.secondary)
                                .padding(.top, 8)
                        }
                        ForEach(lab.messages(in: scope)) { m in
                            LabMessageRow(message: m).id(m.id)
                        }
                        if lab.isWorking(in: scope) {
                            HStack(spacing: 6) { ProgressView().controlSize(.small); Text("Working…").font(.caption).foregroundStyle(.secondary) }
                                .id("working")
                        }
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .onChange(of: lab.messages(in: scope).count) {
                    withAnimation {
                        if lab.isWorking(in: scope) { proxy.scrollTo("working", anchor: .bottom) }
                        else if let last = lab.messages(in: scope).last?.id { proxy.scrollTo(last, anchor: .bottom) }
                    }
                }
            }
            if showsPick, let pick = lab.pickedHere {
                HStack(alignment: .top, spacing: 6) {
                    Image(systemName: "cursorarrow.rays").foregroundStyle(.orange)
                    Text(pick).font(.caption).lineLimit(3).textSelection(.enabled)
                    Spacer()
                    Button { lab.clearPick() } label: { Image(systemName: "xmark.circle.fill") }
                        .buttonStyle(.borderless).foregroundStyle(.secondary)
                        .help("Don’t send this with the next message")
                }
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(Color.orange.opacity(0.08))
            }
            if let approval = lab.pendingApproval(in: scope) {
                ApprovalCard(approval: approval, lab: lab)
            }
            Divider()
            HStack(alignment: .bottom, spacing: 8) {
                TextField(placeholder, text: $draft, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(1...8)
                    .focused($focused)
                    .onSubmit(send)
                    .padding(8)
                    .background(Corner.shape(Corner.control).fill(Color(nsColor: .textBackgroundColor)))
                    .overlay(Corner.shape(Corner.control).stroke(Color.secondary.opacity(0.25)))
                if lab.isWorking(in: scope) {
                    Button { lab.stop(in: scope) } label: { Image(systemName: "stop.fill") }
                        .help("Stop")
                } else {
                    Button(action: send) { Image(systemName: "arrow.up") }
                        .keyboardShortcut(.return, modifiers: .command)
                        .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .help("Send (⌘↩)")
                }
            }
            .padding(12)
        }
    }

    private func send() {
        let text = draft
        draft = ""
        lab.send(text, in: scope)
    }
}

/// Claude asks before doing something outside the Lab's defaults.
private struct ApprovalCard: View {
    let approval: LabModel.Approval
    @ObservedObject var lab: LabModel

    var body: some View {
        if approval.isProposal { proposal } else { permission }
    }

    /// A change the Assistant suggests: what, before → after, Apply.
    private var proposal: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Claude suggests", systemImage: "pencil.line").font(.headline)
            Text(approval.summary).font(.callout.weight(.medium)).textSelection(.enabled)
            if !approval.details.isEmpty {
                ScrollView {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(Array(approval.details.enumerated()), id: \.offset) { _, line in
                            Text(line).font(.system(.caption, design: .monospaced)).textSelection(.enabled)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    .padding(8)
                }
                .frame(maxHeight: 180)
                .background(Corner.shape(Corner.control).fill(Color(nsColor: .textBackgroundColor)))
            }
            HStack {
                Button("Decline") { lab.answer(approval, .deny) }
                Spacer()
                Button("Apply") { lab.answer(approval, .once) }
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
            }
            .controlSize(.small)
        }
        .padding(12)
        .background(Color.accentColor.opacity(0.08))
    }

    private var permission: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Claude wants to", systemImage: "hand.raised").font(.headline)
            Text(approval.summary)
                .font(.system(.callout, design: .monospaced))
                .textSelection(.enabled)
                .lineLimit(6)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(8)
                .background(Corner.shape(Corner.control).fill(Color(nsColor: .textBackgroundColor)))
            HStack {
                Button("Deny") { lab.answer(approval, .deny) }
                Spacer()
                Button("Allow in This Chat") { lab.answer(approval, .inThisChat) }
                    .help("Allow this and anything like it until Profolio quits")
                Button("Allow") { lab.answer(approval, .once) }
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
            }
            .controlSize(.small)
        }
        .padding(12)
        .background(Color.accentColor.opacity(0.08))
    }
}

private struct LabMessageRow: View {
    let message: LabModel.Message

    var body: some View {
        switch message.role {
        case .person:
            Text(message.text)
                .textSelection(.enabled)
                .padding(.horizontal, 10).padding(.vertical, 7)
                .background(Corner.shape(Corner.tile).fill(Color.accentColor.opacity(0.14)))
                .frame(maxWidth: .infinity, alignment: .trailing)
        case .agent:
            Text(LocalizedStringKey(message.text))
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
        case .tool:
            Label(message.text, systemImage: "wrench.and.screwdriver")
                .font(.caption).foregroundStyle(.secondary).lineLimit(1)
        case .note:
            Text(message.text).font(.caption).foregroundStyle(.secondary)
        case .problem:
            Label(message.text, systemImage: "exclamationmark.triangle")
                .font(.callout).foregroundStyle(.orange)
                .textSelection(.enabled)
        }
    }
}
