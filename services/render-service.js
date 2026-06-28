// services/render-service.js — Render API: service creation from GitHub repo
// Uses real Render API v1. No simulation.

const RENDER_API = 'https://api.render.com/v1';

/**
 * Validate a Render API key by fetching owner info.
 * @returns {{ ownerId: string, email: string }}
 */
export async function validateRenderKey(apiKey) {
  const res = await fetch(`${RENDER_API}/owners`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('API key is invalid or expired. Generate a new one at render.com/account');
    }
    throw new Error(`API returned ${res.status}`);
  }
  const owners = await res.json();
  // Render returns array of { owner: { id, email, name } }
  if (!Array.isArray(owners) || owners.length === 0) {
    throw new Error('No Render account found for this API key');
  }
  const owner = owners[0]?.owner;
  if (!owner?.id) throw new Error('Unexpected Render API response format');
  return { ownerId: owner.id, email: owner.email || '' };
}

/**
 * Create a Render web service or static site from a GitHub repo.
 * Then polls the build until it's live or fails.
 * @param {string} apiKey - Render API key
 * @param {string} ownerId - Render owner ID (from validateRenderKey)
 * @param {string} repoUrl - GitHub repo HTTPS URL
 * @param {Object} config - { projectName, runtime, buildCommand, startCommand, detectedType, outputDir, branch }
 * @param {Array} envVars - [{key, value}]
 * @param {Function} onLog - log callback
 * @param {Function} onProgress - progress callback (60-95)
 * @returns {{ url: string, serviceId: string, status: string }}
 */
export async function createRenderService(apiKey, ownerId, repoUrl, config, envVars, onLog, onProgress) {
  const pct = (v) => { onProgress?.(v); };

  if (!ownerId) {
    throw new Error('Render owner ID is missing. Re-validate your Render API key in Settings.');
  }

  onLog('☁️ Creating Render service...');
  pct(65);

  // Build environment variables
  const env = [];
  for (const v of envVars) {
    if (v.key && v.value) {
      env.push({ key: v.key, value: v.value });
    }
  }

  // Determine service type
  const isStatic = config.runtime === 'static' || config.detectedType === 'site';
  const serviceType = isStatic ? 'static_site' : 'web_service';

  // Build the service creation body
  const body = {
    type: serviceType,
    name: config.projectName,
    ownerId: ownerId,
    repo: repoUrl,
    branch: config.branch || 'main',
    serviceDetails: {},
  };

  if (serviceType === 'web_service') {
    // Map detected runtime to Render env string
    let renderEnv = 'node';
    if (config.runtime === 'python') renderEnv = 'python';
    else if (config.runtime === 'go') renderEnv = 'go';
    else if (config.runtime === 'docker') renderEnv = 'docker';

    body.serviceDetails = {
      env: renderEnv,
      buildCommand: config.buildCommand || 'npm install',
      startCommand: config.startCommand || 'npm start',
      plan: 'free',
    };
  } else {
    // Static site
    body.serviceDetails = {
      buildCommand: config.buildCommand || '',
      publishPath: config.outputDir || 'dist',
      pullRequestPreviewsEnabled: false,
    };
  }

  if (env.length > 0) {
    body.envVars = env.map(v => ({ key: v.key, value: v.value }));
  }

  onLog(`   Type: ${serviceType} | Runtime: ${config.runtime}`);
  onLog(`   Build: ${body.serviceDetails.buildCommand || '(none)'}`);
  if (body.serviceDetails.startCommand) onLog(`   Start: ${body.serviceDetails.startCommand}`);
  onLog(`   Repo: ${repoUrl}`);

  // Create the service
  let serviceData;
  try {
    const res = await fetch(`${RENDER_API}/services`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.message || err.error?.message || `HTTP ${res.status}`;

      if (res.status === 401 || res.status === 403) {
        throw new Error(`Render auth failed: ${msg}. Check your API key at render.com/account`);
      }
      if (res.status === 400) {
        throw new Error(`Render rejected the service: ${msg}`);
      }
      if (res.status === 429) {
        throw new Error('Render rate limit reached. Wait a few minutes and try again.');
      }
      throw new Error(`Render service creation failed: ${msg}`);
    }

    serviceData = await res.json();
  } catch (err) {
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      throw new Error('Cannot reach Render API from the browser. Render may block direct browser requests — try deploying from the Render dashboard (render.com) or use a proxy.');
    }
    throw err;
  }

  // Parse response — Render returns { service: { id, name, ... }, deploy: { ... } }
  const service = serviceData.service || serviceData;
  const serviceId = service.id;
  const serviceName = service.name || config.projectName;

  if (!serviceId) {
    throw new Error('Render did not return a service ID. Check the API response in your browser console.');
  }

  onLog(`✓ Service created: ${serviceName} (${serviceId})`);

  // Get the dashboard URL
  const dashboardType = serviceType === 'static_site' ? 'static' : 'web';
  onLog(`🔗 Dashboard: https://dashboard.render.com/${dashboardType}/${serviceId}`);
  pct(75);

  // Poll for deployment to complete
  onLog('⏳ Waiting for build and deploy...');
  let attempts = 0;
  const maxAttempts = 100; // ~8 min at 5s intervals

  while (attempts < maxAttempts) {
    await sleep(5000);
    attempts++;

    try {
      const deployRes = await fetch(`${RENDER_API}/services/${serviceId}/deploys?limit=1`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!deployRes.ok) {
        if (attempts % 10 === 0) onLog(`⚠️ Status check returned ${deployRes.status}, retrying...`);
        continue;
      }

      const deploys = await deployRes.json();
      if (!Array.isArray(deploys) || deploys.length === 0) {
        if (attempts % 5 === 0) onLog('⏳ Waiting for first deploy to start...');
        continue;
      }

      // deploys is array of { deploy: { id, status, ... } }
      const deploy = deploys[0]?.deploy || deploys[0];
      const status = deploy?.status;

      if (status === 'live') {
        onLog('✅ Service is live!');
        // Try to extract the service URL
        let url = '';
        try {
          const svcRes = await fetch(`${RENDER_API}/services/${serviceId}`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          if (svcRes.ok) {
            const svcData = await svcRes.json();
            const svc = svcData.service || svcData;
            url = svc.serviceDetails?.url || svc.url || '';
          }
        } catch {}
        if (!url) {
          url = `https://${serviceName}.onrender.com`;
        }
        return { url, serviceId, status: 'live' };
      }

      if (status === 'build_failed' || status === 'update_failed' || status === 'deactivated') {
        throw new Error(`Render build failed with status: ${status}. Check the Render dashboard for build logs.`);
      }

      // Progress updates every 3 attempts (~15s)
      if (attempts % 3 === 0) {
        const elapsed = attempts * 5;
        onLog(`⏳ Building... (${elapsed}s) — status: ${status || 'unknown'}`);
        pct(75 + Math.min(20, Math.round(elapsed / 24)));
      }
    } catch (err) {
      if (err.message.includes('Build failed') || err.message.includes('status:')) throw err;
      // Network blip, keep polling
    }
  }

  throw new Error('Render deploy timed out after 8 minutes. Check your Render dashboard for the build status.');
}

/**
 * List all Render services for the authenticated account.
 */
export async function listRenderServices(apiKey) {
  const res = await fetch(`${RENDER_API}/services?limit=100`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Failed to list services: ${res.status}`);
  return await res.json();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
