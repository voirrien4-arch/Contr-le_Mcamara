import { getState, setState } from '../state.js';
import { saveLogs } from '../storage.js';
import { showToast } from './toast-view.js';

const t = (key) => window.miniappI18n?.t(key) ?? key;
let filter = 'all';

export function renderLogs(container) {
  const { logs } = getState();
  const filtered = filter === 'all' ? logs : logs.filter(l => l.type === filter);

  container.innerHTML = `
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-white" data-i18n="logs.title">${t('logs.title')}</h1>
          <p class="text-slate-400 mt-1" data-i18n="logs.subtitle">${t('logs.subtitle')}</p>
        </div>
        <div class="flex gap-2">
          <button id="exportBtn" class="px-4 py-2 border border-white/10 text-slate-300 hover:bg-white/5 rounded-xl text-sm transition">📥 ${t('logs.export')}</button>
          <button id="clearBtn" class="px-4 py-2 border border-red-500/25 text-red-400 hover:bg-red-500/10 rounded-xl text-sm transition">🗑️ ${t('logs.clear')}</button>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        ${['all', 'success', 'error', 'info'].map(f => `
          <button data-filter="${f}" class="px-4 py-2 rounded-xl text-sm font-medium transition ${filter === f ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-400 hover:text-white border border-white/10'}">
            ${t('logs.filter' + f.charAt(0).toUpperCase() + f.slice(1))}
          </button>
        `).join('')}
      </div>

      <div class="space-y-2">
        ${filtered.length === 0 ? `
          <div class="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
            <p class="text-5xl mb-4">📋</p>
            <p class="text-slate-400" data-i18n="logs.noLogs">${t('logs.noLogs')}</p>
          </div>
        ` : filtered.map(log => `
          <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-3">
            <span class="text-lg shrink-0">${log.type === 'success' ? '✅' : log.type === 'error' ? '❌' : 'ℹ️'}</span>
            <div class="flex-1 min-w-0">
              <p class="text-sm text-white break-words">${log.message}</p>
              <p class="text-xs text-slate-500 mt-1">${new Date(log.timestamp).toLocaleString()}</p>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => { filter = btn.dataset.filter; renderLogs(container); });
  });

  document.getElementById('exportBtn')?.addEventListener('click', () => {
    const text = filtered.map(l => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'gold-crew-logs.txt'; a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('clearBtn')?.addEventListener('click', async () => {
    setState({ logs: [] });
    const { user } = getState();
    await saveLogs(user?.username, []);
    showToast(t('logs.cleared'), 'info');
    renderLogs(container);
  });
}
