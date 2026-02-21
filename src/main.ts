import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

// Types matching Rust
interface Server {
  id: string;
  name: string;
  realmlist_host: string;
  port: number;
  wow_path?: string | null;
  wow_exe?: string;
}

interface ServerList {
  servers: Server[];
}

interface AppSettings {
  default_wow_path?: string | null;
  realmlist_locale: string;
}

interface RealmStatus {
  online: boolean;
  latency_ms: number;
}

// State
let serverList: ServerList = { servers: [] };
let settings: AppSettings = { realmlist_locale: "enUS" };
let selectedId: string | null = null;
let editingId: string | null = null; // when editing, which server id

const SERVERS_LIST_ID = "server-list";
const MAIN_VIEW_ID = "main-view";
const SETTINGS_VIEW_ID = "settings-view";
const SERVER_DETAIL_ID = "server-detail";
const SERVER_DETAIL_EMPTY_ID = "server-detail-empty";
const SERVER_FORM_SECTION_ID = "server-form-section";

function showToast(message: string, isError = false, view: "main" | "settings" = "main") {
  const id = view === "settings" ? "toast-settings" : "toast";
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.className = "toast " + (isError ? "toast-error" : "toast-ok");
  el.hidden = false;
  setTimeout(() => {
    el.hidden = true;
  }, 4000);
}

async function loadServers(): Promise<ServerList> {
  const list = await invoke<ServerList>("get_servers");
  serverList = list;
  return list;
}

async function loadSettingsFromBackend(): Promise<AppSettings> {
  const s = await invoke<AppSettings>("get_settings");
  settings = s;
  return s;
}

function renderServerList() {
  const ul = document.getElementById(SERVERS_LIST_ID);
  if (!ul) return;
  ul.innerHTML = "";
  for (const s of serverList.servers) {
    const li = document.createElement("li");
    li.className = "server-list-item" + (selectedId === s.id ? " selected" : "");
    li.dataset.id = s.id;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", selectedId === s.id ? "true" : "false");
    li.innerHTML = `<span class="server-list-name">${escapeHtml(s.name)}</span><span class="server-list-host">${escapeHtml(s.realmlist_host)}</span>`;
    ul.appendChild(li);
  }
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function showDetail(server: Server | null) {
  const detailEmpty = document.getElementById(SERVER_DETAIL_EMPTY_ID);
  const detail = document.getElementById(SERVER_DETAIL_ID);
  if (!detailEmpty || !detail) return;
  if (!server) {
    detailEmpty.hidden = false;
    detail.hidden = true;
    return;
  }
  detailEmpty.hidden = true;
  detail.hidden = false;
  (document.getElementById("detail-name") as HTMLElement).textContent = server.name;
  (document.getElementById("detail-host") as HTMLElement).textContent = server.realmlist_host;
  const statusEl = document.getElementById("detail-status-value");
  if (statusEl) statusEl.textContent = "—";
  statusEl?.setAttribute("data-status", "");
}

function setDetailStatus(status: "checking" | "online" | "offline", latencyMs?: number) {
  const el = document.getElementById("detail-status-value");
  if (!el) return;
  el.setAttribute("data-status", status);
  if (status === "checking") el.textContent = "Checking…";
  else if (status === "online") el.textContent = `Online${latencyMs != null ? ` (${latencyMs} ms)` : ""}`;
  else el.textContent = "Offline";
}

async function checkSelectedServerStatus() {
  if (!selectedId) return;
  const server = serverList.servers.find((s) => s.id === selectedId);
  if (!server) return;
  setDetailStatus("checking");
  try {
    const result = await invoke<RealmStatus>("check_realm_status", {
      host: server.realmlist_host,
      port: server.port || 3724,
    });
    setDetailStatus(result.online ? "online" : "offline", result.online ? result.latency_ms : undefined);
  } catch {
    setDetailStatus("offline");
  }
}

function showServerForm(server: Server | null) {
  const section = document.getElementById(SERVER_FORM_SECTION_ID);
  const title = document.getElementById("server-form-title");
  const form = document.getElementById("server-form") as HTMLFormElement;
  if (!section || !title || !form) return;
  editingId = server?.id ?? null;
  section.hidden = false;
  title.textContent = server ? "Edit server" : "Add server";
  (document.getElementById("form-name") as HTMLInputElement).value = server?.name ?? "";
  (document.getElementById("form-host") as HTMLInputElement).value = server?.realmlist_host ?? "";
  (document.getElementById("form-port") as HTMLInputElement).value = server?.port ? String(server.port) : "3724";
  (document.getElementById("form-wow-exe") as HTMLInputElement).value = server?.wow_exe?.trim() || "Wow.exe";
  (document.getElementById("form-wow-path") as HTMLInputElement).value = server?.wow_path ?? "";
}

function hideServerForm() {
  const section = document.getElementById(SERVER_FORM_SECTION_ID);
  if (section) section.hidden = true;
  editingId = null;
}

function getSelectedServer(): Server | null {
  if (!selectedId) return null;
  return serverList.servers.find((s) => s.id === selectedId) ?? null;
}

function canPlay(): boolean {
  return getSelectedServer() !== null;
}

function updatePlayButton() {
  const btn = document.getElementById("btn-play") as HTMLButtonElement;
  if (btn) btn.disabled = !canPlay();
}

async function saveServerFromForm() {
  const name = (document.getElementById("form-name") as HTMLInputElement).value.trim();
  const host = (document.getElementById("form-host") as HTMLInputElement).value.trim();
  const portVal = (document.getElementById("form-port") as HTMLInputElement).value.trim();
  const port = portVal ? parseInt(portVal, 10) : 3724;
  const wowExe = (document.getElementById("form-wow-exe") as HTMLInputElement).value.trim() || "Wow.exe";
  const wowPath = (document.getElementById("form-wow-path") as HTMLInputElement).value.trim() || null;
  if (!name || !host) {
    showToast("Name and realmlist host are required.", true);
    return;
  }
  try {
    if (editingId) {
      await invoke("update_server", {
        id: editingId,
        server: {
          id: editingId,
          name,
          realmlist_host: host,
          port: port || 3724,
          wow_path: wowPath,
          wow_exe: wowExe,
        },
      });
      showToast("Server updated.");
    } else {
      await invoke("add_server", {
        server: {
          id: "",
          name,
          realmlist_host: host,
          port: port || 3724,
          wow_path: wowPath,
          wow_exe: wowExe,
        },
      });
      showToast("Server added.");
    }
    serverList = await loadServers();
    renderServerList();
    hideServerForm();
    if (selectedId && serverList.servers.some((s) => s.id === selectedId)) {
      updatePlayButton();
      checkSelectedServerStatus();
    }
  } catch (e) {
    showToast(String(e), true);
  }
}

async function removeCurrentServer() {
  const server = getSelectedServer();
  if (!server) return;
  if (!confirm(`Remove server "${server.name}"?`)) return;
  try {
    await invoke("remove_server", { id: server.id });
    serverList = await loadServers();
    selectedId = serverList.servers.length ? serverList.servers[0].id : null;
    renderServerList();
    showDetail(selectedId ? serverList.servers.find((s) => s.id === selectedId)! : null);
    updatePlayButton();
    if (selectedId) checkSelectedServerStatus();
    showToast("Server removed.");
  } catch (e) {
    showToast(String(e), true);
  }
}

async function playWow() {
  if (!selectedId) return;
  try {
    await invoke("play_wow", { args: { serverId: selectedId } });
    showToast("WoW launched.");
  } catch (e) {
    showToast(String(e), true);
  }
}

async function browseWowPath(inputId: string) {
  try {
    const path = await open({
      directory: true,
      multiple: false,
    });
    if (path) {
      const input = document.getElementById(inputId) as HTMLInputElement;
      if (input) input.value = path;
    }
  } catch (e) {
    showToast(String(e), true);
  }
}

function switchView(route: "main" | "settings") {
  const main = document.getElementById(MAIN_VIEW_ID);
  const settingsView = document.getElementById(SETTINGS_VIEW_ID);
  if (!main || !settingsView) return;
  if (route === "main") {
    main.hidden = false;
    settingsView.hidden = true;
  } else {
    main.hidden = true;
    settingsView.hidden = false;
    (document.getElementById("settings-wow-path") as HTMLInputElement).value = settings.default_wow_path ?? "";
    (document.getElementById("settings-locale") as HTMLSelectElement).value = settings.realmlist_locale || "enUS";
  }
}

async function saveSettingsFromForm() {
  const wowPath = (document.getElementById("settings-wow-path") as HTMLInputElement).value.trim() || null;
  const locale = (document.getElementById("settings-locale") as HTMLSelectElement).value || "enUS";
  try {
    await invoke("save_settings_cmd", {
      settings: { default_wow_path: wowPath, realmlist_locale: locale },
    });
    settings = { default_wow_path: wowPath, realmlist_locale: locale };
    showToast("Settings saved.", false, "settings");
    updatePlayButton();
  } catch (e) {
    showToast(String(e), true, "settings");
  }
}

function handleHashChange() {
  const hash = window.location.hash.slice(1) || "/";
  const route = hash === "/settings" ? "settings" : "main";
  switchView(route);
  document.querySelectorAll(".nav-link").forEach((a) => a.classList.remove("active"));
  document.querySelector(`.nav-link[data-route="${route === "settings" ? "settings" : "main"}"]`)?.classList.add("active");
}

function bindMainView() {
  const listEl = document.getElementById(SERVERS_LIST_ID);
  listEl?.addEventListener("click", (e) => {
    const li = (e.target as HTMLElement).closest(".server-list-item");
    if (!li || !(li instanceof HTMLElement)) return;
    const id = li.dataset.id;
    if (id) {
      selectedId = id;
      renderServerList();
      const server = serverList.servers.find((s) => s.id === id) ?? null;
      showDetail(server ?? null);
      updatePlayButton();
      checkSelectedServerStatus();
    }
  });

  document.getElementById("btn-add-server")?.addEventListener("click", () => {
    showServerForm(null);
  });

  document.getElementById("btn-edit-server")?.addEventListener("click", () => {
    const server = getSelectedServer();
    if (server) showServerForm(server);
  });

  document.getElementById("btn-remove-server")?.addEventListener("click", removeCurrentServer);

  document.getElementById("btn-refresh-status")?.addEventListener("click", checkSelectedServerStatus);

  document.getElementById("btn-play")?.addEventListener("click", playWow);

  document.getElementById("server-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    saveServerFromForm();
  });

  document.getElementById("btn-cancel-form")?.addEventListener("click", hideServerForm);

  document.getElementById("btn-browse-wow")?.addEventListener("click", () => browseWowPath("form-wow-path"));
}

function bindSettingsView() {
  document.getElementById("btn-browse-settings")?.addEventListener("click", () => browseWowPath("settings-wow-path"));
  document.getElementById("settings-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    saveSettingsFromForm();
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadServers();
    await loadSettingsFromBackend();
  } catch (e) {
    showToast(String(e), true);
  }
  handleHashChange();
  window.addEventListener("hashchange", handleHashChange);
  renderServerList();
  if (serverList.servers.length && !selectedId) {
    selectedId = serverList.servers[0].id;
    renderServerList();
    showDetail(serverList.servers[0]);
    updatePlayButton();
    checkSelectedServerStatus();
  } else if (selectedId) {
    showDetail(getSelectedServer() ?? null);
    updatePlayButton();
    checkSelectedServerStatus();
  }
  bindMainView();
  bindSettingsView();
});
