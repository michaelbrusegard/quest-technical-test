mod history;
mod memory;

use sha2::{Digest, Sha256};
use std::{fs, io, path::Path};
use tauri::Manager;

const STRONGHOLD_VERSION: &str = "2";
const STRONGHOLD_VERSION_FILE: &str = "stronghold-version";
const STRONGHOLD_SNAPSHOT_FILE: &str = "vault.hold";
const LEGACY_STRONGHOLD_SALT_FILE: &str = "salt.txt";

fn hash_stronghold_password(password: &str) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    hasher.finalize().to_vec()
}

fn reset_legacy_stronghold(data_dir: &Path) -> io::Result<()> {
    let version_path = data_dir.join(STRONGHOLD_VERSION_FILE);
    let version = fs::read_to_string(&version_path).ok();

    if version.as_deref().map(str::trim) == Some(STRONGHOLD_VERSION) {
        return Ok(());
    }

    for file_name in [STRONGHOLD_SNAPSHOT_FILE, LEGACY_STRONGHOLD_SALT_FILE] {
        let file_path = data_dir.join(file_name);
        if file_path.exists() {
            fs::remove_file(file_path)?;
        }
    }

    fs::write(version_path, STRONGHOLD_VERSION)
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_stronghold::Builder::new(hash_stronghold_password).build())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_local_data_dir()
                .expect("could not resolve app local data path");

            if !data_dir.exists() {
                std::fs::create_dir_all(&data_dir).expect("failed to create app local data dir");
            }

            reset_legacy_stronghold(&data_dir).expect("failed to reset legacy stronghold files");
            app.manage(memory::service::MemoryState::new(&data_dir)?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            history::commands::list_browser_sources,
            history::commands::fetch_browser_history,
            memory::commands::memory_execute,
            memory::commands::memory_batch
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
