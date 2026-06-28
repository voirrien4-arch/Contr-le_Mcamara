// storage-shim.js — Polyfill for miniappsAI.storage using localStorage
// This allows the app to run standalone (e.g. on Render) without the miniappsAI platform

(function () {
  if (window.miniappsAI && window.miniappsAI.storage) return;

  window.miniappsAI = window.miniappsAI || {};
  window.miniappsAI.storage = {
    async getItem(key) {
      return localStorage.getItem(key);
    },
    async setItem(key, value) {
      localStorage.setItem(key, value);
    },
    async removeItem(key) {
      localStorage.removeItem(key);
    },
  };
})();
