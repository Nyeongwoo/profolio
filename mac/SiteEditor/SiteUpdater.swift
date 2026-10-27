import Foundation

/// File ▸ Update Site…: brings a site's code up to the starter site in this
/// copy of Profolio (StarterSite.zip) — new site settings, fixes, the agent
/// guide — without touching its content. One commit to the site's
/// repository, then the package's editor (the preview's build) is replaced.
///
/// What counts as code: every starter file outside the package's managed
/// paths (src/data, i18n, public/). The package remembers the code it last
/// installed (site-code.json: file → blob), so a file changed on GitHub
/// since then (by hand or by a coding agent) isn't overwritten unasked.
struct SiteUpdater {
    /// The code a site has, by path → git blob id, and the starter it came from.
    struct Record {
        var starter: String
        var files: [String: String]

        static let fileName = "site-code.json"

        static func load(from package: URL) -> Record? {
            guard let v = JSONValue.parse((try? Data(contentsOf: package.appendingPathComponent(fileName))) ?? Data()),
                  case .object(let pairs)? = v["files"] else { return nil }
            var files: [String: String] = [:]
            for (path, blob) in pairs { if let s = blob.string { files[path] = s } }
            return Record(starter: v["starter"]?.string ?? "", files: files)
        }

        func save(to package: URL) throws {
            try writeJSON(["starter": starter, "files": files] as [String: Any], to: package.appendingPathComponent(Self.fileName))
        }
    }

    /// What an update would do.
    struct Plan {
        let head: String
        let tree: String
        let starter: String
        /// Files to write (new or changed in the starter, unchanged on the site).
        var upload: [String]
        /// Files the starter dropped, unchanged on the site.
        var delete: [String]
        /// Changed both in the starter and on the site: the person decides.
        var conflicts: [String]
        /// Replaced without a record to compare against (sites made before
        /// Profolio kept one); most were never edited by hand.
        var unverified: Int
        /// Content files the new code needs that the site doesn't have yet.
        var seeds: [String] = []
        /// Files older starters put in by mistake, untouched since: removed.
        var strays: [String] = []
        /// Path → blob of the starter's version of every code file.
        let starterBlobs: [String: String]
        /// Path → blob on GitHub now.
        let current: [String: String]
        /// The unpacked starter (deleted when the updater goes away).
        let stage: URL

        var isEmpty: Bool { upload.isEmpty && delete.isEmpty && conflicts.isEmpty && seeds.isEmpty && strays.isEmpty }
    }

    let package: URL
    let manifest: SiteManifest
    let token: String

    /// Content files newer code reads, with what a site starts with when it
    /// has none (the site's build would fail without them).
    static let seedContent: [String: String] = ["src/data/pages.json": "[]\n"]

    /// Files the 1.6.0 and 1.7.0 starters shipped by mistake (StrayStarterFiles.json:
    /// path → blob ids). Only a site's exact copy counts: one it changed stays.
    static func strays(in current: [String: String]) -> [String] {
        guard let url = Bundle.main.url(forResource: "StrayStarterFiles", withExtension: "json"),
              let v = JSONValue.parse((try? Data(contentsOf: url)) ?? Data()), case .object(let files)? = v["files"] else { return [] }
        return files.compactMap { path, blobs in
            guard let now = current[path], (blobs.array ?? []).contains(.string(now)) else { return nil }
            return path
        }.sorted()
    }

    private var client: GitHubClient { GitHubClient(token: token, owner: manifest.repository.owner, repo: manifest.repository.name) }

    /// The starter in this copy of Profolio: the commit it was built from.
    /// Read once; views ask for it while drawing (Site Structure's notice).
    static let starterCommit: String? = {
        guard let zip = SiteCreator.starterZip else { return nil }
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/unzip")
        p.arguments = ["-p", zip.path, "starter.json"]
        let pipe = Pipe()
        p.standardOutput = pipe
        p.standardError = FileHandle.nullDevice
        guard (try? p.run()) != nil else { return nil }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        // Not waitUntilExit: it runs the run loop, and a SwiftUI update
        // re-entered from there crashed the app.
        while p.isRunning { usleep(1_000) }
        return JSONValue.parse(data)?["builtFrom"]?.string
    }()

    /// The starter commit a package's editor (and so its code) came from.
    static func installedCommit(in package: URL) -> String? {
        JSONValue.parse((try? Data(contentsOf: package.appendingPathComponent("manifest.json"))) ?? Data())?["editor"]?["commit"]?.string
    }

    func check() async throws -> Plan {
        guard let zip = SiteCreator.starterZip, let starter = Self.starterCommit else {
            throw PublishError("This copy of Profolio has no starter site to update from.")
        }
        let branch = manifest.repository.branch
        let head = try await client.headCommit(branch: branch)
        let tree = try await client.commit(head).tree
        let current = try await client.files(inTree: tree)
        if current["mac/SiteEditor.xcodeproj/project.pbxproj"] != nil {
            throw PublishError("This is Profolio’s own repository: its code is the starter. Update this site with scripts/update-profolio.sh instead.")
        }

        let stage = FileManager.default.temporaryDirectory.appendingPathComponent("profolio-update-\(UUID().uuidString)")
        try Self.run("/usr/bin/ditto", ["-x", "-k", zip.path, stage.path])
        let site = stage.appendingPathComponent("site")
        let filter = PathFilter(manifest.paths)
        let code = SiteCreator.files(in: site).filter { !filter.contains($0) }

        // The page title is the site's own (New Site put it in index.html).
        if code.contains("index.html"), let blob = current["index.html"],
           let html = String(data: try await client.blobData(blob), encoding: .utf8),
           let title = html.range(of: #"<title>[^<]*</title>"#, options: .regularExpression).map({ String(html[$0]) }) {
            let url = site.appendingPathComponent("index.html")
            if let starterHTML = try? String(contentsOf: url, encoding: .utf8) {
                try starterHTML.replacingOccurrences(of: #"<title>[^<]*</title>"#, with: title, options: .regularExpression)
                    .write(to: url, atomically: true, encoding: .utf8)
            }
        }

        var starterBlobs: [String: String] = [:]
        for path in code { starterBlobs[path] = try Publisher.blobID(of: site.appendingPathComponent(path)) }

        let decided = Self.decide(code: code, starterBlobs: starterBlobs, current: current, record: Record.load(from: package))
        var plan = Plan(head: head, tree: tree, starter: starter, upload: decided.upload, delete: decided.delete, conflicts: decided.conflicts,
                        unverified: decided.unverified, starterBlobs: starterBlobs, current: current, stage: stage)
        plan.seeds = Self.seedContent.keys.filter { current[$0] == nil }.sorted()
        plan.strays = Self.strays(in: current)
        return plan
    }

    /// Sorts each code file: take the starter's (upload), drop it (delete),
    /// or ask (conflicts). `record` is the code the site had after its last
    /// update (nil for sites made before Profolio kept one).
    static func decide(code: [String], starterBlobs: [String: String], current: [String: String], record: Record?)
        -> (upload: [String], delete: [String], conflicts: [String], unverified: Int) {
        var upload: [String] = [], delete: [String] = [], conflicts: [String] = [], unverified = 0
        for path in code {
            guard let new = starterBlobs[path] else { continue }
            let now = current[path], base = record?.files[path]
            if now == new { continue }
            if let base {
                if now == base { upload.append(path) }          // untouched on the site: take the new one
                else if new == base { continue }                // only changed on the site: keep it
                else { conflicts.append(path) }                 // changed on both sides, or deleted on the site
            } else if now == nil {
                upload.append(path)                             // new in the starter
            } else if record != nil {
                conflicts.append(path)                          // the site has its own file there
            } else {
                upload.append(path)                             // no record to compare with
                unverified += 1
            }
        }
        for (path, base) in record?.files ?? [:] where starterBlobs[path] == nil && current[path] == base {
            delete.append(path)                                 // dropped from the starter, untouched on the site
        }
        return (upload.sorted(), delete.sorted(), conflicts.sorted(), unverified)
    }

    /// Commits the update (keeping the site's version of `keepMine`), then
    /// replaces the package's editor and records the code it now has.
    func apply(_ plan: Plan, keepMine: Set<String>, progress: @escaping (String) -> Void) async throws -> String {
        let site = plan.stage.appendingPathComponent("site")
        let write = plan.upload + plan.conflicts.filter { !keepMine.contains($0) }
        let repo = client

        var entries: [String: String?] = [:]
        var done = 0
        try await withThrowingTaskGroup(of: (String, String).self) { group in
            var queue = write.makeIterator()
            func next() -> Bool {
                guard let path = queue.next() else { return false }
                group.addTask { (path, try await repo.createBlob(try Data(contentsOf: site.appendingPathComponent(path)))) }
                return true
            }
            for _ in 0..<4 { _ = next() }
            while let (path, sha) = try await group.next() {
                entries[path] = sha
                done += 1
                progress("Uploading the new code… \(done) of \(write.count)")
                _ = next()
            }
        }
        plan.delete.forEach { entries[$0] = .some(nil) }
        plan.strays.forEach { entries[$0] = .some(nil) }
        var seeded: [String: String] = [:]
        for path in plan.seeds {
            let sha = try await repo.createBlob(Data(Self.seedContent[path]!.utf8))
            entries[path] = sha
            seeded[path] = sha
        }

        var commitSHA = plan.head
        if !entries.isEmpty {
            progress("Committing…")
            let tree = try await repo.createTree(base: plan.tree, entries: entries)
            let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
            let commit = try await repo.createCommit(message: "Update the site's code with Profolio \(version)", tree: tree, parent: plan.head)
            do {
                try await repo.updateBranch(manifest.repository.branch, to: commit.sha)
            } catch let e as GitHubError where e.status == 422 {
                throw PublishError("The site changed on GitHub meanwhile. Run Update Site again.")
            }
            commitSHA = commit.sha
        }

        // The package gets the seeded files too, already published, and
        // loses the strays.
        if !seeded.isEmpty || !plan.strays.isEmpty {
            var base = try BaseIndex.load(from: package)
            for path in plan.strays {
                try? FileManager.default.removeItem(at: package.appendingPathComponent("site").appendingPathComponent(path))
                base.files.removeValue(forKey: path)
            }
            for (path, sha) in seeded {
                let url = package.appendingPathComponent("site").appendingPathComponent(path)
                if !FileManager.default.fileExists(atPath: url.path) {
                    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
                    try Data(Self.seedContent[path]!.utf8).write(to: url)
                }
                base.files[path] = sha
            }
            try base.save(to: package)
        }

        progress("Updating the editor…")
        let fm = FileManager.default
        let editor = package.appendingPathComponent("editor")
        let old = package.appendingPathComponent("editor.old-\(UUID().uuidString)")
        if fm.fileExists(atPath: editor.path) { try fm.moveItem(at: editor, to: old) }
        do {
            try fm.copyItem(at: plan.stage.appendingPathComponent("editor"), to: editor)
            try? fm.removeItem(at: old)
        } catch {
            if fm.fileExists(atPath: old.path) { try? fm.removeItem(at: editor); try? fm.moveItem(at: old, to: editor) }
            throw error
        }
        let manifestURL = package.appendingPathComponent("manifest.json")
        if var m = JSONValue.parse(try Data(contentsOf: manifestURL)) {
            let builtAt = JSONValue.parse((try? Data(contentsOf: plan.stage.appendingPathComponent("starter.json"))) ?? Data())?["builtAt"]?.string ?? ""
            m.set("editor", .object([("commit", .string(plan.starter)), ("dirty", .bool(false)), ("builtAt", .string(builtAt))]))
            try Data((m.formatted + "\n").utf8).write(to: manifestURL, options: .atomic)
        }

        var files: [String: String] = [:]
        for (path, blob) in plan.starterBlobs {
            if write.contains(path) { files[path] = blob } else if let now = plan.current[path] { files[path] = now }
        }
        try Record(starter: plan.starter, files: files).save(to: package)
        return commitSHA
    }

    static func discard(_ plan: Plan) {
        try? FileManager.default.removeItem(at: plan.stage)
    }

    private static func run(_ tool: String, _ args: [String]) throws {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: tool)
        p.arguments = args
        try p.run()
        p.waitUntilExit()
        guard p.terminationStatus == 0 else { throw PublishError("\((tool as NSString).lastPathComponent) failed (\(p.terminationStatus))") }
    }
}
