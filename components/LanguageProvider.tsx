'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getBrowserLocale, localeDirections, Locale } from '@/lib/i18n';

type LanguageContextValue = {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  setLocale: (locale: Locale) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    setLocaleState(getBrowserLocale());
  }, []);

  const setLocale = (nextLocale: Locale) => {
    setLocaleState(nextLocale);
    window.localStorage.setItem('wadi-locale', nextLocale);
    document.cookie = `wadi-locale=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
  };

  const dir = localeDirections[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
    document.body.dataset.locale = locale;
  }, [dir, locale]);

  const value = useMemo(() => ({ locale, dir, setLocale }), [dir, locale]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) {
    throw new Error('useLanguage must be used inside LanguageProvider');
  }
  return value;
}
