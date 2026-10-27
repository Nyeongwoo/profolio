import Foundation

/// File ▸ New Site…: a new portfolio from the starter site in the app
/// (StarterSite.zip, built by `node scripts/build-starter.js`):
///
/// 1. unpack it and put the owner's name in;
/// 2. make a GitHub repository for it and commit the site there;
/// 3. build its .portfolio package (content, the editor, a base index of
///    that commit), ready to open.
///
/// Vercel is connected afterwards in the browser (it needs a Vercel sign-in).
struct SiteCreator {
    struct Options {
        var siteName: String
        var ownerName: String
        var repoName: String
        var isPrivate: Bool
        /// The folder the package goes in (e.g. iCloud Drive/<repo>).
        var folder: URL
        /// A site type from the starter's types.json (nil or portfolio: as built).
        var siteType: SiteType? = nil
        /// A layout preset from the starter's presets.json (nil: as built).
        var preset: Preset? = nil
        /// Parts the site starts with (siteConfig.structure).
        var originals = false
        var blog = false
        var projectIcons = true
    }

    /// A starting layout: settings merged into the starter's files, key by key.
    struct Preset: Identifiable, Equatable {
        let id: String
        let name: String
        let description: String
        let columns: Int
        let ratio: Double
        let featured: Bool
        let files: [(String, JSONValue)]

        static func == (a: Preset, b: Preset) -> Bool { a.id == b.id }
    }

    /// What kind of site a new one starts as (types.json): files it removes,
    /// writes and merges into the starter.
    struct SiteType: Identifiable, Equatable {
        let id: String
        let name: String
        let description: String
        let remove: [String]
        let write: [(String, JSONValue)]
        let merge: [(String, JSONValue)]

        static func == (a: SiteType, b: SiteType) -> Bool { a.id == b.id }
    }

    static func types() -> [SiteType] {
        (JSONValue.parse(starterFile("types.json") ?? Data())?.array ?? []).compactMap { v in
            guard let id = v["id"]?.string, let name = v["name"]?.string else { return nil }
            func pairs(_ key: String) -> [(String, JSONValue)] { if case .object(let p)? = v[key] { return p }; return [] }
            return SiteType(id: id, name: name, description: v["description"]?.string ?? "",
                            remove: (v["remove"]?.array ?? []).compactMap(\.string), write: pairs("write"), merge: pairs("merge"))
        }
    }

    private static func starterFile(_ name: String) -> Data? {
        guard let zip = starterZip else { return nil }
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/unzip")
        p.arguments = ["-p", zip.path, name]
        let pipe = Pipe()
        p.standardOutput = pipe
        p.standardError = FileHandle.nullDevice
        guard (try? p.run()) != nil else { return nil }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        p.waitUntilExit()
        return p.terminationStatus == 0 ? data : nil
    }

    /// The presets in the app's starter site.
    static func presets() -> [Preset] {
        guard let zip = starterZip else { return [] }
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/unzip")
        p.arguments = ["-p", zip.path, "presets.json"]
        let pipe = Pipe()
        p.standardOutput = pipe
        p.standardError = FileHandle.nullDevice
        guard (try? p.run()) != nil else { return [] }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        p.waitUntilExit()
        return (JSONValue.parse(data)?.array ?? []).compactMap { v in
            guard let id = v["id"]?.string, let name = v["name"]?.string, case .object(let files)? = v["files"] else { return nil }
            return Preset(id: id, name: name, description: v["description"]?.string ?? "",
                          columns: v["preview"]?["columns"]?.int ?? 3,
                          ratio: v["preview"]?["ratio"]?.string.flatMap(Double.init) ?? 1.33,
                          featured: v["preview"]?["featured"]?.bool ?? false, files: files)
        }
    }

    struct Result {
        let package: URL
        let owner: String
        let repo: String
    }

    let token: String
    let progress: (String) -> Void

    static var starterZip: URL? {
        #if DEBUG
        if let path = ProcessInfo.processInfo.environment["SITEEDITOR_STARTER_ZIP"] { return URL(fileURLWithPath: path) }
        #endif
        return Bundle.main.url(forResource: "StarterSite", withExtension: "zip")
    }

    /// The package's managed paths (docs/siteproj-format.md).
    static let include = ["src/data/*.json", "src/i18n/*.json", "public/**"]
    static let exclude = ["**/backups/**", "**/.DS_Store"]

    func create(_ o: Options) async throws -> Result {
        guard let zip = Self.starterZip else { throw PublishError("This copy of Profolio has no starter site.") }
        // New sites are .profolio; .portfolio packages (made before 2.0) open the same way.
        let package = o.folder.appendingPathComponent("\(o.repoName).profolio")
        guard !FileManager.default.fileExists(atPath: package.path) else {
            throw PublishError("\(package.lastPathComponent) already exists in that folder.")
        }

        // 1. Unpack and personalize.
        progress("Preparing the starter site…")
        let stage = FileManager.default.temporaryDirectory.appendingPathComponent("pofole-new-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: stage) }
        try Self.run("/usr/bin/ditto", ["-x", "-k", zip.path, stage.path])
        let site = stage.appendingPathComponent("site")
        if let type = o.siteType { try apply(type, to: site) }
        if let preset = o.preset { try apply(preset, to: site) }
        try personalize(site: site, o)

        // 2. Repository and first commit.
        progress("Creating the GitHub repository…")
        let account = GitHubClient(token: token)
        let made: (owner: String, name: String, branch: String)
        do {
            made = try await account.createRepository(name: o.repoName, isPrivate: o.isPrivate, description: "\(o.siteName) — made with Profolio")
        } catch let e as GitHubError where e.status == 403 || e.status == 404 {
            throw PublishError("This GitHub sign-in can’t create repositories. Sign in again with “Sign In with GitHub”, or use a token that may create repositories (classic token with the repo scope).")
        } catch let e as GitHubError where e.status == 422 {
            throw PublishError("A repository named “\(o.repoName)” already exists in your account.")
        }
        let repo = GitHubClient(token: token, owner: made.owner, repo: made.name)
        // A brand-new repository can take a moment before its branch answers.
        var head: String?
        for _ in 0..<10 {
            if let h = try? await repo.headCommit(branch: made.branch) { head = h; break }
            try await Task.sleep(nanoseconds: 1_000_000_000)
        }
        guard let parent = head else { throw PublishError("The new repository didn’t become ready. Try again in a minute.") }

        let files = Self.files(in: site)
        var entries: [String: String?] = [:]
        var blobs: [String: String] = [:]
        var uploaded = 0
        try await withThrowingTaskGroup(of: (String, String).self) { group in
            var queue = files.makeIterator()
            func next() -> Bool {
                guard let path = queue.next() else { return false }
                group.addTask {
                    let data = try Data(contentsOf: site.appendingPathComponent(path))
                    return (path, try await repo.createBlob(data))
                }
                return true
            }
            for _ in 0..<6 { _ = next() }
            while let (path, sha) = try await group.next() {
                entries[path] = sha
                blobs[path] = sha
                uploaded += 1
                if uploaded % 10 == 0 || uploaded == files.count { progress("Uploading the site… \(uploaded) of \(files.count)") }
                _ = next()
            }
        }
        progress("Committing…")
        let tree = try await repo.createTree(base: try await repo.commit(parent).tree, entries: entries)
        let commit = try await repo.createCommit(message: "Start \(o.siteName) with Profolio", tree: tree, parent: parent)
        try await repo.updateBranch(made.branch, to: commit.sha)

        // 3. The package.
        progress("Building the project…")
        let filter = PathFilter(SiteManifest.Paths(include: Self.include, exclude: Self.exclude))
        let fm = FileManager.default
        try fm.createDirectory(at: package.appendingPathComponent("backups"), withIntermediateDirectories: true)
        var base: [String: String] = [:]
        for path in files where filter.contains(path) {
            let dest = package.appendingPathComponent("site").appendingPathComponent(path)
            try fm.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
            try fm.copyItem(at: site.appendingPathComponent(path), to: dest)
            base[path] = blobs[path]
        }
        try fm.copyItem(at: stage.appendingPathComponent("editor"), to: package.appendingPathComponent("editor"))
        let starter = (try? JSONSerialization.jsonObject(with: Data(contentsOf: stage.appendingPathComponent("starter.json")))) as? [String: Any] ?? [:]
        let now = ISO8601DateFormatter.withMilliseconds.string(from: Date())
        try writeJSON([
            "format": SiteManifest.format,
            "formatVersion": SiteManifest.supportedVersion,
            "repository": ["owner": made.owner, "name": made.name, "branch": made.branch],
            "paths": ["include": Self.include, "exclude": Self.exclude],
            "editor": ["commit": starter["builtFrom"] as? String ?? "", "dirty": false, "builtAt": starter["builtAt"] as? String ?? now],
            "lastPublished": NSNull(),
            "importedAt": now,
        ] as [String: Any], to: package.appendingPathComponent("manifest.json"))
        try BaseIndex(commit: commit.sha, committedAt: commit.date, files: base).save(to: package)
        // The code it was made with, so Update Site can tell later edits apart.
        try SiteUpdater.Record(starter: starter["builtFrom"] as? String ?? "",
                               files: blobs.filter { !filter.contains($0.key) }).save(to: package)

        progress("Done")
        return Result(package: package, owner: made.owner, repo: made.name)
    }

    private func apply(_ type: SiteType, to site: URL) throws {
        let fm = FileManager.default
        for path in Self.files(in: site) where type.remove.contains(where: { path.hasPrefix($0) }) {
            try fm.removeItem(at: site.appendingPathComponent(path))
        }
        for (path, value) in type.write {
            let url = site.appendingPathComponent(path)
            try fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            if let text = value.string { try Data(text.utf8).write(to: url) }
            else { try Data((value.formatted + "\n").utf8).write(to: url) }
        }
        for (path, overrides) in type.merge {
            let url = site.appendingPathComponent(path)
            guard var doc = JSONValue.parse(try Data(contentsOf: url)), case .object(let pairs) = overrides else { continue }
            for (key, value) in pairs { doc.set(key, value) }
            try Data(doc.formatted.utf8).write(to: url)
        }
    }

    private func apply(_ preset: Preset, to site: URL) throws {
        for (path, overrides) in preset.files {
            let url = site.appendingPathComponent(path)
            guard var doc = JSONValue.parse(try Data(contentsOf: url)), case .object(let pairs) = overrides else { continue }
            for (key, value) in pairs { doc.set(key, value) }
            try Data(doc.formatted.utf8).write(to: url)
        }
    }

    /// The owner's name, and the site name as the page title.
    private func personalize(site: URL, _ o: Options) throws {
        let configURL = site.appendingPathComponent("src/data/siteConfig.json")
        if var config = JSONValue.parse(try Data(contentsOf: configURL)) {
            config.set("name", .string(o.ownerName))
            config.set(path: ["structure", "sections", "originals"], o.originals ? nil : .bool(false))
            config.set(path: ["structure", "sections", "blog"], o.blog ? nil : .bool(false))
            config.set(path: ["structure", "projectIcons"], o.projectIcons ? nil : .bool(false))
            try Data(config.formatted.utf8).write(to: configURL)
        }
        let indexURL = site.appendingPathComponent("index.html")
        if let html = try? String(contentsOf: indexURL, encoding: .utf8) {
            let escaped = o.siteName.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
            try html.replacingOccurrences(of: "<title>Portfolio</title>", with: "<title>\(escaped)</title>")
                .write(to: indexURL, atomically: true, encoding: .utf8)
        }
    }

    static func files(in root: URL) -> [String] {
        let base = root.resolvingSymlinksInPath().path + "/"
        var out: [String] = []
        guard let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.isRegularFileKey]) else { return out }
        for case let url as URL in walker where (try? url.resourceValues(forKeys: [.isRegularFileKey]))?.isRegularFile == true {
            let path = String(url.resolvingSymlinksInPath().path.dropFirst(base.count))
            if !path.hasSuffix(".DS_Store") { out.append(path) }
        }
        return out.sorted()
    }

    private static func run(_ tool: String, _ args: [String]) throws {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: tool)
        p.arguments = args
        try p.run()
        p.waitUntilExit()
        guard p.terminationStatus == 0 else { throw PublishError("\((tool as NSString).lastPathComponent) failed (\(p.terminationStatus))") }
    }

    /// Where a new site's package goes by default: iCloud Drive/<repo>.
    static func defaultFolder(_ repo: String) -> URL {
        let icloud = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Mobile Documents/com~apple~CloudDocs")
        let root = FileManager.default.fileExists(atPath: icloud.path) ? icloud : FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Documents")
        return root.appendingPathComponent(repo.isEmpty ? "Portfolio" : repo)
    }
}
