// main.js — App bootstrap with multi-user session support

import { getState, setState, subscribe } from './state.js';
import { loadSession, loadProjects, loadSettings, loadLogs, saveLogs } from './storage.js';
import { initToast } from './ui/toast-view.js';
import { renderSidebar } from './ui/sidebar-view.js';
import { renderAuth } from './ui/auth-view.js';
import { renderDashboard } from './ui/dashboard-view.js';
import { renderDeploy, resetDeploy } from './ui/deploy-view.js';
import { renderStatus } from './ui/status-view.js';
import { renderSettings } from './ui/settings-view.js';
import { renderLogs } from './ui/logs-view.js';
import { renderGithub, resetGithubView } from './ui/github-view.js';
import { renderAdmin, resetAdmin } from './ui/admin-view.js';
import { renderHelp } from './ui/help-view.js';

const sidebarContainer = document.getElementById('sidebar-container');
const mainContainer = document.getElementById('main-container');

const viewRenderers = {
  auth: renderAuth,
  dashboard: renderDashboard,
  deploy: renderDeploy,
  github: renderGithub,
  status: renderStatus,
  settings: renderSettings,
  logs: renderLogs,
  help: renderHelp,
  admin: renderAdmin,
};

let lastView = null;
let lastSidebarOpen = false;
let saveLogsTimer = null;

async function init() {
  initToast();
  try {
    const session = await loadSession();
    if (session && session.username) {
      const [projects, settings, logs] = await Promise.all([
        loadProjects(session.username),
        loadSettings(session.username),
        loadLogs(session.username),
      ]);
      setState({
        currentView: session.isAdmin ? 'admin' : 'dashboard',
        user: { username: session.username, isAdmin: !!session.isAdmin },
        projects,
        settings,
        logs,
      });
    } else {
      setState({ currentView: 'auth' });
    }
  } catch {
    setState({ currentView: 'auth' });
  }
  subscribe(render);
  render(getState());
}

function render(state) {
  const view = state.currentView;
  const viewChanged = view !== lastView;
  const sidebarToggled = state.sidebarOpen !== lastSidebarOpen;

  if (view === 'auth') {
    if (viewChanged && lastView !== null) {
      sidebarContainer.innerHTML = '';
      mainContainer.classList.remove('md:ml-64');
    }
    renderAuth(mainContainer);
  } else {
    // Entering non-auth view from auth → add margin
    if (lastView === 'auth' || lastView === null) {
      mainContainer.classList.add('md:ml-64');
    }
    // Re-render sidebar when view changes (nav highlight) or hamburger toggles (open/close)
    if (viewChanged || sidebarToggled) {
      renderSidebar(sidebarContainer);
    }
    // Render main content when view changes
    if (viewChanged) {
      const renderer = viewRenderers[view];
      if (renderer) renderer(mainContainer);
    }
  }

  lastView = view;
  lastSidebarOpen = state.sidebarOpen;

  // Debounce log persistence (max once per 2s)
  if (state.user?.username) {
    if (saveLogsTimer) clearTimeout(saveLogsTimer);
    saveLogsTimer = setTimeout(() => {
      saveLogs(state.user.username, state.logs).catch(() => {});
    }, 2000);
  }
}

init();
