// ui/sidebar-view.js — Navigation sidebar with admin-aware links

import { getState, setState } from '../state.js';
import { clearSession } from '../storage.js';

const t = (key) => window.miniappI18n?.t(key) ?? key;

const NAV = [
  { id: 'dashboard', icon: '📊', label: 'nav.dashboard' },
  { id: 'deploy', icon: '🚀', label: 'nav.deploy' },
  { id: 'help', icon: '❓', label: 'nav.help' },
  { id: 'github', icon: '🐙', label: 'nav.github' },
  { id: 'status', icon: '📡', label: 'nav.status' },
  { id: 'settings', icon: '⚙️', label: 'nav.settings' },
  { id: 'logs', icon: '📋', label: 'nav.logs' },
  { id: 'admin', icon: '🛡️', label: 'nav.admin' },
];

export function renderSidebar(container) {
  const { currentView, user, sidebarOpen } = getState();
  const isAdmin = user?.isAdmin;
  // Lock body scroll when sidebar is open on mobile
  document.body.style.overflow = sidebarOpen ? 'hidden' : '';

  container.innerHTML = `
    <div id="sidebarOverlay" class="fixed inset-0 bg-black/50 z-30 md:hidden ${sidebarOpen ? '' : 'hidden'}"></div>
    <aside class="fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 border-r border-white/10 flex flex-col transition-transform duration-300 overflow-y-auto ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0">
      <div class="p-6 border-b border-white/10">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-lg font-bold text-slate-950">G</div>
          <div>
            <h2 class="font-bold text-white text-lg">Gold_Crew</h2>
            <p class="text-xs text-slate-400">${t('app.tagline')}</p>
          </div>
        </div>
      </div>
      <nav class="flex-1 p-4 space-y-1">
        ${NAV.filter(item => {
          // Hide admin for non-admin users
          if (item.id === 'admin' && !isAdmin) return false;
          return true;
        }).map(item => `
          <button data-nav="${item.id}" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${currentView === item.id ? (item.id === 'admin' ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300') : 'text-slate-300 hover:bg-white/5 hover:text-white'}">
            <span class="text-lg">${item.icon}</span>
            <span>${t(item.label)}</span>
          </button>
        `).join('')}
      </nav>
      <div class="p-4 border-t border-white/10 space-y-2">
        <a href="https://whatsapp.com/channel/0029Vb7Bk6jEVccC46JZL92T" target="_blank" rel="noopener" class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-emerald-400 hover:bg-emerald-500/10 transition">
          <span>💬</span><span>${t('nav.whatsapp')}</span>
        </a>
        <a href="https://zip-github-mcamara-v1.onrender.com/" target="_blank" rel="noopener" class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-cyan-400 hover:bg-cyan-500/10 transition">
          <span>🔗</span><span>${t('nav.otherProjects')}</span>
        </a>
        <div class="flex items-center gap-3 px-4 py-2 mt-2">
          <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm ${isAdmin ? 'bg-red-500/20' : 'bg-amber-500/20'}">
            ${isAdmin ? '🛡️' : '👤'}
          </div>
          <div class="min-w-0">
            <span class="text-sm text-slate-300 truncate block">${user?.username || 'User'}</span>
            ${isAdmin ? `<span class="text-[10px] text-red-400 font-medium uppercase">${t('auth.adminBadge')}</span>` : ''}
          </div>
        </div>
        <button id="logoutBtn" class="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition">
          <span>🚪</span><span>${t('nav.logout')}</span>
        </button>
      </div>
    </aside>
    <div class="md:hidden fixed top-4 left-4 z-50">
      <button id="menuToggle" class="w-10 h-10 rounded-xl bg-slate-800 border border-white/10 flex items-center justify-center text-lg hover:bg-slate-700 transition" aria-label="Menu">☰</button>
    </div>
  `;

  container.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => setState({ currentView: btn.dataset.nav, sidebarOpen: false }));
  });
  document.getElementById('menuToggle')?.addEventListener('click', () => setState({ sidebarOpen: !getState().sidebarOpen }));
  document.getElementById('sidebarOverlay')?.addEventListener('click', () => setState({ sidebarOpen: false }));
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await clearSession();
    setState({ currentView: 'auth', user: null, projects: [], settings: { renderApiKey: '', vercelToken: '', githubToken: '' }, logs: [], sidebarOpen: false });
  });
}
