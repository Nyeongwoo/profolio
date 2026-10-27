import Foundation
import ImageIO
import UniformTypeIdentifiers
import WebKit

/// Serves `siteproj://site/…` to the editor window from the open package:
///
/// - `/api/…`                  the package's editor API (`EditorAPI`)
/// - `/src/data|i18n/*.json`   content documents, from `site/src/…`
/// - anything in `site/public` the site's assets, at their public path
/// - anything in `editor/`     the web editor build
/// - other extensionless paths `editor/index.html` (client-side routes)
///
/// Files are read fresh on every request (`no-store`), so saved edits and
/// changes synced in from another Mac show up on the next load.
final class PackageSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "siteproj"
    static let editorURL = URL(string: "\(scheme)://site/editor")!

    private weak var document: SiteDocument?
    private let queue = DispatchQueue(label: "PackageSchemeHandler", qos: .userInitiated, attributes: .concurrent)
    /// Tasks WebKit cancelled; touching them afterwards raises. Main thread only.
    private var stopped = Set<ObjectIdentifier>()
    /// Animated images are served as one still frame (see `still(_:)`).
    private let stillImages: Bool

    init(document: SiteDocument, stillImages: Bool = false) {
        self.document = document
        self.stillImages = stillImages
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        let request = task.request
        let finish = { (response: Response) in
            DispatchQueue.main.async {
                guard self.stopped.remove(ObjectIdentifier(task)) == nil else { return }
                let url = request.url ?? Self.editorURL
                task.didReceive(HTTPURLResponse(url: url, statusCode: response.status,
                                                httpVersion: "HTTP/1.1", headerFields: response.headers)!)
                task.didReceive(response.body)
                task.didFinish()
            }
        }
        guard let document, let root = document.packageURL, let url = request.url else {
            return finish(.text(503, "The project is not available."))
        }

        // Publishing and its status belong to the app, not the site's API.
        if url.path == "/api/deploy" && request.httpMethod == "POST" {
            return streamPublish(of: document, to: task)
        }
        if url.path == "/api/git-info" {
            return finish(.json(200, document.gitInfo()))
        }
        if url.path.hasPrefix("/api/") {
            let path = url.path + (url.query.map { "?\($0)" } ?? "")
            document.api.handle(method: request.httpMethod ?? "GET", url: path,
                                headers: request.allHTTPHeaderFields ?? [:], body: Self.body(of: request),
                                completion: finish)
            return
        }
        queue.async { [stillImages] in
            let response = Self.respond(to: request, package: root)
            finish(stillImages ? Self.still(response) : response)
        }
    }

    /// An animated GIF, WebP or PNG as the frame it rests on longest (the
    /// end of a typing effect, say), for a page drawn where nothing animates.
    private static func still(_ response: Response) -> Response {
        guard response.status == 200, response.headers["Content-Type"]?.hasPrefix("image/") == true,
              let source = CGImageSourceCreateWithData(response.body as CFData, nil),
              CGImageSourceGetCount(source) > 1 else { return response }
        let delay = { (i: Int) -> Double in
            let props = CGImageSourceCopyPropertiesAtIndex(source, i, nil) as? [CFString: Any] ?? [:]
            for key in [kCGImagePropertyGIFDictionary, kCGImagePropertyWebPDictionary, kCGImagePropertyPNGDictionary] {
                if let d = props[key] as? [CFString: Any], let t = (d[kCGImagePropertyGIFUnclampedDelayTime] ?? d[kCGImagePropertyWebPUnclampedDelayTime]
                    ?? d[kCGImagePropertyAPNGUnclampedDelayTime] ?? d[kCGImagePropertyGIFDelayTime]) as? Double { return t }
            }
            return 0
        }
        let frames = 0..<CGImageSourceGetCount(source)
        // The last of the longest, so a final hold wins a tie with an opening one.
        let rest = frames.reduce(0) { delay($1) >= delay($0) ? $1 : $0 }
        let data = NSMutableData()
        guard let image = CGImageSourceCreateImageAtIndex(source, rest, nil),
              let dest = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil) else { return response }
        CGImageDestinationAddImage(dest, image, nil)
        guard CGImageDestinationFinalize(dest) else { return response }
        var still = response
        still.body = data as Data
        still.headers["Content-Type"] = "image/png"
        still.headers["Content-Length"] = String(data.length)
        return still
    }

    /// The editor's Deploy button reads a server-sent event stream; feed it
    /// the publish progress as it happens.
    private func streamPublish(of document: SiteDocument, to task: WKURLSchemeTask) {
        let url = task.request.url ?? Self.editorURL
        task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [
            "Content-Type": "text/event-stream", "Cache-Control": "no-store",
        ])!)
        let id = ObjectIdentifier(task)
        document.publish { event in
            guard let json = try? JSONSerialization.data(withJSONObject: event.json),
                  let line = String(data: json, encoding: .utf8) else { return }
            DispatchQueue.main.async {
                // The page may have gone away; publishing carries on regardless.
                guard !self.stopped.contains(id) else { return }
                task.didReceive(Data("data: \(line)\n\n".utf8))
                if event.done {
                    task.didFinish()
                    self.stopped.insert(id)
                }
            }
        }
    }

    /// WebKit hands custom-scheme request bodies over as data or as a stream.
    private static func body(of request: URLRequest) -> Data? {
        if let data = request.httpBody { return data }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 64 * 1024)
        while stream.hasBytesAvailable {
            let n = stream.read(&buffer, maxLength: buffer.count)
            if n <= 0 { break }
            data.append(buffer, count: n)
        }
        return data
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        stopped.insert(ObjectIdentifier(task))
    }

    // MARK: - Routing

    struct Response {
        var status: Int
        var headers: [String: String]
        var body: Data

        static func text(_ status: Int, _ text: String, type: String = "text/plain; charset=utf-8") -> Response {
            Response(status: status, headers: ["Content-Type": type, "Cache-Control": "no-store"], body: Data(text.utf8))
        }

        static func json(_ status: Int, _ object: [String: Any]) -> Response {
            let body = (try? JSONSerialization.data(withJSONObject: object)) ?? Data("{}".utf8)
            return Response(status: status, headers: ["Content-Type": "application/json", "Cache-Control": "no-store"], body: body)
        }
    }

    static func respond(to request: URLRequest, package: URL) -> Response {
        let path = request.url?.path ?? "/"
        let site = package.appendingPathComponent("site")
        let editor = package.appendingPathComponent("editor")

        if path.range(of: #"^/src/(data|i18n)/[^/]+\.json$"#, options: .regularExpression) != nil {
            return file(at: path, in: site, range: request.value(forHTTPHeaderField: "Range"))
                ?? .json(404, ["error": "Not found"])
        }
        if let response = file(at: path, in: site.appendingPathComponent("public"), range: request.value(forHTTPHeaderField: "Range"))
            ?? file(at: path, in: editor, range: request.value(forHTTPHeaderField: "Range")) {
            return response
        }
        // A missing file is a 404; any other path is a route of the web app.
        if !(path as NSString).pathExtension.isEmpty {
            return .text(404, "Not found")
        }
        return file(at: "/index.html", in: editor, range: nil) ?? missingEditorPage(package)
    }

    /// The regular file at `path` under `base`, honouring a byte Range
    /// (needed for <video> playback). nil if there is no such file.
    private static func file(at path: String, in base: URL, range: String?) -> Response? {
        let url = base.appendingPathComponent(path).standardizedFileURL
        // Keep "/../" from reaching outside the folder.
        guard url.path.hasPrefix(base.standardizedFileURL.path + "/") else { return nil }
        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir), !isDir.boolValue,
              let data = try? Data(contentsOf: url, options: .mappedIfSafe) else { return nil }

        var headers = [
            "Content-Type": mimeType(for: url),
            "Cache-Control": "no-store",
            "Accept-Ranges": "bytes",
            "Access-Control-Allow-Origin": "*",
        ]
        if let range, let (start, end) = parseRange(range, length: data.count) {
            headers["Content-Range"] = "bytes \(start)-\(end)/\(data.count)"
            headers["Content-Length"] = String(end - start + 1)
            return Response(status: 206, headers: headers, body: data.subdata(in: start..<(end + 1)))
        }
        headers["Content-Length"] = String(data.count)
        return Response(status: 200, headers: headers, body: data)
    }

    /// "bytes=a-b", "bytes=a-" or "bytes=-n" → inclusive byte bounds.
    private static func parseRange(_ header: String, length: Int) -> (Int, Int)? {
        guard length > 0, header.hasPrefix("bytes="), !header.contains(",") else { return nil }
        let parts = header.dropFirst(6).split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 2 else { return nil }
        let start: Int, end: Int
        if parts[0].isEmpty {
            guard let n = Int(parts[1]), n > 0 else { return nil }
            start = max(0, length - n); end = length - 1
        } else {
            guard let s = Int(parts[0]) else { return nil }
            start = s; end = min(Int(parts[1]) ?? (length - 1), length - 1)
        }
        return start <= end && start < length ? (start, end) : nil
    }

    private static let mimeTypes = [
        "html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8",
        "mjs": "text/javascript; charset=utf-8", "css": "text/css; charset=utf-8",
        "json": "application/json; charset=utf-8", "svg": "image/svg+xml", "wasm": "application/wasm",
    ]

    private static func mimeType(for url: URL) -> String {
        let ext = url.pathExtension.lowercased()
        return mimeTypes[ext] ?? UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream"
    }

    private static func missingEditorPage(_ package: URL) -> Response {
        .text(200, """
            <!doctype html><meta charset="utf-8"><title>No editor</title>
            <body style="font: 14px -apple-system; padding: 48px; color: #333">
            <h2>This project has no editor installed</h2>
            <p>Install it from the site's repository:</p>
            <pre style="background:#f4f4f5; padding:12px; border-radius:6px">node scripts/siteproj.js editor "\(package.path)"</pre>
            </body>
            """, type: "text/html; charset=utf-8")
    }
}
