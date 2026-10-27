import Foundation
import Security

/// The Vercel token (vercel.com/account/tokens), kept in this Mac's
/// keychain. Only Connect Domain uses it.
enum VercelToken {
    private static let base: [CFString: Any] = [
        kSecClass: kSecClassGenericPassword,
        kSecAttrService: "com.nnwoo.Pofole.vercel",
        kSecAttrAccount: "token",
    ]

    static func load() -> String? {
        var q = base
        q[kSecReturnData] = true
        q[kSecMatchLimit] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func save(_ token: String) {
        delete()
        var q = base
        q[kSecValueData] = Data(token.utf8)
        q[kSecAttrLabel] = "Profolio — Vercel"
        SecItemAdd(q as CFDictionary, nil)
    }

    static func delete() { SecItemDelete(base as CFDictionary) }
}

/// The few Vercel API calls Connect Domain needs: find the project built
/// from a GitHub repository, add a domain to it, read what DNS it needs.
struct VercelClient {
    let token: String

    struct Failure: LocalizedError {
        let status: Int
        let errorDescription: String?
    }

    struct Project { let id: String; let name: String; let teamID: String?; let teamName: String? }

    struct Domain {
        let name: String
        let verified: Bool
        /// TXT records Vercel wants first when the domain is used elsewhere.
        let verification: [(type: String, name: String, value: String)]
    }

    /// What to put at the domain's DNS provider.
    struct DNS {
        let misconfigured: Bool
        let records: [(type: String, name: String, value: String)]
    }

    private func call(_ method: String, _ path: String, team: String? = nil, body: [String: Any]? = nil) async throws -> [String: Any] {
        var comps = URLComponents(string: "https://api.vercel.com" + path)!
        if let team { comps.queryItems = (comps.queryItems ?? []) + [URLQueryItem(name: "teamId", value: team)] }
        var req = URLRequest(url: comps.url!)
        req.httpMethod = method
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        guard (200..<300).contains(status) else {
            let message = (json["error"] as? [String: Any])?["message"] as? String
            throw Failure(status: status, errorDescription: status == 401 || status == 403
                          ? "Vercel didn’t accept the token\(message.map { ": \($0)" } ?? ""). Make a new one at vercel.com/account/tokens."
                          : message ?? "Vercel answered \(status).")
        }
        return json
    }

    /// The account's username (checks the token).
    func username() async throws -> String {
        let r = try await call("GET", "/v2/user")
        return (r["user"] as? [String: Any])?["username"] as? String ?? "?"
    }

    /// The project deployed from github.com/owner/repo, in the personal
    /// account or any team the token can see.
    func project(owner: String, repo: String) async throws -> Project? {
        var scopes: [(String?, String?)] = [(nil, nil)]
        if let teams = try? await call("GET", "/v2/teams")["teams"] as? [[String: Any]] {
            scopes += teams.compactMap { t in (t["id"] as? String).map { ($0, t["name"] as? String ?? t["slug"] as? String) } }
        }
        for (team, teamName) in scopes {
            var comps = URLComponents()
            comps.queryItems = [URLQueryItem(name: "search", value: repo), URLQueryItem(name: "limit", value: "100")]
            guard let r = try? await call("GET", "/v9/projects?\(comps.percentEncodedQuery ?? "")", team: team),
                  let projects = r["projects"] as? [[String: Any]] else { continue }
            for p in projects {
                let link = p["link"] as? [String: Any]
                if (link?["repo"] as? String)?.lowercased() == repo.lowercased(),
                   ((link?["org"] as? String) ?? (link?["repoOwner"] as? String))?.lowercased() == owner.lowercased(),
                   let id = p["id"] as? String {
                    return Project(id: id, name: p["name"] as? String ?? repo, teamID: team, teamName: teamName)
                }
            }
        }
        return nil
    }

    func domains(of p: Project) async throws -> [Domain] {
        let r = try await call("GET", "/v9/projects/\(p.id)/domains", team: p.teamID)
        return (r["domains"] as? [[String: Any]] ?? []).map(Self.domain)
    }

    func add(_ name: String, to p: Project) async throws -> Domain {
        Self.domain(try await call("POST", "/v10/projects/\(p.id)/domains", team: p.teamID, body: ["name": name]))
    }

    func verify(_ name: String, in p: Project) async throws -> Domain {
        Self.domain(try await call("POST", "/v9/projects/\(p.id)/domains/\(name)/verify", team: p.teamID))
    }

    func remove(_ name: String, from p: Project) async throws {
        _ = try await call("DELETE", "/v9/projects/\(p.id)/domains/\(name)", team: p.teamID)
    }

    /// The records the domain needs: an A record for an apex domain
    /// (example.com), a CNAME for a subdomain (www.example.com).
    func dns(for name: String, in p: Project) async throws -> DNS {
        let r = try await call("GET", "/v6/domains/\(name)/config", team: p.teamID)
        let apex = Self.isApex(name)
        if apex {
            let ip = ((r["recommendedIPv4"] as? [[String: Any]])?.first?["value"] as? [String])?.first ?? "76.76.21.21"
            return DNS(misconfigured: r["misconfigured"] as? Bool ?? true, records: [("A", "@", ip)])
        }
        let cname = ((r["recommendedCNAME"] as? [[String: Any]])?.first?["value"] as? String) ?? "cname.vercel-dns.com"
        let host = name.split(separator: ".").dropLast(Self.registrableParts(name)).joined(separator: ".")
        return DNS(misconfigured: r["misconfigured"] as? Bool ?? true, records: [("CNAME", host, cname.hasSuffix(".") ? String(cname.dropLast()) : cname)])
    }

    /// example.com yes, www.example.com no.
    static func isApex(_ name: String) -> Bool { name.split(separator: ".").count == registrableParts(name) }

    /// How many labels the registered domain has: 2 (example.com), or 3
    /// under a two-part ending such as .co.uk or .co.kr.
    static func registrableParts(_ name: String) -> Int {
        let parts = name.split(separator: ".")
        let twoPart = parts.count >= 3 && parts.last!.count == 2 && ["co", "com", "or", "ne", "ac", "go", "org", "net"].contains(parts[parts.count - 2])
        return twoPart ? 3 : 2
    }

    private static func domain(_ d: [String: Any]) -> Domain {
        Domain(name: d["name"] as? String ?? "", verified: d["verified"] as? Bool ?? false,
               verification: (d["verification"] as? [[String: Any]] ?? []).map {
                   ($0["type"] as? String ?? "TXT", $0["domain"] as? String ?? "", $0["value"] as? String ?? "")
               })
    }
}
