// ui/settings-view.js — API token management with validation

import { getState, setState } from '../state.js';
import { saveSettings, deleteUser, clearSession } from '../storage.js';
import { showToast } from './toast-view.js';
import { validateGithubToken } from '../services/github-service.js';
import { validateVercelToken } from '../services/vercel-service.js';
import { validateRenderKey } from '../services/render-service.js';

const t = (key) => window.miniappI18n?.t(key) ?? key;
let validating = {};

export function renderSettings(container) {
  const { settings, user } = getState();

  container.innerHTML = `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-white">${t('settings.title')}</h1>
        <p class="text-slate-400 mt-1">${t('settings.subtitle')}</p>
      </div>

      <div class="bg-white/5 border border-white/10 rounded-2xl p-6">
        <h2 class="text-lg font-bold text-white mb-1">🔑 ${t('settings.apiKeys')}</h2>
        <p class="text-xs text-slate-500 mb-5">${t('settings.keysSecure')}</p>
        <div class="space-y-5 max-w-lg">
          <div>
            <label for="renderKey" class="flex items-center gap-2 text-sm font-medium text-slate-300 mb-1">
              ${t('settings.renderKey')}
              <span id="renderKeyStatus" class="text-xs">${keyStatus('renderApiKey', settings)}</span>
            </label>
            <input type="password" id="renderKey" value="${settings.renderApiKey || ''}" placeholder="${t('settings.renderKeyPlaceholder')}" class="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition">
            <button data-validate="renderKey" class="mt-2 text-xs text-amber-400 hover:text-amber-300 transition hidden">🔍 Validate key</button>
          </div>
          <div>
            <label for="vercelToken" class="flex items-center gap-2 text-sm font-medium text-slate-300 mb-1">
              ${t('settings.vercelToken')}
              <span id="vercelTokenStatus" class="text-xs">${keyStatus('vercelToken', settings)}</span>
            </label>
            <input type="password" id="vercelToken" value="${settings.vercelToken || ''}" placeholder="${t('settings.vercelTokenPlaceholder')}" class="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition">
            <button data-validate="vercelToken" class="mt-2 text-xs text-amber-400 hover:text-amber-300 transition hidden">🔍 Validate key</button>
          </div>
          <div>
            <label for="githubToken" class="flex items-center gap-2 text-sm font-medium text-slate-300 mb-1">
              ${t('settings.githubToken')}
              <span id="githubTokenStatus" class="text-xs">${keyStatus('githubToken', settings)}</span>
            </label>
            <input type="password" id="githubToken" value="${settings.githubToken || ''}" placeholder="${t('settings.githubTokenPlaceholder')}" class="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition">
            <button data-validate="githubToken" class="mt-2 text-xs text-amber-400 hover:text-amber-300 transition hidden">🔍 Validate key</button>
          </div>
        </div>
        <div class="mt-5 flex gap-3">
          <button id="saveBtn" class="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition active:scale-[0.98]">
            💾 ${t('settings.save')}
          </button>
          <button id="testAllBtn" class="px-6 py-3 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10 rounded-xl transition">
            🧪 Test All Keys
          </button>
        </div>
      </div>

      <div class="bg-white/5 border border-white/10 rounded-2xl p-6">
        <h2 class="text-lg font-bold text-white mb-3">👤 ${t('settings.account')}</h2>
        <p class="text-slate-400">${t('settings.username')}: <span class="text-white font-medium">${user?.username || '-'}</span></p>
      </div>

      <div class="bg-red-500/5 border border-red-500/20 rounded-2xl p-6">
        <h2 class="text-lg font-bold text-red-400 mb-3">⚠️ ${t('settings.dangerZone')}</h2>
        <button id="deleteBtn" class="px-6 py-3 bg-red-500/15 border border-red-500/25 text-red-300 font-medium rounded-xl hover:bg-red-500/25 transition">
          ${t('settings.deleteAccount')}
        </button>
      </div>
    </div>
  `;

  // Show/hide validate buttons on input change
  ['renderKey', 'vercelToken', 'githubToken'].forEach(id => {
    const input = document.getElementById(id);
    const btn = container.querySelector(`[data-validate="${id}"]`);
    if (input && btn) {
      if (input.value.trim()) btn.classList.remove('hidden');
      input.addEventListener('input', () => {
        btn.classList.toggle('hidden', !input.value.trim());
      });
    }
  });

  // Individual key validation
  container.querySelectorAll('[data-validate]').forEach(btn => {
    btn.addEventListener('click', () => validateKey(btn.dataset.validate));
  });

  document.getElementById('saveBtn')?.addEventListener('click', async () => {
    const s = {
      renderApiKey: document.getElementById('renderKey')?.value?.trim() || '',
      vercelToken: document.getElementById('vercelToken')?.value?.trim() || '',
      githubToken: document.getElementById('githubToken')?.value?.trim() || '',
    };
    setState({ settings: s });
    const { user } = getState();
    await saveSettings(user?.username, s);
    showToast(t('settings.saved'), 'success');
    renderSettings(container);
  });

  document.getElementById('testAllBtn')?.addEventListener('click', testAllKeys);

  document.getElementById('deleteBtn')?.addEventListener('click', async () => {
    if (confirm(t('settings.deleteConfirm'))) {
      const { user } = getState();
      if (user?.username) await deleteUser(user.username);
      await clearSession();
      setState({ user: null, currentView: 'auth', projects: [], settings: { renderApiKey: '', vercelToken: '', githubToken: '' }, logs: [] });
    }
  });
}

function keyStatus(key, settings) {
  if (settings[key]) return '<span class="text-emerald-400">● Saved</span>';
  return '<span class="text-slate-600">○ Not set</span>';
}

async function validateKey(id) {
  const input = document.getElementById(id);
  const statusEl = document.getElementById(id + 'Status');
  if (!input) return;
  const value = input.value.trim();
  if (!value) return;

  if (validating[id]) return;
  validating[id] = true;
  statusEl.innerHTML = '<span class="text-amber-400">⏳ Validating...</span>';

  try {
    let result;
    if (id === 'githubToken') result = await validateGithubToken(value);
    else if (id === 'vercelToken') result = await validateVercelToken(value);
    else if (id === 'renderKey') result = await validateRenderKey(value);

    const name = result.username || result.email || result.ownerId || 'OK';
    statusEl.innerHTML = `<span class="text-emerald-400">✓ ${name}</span>`;
    showToast(`✓ ${id} validated`, 'success');
  } catch (err) {
    statusEl.innerHTML = `<span class="text-red-400">✕ ${err.message}</span>`;
    showToast(`✕ ${id}: ${err.message}`, 'error');
  } finally {
    validating[id] = false;
  }
}

async function testAllKeys() {
  const ids = ['githubToken', 'vercelToken', 'renderKey'];
  let ok = 0;
  for (const id of ids) {
    const input = document.getElementById(id);
    if (input?.value?.trim()) {
      await validateKey(id);
      ok++;
    }
  }
  if (ok === 0) showToast('No keys to test', 'warning');
}
