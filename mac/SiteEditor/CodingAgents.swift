import AppKit
import Foundation

/// Claude Code and Codex on this Mac, and the site's code for them to work
/// on: a git clone of the site's repository in ~/Profolio/<repo>. The site
/// carries AGENTS.md / CLAUDE.md (the site guide), so either agent knows
/// where things are. Changes go back with Push (git, signed in with the
/// GitHub account Profolio uses); content changed there comes into the
/// package with the next Publish, which merges what changed on GitHub.
enum CodingAgent: String, CaseIterable, Identifiable {
    case claude, codex
    var id: String { rawValue }

    var name: String { self == .claude ? "Claude Code" : "Codex" }
    var command: String { self == .claude ? "claude" : "codex" }
    var maker: String { self == .claude ? "Anthropic" : "OpenAI" }
    var docs: URL { URL(string: self == .claude ? "https://claude.com/claude-code" : "https://developers.openai.com/codex/cli")! }

    /// The shell line that installs it (shown and run in Terminal).
    var installCommand: String {
        switch self {
        case .claude: return "curl -fsSL https://claude.ai/install.sh | bash"
        case .codex: return LoginShell.which("brew") != nil ? "brew install --cask codex" : "npm install -g @openai/codex"
        }
    }

    /// Signs in with the person's own account (in Terminal).
    var signInCommand: String { self == .claude ? "claude /login" : "codex login" }

    var executable: URL? { LoginShell.which(command) }

    /// "2.1.3 (Claude Code)", or nil when it isn't installed or won't say.
    func version() -> String? {
        guard let exe = executable else { return nil }
        let out = Shell.run(exe.path, ["--version"], timeout: 10)
        return out.status == 0 ? out.stdout.trimmingCharacters(in: .whitespacesAndNewlines).components(separatedBy: "\n").first : nil
    }
}

/// Small helpers for running tools and opening Terminal.
enum Shell {
    struct Output { let status: Int32; let stdout: String; let stderr: String }

    static func run(_ tool: String, _ args: [String], in folder: URL? = nil, env extra: [String: String] = [:], timeout: TimeInterval = 600) -> Output {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: tool)
        p.arguments = args
        if let folder { p.currentDirectoryURL = folder }
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = LoginShell.path
        extra.forEach { env[$0.key] = $0.value }
        p.environment = env
        let out = Pipe(), err = Pipe()
        p.standardOutput = out
        p.standardError = err
        do { try p.run() } catch { return Output(status: -1, stdout: "", stderr: error.localizedDescription) }
        let deadline = Date().addingTimeInterval(timeout)
        // Read as it comes, so a chatty tool never blocks on a full pipe.
        var stdout = Data(), stderr = Data()
        let group = DispatchGroup()
        group.enter(); DispatchQueue.global().async { stdout = out.fileHandleForReading.readDataToEndOfFile(); group.leave() }
        group.enter(); DispatchQueue.global().async { stderr = err.fileHandleForReading.readDataToEndOfFile(); group.leave() }
        while p.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.05) }
        if p.isRunning { p.terminate() }
        p.waitUntilExit()
        group.wait()
        return Output(status: p.terminationStatus, stdout: String(decoding: stdout, as: UTF8.self), stderr: String(decoding: stderr, as: UTF8.self))
    }

    static func quote(_ s: String) -> String { "'" + s.replacingOccurrences(of: "'", with: "'\\''") + "'" }

    /// Runs `lines` in a new Terminal window (a .command file: no
    /// Automation permission needed).
    static func openInTerminal(_ title: String, _ lines: [String]) {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("\(title).command")
        try? ("#!/bin/zsh -l\n" + lines.joined(separator: "\n") + "\n").write(to: file, atomically: true, encoding: .utf8)
        try? FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: file.path)
        NSWorkspace.shared.open(file)
    }
}

/// The site's code on this Mac, for coding agents: a clone of its
/// repository. Git asks for the GitHub sign-in through a throwaway askpass
/// script that reads the token from the environment, so the token is never
/// written to disk or into the clone's settings.
struct WorkingCopy {
    let owner: String
    let repo: String
    let branch: String
    let token: String

    static var root: URL { FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Profolio") }
    var folder: URL { Self.root.appendingPathComponent(repo) }
    var exists: Bool { FileManager.default.fileExists(atPath: folder.appendingPathComponent(".git").path) }

    /// Whether git works here (it comes with Apple's command line tools).
    static var hasGit: Bool { Shell.run("/usr/bin/xcode-select", ["-p"], timeout: 10).status == 0 }

    struct Status { let changed: Int; let ahead: Int; let behind: Int }

    private func git(_ args: [String], in dir: URL? = nil) throws -> String {
        let askpass = FileManager.default.temporaryDirectory.appendingPathComponent("profolio-askpass-\(UUID().uuidString).sh")
        try "#!/bin/sh\ncase \"$1\" in *sername*) echo x-access-token ;; *) printf '%s\\n' \"$PROFOLIO_GIT_TOKEN\" ;; esac\n"
            .write(to: askpass, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: askpass.path)
        defer { try? FileManager.default.removeItem(at: askpass) }
        let out = Shell.run("/usr/bin/git", args, in: dir ?? folder, env: [
            "GIT_ASKPASS": askpass.path, "GIT_TERMINAL_PROMPT": "0", "PROFOLIO_GIT_TOKEN": token,
        ])
        guard out.status == 0 else {
            let message = (out.stderr.isEmpty ? out.stdout : out.stderr).trimmingCharacters(in: .whitespacesAndNewlines)
            throw PublishError(message.replacingOccurrences(of: token, with: "•••").components(separatedBy: "\n").suffix(3).joined(separator: "\n"))
        }
        return out.stdout
    }

    /// Clones it the first time; later, brings in what changed on GitHub
    /// (only when nothing here is uncommitted, so no work is lost).
    func prepare(author: (name: String, email: String)) throws -> String {
        guard Self.hasGit else { throw PublishError("Git isn’t installed. Install Apple’s command line tools first.") }
        if !exists {
            try FileManager.default.createDirectory(at: Self.root, withIntermediateDirectories: true)
            _ = try git(["clone", "--branch", branch, "https://github.com/\(owner)/\(repo).git", folder.path], in: Self.root)
            // Commits made here (by an agent too) are this GitHub account's:
            // Vercel won't deploy a commit from an address it can't place.
            _ = try git(["config", "user.name", author.name])
            _ = try git(["config", "user.email", author.email])
            return "Downloaded the site’s code to \(folder.path.replacingOccurrences(of: NSHomeDirectory(), with: "~"))."
        }
        let s = try status()
        if s.changed > 0 { return "Kept your uncommitted changes; didn’t bring in GitHub’s latest." }
        _ = try git(["pull", "--ff-only", "origin", branch])
        return "Up to date with GitHub."
    }

    func status() throws -> Status {
        let changed = try git(["status", "--porcelain"]).split(separator: "\n").count
        _ = try? git(["fetch", "--quiet", "origin", branch])
        let counts = (try? git(["rev-list", "--left-right", "--count", "HEAD...origin/\(branch)"]))?
            .split(whereSeparator: { $0 == "\t" || $0 == " " || $0 == "\n" }).compactMap { Int($0) } ?? [0, 0]
        return Status(changed: changed, ahead: counts.first ?? 0, behind: counts.count > 1 ? counts[1] : 0)
    }

    /// Commits what's uncommitted (as `author`) and pushes it.
    func push(message: String, author: (name: String, email: String)) throws -> String {
        if try status().changed > 0 {
            _ = try git(["add", "-A"])
            _ = try git(["-c", "user.name=\(author.name)", "-c", "user.email=\(author.email)", "commit", "-m", message])
        }
        _ = try git(["pull", "--rebase", "origin", branch])
        _ = try git(["push", "origin", "HEAD:\(branch)"])
        return "Pushed to GitHub. Vercel builds the site; content you changed comes into Profolio with the next Publish."
    }

    /// Opens Terminal in the working copy with the agent running.
    func open(_ agent: CodingAgent) {
        Shell.openInTerminal("\(agent.name) — \(repo)", ["cd \(Shell.quote(folder.path)) || exit 1", "exec \(agent.command)"])
    }
}
