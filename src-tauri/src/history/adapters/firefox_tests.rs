use super::{firefox_visit_type_label, prtime_to_unix_ms, query_history};
use crate::history::discovery::DiscoveredSource;
use crate::history::types::{BrowserFamily, BrowserSource};
use rusqlite::Connection;
use std::path::PathBuf;

fn mock_source(source_id: &str) -> DiscoveredSource {
    DiscoveredSource {
        source: BrowserSource {
            source_id: source_id.to_owned(),
            browser_family: BrowserFamily::Firefox,
            browser_name: "Firefox".to_owned(),
            profile_name: "default".to_owned(),
            is_default_profile: true,
            platform: "macos".to_owned(),
        },
        database_path: PathBuf::from("/tmp/places.sqlite"),
    }
}

fn setup_firefox_db() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "
        CREATE TABLE moz_places (
            id INTEGER PRIMARY KEY,
            url TEXT NOT NULL,
            title TEXT,
            visit_count INTEGER
        );
        CREATE TABLE moz_historyvisits (
            id INTEGER PRIMARY KEY,
            place_id INTEGER NOT NULL,
            visit_date INTEGER NOT NULL,
            from_visit INTEGER,
            visit_type INTEGER
        );
        ",
    )
    .unwrap();
    conn
}

#[test]
fn query_history_initial_sync_returns_newest_rows_ascending() {
    let conn = setup_firefox_db();
    let source = mock_source("firefox:test");

    conn.execute(
        "INSERT INTO moz_places (id, url, title, visit_count) VALUES (?, ?, ?, ?)",
        (1, "https://example.com", Some("Example"), Some(5)),
    )
    .unwrap();
    conn.execute(
        "INSERT INTO moz_places (id, url, title, visit_count) VALUES (?, ?, ?, ?)",
        (2, "https://mozilla.org", Some("Mozilla"), Some(3)),
    )
    .unwrap();

    let prtime_1 = 1_000_000_000_000i64;
    let prtime_2 = 1_000_000_001_000i64;
    let prtime_3 = 1_000_000_002_000i64;

    conn.execute(
        "INSERT INTO moz_historyvisits (id, place_id, visit_date, from_visit, visit_type) VALUES (?, ?, ?, ?, ?)",
        (1, 1, prtime_1, 0, 1),
    )
    .unwrap();
    conn.execute(
        "INSERT INTO moz_historyvisits (id, place_id, visit_date, from_visit, visit_type) VALUES (?, ?, ?, ?, ?)",
        (2, 2, prtime_2, 0, 2),
    )
    .unwrap();
    conn.execute(
        "INSERT INTO moz_historyvisits (id, place_id, visit_date, from_visit, visit_type) VALUES (?, ?, ?, ?, ?)",
        (3, 1, prtime_3, 1, 3),
    )
    .unwrap();

    let result = query_history(&conn, &source, None, 10).unwrap();

    assert_eq!(result.len(), 3);
    assert_eq!(result[0].visit_id, "1");
    assert_eq!(result[1].visit_id, "2");
    assert_eq!(result[2].visit_id, "3");
    assert!(result[0].visited_at_ms < result[1].visited_at_ms);
    assert!(result[1].visited_at_ms < result[2].visited_at_ms);
}

#[test]
fn query_history_respects_limit() {
    let conn = setup_firefox_db();
    let source = mock_source("firefox:test");

    conn.execute(
        "INSERT INTO moz_places (id, url, title, visit_count) VALUES (?, ?, ?, ?)",
        (1, "https://example.com", Some("Example"), Some(5)),
    )
    .unwrap();

    for i in 1..=5 {
        let prtime = 1_000_000_000_000i64 + (i as i64 * 1_000);
        conn.execute(
            "INSERT INTO moz_historyvisits (id, place_id, visit_date, from_visit, visit_type) VALUES (?, ?, ?, ?, ?)",
            (i, 1, prtime, 0, 1),
        )
        .unwrap();
    }

    let result = query_history(&conn, &source, None, 2).unwrap();
    assert_eq!(result.len(), 2);
}

#[test]
fn query_history_incremental_cursor_returns_newer_rows() {
    let conn = setup_firefox_db();
    let source = mock_source("firefox:test");

    conn.execute(
        "INSERT INTO moz_places (id, url, title, visit_count) VALUES (?, ?, ?, ?)",
        (1, "https://example.com", None::<String>, None::<i64>),
    )
    .unwrap();

    let prtime_1 = 1_000_000_000_000i64;
    let prtime_2 = 1_000_000_001_000i64;
    let prtime_3 = 1_000_000_002_000i64;

    conn.execute(
        "INSERT INTO moz_historyvisits (id, place_id, visit_date, from_visit, visit_type) VALUES (?, ?, ?, ?, ?)",
        (1, 1, prtime_1, 0, 1),
    )
    .unwrap();
    conn.execute(
        "INSERT INTO moz_historyvisits (id, place_id, visit_date, from_visit, visit_type) VALUES (?, ?, ?, ?, ?)",
        (2, 1, prtime_2, 0, 1),
    )
    .unwrap();
    conn.execute(
        "INSERT INTO moz_historyvisits (id, place_id, visit_date, from_visit, visit_type) VALUES (?, ?, ?, ?, ?)",
        (3, 1, prtime_3, 0, 1),
    )
    .unwrap();

    let cursor = Some((prtime_1, 1));
    let result = query_history(&conn, &source, cursor, 10).unwrap();

    assert_eq!(result.len(), 2);
    assert_eq!(result[0].visit_id, "2");
    assert_eq!(result[1].visit_id, "3");
}

#[test]
fn query_history_cursor_with_same_timestamp_uses_visit_id() {
    let conn = setup_firefox_db();
    let source = mock_source("firefox:test");

    conn.execute(
        "INSERT INTO moz_places (id, url, title, visit_count) VALUES (?, ?, ?, ?)",
        (1, "https://example.com", None::<String>, None::<i64>),
    )
    .unwrap();

    let prtime = 1_000_000_000_000i64;

    conn.execute(
        "INSERT INTO moz_historyvisits (id, place_id, visit_date, from_visit, visit_type) VALUES (?, ?, ?, ?, ?)",
        (1, 1, prtime, 0, 1),
    )
    .unwrap();
    conn.execute(
        "INSERT INTO moz_historyvisits (id, place_id, visit_date, from_visit, visit_type) VALUES (?, ?, ?, ?, ?)",
        (2, 1, prtime, 0, 1),
    )
    .unwrap();
    conn.execute(
        "INSERT INTO moz_historyvisits (id, place_id, visit_date, from_visit, visit_type) VALUES (?, ?, ?, ?, ?)",
        (3, 1, prtime, 0, 1),
    )
    .unwrap();

    let cursor = Some((prtime, 1));
    let result = query_history(&conn, &source, cursor, 10).unwrap();

    assert_eq!(result.len(), 2);
    assert_eq!(result[0].visit_id, "2");
    assert_eq!(result[1].visit_id, "3");
}

#[test]
fn query_history_normalizes_referrer_visit_id() {
    let conn = setup_firefox_db();
    let source = mock_source("firefox:test");

    conn.execute(
        "INSERT INTO moz_places (id, url, title, visit_count) VALUES (?, ?, ?, ?)",
        (1, "https://example.com", None::<String>, None::<i64>),
    )
    .unwrap();

    let prtime = 1_000_000_000_000i64;
    conn.execute(
        "INSERT INTO moz_historyvisits (id, place_id, visit_date, from_visit, visit_type) VALUES (?, ?, ?, ?, ?)",
        (1, 1, prtime, 0, 1),
    )
    .unwrap();
    conn.execute(
        "INSERT INTO moz_historyvisits (id, place_id, visit_date, from_visit, visit_type) VALUES (?, ?, ?, ?, ?)",
        (2, 1, prtime + 1_000, 1, 1),
    )
    .unwrap();

    let result = query_history(&conn, &source, None, 10).unwrap();
    assert_eq!(result[0].referrer_visit_id, None);
    assert_eq!(result[1].referrer_visit_id, Some("1".to_owned()));
}

#[test]
fn query_history_normalizes_visit_type() {
    let conn = setup_firefox_db();
    let source = mock_source("firefox:test");

    conn.execute(
        "INSERT INTO moz_places (id, url, title, visit_count) VALUES (?, ?, ?, ?)",
        (1, "https://example.com", None::<String>, None::<i64>),
    )
    .unwrap();

    let prtime = 1_000_000_000_000i64;
    conn.execute(
        "INSERT INTO moz_historyvisits (id, place_id, visit_date, from_visit, visit_type) VALUES (?, ?, ?, ?, ?)",
        (1, 1, prtime, 0, 1),
    )
    .unwrap();
    conn.execute(
        "INSERT INTO moz_historyvisits (id, place_id, visit_date, from_visit, visit_type) VALUES (?, ?, ?, ?, ?)",
        (2, 1, prtime + 1_000, 0, 2),
    )
    .unwrap();

    let result = query_history(&conn, &source, None, 10).unwrap();
    assert_eq!(result[0].transition_type, Some("link".to_owned()));
    assert_eq!(result[1].transition_type, Some("typed".to_owned()));
}

#[test]
fn converts_prtime_microseconds_to_unix_ms() {
    assert_eq!(prtime_to_unix_ms(1_000_000), 1_000);
}

#[test]
fn prtime_to_unix_ms_with_zero() {
    assert_eq!(prtime_to_unix_ms(0), 0);
}

#[test]
fn prtime_to_unix_ms_with_negative() {
    assert_eq!(prtime_to_unix_ms(-1), 0);
}

#[test]
fn prtime_to_unix_ms_large_value() {
    assert_eq!(prtime_to_unix_ms(1_000_000_000_000), 1_000_000_000);
}

#[test]
fn firefox_visit_type_label_link() {
    assert_eq!(firefox_visit_type_label(1), "link");
}

#[test]
fn firefox_visit_type_label_typed() {
    assert_eq!(firefox_visit_type_label(2), "typed");
}

#[test]
fn firefox_visit_type_label_bookmark() {
    assert_eq!(firefox_visit_type_label(3), "bookmark");
}

#[test]
fn firefox_visit_type_label_embed() {
    assert_eq!(firefox_visit_type_label(4), "embed");
}

#[test]
fn firefox_visit_type_label_redirect_permanent() {
    assert_eq!(firefox_visit_type_label(5), "redirect_permanent");
}

#[test]
fn firefox_visit_type_label_redirect_temporary() {
    assert_eq!(firefox_visit_type_label(6), "redirect_temporary");
}

#[test]
fn firefox_visit_type_label_download() {
    assert_eq!(firefox_visit_type_label(7), "download");
}

#[test]
fn firefox_visit_type_label_framed_link() {
    assert_eq!(firefox_visit_type_label(8), "framed_link");
}

#[test]
fn firefox_visit_type_label_reload() {
    assert_eq!(firefox_visit_type_label(9), "reload");
}

#[test]
fn firefox_visit_type_label_unknown() {
    assert_eq!(firefox_visit_type_label(999), "unknown");
}

#[test]
fn firefox_visit_type_label_zero() {
    assert_eq!(firefox_visit_type_label(0), "unknown");
}
