'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LOCALE, getBrowserLocale, localeDirections, Locale, LOCALE_COOKIE } from '@/lib/i18n';

type LanguageContextValue = {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  setLocale: (locale: Locale) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [isClientLocaleResolved, setIsClientLocaleResolved] = useState(false);

  useEffect(() => {
    const browserLocale = getBrowserLocale();
    setLocaleState(browserLocale);
    window.localStorage.setItem(LOCALE_COOKIE, browserLocale);
    document.cookie = `${LOCALE_COOKIE}=${browserLocale}; path=/; max-age=31536000; samesite=lax`;
    setIsClientLocaleResolved(true);
  }, []);

  const setLocale = (nextLocale: Locale) => {
    setLocaleState(nextLocale);
    window.localStorage.setItem(LOCALE_COOKIE, nextLocale);
    document.cookie = `${LOCALE_COOKIE}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
  };

  const dir = localeDirections[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
    document.body.dataset.locale = locale;
    if (isClientLocaleResolved) {
      document.documentElement.removeAttribute('data-locale-mismatch');
    }
  }, [dir, isClientLocaleResolved, locale]);

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
