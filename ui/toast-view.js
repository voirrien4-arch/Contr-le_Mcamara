let container;

export function initToast() {
  container = document.getElementById('toast-container');
}

export function showToast(message, type = 'info', duration = 4000) {
  if (!container) initToast();
  const colors = {
    success: 'bg-emerald-500/90 border-emerald-400',
    error: 'bg-red-500/90 border-red-400',
    warning: 'bg-amber-500/90 border-amber-400',
    info: 'bg-cyan-500/90 border-cyan-400',
  };
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const el = document.createElement('div');
  el.className = `${colors[type] || colors.info} border rounded-xl px-4 py-3 text-white text-sm font-medium shadow-lg flex items-center gap-2 transform translate-x-full transition-transform duration-300`;
  el.innerHTML = `<span class="text-lg">${icons[type] || icons.info}</span><span>${message}</span>`;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.remove('translate-x-full'));
  setTimeout(() => {
    el.classList.add('translate-x-full');
    setTimeout(() => el.remove(), 300);
  }, duration);
}
