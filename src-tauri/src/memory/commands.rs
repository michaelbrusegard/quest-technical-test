use tauri::State;

use super::{
    service::{self, MemoryState},
    types::{MemoryQueryRequest, MemoryQueryResult},
};

#[tauri::command]
pub fn memory_execute(
    request: MemoryQueryRequest,
    state: State<'_, MemoryState>,
) -> Result<MemoryQueryResult, String> {
    service::execute_query(&state, &request)
}

#[tauri::command]
pub fn memory_batch(
    batch: Vec<MemoryQueryRequest>,
    state: State<'_, MemoryState>,
) -> Result<Vec<MemoryQueryResult>, String> {
    service::execute_batch(&state, &batch)
}
