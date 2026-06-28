// storage.js — Multi-user storage layer
// Each user gets isolated keys: gc_projects_{username}, gc_settings_{username}, gc_logs_{username}

export const MAX_PROJECTS = 20;
const ADMIN_USER = 'balla';
const ADMIN_PASS = '620891542';

// ── Users (multi-user array) ──

export async function loadUsers() {
  try {
    const raw = await window.miniappsAI.storage.getItem('gc_users');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveUsers(users) {
  await window.miniappsAI.storage.setItem('gc_users', JSON.stringify(users));
}

/**
 * Register a new user. Returns { ok: true } or { ok: false, reason }.
 */
export async function registerUser(username, password) {
  const users = await loadUsers();
  if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    return { ok: false, reason: 'exists' };
  }
  users.push({ username, password: btoa(password), createdAt: new Date().toISOString() });
  await saveUsers(users);
  return { ok: true };
}

/**
 * Authenticate a user. Returns { ok, user?, isAdmin? }.
 */
export async function authenticateUser(username, password) {
  // Admin check (hardcoded)
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    return { ok: true, user: { username, isAdmin: true }, isAdmin: true };
  }
  // Regular user check
  const users = await loadUsers();
  const found = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!found) return { ok: false, reason: 'not_found' };
  if (atob(found.password) !== password) return { ok: false, reason: 'wrong_pass' };
  return { ok: true, user: { username: found.username, isAdmin: false }, isAdmin: false };
}

// ── Current session ──

export async function loadSession() {
  try {
    const raw = await window.miniappsAI.storage.getItem('gc_session');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function saveSession(session) {
  await window.miniappsAI.storage.setItem('gc_session', JSON.stringify(session));
}

export async function clearSession() {
  await window.miniappsAI.storage.removeItem('gc_session');
}

// ── Per-user Projects ──

export async function loadProjects(username) {
  if (!username) return [];
  try {
    const raw = await window.miniappsAI.storage.getItem(`gc_projects_${username}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveProjects(username, projects) {
  if (!username) return;
  await window.miniappsAI.storage.setItem(`gc_projects_${username}`, JSON.stringify(projects));
}

// ── Per-user Settings ──

export async function loadSettings(username) {
  if (!username) return { renderApiKey: '', vercelToken: '', githubToken: '' };
  try {
    const raw = await window.miniappsAI.storage.getItem(`gc_settings_${username}`);
    return raw ? JSON.parse(raw) : { renderApiKey: '', vercelToken: '', githubToken: '' };
  } catch { return { renderApiKey: '', vercelToken: '', githubToken: '' }; }
}

export async function saveSettings(username, settings) {
  if (!username) return;
  await window.miniappsAI.storage.setItem(`gc_settings_${username}`, JSON.stringify(settings));
}

// ── Per-user Logs ──

export async function loadLogs(username) {
  if (!username) return [];
  try {
    const raw = await window.miniappsAI.storage.getItem(`gc_logs_${username}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveLogs(username, logs) {
  if (!username) return;
  const toSave = logs.slice(0, 200);
  await window.miniappsAI.storage.setItem(`gc_logs_${username}`, JSON.stringify(toSave));
}

// ── Admin: load ALL users' data ──

export async function loadAllUsersData() {
  const users = await loadUsers();
  const result = [];
  for (const u of users) {
    const projects = await loadProjects(u.username);
    const settings = await loadSettings(u.username);
    const logs = await loadLogs(u.username);
    result.push({
      username: u.username,
      createdAt: u.createdAt,
      projectCount: projects.length,
      logCount: logs.length,
      hasGithubToken: !!settings.githubToken,
      hasRenderKey: !!settings.renderApiKey,
      hasVercelToken: !!settings.vercelToken,
      projects,
      logs,
      settings,
    });
  }
  return result;
}

// ── Admin: delete a user's data ──

export async function deleteUser(username) {
  const users = await loadUsers();
  const filtered = users.filter(u => u.username !== username);
  await saveUsers(filtered);
  await window.miniappsAI.storage.removeItem(`gc_projects_${username}`);
  await window.miniappsAI.storage.removeItem(`gc_settings_${username}`);
  await window.miniappsAI.storage.removeItem(`gc_logs_${username}`);
}
