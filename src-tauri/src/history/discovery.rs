use std::{
    collections::HashSet,
    env, fs,
    path::{Path, PathBuf},
};

use super::{
    errors::HistoryError,
    types::{BrowserFamily, BrowserSource},
};

#[derive(Debug, Clone)]
pub struct DiscoveredSource {
    pub source: BrowserSource,
    pub database_path: PathBuf,
}

struct BrowserDefinition {
    name: &'static str,
    family: BrowserFamily,
    mac_roots: &'static [&'static str],
    windows_roots: &'static [&'static str],
    linux_roots: &'static [&'static str],
}

const BROWSER_DEFINITIONS: &[BrowserDefinition] = &[
    BrowserDefinition {
        name: "Google Chrome",
        family: BrowserFamily::Chromium,
        mac_roots: &["~/Library/Application Support/Google/Chrome"],
        windows_roots: &["%LOCALAPPDATA%/Google/Chrome/User Data"],
        linux_roots: &["~/.config/google-chrome"],
    },
    BrowserDefinition {
        name: "Chromium",
        family: BrowserFamily::Chromium,
        mac_roots: &["~/Library/Application Support/Chromium"],
        windows_roots: &["%LOCALAPPDATA%/Chromium/User Data"],
        linux_roots: &["~/.config/chromium"],
    },
    BrowserDefinition {
        name: "Microsoft Edge",
        family: BrowserFamily::Chromium,
        mac_roots: &["~/Library/Application Support/Microsoft Edge"],
        windows_roots: &["%LOCALAPPDATA%/Microsoft/Edge/User Data"],
        linux_roots: &["~/.config/microsoft-edge"],
    },
    BrowserDefinition {
        name: "Brave",
        family: BrowserFamily::Chromium,
        mac_roots: &["~/Library/Application Support/BraveSoftware/Brave-Browser"],
        windows_roots: &["%LOCALAPPDATA%/BraveSoftware/Brave-Browser/User Data"],
        linux_roots: &["~/.config/BraveSoftware/Brave-Browser"],
    },
    BrowserDefinition {
        name: "Arc",
        family: BrowserFamily::Chromium,
        mac_roots: &["~/Library/Application Support/Arc/User Data"],
        windows_roots: &["%LOCALAPPDATA%/Arc/User Data"],
        linux_roots: &[],
    },
    BrowserDefinition {
        name: "Vivaldi",
        family: BrowserFamily::Chromium,
        mac_roots: &["~/Library/Application Support/Vivaldi"],
        windows_roots: &["%LOCALAPPDATA%/Vivaldi/User Data"],
        linux_roots: &["~/.config/vivaldi"],
    },
    BrowserDefinition {
        name: "Opera",
        family: BrowserFamily::Chromium,
        mac_roots: &[
            "~/Library/Application Support/com.operasoftware.Opera",
            "~/Library/Application Support/com.operasoftware.OperaGX",
        ],
        windows_roots: &[
            "%APPDATA%/Opera Software/Opera Stable",
            "%APPDATA%/Opera Software/Opera GX Stable",
        ],
        linux_roots: &["~/.config/opera", "~/.config/opera-beta"],
    },
    BrowserDefinition {
        name: "Firefox",
        family: BrowserFamily::Firefox,
        mac_roots: &["~/Library/Application Support/Firefox"],
        windows_roots: &["%APPDATA%/Mozilla/Firefox"],
        linux_roots: &["~/.mozilla/firefox"],
    },
    BrowserDefinition {
        name: "Firefox Developer Edition",
        family: BrowserFamily::Firefox,
        mac_roots: &["~/Library/Application Support/Firefox Developer Edition"],
        windows_roots: &["%APPDATA%/Mozilla/Firefox"],
        linux_roots: &["~/.mozilla/firefox"],
    },
    BrowserDefinition {
        name: "Firefox Nightly",
        family: BrowserFamily::Firefox,
        mac_roots: &["~/Library/Application Support/Firefox Nightly"],
        windows_roots: &["%APPDATA%/Mozilla/Firefox"],
        linux_roots: &["~/.mozilla/firefox"],
    },
    BrowserDefinition {
        name: "LibreWolf",
        family: BrowserFamily::Firefox,
        mac_roots: &["~/Library/Application Support/LibreWolf"],
        windows_roots: &["%APPDATA%/LibreWolf"],
        linux_roots: &["~/.librewolf", "~/.mozilla/librewolf"],
    },
    BrowserDefinition {
        name: "Floorp",
        family: BrowserFamily::Firefox,
        mac_roots: &["~/Library/Application Support/Floorp"],
        windows_roots: &["%APPDATA%/Floorp"],
        linux_roots: &["~/.floorp"],
    },
    BrowserDefinition {
        name: "Zen",
        family: BrowserFamily::Firefox,
        mac_roots: &["~/Library/Application Support/Zen"],
        windows_roots: &["%APPDATA%/Zen"],
        linux_roots: &["~/.zen", "~/.config/zen"],
    },
    BrowserDefinition {
        name: "Safari",
        family: BrowserFamily::Safari,
        mac_roots: &["~/Library/Safari"],
        windows_roots: &[],
        linux_roots: &[],
    },
];

#[derive(Debug, Clone)]
struct FirefoxProfileEntry {
    name: String,
    path: PathBuf,
    is_default: bool,
}

pub fn discover_sources() -> Result<Vec<DiscoveredSource>, HistoryError> {
    let mut discovered = Vec::new();
    let mut seen_source_ids = HashSet::new();

    for definition in BROWSER_DEFINITIONS {
        let roots = browser_roots(definition)?;
        for root in roots {
            let browser_sources = match definition.family {
                BrowserFamily::Chromium => discover_chromium_sources(definition, &root),
                BrowserFamily::Firefox => discover_firefox_sources(definition, &root),
                BrowserFamily::Safari => discover_safari_sources(definition, &root),
            };

            for source in browser_sources {
                if seen_source_ids.insert(source.source.source_id.clone()) {
                    discovered.push(source);
                }
            }
        }
    }

    discovered.sort_by(|left, right| {
        left.source
            .browser_name
            .cmp(&right.source.browser_name)
            .then(left.source.profile_name.cmp(&right.source.profile_name))
    });

    Ok(discovered)
}

fn discover_chromium_sources(definition: &BrowserDefinition, root: &Path) -> Vec<DiscoveredSource> {
    let mut sources = Vec::new();

    if let Some(source) = chromium_source_from_profile_dir(definition, root, root) {
        sources.push(source);
    }

    let Ok(entries) = fs::read_dir(root) else {
        return sources;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        if let Some(source) = chromium_source_from_profile_dir(definition, root, &path) {
            sources.push(source);
        }
    }

    sources
}

fn chromium_source_from_profile_dir(
    definition: &BrowserDefinition,
    root: &Path,
    profile_dir: &Path,
) -> Option<DiscoveredSource> {
    let database_path = profile_dir.join("History");
    if !database_path.is_file() {
        return None;
    }

    let profile_name = profile_dir
        .file_name()
        .and_then(|value| value.to_str())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| "Default".to_owned());
    let is_default_profile = profile_dir == root || profile_name == "Default";

    Some(build_source(
        definition.family,
        definition.name,
        profile_name,
        is_default_profile,
        profile_dir,
        database_path,
    ))
}

fn discover_firefox_sources(definition: &BrowserDefinition, root: &Path) -> Vec<DiscoveredSource> {
    let mut sources = Vec::new();
    let mut seen_paths = HashSet::new();

    for profile in parse_firefox_profiles_ini(root).unwrap_or_default() {
        let database_path = profile.path.join("places.sqlite");
        if !database_path.is_file() {
            continue;
        }

        seen_paths.insert(profile.path.clone());
        sources.push(build_source(
            definition.family,
            definition.name,
            profile.name,
            profile.is_default,
            &profile.path,
            database_path,
        ));
    }

    let profiles_dir = root.join("Profiles");
    let Ok(entries) = fs::read_dir(profiles_dir) else {
        return sources;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() || seen_paths.contains(&path) {
            continue;
        }

        let database_path = path.join("places.sqlite");
        if !database_path.is_file() {
            continue;
        }

        let profile_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| "default".to_owned());
        let is_default_profile = profile_name.contains("default");

        sources.push(build_source(
            definition.family,
            definition.name,
            profile_name,
            is_default_profile,
            &path,
            database_path,
        ));
    }

    sources
}

fn discover_safari_sources(definition: &BrowserDefinition, root: &Path) -> Vec<DiscoveredSource> {
    let database_path = root.join("History.db");

    vec![build_source(
        definition.family,
        definition.name,
        "Default".to_owned(),
        true,
        root,
        database_path,
    )]
}

fn parse_firefox_profiles_ini(root: &Path) -> Result<Vec<FirefoxProfileEntry>, HistoryError> {
    let ini_path = root.join("profiles.ini");
    let content = match fs::read_to_string(ini_path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(HistoryError::Io(error)),
    };

    let mut profiles = Vec::new();
    let mut current_name: Option<String> = None;
    let mut current_path: Option<String> = None;
    let mut current_is_relative = true;
    let mut current_is_default = false;

    let flush_profile = |profiles: &mut Vec<FirefoxProfileEntry>,
                         current_name: &mut Option<String>,
                         current_path: &mut Option<String>,
                         current_is_relative: &mut bool,
                         current_is_default: &mut bool| {
        let Some(path) = current_path.take() else {
            *current_name = None;
            *current_is_relative = true;
            *current_is_default = false;
            return;
        };

        let profile_name = current_name.take().unwrap_or_else(|| path.clone());
        let resolved_path = if *current_is_relative {
            root.join(path)
        } else {
            PathBuf::from(path)
        };

        profiles.push(FirefoxProfileEntry {
            name: profile_name,
            path: resolved_path,
            is_default: *current_is_default,
        });

        *current_is_relative = true;
        *current_is_default = false;
    };

    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with(';') || line.starts_with('#') {
            continue;
        }

        if line.starts_with('[') && line.ends_with(']') {
            flush_profile(
                &mut profiles,
                &mut current_name,
                &mut current_path,
                &mut current_is_relative,
                &mut current_is_default,
            );
            continue;
        }

        let Some((key, value)) = line.split_once('=') else {
            continue;
        };

        match key.trim() {
            "Name" => current_name = Some(value.trim().to_owned()),
            "Path" => current_path = Some(value.trim().to_owned()),
            "IsRelative" => current_is_relative = value.trim() != "0",
            "Default" => current_is_default = value.trim() == "1",
            _ => {}
        }
    }

    flush_profile(
        &mut profiles,
        &mut current_name,
        &mut current_path,
        &mut current_is_relative,
        &mut current_is_default,
    );

    Ok(profiles)
}

fn build_source(
    browser_family: BrowserFamily,
    browser_name: &str,
    profile_name: String,
    is_default_profile: bool,
    profile_dir: &Path,
    database_path: PathBuf,
) -> DiscoveredSource {
    let canonical_profile_path = profile_dir
        .canonicalize()
        .unwrap_or_else(|_| profile_dir.to_path_buf());
    let source_id = build_source_id(browser_family, browser_name, &canonical_profile_path);

    DiscoveredSource {
        source: BrowserSource {
            source_id,
            browser_family,
            browser_name: browser_name.to_owned(),
            profile_name,
            is_default_profile,
            platform: env::consts::OS.to_owned(),
        },
        database_path,
    }
}

fn browser_roots(definition: &BrowserDefinition) -> Result<Vec<PathBuf>, HistoryError> {
    let templates = match env::consts::OS {
        "macos" => definition.mac_roots,
        "windows" => definition.windows_roots,
        _ => definition.linux_roots,
    };

    let mut roots = Vec::new();
    for template in templates {
        if let Some(path) = expand_template_path(template)?
            && path.exists()
        {
            roots.push(path);
        }
    }

    Ok(roots)
}

fn expand_template_path(template: &str) -> Result<Option<PathBuf>, HistoryError> {
    let home_dir = home_dir()?;
    let mut path = template.to_owned();

    if path.starts_with('~') {
        path = path.replacen('~', &home_dir.to_string_lossy(), 1);
    }

    for (placeholder, value) in [
        ("%APPDATA%", env::var("APPDATA").ok()),
        ("%LOCALAPPDATA%", env::var("LOCALAPPDATA").ok()),
    ] {
        if path.contains(placeholder) {
            let Some(value) = value else {
                return Ok(None);
            };
            path = path.replace(placeholder, &value);
        }
    }

    Ok(Some(PathBuf::from(path)))
}

fn home_dir() -> Result<PathBuf, HistoryError> {
    if let Some(home) = env::var_os("HOME") {
        return Ok(PathBuf::from(home));
    }

    if let Some(user_profile) = env::var_os("USERPROFILE") {
        return Ok(PathBuf::from(user_profile));
    }

    Err(HistoryError::HomeDirectoryUnavailable)
}

fn build_source_id(
    browser_family: BrowserFamily,
    _browser_name: &str,
    profile_path: &Path,
) -> String {
    let family = match browser_family {
        BrowserFamily::Chromium => "chromium",
        BrowserFamily::Firefox => "firefox",
        BrowserFamily::Safari => "safari",
    };
    let profile_hash = stable_hash_hex(profile_path.to_string_lossy().as_bytes());
    format!("{family}:{profile_hash}")
}

#[cfg(test)]
fn slugify(value: &str) -> String {
    value
        .chars()
        .flat_map(char::to_lowercase)
        .map(|character| match character {
            'a'..='z' | '0'..='9' => character,
            _ => '-',
        })
        .collect::<String>()
        .trim_matches('-')
        .replace("--", "-")
}

fn stable_hash_hex(bytes: &[u8]) -> String {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3_u64);
    }
    format!("{hash:016x}")
}

#[cfg(test)]
mod tests {
    use super::{slugify, stable_hash_hex};

    #[test]
    fn stable_hash_stays_deterministic() {
        assert_eq!(
            stable_hash_hex(b"/tmp/profile"),
            stable_hash_hex(b"/tmp/profile")
        );
    }

    #[test]
    fn slugify_normalizes_browser_names() {
        assert_eq!(
            slugify("Firefox Developer Edition"),
            "firefox-developer-edition"
        );
    }
}
