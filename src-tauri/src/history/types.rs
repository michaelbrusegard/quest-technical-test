use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BrowserFamily {
    Chromium,
    Firefox,
    Safari,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSource {
    pub source_id: String,
    pub browser_family: BrowserFamily,
    pub browser_name: String,
    pub profile_name: String,
    pub is_default_profile: bool,
    pub platform: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Cursor {
    pub last_visit_time: String,
    pub last_visit_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FetchHistoryRequest {
    pub sources: Option<Vec<String>>,
    pub cursors: Option<HashMap<String, Cursor>>,
    pub limit_per_source: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SourceFetchStatus {
    Ok,
    NotModified,
    Unsupported,
    Unavailable,
    ReadFailed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SourceFetchState {
    pub source_id: String,
    pub browser_name: String,
    pub profile_name: String,
    pub status: SourceFetchStatus,
    pub message: Option<String>,
    pub records_fetched: usize,
    pub next_cursor: Option<Cursor>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StandardHistoryVisit {
    pub source_id: String,
    pub browser_family: BrowserFamily,
    pub browser_name: String,
    pub profile_name: String,
    pub visit_id: String,
    pub url: String,
    pub title: Option<String>,
    pub visited_at_ms: i64,
    pub domain: Option<String>,
    pub visit_count: Option<i64>,
    pub typed_count: Option<i64>,
    pub referrer_visit_id: Option<String>,
    pub transition_type: Option<String>,
    pub raw_visit_time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FetchHistoryResponse {
    pub records: Vec<StandardHistoryVisit>,
    pub next_cursors: HashMap<String, Cursor>,
    pub source_states: Vec<SourceFetchState>,
    pub fetched_at_ms: i64,
}
