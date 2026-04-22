package app.presidium

import android.content.Intent
import com.huawei.hms.push.HmsMessageService
import com.huawei.hms.push.RemoteMessage
import org.json.JSONObject

class HMSPushService : HmsMessageService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)

        val payload = JSONObject()
            .put("token", token)
            .put("provider", "hms")
            .toString()

        sendBroadcast(Intent("app.presidium.PUSH_TOKEN").putExtra("payload", payload))
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        val payload = if (message.data.isNullOrBlank()) {
            JSONObject().toString()
        } else {
            message.data
        }
        sendBroadcast(Intent("app.presidium.PUSH_MESSAGE").putExtra("payload", payload))
    }
}
