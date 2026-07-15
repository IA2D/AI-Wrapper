import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import 'katex/dist/katex.min.css';
import '@xyflow/react/dist/style.css';
import './globals.css';
import { LanguageProvider } from '@/components/LanguageProvider';
import {
  DEFAULT_LOCALE,
  getLocaleFromCookieValue,
  LEGACY_LOCALE_COOKIE,
  LOCALE_COOKIE,
  localeDirections,
  type Locale,
} from '@/lib/i18n';
import { getThemeFromCookieValue, THEME_COOKIE, THEME_STORAGE_KEY, type ThemeMode } from '@/lib/theme';

export const metadata: Metadata = {
  title: 'Wadi AI',
  description: 'Bilingual AI chat, documents, and developer API endpoints powered by accessible models.',
};

function localeBootstrapScript(initialLocale: Locale) {
  return `(function(){try{var initial=${JSON.stringify(initialLocale)};var locale=null;try{locale=window.localStorage.getItem('wadi-locale')||window.localStorage.getItem('aicrab-locale')}catch(e){}if(locale!=='en'&&locale!=='ar'){var match=document.cookie.match(/(?:^|; )wadi-locale=(en|ar)(?:;|$)/)||document.cookie.match(/(?:^|; )aicrab-locale=(en|ar)(?:;|$)/);locale=match?match[1]:null}if(locale!=='en'&&locale!=='ar'){locale=(navigator.language||'').toLowerCase().indexOf('ar')===0?'ar':'en'}document.documentElement.lang=locale;document.documentElement.dir=locale==='ar'?'rtl':'ltr';document.documentElement.dataset.clientLocale=locale;if(document.body){document.body.dataset.locale=locale}if(locale!==initial){document.documentElement.dataset.localeMismatch='true'}document.cookie='wadi-locale='+locale+'; path=/; max-age=31536000; samesite=lax'}catch(e){}})();`;
}

function themeBootstrapScript(initialTheme: ThemeMode | null) {
  return `(function(){try{var theme=null;try{theme=window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})}catch(e){}if(theme!=='light'&&theme!=='dark'){var match=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark)(?:;|$)/);theme=match?match[1]:null}if(theme!=='light'&&theme!=='dark'){theme=${initialTheme ? JSON.stringify(initialTheme) : 'null'}}if(theme!=='light'&&theme!=='dark'){theme=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.classList.toggle('dark',theme==='dark');document.documentElement.dataset.theme=theme;document.cookie='${THEME_COOKIE}='+theme+'; path=/; max-age=31536000; samesite=lax'}catch(e){}})();`;
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const initialLocale =
    getLocaleFromCookieValue(cookieStore.get(LOCALE_COOKIE)?.value) ??
    getLocaleFromCookieValue(cookieStore.get(LEGACY_LOCALE_COOKIE)?.value) ??
    DEFAULT_LOCALE;
  const initialTheme = getThemeFromCookieValue(cookieStore.get(THEME_COOKIE)?.value);
  const initialDir = localeDirections[initialLocale];

  return (
    <html
      lang={initialLocale}
      dir={initialDir}
      className={initialTheme === 'dark' ? 'dark' : undefined}
      data-theme={initialTheme ?? undefined}
      suppressHydrationWarning
    >
      <body data-locale={initialLocale} suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: localeBootstrapScript(initialLocale) }} />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript(initialTheme) }} />
        <LanguageProvider initialLocale={initialLocale}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
