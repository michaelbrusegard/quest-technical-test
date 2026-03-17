use super::{parse_firefox_profiles_ini, slugify, stable_hash_hex};
use std::path::PathBuf;

#[test]
fn stable_hash_stays_deterministic() {
    assert_eq!(
        stable_hash_hex(b"/tmp/profile"),
        stable_hash_hex(b"/tmp/profile")
    );
}

#[test]
fn stable_hash_differs_for_different_inputs() {
    assert_ne!(
        stable_hash_hex(b"/tmp/profile1"),
        stable_hash_hex(b"/tmp/profile2")
    );
}

#[test]
fn stable_hash_empty_bytes() {
    let hash = stable_hash_hex(b"");
    assert!(!hash.is_empty());
    assert_eq!(hash.len(), 16);
}

#[test]
fn slugify_normalizes_browser_names() {
    assert_eq!(
        slugify("Firefox Developer Edition"),
        "firefox-developer-edition"
    );
}

#[test]
fn slugify_handles_uppercase() {
    assert_eq!(slugify("GOOGLE CHROME"), "google-chrome");
}

#[test]
fn slugify_handles_numbers() {
    assert_eq!(slugify("Firefox 123"), "firefox-123");
}

#[test]
fn slugify_removes_special_characters() {
    assert_eq!(slugify("Opera@Software!"), "opera-software");
}

#[test]
fn slugify_collapses_multiple_dashes() {
    assert_eq!(slugify("Brave---Browser"), "brave--browser");
}

#[test]
fn slugify_trims_leading_trailing_dashes() {
    assert_eq!(slugify("---Safari---"), "safari");
}

#[test]
fn parse_firefox_profiles_ini_missing_file() {
    let temp_dir = std::env::temp_dir();
    let nonexistent = temp_dir.join("nonexistent_profile_12345");

    let result = parse_firefox_profiles_ini(&nonexistent).unwrap();
    assert!(result.is_empty());
}

#[test]
fn parse_firefox_profiles_ini_with_comments() {
    let temp_dir = std::env::temp_dir();
    let test_dir = temp_dir.join("test_firefox_comments");
    let _ = std::fs::create_dir(&test_dir);
    let ini_path = test_dir.join("profiles.ini");
    let content = r#"; This is a comment
# This is also a comment
[Profile0]
Name=default
Path=Profiles/default
IsRelative=1
Default=1
"#;
    std::fs::write(&ini_path, content).unwrap();

    let result = parse_firefox_profiles_ini(&test_dir).unwrap();
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].name, "default");
    assert!(result[0].is_default);

    let _ = std::fs::remove_file(&ini_path);
    let _ = std::fs::remove_dir(&test_dir);
}

#[test]
fn parse_firefox_profiles_ini_multiple_profiles() {
    let temp_dir = std::env::temp_dir();
    let test_dir = temp_dir.join("test_firefox_multi");
    let _ = std::fs::create_dir(&test_dir);
    let ini_path = test_dir.join("profiles.ini");
    let content = r#"[Profile0]
Name=default
Path=Profiles/default
IsRelative=1
Default=1

[Profile1]
Name=work
Path=Profiles/work
IsRelative=1
Default=0
"#;
    std::fs::write(&ini_path, content).unwrap();

    let result = parse_firefox_profiles_ini(&test_dir).unwrap();
    assert_eq!(result.len(), 2);
    assert_eq!(result[0].name, "default");
    assert_eq!(result[1].name, "work");
    assert!(result[0].is_default);
    assert!(!result[1].is_default);

    let _ = std::fs::remove_file(&ini_path);
    let _ = std::fs::remove_dir(&test_dir);
}

#[test]
fn parse_firefox_profiles_ini_absolute_path() {
    let temp_dir = std::env::temp_dir();
    let test_dir = temp_dir.join("test_firefox_absolute");
    let _ = std::fs::create_dir(&test_dir);
    let ini_path = test_dir.join("profiles.ini");
    let content = r#"[Profile0]
Name=custom
Path=/absolute/path/to/profile
IsRelative=0
"#;
    std::fs::write(&ini_path, content).unwrap();

    let result = parse_firefox_profiles_ini(&test_dir).unwrap();
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].path, PathBuf::from("/absolute/path/to/profile"));
    assert!(!result[0].is_default);

    let _ = std::fs::remove_file(&ini_path);
    let _ = std::fs::remove_dir(&test_dir);
}

#[test]
fn parse_firefox_profiles_ini_profile_without_path() {
    let temp_dir = std::env::temp_dir();
    let test_dir = temp_dir.join("test_firefox_no_path");
    let _ = std::fs::create_dir(&test_dir);
    let ini_path = test_dir.join("profiles.ini");
    let content = r#"[Profile0]
Name=incomplete
Default=1

[Profile1]
Name=complete
Path=Profiles/complete
IsRelative=1
"#;
    std::fs::write(&ini_path, content).unwrap();

    let result = parse_firefox_profiles_ini(&test_dir).unwrap();
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].name, "complete");

    let _ = std::fs::remove_file(&ini_path);
    let _ = std::fs::remove_dir(&test_dir);
}
