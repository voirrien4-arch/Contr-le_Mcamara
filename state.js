const state = {
  currentView: 'auth',
  user: null,        // { username, isAdmin } or null
  projects: [],      // current user's projects
  settings: { renderApiKey: '', vercelToken: '', githubToken: '' },
  logs: [],          // current user's logs
  sidebarOpen: false,
};

const listeners = new Set();

export function getState() {
  return state;
}

export function setState(patch) {
  Object.assign(state, patch);
  listeners.forEach(fn => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function addLog(entry) {
  const log = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    ...entry,
  };
  state.logs.unshift(log);
  if (state.logs.length > 200) state.logs.length = 200;
  listeners.forEach(fn => fn(state));
  return log;
}
