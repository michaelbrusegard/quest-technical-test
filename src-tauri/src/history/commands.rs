use super::{
    service,
    types::{BrowserSource, FetchHistoryRequest, FetchHistoryResponse},
};

#[tauri::command]
pub async fn list_browser_sources() -> Result<Vec<BrowserSource>, String> {
    tauri::async_runtime::spawn_blocking(service::list_browser_sources)
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn fetch_browser_history(
    request: FetchHistoryRequest,
) -> Result<FetchHistoryResponse, String> {
    tauri::async_runtime::spawn_blocking(move || service::fetch_browser_history(request))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}
