import Foundation

struct GitHubError: LocalizedError {
    let status: Int
    let message: String
    var errorDescription: String? { "GitHub: \(message) (\(status))" }
}

/// The GitHub REST calls Profolio needs: who am I, and the Git Data API
/// (blobs → tree → commit → ref) for publishing without a local clone.
final class GitHubClient {
    let token: String
    let owner: String
    let repo: String

    init(token: String, owner: String = "", repo: String = "") {
        self.token = token
        self.owner = owner
        self.repo = repo
    }

    private var repoPath: String { "/repos/\(owner)/\(repo)" }

    /// Told how many seconds a request waits out GitHub's rate limit.
    var onRateLimit: ((Int) -> Void)?

    #if DEBUG
    // Tests point this at a stand-in server.
    private static let base = ProcessInfo.processInfo.environment["SITEEDITOR_GITHUB_API"] ?? "https://api.github.com"
    #else
    private static let base = "https://api.github.com"
    #endif

    // MARK: - Requests

    func json(_ method: String, _ path: String, body: [String: Any]? = nil) async throws -> [String: Any] {
        let data = try await raw(method, path, body: body)
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
    }

    func raw(_ method: String, _ path: String, body: [String: Any]? = nil,
             accept: String = "application/vnd.github+json") async throws -> Data {
        var request = URLRequest(url: URL(string: Self.base + path)!, timeoutInterval: 300)
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(accept, forHTTPHeaderField: "Accept")
        request.setValue("2022-11-28", forHTTPHeaderField: "X-GitHub-Api-Version")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        // Publishing many files makes many content-creating requests, which
        // GitHub throttles ("secondary rate limit"): wait as long as it says
        // (Retry-After, or until the limit resets; a minute otherwise), then
        // try again.
        for attempt in 1...8 {
            let (data, response) = try await URLSession.shared.data(for: request)
            let http = response as? HTTPURLResponse
            let status = http?.statusCode ?? 0
            if (200..<300).contains(status) { return data }
            let message = ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any])?["message"] as? String
            let limited = status == 429 || (status == 403 && (message?.localizedCaseInsensitiveContains("rate limit") ?? false))
            guard limited, attempt < 8 else {
                throw GitHubError(status: status, message: message ?? HTTPURLResponse.localizedString(forStatusCode: status))
            }
            var wait = 60
            if let after = http?.value(forHTTPHeaderField: "Retry-After").flatMap(Int.init) {
                wait = after
            } else if http?.value(forHTTPHeaderField: "X-RateLimit-Remaining") == "0",
                      let reset = http?.value(forHTTPHeaderField: "X-RateLimit-Reset").flatMap(TimeInterval.init) {
                wait = Int(reset - Date().timeIntervalSince1970) + 1
            }
            wait = min(max(wait, 5), 900)
            onRateLimit?(wait)
            try await Task.sleep(nanoseconds: UInt64(wait) * 1_000_000_000)
        }
        throw GitHubError(status: 0, message: "Unreachable")
    }

    // MARK: - Calls

    func login() async throws -> String {
        try await json("GET", "/user")["login"] as? String ?? "?"
    }

    /// A new repository of the signed-in user, started with a README so it
    /// has a branch to build on. Returns its owner and name.
    func createRepository(name: String, isPrivate: Bool, description: String) async throws -> (owner: String, name: String, branch: String) {
        let r = try await json("POST", "/user/repos", body: ["name": name, "private": isPrivate, "auto_init": true, "description": description])
        guard let owner = (r["owner"] as? [String: Any])?["login"] as? String, let repo = r["name"] as? String else {
            throw GitHubError(status: 0, message: "The repository couldn’t be created")
        }
        return (owner, repo, r["default_branch"] as? String ?? "main")
    }

    /// The repository's Website field (github.com › About), if set.
    func homepage() async throws -> String? {
        let r = try await json("GET", repoPath)
        return (r["homepage"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    }

    func headCommit(branch: String) async throws -> String {
        let ref = try await json("GET", "\(repoPath)/git/ref/heads/\(branch)")
        guard let sha = (ref["object"] as? [String: Any])?["sha"] as? String else {
            throw GitHubError(status: 0, message: "Branch \(branch) not found")
        }
        return sha
    }

    func commit(_ sha: String) async throws -> (tree: String, date: String?) {
        let c = try await json("GET", "\(repoPath)/git/commits/\(sha)")
        let tree = (c["tree"] as? [String: Any])?["sha"] as? String ?? ""
        return (tree, (c["committer"] as? [String: Any])?["date"] as? String)
    }

    struct ChangedFile {
        let path: String
        let status: String          // added, modified, removed, renamed, …
        let previousPath: String?
        let blob: String?
    }

    /// Every file in a tree (path → blob id), in one request.
    func files(inTree tree: String) async throws -> [String: String] {
        let t = try await json("GET", "\(repoPath)/git/trees/\(tree)?recursive=1")
        if t["truncated"] as? Bool == true {
            throw GitHubError(status: 0, message: "The repository is too large to list in one go")
        }
        var out: [String: String] = [:]
        for entry in t["tree"] as? [[String: Any]] ?? [] where entry["type"] as? String == "blob" {
            if let path = entry["path"] as? String, let sha = entry["sha"] as? String { out[path] = sha }
        }
        return out
    }

    func blobData(_ sha: String) async throws -> Data {
        try await raw("GET", "\(repoPath)/git/blobs/\(sha)", accept: "application/vnd.github.raw+json")
    }

    func createBlob(_ data: Data) async throws -> String {
        let r = try await json("POST", "\(repoPath)/git/blobs", body: ["content": data.base64EncodedString(), "encoding": "base64"])
        return r["sha"] as? String ?? ""
    }

    /// `entries`: path → blob sha, or nil to delete the path. `.command`
    /// files keep their executable bit.
    func createTree(base: String, entries: [String: String?]) async throws -> String {
        let tree: [[String: Any]] = entries.sorted { $0.key < $1.key }.map { path, sha in
            ["path": path, "mode": path.hasSuffix(".command") ? "100755" : "100644", "type": "blob", "sha": sha.map { $0 as Any } ?? NSNull()]
        }
        let r = try await json("POST", "\(repoPath)/git/trees", body: ["base_tree": base, "tree": tree])
        return r["sha"] as? String ?? ""
    }

    func createCommit(message: String, tree: String, parent: String) async throws -> (sha: String, date: String?) {
        let r = try await json("POST", "\(repoPath)/git/commits", body: ["message": message, "tree": tree, "parents": [parent]])
        return (r["sha"] as? String ?? "", (r["committer"] as? [String: Any])?["date"] as? String)
    }

    /// Fast-forward only; a 422 means the branch moved meanwhile.
    func updateBranch(_ branch: String, to sha: String) async throws {
        _ = try await json("PATCH", "\(repoPath)/git/refs/heads/\(branch)", body: ["sha": sha, "force": false])
    }

    enum DeployState { case none, pending, success(String?), failure(String?) }

    /// Vercel's result for a commit, from its commit status or check run.
    func vercelState(for sha: String) async throws -> DeployState {
        let status = try await json("GET", "\(repoPath)/commits/\(sha)/status")
        if let s = (status["statuses"] as? [[String: Any]] ?? []).first(where: {
            ($0["context"] as? String ?? "").localizedCaseInsensitiveContains("vercel")
        }) {
            let url = s["target_url"] as? String
            switch s["state"] as? String {
            case "success": return .success(url)
            case "failure", "error": return .failure(url)
            default: return .pending
            }
        }
        let checks = try await json("GET", "\(repoPath)/commits/\(sha)/check-runs")
        if let run = (checks["check_runs"] as? [[String: Any]] ?? []).first(where: {
            (($0["app"] as? [String: Any])?["slug"] as? String ?? "").localizedCaseInsensitiveContains("vercel")
        }) {
            let url = run["details_url"] as? String
            guard run["status"] as? String == "completed" else { return .pending }
            return run["conclusion"] as? String == "success" ? .success(url) : .failure(url)
        }
        return .none
    }
}
