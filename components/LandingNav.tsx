'use client';

import { useCallback, useEffect, useState } from 'react';
import { FiArrowRight } from 'react-icons/fi';
import { landingCopy, nextLocale } from '@/lib/i18n';
import { applyTheme, getPreferredTheme, persistTheme } from '@/lib/theme';
import { useLanguage } from './LanguageProvider';
import ThemeToggle from './ThemeToggle';
import WadiLogo from './WadiLogo';

const navItems = [
  { href: '/#hero', label: { en: 'Home', ar: 'الرئيسية' } },
  { href: '/#features', label: { en: 'About', ar: 'عن' } },
  { href: '/#how', label: { en: 'Resources', ar: 'الموارد' } },
  { href: '/#cta', label: { en: 'Plans', ar: 'الباقات' } },
];

export default function LandingNav() {
  const { locale, dir, setLocale } = useLanguage();
  const copy = landingCopy[locale];

  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const preferred = getPreferredTheme();
    setIsDarkMode(preferred === 'dark');
    applyTheme(preferred);
  }, []);

  const handleThemeChange = useCallback((isDark: boolean) => {
    const next = isDark ? 'dark' : 'light';
    setIsDarkMode(isDark);
    persistTheme(next);
    applyTheme(next);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header dir={dir} className={`minds-nav fixed inset-x-0 top-0 z-50 ${scrolled || menuOpen ? 'is-solid' : ''}`}>
      <div className="minds-nav-shell flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
        {/* Left: logo + desktop nav links */}
        <div className="flex min-w-0 items-center gap-3">
          <a href="/" className="minds-brand-pill" aria-label="Wadi home">
            <WadiLogo />
          </a>

          <nav className="minds-nav-pill hidden items-center lg:flex" aria-label="Primary navigation">
            {navItems.map((item) => (
              <a key={item.href} href={item.href} className="minds-nav-item">
                {item.label[locale]}
              </a>
            ))}
          </nav>
        </div>

        {/* Right: actions */}
        <div className="flex shrink-0 items-center justify-end gap-1.5">
          <a href="/chat" className="minds-action-pill hidden sm:inline-flex">
            {copy.nav.signIn}
          </a>
          <button
            type="button"
            onClick={() => setLocale(nextLocale(locale))}
            className="minds-action-pill minds-language-toggle hidden sm:inline-flex"
            aria-label="Switch language"
            dir="auto"
          >
            {copy.nav.language}
          </button>
          <ThemeToggle
            isDark={isDarkMode}
            onChange={handleThemeChange}
            className="minds-action-pill minds-theme-toggle hidden sm:inline-flex"
          />
          <a href="/chat" className="minds-action-pill minds-action-primary hidden min-[520px]:inline-flex">
            <span aria-hidden="true" className="minds-arrow">
              <FiArrowRight />
            </span>
            {copy.nav.launch}
          </a>
          <button
            type="button"
            className="minds-menu-button lg:hidden"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className={`minds-menu-line ${menuOpen ? 'is-open' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <div className={`minds-mobile-menu lg:hidden ${menuOpen ? 'is-open' : ''}`}>
        <nav className="mx-4 rounded-[28px] border border-black/10 bg-white/92 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.16)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#101413]/94">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className="block rounded-full px-5 py-3 text-base font-black text-black hover:bg-black/5 dark:text-white dark:hover:bg-white/8"
            >
              {item.label[locale]}
            </a>
          ))}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <a
              href="/chat"
              onClick={() => setMenuOpen(false)}
              className="rounded-full bg-black/[0.04] px-5 py-3 text-center text-base font-black dark:bg-white/8 dark:text-white"
            >
              {copy.nav.signIn}
            </a>
            <button
              type="button"
              onClick={() => {
                setLocale(nextLocale(locale));
                setMenuOpen(false);
              }}
              className="rounded-full bg-black/[0.04] px-5 py-3 text-center text-base font-black dark:bg-white/8 dark:text-white"
              dir="auto"
            >
              {copy.nav.language}
            </button>
            <ThemeToggle
              isDark={isDarkMode}
              onChange={handleThemeChange}
              className="flex min-h-[48px] items-center justify-center rounded-full bg-black/[0.04] px-5 py-3 text-center text-base font-black dark:bg-white/8 dark:text-white"
            />
            <a
              href="/chat"
              onClick={() => setMenuOpen(false)}
              className="rounded-full bg-[#1C7178] px-5 py-3 text-center text-base font-black text-white"
            >
              {copy.nav.launch}
            </a>
          </div>
        </nav>
      </div>
    </header>
  );
}
