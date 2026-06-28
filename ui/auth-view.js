// ui/auth-view.js — Login/Register with CAPTCHA for users, direct login for admin
// Multi-user: registration adds to users array, admin uses hardcoded credentials

import { setState } from '../state.js';
import { registerUser, authenticateUser, loadSession, saveSession, loadProjects, loadSettings, loadLogs } from '../storage.js';
import { showToast } from './toast-view.js';

const t = (key) => window.miniappI18n?.t(key) ?? key;

let mode = 'login';
let captchaAnswer = null;
let captchaQuestion = null;
let isAdminMode = false;

function generateCaptcha() {
  const ops = ['+', '-', '×'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a, b, answer;
  if (op === '+') {
    a = Math.floor(Math.random() * 50) + 1;
    b = Math.floor(Math.random() * 50) + 1;
    answer = a + b;
  } else if (op === '-') {
    a = Math.floor(Math.random() * 50) + 10;
    b = Math.floor(Math.random() * a) + 1;
    answer = a - b;
  } else {
    a = Math.floor(Math.random() * 12) + 1;
    b = Math.floor(Math.random() * 12) + 1;
    answer = a * b;
  }
  captchaQuestion = `${a} ${op} ${b}`;
  captchaAnswer = answer;
  return { question: captchaQuestion, answer: captchaAnswer };
}

export function renderAuth(container) {
  const needsCaptcha = !isAdminMode && mode === 'register';
  if (needsCaptcha) generateCaptcha();

  container.innerHTML = `
    <div class="min-h-screen flex items-center justify-center px-4 py-8">
      <div class="w-full max-w-md">
        <!-- Logo -->
        <div class="text-center mb-8">
          <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-3xl font-bold text-slate-950 mx-auto mb-4 shadow-lg shadow-amber-500/30">G</div>
          <h1 class="text-3xl font-bold text-white" data-i18n="app.name">Gold_Crew</h1>
          <p class="text-slate-400 mt-1" data-i18n="auth.subtitle">${t('auth.subtitle')}</p>
        </div>

        <!-- Admin/User Toggle -->
        <div class="flex gap-2 mb-4">
          <button id="userModeBtn" class="flex-1 py-2.5 rounded-xl text-sm font-medium transition ${!isAdminMode ? 'bg-amber-500 text-slate-950' : 'bg-white/5 text-slate-400 hover:text-white border border-white/10'}">
            👤 ${t('auth.userMode')}
          </button>
          <button id="adminModeBtn" class="flex-1 py-2.5 rounded-xl text-sm font-medium transition ${isAdminMode ? 'bg-red-500 text-white' : 'bg-white/5 text-slate-400 hover:text-white border border-white/10'}">
            🛡️ ${t('auth.adminMode')}
          </button>
        </div>

        <!-- Auth Card -->
        <div class="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur">

          ${isAdminMode ? `
            <!-- Admin Login (no register, no captcha) -->
            <div class="text-center mb-4">
              <span class="inline-block px-3 py-1 bg-red-500/20 text-red-300 text-xs font-medium rounded-full">🛡️ ${t('auth.adminAuth')}</span>
            </div>
            <form id="authForm" class="space-y-4">
              <div>
                <label for="authUsername" class="block text-sm font-medium text-slate-300 mb-1">${t('auth.adminUsername')}</label>
                <input type="text" id="authUsername" required autocomplete="username"
                  class="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition"
                  placeholder="${t('auth.adminUsernamePlaceholder')}">
              </div>
              <div>
                <label for="authPassword" class="block text-sm font-medium text-slate-300 mb-1">${t('auth.adminPassword')}</label>
                <input type="password" id="authPassword" required autocomplete="current-password"
                  class="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition"
                  placeholder="${t('auth.adminPasswordPlaceholder')}">
              </div>
              <button type="submit" class="w-full py-3 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl transition active:scale-[0.98]">
                🛡️ ${t('auth.adminLoginBtn')}
              </button>
            </form>
          ` : `
            <!-- User Login/Register -->
            <div class="flex gap-2 mb-6 bg-slate-800/50 rounded-xl p-1" role="tablist">
              <button id="loginTab" role="tab" class="flex-1 py-2.5 rounded-lg text-sm font-medium transition ${mode === 'login' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'}" data-i18n="auth.login">${t('auth.login')}</button>
              <button id="registerTab" role="tab" class="flex-1 py-2.5 rounded-lg text-sm font-medium transition ${mode === 'register' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'}" data-i18n="auth.register">${t('auth.register')}</button>
            </div>
            <form id="authForm" class="space-y-4">
              <div>
                <label for="authUsername" class="block text-sm font-medium text-slate-300 mb-1" data-i18n="auth.username">${t('auth.username')}</label>
                <input type="text" id="authUsername" required autocomplete="username"
                  class="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition"
                  placeholder="${t('auth.usernamePlaceholder')}">
              </div>
              <div>
                <label for="authPassword" class="block text-sm font-medium text-slate-300 mb-1" data-i18n="auth.password">${t('auth.password')}</label>
                <input type="password" id="authPassword" required autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}"
                  class="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition"
                  placeholder="${t('auth.passwordPlaceholder')}">
              </div>
              ${mode === 'register' ? `
                <!-- CAPTCHA -->
                <div>
                  <label for="authCaptcha" class="block text-sm font-medium text-slate-300 mb-1">🔐 ${t('auth.captchaLabel')}</label>
                  <div class="flex gap-3 items-center">
                    <div class="flex-1 bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-center">
                      <span class="text-lg font-mono font-bold text-amber-300 select-none tracking-wider">${captchaQuestion} = ?</span>
                    </div>
                    <button type="button" id="refreshCaptcha" class="w-10 h-10 rounded-xl bg-slate-800 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:border-amber-500/50 transition" aria-label="New captcha">🔄</button>
                  </div>
                  <input type="number" id="authCaptcha" required
                    class="mt-2 w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition"
                    placeholder="${t('auth.captchaPlaceholder')}">
                </div>
              ` : ''}
              <button type="submit" class="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition active:scale-[0.98]">
                ${mode === 'login' ? t('auth.loginBtn') : t('auth.registerBtn')}
              </button>
            </form>
          `}
        </div>

        <p class="text-center text-xs text-slate-500 mt-6">Créateur Mcamara</p>
      </div>
    </div>
  `;

  // Wire events
  document.getElementById('userModeBtn')?.addEventListener('click', () => { isAdminMode = false; renderAuth(container); });
  document.getElementById('adminModeBtn')?.addEventListener('click', () => { isAdminMode = true; renderAuth(container); });
  document.getElementById('loginTab')?.addEventListener('click', () => { mode = 'login'; renderAuth(container); });
  document.getElementById('registerTab')?.addEventListener('click', () => { mode = 'register'; renderAuth(container); });
  document.getElementById('refreshCaptcha')?.addEventListener('click', () => { generateCaptcha(); renderAuth(container); });
  document.getElementById('authForm')?.addEventListener('submit', (e) => handleSubmit(e, container));
}

async function handleSubmit(e, container) {
  e.preventDefault();
  const username = document.getElementById('authUsername').value.trim();
  const password = document.getElementById('authPassword').value;
  if (!username || !password) return;

  const btn = container.querySelector('button[type="submit"]');
  const origText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="inline-block animate-spin mr-2">⏳</span> ' + t('auth.pleaseWait');

  try {
    if (isAdminMode) {
      // Admin login — no register, no captcha
      const result = await authenticateUser(username, password);
      if (!result.ok || !result.isAdmin) {
        showToast(t('auth.adminInvalid'), 'error');
        btn.disabled = false;
        btn.innerHTML = origText;
        return;
      }
      await saveSession({ username, isAdmin: true });
      const [projects, settings, logs] = await Promise.all([
        loadProjects(username), loadSettings(username), loadLogs(username)
      ]);
      setState({ user: { username, isAdmin: true }, projects, settings, logs, currentView: 'admin' });
      showToast(t('auth.adminWelcome'), 'success');
    } else if (mode === 'register') {
      // Registration — verify CAPTCHA
      const captchaInput = document.getElementById('authCaptcha');
      if (captchaInput && parseInt(captchaInput.value, 10) !== captchaAnswer) {
        showToast(t('auth.captchaWrong'), 'error');
        generateCaptcha();
        renderAuth(container);
        btn.disabled = false;
        btn.innerHTML = origText;
        return;
      }

      const reg = await registerUser(username, password);
      if (!reg.ok) {
        if (reg.reason === 'exists') {
          showToast(t('auth.userExists'), 'error');
        } else {
          showToast(t('auth.error'), 'error');
        }
        btn.disabled = false;
        btn.innerHTML = origText;
        return;
      }

      await saveSession({ username, isAdmin: false });
      setState({ user: { username, isAdmin: false }, projects: [], settings: { renderApiKey: '', vercelToken: '', githubToken: '' }, logs: [], currentView: 'dashboard' });
      showToast(t('auth.registerSuccess'), 'success');
    } else {
      // User login
      const result = await authenticateUser(username, password);
      if (!result.ok) {
        showToast(result.reason === 'not_found' ? t('auth.userNotFound') : t('auth.loginError'), 'error');
        btn.disabled = false;
        btn.innerHTML = origText;
        return;
      }
      await saveSession({ username: result.user.username, isAdmin: false });
      const [projects, settings, logs] = await Promise.all([
        loadProjects(result.user.username), loadSettings(result.user.username), loadLogs(result.user.username)
      ]);
      setState({ user: result.user, projects, settings, logs, currentView: 'dashboard' });
      showToast(t('auth.loginSuccess'), 'success');
    }
  } catch {
    showToast(t('auth.error'), 'error');
    btn.disabled = false;
    btn.innerHTML = origText;
  }
}
