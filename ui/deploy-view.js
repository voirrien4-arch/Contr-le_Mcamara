// ui/deploy-view.js — Real deployment wizard + ZIP-to-Repo transform

import { getState, setState, addLog } from '../state.js';
import { saveProjects, MAX_PROJECTS } from '../storage.js';
import { showToast } from './toast-view.js';
import { deploy } from '../services/deploy-engine.js';
import { parseZip } from '../services/zip-parser.js';
import { validateGithubToken, getOrCreateRepo, uploadFiles } from '../services/github-service.js';

const t = (key) => window.miniappI18n?.t(key) ?? key;

let step = 1;
let deploying = false;
let deployError = '';
let liveUrl = '';
let deployResult = null;
let data = fresh();

// Transform state
let transformMode = false;
let transformLoading = false;
let transformResult = null;
let transformError = '';

function fresh() {
  return { file: null, fileName: '', fileSize: 0, projectName: '', projectType: 'bot', description: '', envVars: [{ key: 'TOKEN', value: '' }], platform: 'render' };
}

export function resetDeploy() {
  step = 1; deploying = false; deployError = ''; liveUrl = ''; deployResult = null; data = fresh();
  transformMode = false; transformLoading = false; transformResult = null; transformError = '';
}

export function renderDeploy(container) {
  const STEPS = [
    { n: 1, label: t('deploy.step1'), icon: '📁' },
    { n: 2, label: t('deploy.step2'), icon: '⚙️' },
    { n: 3, label: t('deploy.step3'), icon: '🔑' },
    { n: 4, label: t('deploy.step4'), icon: '☁️' },
    { n: 5, label: t('deploy.step5'), icon: '🚀' },
  ];

  container.innerHTML = `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-white">${transformMode ? 'Transform ZIP → Repo' : t('deploy.title')}</h1>
        <p class="text-slate-400 mt-1">${transformMode ? 'Extract your ZIP and push files to a new GitHub repository' : t('deploy.subtitle')}</p>
      </div>
      ${step <= 5 && !transformMode ? `<div class="flex items-center justify-between gap-1">${STEPS.map((s, i) => `
        <div class="flex items-center ${i < STEPS.length - 1 ? 'flex-1' : ''}">
          <div class="flex flex-col items-center">
            <div class="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 transition ${step > s.n ? 'bg-emerald-500 border-emerald-500 text-white' : step === s.n ? 'bg-amber-500 border-amber-500 text-slate-950' : 'bg-slate-800 border-slate-600 text-slate-400'}">${step > s.n ? '✓' : s.icon}</div>
            <span class="text-[10px] mt-1 whitespace-nowrap ${step === s.n ? 'text-amber-400 font-medium' : 'text-slate-500'}">${s.label}</span>
          </div>
          ${i < STEPS.length - 1 ? `<div class="flex-1 h-0.5 mx-1 mt-[-14px] ${step > s.n ? 'bg-emerald-500' : 'bg-slate-700'}"></div>` : ''}
        </div>`).join('')}</div>` : ''}
      <div class="bg-white/5 border border-white/10 rounded-2xl p-6">${content()}</div>
    </div>`;
  bind();
}

function content() {
  if (transformMode) return transformView();
  if (step === 6) return deployError ? errorView() : success();
  if (step === 5 && deploying) return deployingHtml();
  if (step === 5) return review();
  if (step === 4) return platform();
  if (step === 3) return envVars();
  if (step === 2) return configure();
  return upload();
}

// ── Upload Step (with Transform button) ──

function upload() {
  const { projects } = getState();
  const nearLimit = projects.length >= 15;
  const atLimit = projects.length >= MAX_PROJECTS;
  return `<div class="text-center py-6">
    ${nearLimit ? `<div class="mb-5 p-3 rounded-xl text-sm ${atLimit ? 'bg-red-500/10 border border-red-500/20 text-red-300' : 'bg-amber-500/10 border border-amber-500/20 text-amber-300'}">⚠️ ${projects.length}/${MAX_PROJECTS} projects used.${atLimit ? ' Delete projects on the Dashboard before deploying.' : ' Approaching the limit.'}</div>` : ''}
    <div id="dropZone" class="drop-zone border-2 border-dashed border-slate-600 rounded-2xl p-10 transition cursor-pointer hover:border-amber-500/50">
      <p class="text-4xl mb-3">📦</p>
      <p class="text-lg font-medium text-white">${t('deploy.dragDrop')}</p>
      <p class="text-slate-400 mt-1">${t('deploy.or')}</p>
      <label class="inline-block mt-4 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl cursor-pointer transition">${t('deploy.browse')}
        <input type="file" id="fileInput" accept=".zip" class="hidden">
      </label>
    </div>
    <div id="fileInfo" class="mt-4 ${data.fileName ? '' : 'hidden'}">
      <p class="text-emerald-400 text-sm">✓ ${t('deploy.selected')}: <strong class="text-white">${data.fileName}</strong> (${fmt(data.fileSize)})</p>
    </div>
    <div class="mt-6 flex flex-col sm:flex-row justify-between items-center gap-3">
      <button id="transformRepoBtn" class="px-6 py-3 bg-cyan-500/15 border border-cyan-500/30 hover:bg-cyan-500/25 text-cyan-300 font-medium rounded-xl transition flex items-center gap-2 ${data.fileName ? '' : 'opacity-40 pointer-events-none'}">
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
        📦→📂 Transform to Repo
      </button>
      <button id="nextBtn" class="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition ${data.fileName ? '' : 'opacity-40 pointer-events-none'}">${t('deploy.next')} →</button>
    </div>
  </div>`;
}

// ── Transform to Repo views ──

function transformView() {
  if (transformResult) return transformSuccess();
  if (transformError) return transformErrorView();
  if (transformLoading) return transformLoadingView();

  const { settings } = getState();
  const hasGithub = !!settings.githubToken;
  const repoName = (data.projectName || data.fileName.replace(/\.zip$/i, '')).replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '') || 'my-project';

  return `<div class="max-w-lg mx-auto space-y-5">
    <div class="bg-slate-800/50 border border-white/10 rounded-xl p-5 space-y-4">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-xl bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center text-xl">📦</div>
        <div class="min-w-0 flex-1">
          <p class="text-white font-medium truncate">${esc(data.fileName)}</p>
          <p class="text-xs text-slate-400">${fmt(data.fileSize)} • ZIP archive</p>
        </div>
      </div>

      <div>
        <label for="transformRepoName" class="block text-sm font-medium text-slate-300 mb-1">Repository name</label>
        <input type="text" id="transformRepoName" value="${esc(repoName)}" placeholder="my-project" class="w-full px-4 py-3 bg-slate-900 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition text-sm">
      </div>

      <div>
        <label for="transformRepoDesc" class="block text-sm font-medium text-slate-300 mb-1">Description (optional)</label>
        <input type="text" id="transformRepoDesc" placeholder="What is this project?" class="w-full px-4 py-3 bg-slate-900 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition text-sm">
      </div>

      <label class="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
        <input type="checkbox" id="transformPrivate" class="accent-cyan-500 w-4 h-4">
        Private repository
      </label>
    </div>

    ${!hasGithub ? `<div class="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm flex items-start gap-2">
      <span class="text-lg">⚠️</span>
      <div>
        <p class="font-medium">GitHub token is required</p>
        <p class="text-xs text-red-400 mt-1">Add your token in <button data-goto-settings class="underline hover:text-red-200 font-medium">Settings → GitHub Token</button></p>
      </div>
    </div>` : ''}

    <div class="flex justify-between">
      <button id="transformCancel" class="px-6 py-3 border border-white/10 text-slate-300 hover:bg-white/5 rounded-xl transition">← Cancel</button>
      <button id="transformGo" class="px-8 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl transition flex items-center gap-2 ${!hasGithub ? 'opacity-50 pointer-events-none' : ''}">
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
        Create Repo & Upload
      </button>
    </div>
  </div>`;
}

function transformLoadingView() {
  return `<div class="text-center py-8">
    <div class="w-16 h-16 rounded-full bg-cyan-500/20 flex items-center justify-center text-2xl mx-auto mb-5 animate-pulse">📦→📂</div>
    <h3 class="text-xl font-bold text-white mb-2">Creating Repository...</h3>
    <p class="text-slate-400 text-sm">Extracting ZIP and uploading files to GitHub</p>
    <div class="mt-6 max-w-sm mx-auto space-y-3">
      <div id="transformSteps" class="text-left text-sm space-y-2"></div>
    </div>
  </div>`;
}

function transformSuccess() {
  return `<div class="text-center py-6">
    <div class="text-6xl mb-4">🎉</div>
    <h3 class="text-2xl font-bold text-white mb-2">Repository Created!</h3>
    <p class="text-slate-400">Your ZIP has been extracted and uploaded to GitHub</p>
    <div class="mt-5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 max-w-md mx-auto space-y-2">
      <div>
        <p class="text-xs text-emerald-400 mb-1">Repository</p>
        <a href="${transformResult.htmlUrl}" target="_blank" rel="noopener" class="text-white font-mono hover:text-emerald-300 break-all text-sm">${transformResult.fullName}</a>
      </div>
      <p class="text-xs text-slate-500">${transformResult.fileCount} files uploaded • ${transformResult.visibility}</p>
    </div>
    <div class="mt-6 flex flex-wrap justify-center gap-3">
      <a href="${transformResult.htmlUrl}" target="_blank" rel="noopener" class="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl transition">↗ Open on GitHub</a>
      <button id="transformAnother" class="px-6 py-3 border border-white/10 text-slate-300 hover:bg-white/5 rounded-xl transition">Transform Another</button>
    </div>
  </div>`;
}

function transformErrorView() {
  const isToken = transformError.includes('token') || transformError.includes('Token') || transformError.includes('auth') || transformError.includes('401') || transformError.includes('403');
  return `<div class="text-center py-6">
    <div class="text-6xl mb-4">❌</div>
    <h3 class="text-2xl font-bold text-white mb-2">Transform Failed</h3>
    <div class="mt-4 bg-red-500/10 border border-red-500/20 rounded-xl p-5 max-w-md mx-auto text-left space-y-3">
      <p class="text-red-300 text-sm break-words">${esc(transformError)}</p>
      ${isToken ? `<div class="pt-2 border-t border-red-500/20"><p class="text-xs text-slate-400 mb-2">Fix: Check your GitHub token in Settings</p><button data-goto-settings class="px-4 py-2 bg-amber-500/20 text-amber-300 rounded-lg text-xs hover:bg-amber-500/30 transition">Open Settings →</button></div>` : ''}
    </div>
    <div class="mt-6 flex flex-wrap justify-center gap-3">
      <button id="transformRetry" class="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl transition">🔄 Retry</button>
      <button id="transformCancel" class="px-6 py-3 border border-white/10 text-slate-300 hover:bg-white/5 rounded-xl transition">← Cancel</button>
    </div>
  </div>`;
}

// ── Deploy wizard steps ──

function configure() {
  return `<div class="space-y-4 max-w-lg mx-auto">
    <div><label for="projectName" class="block text-sm font-medium text-slate-300 mb-1">${t('deploy.projectName')}</label>
    <input type="text" id="projectName" value="${esc(data.projectName)}" placeholder="${t('deploy.projectNamePlaceholder')}" class="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"></div>
    <div><label class="block text-sm font-medium text-slate-300 mb-2">${t('deploy.projectType')}</label>
    <div class="grid grid-cols-3 gap-3">${['bot','site','api'].map(ty => `<button type="button" data-type="${ty}" class="py-3 rounded-xl border-2 font-medium transition ${data.projectType === ty ? 'border-amber-500 bg-amber-500/10 text-amber-300' : 'border-white/10 text-slate-400 hover:border-white/20'}">${ty==='bot'?'🤖':ty==='site'?'🌐':'⚡'} ${t('deploy.'+ty)}</button>`).join('')}</div></div>
    <div><label for="description" class="block text-sm font-medium text-slate-300 mb-1">${t('deploy.description')}</label>
    <textarea id="description" rows="3" placeholder="${t('deploy.descPlaceholder')}" class="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition resize-none">${esc(data.description)}</textarea></div>
    <div class="flex justify-between pt-2"><button id="backBtn" class="px-6 py-3 border border-white/10 text-slate-300 hover:bg-white/5 rounded-xl transition">${t('deploy.back')}</button>
    <button id="nextBtn" class="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition">${t('deploy.next')} →</button></div>
  </div>`;
}

function envVars() {
  return `<div class="max-w-lg mx-auto">
    <h3 class="text-lg font-bold text-white mb-1">${t('deploy.envTitle')}</h3>
    <p class="text-sm text-slate-400 mb-4">${t('deploy.envSubtitle')}</p>
    <div id="envList" class="space-y-3">${data.envVars.map((v, i) => `
      <div class="flex gap-2">
        <input type="text" data-ek="${i}" value="${esc(v.key)}" placeholder="${t('deploy.key')}" class="flex-1 px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition">
        <input type="text" data-ev="${i}" value="${esc(v.value)}" placeholder="${t('deploy.value')}" class="flex-1 px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition">
        <button data-re="${i}" class="px-3 text-red-400 hover:bg-red-500/10 rounded-xl transition" aria-label="${t('deploy.remove')}">✕</button>
      </div>`).join('')}</div>
    <button id="addEnv" class="mt-3 w-full py-3 border border-dashed border-white/20 text-slate-400 hover:border-amber-500 hover:text-amber-400 rounded-xl transition">+ ${t('deploy.addVar')}</button>
    <div class="flex justify-between pt-6"><button id="backBtn" class="px-6 py-3 border border-white/10 text-slate-300 hover:bg-white/5 rounded-xl transition">${t('deploy.back')}</button>
    <button id="nextBtn" class="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition">${t('deploy.next')} →</button></div>
  </div>`;
}

function platform() {
  const { settings } = getState();
  const hasRender = !!settings.renderApiKey;
  const hasVercel = !!settings.vercelToken;
  const hasGithub = !!settings.githubToken;
  return `<div class="max-w-lg mx-auto">
    <h3 class="text-lg font-bold text-white mb-4">${t('deploy.platformTitle')}</h3>
    <div class="mb-5 p-4 bg-slate-800/50 border border-white/10 rounded-xl text-sm space-y-2">
      <p class="text-slate-300 font-medium">🔑 Required tokens for real deployment:</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <div class="flex items-start gap-2"><span>🟣</span><span class="text-slate-400">Render → <strong class="text-white">Render API Key</strong> + <strong class="text-white">GitHub Token</strong></span></div>
        <div class="flex items-start gap-2"><span>⬛</span><span class="text-slate-400">Vercel → <strong class="text-white">Vercel Token</strong> + <strong class="text-white">GitHub Token</strong></span></div>
      </div>
      ${!hasGithub ? `<p class="text-amber-400 text-xs mt-1">⚠️ GitHub token is required for both platforms. <a href="https://github.com/settings/tokens/new?scopes=repo,workflow&description=Gold_Crew" target="_blank" rel="noopener" class="underline hover:text-amber-300">Create one here →</a></p>` : ''}
      <p class="text-slate-500 text-xs"><button data-goto-settings class="underline hover:text-slate-400">Configure all tokens in Settings →</button></p>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
      <button data-plat="render" class="p-6 rounded-2xl border-2 text-left transition ${data.platform==='render'?'border-purple-500 bg-purple-500/10':'border-white/10 hover:border-white/20'} ${!hasRender||!hasGithub?'opacity-50':''}">
        <div class="flex items-center gap-2 mb-2"><span class="text-3xl">🟣</span>${!hasRender||!hasGithub?'<span class="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">Needs tokens</span>':''}</div>
        <p class="font-bold text-white text-lg">${t('deploy.render')}</p>
        <p class="text-sm text-slate-400 mt-1">${t('deploy.renderDesc')}</p>
        ${hasRender&&hasGithub?'<p class="text-xs text-emerald-400 mt-2">✓ Ready to deploy</p>':''}
      </button>
      <button data-plat="vercel" class="p-6 rounded-2xl border-2 text-left transition ${data.platform==='vercel'?'border-white bg-white/10':'border-white/10 hover:border-white/20'} ${!hasVercel?'opacity-50':''}">
        <div class="flex items-center gap-2 mb-2"><span class="text-3xl">⬛</span>${!hasVercel?'<span class="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">Needs token</span>':''}</div>
        <p class="font-bold text-white text-lg">${t('deploy.vercel')}</p>
        <p class="text-sm text-slate-400 mt-1">${t('deploy.vercelDesc')}</p>
        ${hasVercel?'<p class="text-xs text-emerald-400 mt-2">✓ Ready to deploy</p>':''}
      </button>
    </div>
    <div class="flex justify-between"><button id="backBtn" class="px-6 py-3 border border-white/10 text-slate-300 hover:bg-white/5 rounded-xl transition">${t('deploy.back')}</button>
    <button id="nextBtn" class="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition">${t('deploy.next')} →</button></div>
  </div>`;
}

function review() {
  const vars = data.envVars.filter(v => v.key);
  const { settings } = getState();
  const ready = data.platform === 'vercel' ? (settings.vercelToken && settings.githubToken) : (settings.renderApiKey && settings.githubToken);
  return `<div class="max-w-lg mx-auto">
    <h3 class="text-lg font-bold text-white mb-1">${t('deploy.reviewTitle')}</h3>
    <p class="text-sm text-slate-400 mb-6">${t('deploy.reviewSubtitle')}</p>
    <div class="space-y-3">
      <div class="bg-slate-800/50 rounded-xl p-4"><p class="text-xs text-slate-500 uppercase tracking-wider mb-2">Project</p><p class="text-white font-medium">${esc(data.projectName)||'-'}</p><p class="text-sm text-slate-400">${data.projectType} • ${data.fileName} • ${fmt(data.fileSize)}</p>${data.description?`<p class="text-sm text-slate-400 mt-1">${esc(data.description)}</p>`:''}</div>
      <div class="bg-slate-800/50 rounded-xl p-4"><p class="text-xs text-slate-500 uppercase tracking-wider mb-2">Platform</p><p class="text-white font-medium">${data.platform==='render'?'🟣 Render':'⬛ Vercel'}</p></div>
      <div class="bg-slate-800/50 rounded-xl p-4"><p class="text-xs text-slate-500 uppercase tracking-wider mb-2">Environment (${vars.length})</p>${vars.length?vars.map(v=>`<p class="text-sm text-slate-300 font-mono">${esc(v.key)} = ***</p>`).join(''):`<p class="text-sm text-slate-500">None</p>`}</div>
    </div>
    ${!ready ? `<div class="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm">⚠️ Missing API tokens. <button data-goto-settings class="underline hover:text-red-200">Configure in Settings</button></div>` : ''}
    <div class="flex justify-between pt-6"><button id="backBtn" class="px-6 py-3 border border-white/10 text-slate-300 hover:bg-white/5 rounded-xl transition">${t('deploy.back')}</button>
    <button id="deployBtn" class="px-8 py-3 ${ready ? 'bg-amber-500 hover:bg-amber-400 pulse-gold' : 'bg-slate-700 cursor-not-allowed'} text-slate-950 font-bold rounded-xl transition" ${!ready?'disabled':''}>🚀 ${t('deploy.deployBtn')}</button></div>
  </div>`;
}

function deployingHtml() {
  return `<div class="text-center py-6">
    <div class="w-14 h-14 rounded-full bg-amber-500/20 flex items-center justify-center text-2xl mx-auto mb-4 pulse-gold">🚀</div>
    <h3 class="text-xl font-bold text-white mb-1">${t('deploy.deployingTitle')}</h3>
    <p class="text-slate-400 text-sm">${t('deploy.deployingSubtitle')}</p>
    <div class="mt-5 max-w-md mx-auto bg-slate-800 rounded-full h-2 overflow-hidden"><div id="pbar" class="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-500" style="width:0%"></div></div>
    <div id="dlogs" class="mt-4 max-w-md mx-auto text-left bg-slate-900/80 rounded-xl p-4 max-h-56 overflow-y-auto text-xs space-y-1 font-mono"></div>
  </div>`;
}

function success() {
  return `<div class="text-center py-6">
    <div class="text-6xl mb-4">🎉</div>
    <h3 class="text-2xl font-bold text-white mb-2">${t('deploy.successTitle')}</h3>
    <p class="text-slate-400">${t('deploy.successSubtitle')}</p>
    ${deployResult ? `<div class="mt-3 text-xs text-slate-500">${deployResult.fileCount} files • ${deployResult.runtime} runtime • ${deployResult.platform}</div>` : ''}
    <div class="mt-5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 max-w-md mx-auto">
      <p class="text-xs text-emerald-400 mb-1">${t('deploy.liveUrl')}</p>
      <a href="${liveUrl}" target="_blank" rel="noopener" class="text-white font-mono hover:text-emerald-300 break-all text-sm">${liveUrl}</a>
    </div>
    ${deployResult?.repoUrl ? `<div class="mt-3 bg-slate-800/50 rounded-xl p-3 max-w-md mx-auto"><p class="text-xs text-slate-400 mb-1">GitHub Repository</p><a href="https://github.com/${deployResult.repoUrl}" target="_blank" rel="noopener" class="text-cyan-400 font-mono hover:text-cyan-300 break-all text-xs">${deployResult.repoUrl}</a></div>` : ''}
    <div class="mt-6 flex flex-wrap justify-center gap-3">
      <a href="${liveUrl}" target="_blank" rel="noopener" class="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl transition">↗ ${t('deploy.openSite')}</a>
      <button id="deployAnother" class="px-6 py-3 border border-white/10 text-slate-300 hover:bg-white/5 rounded-xl transition">${t('deploy.deployAnother')}</button>
      <button id="viewLogsBtn" class="px-6 py-3 border border-white/10 text-slate-300 hover:bg-white/5 rounded-xl transition">${t('deploy.viewLogs')}</button>
    </div>
  </div>`;
}

function errorView() {
  const isToken = deployError.includes('token') || deployError.includes('Token') || deployError.includes('auth') || deployError.includes('401') || deployError.includes('403');
  const isNetwork = deployError.includes('Network') || deployError.includes('Failed to fetch') || deployError.includes('timed out');
  return `<div class="text-center py-6">
    <div class="text-6xl mb-4">❌</div>
    <h3 class="text-2xl font-bold text-white mb-2">Deployment Failed</h3>
    <div class="mt-4 bg-red-500/10 border border-red-500/20 rounded-xl p-5 max-w-md mx-auto text-left space-y-3">
      <p class="text-red-300 text-sm break-words">${esc(deployError)}</p>
      ${isToken ? `<div class="pt-2 border-t border-red-500/20"><p class="text-xs text-slate-400 mb-2">Fix: Check your API tokens in Settings</p><button data-goto-settings class="px-4 py-2 bg-amber-500/20 text-amber-300 rounded-lg text-xs hover:bg-amber-500/30 transition">Open Settings →</button></div>` : ''}
      ${isNetwork ? `<div class="pt-2 border-t border-red-500/20"><p class="text-xs text-slate-400">This may be a temporary network issue. Wait a moment and try again.</p></div>` : ''}
    </div>
    <div class="mt-6 flex flex-wrap justify-center gap-3">
      <button id="retryBtn" class="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition">🔄 Retry</button>
      <button id="deployAnother" class="px-6 py-3 border border-white/10 text-slate-300 hover:bg-white/5 rounded-xl transition">${t('deploy.deployAnother')}</button>
      <button id="viewLogsBtn" class="px-6 py-3 border border-white/10 text-slate-300 hover:bg-white/5 rounded-xl transition">${t('deploy.viewLogs')}</button>
    </div>
  </div>`;
}

// ── Helpers ──

function fmt(b) { return b < 1024 ? b+' B' : b < 1048576 ? (b/1024).toFixed(1)+' KB' : (b/1048576).toFixed(1)+' MB'; }
function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

function syncInputs() {
  const pn = document.getElementById('projectName'); if (pn) data.projectName = pn.value;
  const desc = document.getElementById('description'); if (desc) data.description = desc.value;
  document.querySelectorAll('[data-ek]').forEach(el => { data.envVars[+el.dataset.ek].key = el.value; });
  document.querySelectorAll('[data-ev]').forEach(el => { data.envVars[+el.dataset.ev].value = el.value; });
}

// ── Binding ──

function bind() {
  const dz = document.getElementById('dropZone');
  const fi = document.getElementById('fileInput');
  if (dz && fi) {
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag-over'); pick(e.dataTransfer.files[0]); });
    fi.addEventListener('change', e => pick(e.target.files[0]));
  }
  document.getElementById('nextBtn')?.addEventListener('click', next);
  document.getElementById('backBtn')?.addEventListener('click', () => { syncInputs(); step--; renderDeploy(document.getElementById('main-container')); });
  document.getElementById('deployBtn')?.addEventListener('click', go);
  document.getElementById('retryBtn')?.addEventListener('click', go);
  document.getElementById('deployAnother')?.addEventListener('click', () => { resetDeploy(); renderDeploy(document.getElementById('main-container')); });
  document.getElementById('viewLogsBtn')?.addEventListener('click', () => setState({ currentView: 'logs' }));
  document.querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', () => { data.projectType = b.dataset.type; renderDeploy(document.getElementById('main-container')); }));
  document.querySelectorAll('[data-plat]').forEach(b => b.addEventListener('click', () => { data.platform = b.dataset.plat; renderDeploy(document.getElementById('main-container')); }));
  document.getElementById('addEnv')?.addEventListener('click', () => { syncInputs(); data.envVars.push({ key: '', value: '' }); renderDeploy(document.getElementById('main-container')); });
  document.querySelectorAll('[data-re]').forEach(b => b.addEventListener('click', () => { syncInputs(); data.envVars.splice(+b.dataset.re, 1); renderDeploy(document.getElementById('main-container')); }));
  document.querySelectorAll('[data-goto-settings]').forEach(b => b.addEventListener('click', () => setState({ currentView: 'settings' })));

  // Transform bindings
  document.getElementById('transformRepoBtn')?.addEventListener('click', () => {
    if (!data.fileName) { showToast(t('deploy.noFile'), 'warning'); return; }
    transformMode = true;
    transformResult = null;
    transformError = '';
    renderDeploy(document.getElementById('main-container'));
  });
  document.getElementById('transformCancel')?.addEventListener('click', () => {
    transformMode = false; transformResult = null; transformError = ''; transformLoading = false;
    renderDeploy(document.getElementById('main-container'));
  });
  document.getElementById('transformGo')?.addEventListener('click', doTransform);
  document.getElementById('transformRetry')?.addEventListener('click', doTransform);
  document.getElementById('transformAnother')?.addEventListener('click', () => {
    transformMode = false; transformResult = null; transformError = ''; transformLoading = false;
    resetDeploy();
    renderDeploy(document.getElementById('main-container'));
  });
}

// ── Actions ──

function pick(f) {
  if (!f) return;
  if (!f.name.toLowerCase().endsWith('.zip')) { showToast('Please upload a .zip file', 'warning'); return; }
  data.file = f; data.fileName = f.name; data.fileSize = f.size;
  if (!data.projectName) data.projectName = f.name.replace(/\.zip$/i, '').replace(/[^a-zA-Z0-9_-]/g, '-');
  renderDeploy(document.getElementById('main-container'));
}

function next() {
  syncInputs();
  if (step === 1 && !data.fileName) { showToast(t('deploy.noFile'), 'warning'); return; }
  if (step === 2 && !data.projectName.trim()) { showToast(t('deploy.noName'), 'warning'); return; }
  step++;
  renderDeploy(document.getElementById('main-container'));
}

// ── Transform: ZIP → GitHub Repo ──

async function doTransform() {
  const { settings } = getState();
  if (!settings.githubToken) {
    showToast('GitHub token required', 'error');
    return;
  }

  const repoNameInput = document.getElementById('transformRepoName');
  const repoDescInput = document.getElementById('transformRepoDesc');
  const privateCheck = document.getElementById('transformPrivate');

  const repoName = (repoNameInput?.value || data.fileName.replace(/\.zip$/i, '')).replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '') || 'my-project';
  const repoDesc = repoDescInput?.value?.trim() || '';
  const isPrivate = privateCheck?.checked || false;

  transformLoading = true;
  transformError = '';
  transformResult = null;
  renderDeploy(document.getElementById('main-container'));

  const stepsEl = document.getElementById('transformSteps');

  function addStep(msg, status) {
    if (!stepsEl) return;
    const p = document.createElement('p');
    p.className = status === 'ok' ? 'text-emerald-400' : status === 'error' ? 'text-red-400' : 'text-slate-300';
    p.innerHTML = `${status === 'ok' ? '✓' : status === 'error' ? '✕' : '⏳'} ${msg}`;
    stepsEl.appendChild(p);
  }

  try {
    // Step 1: Validate token
    addStep('Validating GitHub token...');
    let githubUser;
    try {
      githubUser = await validateGithubToken(settings.githubToken);
    } catch (err) {
      throw new Error(`GitHub token invalid: ${err.message}`);
    }
    addStep(`Authenticated as ${githubUser.username}`, 'ok');

    // Step 2: Extract ZIP
    addStep('Extracting ZIP archive...');
    const files = await parseZip(data.file);
    if (files.length === 0) throw new Error('ZIP is empty or corrupt');
    addStep(`Extracted ${files.length} files`, 'ok');

    // Step 3: Create repo
    addStep(`Creating repository "${repoName}"...`);
    const repo = await getOrCreateRepo(settings.githubToken, repoName, githubUser.username, addStep, {
      description: repoDesc,
      private: isPrivate,
    });
    addStep(`Repository created: ${repo.full_name}`, 'ok');

    // Step 4: Upload files
    addStep(`Uploading ${files.length} files to repository...`);
    await uploadFiles(settings.githubToken, githubUser.username, repoName, files, 'main', addStep);
    addStep(`All ${files.length} files uploaded`, 'ok');

    // Success
    addLog({ type: 'success', message: `ZIP → Repo: ${repo.full_name} (${files.length} files)` });
    transformResult = {
      fullName: repo.full_name,
      htmlUrl: repo.html_url,
      fileCount: files.length,
      visibility: isPrivate ? 'Private' : 'Public',
    };
    showToast(`✓ ${repo.full_name} created with ${files.length} files`, 'success');
  } catch (err) {
    transformError = err.message || 'Unknown error';
    addLog({ type: 'error', message: `Transform failed: ${transformError}` });
    showToast(`Transform failed: ${transformError}`, 'error', 6000);
  } finally {
    transformLoading = false;
    renderDeploy(document.getElementById('main-container'));
  }
}

// ── Standard Deploy ──

async function go() {
  const { settings, projects } = getState();
  syncInputs();

  if (projects.length >= MAX_PROJECTS) {
    deployError = `You've reached the maximum of ${MAX_PROJECTS} projects. Delete some projects from the Dashboard to make room before deploying again.`;
    step = 6;
    renderDeploy(document.getElementById('main-container'));
    return;
  }

  deploying = true;
  deployError = '';
  step = 5;
  renderDeploy(document.getElementById('main-container'));

  const bar = document.getElementById('pbar');
  const dl = document.getElementById('dlogs');

  function logLine(msg) {
    addLog({ type: 'info', message: msg });
    if (dl) {
      const p = document.createElement('p');
      p.className = 'text-slate-300';
      p.textContent = msg;
      dl.appendChild(p);
      dl.scrollTop = dl.scrollHeight;
    }
  }

  function updatePct(pct) {
    if (bar) bar.style.width = pct + '%';
  }

  try {
    logLine(`Starting deployment of ${data.projectName} → ${data.platform}`);
    const result = await deploy(
      {
        file: data.file,
        projectName: data.projectName,
        projectType: data.projectType,
        description: data.description,
        envVars: data.envVars.filter(v => v.key && v.value),
        platform: data.platform,
      },
      settings,
      logLine,
      updatePct,
    );
    liveUrl = result.url;
    deployResult = result;
    addLog({ type: 'success', message: `${data.projectName} deployed → ${result.url}` });
    const proj = { id: Date.now(), name: data.projectName, type: data.projectType, platform: data.platform, url: result.url, status: 'live', description: data.description, repoUrl: result.repoUrl || '', createdAt: new Date().toISOString() };
    const updated = [proj, ...getState().projects];
    setState({ projects: updated });
    const { user } = getState();
    await saveProjects(user?.username, updated);
    deploying = false;
    step = 6;
  } catch (err) {
    deploying = false;
    step = 6;
    deployError = err.message || 'Unknown error occurred';
    addLog({ type: 'error', message: `Deploy failed: ${deployError}` });
    showToast(`Deploy failed: ${deployError}`, 'error', 6000);
  }

  renderDeploy(document.getElementById('main-container'));
}
