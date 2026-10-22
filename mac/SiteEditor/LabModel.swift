import AppKit

/// The Lab: interactive pieces — site code, public/lab/<slug>/, kept in the
/// .portfolio package like the rest of the site — previewed live, changed
/// by chatting with a coding agent, and published with Profolio's Publish
/// (or by asking the agent, through Profolio's MCP tools).
@MainActor
final class LabModel: ObservableObject {
    struct Message: Identifiable, Codable {
        enum Role: String, Codable { case person, agent, tool, note, problem }
        var id = UUID()
        let role: Role
        var text: String
    }

    /// The site Assistant's conversations (⌘J): one per page ("_site-<page>",
    /// or "_site" with no page open), beside one per Lab piece. Piece names
    /// can't start with "_", so they never clash.
    static let siteScope = "_site"

    /// The Assistant's conversation for a page. Only letters, digits, "-"
    /// and "_" are kept: the scope names a transcript file and a URL path.
    static func siteScope(for pageID: String?) -> String {
        guard let pageID, !pageID.isEmpty else { return siteScope }
        let safe = String(pageID.unicodeScalars.map { $0.isASCII && (CharacterSet.alphanumerics.contains($0) || $0 == "-" || $0 == "_") ? Character($0) : "-" })
        return "\(siteScope)-\(safe)"
    }

    /// Whether a conversation is the Assistant's (not a Lab piece's).
    static func isSite(_ scope: String) -> Bool { scope == siteScope || scope.hasPrefix(siteScope + "-") }

    let preview = LabPreview()
    unowned let document: SiteDocument
    /// The editor this Lab belongs to: its unpublished-changes count, and
    /// the Publish sheet.
    weak var editor: EditorModel?
    let server = LabMCPServer()
    /// Every prompt sent to a Lab piece, for the Prompts export.
    private(set) lazy var promptLog = LabPromptLog(folder: transcriptFolder)

    @Published private(set) var pieces: [String] = []
    @Published private(set) var slug: String?
    @Published private(set) var transcripts: [String: [Message]] = [:]
    /// Pieces whose agent is working on a turn.
    @Published private(set) var working: Set<String> = []
    /// How the last publish from the Lab went.
    @Published private(set) var publishStatus: String?
    @Published private(set) var publishing = false
    /// Something the agent asked to do beyond what it may do by itself
    /// (anything outside public/lab), waiting for the person to answer.
    struct Approval: Identifiable {
        enum Answer { case once, inThisChat, deny }
        let id = UUID()
        let slug: String
        let summary: String
        /// What "Allow in this chat" remembers: the tool, and for commands
        /// the command's name, for files the folder.
        let key: String
        /// A change the Assistant proposes (Apply / Decline), with its
        /// lines before → after, rather than a tool to allow.
        var details: [String] = []
        var isProposal = false
        let answer: (Answer) -> Void
    }
    @Published private(set) var approvals: [Approval] = []
    /// What was picked in the preview, per piece; sent along with the next
    /// message so "this" means something.
    @Published private(set) var picked: [String: String] = [:]
    @Published private(set) var picking = false

    var pickedHere: String? { slug.flatMap { picked[$0] } }

    func togglePicking() {
        picking.toggle()
        preview.picking = picking
    }

    func clearPick() {
        if let slug { picked[slug] = nil }
    }
    private var allowedInChat: [String: Set<String>] = [:]

    var pendingApproval: Approval? { approvals.first { $0.slug == slug } }

    func answer(_ approval: Approval, _ answer: Approval.Answer) {
        approvals.removeAll { $0.id == approval.id }
        if answer == .inThisChat { allowedInChat[approval.slug, default: []].insert(approval.key) }
        if approval.isProposal {
            append(.init(role: .note, text: "\(answer == .deny ? "Declined" : "Applied"): \(approval.summary)"), to: approval.slug)
        } else {
            self.answer(approval.summary, answer, for: approval.slug)
        }
        approval.answer(answer)
    }

    private func answer(_ summary: String, _ answer: Approval.Answer, for slug: String) {
        let verb = answer == .deny ? "Declined" : answer == .inThisChat ? "Allowed in this chat" : "Allowed"
        append(.init(role: .note, text: "\(verb): \(summary)"), to: slug)
    }

    /// Claude Code's own sign-in (the one Terminal uses) has expired.
    @Published private(set) var needsSignIn = false
    @Published var tuning = false {
        didSet { if tuning != oldValue { preview.show(slug, tuning: tuning) } }
    }
    /// Colors mode: the preview's place shows the piece's SVG files in the
    /// colour editor instead.
    let colors = SVGPaintEditor()
    @Published var colorMode = false {
        didSet {
            guard colorMode != oldValue else { return }
            if !colorMode, !colors.confirmLeaving() { colorMode = true; return }
            if colorMode { colors.show(folder: pieceFolder) }
        }
    }
    private var pieceFolder: URL? { slug.flatMap { labFolder?.appendingPathComponent($0) } }

    private var agents: [String: any LabAgent] = [:]

    init(document: SiteDocument) {
        self.document = document
        preview.setRoot(publicFolder)
        preview.onReload = { [weak self] in
            self?.editor?.refreshChanges()
            self?.refresh()
        }
        preview.onPick = { [weak self] description in
            guard let self, let slug = self.slug else { return }
            self.picking = false
            self.picked[slug] = description
        }
        colors.onSaved = { [weak self] in
            self?.editor?.refreshChanges()
            self?.refresh()
        }
        registerTools()
        registerSiteTools()
        registerEditTools()
        loadTranscripts()
        promptLog.seed(from: transcripts, skipping: Self.isSite)
        refresh()
    }

    var messages: [Message] { slug.flatMap { transcripts[$0] } ?? [] }
    var isWorking: Bool { slug.map(working.contains) ?? false }

    func messages(in scope: String) -> [Message] { transcripts[scope] ?? [] }
    func isWorking(in scope: String) -> Bool { working.contains(scope) }
    func pendingApproval(in scope: String) -> Approval? { approvals.first { $0.slug == scope } }

    /// The package's copy of the site (paths as in the repository).
    var siteFolder: URL? { document.packageURL?.appendingPathComponent("site") }
    private var publicFolder: URL? { siteFolder?.appendingPathComponent("public") }
    private var labFolder: URL? { publicFolder?.appendingPathComponent("lab") }

    /// Unpublished files under public/lab (new, changed or deleted).
    var unpublished: [String] {
        let c = editor?.changes
        return ((c?.upload ?? []) + (c?.delete ?? [])).filter { $0.hasPrefix("public/lab/") }
    }

    func refresh() {
        guard let lab = labFolder else { pieces = []; return }
        let fm = FileManager.default
        pieces = ((try? fm.contentsOfDirectory(atPath: lab.path)) ?? []).filter {
            !$0.hasPrefix(".") && fm.fileExists(atPath: lab.appendingPathComponent("\($0)/index.html").path)
        }.sorted()
    }

    func select(_ slug: String) {
        if colorMode, slug != self.slug, !colors.confirmLeaving() { return }
        self.slug = slug
        preview.show(slug, tuning: tuning)
        if colorMode { colors.show(folder: pieceFolder) }
    }

    /// Lab ▸ New Piece…: asks for a folder name and makes a starter page.
    func newPiece() -> String? {
        let alert = NSAlert()
        alert.messageText = "New lab piece"
        alert.informativeText = "A folder name, used in its address (lowercase letters, numbers and dashes)."
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
        field.placeholderString = "my-piece"
        alert.accessoryView = field
        alert.addButton(withTitle: "Create")
        alert.addButton(withTitle: "Cancel")
        alert.window.initialFirstResponder = field
        guard alert.runModal() == .alertFirstButtonReturn else { return nil }
        let name = field.stringValue.trimmingCharacters(in: .whitespaces).lowercased()
        guard name.range(of: #"^[a-z0-9][a-z0-9-]*$"#, options: .regularExpression) != nil, !pieces.contains(name) else {
            NSSound.beep()
            return nil
        }
        do { try createPiece(name) } catch {
            NSAlert(error: error).runModal()
            return nil
        }
        refresh()
        return name
    }

    /// Makes public/lab/<slug>/ with a starter page wired to lab-frame.js.
    private func createPiece(_ slug: String) throws {
        guard let lab = labFolder else { return }
        let dir = lab.appendingPathComponent(slug)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let html = """
        <!doctype html>
        <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>\(slug)</title>
          <style>
            html, body { margin: 0; background: #fff; font-family: system-ui, sans-serif; }
            main { padding: 80px 6%; min-height: 600px; }
          </style>
        </head>
        <body>
          <main>
            <h1>\(slug)</h1>
            <p>A new lab piece. Ask Claude what it should become.</p>
          </main>
          <script src="../lab-frame.js"></script>
        </body>
        </html>

        """
        try html.write(to: dir.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
        editor?.refreshChanges()
    }

    // MARK: - Chat

    /// Sends to a conversation: the Lab piece open (default) or one of the
    /// site Assistant's (`siteScope(for:)`).
    func send(_ text: String, in scope: String? = nil) {
        guard let slug = scope ?? self.slug, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        append(.init(role: .person, text: text), to: slug)
        var outgoing = text
        if Self.isSite(slug) {
            // Where the person is, so "this page" means something.
            if let context = siteContext() { outgoing = "[Profolio context: \(context)]\n\n\(text)" }
        } else {
            promptLog.began(text, picked: picked[slug], in: slug)
            if let pick = picked[slug] {
                // The picked element goes along with the message, then is used up.
                outgoing = "[Picked in the preview: \(pick)]\n\n\(text)"
                picked[slug] = nil
            }
        }
        Task {
            guard let agent = await agent(for: slug) else { return }
            working.insert(slug)
            agent.send(outgoing)
        }
    }

    func stop(in scope: String? = nil) {
        guard let slug = scope ?? self.slug else { return }
        promptLog.ended("Stopped", in: slug)
        approvals.filter { $0.slug == slug }.forEach { answer($0, .deny) }
        agents[slug]?.stop()
    }

    private func agent(for slug: String) async -> (any LabAgent)? {
        if let agent = agents[slug] { return agent }
        guard let folder = siteFolder else { return nil }
        guard let claude = ClaudeCodeAgent.locate() else {
            append(.init(role: .problem, text: "Claude Code isn’t installed on this Mac. Install it (claude.com/claude-code), sign in once in Terminal with `claude`, then try again."), to: slug)
            return nil
        }
        do { try await startServer() } catch {
            append(.init(role: .problem, text: "Profolio’s tools couldn’t start: \(error.localizedDescription)"), to: slug)
            return nil
        }
        let site = Self.isSite(slug)
        let agent = ClaudeCodeAgent(executable: claude, folder: folder, sessionID: UserDefaults.standard.string(forKey: sessionKey(slug)),
                                    mcpConfig: server.config(for: slug),
                                    systemPrompt: site ? Self.siteInstructions(document.manifest?.repository) : Self.instructions(slug),
                                    allowedTools: site ? ClaudeCodeAgent.assistantTools : ClaudeCodeAgent.labTools,
                                    disallowedTools: site ? ClaudeCodeAgent.writeTools : [])
        agent.onEvent = { [weak self] event in self?.handle(event, for: slug) }
        agents[slug] = agent
        return agent
    }

    /// A turn ended (or the agent quit) with questions unanswered: they can
    /// no longer be acted on, so take their cards down.
    private func dropApprovals(for slug: String) {
        let stale = approvals.filter { $0.slug == slug }
        approvals.removeAll { $0.slug == slug }
        stale.forEach { $0.answer(.deny) }
    }

    /// The editor window is closing: stop the agents and the tools.
    func shutDown() {
        promptLog.save()
        agents.values.forEach { $0.stop() }
        agents = [:]
        approvals.forEach { $0.answer(.deny) }
        approvals = []
        server.stop()
        serverStart = nil
    }

    private var serverStart: Task<Void, Error>?

    /// Starts Profolio's MCP server once, however many first messages race.
    private func startServer() async throws {
        if serverStart == nil { serverStart = Task { try await server.start() } }
        do { try await serverStart!.value } catch {
            serverStart = nil
            throw error
        }
    }

    private func handle(_ event: LabAgentEvent, for slug: String) {
        switch event {
        case .session(let id):
            UserDefaults.standard.set(id, forKey: sessionKey(slug))
        case .text(let text):
            append(.init(role: .agent, text: text), to: slug)
            promptLog.replied(text, in: slug)
        case .tool(let summary):
            append(.init(role: .tool, text: summary), to: slug)
            promptLog.acted(summary, in: slug)
        case .done(let isError, let summary):
            promptLog.ended(isError ? "Error: \(summary ?? "")" : "Done", in: slug)
            working.remove(slug)
            dropApprovals(for: slug)
            if let summary { report(summary, isError: isError, for: slug) }
            editor?.refreshChanges()
            refresh()   // it may have made a new piece
        case .failure(let text):
            promptLog.ended("Failed: \(text)", in: slug)
            working.remove(slug)
            dropApprovals(for: slug)
            report(text, isError: true, for: slug)
        }
    }

    private func report(_ text: String, isError: Bool, for slug: String) {
        // The saved conversation can't be resumed (cleared, or made in
        // another folder): start a fresh one next time.
        if isError, text.localizedCaseInsensitiveContains("No conversation found") {
            UserDefaults.standard.removeObject(forKey: sessionKey(slug))
            agents[slug] = nil
            append(.init(role: .problem, text: "The earlier conversation couldn’t be resumed, so the next message starts a new one. Send it again."), to: slug)
            return
        }
        // Claude Code says an error twice: as its reply, then as the turn's
        // result. Keep one, shown as the problem it is.
        if isError, let last = transcripts[slug]?.last, last.role == .agent,
           last.text.trimmingCharacters(in: .whitespacesAndNewlines) == text.trimmingCharacters(in: .whitespacesAndNewlines) {
            transcripts[slug]?.removeLast()
        }
        if isError, text.localizedCaseInsensitiveContains("authenticat") || text.localizedCaseInsensitiveContains("/login") {
            needsSignIn = true
            append(.init(role: .problem, text: "Claude Code needs you to sign in again — its sign-in for Terminal has expired."), to: slug)
        } else {
            append(.init(role: isError ? .problem : .note, text: text), to: slug)
        }
    }

    /// Opens Terminal on Claude Code's sign-in (a .command file Terminal
    /// runs — no Apple Events needed); the next message retries.
    func signIn() {
        guard let claude = ClaudeCodeAgent.locate() else { return }
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("Claude Code Sign In.command")
        let quoted = "'" + claude.path.replacingOccurrences(of: "'", with: "'\\''") + "'"
        try? "#!/bin/zsh -l\n\(quoted) /login\n".write(to: file, atomically: true, encoding: .utf8)
        try? FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: file.path)
        NSWorkspace.shared.open(file)
        needsSignIn = false
        agents.values.forEach { $0.stop() }
        agents = [:]
    }

    private func append(_ message: Message, to slug: String) {
        transcripts[slug, default: []].append(message)
        scheduleSave(slug)
    }

    /// Saves every Lab prompt so far as an Excel workbook (the Prompts
    /// button).
    func exportPrompts() {
        promptLog.export(site: document.packageURL?.deletingPathExtension().lastPathComponent ?? "Site")
    }

    // MARK: - Transcripts, kept in the package (assistant/<scope>.json; the
    // package's assistant/ folder is never published)

    private var transcriptFolder: URL? { document.packageURL?.appendingPathComponent("assistant") }
    private var pendingSaves: [String: DispatchWorkItem] = [:]

    private func loadTranscripts() {
        guard let folder = transcriptFolder,
              let files = try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil) else { return }
        for file in files where file.pathExtension == "json" {
            if let data = try? Data(contentsOf: file), let messages = try? JSONDecoder().decode([Message].self, from: data) {
                transcripts[file.deletingPathExtension().lastPathComponent] = messages
            }
        }
    }

    private func scheduleSave(_ scope: String) {
        pendingSaves[scope]?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.save(scope) }
        pendingSaves[scope] = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 1, execute: work)
    }

    private func save(_ scope: String) {
        guard let folder = transcriptFolder, let messages = transcripts[scope] else { return }
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        // The latest 400 are plenty to pick a conversation up again.
        if let data = try? JSONEncoder().encode(Array(messages.suffix(400))) {
            try? data.write(to: folder.appendingPathComponent("\(scope).json"), options: .atomic)
        }
    }

    /// Clears a conversation: its messages, and the agent's memory of it.
    func clear(_ scope: String) {
        stop(in: scope)
        agents[scope] = nil
        transcripts[scope] = nil
        UserDefaults.standard.removeObject(forKey: sessionKey(scope))
        if let file = transcriptFolder?.appendingPathComponent("\(scope).json") { try? FileManager.default.removeItem(at: file) }
    }

    private func sessionKey(_ slug: String) -> String { "labSession:\(document.packageURL?.path ?? ""):\(slug)" }

    /// What the agent is told about working in the Lab.
    private static func instructions(_ slug: String) -> String {
        """
        You are working in Profolio’s Lab on the interactive piece public/lab/\(slug)/ of the site nnwoo.com. \
        The working folder is the site’s copy inside the person’s .portfolio package (paths as in the repository; \
        there is no git here — Profolio publishes it). The person sees the piece live in Profolio’s preview, which \
        reloads whenever its files change. \
        Rules: change files only under public/lab/ (anything else asks the person first); pieces are plain HTML, CSS and JavaScript \
        with no build step, embedded in site pages through ../lab-frame.js; keep effect values in the piece’s effects.json \
        when it has one (its ?tune panel edits them); animate only transform and opacity — Safari repaints SVG whole \
        otherwise; write code and UI text in English; reply in the person’s language. \
        Profolio’s tools (MCP server “profolio”): lab_screenshot to see the preview after a change, lab_scroll to move it, lab_selection for what the person picked (messages may start with “[Picked in the preview: …]”), \
        lab_console for errors, lab_reload, lab_status for what isn’t published yet, and lab_publish. \
        Publish only when the person asks.
        """
    }

    // MARK: - Publishing

    /// Publishes the Lab's unpublished files with Profolio's Publish (only
    /// those, the rest of the site's changes stay); returns how it went.
    @discardableResult
    func publish(note: String? = nil) async -> String {
        let paths = Set(unpublished)
        guard !paths.isEmpty else { return "Nothing in public/lab to publish." }
        return await publish(paths, note: note ?? "Lab: update \(slug ?? "pieces")")
    }

    /// Publishes `paths` (nil: every unpublished change) as one commit.
    func publish(_ paths: Set<String>?, note: String) async -> String {
        publishing = true
        publishStatus = paths.map { "Publishing \($0.count) file\($0.count == 1 ? "" : "s")…" } ?? "Publishing…"
        defer { publishing = false }
        guard document.manifest != nil, document.packageURL != nil else { return "This project can’t be published." }
        var lines: [String] = []
        var conflicted = false
        // Events arrive off the main thread; handle them on it, and finish
        // on the first "done" (publish() always sends one).
        let ok: Bool = await withCheckedContinuation { cont in
            var finished = false
            document.publish(only: paths, note: note) { event in
                DispatchQueue.main.async {
                    if let log = event.log { lines.append(log) }
                    if event.packageChanged { self.editor?.packageChangedByPublish() }
                    if event.done, !finished {
                        finished = true
                        conflicted = !event.conflicts.isEmpty
                        cont.resume(returning: event.ok)
                    }
                }
            }
        }
        editor?.refreshChanges()
        publishStatus = ok ? "Published — the site updates in a minute or two."
            : conflicted ? "Not published: the same files changed on GitHub too — open Publish (⇧⌘P) to choose which to keep."
            : "Not published: \(lines.last ?? "see Publish for details")"
        return publishStatus ?? ""
    }

    /// Shows a change the Assistant proposes in its chat and waits for
    /// Apply (true) or Decline.
    func propose(_ summary: String, details: [String], in scope: String) async -> Bool {
        let answer: Approval.Answer = await withCheckedContinuation { cont in
            approvals.append(Approval(slug: scope, summary: summary, key: "", details: details, isProposal: true) { cont.resume(returning: $0) })
        }
        return answer != .deny
    }

    // MARK: - Tools for the agent

    private func registerTools() {
        // Claude Code's --permission-prompt-tool: asked whenever the agent
        // wants something it isn't allowed by default. Waits for the
        // person's answer in the chat; replies as Claude Code expects.
        server.register(.init(name: "approve",
                              description: "Asks the person in Profolio whether a tool use outside the Lab's defaults may go ahead.",
                              properties: ["tool_name": ["type": "string"], "input": ["type": "object"], "tool_use_id": ["type": "string"]],
                              required: ["tool_name", "input"]) { [weak self] args, caller in
            let input = args["input"] as? [String: Any] ?? [:]
            let allow = { () -> LabMCPServer.Result in
                let json: [String: Any] = ["behavior": "allow", "updatedInput": input]
                return .text(String(decoding: (try? JSONSerialization.data(withJSONObject: json)) ?? Data(), as: UTF8.self))
            }
            let deny = LabMCPServer.Result.text(#"{"behavior":"deny","message":"The person declined this in Profolio."}"#)
            guard let self else { return deny }
            // The site Assistant never writes files itself, even if asked to
            // allow it: say so without a card, and point it at the proposals.
            if Self.isSite(caller), !Self.siteMayAsk.contains(args["tool_name"] as? String ?? "") {
                return .text(#"{"behavior":"deny","message":"The Assistant can't write files or run commands. Change the site only with content_edit, section_add or item_create (each a proposal the person applies); don't create files or touch editor/."}"#)
            }
            let (summary, key) = Self.describe(args["tool_name"] as? String ?? "tool", input)
            if self.allowedInChat[caller]?.contains(key) == true { return allow() }
            let answer: Approval.Answer = await withCheckedContinuation { cont in
                self.approvals.append(Approval(slug: caller, summary: summary, key: key) { cont.resume(returning: $0) })
            }
            return answer == .deny ? deny : allow()
        })
        server.register(.init(name: "lab_screenshot",
                              description: "A screenshot of the lab piece as Profolio’s preview shows it right now (the visible part).") { [weak self] _, _ in
            guard let self, let image = await self.preview.snapshot(), let png = Self.png(image) else { return .error("No preview to capture.") }
            return .image(png, caption: "Preview of \(self.preview.slug ?? "?")\(self.preview.tuning ? " with the tuning panel" : "")")
        })
        server.register(.init(name: "lab_scroll",
                              description: "Scrolls the preview: to a CSS selector, or to a y position in CSS pixels.",
                              properties: ["selector": ["type": "string"], "y": ["type": "number"]]) { [weak self] args, _ in
            guard let self else { return .error("No preview.") }
            let js: String
            if let sel = args["selector"] as? String,
               let q = String(data: (try? JSONSerialization.data(withJSONObject: [sel])) ?? Data(), encoding: .utf8) {
                js = "(() => { const el = document.querySelector(\(q)[0]); if (!el) return false; el.scrollIntoView({ block: 'start' }); return true })()"
            } else {
                js = "(() => { window.scrollTo(0, \((args["y"] as? Double) ?? 0)); return true })()"
            }
            let found = try? await self.preview.webView.evaluateJavaScript(js) as? Bool
            return found == false ? .error("Nothing matches that selector.") : .text("Scrolled.")
        })
        server.register(.init(name: "lab_selection",
                              description: "The element the person picked in the preview (if any): tag, id, classes, text, position and a CSS path.") { [weak self] _, caller in
            guard let pick = self?.picked[caller] else { return .text("Nothing is picked.") }
            return .text(pick)
        })
        server.register(.init(name: "lab_console",
                              description: "Recent console output and errors from the preview, oldest first.") { [weak self] _, _ in
            let lines = self?.preview.console ?? []
            return .text(lines.isEmpty ? "No console output." : lines.suffix(80).joined(separator: "\n"))
        })
        server.register(.init(name: "lab_reload", description: "Reloads the preview, keeping its scroll position.") { [weak self] _, _ in
            self?.preview.reload()
            try? await Task.sleep(for: .milliseconds(800))
            return .text("Reloaded.")
        })
        server.register(.init(name: "lab_status",
                              description: "Files under public/lab not yet published to the site.") { [weak self] _, _ in
            guard let self, let package = self.document.packageURL, let manifest = self.document.manifest else { return .error("Unavailable.") }
            let changes = await Task.detached { try? Publisher.localChanges(package: package, manifest: manifest) }.value
            self.editor?.refreshChanges()
            let files = ((changes?.upload ?? []) + (changes?.delete ?? [])).filter { $0.hasPrefix("public/lab/") }
            return .text(files.isEmpty ? "Everything in public/lab is published." : "Not published yet:\n" + files.joined(separator: "\n"))
        })
        server.register(.init(name: "lab_publish",
                              description: "Publishes the unpublished files under public/lab to the site (GitHub, then Vercel deploys). Only when the person asks.",
                              properties: ["note": ["type": "string"]]) { [weak self] args, _ in
            guard let self else { return .error("Unavailable.") }
            return .text(await self.publish(note: args["note"] as? String))
        })
    }

    /// All the site Assistant may ask the person for; anything else it
    /// wants outside its defaults is declined without a card.
    static let siteMayAsk: Set<String> = ["AskUserQuestion", "WebFetch", "WebSearch"]

    /// "Bash {command: "git log"}" → ("Run: git log", "Bash:git").
    private static func describe(_ tool: String, _ input: [String: Any]) -> (summary: String, key: String) {
        if let command = input["command"] as? String {
            let name = command.split(separator: " ").first.map(String.init) ?? command
            return ("Run: \(command)", "\(tool):\(name)")
        }
        if let path = input["file_path"] as? String ?? input["notebook_path"] as? String {
            let folder = (path as NSString).deletingLastPathComponent
            return ("\(tool) \(path)", "\(tool):\(folder)")
        }
        if let url = input["url"] as? String {
            return ("\(tool) \(url)", "\(tool):\(URL(string: url)?.host ?? url)")
        }
        let detail = (try? JSONSerialization.data(withJSONObject: input)).map { String(decoding: $0, as: UTF8.self) } ?? ""
        return ("\(tool) \(detail.prefix(160))", tool)
    }

    private static func png(_ image: NSImage) -> Data? {
        // At most 1400 px wide: plenty to see, light to send.
        let scale = min(1, 1400 / max(1, image.size.width))
        let size = NSSize(width: image.size.width * scale, height: image.size.height * scale)
        guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size.width), pixelsHigh: Int(size.height),
                                         bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                         colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else { return nil }
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        image.draw(in: NSRect(origin: .zero, size: size))
        NSGraphicsContext.restoreGraphicsState()
        return rep.representation(using: .png, properties: [:])
    }
}

// MARK: - The site Assistant

extension LabModel {
    /// Where the person is, for the Assistant: page, section, language.
    fileprivate func siteContext() -> String? {
        guard let editor else { return nil }
        var parts: [String] = []
        if let node = editor.currentNode {
            parts.append("page “\(node.title)” (id \(node.id)\(node.previewPath.map { ", at \($0)" } ?? ""))")
        } else if let piece = editor.labSlug {
            parts.append("Lab piece \(piece)")
        }
        if let section = editor.currentSection {
            parts.append("section \(section.index + 1) “\(section.label)” (\(section.typeName))")
        }
        parts.append("editing language \(editor.language.uppercased())")
        return parts.joined(separator: ", ")
    }

    /// What the Assistant is told.
    fileprivate static func siteInstructions(_ repo: SiteManifest.Repository?) -> String {
        """
        You are the Assistant inside Profolio, a Mac app for editing and publishing portfolio websites\(repo.map { " (this one: GitHub \($0.owner)/\($0.name))" } ?? ""). \
        Help the person use Profolio and work on their site. \
        How Profolio works is in its guides: help_list, help_search and help_read. Use them rather than guessing, and give \
        the exact menu paths and button names they use. Before setup advice, check app_status (GitHub sign-in, unpublished \
        changes, what is open). Read the site with site_outline and page_read; see what the person is looking at with \
        selection_get and preview_screenshot. Messages may start with “[Profolio context: …]” — where they are in the app. \
        app_open opens things for them (GitHub Account, Publish, a page, a Lab piece, New Site). \
        You can change the site, always as a proposal the person sees and applies (each tool waits for Apply or Decline; \
        never claim a change is made before the tool says so): content_edit changes a page's content JSON (page_read \
        gives its file and fields) or a translation file (src/i18n/ko.json or zh.json: “strings” maps the English text \
        to its translation; translations_find looks them up); section_add adds an empty section to a page, then fill it \
        with content_edit; item_create makes a project, original, blog post or category; site_publish publishes every \
        unpublished change — only when the person asks. Batch related changes into one content_edit with a clear summary. \
        Applied edits can be undone with ⌘Z in the page’s form. Don’t create or edit files any other way. \
        Reply in the language the person writes in (the guides are in English: translate as you answer). Be brief and practical.
        """
    }

    fileprivate func registerSiteTools() {
        server.register(.init(name: "app_status",
                              description: "Profolio’s state: version, GitHub sign-in, the site’s repository, unpublished changes, what is open in the window.") { [weak self] _, _ in
            guard let self else { return .error("Unavailable.") }
            let info = Bundle.main.infoDictionary ?? [:]
            var lines = ["Profolio \(info["CFBundleShortVersionString"] as? String ?? "?")"]
            if let login = GitHubAccount.shared.login {
                lines.append("GitHub: signed in as \(login)")
            } else {
                lines.append("GitHub: not signed in (Profolio ▸ GitHub Account…)")
            }
            if let repo = self.document.manifest?.repository {
                lines.append("Repository: github.com/\(repo.owner)/\(repo.name) (branch \(repo.branch))")
            }
            if let editor = self.editor {
                let c = editor.changes
                let paths = (c?.upload ?? []) + (c?.delete ?? [])
                lines.append(c == nil ? "Unpublished changes: still counting" : "Unpublished changes: \(paths.count)" + (paths.isEmpty ? "" : "\n  " + paths.prefix(20).joined(separator: "\n  ")))
                if let context = self.siteContext() { lines.append("Open: \(context)") }
                lines.append("Preview size: \(editor.device.label)")
            }
            return .text(lines.joined(separator: "\n"))
        })
        server.register(.init(name: "app_open",
                              description: "Opens something in Profolio for the person. target: github-account, publish, backups, new-site, page (id = a page or section id from site_outline), lab (id = piece name).",
                              properties: ["target": ["type": "string", "enum": ["github-account", "publish", "backups", "new-site", "page", "lab"]],
                                           "id": ["type": "string"]],
                              required: ["target"]) { [weak self] args, _ in
            guard let self, let editor = self.editor else { return .error("No window.") }
            let id = args["id"] as? String ?? ""
            switch args["target"] as? String {
            case "github-account": GitHubAccount.shared.showWindow()
            case "publish": editor.showPublish = true
            case "backups": NSApp.sendAction(#selector(EditorWindowController.showBackups(_:)), to: nil, from: nil)
            case "new-site": NewSiteWindow.show()
            case "page":
                guard editor.index.node(EditorModel.nodeID(of: id)) != nil else { return .error("No page with id \(id). Use site_outline for ids.") }
                editor.open(id)
            case "lab":
                guard self.pieces.contains(id) else { return .error("No Lab piece \(id). Pieces: \(self.pieces.joined(separator: ", "))") }
                editor.open("lab:\(id)")
            default: return .error("Unknown target.")
            }
            return .text("Opened.")
        })
        server.register(.init(name: "site_outline",
                              description: "The site’s structure: every page, project, original, post and setting with its id, address and sections (label and type).") { [weak self] _, _ in
            guard let editor = self?.editor else { return .error("No window.") }
            var lines: [String] = []
            func walk(_ nodes: [SiteIndex.Node], _ depth: Int) {
                for n in nodes {
                    let pad = String(repeating: "  ", count: depth)
                    var line = "\(pad)- \(n.title)"
                    if n.editorPath != nil { line += " [id \(n.id)]" }
                    if let p = n.previewPath { line += " \(p)" }
                    if n.hidden { line += " (hidden)" }
                    lines.append(line)
                    for s in n.sections {
                        lines.append("\(pad)    · \(s.index + 1). \(s.label) — \(s.typeName)\(s.hidden ? " (hidden)" : "") [id \(s.id)]")
                    }
                    walk(n.children ?? [], depth + 1)
                }
            }
            walk(editor.index.tree, 0)
            if let lab = self?.pieces, !lab.isEmpty { lines.append("- Lab pieces: \(lab.joined(separator: ", "))") }
            return .text(lines.joined(separator: "\n"))
        })
        server.register(.init(name: "page_read",
                              description: "A page’s content as stored (JSON): its texts, settings and sections. id from site_outline.",
                              properties: ["id": ["type": "string"]], required: ["id"]) { [weak self] args, _ in
            guard let self, let editor = self.editor, let id = args["id"] as? String,
                  let node = editor.index.node(EditorModel.nodeID(of: id)) else { return .error("No page with that id. Use site_outline.") }
            guard let rel = node.contentPath, let site = self.siteFolder,
                  let data = try? Data(contentsOf: site.appendingPathComponent(rel)) else { return .text("\(node.title) has no content of its own.") }
            var text = String(decoding: data, as: UTF8.self)
            if text.count > 40_000 { text = String(text.prefix(40_000)) + "\n… (cut)" }
            return .text("\(node.title) — \(rel)\n\(text)")
        })
        server.register(.init(name: "selection_get",
                              description: "What the person has open and selected in Profolio right now.") { [weak self] _, _ in
            guard let context = self?.siteContext() else { return .text("Nothing is open.") }
            return .text(context)
        })
        server.register(.init(name: "preview_screenshot",
                              description: "A screenshot of the site preview in Profolio’s window as it shows right now (the visible part).") { [weak self] _, _ in
            guard let self, let editor = self.editor else { return .error("No window.") }
            let view = editor.labSlug != nil ? self.preview.webView : editor.preview.webView
            let image: NSImage? = await withCheckedContinuation { cont in
                view.takeSnapshot(with: nil) { image, _ in cont.resume(returning: image) }
            }
            guard let image, let png = Self.png(image) else { return .error("No preview to capture.") }
            return .image(png, caption: "Profolio’s preview (\(editor.device.label))")
        })
        server.register(.init(name: "help_list", description: "Profolio’s guides: topic names and titles.") { _, _ in
            .text(HelpGuides.all.map { "\($0.topic): \($0.title)" }.joined(separator: "\n"))
        })
        server.register(.init(name: "help_read", description: "One of Profolio’s guides, in full (topic from help_list).",
                              properties: ["topic": ["type": "string"]], required: ["topic"]) { args, _ in
            guard let guide = HelpGuides.all.first(where: { $0.topic == (args["topic"] as? String ?? "") }) else {
                return .error("No such guide. Topics: \(HelpGuides.all.map(\.topic).joined(separator: ", "))")
            }
            return .text(guide.text)
        })
        server.register(.init(name: "help_search", description: "Searches Profolio’s guides; returns matching lines with their topic.",
                              properties: ["query": ["type": "string"]], required: ["query"]) { args, _ in
            let words = (args["query"] as? String ?? "").lowercased().split(separator: " ").map(String.init).filter { $0.count > 2 }
            var hits: [String] = []
            for guide in HelpGuides.all {
                for line in guide.text.split(separator: "\n") where words.contains(where: { line.lowercased().contains($0) }) {
                    hits.append("\(guide.topic): \(line)")
                }
            }
            return .text(hits.isEmpty ? "Nothing found; try help_list." : hits.prefix(40).joined(separator: "\n"))
        })
    }
}

/// Profolio's guides (Help/*.md in the app bundle), for the Assistant.
enum HelpGuides {
    struct Guide {
        let topic: String
        let title: String
        let text: String
    }

    static let all: [Guide] = {
        guard let resources = Bundle.main.resourceURL,
              let walker = FileManager.default.enumerator(at: resources, includingPropertiesForKeys: nil) else { return [] }
        var guides: [Guide] = []
        for case let url as URL in walker where url.pathExtension == "md" {
            guard let text = try? String(contentsOf: url, encoding: .utf8) else { continue }
            let title = text.split(separator: "\n").first.map { $0.replacingOccurrences(of: "# ", with: "") } ?? url.lastPathComponent
            guides.append(Guide(topic: url.deletingPathExtension().lastPathComponent, title: title, text: text))
        }
        return guides.sorted { $0.topic < $1.topic }
    }()
}
