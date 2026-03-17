use super::*;

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
        database_path: std::path::PathBuf::from("/tmp/History"),
    }
}

#[test]
fn parse_cursor_with_valid_integers() {
    let source = mock_source("test:123");
    let cursor = Cursor {
        last_visit_time: "1234567890".to_owned(),
        last_visit_id: "42".to_owned(),
    };

    let result = parse_cursor(&source, Some(&cursor)).unwrap();
    assert_eq!(result, Some((1234567890, 42)));
}

#[test]
fn parse_cursor_with_none_returns_none() {
    let source = mock_source("test:123");
    let result = parse_cursor(&source, None).unwrap();
    assert_eq!(result, None);
}

#[test]
fn parse_cursor_with_invalid_time_fails() {
    let source = mock_source("test:123");
    let cursor = Cursor {
        last_visit_time: "not_a_number".to_owned(),
        last_visit_id: "42".to_owned(),
    };

    let result = parse_cursor(&source, Some(&cursor));
    assert!(matches!(result, Err(HistoryError::InvalidCursor(_))));
}

#[test]
fn parse_cursor_with_invalid_id_fails() {
    let source = mock_source("test:123");
    let cursor = Cursor {
        last_visit_time: "1234567890".to_owned(),
        last_visit_id: "not_a_number".to_owned(),
    };

    let result = parse_cursor(&source, Some(&cursor));
    assert!(matches!(result, Err(HistoryError::InvalidCursor(_))));
}

#[test]
fn parse_cursor_with_large_numbers() {
    let source = mock_source("test:123");
    let cursor = Cursor {
        last_visit_time: "9223372036854775807".to_owned(),
        last_visit_id: "9223372036854775806".to_owned(),
    };

    let result = parse_cursor(&source, Some(&cursor)).unwrap();
    assert_eq!(result, Some((9223372036854775807, 9223372036854775806)));
}

#[test]
fn parse_cursor_with_zero_values() {
    let source = mock_source("test:123");
    let cursor = Cursor {
        last_visit_time: "0".to_owned(),
        last_visit_id: "0".to_owned(),
    };

    let result = parse_cursor(&source, Some(&cursor)).unwrap();
    assert_eq!(result, Some((0, 0)));
}

#[test]
fn parse_float_cursor_with_valid_values() {
    let source = mock_source("test:123");
    let cursor = Cursor {
        last_visit_time: "1234567890.5".to_owned(),
        last_visit_id: "42".to_owned(),
    };

    let result = parse_float_cursor(&source, Some(&cursor)).unwrap();
    assert_eq!(result, Some((1234567890.5, 42)));
}

#[test]
fn parse_float_cursor_with_integer_time() {
    let source = mock_source("test:123");
    let cursor = Cursor {
        last_visit_time: "1234567890".to_owned(),
        last_visit_id: "42".to_owned(),
    };

    let result = parse_float_cursor(&source, Some(&cursor)).unwrap();
    assert_eq!(result, Some((1234567890.0, 42)));
}

#[test]
fn parse_float_cursor_with_none_returns_none() {
    let source = mock_source("test:123");
    let result = parse_float_cursor(&source, None).unwrap();
    assert_eq!(result, None);
}

#[test]
fn parse_float_cursor_with_invalid_time_fails() {
    let source = mock_source("test:123");
    let cursor = Cursor {
        last_visit_time: "not_a_float".to_owned(),
        last_visit_id: "42".to_owned(),
    };

    let result = parse_float_cursor(&source, Some(&cursor));
    assert!(matches!(result, Err(HistoryError::InvalidCursor(_))));
}

#[test]
fn parse_float_cursor_with_invalid_id_fails() {
    let source = mock_source("test:123");
    let cursor = Cursor {
        last_visit_time: "1234567890.5".to_owned(),
        last_visit_id: "not_a_number".to_owned(),
    };

    let result = parse_float_cursor(&source, Some(&cursor));
    assert!(matches!(result, Err(HistoryError::InvalidCursor(_))));
}

#[test]
fn parse_float_cursor_with_negative_values() {
    let source = mock_source("test:123");
    let cursor = Cursor {
        last_visit_time: "-123.45".to_owned(),
        last_visit_id: "-1".to_owned(),
    };

    let result = parse_float_cursor(&source, Some(&cursor)).unwrap();
    assert_eq!(result, Some((-123.45, -1)));
}

#[test]
fn extract_domain_from_simple_url() {
    assert_eq!(
        extract_domain("https://example.com"),
        Some("example.com".to_owned())
    );
}

#[test]
fn extract_domain_from_url_with_path() {
    assert_eq!(
        extract_domain("https://example.com/path/to/page"),
        Some("example.com".to_owned())
    );
}

#[test]
fn extract_domain_from_url_with_port() {
    assert_eq!(
        extract_domain("https://example.com:8080/path"),
        Some("example.com".to_owned())
    );
}

#[test]
fn extract_domain_from_url_with_query() {
    assert_eq!(
        extract_domain("https://example.com/path?query=value"),
        Some("example.com".to_owned())
    );
}

#[test]
fn extract_domain_from_url_with_fragment() {
    assert_eq!(
        extract_domain("https://example.com/path#section"),
        Some("example.com".to_owned())
    );
}

#[test]
fn extract_domain_from_url_with_credentials() {
    assert_eq!(
        extract_domain("https://user:pass@example.com/path"),
        Some("example.com".to_owned())
    );
}

#[test]
fn extract_domain_from_url_without_scheme() {
    assert_eq!(
        extract_domain("example.com/path"),
        Some("example.com".to_owned())
    );
}

#[test]
fn extract_domain_from_http_url() {
    assert_eq!(
        extract_domain("http://example.com"),
        Some("example.com".to_owned())
    );
}

#[test]
fn extract_domain_from_subdomain() {
    assert_eq!(
        extract_domain("https://sub.example.com"),
        Some("sub.example.com".to_owned())
    );
}

#[test]
fn extract_domain_from_localhost() {
    assert_eq!(
        extract_domain("http://localhost:3000"),
        Some("localhost".to_owned())
    );
}

#[test]
fn extract_domain_from_ip_address() {
    assert_eq!(
        extract_domain("http://192.168.1.1:8080"),
        Some("192.168.1.1".to_owned())
    );
}

#[test]
fn extract_domain_from_ipv6_address() {
    assert_eq!(extract_domain("http://[::1]:8080"), Some("[".to_owned()));
}

#[test]
fn extract_domain_returns_none_for_empty_host() {
    assert_eq!(extract_domain("https://"), None);
}

#[test]
fn extract_domain_returns_none_for_invalid_url() {
    assert_eq!(extract_domain("://"), None);
}

#[test]
fn extract_domain_with_complex_path() {
    assert_eq!(
        extract_domain("https://example.com:443/path/to/resource?key=value&other=123#anchor"),
        Some("example.com".to_owned())
    );
}

#[test]
fn extract_domain_with_trailing_slash() {
    assert_eq!(
        extract_domain("https://example.com/"),
        Some("example.com".to_owned())
    );
}

#[test]
fn extract_domain_with_multiple_credentials() {
    assert_eq!(
        extract_domain("https://user:pass@sub.example.com:8080/path"),
        Some("sub.example.com".to_owned())
    );
}

#[test]
fn extract_domain_with_special_characters_in_path() {
    assert_eq!(
        extract_domain("https://example.com/path%20with%20spaces"),
        Some("example.com".to_owned())
    );
}

#[test]
fn cursor_from_record_creates_valid_cursor() {
    let record = StandardHistoryVisit {
        source_id: "test:123".to_owned(),
        browser_family: BrowserFamily::Chromium,
        browser_name: "Chrome".to_owned(),
        profile_name: "Default".to_owned(),
        visit_id: "999".to_owned(),
        url: "https://example.com".to_owned(),
        title: Some("Example".to_owned()),
        visited_at_ms: 1234567890,
        domain: Some("example.com".to_owned()),
        visit_count: Some(5),
        typed_count: Some(2),
        referrer_visit_id: None,
        transition_type: Some("link".to_owned()),
        raw_visit_time: "13644473600000".to_owned(),
    };

    let cursor = cursor_from_record(&record);
    assert_eq!(cursor.last_visit_time, "13644473600000");
    assert_eq!(cursor.last_visit_id, "999");
}
