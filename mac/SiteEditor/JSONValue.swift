import Foundation
import JavaScriptCore

/// JSON that keeps object keys in their original order, so content files the
/// native editor saves differ from the web editor's only where values do.
enum JSONValue: Equatable {
    case null
    case bool(Bool)
    case number(String)          // the literal, e.g. "80" or "1.5"
    case string(String)
    case array([JSONValue])
    case object([(String, JSONValue)])

    static func == (a: JSONValue, b: JSONValue) -> Bool {
        switch (a, b) {
        case (.null, .null): true
        case let (.bool(x), .bool(y)): x == y
        case let (.number(x), .number(y)): Double(x) == Double(y)
        case let (.string(x), .string(y)): x == y
        case let (.array(x), .array(y)): x == y
        case let (.object(x), .object(y)): x.count == y.count && zip(x, y).allSatisfy { $0.0 == $1.0 && $0.1 == $1.1 }
        default: false
        }
    }

    // MARK: Reading

    subscript(key: String) -> JSONValue? {
        if case .object(let pairs) = self { return pairs.first { $0.0 == key }?.1 }
        return nil
    }

    subscript(index: Int) -> JSONValue? {
        if case .array(let items) = self, items.indices.contains(index) { return items[index] }
        return nil
    }

    var string: String? {
        switch self {
        case .string(let s): s
        case .number(let n): n
        default: nil
        }
    }
    var int: Int? {
        switch self {
        case .number(let n): Int(n) ?? Double(n).map { Int($0) }
        case .string(let s): Int(s)
        default: nil
        }
    }
    var bool: Bool? { if case .bool(let b) = self { b } else { nil } }
    var array: [JSONValue]? { if case .array(let a) = self { a } else { nil } }
    var keys: [String] { if case .object(let p) = self { p.map(\.0) } else { [] } }

    // MARK: Writing

    /// Sets `key`, keeping its place if it exists, appending otherwise.
    /// nil removes it.
    mutating func set(_ key: String, _ value: JSONValue?) {
        guard case .object(var pairs) = self else { return }
        if let i = pairs.firstIndex(where: { $0.0 == key }) {
            if let value { pairs[i].1 = value } else { pairs.remove(at: i) }
        } else if let value {
            pairs.append((key, value))
        }
        self = .object(pairs)
    }

    mutating func update(_ key: String, _ change: (inout JSONValue) -> Void) {
        var value = self[key] ?? .null
        change(&value)
        set(key, value)
    }

    mutating func update(_ index: Int, _ change: (inout JSONValue) -> Void) {
        guard case .array(var items) = self, items.indices.contains(index) else { return }
        change(&items[index])
        self = .array(items)
    }

    /// Follows a path of keys (String) and indexes (Int).
    subscript(path path: [Any]) -> JSONValue? {
        var v: JSONValue? = self
        for p in path {
            if let k = p as? String { v = v?[k] } else if let i = p as? Int { v = v?[i] } else { return nil }
        }
        return v
    }

    mutating func set(path: [Any], _ value: JSONValue?) {
        guard let first = path.first else { if let value { self = value }; return }
        let rest = Array(path.dropFirst())
        if let k = first as? String {
            if rest.isEmpty {
                set(k, value)
            } else {
                // A missing object on the way is created (unless removing).
                if self[k] == nil, value == nil { return }
                update(k) { v in
                    if case .null = v, rest.first is String { v = .object([]) }
                    v.set(path: rest, value)
                }
            }
        } else if let i = first as? Int {
            if rest.isEmpty {
                guard case .array(var items) = self, items.indices.contains(i) else { return }
                if let value { items[i] = value } else { items.remove(at: i) }
                self = .array(items)
            } else {
                update(i) { $0.set(path: rest, value) }
            }
        }
    }

    static func str(_ s: String?) -> JSONValue? { s.map { .string($0) } }

    // MARK: Text

    /// Compact JSON. Pretty-printing is left to JavaScript (see `formatted`).
    var compact: String {
        var out = ""
        write(to: &out)
        return out
    }

    private func write(to out: inout String) {
        switch self {
        case .null: out += "null"
        case .bool(let b): out += b ? "true" : "false"
        case .number(let n): out += n
        case .string(let s): Self.quote(s, into: &out)
        case .array(let items):
            out += "["
            for (i, v) in items.enumerated() { if i > 0 { out += "," }; v.write(to: &out) }
            out += "]"
        case .object(let pairs):
            out += "{"
            for (i, (k, v)) in pairs.enumerated() {
                if i > 0 { out += "," }
                Self.quote(k, into: &out)
                out += ":"
                v.write(to: &out)
            }
            out += "}"
        }
    }

    private static func quote(_ s: String, into out: inout String) {
        out += "\""
        for u in s.unicodeScalars {
            switch u {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            case "\u{8}": out += "\\b"
            case "\u{C}": out += "\\f"
            default:
                if u.value < 0x20 { out += String(format: "\\u%04x", u.value) } else { out.unicodeScalars.append(u) }
            }
        }
        out += "\""
    }

    /// Exactly what the editor server writes: JSON.stringify(value, null, 2).
    var formatted: String {
        JSONFormatter.shared.prettyPrint(compact) ?? compact
    }

    // MARK: Parsing

    static func parse(_ data: Data) -> JSONValue? {
        guard let text = String(data: data, encoding: .utf8) else { return nil }
        var p = Parser(scalars: Array(text.unicodeScalars))
        p.skipSpace()
        guard let v = p.value() else { return nil }
        p.skipSpace()
        return p.i == p.scalars.count ? v : nil
    }

    private struct Parser {
        let scalars: [Unicode.Scalar]
        var i = 0

        mutating func skipSpace() {
            while i < scalars.count, [" ", "\n", "\r", "\t"].contains(scalars[i]) { i += 1 }
        }

        mutating func value() -> JSONValue? {
            skipSpace()
            guard i < scalars.count else { return nil }
            switch scalars[i] {
            case "{":
                i += 1
                var pairs: [(String, JSONValue)] = []
                skipSpace()
                if i < scalars.count, scalars[i] == "}" { i += 1; return .object(pairs) }
                while true {
                    skipSpace()
                    guard let k = string() else { return nil }
                    skipSpace()
                    guard i < scalars.count, scalars[i] == ":" else { return nil }
                    i += 1
                    guard let v = value() else { return nil }
                    pairs.append((k, v))
                    skipSpace()
                    guard i < scalars.count else { return nil }
                    if scalars[i] == "," { i += 1; continue }
                    if scalars[i] == "}" { i += 1; return .object(pairs) }
                    return nil
                }
            case "[":
                i += 1
                var items: [JSONValue] = []
                skipSpace()
                if i < scalars.count, scalars[i] == "]" { i += 1; return .array(items) }
                while true {
                    guard let v = value() else { return nil }
                    items.append(v)
                    skipSpace()
                    guard i < scalars.count else { return nil }
                    if scalars[i] == "," { i += 1; continue }
                    if scalars[i] == "]" { i += 1; return .array(items) }
                    return nil
                }
            case "\"":
                return string().map { .string($0) }
            case "t": return literal("true", .bool(true))
            case "f": return literal("false", .bool(false))
            case "n": return literal("null", .null)
            default:
                let start = i
                while i < scalars.count, "+-0123456789.eE".unicodeScalars.contains(scalars[i]) { i += 1 }
                guard i > start else { return nil }
                return .number(String(String.UnicodeScalarView(scalars[start..<i])))
            }
        }

        mutating func literal(_ word: String, _ v: JSONValue) -> JSONValue? {
            let w = Array(word.unicodeScalars)
            guard i + w.count <= scalars.count, Array(scalars[i..<(i + w.count)]) == w else { return nil }
            i += w.count
            return v
        }

        mutating func string() -> String? {
            guard i < scalars.count, scalars[i] == "\"" else { return nil }
            i += 1
            var out = String.UnicodeScalarView()
            var pendingHigh: UInt32?
            while i < scalars.count {
                let c = scalars[i]
                i += 1
                if c == "\"" { return String(out) }
                guard c == "\\" else { out.append(c); continue }
                guard i < scalars.count else { return nil }
                let e = scalars[i]
                i += 1
                switch e {
                case "n": out.append("\n")
                case "r": out.append("\r")
                case "t": out.append("\t")
                case "b": out.append("\u{8}")
                case "f": out.append("\u{C}")
                case "u":
                    guard i + 4 <= scalars.count, let code = UInt32(String(String.UnicodeScalarView(scalars[i..<(i + 4)])), radix: 16) else { return nil }
                    i += 4
                    if (0xD800...0xDBFF).contains(code) { pendingHigh = code; continue }
                    if (0xDC00...0xDFFF).contains(code), let high = pendingHigh {
                        pendingHigh = nil
                        if let s = Unicode.Scalar(0x10000 + ((high - 0xD800) << 10) + (code - 0xDC00)) { out.append(s) }
                        continue
                    }
                    if let s = Unicode.Scalar(code) { out.append(s) }
                default: out.append(e)
                }
            }
            return nil
        }
    }
}

/// JSON.stringify(JSON.parse(text), null, 2) in JavaScriptCore — the same
/// engine and rules as the editor server, so formatting matches exactly.
final class JSONFormatter {
    static let shared = JSONFormatter()
    private let lock = NSLock()
    private lazy var context: JSContext? = {
        let c = JSContext()
        c?.evaluateScript("function pretty(t) { return JSON.stringify(JSON.parse(t), null, 2) }")
        return c
    }()

    func prettyPrint(_ text: String) -> String? {
        lock.lock(); defer { lock.unlock() }
        guard let result = context?.objectForKeyedSubscript("pretty")?.call(withArguments: [text]), result.isString else { return nil }
        return result.toString()
    }
}
