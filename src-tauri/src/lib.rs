mod history;
mod memory;

use sha2::{Digest, Sha256};
use tauri::Manager;

fn hash_stronghold_password(password: &str) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    hasher.finalize().to_vec()
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

            app.manage(memory::service::MemoryState::new(&data_dir)?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            history::commands::list_browser_sources,
            history::commands::fetch_browser_history,
            memory::commands::memory_execute,
            memory::commands::memory_batch
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
