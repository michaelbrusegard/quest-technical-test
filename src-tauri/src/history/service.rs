use std::{
    collections::{HashMap, HashSet},
    time::{SystemTime, UNIX_EPOCH},
};

use super::{
    adapters,
    discovery::{self, DiscoveredSource},
    errors::HistoryError,
    types::{
        BrowserFamily, BrowserSource, Cursor, FetchHistoryRequest, FetchHistoryResponse,
        SourceFetchState, SourceFetchStatus, StandardHistoryVisit,
    },
};

const DEFAULT_LIMIT_PER_SOURCE: usize = 500;
const MAX_LIMIT_PER_SOURCE: usize = 5_000;

pub fn list_browser_sources() -> Result<Vec<BrowserSource>, HistoryError> {
    let sources = discovery::discover_sources()?;
    Ok(sources.into_iter().map(|source| source.source).collect())
}

pub fn fetch_browser_history(
    request: FetchHistoryRequest,
) -> Result<FetchHistoryResponse, HistoryError> {
    let discovered_sources = discovery::discover_sources()?;
    let requested_sources = request
        .sources
        .clone()
        .map(|sources| sources.into_iter().collect::<HashSet<_>>());
    let limit_per_source = request
        .limit_per_source
        .map_or(DEFAULT_LIMIT_PER_SOURCE, |limit| limit as usize)
        .clamp(1, MAX_LIMIT_PER_SOURCE);
    let cursors = request.cursors.unwrap_or_default();

    let mut states = Vec::new();
    let mut records = Vec::new();
    let mut next_cursors = HashMap::new();
    let mut seen_requested_sources = HashSet::new();

    for source in discovered_sources {
        if let Some(requested_sources) = &requested_sources
            && !requested_sources.contains(&source.source.source_id)
        {
            continue;
        }

        let source_id = source.source.source_id.clone();
        seen_requested_sources.insert(source_id.clone());
        let cursor = cursors.get(&source_id);

        let result = match source.source.browser_family {
            BrowserFamily::Chromium => {
                adapters::chromium::read_history(&source, cursor, limit_per_source)
            }
            BrowserFamily::Firefox => {
                adapters::firefox::read_history(&source, cursor, limit_per_source)
            }
            BrowserFamily::Safari => {
                adapters::safari::read_history(&source, cursor, limit_per_source)
            }
        };

        match result {
            Ok(source_records) => {
                let next_cursor = source_records
                    .last()
                    .map(cursor_from_record)
                    .or_else(|| cursor.cloned());
                let status = if source_records.is_empty() {
                    SourceFetchStatus::NotModified
                } else {
                    SourceFetchStatus::Ok
                };
                let records_fetched = source_records.len();

                if let Some(next_cursor) = &next_cursor {
                    next_cursors.insert(source_id.clone(), next_cursor.clone());
                }

                records.extend(source_records);
                states.push(SourceFetchState {
                    source_id,
                    browser_name: source.source.browser_name.clone(),
                    profile_name: source.source.profile_name.clone(),
                    status,
                    message: None,
                    records_fetched,
                    next_cursor,
                });
            }
            Err(error) => {
                states.push(SourceFetchState {
                    source_id,
                    browser_name: source.source.browser_name.clone(),
                    profile_name: source.source.profile_name.clone(),
                    status: SourceFetchStatus::ReadFailed,
                    message: Some(error.to_string()),
                    records_fetched: 0,
                    next_cursor: cursor.cloned(),
                });
            }
        }
    }

    if let Some(requested_sources) = requested_sources {
        for missing_source_id in requested_sources.difference(&seen_requested_sources) {
            states.push(SourceFetchState {
                source_id: missing_source_id.clone(),
                browser_name: "Unknown".to_owned(),
                profile_name: "Unknown".to_owned(),
                status: SourceFetchStatus::Unavailable,
                message: Some("The requested browser profile is no longer available".to_owned()),
                records_fetched: 0,
                next_cursor: cursors.get(missing_source_id).cloned(),
            });
        }
    }

    records.sort_by(|left, right| {
        left.visited_at_ms
            .cmp(&right.visited_at_ms)
            .then(left.source_id.cmp(&right.source_id))
            .then(left.visit_id.cmp(&right.visit_id))
    });

    Ok(FetchHistoryResponse {
        records,
        next_cursors,
        source_states: states,
        fetched_at_ms: now_ms(),
    })
}

fn cursor_from_record(record: &StandardHistoryVisit) -> Cursor {
    Cursor {
        last_visit_time: record.raw_visit_time.clone(),
        last_visit_id: record.visit_id.clone(),
    }
}

pub fn parse_cursor(
    source: &DiscoveredSource,
    cursor: Option<&Cursor>,
) -> Result<Option<(i64, i64)>, HistoryError> {
    let Some(cursor) = cursor else {
        return Ok(None);
    };

    let last_visit_time = cursor
        .last_visit_time
        .parse::<i64>()
        .map_err(|_| HistoryError::InvalidCursor(source.source.source_id.clone()))?;
    let last_visit_id = cursor
        .last_visit_id
        .parse::<i64>()
        .map_err(|_| HistoryError::InvalidCursor(source.source.source_id.clone()))?;

    Ok(Some((last_visit_time, last_visit_id)))
}

pub fn parse_float_cursor(
    source: &DiscoveredSource,
    cursor: Option<&Cursor>,
) -> Result<Option<(f64, i64)>, HistoryError> {
    let Some(cursor) = cursor else {
        return Ok(None);
    };

    let last_visit_time = cursor
        .last_visit_time
        .parse::<f64>()
        .map_err(|_| HistoryError::InvalidCursor(source.source.source_id.clone()))?;
    let last_visit_id = cursor
        .last_visit_id
        .parse::<i64>()
        .map_err(|_| HistoryError::InvalidCursor(source.source.source_id.clone()))?;

    Ok(Some((last_visit_time, last_visit_id)))
}

pub fn extract_domain(url: &str) -> Option<String> {
    let without_scheme = url.split_once("://").map_or(url, |(_, rest)| rest);
    let host = without_scheme.split('/').next()?.split('@').next_back()?;
    let host_without_port = host.split(':').next()?.trim();
    if host_without_port.is_empty() {
        return None;
    }
    Some(host_without_port.to_owned())
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis() as i64)
}

#[cfg(test)]
#[path = "service_tests.rs"]
mod tests;
