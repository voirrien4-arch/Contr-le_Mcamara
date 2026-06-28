import { getDeploymentFiles, SOURCE_FILES } from '../services/source-bundle.js';
// ui/admin-view.js — Admin panel: multi-user system management
// Admin is already authenticated via auth-view (balla/620891542)
// This panel shows ALL registered users and their data

import { getState, setState, addLog } from '../state.js';
import { showToast } from './toast-view.js';
import {
  loadUsers, saveUsers, loadAllUsersData, deleteUser,
  loadProjects, saveProjects, loadSettings, saveSettings,
  loadLogs, saveLogs, clearSession,
} from '../storage.js';

const t = (key) => window.miniappI18n?.t(key) ?? key;

let activeTab = 'overview';
let showKeys = false;
let selectedUser = null; // for viewing a specific user's data

export function resetAdmin() {
  activeTab = 'overview';
  showKeys = false;
  selectedUser = null;
}

export function renderAdmin(container) {
  const { user } = getState();
  if (!user?.isAdmin) {
    container.innerHTML = `
      <div class="min-h-[80vh] flex items-center justify-center px-4">
        <div class="text-center">
          <p class="text-6xl mb-4">🚫</p>
          <h2 class="text-xl font-bold text-white mb-2">Access Denied</h2>
          <p class="text-slate-400">Admin privileges required</p>
        </div>
      </div>`;
    return;
  }
  renderAdminPanel(container);
}

// ── Main Admin Panel ──

async function renderAdminPanel(container) {
  const { user } = getState();
  const allUsersData = await loadAllUsersData();

  // Aggregate stats
  let totalProjects = 0, liveProjects = 0, totalLogs = 0;
  const byPlatform = { render: 0, vercel: 0 };
  const byType = { bot: 0, site: 0, api: 0 };

  allUsersData.forEach(u => {
    totalProjects += u.projectCount;
    totalLogs += u.logCount;
    u.projects.forEach(p => {
      if (p.status === 'live') liveProjects++;
      if (byPlatform[p.platform] !== undefined) byPlatform[p.platform]++;
      if (byType[p.type] !== undefined) byType[p.type]++;
    });
  });

  const stats = {
    totalUsers: allUsersData.length,
    totalProjects,
    liveProjects,
    totalLogs,
    byPlatform,
    byType,
  };

  // If viewing a specific user's detail
  if (selectedUser) {
    const userData = allUsersData.find(u => u.username === selectedUser);
    if (userData) {
      container.innerHTML = renderUserDetail(userData);
      bindUserDetailActions(container, userData);
      return;
    }
    selectedUser = null;
  }

  container.innerHTML = `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-white">🛡️ ${t('admin.title')}</h1>
          <p class="text-slate-400 mt-1 text-sm">${t('admin.subtitle')} — <span class="text-red-400 font-medium">${esc(user.username)}</span></p>
        </div>
        <button id="adminLogout" class="px-4 py-2 bg-red-500/15 border border-red-500/25 text-red-400 hover:bg-red-500/25 rounded-xl text-sm transition font-medium">
          🚪 ${t('admin.logout')}
        </button>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        ${statCard('👤', t('admin.users'), stats.totalUsers, 'cyan')}
        ${statCard('📦', t('admin.totalProjects'), stats.totalProjects, 'amber')}
        ${statCard('🟢', t('admin.liveProjects'), stats.liveProjects, 'emerald')}
        ${statCard('📋', t('admin.totalLogs'), stats.totalLogs, 'slate')}
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 border-b border-white/10 pb-0 overflow-x-auto" role="tablist">
        ${['overview', 'users', 'logs', 'source', 'danger'].map(tab => `
          <button data-admin-tab="${tab}" class="px-4 py-2.5 text-sm font-medium rounded-t-lg transition whitespace-nowrap ${activeTab === tab ? 'bg-white/5 text-red-300 border-b-2 border-red-400' : 'text-slate-400 hover:text-white hover:bg-white/5'}" role="tab">
            ${tab === 'overview' ? '📊 ' + t('admin.overview') : tab === 'users' ? '👥 ' + t('admin.users') : tab === 'logs' ? '📋 ' + t('admin.logs') : tab === 'source' ? '📥 Source Code' : '⚠️ ' + t('admin.dangerZone')}
          </button>
        `).join('')}
      </div>

      <div id="adminTabContent">${renderTabContent(activeTab, { allUsersData, stats })}</div>
    </div>
  `;

  // Bind logout
  document.getElementById('adminLogout')?.addEventListener('click', async () => {
    await clearSession();
    setState({ user: null, currentView: 'auth', projects: [], settings: { renderApiKey: '', vercelToken: '', githubToken: '' }, logs: [], sidebarOpen: false });
    showToast(t('admin.logoutMsg'), 'info');
  });

  // Bind tabs
  container.querySelectorAll('[data-admin-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.adminTab;
      renderAdminPanel(container);
    });
  });

  bindTabActions(container, allUsersData);
}

// ── Tab Router ──

function renderTabContent(tab, data) {
  switch (tab) {
    case 'overview': return renderOverviewTab(data);
    case 'users': return renderUsersTab(data);
    case 'logs': return renderLogsTab(data);
    case 'source': return renderSourceTab();
    case 'danger': return renderDangerTab(data);
    default: return '';
  }
}

// ── Source Code Tab ──

function renderSourceTab() {
  return `
    <div class="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
      <div class="flex items-center gap-3">
        <div class="p-3 bg-emerald-500/20 rounded-xl">
          <span class="text-2xl">📦</span>
        </div>
        <div>
          <h3 class="text-lg font-bold text-white">Download Source Code</h3>
          <p class="text-slate-400 text-sm">Generate a complete, deployable ZIP file of the entire Gold_Crew project.</p>
        </div>
      </div>
      
      <div class="p-4 bg-slate-900/50 rounded-xl border border-white/5">
        <h4 class="text-sm font-medium text-white mb-2">Included Files</h4>
        <ul class="text-xs text-slate-400 space-y-1 ml-4 list-disc">
          <li>index.html (App shell)</li>
          <li>server.js & package.json (Render/Node server)</li>
          <li>storage-shim.js & i18n-shim.js (Polyfills for standalone deployment)</li>
          <li>main.js & state.js (Core logic)</li>
          <li>ui/*.js (Interface components)</li>
          <li>services/*.js (Deployment engines)</li>
          <li>locales/*.json (Translations)</li>
        </ul>
      </div>

      <button id="downloadSourceBtn" class="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition flex items-center justify-center gap-2">
        <span>📥</span> Download ZIP for Render
      </button>
      <p class="text-xs text-center text-slate-500">Ready to deploy: Build Command: <code class="bg-slate-800 px-1.5 py-0.5 rounded">npm install</code> | Start Command: <code class="bg-slate-800 px-1.5 py-0.5 rounded">npm start</code></p>
    </div>
  `;
}

// ── Overview Tab ──

function renderOverviewTab({ allUsersData, stats }) {
  return `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- Users List -->
      <div class="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
        <h3 class="font-bold text-white text-sm flex items-center gap-2">👥 ${t('admin.registeredUser')}s (${allUsersData.length})</h3>
        ${allUsersData.length === 0 ? '<p class="text-slate-500 text-sm">No users registered yet</p>' : ''}
        ${allUsersData.map(u => `
          <div class="flex items-center gap-3 p-3 bg-slate-900/50 rounded-xl">
            <div class="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-lg">👤</div>
            <div class="flex-1 min-w-0">
              <p class="text-white font-medium truncate">${esc(u.username)}</p>
              <p class="text-[11px] text-slate-500">${u.projectCount} projects • ${u.logCount} logs • Joined ${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}</p>
            </div>
            <button data-view-user="${esc(u.username)}" class="px-3 py-1.5 bg-amber-500/15 border border-amber-500/25 text-amber-300 hover:bg-amber-500/25 rounded-lg text-xs transition">View</button>
          </div>
        `).join('')}
      </div>

      <!-- API Keys Status (all users) -->
      <div class="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
        <h3 class="font-bold text-white text-sm flex items-center gap-2">🔑 ${t('admin.apiKeys')} (${t('admin.configured')})</h3>
        ${allUsersData.map(u => `
          <div class="p-3 bg-slate-900/50 rounded-xl space-y-1.5">
            <p class="text-white text-sm font-medium">${esc(u.username)}</p>
            <div class="flex gap-3 text-xs">
              <span class="${u.hasGithubToken ? 'text-emerald-400' : 'text-red-400'}">GitHub: ${u.hasGithubToken ? '✓' : '✕'}</span>
              <span class="${u.hasRenderKey ? 'text-emerald-400' : 'text-red-400'}">Render: ${u.hasRenderKey ? '✓' : '✕'}</span>
              <span class="${u.hasVercelToken ? 'text-emerald-400' : 'text-red-400'}">Vercel: ${u.hasVercelToken ? '✓' : '✕'}</span>
            </div>
          </div>
        `).join('')}
        ${allUsersData.length === 0 ? '<p class="text-slate-500 text-sm">No users yet</p>' : ''}
      </div>

      <!-- Platform Distribution -->
      <div class="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
        <h3 class="font-bold text-white text-sm flex items-center gap-2">☁️ ${t('admin.platforms')}</h3>
        ${barRow('Render', stats.byPlatform.render, stats.totalProjects, 'purple')}
        ${barRow('Vercel', stats.byPlatform.vercel, stats.totalProjects, 'white')}
      </div>

      <!-- Type Distribution -->
      <div class="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
        <h3 class="font-bold text-white text-sm flex items-center gap-2">📂 ${t('admin.projectTypes')}</h3>
        ${barRow('🤖 Bot', stats.byType.bot, stats.totalProjects, 'cyan')}
        ${barRow('🌐 Site', stats.byType.site, stats.totalProjects, 'amber')}
        ${barRow('⚡ API', stats.byType.api, stats.totalProjects, 'emerald')}
      </div>
    </div>
  `;
}

// ── Users Tab ──

function renderUsersTab({ allUsersData }) {
  if (allUsersData.length === 0) {
    return `<div class="text-center py-10 text-slate-500"><p class="text-4xl mb-3">👤</p><p>No users registered yet</p></div>`;
  }
  return `
    <div class="space-y-3">
      ${allUsersData.map(u => `
        <div class="bg-white/5 border border-white/10 rounded-xl p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center text-xl shrink-0">👤</div>
              <div class="min-w-0">
                <p class="text-white font-medium text-lg">${esc(u.username)}</p>
                <p class="text-xs text-slate-500 mt-0.5">Joined ${u.createdAt ? new Date(u.createdAt).toLocaleString() : 'N/A'}</p>
                <div class="flex flex-wrap gap-2 mt-2">
                  <span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">${u.projectCount} projects</span>
                  <span class="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300">${u.logCount} logs</span>
                  ${u.hasGithubToken ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">GitHub ✓</span>' : ''}
                  ${u.hasRenderKey ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300">Render ✓</span>' : ''}
                  ${u.hasVercelToken ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-slate-300">Vercel ✓</span>' : ''}
                </div>
              </div>
            </div>
            <div class="flex flex-col gap-2 shrink-0">
              <button data-view-user="${esc(u.username)}" class="px-4 py-2 bg-amber-500/15 border border-amber-500/25 text-amber-300 hover:bg-amber-500/25 rounded-lg text-xs transition font-medium">
                👁 View Details
              </button>
              <button data-delete-user="${esc(u.username)}" class="px-4 py-2 bg-red-500/15 border border-red-500/25 text-red-400 hover:bg-red-500/25 rounded-lg text-xs transition">
                🗑 Delete
              </button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ── User Detail View ──

function renderUserDetail(userData) {
  return `
    <div class="space-y-6">
      <div class="flex items-center gap-4">
        <button id="backToUsers" class="px-4 py-2 border border-white/10 text-slate-300 hover:bg-white/5 rounded-xl text-sm transition">← Back</button>
        <div>
          <h1 class="text-2xl font-bold text-white">👤 ${esc(userData.username)}</h1>
          <p class="text-slate-400 text-sm">${userData.projectCount} projects • ${userData.logCount} logs • Joined ${userData.createdAt ? new Date(userData.createdAt).toLocaleString() : 'N/A'}</p>
        </div>
      </div>

      <!-- User API Keys -->
      <div class="bg-white/5 border border-white/10 rounded-2xl p-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-bold text-white text-sm flex items-center gap-2">🔑 ${t('admin.apiKeys')}</h3>
          <button id="toggleShowKeys" class="px-3 py-1.5 bg-slate-800 border border-white/10 text-slate-300 hover:text-white rounded-lg text-xs transition">
            ${showKeys ? '🙈 ' + t('admin.hideKeys') : '👁 ' + t('admin.showKeys')}
          </button>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          ${userKeyCard('GitHub', userData.settings.githubToken, showKeys)}
          ${userKeyCard('Render', userData.settings.renderApiKey, showKeys)}
          ${userKeyCard('Vercel', userData.settings.vercelToken, showKeys)}
        </div>
      </div>

      <!-- User Projects -->
      <div class="bg-white/5 border border-white/10 rounded-2xl p-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-bold text-white text-sm">📦 Projects (${userData.projects.length})</h3>
          <button data-admin-delete-all-projects="${esc(userData.username)}" class="px-3 py-1.5 bg-red-500/15 border border-red-500/25 text-red-400 hover:bg-red-500/25 rounded-lg text-xs transition">
            🗑 Delete All
          </button>
        </div>
        ${userData.projects.length === 0 ? '<p class="text-slate-500 text-sm">No projects</p>' : `
          <div class="space-y-2 max-h-[40vh] overflow-y-auto">
            ${userData.projects.map(p => `
              <div class="p-3 bg-slate-900/50 rounded-xl flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-white font-medium">${esc(p.name)}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded-full ${p.platform === 'render' ? 'bg-purple-500/20 text-purple-300' : 'bg-white/10 text-slate-300'}">${p.platform}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300">${p.type}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded-full ${p.status === 'live' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}">${p.status}</span>
                  </div>
                  ${p.url ? `<a href="${p.url}" target="_blank" rel="noopener" class="text-xs text-cyan-400 hover:underline">${p.url}</a>` : ''}
                </div>
                <button data-admin-delete-project="${p.id}" data-user="${esc(userData.username)}" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-red-500/20 flex items-center justify-center text-red-400 transition shrink-0" aria-label="Delete">🗑</button>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <!-- User Logs -->
      <div class="bg-white/5 border border-white/10 rounded-2xl p-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-bold text-white text-sm">📋 ${t('admin.logs')} (${userData.logs.length})</h3>
          <div class="flex gap-2">
            <button data-admin-export-user-logs="${esc(userData.username)}" class="px-3 py-1.5 border border-white/10 text-slate-300 hover:bg-white/5 rounded-lg text-xs transition">📥 Export</button>
            <button data-admin-clear-user-logs="${esc(userData.username)}" class="px-3 py-1.5 bg-red-500/15 border border-red-500/25 text-red-400 hover:bg-red-500/25 rounded-lg text-xs transition">🗑 Clear</button>
          </div>
        </div>
        ${userData.logs.length === 0 ? '<p class="text-slate-500 text-sm">No logs</p>' : `
          <div class="space-y-1.5 max-h-[30vh] overflow-y-auto">
            ${userData.logs.slice(0, 50).map(l => `
              <div class="flex items-start gap-2 text-xs p-2 bg-slate-900/30 rounded-lg">
                <span class="shrink-0">${l.type === 'success' ? '✅' : l.type === 'error' ? '❌' : 'ℹ️'}</span>
                <div class="min-w-0">
                  <p class="text-slate-200 break-words">${esc(l.message)}</p>
                  <p class="text-slate-600 mt-0.5">${new Date(l.timestamp).toLocaleString()}</p>
                </div>
              </div>
            `).join('')}
            ${userData.logs.length > 50 ? `<p class="text-slate-600 text-xs text-center">... and ${userData.logs.length - 50} more</p>` : ''}
          </div>
        `}
      </div>
    </div>
  `;
}

// ── Logs Tab ──

function renderLogsTab({ allUsersData }) {
  const allLogs = [];
  allUsersData.forEach(u => {
    u.logs.forEach(l => allLogs.push({ ...l, _user: u.username }));
  });
  allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const successCount = allLogs.filter(l => l.type === 'success').length;
  const errorCount = allLogs.filter(l => l.type === 'error').length;
  const infoCount = allLogs.filter(l => l.type === 'info').length;

  if (allLogs.length === 0) {
    return `<div class="text-center py-10 text-slate-500"><p class="text-4xl mb-3">📋</p><p>No logs recorded</p></div>`;
  }

  return `
    <div class="space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <div class="flex gap-3 text-xs">
          <span class="text-emerald-400">✅ ${successCount}</span>
          <span class="text-red-400">❌ ${errorCount}</span>
          <span class="text-cyan-400">ℹ️ ${infoCount}</span>
          <span class="text-slate-500">Total: ${allLogs.length}</span>
        </div>
        <div class="flex gap-2">
          <button id="adminExportAllLogs" class="px-3 py-1.5 border border-white/10 text-slate-300 hover:bg-white/5 rounded-lg text-xs transition">📥 ${t('admin.exportLogs')}</button>
          <button id="adminClearAllLogs" class="px-3 py-1.5 bg-red-500/15 border border-red-500/25 text-red-400 hover:bg-red-500/25 rounded-lg text-xs transition">🗑 ${t('admin.clearLogs')}</button>
        </div>
      </div>
      <div class="space-y-1.5 max-h-[60vh] overflow-y-auto">
        ${allLogs.slice(0, 100).map(l => `
          <div class="bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 flex items-start gap-2.5">
            <span class="shrink-0 mt-0.5">${l.type === 'success' ? '✅' : l.type === 'error' ? '❌' : 'ℹ️'}</span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">${esc(l._user)}</span>
                <p class="text-sm text-slate-200 break-words">${esc(l.message)}</p>
              </div>
              <p class="text-[10px] text-slate-600 mt-0.5">${new Date(l.timestamp).toLocaleString()}</p>
            </div>
          </div>
        `).join('')}
        ${allLogs.length > 100 ? `<p class="text-slate-600 text-xs text-center">... and ${allLogs.length - 100} more</p>` : ''}
      </div>
    </div>
  `;
}

// ── Danger Zone Tab ──

function renderDangerTab() {
  return `
    <div class="space-y-4">
      <div class="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 space-y-4">
        <h3 class="text-red-400 font-bold text-sm">⚠️ ${t('admin.dangerTitle')}</h3>
        <div class="space-y-3">
          ${dangerAction('Clear All Logs', 'Delete all logs from all users permanently', 'dangerClearLogs', 'Clear Logs')}
          ${dangerAction('Delete All Projects', 'Remove all projects from all users', 'dangerDeleteProjects', 'Delete Projects')}
          ${dangerAction('Clear All API Keys', 'Remove all stored API tokens from all users', 'dangerClearKeys', 'Clear Keys')}

          <div class="border-t border-red-500/20 pt-3 mt-3">
            <div class="flex items-center justify-between p-3 bg-red-900/20 rounded-xl border border-red-500/30">
              <div>
                <p class="text-red-300 text-sm font-bold">🔥 ${t('admin.nukeAll')}</p>
                <p class="text-xs text-red-400/70">${t('admin.nukeAllDesc')}</p>
              </div>
              <button id="dangerNuke" class="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm rounded-lg transition font-bold">
                ${t('admin.nukeAll')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function dangerAction(title, desc, id, btnLabel) {
  return `
    <div class="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl">
      <div>
        <p class="text-white text-sm font-medium">${title}</p>
        <p class="text-xs text-slate-500">${desc}</p>
      </div>
      <button id="${id}" class="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg transition font-medium">${btnLabel}</button>
    </div>
  `;
}

// ── User Detail Actions ──

function bindUserDetailActions(container, userData) {
  document.getElementById('backToUsers')?.addEventListener('click', () => { selectedUser = null; renderAdminPanel(container); });
  document.getElementById('toggleShowKeys')?.addEventListener('click', () => { showKeys = !showKeys; renderAdminPanel(container); });

  container.querySelectorAll('[data-admin-delete-project]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = +btn.dataset.adminDeleteProject;
      const uname = btn.dataset.user;
      if (!confirm(`Delete project #${id}?`)) return;
      const projects = await loadProjects(uname);
      const filtered = projects.filter(p => p.id !== id);
      await saveProjects(uname, filtered);
      addLog({ type: 'info', message: `🛡️ Admin deleted project #${id} from ${uname}` });
      showToast('Project deleted', 'success');
      selectedUser = uname; // refresh
      renderAdminPanel(container);
    });
  });

  container.querySelector(`[data-admin-delete-all-projects="${userData.username}"]`)?.addEventListener('click', async () => {
    if (!confirm(`Delete ALL projects for ${userData.username}?`)) return;
    await saveProjects(userData.username, []);
    addLog({ type: 'info', message: `🛡️ Admin deleted all projects from ${userData.username}` });
    showToast('All projects deleted', 'success');
    renderAdminPanel(container);
  });

  container.querySelector(`[data-admin-export-user-logs="${userData.username}"]`)?.addEventListener('click', () => {
    const text = userData.logs.map(l => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}`).join('\n');
    downloadText(text, `gold-crew-logs-${userData.username}.txt`);
    showToast('Logs exported', 'success');
  });

  container.querySelector(`[data-admin-clear-user-logs="${userData.username}"]`)?.addEventListener('click', async () => {
    if (!confirm(`Clear all logs for ${userData.username}?`)) return;
    await saveLogs(userData.username, []);
    addLog({ type: 'info', message: `🛡️ Admin cleared logs for ${userData.username}` });
    showToast('Logs cleared', 'success');
    renderAdminPanel(container);
  });
}

// ── Tab Actions ──

function bindTabActions(container, allUsersData) {
  // View user detail
  container.querySelectorAll('[data-view-user]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedUser = btn.dataset.viewUser;
      renderAdminPanel(container);
    });
  });

  // Delete single user
  container.querySelectorAll('[data-delete-user]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uname = btn.dataset.deleteUser;
      if (!confirm(`DELETE user "${uname}" and ALL their data? This cannot be undone.`)) return;
      await deleteUser(uname);
      addLog({ type: 'info', message: `🛡️ Admin deleted user "${uname}"` });
      showToast(`User "${uname}" deleted`, 'success');
      renderAdminPanel(container);
    });
  });

  // Clear all logs
  document.getElementById('adminClearAllLogs')?.addEventListener('click', async () => {
    if (!confirm('Clear ALL logs from ALL users?')) return;
    for (const u of allUsersData) {
      await saveLogs(u.username, []);
    }
    addLog({ type: 'info', message: '🛡️ Admin cleared all logs' });
    showToast('All logs cleared', 'success');
    renderAdminPanel(container);
  });

  // Export all logs
  document.getElementById('adminExportAllLogs')?.addEventListener('click', () => {
    const lines = [];
    allUsersData.forEach(u => {
      u.logs.forEach(l => lines.push(`[${u.username}] [${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}`));
    });
    downloadText(lines.join('\n'), 'gold-crew-all-logs.txt');
    showToast('All logs exported', 'success');
  });

  // Download Source Code
  document.getElementById('downloadSourceBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('downloadSourceBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="animate-spin">⏳</span> Generating ZIP...`;
    
    try {
      await generateSourceZip();
      showToast('Source code ZIP downloaded!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to generate ZIP: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  });

  // Danger zone actions
  document.getElementById('dangerClearLogs')?.addEventListener('click', async () => {
    if (!confirm('Clear ALL logs from ALL users?')) return;
    for (const u of allUsersData) await saveLogs(u.username, []);
    addLog({ type: 'info', message: '🛡️ Admin cleared all logs' });
    showToast('All logs cleared', 'success');
    renderAdminPanel(container);
  });

  document.getElementById('dangerDeleteProjects')?.addEventListener('click', async () => {
    if (!confirm('DELETE ALL PROJECTS from ALL users?')) return;
    for (const u of allUsersData) await saveProjects(u.username, []);
    addLog({ type: 'info', message: '🛡️ Admin deleted all projects' });
    showToast('All projects deleted', 'success');
    renderAdminPanel(container);
  });

  document.getElementById('dangerClearKeys')?.addEventListener('click', async () => {
    if (!confirm('Clear ALL API keys from ALL users?')) return;
    for (const u of allUsersData) {
      await saveSettings(u.username, { renderApiKey: '', vercelToken: '', githubToken: '' });
    }
    addLog({ type: 'info', message: '🛡️ Admin cleared all API keys' });
    showToast('All API keys cleared', 'success');
    renderAdminPanel(container);
  });

  document.getElementById('dangerNuke')?.addEventListener('click', async () => {
    if (!confirm(t('admin.confirmNuke'))) return;
    if (!confirm('Last chance. Everything will be permanently deleted.')) return;
    // Delete all users and their data
    for (const u of allUsersData) {
      await deleteUser(u.username);
    }
    await clearSession();
    adminAuthed = false;
    showToast('All data nuked', 'error');
    setState({ user: null, currentView: 'auth', projects: [], settings: { renderApiKey: '', vercelToken: '', githubToken: '' }, logs: [] });
  });
}

// ── Generate Source ZIP ──

async function generateSourceZip() {
  const zip = new JSZip();

  const baseUrl = new URL('../', import.meta.url).href;
  const failed = [];

  // Fetch source files via import.meta.url (works in sandbox for same-origin JS/CSS/JSON)
  for (const filePath of SOURCE_FILES) {
    try {
      const res = await fetch(baseUrl + filePath);
      if (res.ok) {
        const text = await res.text();
        zip.file(filePath, text);
      } else {
        failed.push(filePath);
      }
    } catch {
      failed.push(filePath);
    }
  }

  // Add embedded deployment files (index.html, .gitignore, package.json, server.js, render.yaml, README.md)
  const deployFiles = getDeploymentFiles();
  for (const [path, content] of Object.entries(deployFiles)) {
    zip.file(path, content);
  }

  if (failed.length > 0) {
    const msg = `${failed.length} files could not be read: ${failed.join(', ')}. The ZIP may be incomplete.`;
    console.warn(msg);
    showToast(msg, 'warning', 6000);
  }

  const content = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = "gold-crew-deploy.zip";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Helpers ──

function statCard(icon, label, value, color) {
  return `
    <div class="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
      <p class="text-2xl mb-1">${icon}</p>
      <p class="text-2xl font-bold text-${color}-400">${value}</p>
      <p class="text-xs text-slate-500 mt-0.5">${label}</p>
    </div>
  `;
}

function barRow(label, count, total, color) {
  const pct = total > 0 ? (count / total * 100) : 0;
  return `
    <div>
      <div class="flex items-center justify-between text-sm mb-1">
        <span class="text-slate-300">${label}</span>
        <span class="text-${color}-400 text-xs">${count}</span>
      </div>
      <div class="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div class="h-full bg-${color}-500 rounded-full transition-all" style="width:${pct}%"></div>
      </div>
    </div>
  `;
}

function userKeyCard(label, value, show) {
  const masked = value ? value.substring(0, 6) + '••••' + value.substring(value.length - 4) : 'Not set';
  const display = show && value ? value : masked;
  return `
    <div class="bg-slate-900/50 rounded-xl p-3">
      <div class="flex items-center justify-between gap-2">
        <p class="text-sm font-medium text-white">${label}</p>
        <span class="w-2.5 h-2.5 rounded-full ${value ? 'bg-emerald-500' : 'bg-red-500'}"></span>
      </div>
      <p class="text-xs text-slate-500 font-mono truncate mt-1">${esc(display)}</p>
    </div>
  `;
}

function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
