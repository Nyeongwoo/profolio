import Foundation
import Security

/// The GitHub token, kept in the keychain.
///
/// It goes to the iCloud-synced keychain when possible, so signing in on one
/// Mac signs in every Mac. That keychain needs an app signed with a
/// development team; an ad-hoc signed build gets errSecMissingEntitlement and
/// the token stays in this Mac's login keychain instead. There it's stored
/// open to any app of this user: an ad-hoc build's identity changes with
/// every update, so an item tied to the build that saved it couldn't be
/// replaced (errSecInvalidOwnerEdit) by the next one.
enum TokenStore {
    private static let service = "com.nnwoo.Pofole.github"
    private static let account = "token"

    private static func query(dataProtection: Bool) -> [CFString: Any] {
        [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecAttrSynchronizable: kSecAttrSynchronizableAny,
            kSecUseDataProtectionKeychain: dataProtection,
        ]
    }

    static func load() -> String? {
        for dataProtection in [true, false] {
            var q = query(dataProtection: dataProtection)
            q[kSecReturnData] = true
            q[kSecMatchLimit] = kSecMatchLimitOne
            var out: CFTypeRef?
            if SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess,
               let data = out as? Data, let token = String(data: data, encoding: .utf8) {
                return token
            }
        }
        return nil
    }

    /// Returns whether the token is synced through iCloud Keychain.
    @discardableResult
    static func save(_ token: String) throws -> Bool {
        delete()
        var status: OSStatus = errSecSuccess
        for synced in [true, false] {
            var q = query(dataProtection: synced)
            q[kSecAttrSynchronizable] = synced
            q[kSecValueData] = Data(token.utf8)
            q[kSecAttrLabel] = "Profolio — GitHub"
            if !synced, let access = openAccess() { q[kSecAttrAccess] = access }
            status = SecItemAdd(q as CFDictionary, nil)
            if status == errSecSuccess { return synced }
            if status == errSecDuplicateItem {
                // Left by an earlier build that this one can't delete.
                var match = query(dataProtection: synced)
                match[kSecAttrSynchronizable] = synced
                status = SecItemUpdate(match as CFDictionary, [kSecValueData: Data(token.utf8)] as CFDictionary)
                if status == errSecSuccess { return synced }
            }
        }
        throw NSError(domain: NSOSStatusErrorDomain, code: Int(status), userInfo: [
            NSLocalizedDescriptionKey: "Couldn't save the token to the keychain (\(status)).",
        ])
    }

    /// Every operation allowed to any app, without asking.
    private static func openAccess() -> SecAccess? {
        var access: SecAccess?
        guard SecAccessCreate("Profolio — GitHub" as CFString, [] as CFArray, &access) == errSecSuccess, let access else { return nil }
        var acls: CFArray?
        SecAccessCopyACLList(access, &acls)
        for case let acl as SecACL in (acls as? [Any] ?? []) {
            SecACLSetContents(acl, nil, "Profolio — GitHub" as CFString, [])
        }
        return access
    }

    static func delete() {
        for dataProtection in [true, false] {
            SecItemDelete(query(dataProtection: dataProtection) as CFDictionary)
        }
    }
}
