use rusqlite::{Connection, params};

use crate::history::{
    discovery::DiscoveredSource,
    errors::HistoryError,
    service, sqlite,
    types::{Cursor, StandardHistoryVisit},
};

pub fn read_history(
    source: &DiscoveredSource,
    cursor: Option<&Cursor>,
    limit: usize,
) -> Result<Vec<StandardHistoryVisit>, HistoryError> {
    let copied_database = sqlite::open_copied_database(&source.database_path)?;
    let cursor = service::parse_float_cursor(source, cursor)?;
    query_history(&copied_database.connection, source, cursor, limit)
}

fn query_history(
    connection: &Connection,
    source: &DiscoveredSource,
    cursor: Option<(f64, i64)>,
    limit: usize,
) -> Result<Vec<StandardHistoryVisit>, HistoryError> {
    let mut records = Vec::new();

    if let Some((last_visit_time, last_visit_id)) = cursor {
        let mut statement = connection.prepare(
            "
            SELECT
              history_visits.id,
              history_visits.visit_time,
              history_items.url,
              history_visits.title
            FROM history_visits
            INNER JOIN history_items ON history_items.id = history_visits.history_item
            WHERE history_visits.visit_time > ?1
               OR (history_visits.visit_time = ?1 AND history_visits.id > ?2)
            ORDER BY history_visits.visit_time ASC, history_visits.id ASC
            LIMIT ?3
            ",
        )?;
        let mut rows = statement.query(params![last_visit_time, last_visit_id, limit as i64])?;

        while let Some(row) = rows.next()? {
            records.push(map_row(source, row)?);
        }
    } else {
        let mut statement = connection.prepare(
            "
            SELECT
              history_visits.id,
              history_visits.visit_time,
              history_items.url,
              history_visits.title
            FROM history_visits
            INNER JOIN history_items ON history_items.id = history_visits.history_item
            ORDER BY history_visits.visit_time DESC, history_visits.id DESC
            LIMIT ?1
            ",
        )?;
        let mut rows = statement.query(params![limit as i64])?;

        while let Some(row) = rows.next()? {
            records.push(map_row(source, row)?);
        }

        records.reverse();
    }

    Ok(records)
}

fn map_row(
    source: &DiscoveredSource,
    row: &rusqlite::Row<'_>,
) -> Result<StandardHistoryVisit, rusqlite::Error> {
    let visit_id = row.get::<_, i64>(0)?;
    let visit_time = row.get::<_, f64>(1)?;
    let url = row.get::<_, String>(2)?;
    let title = row.get::<_, Option<String>>(3)?;

    Ok(StandardHistoryVisit {
        source_id: source.source.source_id.clone(),
        browser_family: source.source.browser_family,
        browser_name: source.source.browser_name.clone(),
        profile_name: source.source.profile_name.clone(),
        visit_id: visit_id.to_string(),
        url: url.clone(),
        title,
        visited_at_ms: mac_absolute_time_to_unix_ms(visit_time),
        domain: service::extract_domain(&url),
        visit_count: None,
        typed_count: None,
        referrer_visit_id: None,
        transition_type: None,
        raw_visit_time: visit_time.to_string(),
    })
}

fn mac_absolute_time_to_unix_ms(mac_time: f64) -> i64 {
    if mac_time < 0.0 {
        return 0;
    }

    let unix_seconds = mac_time + 978_307_200.0;
    (unix_seconds * 1_000.0) as i64
}

#[cfg(test)]
#[path = "safari_tests.rs"]
mod tests;
