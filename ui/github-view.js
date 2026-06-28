// ui/github-view.js — GitHub Control Panel: profile, repos, search, create

import { getState, setState } from '../state.js';
import { showToast } from './toast-view.js';
import { validateGithubToken, getUserProfile, listRepos, searchRepos, createNewRepo, getRateLimit } from '../services/github-service.js';
import { renderGithubRepo } from './github-repo-view.js';

const t = (key) => window.miniappI18n?.t(key) ?? key;

let profile = null;
let repos = [];
let page = 1;
let hasMore = false;
let loading = false;
let searchQuery = '';
let sortBy = 'updated';
let filterType = 'all';
let selectedRepo = null;
let rateLimit = null;

export function resetGithubView() {
  profile = null;
  repos = [];
  page = 1;
  hasMore = false;
  loading = false;
  searchQuery = '';
  sortBy = 'updated';
  filterType = 'all';
  selectedRepo = null;
  rateLimit = null;
}

export function renderGithub(container) {
  const { settings } = getState();
  const token = settings.githubToken;

  if (!token) {
    container.innerHTML = noTokenView();
    bindNoToken(container);
    return;
  }

  if (selectedRepo) {
    renderGithubRepo(container, token, selectedRepo, () => {
      selectedRepo = null;
      renderGithub(container);
    });
    return;
  }

  container.innerHTML = `
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold text-white flex items-center gap-2">
            <svg class="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            GitHub Control
          </h1>
          <p class="text-slate-400 text-sm mt-1">Manage your repositories, files, and commits</p>
        </div>
        <div class="flex gap-2">
          <button id="ghRefresh" class="px-4 py-2.5 bg-slate-800 border border-white/10 hover:bg-slate-700 rounded-xl text-sm text-slate-300 transition flex items-center gap-2">
            ↻ Refresh
          </button>
          <button id="ghCreateRepo" class="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm transition flex items-center gap-2">
            + New Repo
          </button>
        </div>
      </div>

      <div id="ghProfile">${loadingProfile()}</div>

      <div id="ghCreatePanel" class="hidden">${createRepoForm()}</div>

      <div class="bg-white/5 border border-white/10 rounded-2xl p-4">
        <div class="flex flex-col sm:flex-row gap-3 mb-4">
          <div class="flex-1 relative">
            <input type="text" id="ghSearch" value="${esc(searchQuery)}" placeholder="Search repositories..." class="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition text-sm">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
          </div>
          <div class="flex gap-2">
            <select id="ghSort" class="px-3 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-sm text-slate-300 focus:outline-none focus:border-amber-500">
              <option value="updated" ${sortBy === 'updated' ? 'selected' : ''}>Recently updated</option>
              <option value="created" ${sortBy === 'created' ? 'selected' : ''}>Recently created</option>
              <option value="pushed" ${sortBy === 'pushed' ? 'selected' : ''}>Recently pushed</option>
              <option value="full_name" ${sortBy === 'full_name' ? 'selected' : ''}>Name A-Z</option>
            </select>
            <select id="ghFilter" class="px-3 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-sm text-slate-300 focus:outline-none focus:border-amber-500">
              <option value="all" ${filterType === 'all' ? 'selected' : ''}>All</option>
              <option value="owner" ${filterType === 'owner' ? 'selected' : ''}>Owned</option>
              <option value="public" ${filterType === 'public' ? 'selected' : ''}>Public</option>
              <option value="private" ${filterType === 'private' ? 'selected' : ''}>Private</option>
            </select>
          </div>
        </div>
        <div id="ghRepos">${loading ? loadingRepos() : reposList()}</div>
        ${hasMore ? `<div class="mt-4 text-center"><button id="ghLoadMore" class="px-6 py-2.5 border border-white/10 text-slate-300 hover:bg-white/5 rounded-xl text-sm transition">Load More</button></div>` : ''}
      </div>

      ${rateLimitHtml()}
    </div>
  `;

  bind(container, token);
  if (!profile) loadProfile(token, container);
  if (repos.length === 0 && !loading) loadRepos(token, container);
}

function noTokenView() {
  return `
    <div class="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div class="text-6xl mb-4">🔑</div>
      <h2 class="text-2xl font-bold text-white mb-2">GitHub Token Required</h2>
      <p class="text-slate-400 max-w-md mb-6">Connect your GitHub account to manage repositories, browse files, and view commits directly from Gold_Crew.</p>
      <div class="bg-slate-800/50 border border-white/10 rounded-2xl p-6 max-w-md w-full text-left space-y-4">
        <h3 class="text-sm font-medium text-slate-300">How to get your token:</h3>
        <ol class="text-sm text-slate-400 space-y-2 list-decimal list-inside">
          <li>Go to <a href="https://github.com/settings/tokens/new?scopes=repo,workflow,delete_repo&description=Gold_Crew" target="_blank" rel="noopener" class="text-amber-400 underline hover:text-amber-300">github.com/settings/tokens</a></li>
          <li>Select scopes: <code class="bg-slate-700 px-1.5 py-0.5 rounded text-amber-300">repo</code>, <code class="bg-slate-700 px-1.5 py-0.5 rounded text-amber-300">workflow</code></li>
          <li>Click "Generate token" and copy it</li>
          <li>Paste it in <button data-goto-settings class="text-amber-400 underline hover:text-amber-300">Settings → GitHub Token</button></li>
        </ol>
      </div>
    </div>`;
}

function loadingProfile() {
  return `
    <div class="bg-white/5 border border-white/10 rounded-2xl p-6 animate-pulse">
      <div class="flex items-center gap-4">
        <div class="w-16 h-16 rounded-full bg-slate-700"></div>
        <div class="space-y-2 flex-1">
          <div class="h-5 bg-slate-700 rounded w-40"></div>
          <div class="h-3 bg-slate-700 rounded w-60"></div>
        </div>
      </div>
    </div>`;
}

function profileHtml() {
  if (!profile) return loadingProfile();
  const bio = profile.bio || '';
  const location = profile.location || '';
  const company = profile.company || '';
  return `
    <div class="bg-white/5 border border-white/10 rounded-2xl p-5">
      <div class="flex flex-col sm:flex-row items-start gap-4">
        <img src="${profile.avatar_url}&s=128" alt="${esc(profile.login)}" class="w-16 h-16 rounded-full border-2 border-white/10" loading="lazy">
        <div class="flex-1 min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-lg font-bold text-white">${esc(profile.name || profile.login)}</h2>
            <span class="text-slate-500 text-sm">@${esc(profile.login)}</span>
            ${profile.hireable ? '<span class="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">Hireable</span>' : ''}
          </div>
          ${bio ? `<p class="text-slate-300 text-sm mt-1">${esc(bio)}</p>` : ''}
          <div class="flex flex-wrap gap-4 mt-2 text-xs text-slate-400">
            ${company ? `<span>🏢 ${esc(company)}</span>` : ''}
            ${location ? `<span>📍 ${esc(location)}</span>` : ''}
            <span>📦 ${profile.public_repos} public repos</span>
            ${profile.public_gists ? `<span>📝 ${profile.public_gists} gists</span>` : ''}
            <span>👥 ${profile.followers} followers · ${profile.following} following</span>
          </div>
        </div>
        <a href="${profile.html_url}" target="_blank" rel="noopener" class="text-xs px-3 py-1.5 bg-slate-800 border border-white/10 rounded-lg text-slate-400 hover:text-white transition">↗ GitHub</a>
      </div>
    </div>`;
}

function loadingRepos() {
  return `<div class="space-y-3">${[1,2,3,4].map(() => `
    <div class="animate-pulse flex items-center gap-3 p-4 bg-slate-800/50 rounded-xl">
      <div class="w-5 h-5 bg-slate-700 rounded"></div>
      <div class="flex-1 space-y-2">
        <div class="h-4 bg-slate-700 rounded w-48"></div>
        <div class="h-3 bg-slate-700 rounded w-72"></div>
      </div>
    </div>`).join('')}</div>`;
}

function reposList() {
  if (!repos.length && !loading) {
    return `<div class="text-center py-10 text-slate-500">
      <p class="text-3xl mb-2">📦</p>
      <p class="font-medium">${searchQuery ? 'No repos match your search' : 'No repositories found'}</p>
    </div>`;
  }

  return `<div class="space-y-2">${repos.map(repo => `
    <button data-repo="${esc(repo.full_name)}" class="w-full text-left p-4 bg-slate-800/40 hover:bg-slate-800 border border-white/5 hover:border-white/10 rounded-xl transition group">
      <div class="flex items-start gap-3">
        <span class="text-lg mt-0.5">${repo.private ? '🔒' : '📂'}</span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-medium text-white group-hover:text-amber-300 transition truncate">${esc(repo.name)}</span>
            ${repo.fork ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">fork</span>' : ''}
            ${repo.archived ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">archived</span>' : ''}
          </div>
          ${repo.description ? `<p class="text-xs text-slate-400 mt-1 line-clamp-1">${esc(repo.description)}</p>` : ''}
          <div class="flex flex-wrap gap-3 mt-2 text-[11px] text-slate-500">
            ${repo.language ? `<span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full inline-block" style="background:${langColor(repo.language)}"></span>${repo.language}</span>` : ''}
            <span>⭐ ${fmtNum(repo.stargazers_count)}</span>
            <span>🍴 ${fmtNum(repo.forks_count)}</span>
            ${repo.open_issues_count ? `<span>❗ ${repo.open_issues_count}</span>` : ''}
            <span>Updated ${timeAgo(repo.updated_at)}</span>
          </div>
        </div>
        <span class="text-slate-600 group-hover:text-slate-400 transition mt-1">→</span>
      </div>
    </button>
  `).join('')}</div>`;
}

function createRepoForm() {
  return `
    <div class="bg-white/5 border border-amber-500/30 rounded-2xl p-6 space-y-4">
      <h3 class="text-lg font-bold text-white">📁 Create New Repository</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label for="newRepoName" class="block text-sm font-medium text-slate-300 mb-1">Repository name *</label>
          <input type="text" id="newRepoName" placeholder="my-awesome-repo" class="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition text-sm">
        </div>
        <div>
          <label for="newRepoDesc" class="block text-sm font-medium text-slate-300 mb-1">Description</label>
          <input type="text" id="newRepoDesc" placeholder="Optional description" class="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition text-sm">
        </div>
      </div>
      <div class="flex flex-wrap gap-3">
        <label class="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input type="checkbox" id="newRepoPrivate" class="accent-amber-500 w-4 h-4">
          Private repository
        </label>
        <label class="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input type="checkbox" id="newRepoInit" checked class="accent-amber-500 w-4 h-4">
          Initialize with README
        </label>
      </div>
      <div class="flex gap-3">
        <button id="createRepoBtn" class="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm transition">Create Repository</button>
        <button id="cancelCreateRepo" class="px-5 py-2.5 border border-white/10 text-slate-300 hover:bg-white/5 rounded-xl text-sm transition">Cancel</button>
      </div>
    </div>`;
}

function rateLimitHtml() {
  if (!rateLimit) return '';
  const core = rateLimit.resources?.core;
  if (!core) return '';
  const pct = Math.round((core.remaining / core.limit) * 100);
  const color = pct > 50 ? 'bg-emerald-500' : pct > 20 ? 'bg-amber-500' : 'bg-red-500';
  const resetTime = new Date(core.reset * 1000).toLocaleTimeString();
  return `
    <div class="text-xs text-slate-500 flex items-center gap-2 justify-end">
      <span>GitHub API: ${core.remaining}/${core.limit}</span>
      <div class="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden"><div class="${color} h-full rounded-full" style="width:${pct}%"></div></div>
      <span>resets ${resetTime}</span>
    </div>`;
}

// ── Data loading ──

async function loadProfile(token, container) {
  try {
    profile = await getUserProfile(token);
    const el = document.getElementById('ghProfile');
    if (el) el.innerHTML = profileHtml();
  } catch (err) {
    const el = document.getElementById('ghProfile');
    if (el) el.innerHTML = `<div class="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-300 text-sm">✕ ${esc(err.message)}</div>`;
  }
}

async function loadRepos(token, container, reset = false) {
  if (loading) return;
  loading = true;
  if (reset) { page = 1; repos = []; }

  const el = document.getElementById('ghRepos');
  if (el && reset) el.innerHTML = loadingRepos();

  try {
    if (searchQuery.trim()) {
      const result = await searchRepos(token, searchQuery, page);
      const newRepos = result.items || [];
      repos = reset ? newRepos : [...repos, ...newRepos];
      hasMore = result.total_count > repos.length;
    } else {
      const result = await listRepos(token, { page, perPage: 30, sort: sortBy, type: filterType });
      repos = reset ? result.repos : [...repos, ...result.repos];
      hasMore = result.repos.length === 30;
    }

    if (el) el.innerHTML = reposList();
    bindRepoClicks(container, token);

    // Load rate limit
    try {
      rateLimit = await getRateLimit(token);
    } catch {}
  } catch (err) {
    if (el) el.innerHTML = `<div class="text-center py-6 text-red-300 text-sm">✕ ${esc(err.message)}</div>`;
    showToast(err.message, 'error');
  } finally {
    loading = false;
  }
}

// ── Binding ──

function bindNoToken(container) {
  container.querySelector('[data-goto-settings]')?.addEventListener('click', () => {
    setState({ currentView: 'settings' });
  });
}

function bind(container, token) {
  container.querySelector('[data-goto-settings]')?.addEventListener('click', () => setState({ currentView: 'settings' }));

  document.getElementById('ghRefresh')?.addEventListener('click', () => loadRepos(token, container, true));
  document.getElementById('ghLoadMore')?.addEventListener('click', () => { page++; loadRepos(token, container); });

  document.getElementById('ghSearch')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      searchQuery = e.target.value;
      loadRepos(token, container, true);
    }
  });

  document.getElementById('ghSort')?.addEventListener('change', (e) => {
    sortBy = e.target.value;
    loadRepos(token, container, true);
  });

  document.getElementById('ghFilter')?.addEventListener('change', (e) => {
    filterType = e.target.value;
    loadRepos(token, container, true);
  });

  document.getElementById('ghCreateRepo')?.addEventListener('click', () => {
    const panel = document.getElementById('ghCreatePanel');
    if (panel) { panel.classList.toggle('hidden'); }
  });

  document.getElementById('cancelCreateRepo')?.addEventListener('click', () => {
    const panel = document.getElementById('ghCreatePanel');
    if (panel) panel.classList.add('hidden');
  });

  document.getElementById('createRepoBtn')?.addEventListener('click', async () => {
    const name = document.getElementById('newRepoName')?.value?.trim();
    if (!name) { showToast('Enter a repo name', 'warning'); return; }
    const desc = document.getElementById('newRepoDesc')?.value?.trim() || '';
    const isPrivate = document.getElementById('newRepoPrivate')?.checked || false;
    const autoInit = document.getElementById('newRepoInit')?.checked ?? true;

    const btn = document.getElementById('createRepoBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }

    try {
      const repo = await createNewRepo(token, name, { description: desc, private: isPrivate, auto_init: autoInit });
      showToast(`✓ ${repo.full_name} created`, 'success');
      const panel = document.getElementById('ghCreatePanel');
      if (panel) panel.classList.add('hidden');
      loadRepos(token, container, true);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Create Repository'; }
    }
  });

  bindRepoClicks(container, token);
}

function bindRepoClicks(container, token) {
  container.querySelectorAll('[data-repo]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedRepo = btn.dataset.repo;
      renderGithub(container);
    });
  });
}

// ── Helpers ──

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fmtNum(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n; }
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function langColor(lang) {
  const colors = {
    JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5',
    Java: '#b07219', 'C++': '#f34b7d', C: '#555555', 'C#': '#178600',
    Go: '#00ADD8', Rust: '#dea584', Ruby: '#701516', PHP: '#4F5D95',
    Swift: '#F05138', Kotlin: '#A97BFF', Dart: '#00B4AB',
    HTML: '#e34c26', CSS: '#563d7c', Shell: '#89e051', Vue: '#41b883',
  };
  return colors[lang] || '#8b949e';
}
