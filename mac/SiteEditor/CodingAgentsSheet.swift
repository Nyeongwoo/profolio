import SwiftUI

/// File ▸ Coding Agents…: Claude Code and Codex (installed? signed in?), and
/// the site's code on this Mac for them (WorkingCopy): open it in either
/// agent, push what they changed.
struct CodingAgentsSheet: View {
    @ObservedObject var model: EditorModel
    @ObservedObject private var account = GitHubAccount.shared
    @Environment(\.dismiss) private var dismiss

    @State private var versions: [CodingAgent: String] = [:]
    @State private var checked = false
    @State private var status: WorkingCopy.Status?
    @State private var busy: String?
    @State private var message: String?
    @State private var failed = false

    private var copy: WorkingCopy? {
        guard let repo = model.document.manifest?.repository, let token = account.token else { return nil }
        return WorkingCopy(owner: repo.owner, repo: repo.name, branch: repo.branch, token: token)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                Image(systemName: "terminal.fill").font(.system(size: 26)).foregroundStyle(Color.accentColor)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Coding Agents").font(.headline)
                    Text("Let Claude Code or Codex work on your site’s code and design. They read AGENTS.md, the site’s guide, first.")
                        .font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
            }

            ForEach(CodingAgent.allCases) { agent in agentRow(agent) }

            Divider()
            workingCopySection

            if let message {
                Label(message, systemImage: failed ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                    .foregroundStyle(failed ? .orange : .green).font(.callout).fixedSize(horizontal: false, vertical: true)
            }
            HStack {
                if let busy { ProgressView().controlSize(.small); Text(busy).font(.callout).foregroundStyle(.secondary) }
                Spacer()
                Button("Done") { dismiss() }.keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 540)
        .task { await refresh() }
    }

    @ViewBuilder private func agentRow(_ agent: CodingAgent) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(agent.name).font(.callout.weight(.semibold))
                Group {
                    if !checked { Text("Checking…") }
                    else if let v = versions[agent] { Text("Installed — \(v)") }
                    else { Text("Not installed. By \(agent.maker); needs your own account.") }
                }
                .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if checked && versions[agent] == nil {
                Button("Install…") { install(agent) }
                Link("About", destination: agent.docs).font(.callout)
            } else if checked {
                Button("Sign In…") { Shell.openInTerminal("\(agent.name) Sign In", [agent.signInCommand]) }
                    .help("Opens Terminal to sign in with your \(agent.maker) account")
                Button("Open Site Code") { Task { await openCode(in: agent) } }
                    .buttonStyle(.borderedProminent)
                    .disabled(busy != nil || copy == nil)
            }
        }
    }

    @ViewBuilder private var workingCopySection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("The site’s code on this Mac").font(.callout.weight(.semibold))
            if account.token == nil {
                Text("Sign in to GitHub first (Profolio ▸ GitHub Account…).").font(.caption).foregroundStyle(.secondary)
            } else if !WorkingCopy.hasGit {
                Text("Agents work in a git copy of your site. Install Apple’s command line tools to get git.").font(.caption).foregroundStyle(.secondary)
                Button("Install Command Line Tools…") { Shell.openInTerminal("Command Line Tools", ["xcode-select --install"]) }
            } else if let copy {
                Text(copy.exists ? copy.folder.path.replacingOccurrences(of: NSHomeDirectory(), with: "~")
                                 : "Downloaded to ~/Profolio/\(copy.repo) when you first open it.")
                    .font(.caption.monospaced()).foregroundStyle(.secondary).textSelection(.enabled)
                if copy.exists {
                    if let status {
                        Text(statusText(status)).font(.caption).foregroundStyle(.secondary)
                    }
                    HStack {
                        Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([copy.folder]) }
                        Button("Push to GitHub") { Task { await push() } }
                            .disabled(busy != nil || (status.map { $0.changed == 0 && $0.ahead == 0 } ?? false))
                            .help("Commits what the agent changed and sends it to GitHub; Vercel then builds the site")
                    }
                }
            }
        }
    }

    private func statusText(_ s: WorkingCopy.Status) -> String {
        var parts: [String] = []
        parts.append(s.changed == 0 ? "No uncommitted changes" : "\(s.changed) changed file\(s.changed == 1 ? "" : "s")")
        if s.ahead > 0 { parts.append("\(s.ahead) commit\(s.ahead == 1 ? "" : "s") not pushed") }
        if s.behind > 0 { parts.append("\(s.behind) new on GitHub") }
        return parts.joined(separator: " · ")
    }

    private func refresh() async {
        let found = await Task.detached { Dictionary(uniqueKeysWithValues: CodingAgent.allCases.compactMap { a in a.version().map { (a, $0) } }) }.value
        versions = found
        checked = true
        if let copy, copy.exists { status = await Task.detached { try? copy.status() }.value }
    }

    private func install(_ agent: CodingAgent) {
        Shell.openInTerminal("Install \(agent.name)", [
            "echo 'Installing \(agent.name)…'", agent.installCommand,
            "echo", "echo 'Done. Sign in next:'", agent.signInCommand,
        ])
        message = "Installing in Terminal. Come back here when it’s done."
        failed = false
        Task { try? await Task.sleep(nanoseconds: 3_000_000_000); checked = false; await refresh() }
    }

    private func openCode(in agent: CodingAgent) async {
        guard let copy, let token = account.token else { return }
        busy = copy.exists ? "Bringing in GitHub’s latest…" : "Downloading the site’s code…"
        defer { busy = nil }
        do {
            let author = try await GitHubClient(token: token).commitIdentity()
            let note = try await Task.detached { try copy.prepare(author: author) }.value
            copy.open(agent)
            message = note + " \(agent.name) opened in Terminal."
            failed = false
            status = await Task.detached { try? copy.status() }.value
        } catch {
            message = error.localizedDescription
            failed = true
        }
    }

    private func push() async {
        guard let copy, let token = account.token else { return }
        busy = "Pushing…"
        defer { busy = nil }
        do {
            let author = try await GitHubClient(token: token).commitIdentity()
            message = try await Task.detached { try copy.push(message: "Changes made with a coding agent", author: author) }.value
            failed = false
            status = await Task.detached { try? copy.status() }.value
        } catch {
            message = error.localizedDescription
            failed = true
        }
    }
}
