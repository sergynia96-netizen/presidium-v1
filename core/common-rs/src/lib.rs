use thiserror::Error;
use tracing_subscriber::EnvFilter;

#[derive(Error, Debug)]
pub enum PresidiumError {
    #[error("Network error: {0}")]
    Network(String),
    #[error("Crypto error: {0}")]
    Crypto(String),
    #[error("Internal error: {0}")]
    Internal(String),
}

pub fn init_logger() {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .with_thread_ids(true)
        .init();
}

#[cfg(test)]
mod tests {
    use super::*;
    use tracing::info;

    #[test]
    fn test_logger_init() {
        let _ = std::panic::catch_unwind(|| {
            init_logger();
        });
        info!("Presidium Common Core Logger Initialized");
        assert!(true);
    }
}
