/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 */
package app.presidium

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "PresidiumBiometric")
class PresidiumBiometricPlugin : Plugin() {
    @PluginMethod
    fun authenticate(call: PluginCall) {
        val activity = bridge.activity as FragmentActivity
        val executor = ContextCompat.getMainExecutor(context)

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Presidium Security")
            .setSubtitle("Verify your identity to unlock encrypted vault")
            .setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_STRONG or
                    BiometricManager.Authenticators.DEVICE_CREDENTIAL
            )
            .build()

        val biometricPrompt = BiometricPrompt(
            activity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    val payload = JSObject()
                    payload.put("success", true)
                    payload.put("cryptoObject", result.cryptoObject != null)
                    call.resolve(payload)
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    call.reject("$errorCode: $errString", "AUTH_ERROR")
                }

                override fun onAuthenticationFailed() {
                    call.reject("Biometric authentication failed", "AUTH_FAILED")
                }
            }
        )

        biometricPrompt.authenticate(promptInfo)
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val manager = BiometricManager.from(context)
        val canAuth = manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)
        val payload = JSObject()
        payload.put("available", canAuth == BiometricManager.BIOMETRIC_SUCCESS)
        payload.put("strong", canAuth == BiometricManager.BIOMETRIC_SUCCESS)
        call.resolve(payload)
    }
}
