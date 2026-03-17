mod history;

use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_local_data_dir()
                .expect("could not resolve app local data path");

            if !data_dir.exists() {
                std::fs::create_dir_all(&data_dir).expect("failed to create app local data dir");
            }

            let salt_path = data_dir.join("salt.txt");

            app.handle()
                .plugin(tauri_plugin_stronghold::Builder::with_argon2(&salt_path).build())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            history::commands::list_browser_sources,
            history::commands::fetch_browser_history
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
