'use client';

import { useState } from 'react';
import { nextLocale } from '@/lib/i18n';
import { useLanguage } from './LanguageProvider';
import WadiLogo from './WadiLogo';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role?: 'user' | 'admin';
}

interface AuthScreenProps {
  onAuthenticated: (user: AuthUser) => void;
}

const authCopy = {
  en: {
    title: 'User Access',
    login: 'Sign In',
    signup: 'Register',
    google: 'Continue with Google',
    divider: 'Or continue with',
    name: 'Name',
    namePlaceholder: 'Enter your name',
    email: 'Email address',
    emailPlaceholder: 'Enter your email',
    password: 'Password',
    passwordPlaceholder: 'Enter your password',
    forgot: 'Forgot password?',
    wait: 'Please wait...',
    create: 'Create account',
    submitLogin: 'Sign in',
    cancel: 'Cancel',
    genericError: 'Authentication failed',
    switchLanguage: 'العربية',
  },
  ar: {
    title: 'وصول المستخدم',
    login: 'تسجيل الدخول',
    signup: 'إنشاء حساب',
    google: 'المتابعة باستخدام Google',
    divider: 'أو تابع باستخدام',
    name: 'الاسم',
    namePlaceholder: 'أدخل اسمك',
    email: 'البريد الإلكتروني',
    emailPlaceholder: 'أدخل بريدك الإلكتروني',
    password: 'كلمة المرور',
    passwordPlaceholder: 'أدخل كلمة المرور',
    forgot: 'نسيت كلمة المرور؟',
    wait: 'يرجى الانتظار...',
    create: 'إنشاء الحساب',
    submitLogin: 'تسجيل الدخول',
    cancel: 'إلغاء',
    genericError: 'فشلت عملية المصادقة',
    switchLanguage: 'English',
  },
} as const;

export default function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const { locale, dir, setLocale } = useLanguage();
  const copy = authCopy[locale];
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || copy.genericError);
      }

      onAuthenticated(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.genericError);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#fbfbfa] text-[#050505]" dir={dir}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,rgba(231,245,246,0.9),transparent_34%),radial-gradient(circle_at_18%_22%,rgba(143,207,211,0.12),transparent_30%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(28,113,120,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(28,113,120,0.035)_1px,transparent_1px)] [background-size:52px_52px]" />

      <header className="absolute inset-x-0 top-0 z-20 flex justify-end px-4 py-5 sm:px-6">
        <button
          type="button"
          onClick={() => setLocale(nextLocale(locale))}
          className="rounded-full border border-black/10 bg-white/70 px-4 py-2 text-sm font-black text-[#1C7178] shadow-sm backdrop-blur-xl transition hover:bg-white"
          dir="auto"
        >
          {copy.switchLanguage}
        </button>
      </header>

      <main className="relative z-10 grid min-h-screen place-items-center px-4 py-16">
        <section className="flex min-h-[720px] w-full max-w-[450px] flex-col justify-center rounded-[22px] border border-black bg-white/74 px-4 py-8 shadow-[0_28px_100px_rgba(28,113,120,0.1)] backdrop-blur-xl sm:px-5">
          <div className="flex flex-col items-center text-center">
            <WadiLogo className="auth-logo" showText={false} />
            <h1 className="mt-8 text-3xl font-black leading-tight sm:text-4xl">{copy.title}</h1>
          </div>

          <div className="mt-6 rounded-full bg-black/[0.04] p-1">
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={`rounded-full px-4 py-2.5 text-sm font-black transition ${
                  mode === 'login' ? 'border border-black bg-white shadow-sm' : 'text-black/70 hover:bg-white/60'
                }`}
              >
                {copy.login}
              </button>
              <button
                type="button"
                onClick={() => setMode('signup')}
                className={`rounded-full px-4 py-2.5 text-sm font-black transition ${
                  mode === 'signup' ? 'border border-black bg-white shadow-sm' : 'text-black/70 hover:bg-white/60'
                }`}
              >
                {copy.signup}
              </button>
            </div>
          </div>

          <button
            type="button"
            className="mt-6 flex w-full items-center justify-center gap-3 rounded-full border border-black bg-white/80 px-4 py-3 text-sm font-black text-black transition hover:bg-white"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z" />
            </svg>
            {copy.google}
          </button>

          <div className="mt-6 flex items-center gap-3 text-xs font-bold text-black/58">
            <span className="h-px flex-1 bg-black/30" />
            <span>{copy.divider}</span>
            <span className="h-px flex-1 bg-black/30" />
          </div>

          <form onSubmit={submit} className="mt-6">
            <div className="space-y-5">
              {mode === 'signup' && (
                <label className="block">
                  <span className="text-sm font-black text-black">{copy.name}</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={copy.namePlaceholder}
                    className="auth-input mt-1.5 w-full rounded-full border border-black bg-white/90 px-4 py-3 outline-none transition focus:ring-4 focus:ring-[#1C7178]/10"
                    autoComplete="name"
                  />
                </label>
              )}

              <label className="block">
                <span className="text-sm font-black text-black">{copy.email}</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={copy.emailPlaceholder}
                  className="auth-input mt-1.5 w-full rounded-full border border-black bg-white/90 px-4 py-3 outline-none transition focus:ring-4 focus:ring-[#1C7178]/10"
                  autoComplete="email"
                />
              </label>

              <label className="block">
                <span className="flex items-center justify-between gap-3 text-sm font-black text-black">
                  {copy.password}
                  {mode === 'login' && <span className="text-xs font-bold text-black/48">{copy.forgot}</span>}
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={copy.passwordPlaceholder}
                  className="auth-input mt-1.5 w-full rounded-full border border-black bg-white/90 px-4 py-3 outline-none transition focus:ring-4 focus:ring-[#1C7178]/10"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </label>

              {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</div>}
            </div>

            <div className="mt-8 border-t border-black pt-5">
              <div className="flex items-center justify-between gap-3">
                <a
                  href="/"
                  className="rounded-full bg-black/[0.04] px-5 py-2.5 text-sm font-black text-black transition hover:bg-black/[0.08]"
                >
                  {copy.cancel}
                </a>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-full bg-[#1C7178] px-6 py-2.5 text-sm font-black text-white transition hover:bg-[#15565c] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? copy.wait : mode === 'login' ? copy.submitLogin : copy.create}
                </button>
              </div>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
