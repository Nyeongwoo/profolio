import SwiftUI

/// File ▸ Connect Domain…: puts your own domain on the site's Vercel project
/// and shows the DNS records to add where the domain was bought, then checks
/// until they work. Needs a Vercel token, kept in the keychain.
struct DomainSheet: View {
    @ObservedObject var model: EditorModel
    @Environment(\.dismiss) private var dismiss

    @State private var token = VercelToken.load()
    @State private var tokenDraft = ""
    @State private var project: VercelClient.Project?
    @State private var searched = false
    @State private var domains: [VercelClient.Domain] = []
    @State private var dns: [String: VercelClient.DNS] = [:]
    @State private var newDomain = ""
    @State private var busy: String?
    @State private var error: String?

    private var repo: SiteManifest.Repository? { model.document.manifest?.repository }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                Image(systemName: "globe").font(.system(size: 26)).foregroundStyle(Color.accentColor)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Connect Domain").font(.headline)
                    Text("Use your own address, like yourname.com, for the site Vercel serves.")
                        .font(.callout).foregroundStyle(.secondary)
                }
            }
            if token == nil { tokenForm } else if !searched || busy != nil && project == nil { progressRow }
            else if project == nil { noProject } else { domainList }

            if let error {
                Label(error, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange).font(.callout)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack {
                if token != nil {
                    Button("Forget Vercel Token") { VercelToken.delete(); token = nil; project = nil; searched = false }
                        .buttonStyle(.link).font(.caption)
                }
                Spacer()
                if let busy, project != nil { ProgressView().controlSize(.small); Text(busy).font(.callout).foregroundStyle(.secondary) }
                Button("Done") { dismiss() }.keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 560)
        .task(id: token) { await load() }
    }

    private var progressRow: some View {
        HStack(spacing: 8) { ProgressView().controlSize(.small); Text(busy ?? "Finding the site on Vercel…").foregroundStyle(.secondary) }
    }

    private var tokenForm: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Profolio needs a Vercel token to add the domain for you. Make one at Vercel ▸ Account Settings ▸ Tokens (scope: the account or team the site is in), then paste it here.")
                .font(.callout).fixedSize(horizontal: false, vertical: true)
            HStack {
                SecureField("Vercel token", text: $tokenDraft).textFieldStyle(.roundedBorder)
                Button("Save") { Task { await saveToken() } }.disabled(tokenDraft.trimmingCharacters(in: .whitespaces).isEmpty || busy != nil)
            }
            Link("Make a token on vercel.com", destination: URL(string: "https://vercel.com/account/tokens")!).font(.callout)
        }
    }

    private var noProject: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("No Vercel project this token can see is built from github.com/\(repo?.owner ?? "")/\(repo?.name ?? "").")
                .font(.callout).fixedSize(horizontal: false, vertical: true)
            HStack {
                Button("Connect to Vercel…") {
                    let repoURL = "https://github.com/\(repo?.owner ?? "")/\(repo?.name ?? "")"
                    NSWorkspace.shared.open(URL(string: "https://vercel.com/new/import?s=\(repoURL.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? repoURL)")!)
                }
                Button("Look Again") { Task { await load() } }
            }
        }
    }

    @ViewBuilder private var domainList: some View {
        if let project {
            Text("Vercel project: \(project.name)\(project.teamName.map { " (\($0))" } ?? "")").font(.caption).foregroundStyle(.secondary)
        }
        VStack(alignment: .leading, spacing: 10) {
            ForEach(domains.filter { !$0.name.hasSuffix(".vercel.app") }, id: \.name) { d in domainRow(d) }
            if domains.allSatisfy({ $0.name.hasSuffix(".vercel.app") }) {
                Text("No domain of yours yet.").font(.callout).foregroundStyle(.secondary)
            }
        }
        HStack {
            TextField("yourname.com", text: $newDomain).textFieldStyle(.roundedBorder)
                .onSubmit { Task { await add() } }
            Button("Add Domain") { Task { await add() } }.disabled(Self.clean(newDomain) == nil || busy != nil)
        }
        Text("Bought it somewhere (Namecheap, GoDaddy, Gabia, Cloudflare…)? Add it here, then add the records shown at that company’s DNS settings. Adding www too is a good idea.")
            .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
    }

    @ViewBuilder private func domainRow(_ d: VercelClient.Domain) -> some View {
        let records = dns[d.name]
        let working = d.verified && records?.misconfigured == false
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: working ? "checkmark.circle.fill" : "clock").foregroundStyle(working ? .green : .orange)
                Text(d.name).font(.callout.weight(.semibold))
                Text(working ? "Working" : "Waiting for DNS").font(.caption).foregroundStyle(.secondary)
                Spacer()
                if working, let url = URL(string: "https://\(d.name)") {
                    Button("Use as Live Site") { model.setLiveSiteAddress(url) }.controlSize(.small)
                        .help("Profolio’s Live Site and links open this address")
                } else {
                    Button("Check Again") { Task { await check(d.name) } }.controlSize(.small).disabled(busy != nil)
                }
                Button { Task { await remove(d.name) } } label: { Image(systemName: "minus.circle") }
                    .buttonStyle(.borderless).help("Remove this domain from the project")
            }
            if !working {
                let rows = d.verification + (records?.records ?? [])
                if !rows.isEmpty {
                    Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 4) {
                        GridRow { Text("Type"); Text("Name"); Text("Value") }.font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                        ForEach(Array(rows.enumerated()), id: \.offset) { _, r in
                            GridRow {
                                Text(r.type)
                                Text(r.name.isEmpty ? "@" : r.name)
                                Text(r.value).textSelection(.enabled)
                            }
                            .font(.caption.monospaced())
                        }
                    }
                    .padding(8)
                    .background(RoundedRectangle(cornerRadius: 6).fill(Color.secondary.opacity(0.08)))
                    Text("DNS changes can take a few minutes to a few hours. Then Check Again.").font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }

    // MARK: - Actions

    private var client: VercelClient? { token.map(VercelClient.init) }

    private func saveToken() async {
        let t = tokenDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        busy = "Checking the token…"
        defer { busy = nil }
        do {
            _ = try await VercelClient(token: t).username()
            VercelToken.save(t)
            tokenDraft = ""
            error = nil
            token = t
        } catch { self.error = error.localizedDescription }
    }

    private func load() async {
        guard let client, let repo else { return }
        busy = "Finding the site on Vercel…"
        defer { busy = nil; searched = true }
        do {
            project = try await client.project(owner: repo.owner, repo: repo.name)
            if let project { domains = try await client.domains(of: project); await loadDNS() }
            error = nil
        } catch { self.error = error.localizedDescription }
    }

    private func loadDNS() async {
        guard let client, let project else { return }
        for d in domains where !d.name.hasSuffix(".vercel.app") {
            dns[d.name] = try? await client.dns(for: d.name, in: project)
        }
    }

    private func add() async {
        guard let client, let project, let name = Self.clean(newDomain) else { return }
        busy = "Adding \(name)…"
        defer { busy = nil }
        do {
            _ = try await client.add(name, to: project)
            newDomain = ""
            domains = try await client.domains(of: project)
            await loadDNS()
            error = nil
        } catch { self.error = error.localizedDescription }
    }

    private func check(_ name: String) async {
        guard let client, let project else { return }
        busy = "Checking \(name)…"
        defer { busy = nil }
        _ = try? await client.verify(name, in: project)
        domains = (try? await client.domains(of: project)) ?? domains
        dns[name] = try? await client.dns(for: name, in: project)
        if let d = domains.first(where: { $0.name == name }), d.verified, dns[name]?.misconfigured == false,
           let url = URL(string: "https://\(name)") {
            model.setLiveSiteAddress(url)
        }
    }

    private func remove(_ name: String) async {
        let alert = NSAlert()
        alert.messageText = "Remove \(name) from the Vercel project?"
        alert.informativeText = "The site stops answering at that address. The domain itself stays yours."
        alert.addButton(withTitle: "Remove")
        alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn, let client, let project else { return }
        do {
            try await client.remove(name, from: project)
            domains = try await client.domains(of: project)
        } catch { self.error = error.localizedDescription }
    }

    /// "https://Example.com/" → "example.com"; nil when it isn't a domain.
    static func clean(_ input: String) -> String? {
        var s = input.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        for prefix in ["https://", "http://"] where s.hasPrefix(prefix) { s = String(s.dropFirst(prefix.count)) }
        s = String(s.split(separator: "/").first ?? "")
        return s.range(of: #"^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$"#, options: .regularExpression) != nil ? s : nil
    }
}
