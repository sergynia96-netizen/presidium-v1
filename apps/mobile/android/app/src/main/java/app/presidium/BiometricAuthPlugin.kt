package app.presidium

import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.concurrent.Executor

@CapacitorPlugin(name = "BiometricAuth")
class BiometricAuthPlugin : Plugin() {
    private lateinit var executor: Executor

    override fun load() {
        executor = ContextCompat.getMainExecutor(context)
    }

    @PluginMethod
    fun authenticate(call: PluginCall) {
        val activity = bridge.activity as FragmentActivity

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(call.getString("title", "Authentication Required")!!)
            .setSubtitle(call.getString("subtitle", "Verify your identity"))
            .setNegativeButtonText(call.getString("cancelText", "Cancel")!!)
            .setAllowedAuthenticators(androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .build()

        val prompt = BiometricPrompt(
            activity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    val payload = JSObject()
                    payload.put("success", true)
                    call.resolve(payload)
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    call.reject("AUTH_ERROR", errString.toString())
                }

                override fun onAuthenticationFailed() {
                    call.reject("AUTH_FAILED", "Biometric authentication failed")
                }
            }
        )

        prompt.authenticate(promptInfo)
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val manager = androidx.biometric.BiometricManager.from(context)
        val result = manager.canAuthenticate(androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG)

        val payload = JSObject()
        payload.put("available", result == androidx.biometric.BiometricManager.BIOMETRIC_SUCCESS)
        call.resolve(payload)
    }
}
