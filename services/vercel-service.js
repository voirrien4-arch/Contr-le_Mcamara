// services/vercel-service.js — Vercel API: direct file upload deployment
// Uses real Vercel API v13 for deployments. No simulation.

const VERCEL_API = 'https://api.vercel.com';

/**
 * Validate a Vercel bearer token by fetching the authenticated user.
 * @returns {{ username: string, email: string }}
 */
export async function validateVercelToken(token) {
  const res = await fetch(`${VERCEL_API}/v2/user`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('Token is expired or invalid. Generate a new one at vercel.com/account/tokens');
    }
    throw new Error(`API returned ${res.status}`);
  }
  const data = await res.json();
  if (!data.user?.username) throw new Error('Unexpected API response format');
  return { username: data.user.username, email: data.user.email };
}

/**
 * Deploy files to Vercel via their file-based deployment API.
 * For large projects (>4MB), uses chunked upload. Otherwise sends inline.
 * @param {string} token - Vercel bearer token
 * @param {Array} files - parsed file entries from zip-parser
 * @param {string} projectName - slug name
 * @param {Array} envVars - [{key, value}]
 * @param {Function} onLog - log callback
 * @param {Function} onProgress - progress callback (25-95)
 * @returns {{ url: string, id: string, status: string }}
 */
export async function deployToVercel(token, files, projectName, envVars, onLog, onProgress) {
  const pct = (v) => { onProgress?.(v); };

  // Build environment variables map
  const envMap = {};
  for (const v of envVars) {
    if (v.key && v.value) envMap[v.key] = v.value;
  }

  // Calculate total size to decide strategy
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const INLINE_LIMIT = 4 * 1024 * 1024; // 4MB — Vercel inline limit

  if (totalBytes > INLINE_LIMIT) {
    return await deployLarge(token, files, projectName, envMap, onLog, pct);
  }
  return await deployInline(token, files, projectName, envMap, onLog, pct);
}

/**
 * Inline deployment (<4MB) — files sent directly in the request body.
 */
async function deployInline(token, files, projectName, envMap, onLog, pct) {
  onLog('⬆️ Uploading files to Vercel (inline)...');
  pct(30);

  const vercelFiles = files.map(f => ({
    file: f.path,
    data: f.text !== null ? f.text : uint8ToBase64(f.content),
    encoding: f.text !== null ? 'utf8' : 'base64',
  }));

  return await createDeployment(token, projectName, vercelFiles, envMap, onLog, pct);
}

/**
 * Large deployment (>4MB) — upload files individually first, then reference by SHA.
 * Vercel API requires sha256 digests for pre-uploaded files.
 */
async function deployLarge(token, files, projectName, envMap, onLog, pct) {
  const totalMB = (files.reduce((s, f) => s + f.size, 0) / 1048576).toFixed(1);
  onLog(`⬆️ Pre-uploading ${files.length} files (${totalMB} MB) to Vercel...`);
  pct(25);

  const vercelFiles = [];
  const batchSize = 20;

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const uploaded = await Promise.all(batch.map(async (f) => {
      const fileData = f.text !== null
        ? new TextEncoder().encode(f.text)
        : f.content;

      // Compute SHA-256 digest
      const hashBuffer = await crypto.subtle.digest('SHA-256', fileData);
      const sha = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

      // Upload file
      const uploadRes = await fetch(`${VERCEL_API}/v2/files`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
          'x-vercel-digest': sha,
        },
        body: fileData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        throw new Error(`File upload failed for "${f.path}": ${err.error?.message || uploadRes.status}`);
      }

      return { file: f.path, sha };
    }));

    vercelFiles.push(...uploaded);
    const done = Math.min(i + batchSize, files.length);
    pct(25 + Math.round((done / files.length) * 30));
    if (done % 50 === 0 || done === files.length) {
      onLog(`   Uploaded ${done}/${files.length} files`);
    }
  }

  onLog(`✓ All ${files.length} files uploaded`);
  pct(55);
  return await createDeployment(token, projectName, vercelFiles, envMap, onLog, pct);
}

/**
 * Create a Vercel deployment and poll for READY state.
 */
async function createDeployment(token, projectName, vercelFiles, envMap, onLog, pct) {
  onLog('☁️ Creating Vercel deployment...');
  pct(60);

  const body = {
    name: projectName,
    files: vercelFiles,
    projectSettings: {
      framework: null,
      buildCommand: null,
      outputDirectory: null,
      installCommand: null,
    },
    target: 'production',
  };

  if (Object.keys(envMap).length > 0) {
    body.env = envMap;
  }

  const res = await fetch(`${VERCEL_API}/v13/deployments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err.error?.message || err.message || `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Vercel auth failed: ${msg}. Check your token at vercel.com/account/tokens`);
    }
    if (res.status === 400) {
      throw new Error(`Vercel rejected the deployment: ${msg}`);
    }
    if (res.status === 429) {
      throw new Error('Vercel rate limit reached. Wait a few minutes and try again.');
    }
    throw new Error(`Vercel deploy failed: ${msg}`);
  }

  const deployment = await res.json();
  onLog(`✓ Deployment created: ${deployment.id}`);
  if (deployment.url) onLog(`🔗 Preview: https://${deployment.url}`);
  pct(70);

  // Poll for ready state
  onLog('⏳ Building and deploying...');
  let attempts = 0;
  const maxAttempts = 120; // ~6 min at 3s intervals

  while (attempts < maxAttempts) {
    await sleep(3000);
    attempts++;

    let state;
    try {
      const poll = await fetch(`${VERCEL_API}/v13/deployments/${deployment.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!poll.ok) {
        if (attempts % 10 === 0) onLog(`⚠️ Status check returned ${poll.status}, retrying...`);
        continue;
      }
      state = await poll.json();
    } catch {
      continue; // Network blip, keep polling
    }

    if (state.readyState === 'READY') {
      onLog('✅ Deployment is live!');
      const finalUrl = state.url ? `https://${state.url}` : `https://${deployment.url}`;
      return { url: finalUrl, id: deployment.id, status: 'ready' };
    }

    if (state.readyState === 'ERROR') {
      const errMsg = state.errorMessage || 'Build or runtime error';
      throw new Error(`Vercel deployment failed: ${errMsg}`);
    }

    if (state.readyState === 'CANCELED') {
      throw new Error('Vercel deployment was canceled');
    }

    // Progress updates every 5 attempts (~15s)
    if (attempts % 5 === 0) {
      const elapsed = attempts * 3;
      onLog(`⏳ Building... (${elapsed}s) — status: ${state.readyState}`);
      pct(70 + Math.min(25, Math.round(elapsed / 12)));
    }
  }

  throw new Error('Vercel deployment timed out after 6 minutes. Check your Vercel dashboard for the deployment status.');
}

function uint8ToBase64(bytes) {
  let binary = '';
  const chunkSize = 32768;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
