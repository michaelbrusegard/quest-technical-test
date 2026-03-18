use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryQueryRequest {
    pub sql: String,
    pub params: Vec<serde_json::Value>,
    pub method: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryQueryResult {
    pub rows: Option<Vec<Vec<serde_json::Value>>>,
}
