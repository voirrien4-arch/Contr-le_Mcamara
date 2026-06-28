// ui/github-repo-view.js — Single repo view: files, commits, branches, file viewer

import { getState, setState, addLog } from '../state.js';
import { showToast } from './toast-view.js';
import {
  getRepo, listBranches, listCommits, getContents, getFileContent,
  listLanguages, upsertFile, removeFile, deleteRepo,
} from '../services/github-service.js';

const t = (key) => window.miniappI18n?.t(key) ?? key;

let repo = null;
let branches = [];
let currentBranch = 'main';
let currentPath = '';
let contents = [];
let commits = [];
let languages = {};
let activeTab = 'files';
let viewingFile = null;
let loading = false;

export function resetRepoView() {
  repo = null; branches = []; currentBranch = 'main'; currentPath = '';
  contents = []; commits = []; languages = {}; activeTab = 'files';
  viewingFile = null; loading = false;
}

export function renderGithubRepo(container, token, fullName, onBack) {
  const [owner, repoName] = fullName.split('/');

  container.innerHTML = `
    <div class="space-y-5">
      <!-- Top bar with prominent back button -->
      <div class="flex items-center gap-3">
        <button id="ghBack" class="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm transition active:scale-[0.97] shadow-lg shadow-amber-500/20">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>
          Back
        </button>
        <div class="flex-1 min-w-0">
          <h1 class="text-xl font-bold text-white truncate">
            <span class="text-slate-500 text-sm font-normal">${esc(owner)} /</span>
            <span id="repoNameHeader">${esc(repoName)}</span>
          </h1>
        </div>
        <a href="https://github.com/${esc(owner)}/${esc(repoName)}" target="_blank" rel="noopener"
           class="flex items-center gap-2 px-4 py-2.5 bg-slate-800 border border-white/10 hover:bg-slate-700 rounded-xl text-sm text-slate-300 transition shrink-0">
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
          Open on GitHub
        </a>
      </div>

      <div id="repoHeader">${repo ? repoHeaderHtml() : '<div class="animate-pulse h-24 bg-slate-800/50 rounded-2xl"></div>'}</div>

      <div class="flex gap-1 border-b border-white/10 pb-0" role="tablist">
        ${['files', 'commits', 'branches'].map(tab => `
          <button data-tab="${tab}" class="px-4 py-2.5 text-sm font-medium rounded-t-lg transition ${activeTab === tab ? 'bg-white/5 text-amber-300 border-b-2 border-amber-400' : 'text-slate-400 hover:text-white hover:bg-white/5'}" role="tab">
            ${tab === 'files' ? '📂 Files' : tab === 'commits' ? '📝 Commits' : '🌿 Branches'}
          </button>
        `).join('')}
      </div>

      <div id="repoContent">${loadingContent()}</div>

      <!-- Bottom back button for mobile -->
      <div class="pt-2">
        <button id="ghBackBottom" class="flex items-center gap-2 px-5 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm transition active:scale-[0.97] w-full justify-center sm:w-auto">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>
          Back to Repositories
        </button>
      </div>
    </div>
  `;

  const goBack = () => {
    resetRepoView();
    onBack();
  };

  document.getElementById('ghBack')?.addEventListener('click', goBack);
  document.getElementById('ghBackBottom')?.addEventListener('click', goBack);

  container.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      viewingFile = null;
      renderGithubRepo(container, token, fullName, onBack);
    });
  });

  if (!repo) loadRepo(token, owner, repoName, container, fullName, onBack);
  else bindTabContent(container, token, owner, repoName, fullName, onBack);
}

// ── Data loading ──

async function loadRepo(token, owner, repoName, container, fullName, onBack) {
  try {
    [repo, branches, languages] = await Promise.all([
      getRepo(token, owner, repoName),
      listBranches(token, owner, repoName),
      listLanguages(token, owner, repoName),
    ]);
    currentBranch = repo.default_branch || 'main';
    const headerEl = document.getElementById('repoHeader');
    if (headerEl) headerEl.innerHTML = repoHeaderHtml();
    await loadTabData(token, owner, repoName, container, fullName, onBack);
  } catch (err) {
    showToast(err.message, 'error');
    const contentEl = document.getElementById('repoContent');
    if (contentEl) contentEl.innerHTML = `<div class="text-center py-10 text-red-300">✕ ${esc(err.message)}</div>`;
  }
}

async function loadTabData(token, owner, repoName, container, fullName, onBack) {
  const contentEl = document.getElementById('repoContent');
  if (!contentEl) return;

  try {
    if (activeTab === 'files') {
      if (viewingFile) {
        contentEl.innerHTML = fileViewerHtml();
      } else {
        contents = await getContents(token, owner, repoName, currentPath, currentBranch);
        contents.sort((a, b) => {
          if (a.type === 'dir' && b.type !== 'dir') return -1;
          if (a.type !== 'dir' && b.type === 'dir') return 1;
          return a.name.localeCompare(b.name);
        });
        contentEl.innerHTML = filesTabHtml();
      }
    } else if (activeTab === 'commits') {
      commits = await listCommits(token, owner, repoName, { sha: currentBranch });
      contentEl.innerHTML = commitsTabHtml();
    } else if (activeTab === 'branches') {
      branches = await listBranches(token, owner, repoName);
      contentEl.innerHTML = branchesTabHtml();
    }
  } catch (err) {
    contentEl.innerHTML = `<div class="text-center py-10 text-red-300">✕ ${esc(err.message)}</div>`;
  }

  bindTabContent(container, token, owner, repoName, fullName, onBack);
}

// ── HTML templates ──

function repoHeaderHtml() {
  if (!repo) return '';
  const langArr = Object.entries(languages);
  const totalBytes = langArr.reduce((sum, [, v]) => sum + v, 0);
  return `
    <div class="bg-white/5 border border-white/10 rounded-2xl p-5">
      <div class="flex flex-col sm:flex-row sm:items-start gap-4">
        <div class="flex-1 min-w-0">
          ${repo.description ? `<p class="text-slate-300 text-sm">${esc(repo.description)}</p>` : '<p class="text-slate-500 text-sm italic">No description</p>'}
          <div class="flex flex-wrap gap-3 mt-3 text-xs text-slate-400">
            ${repo.language ? `<span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full" style="background:${langColor(repo.language)}"></span>${repo.language}</span>` : ''}
            <span>⭐ ${fmtNum(repo.stargazers_count)}</span>
            <span>🍴 ${fmtNum(repo.forks_count)}</span>
            <span>👁 ${fmtNum(repo.watchers_count)}</span>
            ${repo.license ? `<span>📜 ${repo.license.spdx_id}</span>` : ''}
            <span>${repo.private ? '🔒 Private' : '🌐 Public'}</span>
            <span>Updated ${timeAgo(repo.updated_at)}</span>
          </div>
          ${langArr.length > 1 ? `
            <div class="flex h-2 rounded-full overflow-hidden mt-3 max-w-md">
              ${langArr.map(([lang, bytes]) => `<div style="width:${(bytes/totalBytes*100).toFixed(1)}%;background:${langColor(lang)}" title="${lang}: ${(bytes/totalBytes*100).toFixed(1)}%"></div>`).join('')}
            </div>
            <div class="flex flex-wrap gap-2 mt-2">
              ${langArr.map(([lang, bytes]) => `<span class="text-[10px] text-slate-500 flex items-center gap-1"><span class="w-2 h-2 rounded-full" style="background:${langColor(lang)}"></span>${lang} ${(bytes/totalBytes*100).toFixed(1)}%</span>`).join('')}
            </div>` : ''}
        </div>
        <div class="flex flex-col gap-2 shrink-0">
          <select id="branchSelect" class="text-xs px-2 py-1.5 bg-slate-800 border border-white/10 rounded-lg text-slate-300 focus:outline-none focus:border-amber-500">
            ${branches.map(b => `<option value="${esc(b.name)}" ${b.name === currentBranch ? 'selected' : ''}>🌿 ${esc(b.name)}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>`;
}

function loadingContent() {
  return `<div class="space-y-2 animate-pulse">${[1,2,3,4,5].map(() => `<div class="h-10 bg-slate-800/50 rounded-lg"></div>`).join('')}</div>`;
}

function filesTabHtml() {
  const crumbs = currentPath ? currentPath.split('/') : [];
  return `
    <div>
      <div class="flex items-center gap-2 text-sm mb-4 flex-wrap">
        <button data-path="" class="text-amber-400 hover:text-amber-300 transition">${esc(repo.name)}</button>
        ${crumbs.map((cr, i) => {
          const p = crumbs.slice(0, i + 1).join('/');
          return `<span class="text-slate-600">/</span><button data-path="${esc(p)}" class="text-amber-400 hover:text-amber-300 transition">${esc(cr)}</button>`;
        }).join('')}
      </div>

      ${currentPath ? `
        <button data-path="${crumbs.slice(0, -1).join('/')}" class="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition w-full text-left mb-1">
          <span>⬆️</span><span>..</span>
        </button>` : ''}

      ${contents.length === 0 ? `
        <div class="text-center py-10 text-slate-500">
          <p class="text-3xl mb-2">📭</p>
          <p>This directory is empty</p>
        </div>` : `
        <div class="space-y-1">
          ${contents.map(item => `
            <button data-${item.type === 'dir' ? 'path' : 'file'}="${esc(item.path)}" data-sha="${item.sha || ''}" class="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-white/5 rounded-lg transition w-full text-left group">
              <span class="text-base">${item.type === 'dir' ? '📁' : fileIcon(item.name)}</span>
              <span class="text-slate-200 group-hover:text-amber-300 transition truncate flex-1">${esc(item.name)}</span>
              ${item.size != null ? `<span class="text-[11px] text-slate-600">${fmtSize(item.size)}</span>` : ''}
            </button>
          `).join('')}
        </div>`}
    </div>`;
}

function fileViewerHtml() {
  if (!viewingFile) return '';
  const isBinary = !viewingFile.content || viewingFile.content.includes('\ufffd');
  return `
    <div>
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <button id="backToDir" class="text-sm text-amber-400 hover:text-amber-300 transition flex items-center gap-1.5 font-medium">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
          Back to files
        </button>
        <div class="flex gap-2">
          <button id="copyFileContent" class="text-xs px-3 py-1.5 bg-slate-800 border border-white/10 rounded-lg text-slate-400 hover:text-white transition">📋 Copy</button>
          <button id="deleteFileBtn" class="text-xs px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 hover:bg-red-500/20 transition">🗑 Delete</button>
        </div>
      </div>
      <div class="bg-slate-900 border border-white/10 rounded-xl overflow-hidden">
        <div class="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-slate-800/50">
          <span class="text-xs text-slate-400 font-mono">${esc(viewingFile.path)}</span>
          <span class="text-[11px] text-slate-600">${fmtSize(viewingFile.content.length)}</span>
        </div>
        ${isBinary ? `
          <div class="p-8 text-center text-slate-500">
            <p class="text-3xl mb-2">📄</p>
            <p class="text-sm">Binary file — cannot display content</p>
          </div>` : `
          <pre class="p-4 text-xs text-slate-300 font-mono overflow-x-auto max-h-[70vh] overflow-y-auto leading-relaxed whitespace-pre-wrap break-words">${esc(viewingFile.content)}</pre>`}
      </div>
    </div>`;
}

function commitsTabHtml() {
  if (!commits.length) {
    return `<div class="text-center py-10 text-slate-500"><p class="text-3xl mb-2">📝</p><p>No commits found</p></div>`;
  }
  return `<div class="space-y-2">
    ${commits.map(c => {
      const msg = c.commit.message.split('\n')[0];
      const author = c.commit.author;
      const avatar = c.author?.avatar_url || '';
      return `
        <a href="${c.html_url}" target="_blank" rel="noopener" class="flex items-start gap-3 p-3 bg-slate-800/30 hover:bg-slate-800/60 rounded-xl transition group">
          ${avatar ? `<img src="${avatar}&s=48" class="w-8 h-8 rounded-full mt-0.5 shrink-0" loading="lazy" alt="">` : '<div class="w-8 h-8 rounded-full bg-slate-700 mt-0.5 shrink-0"></div>'}
          <div class="flex-1 min-w-0">
            <p class="text-sm text-slate-200 group-hover:text-amber-300 transition line-clamp-1">${esc(msg)}</p>
            <div class="flex flex-wrap gap-2 mt-1 text-[11px] text-slate-500">
              <span>${esc(author.name || author.email)}</span>
              <span>•</span>
              <span>${timeAgo(author.date)}</span>
              <span class="font-mono text-slate-600">${c.sha.substring(0, 7)}</span>
            </div>
          </div>
        </a>`;
    }).join('')}
  </div>`;
}

function branchesTabHtml() {
  return `<div class="space-y-2">
    ${branches.map(b => `
      <div class="flex items-center justify-between p-3 bg-slate-800/30 hover:bg-slate-800/60 rounded-xl transition group">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-base">${b.name === currentBranch ? '⭐' : '🌿'}</span>
          <span class="text-sm ${b.name === repo.default_branch ? 'text-amber-300 font-medium' : 'text-slate-300'} truncate">${esc(b.name)}</span>
          ${b.protected ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">protected</span>' : ''}
          ${b.name === repo.default_branch ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">default</span>' : ''}
        </div>
        <div class="flex gap-2 shrink-0">
          <button data-checkout-branch="${esc(b.name)}" class="text-xs px-3 py-1.5 bg-slate-800 border border-white/10 rounded-lg text-slate-400 hover:text-white transition ${b.name === currentBranch ? 'hidden' : ''}">Browse →</button>
        </div>
      </div>
    `).join('')}
  </div>`;
}

// ── Binding ──

function bindTabContent(container, token, owner, repoName, fullName, onBack) {
  document.getElementById('branchSelect')?.addEventListener('change', (e) => {
    currentBranch = e.target.value;
    currentPath = '';
    viewingFile = null;
    loadTabData(token, owner, repoName, container, fullName, onBack);
  });

  container.querySelectorAll('[data-path]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPath = btn.dataset.path;
      viewingFile = null;
      loadTabData(token, owner, repoName, container, fullName, onBack);
    });
  });

  container.querySelectorAll('[data-file]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const filePath = btn.dataset.file;
      const contentEl = document.getElementById('repoContent');
      if (contentEl) contentEl.innerHTML = loadingContent();
      try {
        const content = await getFileContent(token, owner, repoName, filePath, currentBranch);
        viewingFile = { path: filePath, content, sha: btn.dataset.sha };
        contentEl.innerHTML = fileViewerHtml();
        bindFileViewer(container, token, owner, repoName, fullName, onBack);
      } catch (err) {
        showToast(err.message, 'error');
        loadTabData(token, owner, repoName, container, fullName, onBack);
      }
    });
  });

  container.querySelectorAll('[data-checkout-branch]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentBranch = btn.dataset.checkoutBranch;
      currentPath = '';
      viewingFile = null;
      const headerEl = document.getElementById('repoHeader');
      if (headerEl) headerEl.innerHTML = repoHeaderHtml();
      loadTabData(token, owner, repoName, container, fullName, onBack);
    });
  });
}

function bindFileViewer(container, token, owner, repoName, fullName, onBack) {
  document.getElementById('backToDir')?.addEventListener('click', () => {
    viewingFile = null;
    loadTabData(token, owner, repoName, container, fullName, onBack);
  });

  document.getElementById('copyFileContent')?.addEventListener('click', () => {
    if (viewingFile?.content) {
      navigator.clipboard.writeText(viewingFile.content).then(() => showToast('Copied!', 'success'));
    }
  });

  document.getElementById('deleteFileBtn')?.addEventListener('click', async () => {
    if (!confirm(`Delete ${viewingFile.path}?`)) return;
    try {
      await removeFile(token, owner, repoName, viewingFile.path,
        `Delete ${viewingFile.path} via Gold_Crew`, viewingFile.sha, currentBranch);
      showToast(`Deleted ${viewingFile.path}`, 'success');
      viewingFile = null;
      loadTabData(token, owner, repoName, container, fullName, onBack);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// ── Helpers ──

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fmtNum(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n; }
function fmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
function langColor(lang) {
  const c = { JavaScript:'#f1e05a',TypeScript:'#3178c6',Python:'#3572A5',Java:'#b07219','C++':'#f34b7d',Go:'#00ADD8',Rust:'#dea584',Ruby:'#701516',PHP:'#4F5D95',HTML:'#e34c26',CSS:'#563d7c',Shell:'#89e051',Vue:'#41b883',Swift:'#F05138',Kotlin:'#A97BFF',Dart:'#00B4AB' };
  return c[lang] || '#8b949e';
}
function fileIcon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map = { js:'📜',ts:'📘',py:'🐍',rb:'💎',go:'🔵',rs:'🦀',java:'☕','html':'🌐',css:'🎨',json:'📋',md:'📝',yml:'⚙️',yaml:'⚙️',sh:'🖥️',sql:'🗃️',png:'🖼️',jpg:'🖼️',gif:'🖼️',svg:'🖼️',pdf:'📕',zip:'📦',txt:'📄',env:'🔐',gitignore:'🙈',dockerfile:'🐳' };
  return map[ext] || '📄';
}
