use super::{mac_absolute_time_to_unix_ms, query_history};
use crate::history::discovery::DiscoveredSource;
use crate::history::types::{BrowserFamily, BrowserSource};
use rusqlite::Connection;
use std::path::PathBuf;

fn mock_source(source_id: &str) -> DiscoveredSource {
    DiscoveredSource {
        source: BrowserSource {
            source_id: source_id.to_owned(),
            browser_family: BrowserFamily::Safari,
            browser_name: "Safari".to_owned(),
            profile_name: "Default".to_owned(),
            is_default_profile: true,
            platform: "macos".to_owned(),
        },
        database_path: PathBuf::from("/tmp/History.db"),
    }
}

fn setup_safari_db() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "
        CREATE TABLE history_items (
            id INTEGER PRIMARY KEY,
            url TEXT NOT NULL
        );
        CREATE TABLE history_visits (
            id INTEGER PRIMARY KEY,
            history_item INTEGER NOT NULL,
            visit_time REAL NOT NULL,
            title TEXT
        );
        ",
    )
    .unwrap();
    conn
}

#[test]
fn query_history_initial_sync_returns_newest_rows_ascending() {
    let conn = setup_safari_db();
    let source = mock_source("safari:test");

    conn.execute(
        "INSERT INTO history_items (id, url) VALUES (?, ?)",
        (1, "https://example.com"),
    )
    .unwrap();
    conn.execute(
        "INSERT INTO history_items (id, url) VALUES (?, ?)",
        (2, "https://apple.com"),
    )
    .unwrap();

    let mac_time_1 = 600000.0;
    let mac_time_2 = 600001.0;
    let mac_time_3 = 600002.0;

    conn.execute(
        "INSERT INTO history_visits (id, history_item, visit_time, title) VALUES (?, ?, ?, ?)",
        (1, 1, mac_time_1, Some("Example")),
    )
    .unwrap();
    conn.execute(
        "INSERT INTO history_visits (id, history_item, visit_time, title) VALUES (?, ?, ?, ?)",
        (2, 2, mac_time_2, Some("Apple")),
    )
    .unwrap();
    conn.execute(
        "INSERT INTO history_visits (id, history_item, visit_time, title) VALUES (?, ?, ?, ?)",
        (3, 1, mac_time_3, Some("Example Again")),
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
    let conn = setup_safari_db();
    let source = mock_source("safari:test");

    conn.execute(
        "INSERT INTO history_items (id, url) VALUES (?, ?)",
        (1, "https://example.com"),
    )
    .unwrap();

    for i in 1..=5 {
        let mac_time = 600000.0 + (i as f64);
        conn.execute(
            "INSERT INTO history_visits (id, history_item, visit_time, title) VALUES (?, ?, ?, ?)",
            (i, 1, mac_time, Some("Example")),
        )
        .unwrap();
    }

    let result = query_history(&conn, &source, None, 2).unwrap();
    assert_eq!(result.len(), 2);
}

#[test]
fn query_history_handles_float_timestamps() {
    let conn = setup_safari_db();
    let source = mock_source("safari:test");

    conn.execute(
        "INSERT INTO history_items (id, url) VALUES (?, ?)",
        (1, "https://example.com"),
    )
    .unwrap();

    let mac_time_1 = 600000.123;
    let mac_time_2 = 600001.456;

    conn.execute(
        "INSERT INTO history_visits (id, history_item, visit_time, title) VALUES (?, ?, ?, ?)",
        (1, 1, mac_time_1, Some("Example")),
    )
    .unwrap();
    conn.execute(
        "INSERT INTO history_visits (id, history_item, visit_time, title) VALUES (?, ?, ?, ?)",
        (2, 1, mac_time_2, Some("Example")),
    )
    .unwrap();

    let result = query_history(&conn, &source, None, 10).unwrap();
    assert_eq!(result.len(), 2);
    assert!(result[0].visited_at_ms < result[1].visited_at_ms);
}

#[test]
fn query_history_maps_title_and_url() {
    let conn = setup_safari_db();
    let source = mock_source("safari:test");

    conn.execute(
        "INSERT INTO history_items (id, url) VALUES (?, ?)",
        (1, "https://example.com/page"),
    )
    .unwrap();

    let mac_time = 600000.0;
    conn.execute(
        "INSERT INTO history_visits (id, history_item, visit_time, title) VALUES (?, ?, ?, ?)",
        (1, 1, mac_time, Some("Example Page")),
    )
    .unwrap();

    let result = query_history(&conn, &source, None, 10).unwrap();
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].url, "https://example.com/page");
    assert_eq!(result[0].title, Some("Example Page".to_owned()));
}

#[test]
fn query_history_handles_null_title() {
    let conn = setup_safari_db();
    let source = mock_source("safari:test");

    conn.execute(
        "INSERT INTO history_items (id, url) VALUES (?, ?)",
        (1, "https://example.com"),
    )
    .unwrap();

    let mac_time = 600000.0;
    conn.execute(
        "INSERT INTO history_visits (id, history_item, visit_time, title) VALUES (?, ?, ?, ?)",
        (1, 1, mac_time, None::<String>),
    )
    .unwrap();

    let result = query_history(&conn, &source, None, 10).unwrap();
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].title, None);
}

#[test]
fn query_history_incremental_cursor_returns_newer_rows() {
    let conn = setup_safari_db();
    let source = mock_source("safari:test");

    conn.execute(
        "INSERT INTO history_items (id, url) VALUES (?, ?)",
        (1, "https://example.com"),
    )
    .unwrap();

    let mac_time_1 = 600000.0;
    let mac_time_2 = 600001.0;
    let mac_time_3 = 600002.0;

    conn.execute(
        "INSERT INTO history_visits (id, history_item, visit_time, title) VALUES (?, ?, ?, ?)",
        (1, 1, mac_time_1, None::<String>),
    )
    .unwrap();
    conn.execute(
        "INSERT INTO history_visits (id, history_item, visit_time, title) VALUES (?, ?, ?, ?)",
        (2, 1, mac_time_2, None::<String>),
    )
    .unwrap();
    conn.execute(
        "INSERT INTO history_visits (id, history_item, visit_time, title) VALUES (?, ?, ?, ?)",
        (3, 1, mac_time_3, None::<String>),
    )
    .unwrap();

    let cursor = Some((mac_time_1, 1));
    let result = query_history(&conn, &source, cursor, 10).unwrap();

    assert_eq!(result.len(), 2);
    assert_eq!(result[0].visit_id, "2");
    assert_eq!(result[1].visit_id, "3");
}

#[test]
fn query_history_cursor_with_same_timestamp_uses_visit_id() {
    let conn = setup_safari_db();
    let source = mock_source("safari:test");

    conn.execute(
        "INSERT INTO history_items (id, url) VALUES (?, ?)",
        (1, "https://example.com"),
    )
    .unwrap();

    let mac_time = 600000.0;

    conn.execute(
        "INSERT INTO history_visits (id, history_item, visit_time, title) VALUES (?, ?, ?, ?)",
        (1, 1, mac_time, None::<String>),
    )
    .unwrap();
    conn.execute(
        "INSERT INTO history_visits (id, history_item, visit_time, title) VALUES (?, ?, ?, ?)",
        (2, 1, mac_time, None::<String>),
    )
    .unwrap();
    conn.execute(
        "INSERT INTO history_visits (id, history_item, visit_time, title) VALUES (?, ?, ?, ?)",
        (3, 1, mac_time, None::<String>),
    )
    .unwrap();

    let cursor = Some((mac_time, 1));
    let result = query_history(&conn, &source, cursor, 10).unwrap();

    assert_eq!(result.len(), 2);
    assert_eq!(result[0].visit_id, "2");
    assert_eq!(result[1].visit_id, "3");
}

#[test]
fn converts_mac_absolute_time_to_unix_ms() {
    assert_eq!(mac_absolute_time_to_unix_ms(0.0), 978_307_200_000);
}

#[test]
fn mac_absolute_time_with_negative() {
    assert_eq!(mac_absolute_time_to_unix_ms(-1.0), 0);
}

#[test]
fn mac_absolute_time_with_positive_offset() {
    let result = mac_absolute_time_to_unix_ms(86400.0);
    assert_eq!(result, 978_307_200_000 + 86_400_000);
}

#[test]
fn mac_absolute_time_with_fractional_seconds() {
    let result = mac_absolute_time_to_unix_ms(1.5);
    assert_eq!(result, 978_307_200_000 + 1500);
}

#[test]
fn mac_absolute_time_large_value() {
    let result = mac_absolute_time_to_unix_ms(1_000_000.0);
    assert!(result > 978_307_200_000);
}

#[test]
fn mac_absolute_time_zero() {
    assert_eq!(mac_absolute_time_to_unix_ms(0.0), 978_307_200_000);
}
