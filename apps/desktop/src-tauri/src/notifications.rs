/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 */
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

pub fn show_notification(app: &AppHandle, title: &str, body: &str) {
    if let Err(e) = app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .icon("icon")
        .show()
    {
        log::error!("Notification error: {}", e);
    }
}
