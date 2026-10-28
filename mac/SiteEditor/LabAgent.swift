import Foundation

/// What a coding agent reports while it works on a lab piece.
enum LabAgentEvent {
    /// The agent's session started (or resumed); keep the id to resume later.
    case session(String)
    /// Text the agent wrote to the person.
    case text(String)
    /// A tool it used, summarised ("Edit tree.js", "lab_screenshot").
    case tool(String)
    /// The turn ended.
    case done(isError: Bool, summary: String?)
    /// It couldn't run, or stopped unexpectedly.
    case failure(String)
}

/// A coding agent the Lab chats through. Claude Code now; others (Codex
/// CLI, …) can be added as further adapters — the Lab's tools reach any of
/// them the same way, through Profolio's MCP server (LabMCPServer).
@MainActor
protocol LabAgent: AnyObject {
    var displayName: String { get }
    var onEvent: ((LabAgentEvent) -> Void)? { get set }
    var isRunning: Bool { get }
    func send(_ text: String)
    /// Stops the current turn; the next send resumes the same session.
    func stop()
}

/// Finds command-line tools the way Terminal would: apps launched from the
/// Finder don't get the login shell's PATH (Homebrew, npm globals, …).
enum LoginShell {
    static let path: String = {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/zsh")
        p.arguments = ["-lc", "printf %s \"$PATH\""]
        let out = Pipe()
        p.standardOutput = out
        p.standardError = FileHandle.nullDevice
        try? p.run()
        let found = String(decoding: out.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
        // Not waitUntilExit: it runs the run loop, and a view asking for the
        // path again from there (Coding Agents' sheet) crashed the app.
        while p.isRunning { usleep(1_000) }
        return found.isEmpty ? "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" : found
    }()

    static func which(_ tool: String) -> URL? {
        for dir in path.split(separator: ":") {
            let url = URL(fileURLWithPath: String(dir)).appendingPathComponent(tool)
            if FileManager.default.isExecutableFile(atPath: url.path) { return url }
        }
        return nil
    }
}

/// Claude Code, run headless in the package's site folder: one process per piece,
/// kept open across turns (stream-json in and out), signed in with the
/// person's own Claude account. Edits under public/lab go ahead; anything
/// else is asked in the chat first (LabModel's approve tool).
@MainActor
final class ClaudeCodeAgent: LabAgent {
    let displayName = "Claude"
    var onEvent: ((LabAgentEvent) -> Void)?
    private(set) var isRunning = false

    private let executable: URL
    private let folder: URL
    private let mcpConfig: String
    private let systemPrompt: String
    private let allowedTools: [String]
    private let disallowedTools: [String]
    private var sessionID: String?
    private var process: Process?
    private var input: FileHandle?
    private var buffer = Data()

    static func locate() -> URL? { LoginShell.which("claude") }

    /// What a Lab agent may do without asking: read anything, edit the
    /// Lab's files, and use Profolio's tools.
    static let labTools = ["Read", "Glob", "Grep", "Edit(public/lab/**)", "Write(public/lab/**)", "Bash(ls:*)", "mcp__profolio"]
    /// The site Assistant: read, and Profolio's tools; it changes nothing
    /// on its own (edits go through Profolio, with the person's say-so).
    static let assistantTools = ["Read", "Glob", "Grep", "mcp__profolio"]
    /// Never available to the site Assistant, whatever the person answers:
    /// its changes go through Profolio's proposal tools (content_edit, …),
    /// never straight into the package — not site/, not editor/ (a build).
    static let writeTools = ["Write", "Edit", "MultiEdit", "NotebookEdit", "Bash"]

    init(executable: URL, folder: URL, sessionID: String?, mcpConfig: String, systemPrompt: String,
         allowedTools: [String] = ClaudeCodeAgent.labTools, disallowedTools: [String] = []) {
        self.executable = executable
        self.folder = folder
        self.sessionID = sessionID
        self.mcpConfig = mcpConfig
        self.systemPrompt = systemPrompt
        self.allowedTools = allowedTools
        self.disallowedTools = disallowedTools
    }

    func send(_ text: String) {
        if process?.isRunning != true { start() }
        guard let input, process?.isRunning == true else { return }
        let message: [String: Any] = ["type": "user", "message": ["role": "user", "content": text]]
        guard var line = try? JSONSerialization.data(withJSONObject: message) else { return }
        line.append(0x0A)
        isRunning = true
        try? input.write(contentsOf: line)
    }

    func stop() {
        guard let process, process.isRunning else { return }
        process.terminate()   // the next send resumes the session
    }

    /// The window (and its Lab) went away: don't leave Claude Code running.
    deinit {
        if let process, process.isRunning { process.terminate() }
    }

    private func start() {
        var args = [
            "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
            "--mcp-config", mcpConfig,
            "--append-system-prompt", systemPrompt,
            "--allowedTools",
        ] + allowedTools + [
            // Anything else is asked in the chat (LabModel's approve tool).
            "--permission-prompt-tool", "mcp__profolio__approve",
            "--permission-mode", "default",
        ]
        if !disallowedTools.isEmpty {
            // Removed from the session outright, and only Profolio's MCP
            // server: no other server's tools can write either.
            args += ["--strict-mcp-config", "--disallowedTools"] + disallowedTools
        }
        if let sessionID { args += ["--resume", sessionID] }

        let p = Process()
        p.executableURL = executable
        p.arguments = args
        p.currentDirectoryURL = folder
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = LoginShell.path
        // Asking the person can take a while; don't let the call time out.
        env["MCP_TOOL_TIMEOUT"] = "1800000"
        p.environment = env
        let stdin = Pipe(), stdout = Pipe(), stderr = Pipe()
        p.standardInput = stdin
        p.standardOutput = stdout
        p.standardError = stderr

        stdout.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            // At the end of the stream the handler keeps firing, empty.
            if data.isEmpty { handle.readabilityHandler = nil; return }
            DispatchQueue.main.async { MainActor.assumeIsolated { self?.received(data) } }
        }
        p.terminationHandler = { [weak self] proc in
            stdout.fileHandleForReading.readabilityHandler = nil
            // Claude Code writes little to stderr; read it once it's done.
            let errText = String(decoding: stderr.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
            let status = proc.terminationStatus, reason = proc.terminationReason
            let message = errText.trimmingCharacters(in: .whitespacesAndNewlines)
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    guard let self else { return }
                    let wasRunning = self.isRunning
                    self.isRunning = false
                    self.process = nil
                    self.input = nil
                    if reason == .uncaughtSignal {
                        if wasRunning { self.onEvent?(.done(isError: false, summary: "Stopped.")) }
                    } else if status != 0 {
                        self.onEvent?(.failure(message.isEmpty ? "Claude Code exited (\(status))." : message))
                    }
                }
            }
        }
        do {
            try p.run()
            process = p
            input = stdin.fileHandleForWriting
        } catch {
            onEvent?(.failure("Couldn’t start Claude Code: \(error.localizedDescription)"))
        }
    }

    private func received(_ data: Data) {
        buffer.append(data)
        while let newline = buffer.firstIndex(of: 0x0A) {
            let line = buffer[buffer.startIndex..<newline]
            buffer.removeSubrange(buffer.startIndex...newline)
            guard let event = try? JSONSerialization.jsonObject(with: line) as? [String: Any] else { continue }
            handle(event)
        }
    }

    private func handle(_ event: [String: Any]) {
        switch event["type"] as? String {
        case "system":
            if let id = event["session_id"] as? String, id != sessionID {
                sessionID = id
                onEvent?(.session(id))
            }
        case "assistant":
            let content = (event["message"] as? [String: Any])?["content"] as? [[String: Any]] ?? []
            for block in content {
                switch block["type"] as? String {
                case "text":
                    if let text = block["text"] as? String, !text.isEmpty { onEvent?(.text(text)) }
                case "tool_use":
                    onEvent?(.tool(Self.describe(block)))
                default: break
                }
            }
        case "result":
            isRunning = false
            if let id = event["session_id"] as? String { sessionID = id; onEvent?(.session(id)) }
            let isError = event["is_error"] as? Bool ?? false
            onEvent?(.done(isError: isError, summary: isError ? event["result"] as? String : nil))
        default:
            break
        }
    }

    /// "Edit public/lab/doaa/tree.js" → "Edit tree.js"
    private static func describe(_ block: [String: Any]) -> String {
        let name = (block["name"] as? String ?? "tool").replacingOccurrences(of: "mcp__profolio__", with: "")
        let input = block["input"] as? [String: Any] ?? [:]
        if let path = input["file_path"] as? String ?? input["path"] as? String {
            return "\(name) \((path as NSString).lastPathComponent)"
        }
        if let command = input["command"] as? String { return "\(name): \(command.prefix(60))" }
        if let pattern = input["pattern"] as? String { return "\(name) \(pattern)" }
        return name
    }
}
