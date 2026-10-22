import Foundation

/// Three-way merge of a JSON file changed both here and on GitHub since the
/// last publish: whatever only one side changed is kept; a value both sides
/// changed differently is a conflict, settled by `resolutions` when given.
///
/// Objects merge key by key (keys stay in this side's order, keys added on
/// GitHub go after), arrays item by item while all three have the same
/// length; anything else is a single value.
enum JSONMerge {
    enum Side: String { case mine, theirs }

    /// The key of a conflict over a whole file (not JSON, removed, renamed).
    static let wholeFile = "(whole file)"

    /// A value both sides changed. `key` reads like "projects[2].title".
    struct Conflict: Identifiable, Hashable {
        let path: String
        let key: String
        let mine: String?
        let theirs: String?
        var id: String { Self.id(path, key) }
        static func id(_ path: String, _ key: String) -> String { path + "#" + key }
    }

    struct Result {
        var value: JSONValue?
        var conflicts: [Conflict]
    }

    static func merge(path: String, base: JSONValue?, mine: JSONValue?, theirs: JSONValue?,
                      resolutions: [String: Side] = [:]) -> Result {
        var conflicts: [Conflict] = []
        let value = merge(base, mine, theirs, key: "", path: path, resolutions: resolutions, conflicts: &conflicts)
        return Result(value: value, conflicts: conflicts)
    }

    private static func merge(_ base: JSONValue?, _ mine: JSONValue?, _ theirs: JSONValue?, key: String, path: String,
                              resolutions: [String: Side], conflicts: inout [Conflict]) -> JSONValue? {
        if mine == theirs { return mine }
        if mine == base { return theirs }
        if theirs == base { return mine }

        switch (mine, theirs) {
        case let (.object(m)?, .object(t)?):
            let b: [(String, JSONValue)] = if case .object(let pairs)? = base { pairs } else { [] }
            func value(_ pairs: [(String, JSONValue)], _ k: String) -> JSONValue? { pairs.first { $0.0 == k }?.1 }
            var keys = m.map(\.0)
            for (k, _) in t where !keys.contains(k) { keys.append(k) }
            var out: [(String, JSONValue)] = []
            for k in keys {
                let merged = merge(value(b, k), value(m, k), value(t, k), key: key.isEmpty ? k : "\(key).\(k)",
                                   path: path, resolutions: resolutions, conflicts: &conflicts)
                if let merged { out.append((k, merged)) }
            }
            return .object(out)
        case let (.array(m)?, .array(t)?):
            if case .array(let b)? = base, b.count == m.count, m.count == t.count {
                var out: [JSONValue] = []
                for i in m.indices {
                    // An item can't be dropped from the middle; a removal
                    // on one side changes the length, which isn't merged here.
                    let merged = merge(b[i], m[i], t[i], key: "\(key)[\(i)]", path: path,
                                       resolutions: resolutions, conflicts: &conflicts)
                    out.append(merged ?? .null)
                }
                return .array(out)
            }
        default:
            break
        }

        let shown = key.isEmpty ? wholeFile : key
        switch resolutions[Conflict.id(path, shown)] {
        case .mine?: return mine
        case .theirs?: return theirs
        case nil:
            conflicts.append(Conflict(path: path, key: shown, mine: mine.map(describe), theirs: theirs.map(describe)))
            return mine
        }
    }

    private static func describe(_ v: JSONValue) -> String {
        if case .string(let s) = v { return s }
        let text = v.compact
        return text.count > 200 ? String(text.prefix(200)) + "…" : text
    }
}
