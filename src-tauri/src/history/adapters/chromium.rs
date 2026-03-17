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
    let cursor = service::parse_cursor(source, cursor)?;
    query_history(&copied_database.connection, source, cursor, limit)
}

fn query_history(
    connection: &Connection,
    source: &DiscoveredSource,
    cursor: Option<(i64, i64)>,
    limit: usize,
) -> Result<Vec<StandardHistoryVisit>, HistoryError> {
    let mut records = Vec::new();

    if let Some((last_visit_time, last_visit_id)) = cursor {
        let mut statement = connection.prepare(
            "
            SELECT
              visits.id,
              visits.visit_time,
              visits.from_visit,
              visits.transition,
              urls.url,
              urls.title,
              urls.visit_count,
              urls.typed_count
            FROM visits
            INNER JOIN urls ON urls.id = visits.url
            WHERE visits.visit_time > ?1
               OR (visits.visit_time = ?1 AND visits.id > ?2)
            ORDER BY visits.visit_time ASC, visits.id ASC
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
              visits.id,
              visits.visit_time,
              visits.from_visit,
              visits.transition,
              urls.url,
              urls.title,
              urls.visit_count,
              urls.typed_count
            FROM visits
            INNER JOIN urls ON urls.id = visits.url
            ORDER BY visits.visit_time DESC, visits.id DESC
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
    let visit_time = row.get::<_, i64>(1)?;
    let from_visit = row.get::<_, i64>(2)?;
    let transition = row.get::<_, i64>(3)?;
    let url = row.get::<_, String>(4)?;
    let title = row.get::<_, Option<String>>(5)?;
    let visit_count = row.get::<_, Option<i64>>(6)?;
    let typed_count = row.get::<_, Option<i64>>(7)?;

    Ok(StandardHistoryVisit {
        source_id: source.source.source_id.clone(),
        browser_family: source.source.browser_family,
        browser_name: source.source.browser_name.clone(),
        profile_name: source.source.profile_name.clone(),
        visit_id: visit_id.to_string(),
        url: url.clone(),
        title,
        visited_at_ms: webkit_to_unix_ms(visit_time),
        domain: service::extract_domain(&url),
        visit_count,
        typed_count,
        referrer_visit_id: (from_visit != 0).then(|| from_visit.to_string()),
        transition_type: Some(transition_core_label(transition).to_owned()),
        raw_visit_time: visit_time.to_string(),
    })
}

fn webkit_to_unix_ms(webkit_time: i64) -> i64 {
    if webkit_time <= 0 {
        return 0;
    }

    (webkit_time / 1_000) - 11_644_473_600_000
}

fn transition_core_label(transition: i64) -> &'static str {
    match transition & 0xff {
        0 => "link",
        1 => "typed",
        2 => "auto_bookmark",
        3 => "auto_subframe",
        4 => "manual_subframe",
        5 => "generated",
        6 => "auto_toplevel",
        7 => "form_submit",
        8 => "reload",
        9 => "keyword",
        10 => "keyword_generated",
        _ => "unknown",
    }
}

#[cfg(test)]
#[path = "chromium_tests.rs"]
mod tests;
