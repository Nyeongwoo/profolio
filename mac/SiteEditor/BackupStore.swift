import Foundation

/// Snapshots of a package's content documents, in its backups/ folder (which
/// syncs with the package through iCloud Drive). See docs/siteproj-format.md.
///
/// Two layouts share the folder:
/// - `backups/<dir>/<stamp>.json` — snapshots of `<dir>/info.json`, written
///   by the editor server itself (project and original pages).
/// - `backups/<path>.json/<stamp>.json` — snapshots of any other content
///   document, written by the app just before the editor overwrites it.
struct BackupStore {
    static let keep = 20

    let package: URL

    struct Document: Identifiable, Hashable {
        let path: String        // repo path, e.g. src/data/home.json
        let folder: URL         // where its snapshots live
        let latest: Date
        var id: String { path }
    }

    struct Snapshot: Identifiable, Hashable {
        let url: URL
        let date: Date
        let size: Int
        var id: URL { url }
    }

    private var backups: URL { package.appendingPathComponent("backups") }
    private var site: URL { package.appendingPathComponent("site") }

    // MARK: - Taking snapshots

    /// Server-side backups already cover these.
    private static let serverBacked = try! NSRegularExpression(pattern: #"^public/assets/(projects|originals)/[^/]+/[^/]+/info\.json$"#)

    /// Before content JSON at `rel` (package-relative, under site/) is
    /// replaced with `newData`: keep the current version as a snapshot.
    func snapshotBeforeWrite(_ rel: String, newData: Data) {
        guard rel.hasPrefix("site/"), rel.hasSuffix(".json") else { return }
        let path = String(rel.dropFirst("site/".count))
        let range = NSRange(path.startIndex..., in: path)
        guard Self.serverBacked.firstMatch(in: path, range: range) == nil else { return }
        let current = site.appendingPathComponent(path)
        guard let old = try? Data(contentsOf: current), old != newData else { return }
        save(old, into: backups.appendingPathComponent(path))
    }

    /// Keeps the current version of `path` (repo-relative, under site/) as
    /// a snapshot, in whichever layout its backups use.
    func snapshot(_ path: String) {
        guard let data = try? Data(contentsOf: site.appendingPathComponent(path)) else { return }
        let range = NSRange(path.startIndex..., in: path)
        let folder = Self.serverBacked.firstMatch(in: path, range: range) != nil
            ? backups.appendingPathComponent((path as NSString).deletingLastPathComponent)
            : backups.appendingPathComponent(path)
        save(data, into: folder)
    }

    private func save(_ data: Data, into folder: URL) {
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try data.write(to: folder.appendingPathComponent("\(Self.stamp(Date())).json"), options: .atomic)
            let all = try FileManager.default.contentsOfDirectory(atPath: folder.path)
                .filter { $0.hasSuffix(".json") }.sorted()
            for name in all.dropLast(Self.keep) {
                try? FileManager.default.removeItem(at: folder.appendingPathComponent(name))
            }
        } catch {
            NSLog("[backups] couldn't snapshot into %@: %@", folder.path, error.localizedDescription)
        }
    }

    // MARK: - Browsing

    func documents() -> [Document] {
        guard let walker = FileManager.default.enumerator(at: backups, includingPropertiesForKeys: [.isDirectoryKey]) else { return [] }
        let root = backups.resolvingSymlinksInPath().path + "/"
        var out: [Document] = []
        for case let folder as URL in walker {
            guard (try? folder.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true else { continue }
            let snaps = snapshots(in: folder)
            guard let latest = snaps.first?.date else { continue }
            let rel = String(folder.resolvingSymlinksInPath().path.dropFirst(root.count))
            let path = rel.hasSuffix(".json") ? rel : "\(rel)/info.json"
            out.append(Document(path: path, folder: folder, latest: latest))
            if rel.hasSuffix(".json") { walker.skipDescendants() }
        }
        return out.sorted { $0.latest > $1.latest }
    }

    /// Newest first.
    func snapshots(in folder: URL) -> [Snapshot] {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: folder.path)) ?? []
        return names.compactMap { name -> Snapshot? in
            guard name.hasSuffix(".json"), let date = Self.date(fromStamp: String(name.dropLast(5))) else { return nil }
            let url = folder.appendingPathComponent(name)
            let size = ((try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? Int) ?? 0
            return Snapshot(url: url, date: date, size: size)
        }.sorted { $0.date > $1.date }
    }

    func currentData(of document: Document) -> Data? {
        try? Data(contentsOf: site.appendingPathComponent(document.path))
    }

    /// Puts a snapshot back, keeping the version it replaces as a snapshot.
    func restore(_ snapshot: Snapshot, of document: Document) throws {
        let data = try Data(contentsOf: snapshot.url)
        let target = site.appendingPathComponent(document.path)
        if let current = try? Data(contentsOf: target), current != data {
            save(current, into: document.folder)
        }
        try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: target, options: .atomic)
    }

    // MARK: - Stamps (same as the editor server: ISO 8601 with ':' and '.' → '-')

    static func stamp(_ date: Date) -> String {
        ISO8601DateFormatter.withMilliseconds.string(from: date)
            .replacingOccurrences(of: ":", with: "-").replacingOccurrences(of: ".", with: "-")
    }

    static func date(fromStamp stamp: String) -> Date? {
        // 2026-10-04T21-04-38-321Z → 2026-10-04T21:04:38.321Z
        let parts = stamp.split(separator: "T", maxSplits: 1)
        guard parts.count == 2 else { return nil }
        let t = parts[1].split(separator: "-")
        guard t.count == 4 else { return nil }
        return ISO8601DateFormatter.withMilliseconds.date(from: "\(parts[0])T\(t[0]):\(t[1]):\(t[2]).\(t[3])")
    }
}

/// What restoring a snapshot would change: leaf values that differ between
/// two JSON documents, by key path.
enum JSONDiff {
    struct Change: Identifiable {
        let path: String
        let now: String?
        let snapshot: String?
        var id: String { path }
    }

    static func changes(now: Data?, snapshot: Data?) -> [Change] {
        let a = flatten(now.flatMap { try? JSONSerialization.jsonObject(with: $0, options: .fragmentsAllowed) })
        let b = flatten(snapshot.flatMap { try? JSONSerialization.jsonObject(with: $0, options: .fragmentsAllowed) })
        return Set(a.keys).union(b.keys).sorted(by: keyOrder).compactMap { key in
            a[key] == b[key] ? nil : Change(path: key, now: a[key], snapshot: b[key])
        }
    }

    private static func flatten(_ value: Any?, _ prefix: String = "", into out: inout [String: String]) {
        switch value {
        case let d as [String: Any]:
            for (k, v) in d { flatten(v, prefix.isEmpty ? k : "\(prefix).\(k)", into: &out) }
        case let a as [Any]:
            for (i, v) in a.enumerated() { flatten(v, "\(prefix)[\(i)]", into: &out) }
        case nil:
            break
        case is NSNull:
            out[prefix] = "null"
        case let n as NSNumber where CFGetTypeID(n) == CFBooleanGetTypeID():
            out[prefix] = n.boolValue ? "true" : "false"
        default:
            out[prefix] = "\(value!)"
        }
    }

    private static func flatten(_ value: Any?) -> [String: String] {
        var out: [String: String] = [:]
        flatten(value, into: &out)
        return out
    }

    /// Natural order, so [2] sorts before [10].
    private static func keyOrder(_ a: String, _ b: String) -> Bool {
        a.compare(b, options: .numeric) == .orderedAscending
    }
}
