/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 */
import UIKit
import Capacitor
import PushKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        let registry = PKPushRegistry(queue: DispatchQueue.main)
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        NotificationCenter.default.post(
            name: Notification.Name("APNSToken"),
            object: nil,
            userInfo: ["token": deviceToken.map { String(format: "%02.2hhx", $0) }.joined()]
        )
    }
}

extension AppDelegate: PKPushRegistryDelegate {
    func pushRegistry(
        _ registry: PKPushRegistry,
        didUpdate credentials: PKPushCredentials,
        for type: PKPushType
    ) {
        let token = credentials.token.map { String(format: "%02.2hhx", $0) }.joined()
        NotificationCenter.default.post(
            name: Notification.Name("VoIPToken"),
            object: nil,
            userInfo: ["token": token]
        )
    }

    func pushRegistry(
        _ registry: PKPushRegistry,
        didReceiveIncomingPushWith payload: PKPushPayload,
        for type: PKPushType,
        completion: @escaping () -> Void
    ) {
        NotificationCenter.default.post(
            name: Notification.Name("VoIPMessage"),
            object: nil,
            userInfo: payload.dictionaryPayload
        )
        completion()
    }
}
