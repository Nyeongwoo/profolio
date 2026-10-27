import CryptoKit
import Foundation

/// Publishes a package's changes to GitHub as one commit; Vercel's Git
/// integration deploys it from there (docs/siteproj-format.md, "Publishing").
///
/// 1. Changes: blob ids of the files in site/ against base-index.json.
/// 2. If the branch moved since the base commit, bring the package up to
///    date with what changed on GitHub first. A JSON file changed on both
///    sides is merged value by value (JSONMerge); a value or other file
///    changed on both sides stops the publish with the conflicts, until
///    `resolutions` says which side wins.
/// 3. Blobs → tree → commit → fast-forward the branch.
/// 4. Record the new base, then follow Vercel's deploy of the commit.
///
/// Progress is reported in the editor's deploy-stream shape
/// (step / progress / log / done + ok), step keys as the editor knows them.
final class Publisher {
    struct Event {
        var step: String?
        var progress: Int?
        var log: String?
        var done = false
        var ok = true
        /// Values or files changed both here and on GitHub (with done, !ok).
        var conflicts: [JSONMerge.Conflict] = []
        /// Files in the package were rewritten (brought in or merged).
        var packageChanged = false

        var json: [String: Any] {
            var d: [String: Any] = [:]
            if let step { d["step"] = step }
            if let progress { d["progress"] = progress }
            if let log { d["log"] = log }
            if done { d["done"] = true; d["ok"] = ok }
            return d
        }
    }

    private let package: URL
    private let manifest: SiteManifest
    private let client: GitHubClient
    private let emit: (Event) -> Void
    private let filter: PathFilter
    /// Publish only these changed files (nil: all); the rest stay pending.
    private let only: Set<String>?
    private let note: String?
    /// Which side wins each conflict, by JSONMerge.Conflict.id.
    private let resolutions: [String: JSONMerge.Side]

    init(package: URL, manifest: SiteManifest, token: String, only: Set<String>? = nil, note: String? = nil,
         resolutions: [String: JSONMerge.Side] = [:], emit: @escaping (Event) -> Void) {
        self.resolutions = resolutions
        self.only = only
        self.note = note?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? note : nil
        self.package = package
        self.manifest = manifest
        self.client = GitHubClient(token: token, owner: manifest.repository.owner, repo: manifest.repository.name)
        self.emit = emit
        var lastNotice = Date.distantPast
        client.onRateLimit = { seconds in
            // Uploads run four at a time; one notice per wait is enough.
            guard Date().timeIntervalSince(lastNotice) > 30 else { return }
            lastNotice = Date()
            emit(Event(log: "GitHub asks to slow down — waiting \(seconds) s, then continuing…"))
        }
        self.filter = PathFilter(manifest.paths)
    }

    private func say(_ log: String? = nil, step: String? = nil, progress: Int? = nil) {
        emit(Event(step: step, progress: progress, log: log))
    }

    func run() async -> Bool {
        do {
            try await publish()
            return true
        } catch let error as ConflictError {
            emit(Event(log: "Changed both here and on GitHub since the last publish — choose which to keep.",
                       done: true, ok: false, conflicts: error.conflicts))
            return false
        } catch let error as GitHubError where error.status == 401 {
            emit(Event(log: "GitHub no longer accepts the saved sign-in (it was revoked or expired). Sign in again in the window that opened, then publish again.",
                       done: true, ok: false))
            Task { @MainActor in GitHubAccount.shared.tokenRejected() }
            return false
        } catch {
            emit(Event(log: "Error: \(error.localizedDescription)", done: true, ok: false))
            return false
        }
    }

    private var site: URL { package.appendingPathComponent("site") }
    private var branch: String { manifest.repository.branch }

    private func publish() async throws {
        say("Checking changes…", step: "git-add", progress: 5)
        var base = try BaseIndex.load(from: package)
        var local = try await Task.detached { try self.scan() }.value
        var changes = Changes(local: local, base: base.files)
        say(changes.summary, progress: 15)

        for attempt in 1...3 {
            say(step: "git-commit", progress: 20)
            let head = try await client.headCommit(branch: branch)

            if head != base.commit {
                let remote = try await remoteChanges(since: base, head: head)
                let incoming = try await reconcile(remote, mine: changes.paths, base: &base, local: &local)
                if !incoming.isEmpty {
                    try await pull(incoming, base: &base, local: &local)
                    say("Brought in \(incoming.count) change(s) made on GitHub ✓")
                    emit(Event(packageChanged: true))
                }
                base.commit = head
                base.committedAt = try await client.commit(head).date
                changes = Changes(local: local, base: base.files)
            }

            // Conflicts are checked against every local change (above); only
            // the chosen ones go out.
            changes = changes.restricted(to: only)
            if changes.isEmpty {
                try base.save(to: package)
                emit(Event(step: "vercel", progress: 100, log: "Nothing to publish — the site is up to date.", done: true))
                return
            }

            // Upload the new and changed files, a few at a time.
            var uploaded = 0
            try await withThrowingTaskGroup(of: Void.self) { group in
                var pending = changes.upload.makeIterator()
                func next() -> Bool {
                    guard let path = pending.next() else { return false }
                    group.addTask {
                        let data = try Data(contentsOf: self.site.appendingPathComponent(path), options: .alwaysMapped)
                        _ = try await self.client.createBlob(data)
                    }
                    return true
                }
                for _ in 0..<4 { _ = next() }
                while try await group.next() != nil {
                    uploaded += 1
                    say(progress: 20 + 35 * uploaded / max(1, changes.upload.count))
                    _ = next()
                }
            }
            say("Uploaded \(changes.upload.count) file(s) ✓")

            let tree = try await client.commit(head).tree
            var entries: [String: String?] = [:]
            changes.upload.forEach { entries[$0] = local[$0] }
            changes.delete.forEach { entries[$0] = .some(nil) }
            let newTree = try await client.createTree(base: tree, entries: entries)
            let commit = try await client.createCommit(message: Self.commitMessage(note: note), tree: newTree, parent: head)
            say("git commit ✓ \(commit.sha.prefix(7))", step: "git-push", progress: 60)

            do {
                try await client.updateBranch(branch, to: commit.sha)
            } catch let error as GitHubError where error.status == 422 && attempt < 3 {
                say("GitHub changed meanwhile — trying again…")
                continue
            }
            say("Pushed to \(branch) ✓", progress: 65)

            changes.upload.forEach { base.files[$0] = local[$0] }
            changes.delete.forEach { base.files.removeValue(forKey: $0) }
            base.commit = commit.sha
            base.committedAt = commit.date
            try base.save(to: package)
            try Self.setLastPublished(Date(), in: package)

            try await followVercel(commit.sha)
            return
        }
    }

    /// What changed on GitHub since the base: the managed files at `head`
    /// against base-index.json. (The compare API stops at 300 files; this
    /// has no limit.) A rename shows as a removal and an addition.
    private func remoteChanges(since base: BaseIndex, head: String) async throws -> [GitHubClient.ChangedFile] {
        let tree = try await client.commit(head).tree
        let now = try await client.files(inTree: tree).filter { filter.contains($0.key) }
        var out: [GitHubClient.ChangedFile] = []
        for (path, blob) in now where base.files[path] != blob {
            out.append(.init(path: path, status: base.files[path] == nil ? "added" : "modified", previousPath: nil, blob: blob))
        }
        for path in base.files.keys where now[path] == nil {
            out.append(.init(path: path, status: "removed", previousPath: nil, blob: nil))
        }
        return out.sorted { $0.path < $1.path }
    }

    /// Sorts out GitHub's changes to files also changed here: JSON files are
    /// merged in place (their base moves to GitHub's version, so what's
    /// left to publish is this side's part); whole files go by
    /// `resolutions`. Returns the changes to bring in as they are; throws
    /// ConflictError with whatever is left undecided.
    private func reconcile(_ remote: [GitHubClient.ChangedFile], mine: Set<String>,
                           base: inout BaseIndex, local: inout [String: String]) async throws -> [GitHubClient.ChangedFile] {
        var incoming: [GitHubClient.ChangedFile] = []
        var undecided: [JSONMerge.Conflict] = []
        var identical = 0
        defer { if identical > 0 { say("\(identical) file(s) already the same on GitHub ✓") } }
        for file in remote {
            guard ([file.path] + [file.previousPath].compactMap { $0 }).contains(where: mine.contains) else {
                incoming.append(file)
                continue
            }
            // The same change on both sides (say, pushed from a clone of
            // the repository): nothing to bring in or to publish.
            if file.previousPath == nil,
               file.status == "removed" ? local[file.path] == nil : (file.blob != nil && local[file.path] == file.blob) {
                if file.status == "removed" { base.files.removeValue(forKey: file.path) } else { base.files[file.path] = file.blob }
                identical += 1
                continue
            }
            if file.status == "modified", file.path.hasSuffix(".json"), let blob = file.blob,
               let baseBlob = base.files[file.path], local[file.path] != nil {
                let url = site.appendingPathComponent(file.path)
                let mineData = try Data(contentsOf: url)
                if let b = JSONValue.parse(try await client.blobData(baseBlob)),
                   let t = JSONValue.parse(try await client.blobData(blob)),
                   let m = JSONValue.parse(mineData) {
                    let result = JSONMerge.merge(path: file.path, base: b, mine: m, theirs: t, resolutions: resolutions)
                    if !result.conflicts.isEmpty {
                        undecided += result.conflicts
                        continue
                    }
                    if result.value != m {
                        var text = (result.value ?? .null).formatted
                        if mineData.last == 0x0A { text += "\n" }
                        BackupStore(package: package).snapshot(file.path)
                        try Data(text.utf8).write(to: url, options: .atomic)
                        local[file.path] = try Self.blobID(of: url)
                        emit(Event(packageChanged: true))
                    }
                    base.files[file.path] = blob
                    say("Merged the changes made on GitHub into \(file.path) ✓")
                    continue
                }
            }
            switch resolutions[JSONMerge.Conflict.id(file.path, JSONMerge.wholeFile)] {
            case .theirs?:
                incoming.append(file)
            case .mine?:
                // GitHub's version becomes the base, so this side's file
                // (or its removal) goes out on top of it.
                if let previous = file.previousPath { base.files.removeValue(forKey: previous) }
                if file.status == "removed" { base.files.removeValue(forKey: file.path) } else if let blob = file.blob { base.files[file.path] = blob }
            case nil:
                undecided.append(JSONMerge.Conflict(path: file.path, key: JSONMerge.wholeFile,
                                                    mine: local[file.path] == nil ? nil : "The file on this Mac",
                                                    theirs: file.status == "removed" ? nil : "The file on GitHub"))
            }
        }
        if !undecided.isEmpty { throw ConflictError(conflicts: undecided) }
        return incoming
    }

    /// Applies changes made on GitHub (none of them to files changed here).
    private func pull(_ remote: [GitHubClient.ChangedFile], base: inout BaseIndex, local: inout [String: String]) async throws {
        for file in remote {
            if let previous = file.previousPath, filter.contains(previous) {
                try? FileManager.default.removeItem(at: site.appendingPathComponent(previous))
                base.files.removeValue(forKey: previous)
                local.removeValue(forKey: previous)
            }
            guard filter.contains(file.path) else { continue }
            let url = site.appendingPathComponent(file.path)
            if file.status == "removed" {
                try? FileManager.default.removeItem(at: url)
                base.files.removeValue(forKey: file.path)
                local.removeValue(forKey: file.path)
            } else if let blob = file.blob {
                let data = try await client.blobData(blob)
                try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
                try data.write(to: url, options: .atomic)
                base.files[file.path] = blob
                local[file.path] = blob
            }
        }
    }

    private func followVercel(_ sha: String) async throws {
        say("Waiting for Vercel…", step: "vercel", progress: 70)
        let start = Date()
        var seen = false
        while true {
            try await Task.sleep(nanoseconds: 5_000_000_000)
            let elapsed = Int(Date().timeIntervalSince(start))
            let state: GitHubClient.DeployState
            do {
                state = try await client.vercelState(for: sha)
            } catch {
                emit(Event(progress: 100, log: "Published. Can't read Vercel's status (\(error.localizedDescription)) — check the Vercel dashboard.", done: true))
                return
            }
            switch state {
            case .success(let url):
                emit(Event(progress: 100, log: "vercel deploy ✓ \(url ?? "")", done: true))
                return
            case .failure(let url):
                throw PublishError("Vercel deploy failed \(url ?? "")")
            case .pending:
                if !seen { say("Vercel is building…"); seen = true }
                say(progress: min(95, 70 + elapsed / 4))
            case .none where !seen && elapsed > 90:
                emit(Event(progress: 100, log: "Published, but Vercel hasn't reported on it — check the Vercel dashboard.", done: true))
                return
            case .none:
                break
            }
            if elapsed > 600 {
                emit(Event(progress: 100, log: "Published. Vercel is still deploying after 10 minutes — check the Vercel dashboard.", done: true))
                return
            }
        }
    }

    // MARK: - Local state

    /// What would be published now (no network; for the toolbar's count).
    static func localChanges(package: URL, manifest: SiteManifest) throws -> Changes {
        let publisher = Publisher(package: package, manifest: manifest, token: "", emit: { _ in })
        return Changes(local: try publisher.scan(), base: try BaseIndex.load(from: package).files)
    }

    /// Blob id of every managed file in site/.
    func scan() throws -> [String: String] {
        let root = site.resolvingSymlinksInPath().path + "/"
        var out: [String: String] = [:]
        guard let walker = FileManager.default.enumerator(at: site, includingPropertiesForKeys: [.isRegularFileKey]) else { return out }
        for case let url as URL in walker {
            guard (try? url.resourceValues(forKeys: [.isRegularFileKey]))?.isRegularFile == true else { continue }
            let path = String(url.resolvingSymlinksInPath().path.dropFirst(root.count))
            guard filter.contains(path) else { continue }
            out[path] = try Self.blobID(of: url)
        }
        return out
    }

    /// What git calls the file: sha1("blob <length>\0" + contents).
    static func blobID(of url: URL) throws -> String {
        let data = try Data(contentsOf: url, options: .alwaysMapped)
        var sha = Insecure.SHA1()
        sha.update(data: Data("blob \(data.count)\0".utf8))
        sha.update(data: data)
        return sha.finalize().map { String(format: "%02x", $0) }.joined()
    }

    /// Same style as the web editor's commits.
    private static func commitMessage(note: String?) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ko_KR")
        f.timeZone = TimeZone(identifier: "Asia/Seoul")
        f.dateFormat = "yyyy. M. d. a h:mm:ss"
        let stamp = f.string(from: Date())
        if let note { return "content: \(note)\n\nvia Profolio (\(stamp))" }
        return "content: update via Profolio (\(stamp))"
    }

    private static func setLastPublished(_ date: Date, in package: URL) throws {
        let url = package.appendingPathComponent("manifest.json")
        var manifest = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any] ?? [:]
        manifest["lastPublished"] = ISO8601DateFormatter.withMilliseconds.string(from: date)
        try writeJSON(manifest, to: url)
    }
}

struct ConflictError: LocalizedError {
    let conflicts: [JSONMerge.Conflict]
    var errorDescription: String? { "Changed both here and on GitHub: " + Set(conflicts.map(\.path)).sorted().joined(separator: ", ") }
}

struct PublishError: LocalizedError {
    let errorDescription: String?
    init(_ message: String) { errorDescription = message }
}

/// base-index.json: the managed files' blob ids at the last synced commit.
struct BaseIndex {
    var commit: String
    var committedAt: String?
    var files: [String: String]

    static func load(from package: URL) throws -> BaseIndex {
        let data = try Data(contentsOf: package.appendingPathComponent("base-index.json"))
        let d = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
        guard let commit = d["commit"] as? String else { throw PublishError("base-index.json is damaged") }
        return BaseIndex(commit: commit, committedAt: d["committedAt"] as? String, files: d["files"] as? [String: String] ?? [:])
    }

    func save(to package: URL) throws {
        var d: [String: Any] = ["commit": commit, "files": files]
        if let committedAt { d["committedAt"] = committedAt }
        try writeJSON(d, to: package.appendingPathComponent("base-index.json"))
    }
}

/// Local changes against the base.
struct Changes {
    let upload: [String]   // new or modified
    let delete: [String]

    init(local: [String: String], base: [String: String]) {
        upload = local.filter { base[$0.key] != $0.value }.keys.sorted()
        delete = base.keys.filter { local[$0] == nil }.sorted()
    }

    private init(upload: [String], delete: [String]) {
        self.upload = upload
        self.delete = delete
    }

    func restricted(to only: Set<String>?) -> Changes {
        guard let only else { return self }
        return Changes(upload: upload.filter(only.contains), delete: delete.filter(only.contains))
    }

    var isEmpty: Bool { upload.isEmpty && delete.isEmpty }
    var paths: Set<String> { Set(upload + delete) }

    var summary: String {
        if isEmpty { return "No changes in this project." }
        let list = (upload.map { "  + \($0)" } + delete.map { "  − \($0)" })
        let shown = list.prefix(15).joined(separator: "\n")
        let more = list.count > 15 ? "\n  … and \(list.count - 15) more" : ""
        return "\(upload.count) changed, \(delete.count) deleted:\n\(shown)\(more)"
    }
}

/// The manifest's managed-path globs (`**` crosses folders, `*` doesn't).
struct PathFilter {
    private let include: [NSRegularExpression]
    private let exclude: [NSRegularExpression]

    init(_ paths: SiteManifest.Paths) {
        // Packages made before languages could be added list only the
        // Korean and Chinese dictionaries; any language's counts now.
        let globs = paths.include.contains("src/i18n/ko.json") ? paths.include + ["src/i18n/*.json"] : paths.include
        include = globs.map(Self.regex)
        exclude = paths.exclude.map(Self.regex)
    }

    func contains(_ path: String) -> Bool {
        let range = NSRange(path.startIndex..., in: path)
        let hit = { (re: NSRegularExpression) in re.firstMatch(in: path, range: range) != nil }
        return include.contains(where: hit) && !exclude.contains(where: hit)
    }

    private static func regex(_ glob: String) -> NSRegularExpression {
        let pattern = glob.components(separatedBy: "**").map {
            $0.components(separatedBy: "*").map(NSRegularExpression.escapedPattern(for:)).joined(separator: "[^/]*")
        }.joined(separator: ".*")
        return try! NSRegularExpression(pattern: "^\(pattern)$")
    }
}

func writeJSON(_ object: Any, to url: URL) throws {
    var data = try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
    data.append(0x0A)
    try data.write(to: url, options: .atomic)
}

extension ISO8601DateFormatter {
    static let withMilliseconds: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}
