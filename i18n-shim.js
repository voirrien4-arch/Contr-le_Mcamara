// i18n-shim.js — Load translations from locale files when miniappI18n platform is not available
// This provides the t() function for standalone deployment

(function () {
  if (window.miniappI18n) return;

  let catalog = {};
  let loaded = false;

  async function loadLocale(lang) {
    try {
      const res = await fetch(`/locales/${lang}.json`);
      if (res.ok) catalog = await res.json();
    } catch {}
    loaded = true;
  }

  function flatten(obj, prefix = '') {
    const result = {};
    for (const [key, val] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof val === 'object' && val !== null) {
        Object.assign(result, flatten(val, fullKey));
      } else {
        result[fullKey] = val;
      }
    }
    return result;
  }

  // Detect browser language
  const browserLang = navigator.language || 'en';
  const lang = browserLang.startsWith('fr') ? 'fr' : 'en';

  window.miniappI18n = {
    _flat: {},
    t(key, values) {
      let str = this._flat[key] ?? key;
      if (values) {
        for (const [k, v] of Object.entries(values)) {
          str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
        }
      }
      return str;
    },
    getContext() {
      return { resolvedLocale: lang, dir: 'ltr', availableLocales: ['en', 'fr'], canChangeLocale: true };
    },
    setLocale(code) {
      loadLocale(code).then(() => {
        this._flat = flatten(catalog);
        document.querySelectorAll('[data-i18n]').forEach(el => {
          el.textContent = this.t(el.getAttribute('data-i18n'));
        });
      });
    },
  };

  loadLocale(lang).then(() => {
    window.miniappI18n._flat = flatten(catalog);
    // Update any pre-rendered data-i18n elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = window.miniappI18n.t(el.getAttribute('data-i18n'));
    });
  });
})();
