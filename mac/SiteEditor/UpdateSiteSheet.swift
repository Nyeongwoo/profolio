import SwiftUI

/// File ▸ Update Site…: checks what the starter in this Profolio would
/// change in the site's code, lets the person keep their own version of
/// files changed on both sides, then updates (SiteUpdater).
struct UpdateSiteSheet: View {
    @ObservedObject var model: EditorModel
    @ObservedObject private var account = GitHubAccount.shared
    @Environment(\.dismiss) private var dismiss

    private enum Phase { case checking, ready(SiteUpdater.Plan), updating, done(String), failed(String) }
    @State private var phase: Phase = .checking
    @State private var keepMine: Set<String> = []
    @State private var status = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                Image(systemName: "arrow.triangle.2.circlepath.circle.fill").font(.system(size: 30)).foregroundStyle(Color.accentColor)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Update Site").font(.headline)
                    Text("Brings in this Profolio’s site code — new site settings, fixes and the guide for coding agents. Your content stays as it is.")
                        .font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
            }
            content
            HStack {
                Spacer()
                switch phase {
                case .ready(let plan) where !plan.isEmpty:
                    Button("Cancel") { close() }.keyboardShortcut(.cancelAction)
                    Button("Update") { update(plan) }.keyboardShortcut(.defaultAction)
                case .updating, .checking:
                    Button("Cancel") { close() }.disabled(true)
                default:
                    Button("Done") { close() }.keyboardShortcut(.defaultAction)
                }
            }
        }
        .padding(20)
        .frame(width: 520)
        .task { await check() }
    }

    @ViewBuilder private var content: some View {
        switch phase {
        case .checking:
            HStack(spacing: 8) { ProgressView().controlSize(.small); Text("Comparing with the site on GitHub…").foregroundStyle(.secondary) }
        case .ready(let plan) where plan.isEmpty:
            Label("The site’s code is up to date.", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
        case .ready(let plan):
            VStack(alignment: .leading, spacing: 8) {
                Text(summary(plan)).font(.callout)
                if plan.unverified > 0 {
                    Text("\(plan.unverified) of them can’t be checked for your own edits (this site was made before Profolio kept track); they’re replaced.")
                        .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
                if !plan.conflicts.isEmpty {
                    Text("Changed on your site and in Profolio — tick the ones to keep as they are on your site:")
                        .font(.callout).fixedSize(horizontal: false, vertical: true)
                    ScrollView {
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(plan.conflicts, id: \.self) { path in
                                Toggle(isOn: Binding(get: { keepMine.contains(path) }, set: { on in
                                    if on { keepMine.insert(path) } else { keepMine.remove(path) }
                                })) { Text(path).font(.system(.callout, design: .monospaced)) }
                                .toggleStyle(.checkbox)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(maxHeight: 160)
                }
            }
        case .updating:
            HStack(spacing: 8) { ProgressView().controlSize(.small); Text(status).foregroundStyle(.secondary) }
        case .done(let message):
            Label(message, systemImage: "checkmark.circle.fill").foregroundStyle(.green).fixedSize(horizontal: false, vertical: true)
        case .failed(let message):
            Label(message, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange).fixedSize(horizontal: false, vertical: true)
        }
    }

    private func summary(_ plan: SiteUpdater.Plan) -> String {
        var parts: [String] = []
        if !plan.upload.isEmpty { parts.append("\(plan.upload.count) file\(plan.upload.count == 1 ? "" : "s") updated or added") }
        if !plan.delete.isEmpty { parts.append("\(plan.delete.count) removed") }
        if !plan.conflicts.isEmpty { parts.append("\(plan.conflicts.count) to decide") }
        if !plan.strays.isEmpty { parts.append("\(plan.strays.count) leftover file\(plan.strays.count == 1 ? "" : "s") from an older Profolio removed") }
        if !plan.seeds.isEmpty { parts.append("\(plan.seeds.count) new content file\(plan.seeds.count == 1 ? "" : "s") (\(plan.seeds.map { ($0 as NSString).lastPathComponent }.joined(separator: ", ")))") }
        return parts.joined(separator: ", ") + ". One commit to your repository; Vercel then rebuilds the site."
    }

    private var updater: SiteUpdater? {
        guard let package = model.document.packageURL, let manifest = model.document.manifest, let token = account.token else { return nil }
        return SiteUpdater(package: package, manifest: manifest, token: token)
    }

    private func check() async {
        guard let updater else {
            phase = .failed(account.token == nil ? "Sign in to GitHub first (Profolio ▸ GitHub Account…)." : "No site is open.")
            return
        }
        do { phase = .ready(try await updater.check()) } catch { phase = .failed(error.localizedDescription) }
    }

    private func update(_ plan: SiteUpdater.Plan) {
        guard let updater else { return }
        phase = .updating
        Task {
            do {
                _ = try await updater.apply(plan, keepMine: keepMine) { message in Task { @MainActor in status = message } }
                SiteUpdater.discard(plan)
                NSApp.sendAction(#selector(EditorWindowController.reloadEditor(_:)), to: nil, from: nil)
                phase = .done("Updated. Vercel is building the site; the live site follows in a minute or two.")
            } catch {
                phase = .failed(error.localizedDescription)
            }
        }
    }

    private func close() {
        if case .ready(let plan) = phase { SiteUpdater.discard(plan) }
        dismiss()
    }
}
