/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 */
package app.presidium

import android.os.Bundle
import android.view.WindowManager
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(PresidiumCryptoPlugin::class.java)
        registerPlugin(PresidiumBiometricPlugin::class.java)
        registerPlugin(PresidiumPushPlugin::class.java)
        super.onCreate(savedInstanceState)
        // Prevent screenshots and screen recording for secret channels.
        window.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        )
    }
}
