// ui/help-view.js — Help & Guide: what is Gold_Crew, how to get API keys, how to deploy

const t = (key) => window.miniappI18n?.t(key) ?? key;

export function renderHelp(container) {
  container.innerHTML = `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-white">❓ ${t('help.title')}</h1>
        <p class="text-slate-400 mt-1">${t('help.subtitle')}</p>
      </div>

      <!-- What is Gold_Crew -->
      ${section('🎯', t('help.what.title'), `
        <p class="text-slate-300 leading-relaxed">${t('help.what.desc')}</p>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          ${featureCard('🤖', t('help.what.feat1Title'), t('help.what.feat1Desc'))}
          ${featureCard('🌐', t('help.what.feat2Title'), t('help.what.feat2Desc'))}
          ${featureCard('⚡', t('help.what.feat3Title'), t('help.what.feat3Desc'))}
        </div>
      `)}

      <!-- How to get API keys -->
      ${section('🔑', t('help.keys.title'), `
        <p class="text-slate-400 text-sm mb-4">${t('help.keys.desc')}</p>
        ${apiKeyCard('🐙', 'GitHub Token', t('help.keys.github.desc'), [
          t('help.keys.github.s1'),
          t('help.keys.github.s2'),
          t('help.keys.github.s3'),
          t('help.keys.github.s4'),
        ], 'https://github.com/settings/tokens/new?scopes=repo,workflow&description=Gold_Crew')}
        ${apiKeyCard('🟣', 'Render API Key', t('help.keys.render.desc'), [
          t('help.keys.render.s1'),
          t('help.keys.render.s2'),
          t('help.keys.render.s3'),
        ], 'https://dashboard.render.com/account/api-keys')}
        ${apiKeyCard('⬛', 'Vercel Token', t('help.keys.vercel.desc'), [
          t('help.keys.vercel.s1'),
          t('help.keys.vercel.s2'),
          t('help.keys.vercel.s3'),
        ], 'https://vercel.com/account/tokens')}
      `)}

      <!-- How to deploy -->
      ${section('🚀', t('help.deploy.title'), `
        <p class="text-slate-400 text-sm mb-4">${t('help.deploy.desc')}</p>
        ${deployCard('🤖', t('help.deploy.bot.title'), t('help.deploy.bot.desc'), [
          t('help.deploy.bot.s1'),
          t('help.deploy.bot.s2'),
          t('help.deploy.bot.s3'),
          t('help.deploy.bot.s4'),
          t('help.deploy.bot.s5'),
        ])}
        ${deployCard('🌐', t('help.deploy.site.title'), t('help.deploy.site.desc'), [
          t('help.deploy.site.s1'),
          t('help.deploy.site.s2'),
          t('help.deploy.site.s3'),
          t('help.deploy.site.s4'),
          t('help.deploy.site.s5'),
        ])}
        ${deployCard('⚡', t('help.deploy.api.title'), t('help.deploy.api.desc'), [
          t('help.deploy.api.s1'),
          t('help.deploy.api.s2'),
          t('help.deploy.api.s3'),
          t('help.deploy.api.s4'),
          t('help.deploy.api.s5'),
        ])}
      `)}

      <!-- Limits -->
      ${section('📊', t('help.limits.title'), `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${limitCard(t('help.limits.projects'), '20')}
          ${limitCard(t('help.limits.envVars'), t('help.limits.unlimited'))}
          ${limitCard(t('help.limits.fileSize'), '50 MB')}
          ${limitCard(t('help.limits.logs'), '200')}
        </div>
      `)}

      <!-- Community -->
      ${section('💬', t('help.community.title'), `
        <p class="text-slate-300 mb-4">${t('help.community.desc')}</p>
        <div class="flex flex-wrap gap-3">
          <a href="https://whatsapp.com/channel/0029Vb7Bk6jEVccC46JZL92T" target="_blank" rel="noopener"
            class="flex items-center gap-2 px-5 py-3 bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 font-medium rounded-xl hover:bg-emerald-500/25 transition">
            <span>💬</span> ${t('help.community.whatsapp')}
          </a>
          <a href="https://zip-github-mcamara-v1.onrender.com/" target="_blank" rel="noopener"
            class="flex items-center gap-2 px-5 py-3 bg-cyan-500/15 border border-cyan-500/25 text-cyan-300 font-medium rounded-xl hover:bg-cyan-500/25 transition">
            <span>🔗</span> ${t('help.community.otherProjects')}
          </a>
        </div>
      `)}

      <!-- Credits -->
      <div class="text-center py-6 border-t border-white/10">
        <p class="text-slate-500 text-sm">Gold_Crew — Créé par <span class="text-amber-400 font-medium">Mcamara</span></p>
      </div>
    </div>
  `;
}

function section(icon, title, content) {
  return `
    <div class="bg-white/5 border border-white/10 rounded-2xl p-6">
      <h2 class="text-lg font-bold text-white mb-4 flex items-center gap-2">
        <span class="text-xl">${icon}</span> ${title}
      </h2>
      ${content}
    </div>
  `;
}

function featureCard(icon, title, desc) {
  return `
    <div class="p-4 bg-slate-900/50 rounded-xl text-center">
      <p class="text-2xl mb-2">${icon}</p>
      <p class="text-white font-medium text-sm">${title}</p>
      <p class="text-slate-400 text-xs mt-1">${desc}</p>
    </div>
  `;
}

function apiKeyCard(icon, name, desc, steps, url) {
  return `
    <div class="p-4 bg-slate-900/50 rounded-xl mb-3">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-lg">${icon}</span>
        <p class="text-white font-medium">${name}</p>
      </div>
      <p class="text-slate-400 text-sm mb-3">${desc}</p>
      <ol class="text-sm text-slate-300 space-y-1.5 ml-4 list-decimal">
        ${steps.map(s => `<li>${s}</li>`).join('')}
      </ol>
      <a href="${url}" target="_blank" rel="noopener"
        class="inline-block mt-3 px-4 py-2 bg-amber-500/15 border border-amber-500/25 text-amber-300 rounded-lg text-xs font-medium hover:bg-amber-500/25 transition">
        🔗 ${t('help.keys.getKey')}
      </a>
    </div>
  `;
}

function deployCard(icon, title, desc, steps) {
  return `
    <div class="p-4 bg-slate-900/50 rounded-xl mb-3">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-lg">${icon}</span>
        <p class="text-white font-medium">${title}</p>
      </div>
      <p class="text-slate-400 text-sm mb-3">${desc}</p>
      <ol class="text-sm text-slate-300 space-y-1.5 ml-4 list-decimal">
        ${steps.map(s => `<li>${s}</li>`).join('')}
      </ol>
    </div>
  `;
}

function limitCard(label, value) {
  return `
    <div class="p-3 bg-slate-900/50 rounded-xl flex items-center justify-between">
      <span class="text-slate-300 text-sm">${label}</span>
      <span class="text-amber-400 font-bold text-sm">${value}</span>
    </div>
  `;
}
