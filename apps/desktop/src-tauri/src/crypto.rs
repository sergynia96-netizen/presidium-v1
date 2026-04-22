/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 *
 * Pure-Rust NaCl implementation (crypto_box + ed25519-dalek)
 * Compatible with @presidium/shared-crypto (tweetnacl) on wire format
 */
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use crypto_box::{
    aead::{Aead, AeadCore},
    PublicKey, SalsaBox, SecretKey,
};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use keyring::Entry;
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};

#[derive(Debug, thiserror::Error)]
pub enum CryptoError {
    #[error("Keyring error: {0}")]
    Keyring(#[from] keyring::Error),
    #[error("Base64 error: {0}")]
    Base64(#[from] base64::DecodeError),
    #[error("Crypto error: {0}")]
    Crypto(String),
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KeyPairPayload {
    pub public_key: String,
    pub signing_public_key: String,
}

#[derive(Serialize, Deserialize)]
pub struct EncryptedPayload {
    pub encrypted: String,
    pub nonce: String,
}

pub struct CryptoEngine {
    pub signing_key: SigningKey,
    pub verifying_key: VerifyingKey,
    pub box_secret: SecretKey,
    pub box_public: PublicKey,
}

impl CryptoEngine {
    pub fn new() -> Result<Self, CryptoError> {
        if let Some(identity) = Self::load_from_keyring()? {
            log::info!("Loaded existing identity from OS keyring");
            return Ok(identity);
        }
        let identity = Self::generate()?;
        identity.save_to_keyring()?;
        log::info!("Generated new identity and saved to OS keyring");
        Ok(identity)
    }

    pub fn generate() -> Result<Self, CryptoError> {
        let signing_key = SigningKey::generate(&mut OsRng);
        let verifying_key = signing_key.verifying_key();
        let box_secret = SecretKey::generate(&mut OsRng);
        let box_public = box_secret.public_key();
        Ok(Self {
            signing_key,
            verifying_key,
            box_secret,
            box_public,
        })
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(64);
        bytes.extend_from_slice(&self.signing_key.to_bytes());
        bytes.extend_from_slice(&self.box_secret.to_bytes());
        bytes
    }

    pub fn from_bytes(bytes: &[u8]) -> Result<Self, CryptoError> {
        if bytes.len() != 64 {
            return Err(CryptoError::Crypto("Invalid key length".into()));
        }
        let signing_bytes: [u8; 32] = bytes[0..32]
            .try_into()
            .map_err(|_| CryptoError::Crypto("Invalid signing key bytes".into()))?;
        let box_bytes: [u8; 32] = bytes[32..64]
            .try_into()
            .map_err(|_| CryptoError::Crypto("Invalid box key bytes".into()))?;

        let signing_key = SigningKey::from_bytes(&signing_bytes);
        let verifying_key = signing_key.verifying_key();
        let box_secret = SecretKey::from(box_bytes);
        let box_public = box_secret.public_key();

        Ok(Self {
            signing_key,
            verifying_key,
            box_secret,
            box_public,
        })
    }

    pub fn save_to_keyring(&self) -> Result<(), CryptoError> {
        let entry = Entry::new("presidium", "identity_key")?;
        let b64 = BASE64.encode(self.to_bytes());
        entry.set_password(&b64)?;
        Ok(())
    }

    pub fn load_from_keyring() -> Result<Option<Self>, CryptoError> {
        let entry = Entry::new("presidium", "identity_key")?;
        match entry.get_password() {
            Ok(b64) => {
                let bytes = BASE64.decode(b64)?;
                Ok(Some(Self::from_bytes(&bytes)?))
            }
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn get_keypair_payload(&self) -> KeyPairPayload {
        KeyPairPayload {
            public_key: BASE64.encode(self.box_public.as_bytes()),
            signing_public_key: BASE64.encode(self.verifying_key.as_bytes()),
        }
    }

    pub fn encrypt(
        &self,
        message: &[u8],
        recipient_b64: &str,
    ) -> Result<EncryptedPayload, CryptoError> {
        let recipient_bytes = BASE64.decode(recipient_b64)?;
        let recipient_key: [u8; 32] = recipient_bytes
            .try_into()
            .map_err(|_| CryptoError::Crypto("Invalid recipient key length".into()))?;
        let recipient_public = PublicKey::from(recipient_key);

        let nonce = SalsaBox::generate_nonce(&mut OsRng);
        let b = SalsaBox::new(&recipient_public, &self.box_secret);
        let ciphertext = b
            .encrypt(&nonce, message)
            .map_err(|e| CryptoError::Crypto(format!("Encryption failed: {:?}", e)))?;

        Ok(EncryptedPayload {
            encrypted: BASE64.encode(ciphertext),
            nonce: BASE64.encode(&nonce[..]),
        })
    }

    pub fn decrypt(
        &self,
        encrypted_b64: &str,
        nonce_b64: &str,
        sender_b64: &str,
    ) -> Result<Vec<u8>, CryptoError> {
        let sender_bytes = BASE64.decode(sender_b64)?;
        let sender_key: [u8; 32] = sender_bytes
            .try_into()
            .map_err(|_| CryptoError::Crypto("Invalid sender key length".into()))?;
        let sender_public = PublicKey::from(sender_key);

        let ciphertext = BASE64.decode(encrypted_b64)?;
        let nonce_bytes = BASE64.decode(nonce_b64)?;
        let nonce_key: [u8; 24] = nonce_bytes
            .try_into()
            .map_err(|_| CryptoError::Crypto("Invalid nonce length".into()))?;
        let nonce = nonce_key.into();

        let b = SalsaBox::new(&sender_public, &self.box_secret);
        let plaintext = b
            .decrypt(&nonce, ciphertext.as_ref())
            .map_err(|e| CryptoError::Crypto(format!("Decryption failed: {:?}", e)))?;

        Ok(plaintext)
    }

    pub fn sign(&self, message: &[u8]) -> String {
        let signature = self.signing_key.sign(message);
        BASE64.encode(signature.to_bytes())
    }

    pub fn verify(
        &self,
        message: &[u8],
        signature_b64: &str,
        verifying_key_b64: &str,
    ) -> Result<bool, CryptoError> {
        let vk_bytes = BASE64.decode(verifying_key_b64)?;
        let vk_key: [u8; 32] = vk_bytes
            .try_into()
            .map_err(|_| CryptoError::Crypto("Invalid verifying key length".into()))?;
        let vk = VerifyingKey::from_bytes(&vk_key)
            .map_err(|e| CryptoError::Crypto(format!("Invalid verifying key: {:?}", e)))?;

        let sig_bytes = BASE64.decode(signature_b64)?;
        let sig_key: [u8; 64] = sig_bytes
            .try_into()
            .map_err(|_| CryptoError::Crypto("Invalid signature length".into()))?;
        let signature = Signature::from_bytes(&sig_key);

        Ok(vk.verify(message, &signature).is_ok())
    }
}
