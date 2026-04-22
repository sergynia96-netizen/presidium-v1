/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 */
use tauri::State;

use crate::{
    crypto::{EncryptedPayload, KeyPairPayload},
    AppState,
};

#[tauri::command]
pub fn generate_keys(state: State<'_, AppState>) -> Result<KeyPairPayload, String> {
    let crypto = state.crypto.lock().map_err(|e| e.to_string())?;
    Ok(crypto.get_keypair_payload())
}

#[tauri::command]
pub fn get_public_key(state: State<'_, AppState>) -> Result<KeyPairPayload, String> {
    let crypto = state.crypto.lock().map_err(|e| e.to_string())?;
    Ok(crypto.get_keypair_payload())
}

#[tauri::command]
pub fn encrypt_message(
    message: String,
    recipient_public_key: String,
    state: State<'_, AppState>,
) -> Result<EncryptedPayload, String> {
    let crypto = state.crypto.lock().map_err(|e| e.to_string())?;
    crypto
        .encrypt(message.as_bytes(), &recipient_public_key)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn decrypt_message(
    encrypted: String,
    nonce: String,
    sender_public_key: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let crypto = state.crypto.lock().map_err(|e| e.to_string())?;
    let bytes = crypto
        .decrypt(&encrypted, &nonce, &sender_public_key)
        .map_err(|e| e.to_string())?;
    String::from_utf8(bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn connect_ws(
    url: String,
    token: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let client = crate::ws::WsClient::new(url, token, app);
    client.connect().await.map_err(|e| e.to_string())?;
    let mut ws_guard = state.ws.lock().await;
    *ws_guard = Some(client);
    Ok(())
}

#[tauri::command]
pub async fn send_ws_message(payload: String, state: State<'_, AppState>) -> Result<(), String> {
    let ws_guard = state.ws.lock().await;
    if let Some(client) = ws_guard.as_ref() {
        client.send(payload).await
    } else {
        Err("WebSocket not connected".into())
    }
}

#[tauri::command]
pub async fn disconnect_ws(state: State<'_, AppState>) -> Result<(), String> {
    let mut ws_guard = state.ws.lock().await;
    if let Some(client) = ws_guard.take() {
        client.disconnect().await;
    }
    Ok(())
}
