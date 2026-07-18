'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FiArrowRight, FiChevronDown } from 'react-icons/fi';
import { landingCopy, nextLocale } from '@/lib/i18n';
import { applyTheme, getPreferredTheme, persistTheme } from '@/lib/theme';
import { useLanguage } from './LanguageProvider';
import ThemeToggle from './ThemeToggle';
import WadiLogo from './WadiLogo';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
}

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
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Fetch auth state on mount
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data?.user) setUser(data.user); })
      .catch(() => {});
  }, []);

  // Close user dropdown when clicking outside
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

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

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setUserMenuOpen(false);
    window.location.href = '/';
  };

  // User initial avatar letter
  const userInitial = user?.name?.charAt(0)?.toUpperCase() ?? '?';

  // Build dropdown links based on role
  const userLinks = user ? [
    { href: '/chat', label: copy.nav.userChat, icon: '💬' },
    { href: '/api-console', label: copy.nav.userApiConsole, icon: '🔑' },
    { href: '/docs/api', label: copy.nav.userDocs, icon: '📄' },
    ...(user.role === 'admin' ? [{ href: '/admin', label: copy.nav.userAdmin, icon: '⚙️' }] : []),
  ] : [];

  return (
    <header dir={dir} className={`minds-nav fixed inset-x-0 top-0 z-50 ${scrolled || menuOpen ? 'is-solid' : ''}`}>
      <div className="minds-nav-shell flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
        {/* Left: logo + desktop nav links */}
        <div className="flex min-w-0 items-center gap-3">
          <a href="/" className="minds-brand-pill" aria-label="Wadi home">
            <WadiLogo showText={false} className="sm:hidden" />
            <WadiLogo className="hidden sm:inline-flex" />
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
          {user ? (
            /* ── Logged-in: user dropdown ── */
            <div className="relative hidden sm:block" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                className="minds-action-pill flex items-center gap-2"
                aria-expanded={userMenuOpen}
                aria-haspopup="true"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1C7178] text-[11px] font-black text-white">
                  {userInitial}
                </span>
                <span className="max-w-[96px] truncate font-black">{user.name}</span>
                <FiChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {userMenuOpen && (
                <div className="absolute top-full mt-2 w-52 rounded-2xl border border-black/10 bg-white/95 py-2 shadow-[0_24px_60px_rgba(0,0,0,0.14)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#101413]/96" style={{ insetInlineEnd: 0 }}>
                  <div className="border-b border-black/8 px-4 pb-2.5 pt-1 dark:border-white/8">
                    <p className="text-sm font-black text-black dark:text-white">{user.name}</p>
                    <p className="text-xs font-bold text-black/48 dark:text-white/48">{user.email}</p>
                  </div>
                  <div className="py-1">
                    {userLinks.map((link) => (
                      <a key={link.href} href={link.href} onClick={() => setUserMenuOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm font-black text-black/80 transition-colors hover:bg-black/[0.04] hover:text-[#1C7178] dark:text-white/80 dark:hover:bg-white/6 dark:hover:text-[#8fcfd3]">
                        <span className="text-base" aria-hidden="true">{link.icon}</span>
                        {link.label}
                      </a>
                    ))}
                  </div>
                  <div className="border-t border-black/8 pt-1 dark:border-white/8">
                    <button type="button" onClick={handleLogout} className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-black text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30">
                      <span className="text-base" aria-hidden="true">🚪</span>
                      {copy.nav.userLogout}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <a href="/chat" className="minds-action-pill hidden sm:inline-flex">
              {copy.nav.signIn}
            </a>
          )}

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
          {!user && (
            <a href="/chat" className="minds-action-pill minds-action-primary hidden min-[520px]:inline-flex">
              <span aria-hidden="true" className="minds-arrow"><FiArrowRight /></span>
              {copy.nav.launch}
            </a>
          )}

          {/* Hamburger — visible below lg on desktop, always on mobile */}
          <button
            type="button"
            className="minds-menu-button"
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

          {user ? (
            /* Mobile: logged-in links */
            <>
              <div className="mx-2 mt-2 border-t border-black/8 pt-2 dark:border-white/8">
                <div className="px-3 pb-1.5">
                  <p className="text-sm font-black text-black dark:text-white">{user.name}</p>
                  <p className="text-xs font-bold text-black/48 dark:text-white/48">{user.email}</p>
                </div>
                {userLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 rounded-full px-5 py-3 text-base font-black text-black hover:bg-black/5 dark:text-white dark:hover:bg-white/8"
                  >
                    <span aria-hidden="true">{link.icon}</span>
                    {link.label}
                  </a>
                ))}
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); handleLogout(); }}
                  className="flex w-full items-center gap-3 rounded-full px-5 py-3 text-base font-black text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/20"
                >
                  <span aria-hidden="true">🚪</span>
                  {copy.nav.userLogout}
                </button>
              </div>
            </>
          ) : (
            /* Mobile: logged-out */
            <div className="mt-2 grid grid-cols-2 gap-2">
              <a
                href="/chat"
                onClick={() => setMenuOpen(false)}
                className="rounded-full bg-black/[0.04] px-5 py-3 text-center text-base font-black dark:bg-white/8 dark:text-white"
              >
                {copy.nav.signIn}
              </a>
              <a
                href="/chat"
                onClick={() => setMenuOpen(false)}
                className="rounded-full bg-[#1C7178] px-5 py-3 text-center text-base font-black text-white"
              >
                {copy.nav.launch}
              </a>
            </div>
          )}

          <div className="mt-2 grid grid-cols-2 gap-2">
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
          </div>
        </nav>
      </div>
    </header>
  );
}
