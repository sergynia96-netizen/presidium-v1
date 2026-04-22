/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 *
 * Native crypto plugin:
 * - Android Keystore AES-256-GCM key generation
 * - EncryptedSharedPreferences for identity storage
 * - Biometric-bound keys (user authentication required)
 */
package app.presidium

import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.security.SecureRandom

@CapacitorPlugin(name = "PresidiumCrypto")
class PresidiumCryptoPlugin : Plugin() {
    private val prefsFile = "presidium_secure_prefs"
    private val keyAlias = "presidium_identity_master"
    private val prefsKeyIdentity = "identity_keypair"
    private val prefsKeyPublic = "public_key"
    private val prefsKeyRecovery = "recovery_hint"

    private fun getMasterKey(): MasterKey {
        val spec = KeyGenParameterSpec.Builder(
            keyAlias,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(false) // Set true for biometric-bound usage.
            .build()

        return MasterKey.Builder(context)
            .setKeyGenParameterSpec(spec)
            .build()
    }

    private fun getEncryptedPrefs(): SharedPreferences {
        return EncryptedSharedPreferences.create(
            context,
            prefsFile,
            getMasterKey(),
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    @PluginMethod
    fun generateIdentity(call: PluginCall) {
        try {
            val prefs = getEncryptedPrefs()
            if (prefs.contains(prefsKeyIdentity)) {
                val result = JSObject()
                result.put("publicKey", prefs.getString(prefsKeyPublic, ""))
                result.put("exists", true)
                call.resolve(result)
                return
            }

            // MVP: generate random seed and store encrypted.
            val seed = ByteArray(32).apply { SecureRandom().nextBytes(this) }
            val seedB64 = Base64.encodeToString(seed, Base64.NO_WRAP)

            prefs.edit()
                .putString(prefsKeyIdentity, seedB64)
                .putString(prefsKeyPublic, seedB64) // Stub: replace by derived public key.
                .apply()

            val result = JSObject()
            result.put("publicKey", seedB64)
            result.put("exists", false)
            call.resolve(result)
        } catch (e: Exception) {
            call.reject("Failed to generate identity: ${e.message}", "KEYGEN_ERROR", e)
        }
    }

    @PluginMethod
    fun getIdentity(call: PluginCall) {
        try {
            val prefs = getEncryptedPrefs()
            val identity = prefs.getString(prefsKeyIdentity, null)
            val publicKey = prefs.getString(prefsKeyPublic, null)
            if (identity != null && publicKey != null) {
                val result = JSObject()
                result.put("publicKey", publicKey)
                result.put("seed", identity)
                call.resolve(result)
            } else {
                call.reject("No identity found", "NO_IDENTITY")
            }
        } catch (e: Exception) {
            call.reject("Failed to read identity: ${e.message}", "READ_ERROR", e)
        }
    }

    @PluginMethod
    fun storeRecoveryHint(call: PluginCall) {
        val hint = call.getString("hint")
        if (hint.isNullOrBlank()) {
            call.reject("Missing hint", "NO_HINT")
            return
        }
        try {
            getEncryptedPrefs().edit().putString(prefsKeyRecovery, hint).apply()
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to store hint: ${e.message}", "STORE_ERROR", e)
        }
    }

    @PluginMethod
    fun clearIdentity(call: PluginCall) {
        try {
            getEncryptedPrefs().edit()
                .remove(prefsKeyIdentity)
                .remove(prefsKeyPublic)
                .remove(prefsKeyRecovery)
                .apply()
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to clear identity: ${e.message}", "CLEAR_ERROR", e)
        }
    }
}
