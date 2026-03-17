use super::{query_history, transition_core_label, webkit_to_unix_ms};
use crate::history::discovery::DiscoveredSource;
use crate::history::types::{BrowserFamily, BrowserSource};
use rusqlite::Connection;
use std::path::PathBuf;

fn mock_source(source_id: &str) -> DiscoveredSource {
    DiscoveredSource {
        source: BrowserSource {
            source_id: source_id.to_owned(),
            browser_family: BrowserFamily::Chromium,
            browser_name: "Chrome".to_owned(),
            profile_name: "Default".to_owned(),
            is_default_profile: true,
            platform: "macos".to_owned(),
        },
        database_path: PathBuf::from("/tmp/History"),
    }
}

fn setup_chromium_db() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "
        CREATE TABLE urls (
            id INTEGER PRIMARY KEY,
            url TEXT NOT NULL,
            title TEXT,
            visit_count INTEGER,
            typed_count INTEGER
        );
        CREATE TABLE visits (
            id INTEGER PRIMARY KEY,
            url INTEGER NOT NULL,
            visit_time INTEGER NOT NULL,
            from_visit INTEGER,
            transition INTEGER
        );
        ",
    )
    .unwrap();
    conn
}

#[test]
fn query_history_initial_sync_returns_newest_rows_ascending() {
    let conn = setup_chromium_db();
    let source = mock_source("chromium:test");

    conn.execute(
        "INSERT INTO urls (id, url, title, visit_count, typed_count) VALUES (?, ?, ?, ?, ?)",
        (1, "https://example.com", Some("Example"), Some(5), Some(2)),
    )
    .unwrap();
    conn.execute(
        "INSERT INTO urls (id, url, title, visit_count, typed_count) VALUES (?, ?, ?, ?, ?)",
        (2, "https://rust-lang.org", Some("Rust"), Some(3), Some(1)),
    )
    .unwrap();

    let webkit_time_1 = 13_000_000_000_000_000i64;
    let webkit_time_2 = 13_000_000_001_000_000i64;
    let webkit_time_3 = 13_000_000_002_000_000i64;

    conn.execute(
        "INSERT INTO visits (id, url, visit_time, from_visit, transition) VALUES (?, ?, ?, ?, ?)",
        (1, 1, webkit_time_1, 0, 0),
    )
    .unwrap();
    conn.execute(
        "INSERT INTO visits (id, url, visit_time, from_visit, transition) VALUES (?, ?, ?, ?, ?)",
        (2, 2, webkit_time_2, 0, 1),
    )
    .unwrap();
    conn.execute(
        "INSERT INTO visits (id, url, visit_time, from_visit, transition) VALUES (?, ?, ?, ?, ?)",
        (3, 1, webkit_time_3, 1, 2),
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
    let conn = setup_chromium_db();
    let source = mock_source("chromium:test");

    conn.execute(
        "INSERT INTO urls (id, url, title, visit_count, typed_count) VALUES (?, ?, ?, ?, ?)",
        (1, "https://example.com", Some("Example"), Some(5), Some(2)),
    )
    .unwrap();

    for i in 1..=5 {
        let webkit_time = 13_000_000_000_000_000i64 + (i as i64 * 1_000_000);
        conn.execute(
            "INSERT INTO visits (id, url, visit_time, from_visit, transition) VALUES (?, ?, ?, ?, ?)",
            (i, 1, webkit_time, 0, 0),
        )
        .unwrap();
    }

    let result = query_history(&conn, &source, None, 2).unwrap();
    assert_eq!(result.len(), 2);
}

#[test]
fn query_history_extracts_domain() {
    let conn = setup_chromium_db();
    let source = mock_source("chromium:test");

    conn.execute(
        "INSERT INTO urls (id, url, title, visit_count, typed_count) VALUES (?, ?, ?, ?, ?)",
        (
            1,
            "https://example.com/path?query=1",
            None::<String>,
            None::<i64>,
            None::<i64>,
        ),
    )
    .unwrap();

    let webkit_time = 13_000_000_000_000_000i64;
    conn.execute(
        "INSERT INTO visits (id, url, visit_time, from_visit, transition) VALUES (?, ?, ?, ?, ?)",
        (1, 1, webkit_time, 0, 0),
    )
    .unwrap();

    let result = query_history(&conn, &source, None, 10).unwrap();
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].domain, Some("example.com".to_owned()));
}

#[test]
fn query_history_normalizes_referrer_visit_id() {
    let conn = setup_chromium_db();
    let source = mock_source("chromium:test");

    conn.execute(
        "INSERT INTO urls (id, url, title, visit_count, typed_count) VALUES (?, ?, ?, ?, ?)",
        (
            1,
            "https://example.com",
            None::<String>,
            None::<i64>,
            None::<i64>,
        ),
    )
    .unwrap();

    let webkit_time = 13_000_000_000_000_000i64;
    conn.execute(
        "INSERT INTO visits (id, url, visit_time, from_visit, transition) VALUES (?, ?, ?, ?, ?)",
        (1, 1, webkit_time, 0, 0),
    )
    .unwrap();
    conn.execute(
        "INSERT INTO visits (id, url, visit_time, from_visit, transition) VALUES (?, ?, ?, ?, ?)",
        (2, 1, webkit_time + 1_000_000, 1, 0),
    )
    .unwrap();

    let result = query_history(&conn, &source, None, 10).unwrap();
    assert_eq!(result[0].referrer_visit_id, None);
    assert_eq!(result[1].referrer_visit_id, Some("1".to_owned()));
}

#[test]
fn query_history_normalizes_transition_type() {
    let conn = setup_chromium_db();
    let source = mock_source("chromium:test");

    conn.execute(
        "INSERT INTO urls (id, url, title, visit_count, typed_count) VALUES (?, ?, ?, ?, ?)",
        (
            1,
            "https://example.com",
            None::<String>,
            None::<i64>,
            None::<i64>,
        ),
    )
    .unwrap();

    let webkit_time = 13_000_000_000_000_000i64;
    conn.execute(
        "INSERT INTO visits (id, url, visit_time, from_visit, transition) VALUES (?, ?, ?, ?, ?)",
        (1, 1, webkit_time, 0, 0),
    )
    .unwrap();
    conn.execute(
        "INSERT INTO visits (id, url, visit_time, from_visit, transition) VALUES (?, ?, ?, ?, ?)",
        (2, 1, webkit_time + 1_000_000, 0, 1),
    )
    .unwrap();

    let result = query_history(&conn, &source, None, 10).unwrap();
    assert_eq!(result[0].transition_type, Some("link".to_owned()));
    assert_eq!(result[1].transition_type, Some("typed".to_owned()));
}

#[test]
fn query_history_with_cursor_returns_newer_rows() {
    let conn = setup_chromium_db();
    let source = mock_source("chromium:test");

    conn.execute(
        "INSERT INTO urls (id, url, title, visit_count, typed_count) VALUES (?, ?, ?, ?, ?)",
        (
            1,
            "https://example.com",
            None::<String>,
            None::<i64>,
            None::<i64>,
        ),
    )
    .unwrap();

    let webkit_time_1 = 13_000_000_000_000_000i64;
    let webkit_time_2 = 13_000_000_001_000_000i64;
    let webkit_time_3 = 13_000_000_002_000_000i64;

    conn.execute(
        "INSERT INTO visits (id, url, visit_time, from_visit, transition) VALUES (?, ?, ?, ?, ?)",
        (1, 1, webkit_time_1, 0, 0),
    )
    .unwrap();
    conn.execute(
        "INSERT INTO visits (id, url, visit_time, from_visit, transition) VALUES (?, ?, ?, ?, ?)",
        (2, 1, webkit_time_2, 0, 0),
    )
    .unwrap();
    conn.execute(
        "INSERT INTO visits (id, url, visit_time, from_visit, transition) VALUES (?, ?, ?, ?, ?)",
        (3, 1, webkit_time_3, 0, 0),
    )
    .unwrap();

    let cursor = Some((webkit_time_1, 1));
    let result = query_history(&conn, &source, cursor, 10).unwrap();

    assert_eq!(result.len(), 2);
    assert_eq!(result[0].visit_id, "2");
    assert_eq!(result[1].visit_id, "3");
}

#[test]
fn query_history_cursor_with_same_timestamp_uses_visit_id() {
    let conn = setup_chromium_db();
    let source = mock_source("chromium:test");

    conn.execute(
        "INSERT INTO urls (id, url, title, visit_count, typed_count) VALUES (?, ?, ?, ?, ?)",
        (
            1,
            "https://example.com",
            None::<String>,
            None::<i64>,
            None::<i64>,
        ),
    )
    .unwrap();

    let webkit_time = 13_000_000_000_000_000i64;

    conn.execute(
        "INSERT INTO visits (id, url, visit_time, from_visit, transition) VALUES (?, ?, ?, ?, ?)",
        (1, 1, webkit_time, 0, 0),
    )
    .unwrap();
    conn.execute(
        "INSERT INTO visits (id, url, visit_time, from_visit, transition) VALUES (?, ?, ?, ?, ?)",
        (2, 1, webkit_time, 0, 0),
    )
    .unwrap();
    conn.execute(
        "INSERT INTO visits (id, url, visit_time, from_visit, transition) VALUES (?, ?, ?, ?, ?)",
        (3, 1, webkit_time, 0, 0),
    )
    .unwrap();

    let cursor = Some((webkit_time, 1));
    let result = query_history(&conn, &source, cursor, 10).unwrap();

    assert_eq!(result.len(), 2);
    assert_eq!(result[0].visit_id, "2");
    assert_eq!(result[1].visit_id, "3");
}

#[test]
fn converts_webkit_microseconds_to_unix_ms() {
    assert_eq!(webkit_to_unix_ms(11_644_473_600_000_000), 0);
}

#[test]
fn webkit_to_unix_ms_with_zero() {
    assert_eq!(webkit_to_unix_ms(0), 0);
}

#[test]
fn webkit_to_unix_ms_with_negative() {
    assert_eq!(webkit_to_unix_ms(-1), 0);
}

#[test]
fn webkit_to_unix_ms_converts_valid_timestamp() {
    let webkit_time = 13_000_000_000_000_000i64;
    let result = webkit_to_unix_ms(webkit_time);
    assert!(result > 0);
}

#[test]
fn transition_core_label_link() {
    assert_eq!(transition_core_label(0), "link");
}

#[test]
fn transition_core_label_typed() {
    assert_eq!(transition_core_label(1), "typed");
}

#[test]
fn transition_core_label_auto_bookmark() {
    assert_eq!(transition_core_label(2), "auto_bookmark");
}

#[test]
fn transition_core_label_auto_subframe() {
    assert_eq!(transition_core_label(3), "auto_subframe");
}

#[test]
fn transition_core_label_manual_subframe() {
    assert_eq!(transition_core_label(4), "manual_subframe");
}

#[test]
fn transition_core_label_generated() {
    assert_eq!(transition_core_label(5), "generated");
}

#[test]
fn transition_core_label_auto_toplevel() {
    assert_eq!(transition_core_label(6), "auto_toplevel");
}

#[test]
fn transition_core_label_form_submit() {
    assert_eq!(transition_core_label(7), "form_submit");
}

#[test]
fn transition_core_label_reload() {
    assert_eq!(transition_core_label(8), "reload");
}

#[test]
fn transition_core_label_keyword() {
    assert_eq!(transition_core_label(9), "keyword");
}

#[test]
fn transition_core_label_keyword_generated() {
    assert_eq!(transition_core_label(10), "keyword_generated");
}

#[test]
fn transition_core_label_unknown() {
    assert_eq!(transition_core_label(999), "unknown");
}

#[test]
fn transition_core_label_masks_high_bits() {
    assert_eq!(transition_core_label(0x100), "link");
    assert_eq!(transition_core_label(0x101), "typed");
    assert_eq!(transition_core_label(0x2FF), "unknown");
}
