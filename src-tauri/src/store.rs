use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Server {
    pub id: String,
    pub name: String,
    pub realmlist_host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default)]
    pub wow_path: Option<String>,
    /// Executable to launch (e.g. Wow.exe). Default: Wow.exe
    #[serde(default = "default_wow_exe")]
    pub wow_exe: String,
    #[serde(default)]
    pub account_name: Option<String>,
}

fn default_port() -> u16 {
    3724
}

fn default_wow_exe() -> String {
    "Wow.exe".to_string()
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default)]
    pub default_wow_path: Option<String>,
    #[serde(default = "default_locale")]
    pub realmlist_locale: String,
}

fn default_locale() -> String {
    "enUS".to_string()
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct ServerList {
    pub servers: Vec<Server>,
}

const SERVERS_FILE: &str = "servers.json";
const SETTINGS_FILE: &str = "settings.json";

pub fn servers_path(app_data_dir: &std::path::Path) -> PathBuf {
    app_data_dir.join(SERVERS_FILE)
}

pub fn settings_path(app_data_dir: &std::path::Path) -> PathBuf {
    app_data_dir.join(SETTINGS_FILE)
}

pub fn load_servers(app_data_dir: &std::path::Path) -> Result<ServerList, String> {
    let path = servers_path(app_data_dir);
    if !path.exists() {
        return Ok(ServerList::default());
    }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

pub fn save_servers(app_data_dir: &std::path::Path, list: &ServerList) -> Result<(), String> {
    std::fs::create_dir_all(app_data_dir).map_err(|e| e.to_string())?;
    let path = servers_path(app_data_dir);
    let data = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    std::fs::write(path, data).map_err(|e| e.to_string())
}

pub fn load_settings(app_data_dir: &std::path::Path) -> Result<AppSettings, String> {
    let path = settings_path(app_data_dir);
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

pub fn save_settings(
    app_data_dir: &std::path::Path,
    settings: &AppSettings,
) -> Result<(), String> {
    std::fs::create_dir_all(app_data_dir).map_err(|e| e.to_string())?;
    let path = settings_path(app_data_dir);
    let data = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(path, data).map_err(|e| e.to_string())
}
