'use client';

import { useState } from 'react';
import SiteFooter from './SiteFooter';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role?: 'user' | 'admin';
}

interface AuthScreenProps {
  onAuthenticated: (user: AuthUser) => void;
}

export default function AuthScreen({ onAuthenticated }: AuthScreenProps) {
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
        throw new Error(data.error || 'Authentication failed');
      }

      onAuthenticated(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-950 text-white">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold">AI Chat</h1>
          <p className="mt-2 text-gray-400">Sign in to keep your chats and generated documents in MySQL.</p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-lg border border-gray-800 bg-gray-900 p-6">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-gray-800 p-1">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                mode === 'login' ? 'bg-white text-gray-950' : 'text-gray-300 hover:text-white'
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                mode === 'signup' ? 'bg-white text-gray-950' : 'text-gray-300 hover:text-white'
              }`}
            >
              Sign up
            </button>
          </div>

          {mode === 'signup' && (
            <label className="block">
              <span className="text-sm text-gray-300">Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-blue-500"
                autoComplete="name"
              />
            </label>
          )}

          <label className="block">
            <span className="text-sm text-gray-300">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-blue-500"
              autoComplete="email"
            />
          </label>

          <label className="block">
            <span className="text-sm text-gray-300">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-blue-500"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          {error && <div className="rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-200">{error}</div>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create account'}
          </button>
        </form>
        </div>
      </div>
      <SiteFooter variant="dark" compact />
    </div>
  );
}
