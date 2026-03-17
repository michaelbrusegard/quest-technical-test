use std::{fmt, io};

#[derive(Debug)]
pub enum HistoryError {
    HomeDirectoryUnavailable,
    InvalidCursor(String),
    Io(io::Error),
    Sqlite(rusqlite::Error),
    BackgroundTaskJoin(String),
}

impl fmt::Display for HistoryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::HomeDirectoryUnavailable => {
                f.write_str("Unable to resolve the current user's home directory")
            }
            Self::InvalidCursor(source_id) => {
                write!(
                    f,
                    "Received an invalid history cursor for source '{source_id}'"
                )
            }
            Self::Io(error) => error.fmt(f),
            Self::Sqlite(error) => error.fmt(f),
            Self::BackgroundTaskJoin(error) => error.fmt(f),
        }
    }
}

impl std::error::Error for HistoryError {}

impl From<io::Error> for HistoryError {
    fn from(value: io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<rusqlite::Error> for HistoryError {
    fn from(value: rusqlite::Error) -> Self {
        Self::Sqlite(value)
    }
}
