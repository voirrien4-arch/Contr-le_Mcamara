// services/zip-parser.js — ZIP extraction, root stripping, auto-detection

export async function parseZip(file) {
  const JSZip = window.JSZip;
  if (!JSZip) throw new Error('JSZip library not loaded. Please refresh the page.');
  const zip = await JSZip.loadAsync(file);
  const entries = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    if (path.startsWith('__MACOSX/') || path.split('/').some(p => p.startsWith('._'))) continue;
    const content = await entry.async('uint8array');
    const text = isTextFile(path, content) ? new TextDecoder().decode(content) : null;
    entries.push({ path, content, size: content.length, text });
  }
  return stripRootDir(entries);
}

function isTextFile(path, content) {
  const exts = ['.js','.ts','.json','.html','.css','.md','.txt','.yml','.yaml','.toml','.cfg','.ini','.env','.sh','.py','.rb','.go','.rs','.java','.xml','.svg','.jsx','.tsx','.vue','.svelte','.lock','.conf','.rc','.mjs','.cjs','.php','.pl','.lua','.r','.dart','.kt','.swift','.c','.cpp','.h','.hpp','.cs'];
  const ext = '.' + path.split('.').pop().toLowerCase();
  if (exts.includes(ext)) return true;
  const check = content.slice(0, 8192);
  for (let i = 0; i < check.length; i++) { if (check[i] === 0) return false; }
  return true;
}

function stripRootDir(files) {
  if (files.length === 0) return files;
  const paths = files.map(f => f.path);
  const firstSegs = new Set(paths.map(p => p.split('/')[0]));
  if (firstSegs.size === 1 && paths.some(p => p.includes('/'))) {
    const root = [...firstSegs][0] + '/';
    const stripped = files.map(f => ({ ...f, path: f.path.slice(root.length) }));
    if (stripped.every(f => f.path.length > 0)) return stripped;
  }
  return files;
}

export function autoDetectProject(files) {
  const paths = files.map(f => f.path.toLowerCase());
  const result = { framework: null, runtime: 'node', buildCommand: '', startCommand: '', detectedType: null };
  const has = (p) => paths.includes(p);

  if (has('package.json')) {
    result.runtime = 'node';
    const pkg = files.find(f => f.path.toLowerCase() === 'package.json');
    if (pkg?.text) {
      try {
        const json = JSON.parse(pkg.text);
        const deps = { ...json.dependencies, ...json.devDependencies };
        if (deps['next']) { result.framework = 'nextjs'; result.detectedType = 'site'; }
        else if (deps['express'] || deps['fastify'] || deps['koa'] || deps['hono']) { result.detectedType = 'api'; }
        else if (deps['discord.js'] || deps['telegraf'] || deps['whatsapp-web.js'] || deps['grammy'] || deps['tmi.js']) { result.detectedType = 'bot'; }
        else if (deps['react'] || deps['vue'] || deps['svelte'] || deps['astro']) { result.detectedType = 'site'; }
        if (json.scripts?.build) result.buildCommand = 'npm run build';
        else result.buildCommand = 'npm install';
        if (json.scripts?.start) result.startCommand = 'npm start';
      } catch {}
    }
    if (!result.buildCommand) result.buildCommand = 'npm install';
    if (!result.startCommand) {
      for (const f of ['index.js','main.js','app.js','server.js','bot.js']) {
        if (has(f)) { result.startCommand = `node ${f}`; break; }
      }
    }
  } else if (paths.some(p => p === 'requirements.txt' || p === 'Pipfile' || p === 'pyproject.toml')) {
    result.runtime = 'python';
    result.buildCommand = 'pip install -r requirements.txt';
    for (const f of ['app.py','main.py','bot.py','server.py']) {
      if (has(f)) { result.startCommand = `python ${f}`; break; }
    }
  } else if (has('go.mod')) {
    result.runtime = 'go';
    result.buildCommand = 'go build -o app .';
    result.startCommand = './app';
  } else if (has('Dockerfile')) {
    result.runtime = 'docker';
  } else if (has('Procfile')) {
    const pf = files.find(f => f.path === 'Procfile');
    if (pf?.text) {
      const m = pf.text.match(/web:\s*(.+)/);
      if (m) result.startCommand = m[1].trim();
    }
  }
  if (has('index.html') && !has('package.json')) {
    result.detectedType = result.detectedType || 'site';
    result.runtime = 'static';
    result.buildCommand = '';
    result.startCommand = '';
  }
  return result;
}
