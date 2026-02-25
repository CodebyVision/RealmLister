mod realmlist;
mod store;

use realmlist::write_realmlist;
use store::{
    load_servers, load_settings, save_servers, save_settings, AppSettings, Server, ServerList,
};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::Path;
use std::time::Duration;
use tauri::Manager;
use uuid::Uuid;

fn app_data_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_servers(app: tauri::AppHandle) -> Result<ServerList, String> {
    let dir = app_data_dir(&app)?;
    load_servers(&dir)
}

#[tauri::command]
fn save_servers_cmd(app: tauri::AppHandle, list: ServerList) -> Result<(), String> {
    let dir = app_data_dir(&app)?;
    save_servers(&dir, &list)
}

#[tauri::command]
fn add_server(app: tauri::AppHandle, mut server: Server) -> Result<ServerList, String> {
    if server.id.is_empty() {
        server.id = Uuid::new_v4().to_string();
    }
    server.port = if server.port == 0 {
        3724
    } else {
        server.port
    };
    if server.wow_exe.is_empty() {
        server.wow_exe = "Wow.exe".to_string();
    }
    let dir = app_data_dir(&app)?;
    let mut list = load_servers(&dir)?;
    list.servers.push(server);
    save_servers(&dir, &list)?;
    Ok(list)
}

#[tauri::command]
fn update_server(
    app: tauri::AppHandle,
    id: String,
    server: Server,
) -> Result<ServerList, String> {
    let dir = app_data_dir(&app)?;
    let mut list = load_servers(&dir)?;
    let port = if server.port == 0 { 3724 } else { server.port };
    if let Some(s) = list.servers.iter_mut().find(|s| s.id == id) {
        s.name = server.name;
        s.realmlist_host = server.realmlist_host;
        s.port = port;
        s.wow_path = server.wow_path;
        s.wow_exe = if server.wow_exe.is_empty() {
            "Wow.exe".to_string()
        } else {
            server.wow_exe
        };
        s.account_name = server.account_name;
    }
    save_servers(&dir, &list)?;
    Ok(list)
}

#[tauri::command]
fn remove_server(app: tauri::AppHandle, id: String) -> Result<ServerList, String> {
    let dir = app_data_dir(&app)?;
    let mut list = load_servers(&dir)?;
    list.servers.retain(|s| s.id != id);
    save_servers(&dir, &list)?;
    Ok(list)
}

#[tauri::command]
fn get_settings(app: tauri::AppHandle) -> Result<AppSettings, String> {
    let dir = app_data_dir(&app)?;
    load_settings(&dir)
}

#[tauri::command]
fn save_settings_cmd(app: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    let dir = app_data_dir(&app)?;
    save_settings(&dir, &settings)
}

#[tauri::command]
fn write_realmlist_cmd(
    wow_path: String,
    host: String,
    locale: Option<String>,
    account_name: Option<String>,
) -> Result<(), String> {
    let locale = locale.unwrap_or_else(|| "enUS".to_string());
    write_realmlist(&wow_path, &host, &locale, account_name.as_deref())
}

#[derive(serde::Deserialize)]
struct PlayWowArgs {
    #[serde(alias = "server_id", alias = "serverId")]
    server_id: String,
}

#[tauri::command]
fn play_wow(app: tauri::AppHandle, args: PlayWowArgs) -> Result<(), String> {
    let dir = app_data_dir(&app)?;
    let list = load_servers(&dir)?;
    let server = list
        .servers
        .iter()
        .find(|s| s.id == args.server_id)
        .ok_or_else(|| "Server not found".to_string())?;
    let settings = load_settings(&dir)?;
    let wow_path = server
        .wow_path
        .as_deref()
        .or(settings.default_wow_path.as_deref())
        .ok_or_else(|| "No WoW path set. Configure it in Settings or for this server.".to_string())?
        .trim();
    if wow_path.is_empty() {
        return Err("No WoW path set.".to_string());
    }
    let wow_path_buf = std::path::PathBuf::from(wow_path);
    let exe_name = server.wow_exe.trim();
    let exe_name = if exe_name.is_empty() { "Wow.exe" } else { exe_name };
    let wow_exe = wow_path_buf.join(exe_name);
    if !wow_exe.exists() {
        return Err(format!(
            "{} not found at {}",
            exe_name,
            wow_exe.display()
        ));
    }
    let locale = if settings.realmlist_locale.is_empty() {
        "enUS".to_string()
    } else {
        settings.realmlist_locale.clone()
    };
    write_realmlist(wow_path, &server.realmlist_host, &locale, server.account_name.as_deref())?;
    std::process::Command::new(&wow_exe)
        .current_dir(wow_path_buf.parent().unwrap_or(Path::new(".")))
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn check_realm_status(host: String, port: Option<u16>) -> Result<RealmStatus, String> {
    let port = port.unwrap_or(3724);
    // Run blocking TCP work off the main thread so the UI stays responsive
    tauri::async_runtime::spawn_blocking(move || {
        let host = host.trim();
        let start = std::time::Instant::now();
        let addrs: Vec<_> = (host, port)
            .to_socket_addrs()
            .map_err(|e| format!("Could not resolve {}:{}: {}", host, port, e))?
            .collect();
        for addr in addrs {
            if TcpStream::connect_timeout(&addr, Duration::from_secs(3)).is_ok() {
                return Ok(RealmStatus {
                    online: true,
                    latency_ms: start.elapsed().as_millis() as u64,
                });
            }
        }
        Ok(RealmStatus {
            online: false,
            latency_ms: 0,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(serde::Serialize)]
struct RealmStatus {
    online: bool,
    latency_ms: u64,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_servers,
            save_servers_cmd,
            add_server,
            update_server,
            remove_server,
            get_settings,
            save_settings_cmd,
            write_realmlist_cmd,
            play_wow,
            check_realm_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
