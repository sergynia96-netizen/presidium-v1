/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 */
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use futures_util::{SinkExt, StreamExt};
use tauri::Emitter;
use tokio::sync::{mpsc, RwLock};
use tokio::time::{sleep, Duration};
use tokio_tungstenite::{
    connect_async,
    tungstenite::protocol::Message,
    MaybeTlsStream,
    WebSocketStream,
};
use url::Url;

type WsStream = WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>;

pub struct WsClient {
    url: String,
    token: String,
    sender: Arc<RwLock<Option<mpsc::UnboundedSender<String>>>>,
    app_handle: tauri::AppHandle,
    running: Arc<AtomicBool>,
}

impl WsClient {
    pub fn new(url: String, token: String, app_handle: tauri::AppHandle) -> Self {
        Self {
            url,
            token,
            sender: Arc::new(RwLock::new(None)),
            app_handle,
            running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub async fn connect(&self) -> Result<(), Box<dyn std::error::Error>> {
        if self.running.load(Ordering::SeqCst) {
            return Ok(());
        }

        self.running.store(true, Ordering::SeqCst);

        let url = self.url.clone();
        let token = self.token.clone();
        let sender_ref = Arc::clone(&self.sender);
        let app_handle = self.app_handle.clone();
        let running = Arc::clone(&self.running);

        tokio::spawn(async move {
            let mut backoff_secs = 1u64;

            while running.load(Ordering::SeqCst) {
                let mut parsed = match Url::parse(&url) {
                    Ok(u) => u,
                    Err(err) => {
                        log::error!("Invalid WS URL: {}", err);
                        let _ = app_handle.emit("ws-error", format!("Invalid URL: {err}"));
                        break;
                    }
                };
                parsed.query_pairs_mut().append_pair("token", &token);

                match connect_async(parsed.as_str()).await {
                    Ok((stream, _)) => {
                        log::info!("WS connected");
                        let _ = app_handle.emit("ws-status", "connected");
                        backoff_secs = 1;

                        if let Err(err) = handle_connection(
                            stream,
                            Arc::clone(&sender_ref),
                            app_handle.clone(),
                            Arc::clone(&running),
                        )
                        .await
                        {
                            log::warn!("WS connection ended: {}", err);
                        }
                    }
                    Err(err) => {
                        log::warn!("WS connect failed: {}", err);
                        let _ = app_handle.emit("ws-error", format!("Connect failed: {err}"));
                    }
                }

                {
                    let mut sender_guard = sender_ref.write().await;
                    *sender_guard = None;
                }

                let _ = app_handle.emit("ws-status", "disconnected");

                if !running.load(Ordering::SeqCst) {
                    break;
                }

                sleep(Duration::from_secs(backoff_secs)).await;
                backoff_secs = (backoff_secs * 2).min(30);
            }
        });

        Ok(())
    }

    pub async fn send(&self, msg: String) -> Result<(), String> {
        let sender_guard = self.sender.read().await;
        if let Some(sender) = sender_guard.as_ref() {
            sender.send(msg).map_err(|err| err.to_string())
        } else {
            Err("WebSocket not connected".into())
        }
    }

    pub async fn disconnect(&self) {
        self.running.store(false, Ordering::SeqCst);
        let mut sender_guard = self.sender.write().await;
        *sender_guard = None;
    }
}

async fn handle_connection(
    stream: WsStream,
    sender_ref: Arc<RwLock<Option<mpsc::UnboundedSender<String>>>>,
    app_handle: tauri::AppHandle,
    running: Arc<AtomicBool>,
) -> Result<(), Box<dyn std::error::Error>> {
    let (mut write, mut read) = stream.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    {
        let mut sender_guard = sender_ref.write().await;
        *sender_guard = Some(tx);
    }

    let outbound = async {
        while running.load(Ordering::SeqCst) {
            let Some(msg) = rx.recv().await else {
                break;
            };

            if write.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    };

    let inbound = async {
        while running.load(Ordering::SeqCst) {
            let Some(frame) = read.next().await else {
                break;
            };

            match frame {
                Ok(Message::Text(text)) => {
                    if let Err(err) = app_handle.emit("ws-message", text.to_string()) {
                        log::error!("Failed to emit WS message: {}", err);
                    }
                }
                Ok(Message::Close(_)) => {
                    log::warn!("WS closed by server");
                    break;
                }
                Ok(Message::Ping(_)) => {
                    log::debug!("WS ping received");
                }
                Ok(_) => {}
                Err(err) => {
                    log::error!("WS read error: {}", err);
                    break;
                }
            }
        }
    };

    tokio::select! {
        _ = outbound => {}
        _ = inbound => {}
    }

    Ok(())
}