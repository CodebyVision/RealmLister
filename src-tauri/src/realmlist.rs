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
    account_name: Option<&str>,
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

    // 3. WTF/Config.wtf (realmlist + accountName)
    let wtf_dir = base.join("WTF");
    let config_wtf = wtf_dir.join("Config.wtf");
    write_realmlist_into_config(&config_wtf, host, account_name)?;

    Ok(())
}

/// Updates or adds the realmlist and accountName lines in WTF/Config.wtf.
/// Preserves all other lines.
fn write_realmlist_into_config(
    config_path: &std::path::Path,
    host: &str,
    account_name: Option<&str>,
) -> Result<(), String> {
    let new_realmlist = format!("{}{}", REALMLIST_LINE_PREFIX, host);
    let new_account = account_name
        .filter(|n| !n.is_empty())
        .map(|n| format!("SET accountName \"{}\"", n));

    let mut had_realmlist = false;
    let mut had_account = false;

    let mut lines: Vec<String> = if config_path.exists() {
        let s = std::fs::read_to_string(config_path).map_err(|e| e.to_string())?;
        s.lines()
            .map(|line| {
                let upper = line.trim().to_uppercase();
                if upper.starts_with("SET REALMLIST ") || upper.starts_with("SET PORTAL ") {
                    had_realmlist = true;
                    new_realmlist.clone()
                } else if upper.starts_with("SET ACCOUNTNAME ") {
                    had_account = true;
                    new_account.clone().unwrap_or_default()
                } else {
                    line.to_string()
                }
            })
            .collect()
    } else {
        Vec::new()
    };

    if !had_realmlist {
        lines.push(new_realmlist);
    }
    if !had_account {
        if let Some(acct) = &new_account {
            lines.push(acct.clone());
        }
    }

    lines.retain(|l| !l.is_empty());

    std::fs::create_dir_all(config_path.parent().unwrap_or(Path::new(".")))
        .map_err(|e| e.to_string())?;
    let content = lines.join("\r\n");
    std::fs::write(config_path, content).map_err(|e| e.to_string())
}
