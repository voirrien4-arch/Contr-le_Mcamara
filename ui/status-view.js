// ui/status-view.js — Real-time deployment status checking

import { getState, setState } from '../state.js';

const t = (key) => window.miniappI18n?.t(key) ?? key;
let checkResults = {};

export function renderStatus(container) {
  const { projects } = getState();

  container.innerHTML = `
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-white">${t('status.title')}</h1>
          <p class="text-slate-400 mt-1">${t('status.subtitle')}</p>
        </div>
        ${projects.length > 0 ? `
          <button id="refreshAllBtn" class="px-4 py-2 border border-white/10 text-slate-300 hover:bg-white/5 rounded-xl text-sm transition">
            🔄 ${t('status.refreshAll')}
          </button>
        ` : ''}
      </div>

      <div class="bg-white/5 border border-white/10 rounded-2xl p-5">
        <label for="statusUrl" class="block text-sm font-medium text-slate-300 mb-2">${t('status.checkUrl')}</label>
        <div class="flex gap-2">
          <input type="url" id="statusUrl" placeholder="${t('status.checkPlaceholder')}" class="flex-1 px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition">
          <button id="checkUrlBtn" class="px-5 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition shrink-0">
            ${t('status.checkBtn')}
          </button>
        </div>
      </div>

      ${projects.length === 0 ? `
        <div class="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
          <p class="text-5xl mb-4">📡</p>
          <p class="text-slate-400">${t('status.noProjects')}</p>
        </div>
      ` : `
        <div class="space-y-3" id="projectStatusList">
          ${projects.map(p => renderProjectStatus(p)).join('')}
        </div>
      `}
    </div>
  `;

  document.getElementById('checkUrlBtn')?.addEventListener('click', () => checkSingleUrl());
  document.getElementById('statusUrl')?.addEventListener('keydown', e => { if (e.key === 'Enter') checkSingleUrl(); });
  document.getElementById('refreshAllBtn')?.addEventListener('click', () => checkAllProjects());

  // Bind individual check buttons
  container.querySelectorAll('[data-check-id]').forEach(btn => {
    btn.addEventListener('click', () => checkProject(btn.dataset.checkId));
  });
}

function renderProjectStatus(project) {
  const result = checkResults[project.id];
  const statusColor = result?.online ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : result?.checked ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-slate-700/50 text-slate-400 border-slate-600';
  const statusDot = result?.online ? '●' : result?.checked ? '✕' : '○';
  const statusText = result?.checking ? '...' : result?.online ? t('status.online') : result?.checked ? t('status.offline') : '—';
  const platIcon = project.platform === 'render' ? '🟣' : '⬛';

  return `
    <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between gap-3">
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${project.platform === 'render' ? 'bg-purple-500/20' : 'bg-white/10'}">
          ${platIcon}
        </div>
        <div class="min-w-0">
          <p class="font-medium text-white truncate">${project.name}</p>
          <p class="text-xs text-slate-400">${project.type} • ${project.platform}</p>
        </div>
      </div>
      <div class="flex items-center gap-3 shrink-0">
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${statusColor}">
          <span class="text-[10px]">${statusDot}</span> ${statusText}
          ${result?.timeMs ? ` <span class="text-[10px] opacity-60">${result.timeMs}ms</span>` : ''}
        </span>
        <button data-check-id="${project.id}" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-sm transition" aria-label="Check status" title="Check status">
          ${result?.checking ? '⏳' : '🔄'}
        </button>
        ${project.url ? `<a href="${project.url}" target="_blank" rel="noopener" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-cyan-400 text-sm transition" aria-label="Open site">↗</a>` : ''}
      </div>
    </div>
  `;
}

async function checkProject(id) {
  const { projects } = getState();
  const project = projects.find(p => p.id === +id);
  if (!project?.url) return;

  checkResults[id] = { checking: true, ...checkResults[id] };
  refreshList();

  try {
    const start = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(project.url, { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
    clearTimeout(timeout);
    const timeMs = Math.round(performance.now() - start);
    // no-cors always returns opaque response, so status 0 means it connected
    checkResults[id] = { online: true, checked: true, checking: false, timeMs, lastCheck: new Date().toISOString() };
  } catch {
    checkResults[id] = { online: false, checked: true, checking: false, timeMs: null, lastCheck: new Date().toISOString() };
  }
  refreshList();
}

async function checkSingleUrl() {
  const input = document.getElementById('statusUrl');
  const url = input?.value?.trim();
  if (!url) return;
  const btn = document.getElementById('checkUrlBtn');
  if (btn) { btn.disabled = true; btn.textContent = t('status.checking'); }

  try {
    const start = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    await fetch(url, { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
    clearTimeout(timeout);
    const timeMs = Math.round(performance.now() - start);
    if (btn) btn.textContent = `✓ ${t('status.online')} (${timeMs}ms)`;
    setTimeout(() => { if (btn) { btn.textContent = t('status.checkBtn'); btn.disabled = false; } }, 3000);
  } catch {
    if (btn) btn.textContent = `✕ ${t('status.offline')}`;
    setTimeout(() => { if (btn) { btn.textContent = t('status.checkBtn'); btn.disabled = false; } }, 3000);
  }
}

async function checkAllProjects() {
  const { projects } = getState();
  for (const p of projects) {
    await checkProject(p.id);
  }
}

function refreshList() {
  const { projects } = getState();
  const list = document.getElementById('projectStatusList');
  if (list) {
    list.innerHTML = projects.map(p => renderProjectStatus(p)).join('');
    list.querySelectorAll('[data-check-id]').forEach(btn => {
      btn.addEventListener('click', () => checkProject(btn.dataset.checkId));
    });
  }
}
