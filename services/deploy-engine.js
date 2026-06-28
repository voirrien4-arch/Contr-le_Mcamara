// services/deploy-engine.js — Orchestrates real deployment pipeline
// Calls actual GitHub, Vercel, and Render APIs. No simulation.

import { parseZip, autoDetectProject } from './zip-parser.js';
import { validateGithubToken, getOrCreateRepo, uploadFiles } from './github-service.js';
import { validateVercelToken, deployToVercel } from './vercel-service.js';
import { validateRenderKey, createRenderService } from './render-service.js';

/**
 * Run full deployment pipeline with real API calls.
 * @param {Object} config - { file, projectName, projectType, description, envVars, platform }
 * @param {Object} settings - { renderApiKey, vercelToken, githubToken }
 * @param {Function} onLog - callback(msg: string) for live log updates
 * @param {Function} onProgress - callback(pct: number 0-100)
 * @returns {{ url: string, platform: string, repoUrl?: string, deploymentId?: string }}
 */
export async function deploy(config, settings, onLog, onProgress) {
  const { platform } = config;
  const pct = (v) => { onProgress?.(Math.min(100, Math.max(0, v))); };

  // ── Step 1: Extract ZIP ──
  onLog('📦 Extracting ZIP file...');
  pct(5);
  let files;
  try {
    files = await parseZip(config.file);
  } catch (err) {
    throw new Error(`Failed to extract ZIP: ${err.message}`);
  }
  if (files.length === 0) throw new Error('ZIP file is empty or corrupt');
  const totalSizeMB = (files.reduce((s, f) => s + f.size, 0) / 1048576).toFixed(1);
  onLog(`✓ Extracted ${files.length} files (${totalSizeMB} MB total)`);
  pct(10);

  // ── Step 2: Detect project ──
  onLog('🔍 Analyzing project structure...');
  const detected = autoDetectProject(files);
  const buildCmd = detected.buildCommand || 'npm install';
  const startCmd = detected.startCommand || 'npm start';
  onLog(`📋 Runtime: ${detected.runtime} | Framework: ${detected.framework || 'none'} | Type: ${detected.detectedType || config.projectType}`);
  pct(15);

  // ── Step 3: Validate tokens ──
  onLog('🔐 Validating API tokens...');
  let githubUser = null;

  if (!settings.githubToken) {
    throw new Error('GitHub token is required. Go to Settings → API Keys and add your GitHub Personal Access Token.');
  }

  try {
    githubUser = await validateGithubToken(settings.githubToken);
    onLog(`✓ GitHub: authenticated as ${githubUser.username}`);
  } catch (err) {
    throw new Error(`GitHub token invalid: ${err.message}. Go to Settings and update your token.`);
  }

  if (platform === 'vercel') {
    if (!settings.vercelToken) {
      throw new Error('Vercel token is required. Go to Settings → API Keys and add your Vercel token.');
    }
    try {
      const vUser = await validateVercelToken(settings.vercelToken);
      onLog(`✓ Vercel: authenticated as ${vUser.username}`);
    } catch (err) {
      throw new Error(`Vercel token invalid: ${err.message}. Go to Settings and update your token.`);
    }
  }

  let renderOwnerId = null;
  if (platform === 'render') {
    if (!settings.renderApiKey) {
      throw new Error('Render API key is required. Go to Settings → API Keys and add your Render API key.');
    }
    try {
      const rUser = await validateRenderKey(settings.renderApiKey);
      renderOwnerId = rUser.ownerId;
      onLog(`✓ Render: authenticated (owner: ${renderOwnerId})`);
    } catch (err) {
      throw new Error(`Render API key invalid: ${err.message}. Go to Settings and update your key.`);
    }
  }
  pct(25);

  const slug = config.projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'project';

  // ── Branch: Vercel deploys directly, Render needs GitHub repo ──
  if (platform === 'vercel') {
    return await deployVercel(settings, files, slug, config, detected, onLog, pct);
  }

  return await deployRender(settings, files, slug, config, detected, renderOwnerId, githubUser, onLog, pct);
}

/**
 * Vercel deployment: direct file upload → deployment creation → poll ready
 */
async function deployVercel(settings, files, slug, config, detected, onLog, pct) {
  onLog('☁️ Deploying to Vercel via direct upload...');
  pct(35);

  let result;
  try {
    result = await deployToVercel(
      settings.vercelToken,
      files,
      slug,
      config.envVars,
      onLog,
      pct,
    );
  } catch (err) {
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      throw new Error('Network error reaching Vercel API. Check your internet connection and try again.');
    }
    throw err;
  }

  pct(100);
  return {
    url: result.url,
    platform: 'vercel',
    deploymentId: result.id,
    status: result.status,
    fileCount: files.length,
    runtime: detected.runtime,
  };
}

/**
 * Render deployment: push to GitHub → create Render service → poll build
 */
async function deployRender(settings, files, slug, config, detected, renderOwnerId, githubUser, onLog, pct) {
  // ── Push files to GitHub ──
  onLog('📁 Setting up GitHub repository...');
  pct(30);

  let repo;
  try {
    repo = await getOrCreateRepo(settings.githubToken, slug, githubUser.username, onLog);
  } catch (err) {
    if (err.message.includes('403')) {
      throw new Error(`GitHub: permission denied for repo "${slug}". Check your token has 'repo' scope.`);
    }
    throw new Error(`GitHub repo error: ${err.message}`);
  }

  pct(40);
  try {
    await uploadFiles(settings.githubToken, githubUser.username, slug, files, 'main', onLog);
  } catch (err) {
    if (err.message.includes('403') || err.message.includes('rate limit')) {
      throw new Error(`GitHub API error: ${err.message}. Wait a minute and try again.`);
    }
    throw new Error(`Failed to push code to GitHub: ${err.message}`);
  }

  pct(60);
  onLog('🔗 Linking repository to Render...');

  // ── Create Render service ──
  let renderResult;
  try {
    renderResult = await createRenderService(
      settings.renderApiKey,
      renderOwnerId,
      `https://github.com/${githubUser.username}/${slug}`,
      {
        projectName: slug,
        runtime: detected.runtime,
        buildCommand: detected.buildCommand || 'npm install',
        startCommand: detected.startCommand || 'npm start',
        detectedType: detected.detectedType || config.projectType,
        outputDir: 'dist',
        branch: 'main',
      },
      config.envVars,
      onLog,
      pct,
    );
  } catch (err) {
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      throw new Error('Network error reaching Render API. Render API may not support browser requests — try deploying from the Render dashboard directly.');
    }
    throw err;
  }

  pct(100);
  return {
    url: renderResult.url,
    platform: 'render',
    serviceId: renderResult.serviceId,
    repoUrl: `https://github.com/${githubUser.username}/${slug}`,
    status: renderResult.status,
    fileCount: files.length,
    runtime: detected.runtime,
  };
}
