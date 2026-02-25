import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";

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

let serverList: ServerList = { servers: [] };
let settings: AppSettings = { realmlist_locale: "enUS" };
let selectedId: string | null = null;
let editingId: string | null = null;

const statusMap = new Map<string, { online: boolean; latency_ms: number }>();

// ── Helpers ──

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function showToast(message: string, isError = false) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.className = "toast " + (isError ? "toast-error" : "toast-ok");
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 3000);
}

// ── Data ──

async function loadServers(): Promise<ServerList> {
  const list = await invoke<ServerList>("get_servers");
  serverList = list;
  return list;
}

async function loadSettings(): Promise<AppSettings> {
  const s = await invoke<AppSettings>("get_settings");
  settings = s;
  return s;
}

// ── Status checking ──

async function checkServerStatus(server: Server): Promise<void> {
  updateDot(server.id, "checking");
  try {
    const result = await invoke<RealmStatus>("check_realm_status", {
      host: server.realmlist_host,
      port: server.port || 3724,
    });
    statusMap.set(server.id, { online: result.online, latency_ms: result.latency_ms });
    updateDot(server.id, result.online ? "online" : "offline");
  } catch {
    statusMap.set(server.id, { online: false, latency_ms: 0 });
    updateDot(server.id, "offline");
  }
  if (server.id === selectedId) updateStatusBar();
}

function updateDot(id: string, state: "checking" | "online" | "offline") {
  const dot = document.querySelector(`.server-list-item[data-id="${id}"] .status-dot`);
  if (!dot) return;
  dot.className = "status-dot " + state;
}

function updateStatusBar() {
  const statusVal = document.getElementById("status-value");
  const pingVal = document.getElementById("ping-value");
  if (!statusVal || !pingVal) return;

  if (!selectedId) {
    statusVal.textContent = "--";
    statusVal.removeAttribute("data-status");
    pingVal.textContent = "--";
    return;
  }

  const info = statusMap.get(selectedId);
  if (!info) {
    statusVal.textContent = "--";
    statusVal.removeAttribute("data-status");
    pingVal.textContent = "--";
    return;
  }

  if (info.online) {
    statusVal.textContent = "Online";
    statusVal.setAttribute("data-status", "online");
    pingVal.textContent = info.latency_ms + "ms";
  } else {
    statusVal.textContent = "Offline";
    statusVal.setAttribute("data-status", "offline");
    pingVal.textContent = "--";
  }
}

async function checkAllStatuses() {
  const promises = serverList.servers.map((s) => checkServerStatus(s));
  await Promise.allSettled(promises);
}

// ── Rendering ──

function renderServerList() {
  const ul = document.getElementById("server-list");
  if (!ul) return;
  ul.innerHTML = "";
  for (const s of serverList.servers) {
    const li = document.createElement("li");
    li.className = "server-list-item" + (selectedId === s.id ? " selected" : "");
    li.dataset.id = s.id;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", selectedId === s.id ? "true" : "false");

    const info = statusMap.get(s.id);
    let dotClass = "status-dot";
    if (info) dotClass += info.online ? " online" : " offline";

    li.innerHTML = `<span class="server-list-name">${escapeHtml(s.name)}</span><span class="${dotClass}"></span>`;
    ul.appendChild(li);
  }
  updatePlayButton();
}

function updatePlayButton() {
  const btn = document.getElementById("btn-play") as HTMLButtonElement;
  if (btn) btn.disabled = !selectedId;
}

// ── Server modal (add / edit) ──

function openServerModal(server: Server | null) {
  editingId = server?.id ?? null;
  const modal = document.getElementById("server-modal");
  const title = document.getElementById("server-modal-title");
  if (!modal || !title) return;

  title.textContent = server ? "Edit server" : "Add server";
  (document.getElementById("form-name") as HTMLInputElement).value = server?.name ?? "";
  (document.getElementById("form-host") as HTMLInputElement).value = server?.realmlist_host ?? "";
  (document.getElementById("form-port") as HTMLInputElement).value = server?.port ? String(server.port) : "3724";
  (document.getElementById("form-wow-exe") as HTMLInputElement).value = server?.wow_exe?.trim() || "Wow.exe";
  (document.getElementById("form-wow-path") as HTMLInputElement).value = server?.wow_path ?? "";
  modal.hidden = false;
}

function closeServerModal() {
  const modal = document.getElementById("server-modal");
  if (modal) modal.hidden = true;
  editingId = null;
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
        server: { id: editingId, name, realmlist_host: host, port: port || 3724, wow_path: wowPath, wow_exe: wowExe },
      });
      showToast("Server updated.");
    } else {
      await invoke("add_server", {
        server: { id: "", name, realmlist_host: host, port: port || 3724, wow_path: wowPath, wow_exe: wowExe },
      });
      showToast("Server added.");
    }
    serverList = await loadServers();
    if (!editingId && serverList.servers.length > 0) {
      selectedId = serverList.servers[serverList.servers.length - 1].id;
    }
    renderServerList();
    updateStatusBar();
    closeServerModal();
    checkAllStatuses();
  } catch (e) {
    showToast(String(e), true);
  }
}

// ── Remove modal ──

function openRemoveModal() {
  const server = serverList.servers.find((s) => s.id === selectedId);
  if (!server) return;
  const msg = document.getElementById("remove-modal-message");
  if (msg) msg.textContent = `Remove "${server.name}"? This cannot be undone.`;
  const modal = document.getElementById("remove-modal");
  if (modal) modal.hidden = false;
}

function closeRemoveModal() {
  const modal = document.getElementById("remove-modal");
  if (modal) modal.hidden = true;
}

async function confirmRemove() {
  if (!selectedId) { closeRemoveModal(); return; }
  try {
    await invoke("remove_server", { id: selectedId });
    serverList = await loadServers();
    statusMap.delete(selectedId);
    selectedId = serverList.servers.length ? serverList.servers[0].id : null;
    renderServerList();
    updateStatusBar();
    closeRemoveModal();
    showToast("Server removed.");
  } catch (e) {
    showToast(String(e), true);
  }
}

// ── Settings modal ──

function openSettingsModal() {
  (document.getElementById("settings-wow-path") as HTMLInputElement).value = settings.default_wow_path ?? "";
  (document.getElementById("settings-locale") as HTMLSelectElement).value = settings.realmlist_locale || "enUS";
  const modal = document.getElementById("settings-modal");
  if (modal) modal.hidden = false;
}

function closeSettingsModal() {
  const modal = document.getElementById("settings-modal");
  if (modal) modal.hidden = true;
}

async function saveSettings() {
  const wowPath = (document.getElementById("settings-wow-path") as HTMLInputElement).value.trim() || null;
  const locale = (document.getElementById("settings-locale") as HTMLSelectElement).value || "enUS";
  try {
    await invoke("save_settings_cmd", {
      settings: { default_wow_path: wowPath, realmlist_locale: locale },
    });
    settings = { default_wow_path: wowPath, realmlist_locale: locale };
    showToast("Settings saved.");
    closeSettingsModal();
  } catch (e) {
    showToast(String(e), true);
  }
}

// ── Play ──

async function playWow() {
  if (!selectedId) return;
  try {
    await invoke("play_wow", { args: { serverId: selectedId } });
    showToast("WoW launched.");
  } catch (e) {
    showToast(String(e), true);
  }
}

// ── Browse ──

async function browseFolder(inputId: string) {
  try {
    const path = await open({ directory: true, multiple: false });
    if (path) {
      const input = document.getElementById(inputId) as HTMLInputElement;
      if (input) input.value = path;
    }
  } catch (e) {
    showToast(String(e), true);
  }
}

// ── Close modals on overlay click / Escape ──

function setupModalDismiss(modalId: string, closeFn: () => void) {
  document.getElementById(modalId)?.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).id === modalId) closeFn();
  });
}

// ── Bind events ──

function bindEvents() {
  const listEl = document.getElementById("server-list");

  listEl?.addEventListener("click", (e) => {
    const li = (e.target as HTMLElement).closest(".server-list-item") as HTMLElement | null;
    if (!li) return;
    const id = li.dataset.id;
    if (id) {
      selectedId = id;
      renderServerList();
      updateStatusBar();
    }
  });

  listEl?.addEventListener("dblclick", (e) => {
    const li = (e.target as HTMLElement).closest(".server-list-item") as HTMLElement | null;
    if (!li) return;
    const id = li.dataset.id;
    if (id) {
      const server = serverList.servers.find((s) => s.id === id);
      if (server) openServerModal(server);
    }
  });

  document.getElementById("btn-add")?.addEventListener("click", () => openServerModal(null));

  document.getElementById("btn-edit")?.addEventListener("click", () => {
    if (!selectedId) return;
    const server = serverList.servers.find((s) => s.id === selectedId);
    if (server) openServerModal(server);
  });

  document.getElementById("btn-remove")?.addEventListener("click", () => {
    if (selectedId) openRemoveModal();
  });

  document.getElementById("btn-settings")?.addEventListener("click", openSettingsModal);

  document.getElementById("btn-github")?.addEventListener("click", () => {
    openUrl("https://github.com/CodebyVision/RealmLister");
  });

  document.getElementById("btn-play")?.addEventListener("click", playWow);

  document.getElementById("server-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    saveServerFromForm();
  });
  document.getElementById("btn-cancel-server")?.addEventListener("click", closeServerModal);

  document.getElementById("remove-modal-cancel")?.addEventListener("click", closeRemoveModal);
  document.getElementById("remove-modal-confirm")?.addEventListener("click", confirmRemove);

  document.getElementById("settings-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    saveSettings();
  });
  document.getElementById("btn-cancel-settings")?.addEventListener("click", closeSettingsModal);

  document.getElementById("btn-browse-wow")?.addEventListener("click", () => browseFolder("form-wow-path"));
  document.getElementById("btn-browse-settings")?.addEventListener("click", () => browseFolder("settings-wow-path"));

  setupModalDismiss("server-modal", closeServerModal);
  setupModalDismiss("remove-modal", closeRemoveModal);
  setupModalDismiss("settings-modal", closeSettingsModal);

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const serverModal = document.getElementById("server-modal");
    const removeModal = document.getElementById("remove-modal");
    const settingsModal = document.getElementById("settings-modal");
    if (serverModal && !serverModal.hidden) closeServerModal();
    else if (removeModal && !removeModal.hidden) closeRemoveModal();
    else if (settingsModal && !settingsModal.hidden) closeSettingsModal();
  });
}

// ── Init ──

window.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadServers();
    await loadSettings();
  } catch (e) {
    showToast(String(e), true);
  }

  if (serverList.servers.length && !selectedId) {
    selectedId = serverList.servers[0].id;
  }

  renderServerList();
  updateStatusBar();
  bindEvents();
  checkAllStatuses();
});
