import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { translations } from '../i18n/translations.js';

const LanguageContext = createContext(null);
const STORAGE_KEY = 'luna_lang';
const RTL_LANGS = new Set(['ar']);

function applyDocumentDirection(lang) {
  const dir = RTL_LANGS.has(lang) ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
  document.documentElement.dir = dir;
  return dir;
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem(STORAGE_KEY) || 'ar');
  const [dir, setDir] = useState(() => (RTL_LANGS.has(lang) ? 'rtl' : 'ltr'));

  useEffect(() => { setDir(applyDocumentDirection(lang)); }, [lang]);

  const setLang = useCallback((next) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLangState(next);
  }, []);

  const toggleLang = useCallback(() => setLang(lang === 'ar' ? 'en' : 'ar'), [lang, setLang]);

  // t(key, vars?) — looks up the key in the current language, falls back to
  // Arabic (the site's base language) if a key is somehow missing, and
  // finally falls back to the key itself so a missing translation is
  // visibly obvious in development rather than silently blank.
  const t = useCallback(
    (key, vars) => {
      let str = translations[lang]?.[key] ?? translations.ar?.[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, v);
      }
      return str;
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, dir, setLang, toggleLang, t }), [lang, dir, setLang, toggleLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}
