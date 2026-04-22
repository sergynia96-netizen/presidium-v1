package app.presidium

import android.app.Service
import android.content.Intent
import android.os.IBinder

class PresidiumForegroundService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null
}
