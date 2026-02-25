use std::path::Path;

const REALMLIST_LINE_PREFIX: &str = "set realmlist ";

/// Writes realmlist to all locations WoW clients may read from:
/// - `wow_path/realmlist.wtf` (root, used by some older clients)
/// - `wow_path/Data/{locale}/realmlist.wtf`
/// - `wow_path/WTF/Config.wtf` (adds or updates the realmlist line)
pub fn write_realmlist(
    wow_path: &str,
    host: &str,
    locale: &str,
) -> Result<(), String> {
    let base = Path::new(wow_path);
    let host = host.trim();
    let content = format!("{}{}", REALMLIST_LINE_PREFIX, host);

    // 1. Root realmlist.wtf (some older/custom clients read from here)
    let root_realmlist = base.join("realmlist.wtf");
    std::fs::write(&root_realmlist, &content).map_err(|e| e.to_string())?;

    // 2. Data/{locale}/realmlist.wtf (primary)
    let data_dir = base.join("Data").join(locale);
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let realmlist_wtf = data_dir.join("realmlist.wtf");
    std::fs::write(&realmlist_wtf, &content).map_err(|e| e.to_string())?;

    // 3. WTF/Config.wtf (some clients read realmlist from here)
    let wtf_dir = base.join("WTF");
    let config_wtf = wtf_dir.join("Config.wtf");
    write_realmlist_into_config(&config_wtf, host)?;

    Ok(())
}

/// Updates or adds the realmlist line in WTF/Config.wtf.
/// Preserves all other lines; replaces any existing "set realmlist" or "SET portal" line.
fn write_realmlist_into_config(config_path: &std::path::Path, host: &str) -> Result<(), String> {
    let new_line = format!("{}{}", REALMLIST_LINE_PREFIX, host);

    let (lines, had_realmlist) = if config_path.exists() {
        let s = std::fs::read_to_string(config_path).map_err(|e| e.to_string())?;
        let lines: Vec<String> = s.lines().map(String::from).collect();
        let mut had = false;
        let updated: Vec<String> = lines
            .into_iter()
            .map(|line| {
                let trimmed = line.trim();
                if trimmed.to_uppercase().starts_with("SET REALMLIST ")
                    || trimmed.to_uppercase().starts_with("SET PORTAL ")
                {
                    had = true;
                    new_line.clone()
                } else {
                    line
                }
            })
            .collect();
        (updated, had)
    } else {
        (Vec::new(), false)
    };

    let mut lines = lines;
    if !had_realmlist {
        lines.push(new_line);
    }

    std::fs::create_dir_all(config_path.parent().unwrap_or(Path::new(".")))
        .map_err(|e| e.to_string())?;
    let content = lines.join("\r\n");
    std::fs::write(config_path, content).map_err(|e| e.to_string())
}
