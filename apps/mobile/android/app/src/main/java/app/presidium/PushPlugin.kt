/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 *
 * Unified push: Firebase Cloud Messaging (Google) + HMS Push Kit (Huawei)
 * Falls back to HMS if Google Play Services unavailable.
 */
package app.presidium

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.firebase.messaging.FirebaseMessaging
import com.huawei.hms.push.HmsInstanceId

@CapacitorPlugin(name = "PresidiumPush")
class PresidiumPushPlugin : Plugin() {
    @PluginMethod
    fun getToken(call: PluginCall) {
        try {
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                if (!task.isSuccessful) {
                    tryHms(call)
                    return@addOnCompleteListener
                }

                val payload = JSObject()
                payload.put("token", task.result)
                payload.put("provider", "fcm")
                call.resolve(payload)
            }
        } catch (_: Exception) {
            tryHms(call)
        }
    }

    private fun tryHms(call: PluginCall) {
        try {
            val hmsToken = HmsInstanceId.getInstance(context).getToken("YOUR_HMS_APP_ID", "HCM")
            if (!hmsToken.isNullOrEmpty()) {
                val payload = JSObject()
                payload.put("token", hmsToken)
                payload.put("provider", "hms")
                call.resolve(payload)
            } else {
                call.reject("Neither FCM nor HMS available", "NO_PUSH")
            }
        } catch (e: Exception) {
            call.reject(e.message ?: "Push token error", "PUSH_ERROR", e)
        }
    }

    @PluginMethod
    fun requestPermissions(call: PluginCall) {
        val payload = JSObject()
        payload.put("granted", true)
        call.resolve(payload)
    }
}
