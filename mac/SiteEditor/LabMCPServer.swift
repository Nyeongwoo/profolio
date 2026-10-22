import AppKit
import Network

/// Profolio's MCP server: the Lab's tools, offered to a coding agent over
/// MCP's streamable HTTP transport — JSON-RPC in a POST, the answer in the
/// response (no event stream needed). It listens on 127.0.0.1 only, on a
/// port chosen at launch, and needs the bearer token Profolio hands to the
/// agents it starts.
@MainActor
final class LabMCPServer {
    struct Tool {
        let name: String
        let description: String
        var properties: [String: [String: Any]] = [:]
        var required: [String] = []
        /// Called with the arguments and the caller: the piece whose agent
        /// asked (from its URL, /mcp/<slug>).
        let run: @MainActor ([String: Any], String) async -> Result
    }
    enum Result {
        case text(String)
        case image(Data, caption: String)
        case error(String)
    }

    let token = UUID().uuidString
    private(set) var port: UInt16 = 0
    private var listener: NWListener?
    private var tools: [String: Tool] = [:]
    private var order: [String] = []

    /// Stops listening (the window closed).
    func stop() {
        listener?.cancel()
        listener = nil
    }

    deinit {
        listener?.cancel()
    }

    func register(_ tool: Tool) {
        if tools[tool.name] == nil { order.append(tool.name) }
        tools[tool.name] = tool
    }

    /// The --mcp-config JSON the agent for `slug` is started with; its URL
    /// names the piece, so the tools know whose chat a call comes from.
    func config(for slug: String) -> String {
        let json: [String: Any] = ["mcpServers": ["profolio": [
            "type": "http", "url": "http://127.0.0.1:\(port)/mcp/\(slug)",
            "headers": ["Authorization": "Bearer \(token)"],
        ]]]
        return String(decoding: (try? JSONSerialization.data(withJSONObject: json)) ?? Data(), as: UTF8.self)
    }

    func start() async throws {
        guard listener == nil else { return }
        let params = NWParameters.tcp
        params.requiredLocalEndpoint = NWEndpoint.hostPort(host: "127.0.0.1", port: .any)
        let l = try NWListener(using: params)
        l.newConnectionHandler = { [weak self] connection in
            DispatchQueue.main.async { MainActor.assumeIsolated { self?.accept(connection) } }
        }
        let ready: UInt16 = try await withCheckedThrowingContinuation { cont in
            var resumed = false
            l.stateUpdateHandler = { state in
                guard !resumed else { return }
                switch state {
                case .ready:
                    resumed = true
                    cont.resume(returning: l.port?.rawValue ?? 0)
                case .failed(let error):
                    resumed = true
                    cont.resume(throwing: error)
                default: break
                }
            }
            l.start(queue: .main)
        }
        listener = l
        port = ready
    }

    // MARK: - HTTP

    private func accept(_ connection: NWConnection) {
        connection.start(queue: .main)
        read(connection, buffer: Data())
    }

    /// Reads one request (headers, then Content-Length bytes) and answers it.
    private func read(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 1 << 20) { [weak self] data, _, complete, error in
            MainActor.assumeIsolated {
                guard let self else { return }
                var buffer = buffer
                if let data { buffer.append(data) }
                if let request = Self.parse(buffer) {
                    Task { await self.answer(request, on: connection) }
                } else if complete || error != nil {
                    connection.cancel()
                } else {
                    self.read(connection, buffer: buffer)
                }
            }
        }
    }

    private struct Request {
        let method: String
        let path: String
        let headers: [String: String]
        let body: Data
    }

    private static func parse(_ data: Data) -> Request? {
        guard let end = data.range(of: Data("\r\n\r\n".utf8)) else { return nil }
        let head = String(decoding: data[data.startIndex..<end.lowerBound], as: UTF8.self)
        var lines = head.components(separatedBy: "\r\n")
        let first = lines.removeFirst().split(separator: " ")
        guard first.count >= 2 else { return nil }
        var headers: [String: String] = [:]
        for line in lines {
            guard let colon = line.firstIndex(of: ":") else { continue }
            headers[line[..<colon].lowercased()] = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
        }
        let length = Int(headers["content-length"] ?? "0") ?? 0
        let bodyStart = end.upperBound
        guard data.count - bodyStart >= length else { return nil }
        return Request(method: String(first[0]), path: String(first[1]), headers: headers,
                       body: data.subdata(in: bodyStart..<(bodyStart + length)))
    }

    private func answer(_ request: Request, on connection: NWConnection) async {
        guard request.headers["authorization"] == "Bearer \(token)" else {
            return send(connection, status: "401 Unauthorized", body: nil)
        }
        guard request.method == "POST", request.path.hasPrefix("/mcp") else {
            return send(connection, status: "405 Method Not Allowed", body: nil)
        }
        guard let message = try? JSONSerialization.jsonObject(with: request.body) as? [String: Any] else {
            return send(connection, status: "400 Bad Request", body: nil)
        }
        // Notifications (no id) just get an acknowledgement.
        guard let id = message["id"] else { return send(connection, status: "202 Accepted", body: nil) }
        let caller = request.path.split(separator: "/").dropFirst().first.map(String.init) ?? ""
        let result = await handle(method: message["method"] as? String ?? "", params: message["params"] as? [String: Any] ?? [:], caller: caller)
        var reply: [String: Any] = ["jsonrpc": "2.0", "id": id]
        switch result {
        case .success(let value): reply["result"] = value
        case .failure(let error): reply["error"] = ["code": error.code, "message": error.message]
        }
        send(connection, status: "200 OK", body: try? JSONSerialization.data(withJSONObject: reply))
    }

    private func send(_ connection: NWConnection, status: String, body: Data?) {
        var head = "HTTP/1.1 \(status)\r\nConnection: close\r\nContent-Length: \(body?.count ?? 0)\r\n"
        if body != nil { head += "Content-Type: application/json\r\n" }
        head += "\r\n"
        var data = Data(head.utf8)
        if let body { data.append(body) }
        connection.send(content: data, completion: .contentProcessed { _ in connection.cancel() })
    }

    // MARK: - JSON-RPC

    private struct RPCError: Error {
        let code: Int
        let message: String
    }

    private func handle(method: String, params: [String: Any], caller: String) async -> Swift.Result<Any, RPCError> {
        switch method {
        case "initialize":
            return .success([
                "protocolVersion": params["protocolVersion"] as? String ?? "2025-06-18",
                "capabilities": ["tools": [:]],
                "serverInfo": ["name": "profolio", "version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1"],
                "instructions": "Profolio’s Lab: tools to see and publish the lab piece open in Profolio’s preview.",
            ] as [String: Any])
        case "ping":
            return .success([String: Any]())
        case "tools/list":
            return .success(["tools": order.compactMap { tools[$0] }.map { t in
                ["name": t.name, "description": t.description,
                 "inputSchema": ["type": "object", "properties": t.properties, "required": t.required] as [String: Any]]
            }])
        case "tools/call":
            guard let name = params["name"] as? String, let tool = tools[name] else {
                return .failure(RPCError(code: -32602, message: "Unknown tool"))
            }
            switch await tool.run(params["arguments"] as? [String: Any] ?? [:], caller) {
            case .text(let text):
                return .success(["content": [["type": "text", "text": text]]])
            case .image(let png, let caption):
                return .success(["content": [["type": "image", "data": png.base64EncodedString(), "mimeType": "image/png"],
                                             ["type": "text", "text": caption]]])
            case .error(let text):
                return .success(["content": [["type": "text", "text": text]], "isError": true])
            }
        default:
            return .failure(RPCError(code: -32601, message: "Method not found: \(method)"))
        }
    }
}
