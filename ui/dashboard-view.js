import { getState, setState } from '../state.js';
import { saveProjects, MAX_PROJECTS } from '../storage.js';
const t = (key) => window.miniappI18n?.t(key) ?? key;

export function renderDashboard(container) {
  const { projects, logs, user } = getState();
  const activeProjects = projects.filter(p => p.status === 'live').length;
  const recent = projects.slice(0, 5);

  container.innerHTML = `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-white">${t('dashboard.welcome')}, ${user?.username} 👋</h1>
        <p class="text-slate-400 mt-1" data-i18n="dashboard.subtitle">${t('dashboard.subtitle')}</p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="bg-white/5 border border-white/10 rounded-2xl p-5">
          <p class="text-sm text-slate-400" data-i18n="dashboard.totalProjects">${t('dashboard.totalProjects')}</p>
          <p class="text-3xl font-bold text-white mt-1">${projects.length}<span class="text-lg text-slate-500 font-normal">/${MAX_PROJECTS}</span></p>
          <div class="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all ${projects.length >= MAX_PROJECTS ? 'bg-red-500' : projects.length >= 15 ? 'bg-amber-500' : 'bg-emerald-500'}" style="width:${Math.min(100, (projects.length / MAX_PROJECTS) * 100)}%"></div>
          </div>
        </div>
        <div class="bg-white/5 border border-white/10 rounded-2xl p-5">
          <p class="text-sm text-slate-400" data-i18n="dashboard.activeDeploys">${t('dashboard.activeDeploys')}</p>
          <p class="text-3xl font-bold text-emerald-400 mt-1">${activeProjects}</p>
        </div>
        <div class="bg-white/5 border border-white/10 rounded-2xl p-5">
          <p class="text-sm text-slate-400" data-i18n="dashboard.recentLogs">${t('dashboard.recentLogs')}</p>
          <p class="text-3xl font-bold text-cyan-400 mt-1">${logs.length}</p>
        </div>
      </div>

      <div class="flex flex-wrap gap-3">
        <button id="quickDeploy" class="flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition active:scale-[0.98]">
          <span>🚀</span> <span data-i18n="dashboard.quickDeploy">${t('dashboard.quickDeploy')}</span>
        </button>
        <a href="https://whatsapp.com/channel/0029Vb7Bk6jEVccC46JZL92T" target="_blank" rel="noopener" class="flex items-center gap-2 px-6 py-3 bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 font-medium rounded-xl hover:bg-emerald-500/25 transition">
          <span>💬</span> <span data-i18n="dashboard.whatsapp">${t('dashboard.whatsapp')}</span>
        </a>
        <a href="https://zip-github-mcamara-v1.onrender.com/" target="_blank" rel="noopener" class="flex items-center gap-2 px-6 py-3 bg-cyan-500/15 border border-cyan-500/25 text-cyan-300 font-medium rounded-xl hover:bg-cyan-500/25 transition">
          <span>🔗</span> <span data-i18n="dashboard.otherProjects">${t('dashboard.otherProjects')}</span>
        </a>
      </div>

      <div>
        <h2 class="text-lg font-bold text-white mb-4" data-i18n="dashboard.recentProjects">${t('dashboard.recentProjects')}</h2>
        ${recent.length === 0 ? `
          <div class="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
            <p class="text-5xl mb-4">📦</p>
            <p class="text-slate-400" data-i18n="dashboard.noProjects">${t('dashboard.noProjects')}</p>
          </div>
        ` : `
          <div class="space-y-3">
            ${recent.map(p => `
              <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between gap-3">
                <div class="flex items-center gap-3 min-w-0">
                  <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${p.platform === 'render' ? 'bg-purple-500/20' : 'bg-white/10'}">
                    ${p.platform === 'render' ? '🟣' : '⬛'}
                  </div>
                  <div class="min-w-0">
                    <p class="font-medium text-white truncate">${p.name}</p>
                    <p class="text-xs text-slate-400">${p.type} • ${p.platform} • ${new Date(p.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                <div class="flex items-center gap-3 shrink-0">
                  <span class="px-2.5 py-1 rounded-lg text-xs font-medium ${p.status === 'live' ? 'bg-emerald-500/20 text-emerald-300' : p.status === 'deploying' ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'}">${p.status}</span>
                  ${p.url ? `<a href="${p.url}" target="_blank" rel="noopener" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-cyan-400 transition" aria-label="Open site">↗</a>` : ''}
                  <button data-delete-project="${p.id}" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-red-500/20 flex items-center justify-center text-red-400 transition" aria-label="Delete project">🗑</button>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    </div>
  `;

  document.getElementById('quickDeploy')?.addEventListener('click', () => setState({ currentView: 'deploy' }));

  container.querySelectorAll('[data-delete-project]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const projectId = +btn.dataset.deleteProject;
      if (!confirm('Delete this project from your dashboard?')) return;
      const updated = projects.filter(p => p.id !== projectId);
      setState({ projects: updated });
      const { user } = getState();
      await saveProjects(user?.username, updated);
      renderDashboard(container);
    });
  });
}
