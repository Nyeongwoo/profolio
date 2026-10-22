import Foundation
import JavaScriptCore

/// Runs the package's editor API (`editor/api/server.js`, the site's editor
/// server bundled by scripts/siteproj.js) in JavaScriptCore and answers the
/// web editor's `/api/…` requests with it.
///
/// The script gets a `host` object — file access confined to the package,
/// logging, timers and a small fetch. scripts/editor-api/test.js has a Node
/// twin of this host; keep the two in step.
///
/// All JavaScript runs on one serial queue.
final class EditorAPI {
    private let packageURL: () -> URL?
    private let queue = DispatchQueue(label: "EditorAPI", qos: .userInitiated)
    private var context: JSContext?
    private var timers: [Int: JSValue] = [:]
    private var nextTimer = 1

    /// Posted on the main queue after the API changes site files, with the
    /// package-relative paths in userInfo["paths"] (Set<String>); the object
    /// is this EditorAPI. A save's several writes come as one notification.
    static let contentChanged = Notification.Name("ProfolioContentChanged")
    private var pendingChanges = Set<String>()

    init(packageURL: @escaping () -> URL?) {
        self.packageURL = packageURL
    }

    /// Drop the loaded script; the next request loads it again (after the
    /// editor was rebuilt into the package).
    func reset() {
        queue.async {
            self.context = nil
            self.timers.removeAll()
        }
    }

    func handle(method: String, url: String, headers: [String: String], body: Data?,
                completion: @escaping (PackageSchemeHandler.Response) -> Void) {
        queue.async {
            guard let context = self.loadContext(),
                  let handle = context.objectForKeyedSubscript("handleRequest"), !handle.isUndefined else {
                return completion(.json(501, ["error": "This project's editor has no API. Rebuild it with: node scripts/siteproj.js editor <project>"]))
            }
            var answered = false
            let done: @convention(block) (Int, String, String) -> Void = { status, headersJSON, text in
                guard !answered else { return }
                answered = true
                var responseHeaders = (try? JSONSerialization.jsonObject(with: Data(headersJSON.utf8))) as? [String: String] ?? [:]
                responseHeaders["Cache-Control"] = "no-store"
                completion(PackageSchemeHandler.Response(status: status, headers: responseHeaders, body: Data(text.utf8)))
            }
            let headersJSON = (try? JSONSerialization.data(withJSONObject: headers)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
            // PNG uploads are stored as WebP, whichever route they take.
            let body = method == "POST" ? WebP.convertingUpload(body) : body
            let bodyText = body.flatMap { String(data: $0, encoding: .utf8) } ?? ""
            handle.call(withArguments: [method, url, headersJSON, bodyText, done])
        }
    }

    // MARK: - Context

    private func loadContext() -> JSContext? {
        if let context { return context }
        guard let root = packageURL(),
              let source = try? String(contentsOf: root.appendingPathComponent("editor/api/server.js"), encoding: .utf8),
              let context = JSContext() else { return nil }
        context.name = "Editor API"
        context.exceptionHandler = { _, exception in
            NSLog("[api exception] %@", exception?.toString() ?? "?")
        }
        context.setObject(makeHost(context), forKeyedSubscript: "host" as NSString)
        context.evaluateScript(source, withSourceURL: URL(string: "siteproj://site/editor/api/server.js"))
        self.context = context
        return context
    }

    private func makeHost(_ context: JSContext) -> JSValue {
        let host = JSValue(newObjectIn: context)!
        func set(_ name: String, _ block: Any) {
            host.setObject(block, forKeyedSubscript: name as NSString)
        }

        set("read", { [weak self] (rel: String) -> Any in
            guard let url = self?.resolve(rel), let text = try? String(contentsOf: url, encoding: .utf8) else { return NSNull() }
            return text
        } as @convention(block) (String) -> Any)

        set("write", { [weak self] (rel: String, text: String) -> Bool in
            guard let self, let root = self.packageURL() else { return false }
            let data = Data(text.utf8)
            // Every content document gets a snapshot before it's replaced.
            BackupStore(package: root).snapshotBeforeWrite(rel, newData: data)
            return self.mutate(rel) { try Self.writeFile(data, to: $0) }
        } as @convention(block) (String, String) -> Bool)

        set("writeBase64", { [weak self] (rel: String, base64: String) -> Bool in
            guard let data = Data(base64Encoded: base64, options: .ignoreUnknownCharacters) else { return false }
            return self?.mutate(rel) { try Self.writeFile(data, to: $0) } ?? false
        } as @convention(block) (String, String) -> Bool)

        set("stat", { [weak self] (rel: String) -> Any in
            guard let url = self?.resolve(rel),
                  let attrs = try? FileManager.default.attributesOfItem(atPath: url.path) else { return NSNull() }
            let modified = (attrs[.modificationDate] as? Date) ?? Date(timeIntervalSince1970: 0)
            return [
                "isDirectory": (attrs[.type] as? FileAttributeType) == .typeDirectory,
                "size": (attrs[.size] as? NSNumber)?.intValue ?? 0,
                "mtimeMs": modified.timeIntervalSince1970 * 1000,
            ] as [String: Any]
        } as @convention(block) (String) -> Any)

        set("list", { [weak self] (rel: String) -> Any in
            guard let url = self?.resolve(rel),
                  let names = try? FileManager.default.contentsOfDirectory(atPath: url.path) else { return NSNull() }
            return names.map { name -> [String: Any] in
                var isDir: ObjCBool = false
                FileManager.default.fileExists(atPath: url.appendingPathComponent(name).path, isDirectory: &isDir)
                return ["name": name, "isDirectory": isDir.boolValue]
            }
        } as @convention(block) (String) -> Any)

        set("mkdir", { [weak self] (rel: String) -> Bool in
            self?.mutate(rel) { try FileManager.default.createDirectory(at: $0, withIntermediateDirectories: true) } ?? false
        } as @convention(block) (String) -> Bool)

        set("copy", { [weak self] (from: String, to: String) -> Bool in
            guard let src = self?.resolve(from) else { return false }
            return self?.mutate(to) { dst in
                try Self.prepareDestination(dst)
                try FileManager.default.copyItem(at: src, to: dst)
            } ?? false
        } as @convention(block) (String, String) -> Bool)

        set("move", { [weak self] (from: String, to: String) -> Bool in
            guard let self, let src = self.resolve(from) else { return false }
            self.noteChange(from)
            return self.mutate(to) { dst in
                try Self.prepareDestination(dst)
                try FileManager.default.moveItem(at: src, to: dst)
            }
        } as @convention(block) (String, String) -> Bool)

        set("remove", { [weak self] (rel: String) -> Bool in
            // Images and other site files go to the Trash (AssetTrash).
            self?.mutate(rel) { try AssetTrash.discard($0) } ?? false
        } as @convention(block) (String) -> Bool)

        set("log", { (level: String, message: String) in
            NSLog("[api %@] %@", level, message)
        } as @convention(block) (String, String) -> Void)

        set("setTimeout", { [weak self] (callback: JSValue, ms: Double) -> Int in
            guard let self else { return 0 }
            let id = self.nextTimer
            self.nextTimer += 1
            self.timers[id] = callback
            self.queue.asyncAfter(deadline: .now() + max(0, ms) / 1000) {
                self.timers.removeValue(forKey: id)?.call(withArguments: [])
            }
            return id
        } as @convention(block) (JSValue, Double) -> Int)

        set("clearTimeout", { [weak self] (id: Int) in
            self?.timers.removeValue(forKey: id)
        } as @convention(block) (Int) -> Void)

        set("fetch", { [weak self] (urlString: String, headersJSON: String, callback: JSValue) in
            self?.fetch(urlString, headersJSON: headersJSON, callback: callback)
        } as @convention(block) (String, String, JSValue) -> Void)

        return host
    }

    // MARK: - Files

    /// `rel` inside the package, or nil if it would point outside it.
    private func resolve(_ rel: String) -> URL? {
        guard let root = packageURL()?.standardizedFileURL, !rel.hasPrefix("/"),
              !rel.split(separator: "/").contains("..") else { return nil }
        let url = root.appendingPathComponent(rel).standardizedFileURL
        return url.path.hasPrefix(root.path + "/") ? url : nil
    }

    private func mutate(_ rel: String, _ action: (URL) throws -> Void) -> Bool {
        guard let url = resolve(rel) else { return false }
        do {
            try action(url)
            noteChange(rel)
            return true
        } catch {
            NSLog("[api] %@ failed: %@", rel, error.localizedDescription)
            return false
        }
    }

    private static func writeFile(_ data: Data, to url: URL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        AssetTrash.keepPrevious(url, before: data)
        try data.write(to: url, options: .atomic)
    }

    /// Node's copy/rename replace an existing file at the destination.
    private static func prepareDestination(_ url: URL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        if FileManager.default.fileExists(atPath: url.path) { try AssetTrash.discard(url) }
    }

    private func noteChange(_ rel: String) {
        guard rel.hasPrefix("site/") else { return }
        let first = pendingChanges.isEmpty
        pendingChanges.insert(rel)
        guard first else { return }
        queue.asyncAfter(deadline: .now() + 0.15) {
            let paths = self.pendingChanges
            self.pendingChanges = []
            DispatchQueue.main.async {
                NotificationCenter.default.post(name: Self.contentChanged, object: self, userInfo: ["paths": paths])
            }
        }
    }

    // MARK: - Fetch

    private func fetch(_ urlString: String, headersJSON: String, callback: JSValue) {
        guard let url = URL(string: urlString), ["http", "https"].contains(url.scheme ?? "") else {
            callback.call(withArguments: ["Invalid URL"])
            return
        }
        var request = URLRequest(url: url, timeoutInterval: 15)
        let headers = (try? JSONSerialization.jsonObject(with: Data(headersJSON.utf8))) as? [String: String] ?? [:]
        headers.forEach { request.setValue($1, forHTTPHeaderField: $0) }
        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            self?.queue.async {
                if let error {
                    callback.call(withArguments: [error.localizedDescription])
                    return
                }
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                let text = String(decoding: (data ?? Data()).prefix(500_000), as: UTF8.self)
                callback.call(withArguments: [NSNull(), status, text])
            }
        }.resume()
    }
}
