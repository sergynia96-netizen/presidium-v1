/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 */
use std::path::PathBuf;

use rusqlite::{params, Connection, Result};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MessageRecord {
    pub id: String,
    pub chat_id: String,
    pub sender_id: String,
    pub encrypted_payload: String,
    pub nonce: String,
    pub msg_type: String,
    pub status: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ChatRecord {
    pub id: String,
    pub name: Option<String>,
    pub chat_type: String,
    pub avatar: Option<String>,
    pub last_message_at: Option<i64>,
    pub unread_count: i32,
    pub is_encrypted: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ContactRecord {
    pub id: String,
    pub name: String,
    pub public_key: String,
    pub status: String,
    pub last_seen: Option<i64>,
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new() -> std::result::Result<Self, Box<dyn std::error::Error>> {
        let path = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("Presidium")
            .join("presidium.db");

        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let conn = Connection::open(path)?;
        conn.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;
            PRAGMA synchronous = NORMAL;

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                chat_id TEXT NOT NULL,
                sender_id TEXT NOT NULL,
                encrypted_payload TEXT NOT NULL,
                nonce TEXT NOT NULL,
                type TEXT DEFAULT 'text',
                status TEXT DEFAULT 'delivered',
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

            CREATE TABLE IF NOT EXISTS chats (
                id TEXT PRIMARY KEY,
                name TEXT,
                type TEXT NOT NULL,
                avatar TEXT,
                last_message_at INTEGER,
                unread_count INTEGER DEFAULT 0,
                is_encrypted INTEGER DEFAULT 1
            );
            CREATE INDEX IF NOT EXISTS idx_chats_last_msg ON chats(last_message_at DESC);

            CREATE TABLE IF NOT EXISTS contacts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                public_key TEXT NOT NULL,
                status TEXT DEFAULT 'offline',
                last_seen INTEGER
            );
        ",
        )?;

        Ok(Self { conn })
    }

    pub fn insert_message(&self, msg: &MessageRecord) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO messages (id, chat_id, sender_id, encrypted_payload, nonce, type, status, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                &msg.id,
                &msg.chat_id,
                &msg.sender_id,
                &msg.encrypted_payload,
                &msg.nonce,
                &msg.msg_type,
                &msg.status,
                msg.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_messages(&self, chat_id: &str, limit: usize) -> Result<Vec<MessageRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, chat_id, sender_id, encrypted_payload, nonce, type, status, created_at
             FROM messages WHERE chat_id = ?1 ORDER BY created_at DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![chat_id, limit], |row| {
            Ok(MessageRecord {
                id: row.get(0)?,
                chat_id: row.get(1)?,
                sender_id: row.get(2)?,
                encrypted_payload: row.get(3)?,
                nonce: row.get(4)?,
                msg_type: row.get(5)?,
                status: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?;
        rows.collect()
    }

    pub fn upsert_chat(&self, chat: &ChatRecord) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO chats (id, name, type, avatar, last_message_at, unread_count, is_encrypted)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                &chat.id,
                &chat.name,
                &chat.chat_type,
                &chat.avatar,
                chat.last_message_at,
                chat.unread_count,
                chat.is_encrypted,
            ],
        )?;
        Ok(())
    }

    pub fn get_chats(&self) -> Result<Vec<ChatRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, type, avatar, last_message_at, unread_count, is_encrypted
             FROM chats ORDER BY COALESCE(last_message_at, 0) DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(ChatRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                chat_type: row.get(2)?,
                avatar: row.get(3)?,
                last_message_at: row.get(4)?,
                unread_count: row.get(5)?,
                is_encrypted: row.get(6)?,
            })
        })?;
        rows.collect()
    }

    pub fn upsert_contact(&self, contact: &ContactRecord) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO contacts (id, name, public_key, status, last_seen)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                &contact.id,
                &contact.name,
                &contact.public_key,
                &contact.status,
                contact.last_seen,
            ],
        )?;
        Ok(())
    }

    pub fn get_contacts(&self) -> Result<Vec<ContactRecord>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, public_key, status, last_seen FROM contacts ORDER BY name")?;
        let rows = stmt.query_map([], |row| {
            Ok(ContactRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                public_key: row.get(2)?,
                status: row.get(3)?,
                last_seen: row.get(4)?,
            })
        })?;
        rows.collect()
    }
}