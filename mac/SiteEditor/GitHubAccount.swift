import AppKit
import SwiftUI

/// The signed-in GitHub account, shared by every open project.
///
/// Sign-in is GitHub's device flow (enter a code on github.com), which needs
/// an OAuth App's client ID in the `GITHUB_CLIENT_ID` build setting, or a
/// pasted token (fine-grained: Contents read & write on the site repo).
@MainActor
final class GitHubAccount: ObservableObject {
    static let shared = GitHubAccount()

    enum DeviceStep: Equatable {
        case idle
        case waiting(code: String, url: URL)
    }

    /// Read from the keychain in the background at startup: macOS may ask
    /// first whether Profolio may use it, and that question waits for an
    /// answer — on the main thread it kept the window from opening.
    @Published private(set) var token: String?
    @Published private(set) var loaded = false
    @Published private(set) var login: String?
    @Published private(set) var synced = true
    @Published private(set) var device: DeviceStep = .idle
    @Published var error: String?

    static let clientID: String? = {
        let id = Bundle.main.object(forInfoDictionaryKey: "GitHubClientID") as? String ?? ""
        return id.isEmpty ? nil : id
    }()

    private var deviceTask: Task<Void, Never>?

    private init() {
        Task {
            let saved = await Task.detached { TokenStore.load() }.value
            if token == nil { token = saved }
            loaded = true
            if let saved { await refreshLogin(saved) }
        }
    }

    var isSignedIn: Bool { token != nil }

    private func refreshLogin(_ token: String) async {
        do {
            login = try await GitHubClient(token: token).login()
        } catch let e as GitHubError where e.status == 401 {
            tokenRejected()
        } catch {}
    }

    /// GitHub answered 401: the saved sign-in was revoked (on github.com ›
    /// Settings › Applications, or by GitHub) or expired. Forget it and ask
    /// for a new one, instead of failing at every publish.
    func tokenRejected() {
        signOut()
        error = "GitHub no longer accepts the saved sign-in. Sign in again."
        showWindow()
    }

    /// Checks the token works, then keeps it.
    func useToken(_ raw: String) async {
        let token = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !token.isEmpty else { return }
        error = nil
        do {
            let login = try await GitHubClient(token: token).login()
            synced = try TokenStore.save(token)
            self.token = token
            self.login = login
        } catch {
            self.error = error.localizedDescription
        }
    }

    func signOut() {
        cancelDeviceFlow()
        TokenStore.delete()
        token = nil
        login = nil
    }

    // MARK: - Device flow

    func startDeviceFlow() {
        guard let clientID = Self.clientID else { return }
        cancelDeviceFlow()
        error = nil
        deviceTask = Task {
            do {
                let start = try await Self.post("https://github.com/login/device/code",
                                                ["client_id": clientID, "scope": "repo"])
                guard let deviceCode = start["device_code"] as? String,
                      let userCode = start["user_code"] as? String,
                      let url = URL(string: start["verification_uri"] as? String ?? "") else {
                    throw GitHubError(status: 0, message: start["error_description"] as? String ?? "Couldn't start sign-in")
                }
                device = .waiting(code: userCode, url: url)
                var interval = (start["interval"] as? Int) ?? 5
                while !Task.isCancelled {
                    try await Task.sleep(nanoseconds: UInt64(interval) * 1_000_000_000)
                    let r = try await Self.post("https://github.com/login/oauth/access_token", [
                        "client_id": clientID, "device_code": deviceCode,
                        "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                    ])
                    if let token = r["access_token"] as? String {
                        device = .idle
                        await useToken(token)
                        return
                    }
                    switch r["error"] as? String {
                    case "authorization_pending": continue
                    case "slow_down": interval += 5
                    default: throw GitHubError(status: 0, message: r["error_description"] as? String ?? "Sign-in failed")
                    }
                }
            } catch is CancellationError {
            } catch {
                self.error = error.localizedDescription
                device = .idle
            }
        }
    }

    func cancelDeviceFlow() {
        deviceTask?.cancel()
        deviceTask = nil
        device = .idle
    }

    private static func post(_ url: String, _ form: [String: String]) async throws -> [String: Any] {
        var request = URLRequest(url: URL(string: url)!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = form.map { "\($0)=\($1.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? $1)" }
            .joined(separator: "&").data(using: .utf8)
        let (data, _) = try await URLSession.shared.data(for: request)
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
    }

    // MARK: - Window

    private var window: NSWindow?

    func showWindow() {
        if window == nil {
            let w = NSWindow(contentViewController: NSHostingController(rootView: AccountView(account: self)))
            w.title = "GitHub Account"
            w.styleMask = [.titled, .closable]
            w.isReleasedWhenClosed = false
            w.center()
            window = w
        }
        window?.makeKeyAndOrderFront(nil)
    }
}

struct AccountView: View {
    @ObservedObject var account: GitHubAccount
    @State private var token = ""
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if account.isSignedIn {
                signedIn
            } else {
                signIn
            }
            if let error = account.error {
                Text(error).foregroundStyle(.red).font(.callout).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(24)
        .frame(width: 420)
    }

    private var signedIn: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Signed in as \(account.login ?? "…")", systemImage: "checkmark.circle.fill")
                .font(.headline)
            Text(account.synced
                 ? "The token is in iCloud Keychain, so your other Macs are signed in too."
                 : "The token is saved on this Mac only. (iCloud Keychain sync needs a build signed with your Apple developer team.)")
                .font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            Button("Sign Out", role: .destructive) { account.signOut() }
        }
    }

    @ViewBuilder private var signIn: some View {
        Text("Sign in to GitHub to publish your changes.").font(.headline)

        if case .waiting(let code, let url) = account.device {
            VStack(alignment: .leading, spacing: 10) {
                Text("Enter this code on GitHub:").font(.callout)
                Text(code).font(.system(size: 28, weight: .semibold, design: .monospaced)).textSelection(.enabled)
                HStack {
                    Button("Copy Code and Open GitHub") {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(code, forType: .string)
                        NSWorkspace.shared.open(url)
                    }
                    .keyboardShortcut(.defaultAction)
                    Button("Cancel") { account.cancelDeviceFlow() }
                    ProgressView().controlSize(.small).padding(.leading, 4)
                }
            }
        } else if GitHubAccount.clientID != nil {
            Button("Sign In with GitHub…") { account.startDeviceFlow() }
                .keyboardShortcut(.defaultAction)
        }

        Divider()

        VStack(alignment: .leading, spacing: 8) {
            Text(GitHubAccount.clientID == nil ? "Paste a GitHub token" : "Or paste a token").font(.callout.weight(.medium))
            Text("A fine-grained personal access token with **Contents: Read and write** on the site's repository.")
                .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            HStack {
                SecureField("github_pat_…", text: $token)
                Button("Save") {
                    busy = true
                    Task { await account.useToken(token); busy = false; token = "" }
                }
                .disabled(token.isEmpty || busy)
            }
            Link("Create a token on GitHub",
                 destination: URL(string: "https://github.com/settings/personal-access-tokens/new")!)
                .font(.caption)
        }
    }
}
