use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{Connection, OpenFlags};

use super::errors::HistoryError;

pub fn open_copied_database(database_path: &Path) -> Result<CopiedDatabase, HistoryError> {
    let temp_dir = unique_temp_dir()?;
    fs::create_dir_all(&temp_dir)?;

    let file_name = database_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("database.sqlite");
    let copied_database_path = temp_dir.join(file_name);
    fs::copy(database_path, &copied_database_path)?;

    copy_sidecar(database_path, &copied_database_path, "-wal")?;
    copy_sidecar(database_path, &copied_database_path, "-shm")?;

    let connection = Connection::open_with_flags(
        &copied_database_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;

    Ok(CopiedDatabase {
        connection,
        temp_dir,
    })
}

pub struct CopiedDatabase {
    pub connection: Connection,
    temp_dir: PathBuf,
}

impl Drop for CopiedDatabase {
    fn drop(&mut self) {
        let placeholder = Connection::open_in_memory().unwrap();
        let connection = std::mem::replace(&mut self.connection, placeholder);
        let _ = connection.close();
        let _ = fs::remove_dir_all(&self.temp_dir);
    }
}

fn copy_sidecar(
    source_database_path: &Path,
    copied_database_path: &Path,
    suffix: &str,
) -> Result<(), HistoryError> {
    let source_sidecar = sidecar_path(source_database_path, suffix);
    if !source_sidecar.is_file() {
        return Ok(());
    }

    let destination_sidecar = sidecar_path(copied_database_path, suffix);
    fs::copy(source_sidecar, destination_sidecar)?;
    Ok(())
}

fn sidecar_path(path: &Path, suffix: &str) -> PathBuf {
    PathBuf::from(format!("{}{suffix}", path.to_string_lossy()))
}

fn unique_temp_dir() -> Result<PathBuf, HistoryError> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| HistoryError::BackgroundTaskJoin(error.to_string()))?
        .as_millis();
    Ok(std::env::temp_dir().join(format!("quest-history-{now}-{}", std::process::id())))
}
