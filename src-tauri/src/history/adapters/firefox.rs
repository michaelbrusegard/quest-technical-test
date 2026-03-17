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
              moz_historyvisits.id,
              moz_historyvisits.visit_date,
              moz_historyvisits.from_visit,
              moz_historyvisits.visit_type,
              moz_places.url,
              moz_places.title,
              moz_places.visit_count
            FROM moz_historyvisits
            INNER JOIN moz_places ON moz_places.id = moz_historyvisits.place_id
            WHERE moz_historyvisits.visit_date > ?1
               OR (moz_historyvisits.visit_date = ?1 AND moz_historyvisits.id > ?2)
            ORDER BY moz_historyvisits.visit_date ASC, moz_historyvisits.id ASC
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
              moz_historyvisits.id,
              moz_historyvisits.visit_date,
              moz_historyvisits.from_visit,
              moz_historyvisits.visit_type,
              moz_places.url,
              moz_places.title,
              moz_places.visit_count
            FROM moz_historyvisits
            INNER JOIN moz_places ON moz_places.id = moz_historyvisits.place_id
            ORDER BY moz_historyvisits.visit_date DESC, moz_historyvisits.id DESC
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
    let visit_date = row.get::<_, i64>(1)?;
    let from_visit = row.get::<_, i64>(2)?;
    let visit_type = row.get::<_, i64>(3)?;
    let url = row.get::<_, String>(4)?;
    let title = row.get::<_, Option<String>>(5)?;
    let visit_count = row.get::<_, Option<i64>>(6)?;

    Ok(StandardHistoryVisit {
        source_id: source.source.source_id.clone(),
        browser_family: source.source.browser_family,
        browser_name: source.source.browser_name.clone(),
        profile_name: source.source.profile_name.clone(),
        visit_id: visit_id.to_string(),
        url: url.clone(),
        title,
        visited_at_ms: prtime_to_unix_ms(visit_date),
        domain: service::extract_domain(&url),
        visit_count,
        typed_count: None,
        referrer_visit_id: (from_visit != 0).then(|| from_visit.to_string()),
        transition_type: Some(firefox_visit_type_label(visit_type).to_owned()),
        raw_visit_time: visit_date.to_string(),
    })
}

fn prtime_to_unix_ms(prtime: i64) -> i64 {
    if prtime <= 0 {
        return 0;
    }

    prtime / 1_000
}

fn firefox_visit_type_label(visit_type: i64) -> &'static str {
    match visit_type {
        1 => "link",
        2 => "typed",
        3 => "bookmark",
        4 => "embed",
        5 => "redirect_permanent",
        6 => "redirect_temporary",
        7 => "download",
        8 => "framed_link",
        9 => "reload",
        _ => "unknown",
    }
}

#[cfg(test)]
mod tests {
    use super::prtime_to_unix_ms;

    #[test]
    fn converts_prtime_microseconds_to_unix_ms() {
        assert_eq!(prtime_to_unix_ms(1_000_000), 1_000);
    }
}
