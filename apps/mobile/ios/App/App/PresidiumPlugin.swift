/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 *
 * iOS Keychain + LocalAuthentication plugin
 */
import Capacitor
import LocalAuthentication
import Security

@objc(PresidiumCrypto)
public class PresidiumPlugin: CAPPlugin {
    private let keychainService = "app.presidium.messenger"
    private let identityKey = "presidium_identity"

    @objc func generateIdentity(_ call: CAPPluginCall) {
        let context = LAContext()
        var error: NSError?

        let canEvaluate = context.canEvaluatePolicy(
            .deviceOwnerAuthenticationWithBiometrics,
            error: &error
        )

        guard canEvaluate else {
            call.reject("Face ID / Touch ID not available", "BIOMETRIC_UNAVAILABLE")
            return
        }

        let seed = Data((0..<32).map { _ in UInt8.random(in: 0...255) })
        let tag = "\(keychainService).\(identityKey)".data(using: .utf8)!

        let deleteQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: identityKey
        ]
        SecItemDelete(deleteQuery as CFDictionary)

        let attributes: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: identityKey,
            kSecAttrApplicationTag as String: tag,
            kSecValueData as String: seed,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            kSecUseAuthenticationContext as String: context
        ]

        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else {
            call.reject("Failed to store identity: \(status)", "KEYCHAIN_ERROR")
            return
        }

        call.resolve([
            "publicKey": seed.base64EncodedString(), // Stub: derive real public key.
            "exists": false
        ])
    }

    @objc func getIdentity(_ call: CAPPluginCall) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: identityKey,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess, let data = result as? Data else {
            call.reject("Identity not found in Keychain", "NO_IDENTITY")
            return
        }

        call.resolve([
            "seed": data.base64EncodedString(),
            "publicKey": data.base64EncodedString() // Stub: derive real public key.
        ])
    }

    @objc func storeRecoveryHint(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func clearIdentity(_ call: CAPPluginCall) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: identityKey
        ]
        SecItemDelete(query as CFDictionary)
        call.resolve()
    }
}

@objc(PresidiumBiometric)
public class PresidiumBiometricPlugin: CAPPlugin {
    @objc func authenticate(_ call: CAPPluginCall) {
        let context = LAContext()
        context.localizedReason = "Unlock Presidium encrypted vault"

        context.evaluatePolicy(
            .deviceOwnerAuthenticationWithBiometrics,
            localizedReason: context.localizedReason
        ) { success, error in
            DispatchQueue.main.async {
                if success {
                    call.resolve([
                        "success": true,
                        "cryptoObject": false
                    ])
                } else {
                    call.reject(error?.localizedDescription ?? "Unknown error", "AUTH_FAILED")
                }
            }
        }
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        let context = LAContext()
        var error: NSError?
        let available = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
        call.resolve([
            "available": available,
            "strong": available
        ])
    }
}
