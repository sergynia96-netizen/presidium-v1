/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 *
 * Presidium Desktop — Tauri v2 Entry Point
 * E2EE keys in OS Keychain, SQLite local cache, WebSocket relay client
 */
use std::sync::Arc;

use tauri::Manager;
use tauri_plugin_updater::UpdaterExt;
use tokio::sync::Mutex;

pub mod commands;
pub mod crypto;
pub mod db;
pub mod notifications;
pub mod tray;
pub mod ws;

pub struct AppState {
    pub crypto: Arc<std::sync::Mutex<crypto::CryptoEngine>>,
    pub db: Arc<std::sync::Mutex<db::Database>>,
    pub ws: Arc<Mutex<Option<ws::WsClient>>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_log::Builder::new().build())
        .manage(AppState {
            crypto: Arc::new(std::sync::Mutex::new(
                crypto::CryptoEngine::new().expect("Failed to initialize crypto engine"),
            )),
            db: Arc::new(std::sync::Mutex::new(
                db::Database::new().expect("Failed to initialize database"),
            )),
            ws: Arc::new(Mutex::new(None)),
        })
        .invoke_handler(tauri::generate_handler![
            commands::generate_keys,
            commands::get_public_key,
            commands::encrypt_message,
            commands::decrypt_message,
            commands::connect_ws,
            commands::send_ws_message,
            commands::disconnect_ws,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tray::setup_tray(&handle)?;

            tauri::async_runtime::spawn(async move {
                match handle.updater() {
                    Ok(updater) => match updater.check().await {
                        Ok(Some(update)) => {
                            log::info!("Update available: {}", update.version);
                            if let Err(e) = update.download_and_install(|_, _| {}, || {}).await {
                                log::error!("Update install failed: {}", e);
                            }
                        }
                        Ok(None) => log::info!("No updates available"),
                        Err(e) => log::error!("Update check failed: {}", e),
                    },
                    Err(e) => log::error!("Updater init failed: {}", e),
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
