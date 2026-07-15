'use client';

import { useEffect, useMemo, useState } from 'react';
import ThemeToggle from './ThemeToggle';

type Tab = 'users' | 'apiUsage' | 'apiKeys' | 'models' | 'docs';
type Period = 'day' | 'week' | 'month' | 'year';
type LimitMode = 'unlimited' | 'requests' | 'tokens' | 'date';
type AIProvider = 'openai' | 'anthropic' | 'gemini' | 'perplexity' | 'openai-compatible';
type CapabilityPatch = Partial<Pick<ApiKey, 'allowText' | 'allowImage' | 'allowVideo' | 'allowVoice'>>;

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
}

interface SummaryUser extends AdminUser {
  createdAt: string;
  requests: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  lastUsedAt: string | null;
}

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  status: 'active' | 'disabled';
  allowText: boolean;
  allowImage: boolean;
  allowVideo: boolean;
  allowVoice: boolean;
  limitPeriod: Period;
  requestLimit: number | null;
  tokenLimit: number | null;
  unlimitedUntil: string | null;
  assignedUserId: string | null;
  assignedUserName?: string | null;
  assignedUserEmail?: string | null;
  canRevealToken: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  // Virtual field for updates - tells backend which limitation mode to use
  limitMode?: 'unlimited' | 'requests' | 'tokens' | 'date';
}

interface ApiUsage {
  apiKeyId: string | null;
  name: string | null;
  keyPrefix: string | null;
  requests: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  lastUsedAt: string | null;
}

interface RecentEvent {
  id: string;
  source: string;
  capability: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string | null;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
  apiKeyName: string | null;
  keyPrefix: string | null;
}

interface Summary {
  users: SummaryUser[];
  apiKeys: ApiKey[];
  apiUsage: ApiUsage[];
  recentEvents: RecentEvent[];
}

interface AIModel {
  id: string;
  label: string;
  provider: AIProvider;
  model: string;
  endpoint: string;
  status: 'active' | 'disabled';
  isDefault: boolean;
  supportsText: boolean;
  supportsImage: boolean;
  supportsVoice: boolean;
  supportsJson: boolean;
  hasApiKey: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ModelUserLimit {
  id: string;
  userId: string;
  modelConfigId: string;
  limitPeriod: Period;
  requestLimit: number | null;
  tokenLimit: number | null;
}

interface UserDetail {
  user: AdminUser & { createdAt: string };
  totals: {
    requests: number;
    tokens: number;
    inputTokens: number;
    outputTokens: number;
  };
  daily: Array<{
    day: string;
    requests: number;
    tokens: number;
    inputTokens: number;
    outputTokens: number;
  }>;
  events: Array<{
    id: string;
    source: string;
    capability: string;
    requestCount: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    model: string | null;
    createdAt: string;
  }>;
}

const emptySummary: Summary = {
  users: [],
  apiKeys: [],
  apiUsage: [],
  recentEvents: [],
};

const capabilityFields = [
  ['allowText', 'Text'],
  ['allowImage', 'Image'],
  ['allowVideo', 'Video'],
  ['allowVoice', 'Voice'],
] as const;

const modelCapabilityFields = [
  ['supportsText', 'Text'],
  ['supportsImage', 'Image'],
  ['supportsVoice', 'Voice'],
  ['supportsJson', 'JSON'],
] as const;

const providerDefaults: Record<AIProvider, { endpoint: string; model: string }> = {
  openai: { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4.1-mini' },
  anthropic: { endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-3-5-sonnet-latest' },
  gemini: { endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-1.5-pro' },
  perplexity: { endpoint: 'https://api.perplexity.ai/chat/completions', model: 'sonar-pro' },
  'openai-compatible': { endpoint: '', model: '' },
};

function numberFormat(value: number) {
  return new Intl.NumberFormat('en-US').format(value || 0);
}

function dateFormat(value: string | null) {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function AdminDashboard({ admin }: { admin: AdminUser }) {
  const [tab, setTab] = useState<Tab>('users');
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [models, setModels] = useState<AIModel[]>([]);
  const [modelLimits, setModelLimits] = useState<ModelUserLimit[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [keyForm, setKeyForm] = useState({
    name: '',
    allowText: true,
    allowImage: false,
    allowVideo: false,
    allowVoice: false,
    limitMode: 'unlimited' as LimitMode,
    limitPeriod: 'month' as Period,
    requestLimit: '',
    tokenLimit: '',
    unlimitedUntil: '',
    assignedUserId: '',
  });
  const [modelForm, setModelForm] = useState({
    label: '',
    provider: 'openai-compatible' as AIProvider,
    model: '',
    endpoint: '',
    apiKey: '',
    isDefault: false,
    supportsText: true,
    supportsImage: false,
    supportsVoice: false,
    supportsJson: true,
  });
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    role: 'user' as 'user' | 'admin',
    password: '',
  });
  const [isDarkMode, setIsDarkMode] = useState(false);

  const totals = useMemo(() => {
    return summary.users.reduce(
      (acc, user) => ({
        users: acc.users + 1,
        requests: acc.requests + user.requests,
        tokens: acc.tokens + user.tokens,
      }),
      { users: 0, requests: 0, tokens: 0 }
    );
  }, [summary.users]);

  const loadSummary = async () => {
    setError(null);
    const response = await fetch('/api/admin/summary');
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Failed to load admin summary');
    setSummary(data);
  };

  const loadModels = async () => {
    const response = await fetch('/api/admin/models');
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Failed to load models');
    setModels(data.models || []);
  };

  const loadModelLimits = async () => {
    const response = await fetch('/api/admin/model-limits');
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Failed to load model limits');
    setModelLimits(data.limits || []);
  };

  useEffect(() => {
    Promise.all([loadSummary(), loadModels(), loadModelLimits()])
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load admin summary'))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setIsDarkMode(prefersDark);
    if (prefersDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const handleThemeChange = (isDark: boolean) => {
    setIsDarkMode(isDark);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  useEffect(() => {
    if (!selectedUserId) {
      setUserDetail(null);
      return;
    }

    fetch(`/api/admin/users/${selectedUserId}/usage`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Failed to load user usage');
        setUserDetail(data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load user usage'));
  }, [selectedUserId]);

  useEffect(() => {
    if (!userDetail) return;
    setUserForm({
      name: userDetail.user.name,
      email: userDetail.user.email,
      role: userDetail.user.role,
      password: '',
    });
  }, [userDetail]);

  const createKey = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setCreatedToken(null);

    const response = await fetch('/api/admin/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...keyForm,
        requestLimit: keyForm.requestLimit || null,
        tokenLimit: keyForm.tokenLimit || null,
        unlimitedUntil: keyForm.unlimitedUntil || null,
      }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(data.error || 'Failed to create API key');
      return;
    }

    setCreatedToken(data.token);
    setKeyForm((current) => ({ ...current, name: '' }));
    await loadSummary();
  };

  const updateKey = async (id: string, patch: Partial<ApiKey>) => {
    setError(null);
    const response = await fetch(`/api/admin/api-keys/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || 'Failed to update API key');
      return;
    }
    await loadSummary();
  };

  const deleteKey = async (id: string) => {
    if (!confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
      return;
    }
    setError(null);
    const response = await fetch(`/api/admin/api-keys/${id}`, {
      method: 'DELETE',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || 'Failed to delete API key');
      return;
    }
    await loadSummary();
  };

  const updateUser = async () => {
    if (!userDetail) return;
    setError(null);
    const response = await fetch(`/api/admin/users/${userDetail.user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userForm),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || 'Failed to update user');
      return;
    }
    setUserForm((current) => ({ ...current, password: '' }));
    await loadSummary();
    setSelectedUserId(userDetail.user.id);
  };

  const deleteUser = async (userId: string) => {
    if (!window.confirm('Delete this account and its owned chat data? API key assignments will be removed.')) return;
    setError(null);
    const response = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || 'Failed to delete user');
      return;
    }
    setSelectedUserId(null);
    await loadSummary();
  };

  const createModel = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const response = await fetch('/api/admin/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(modelForm),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || 'Failed to create model');
      return;
    }
    setModelForm((current) => ({ ...current, label: '', apiKey: '' }));
    await loadModels();
  };

  const updateModel = async (id: string, patch: Partial<AIModel> & { apiKey?: string }) => {
    setError(null);
    const response = await fetch(`/api/admin/models/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || 'Failed to update model');
      return;
    }
    await loadModels();
  };

  const saveModelLimit = async (input: {
    userId: string;
    modelConfigId: string;
    limitPeriod: Period;
    requestLimit: number | null;
    tokenLimit: number | null;
  }) => {
    setError(null);
    const response = await fetch('/api/admin/model-limits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || 'Failed to save model limit');
      return;
    }
    await loadModelLimits();
  };

  const deleteModel = async (id: string) => {
    if (!confirm('Delete this model configuration?')) return;
    setError(null);
    const response = await fetch(`/api/admin/models/${id}`, { method: 'DELETE' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || 'Failed to delete model');
      return;
    }
    await loadModels();
  };

  return (
    <main className="min-h-screen bg-gray-50 text-gray-950 dark:bg-gray-950 dark:text-white">
      <header className="border-b border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Admin Dashboard</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{admin.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle isDark={isDarkMode} onChange={handleThemeChange} />
            <a
              href="/chat"
              className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Chat
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        )}

        <section className="mb-5 grid gap-3 md:grid-cols-3">
          <Metric label="Users" value={numberFormat(totals.users)} />
          <Metric label="Requests" value={numberFormat(totals.requests)} />
          <Metric label="Tokens" value={numberFormat(totals.tokens)} />
        </section>

        <nav className="mb-5 flex flex-wrap gap-2">
          {[
            ['users', 'Users'],
            ['apiUsage', 'API Usage'],
            ['apiKeys', 'API Keys'],
            ['models', 'Models'],
            ['docs', 'Docs'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id as Tab)}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                tab === id
                  ? 'bg-teal-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {isLoading ? (
          <div className="rounded-lg bg-white p-6 text-sm text-gray-500 dark:bg-gray-900 dark:text-gray-400">Loading...</div>
        ) : (
          <>
            {tab === 'users' && (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
                <Panel title="Users">
                  <DataTable
                    headers={['Name', 'Role', 'Keys', 'Requests', 'Tokens', 'Actions']}
                    rows={summary.users.map((user) => [
                      <button key="name" onClick={() => setSelectedUserId(user.id)} className="text-left font-medium text-teal-600 hover:underline dark:text-teal-300">
                        {user.name}<span className="block text-xs font-normal text-gray-500">{user.email}</span>
                      </button>,
                      user.role,
                      summary.apiKeys.filter((key) => key.assignedUserId === user.id).length,
                      numberFormat(user.requests),
                      numberFormat(user.tokens),
                      <div key="actions" className="flex flex-wrap gap-2">
                        <button onClick={() => setSelectedUserId(user.id)} className="rounded bg-teal-50 px-2 py-1 text-xs font-medium text-teal-700 dark:bg-teal-950 dark:text-teal-200">Edit</button>
                        {user.id !== admin.id && (
                          <button onClick={() => deleteUser(user.id)} className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-200">Delete</button>
                        )}
                      </div>,
                    ])}
                  />
                </Panel>

                <Panel title={userDetail ? userDetail.user.name : 'User Detail'}>
                  {!userDetail ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Select a user to inspect daily usage and recent requests.</p>
                  ) : (
                    <div className="space-y-5">
                      <div className="grid grid-cols-2 gap-2">
                        <Metric label="Requests" value={numberFormat(userDetail.totals.requests)} compact />
                        <Metric label="Tokens" value={numberFormat(userDetail.totals.tokens)} compact />
                      </div>
                      <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                        <h3 className="mb-3 text-sm font-semibold">Account</h3>
                        <div className="grid gap-3">
                          <input
                            value={userForm.name}
                            onChange={(event) => setUserForm({ ...userForm, name: event.target.value })}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                            placeholder="Name"
                          />
                          <input
                            value={userForm.email}
                            onChange={(event) => setUserForm({ ...userForm, email: event.target.value })}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                            placeholder="Email"
                          />
                          <select
                            value={userForm.role}
                            onChange={(event) => setUserForm({ ...userForm, role: event.target.value as 'user' | 'admin' })}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                          >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                          </select>
                          <input
                            type="password"
                            value={userForm.password}
                            onChange={(event) => setUserForm({ ...userForm, password: event.target.value })}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                            placeholder="New password, optional"
                          />
                          <div className="flex gap-2">
                            <button onClick={updateUser} className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-500">Save account</button>
                            {userDetail.user.id !== admin.id && (
                              <button onClick={() => deleteUser(userDetail.user.id)} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500">Delete</button>
                            )}
                          </div>
                        </div>
                      </div>
                      <div>
                        <h3 className="mb-2 text-sm font-semibold">Assigned API Keys</h3>
                        <div className="space-y-2">
                          {summary.apiKeys.filter((key) => key.assignedUserId === userDetail.user.id).length === 0 ? (
                            <p className="text-sm text-gray-500">No keys assigned.</p>
                          ) : summary.apiKeys.filter((key) => key.assignedUserId === userDetail.user.id).map((key) => (
                            <div key={key.id} className="rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-950">
                              <div className="font-medium">{key.name}</div>
                              <div className="text-xs text-gray-500">{key.keyPrefix}... - {key.limitPeriod} - {key.status}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h3 className="mb-2 text-sm font-semibold">Daily Usage</h3>
                        <DataTable
                          headers={['Day', 'Requests', 'Tokens']}
                          rows={userDetail.daily.slice(0, 10).map((day) => [
                            day.day,
                            numberFormat(day.requests),
                            numberFormat(day.tokens),
                          ])}
                        />
                      </div>
                      <div>
                        <h3 className="mb-2 text-sm font-semibold">Recent Events</h3>
                        <div className="max-h-72 overflow-auto">
                          <DataTable
                            headers={['When', 'Type', 'Tokens']}
                            rows={userDetail.events.map((event) => [
                              dateFormat(event.createdAt),
                              `${event.source} / ${event.capability}`,
                              numberFormat(event.totalTokens),
                            ])}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </Panel>
              </div>
            )}

            {tab === 'apiUsage' && (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
                <Panel title="API Usage">
                  <DataTable
                    headers={['Key', 'Requests', 'Tokens', 'Input', 'Output', 'Last used']}
                    rows={summary.apiUsage.map((row) => [
                      <span key="key" className="font-medium">{row.name || 'Deleted key'}<span className="block text-xs font-normal text-gray-500">{row.keyPrefix || 'unknown'}</span></span>,
                      numberFormat(row.requests),
                      numberFormat(row.tokens),
                      numberFormat(row.inputTokens),
                      numberFormat(row.outputTokens),
                      dateFormat(row.lastUsedAt),
                    ])}
                  />
                </Panel>
                <Panel title="Recent API Events">
                  <div className="max-h-[520px] overflow-auto">
                    <DataTable
                      headers={['When', 'Key', 'Type', 'Tokens']}
                      rows={summary.recentEvents
                        .filter((event) => event.source === 'api')
                        .map((event) => [
                          dateFormat(event.createdAt),
                          event.apiKeyName || event.keyPrefix || 'Unknown',
                          event.capability,
                          numberFormat(event.totalTokens),
                        ])}
                    />
                  </div>
                </Panel>
              </div>
            )}

            {tab === 'apiKeys' && (
              <div className="grid gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
                <Panel title="Create API Key">
                  <form onSubmit={createKey} className="space-y-4">
                    <label className="block">
                      <span className="text-sm text-gray-600 dark:text-gray-300">Name</span>
                      <input
                        value={keyForm.name}
                        onChange={(event) => setKeyForm({ ...keyForm, name: event.target.value })}
                        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                        placeholder="Mobile app"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm text-gray-600 dark:text-gray-300">Assign to user</span>
                      <select
                        value={keyForm.assignedUserId}
                        onChange={(event) => setKeyForm({ ...keyForm, assignedUserId: event.target.value })}
                        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                      >
                        <option value="">Unassigned</option>
                        {summary.users.map((user) => (
                          <option key={user.id} value={user.id}>{user.name} - {user.email}</option>
                        ))}
                      </select>
                    </label>
                    <CapabilityChecks value={keyForm} onChange={(patch) => setKeyForm({ ...keyForm, ...patch })} />

                    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                      <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Limitation Type</div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 transition-colors ${keyForm.limitMode === 'unlimited' ? 'border-teal-500 bg-teal-50 dark:border-teal-400 dark:bg-teal-950/30' : 'border-gray-200 dark:border-gray-700'}`}>
                          <input
                            type="radio"
                            name="limitMode"
                            value="unlimited"
                            checked={keyForm.limitMode === 'unlimited'}
                            onChange={(e) => setKeyForm({ ...keyForm, limitMode: e.target.value as LimitMode, requestLimit: '', tokenLimit: '', unlimitedUntil: '' })}
                            className="sr-only"
                          />
                          <span className="text-sm">Unlimited</span>
                        </label>
                        <label className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 transition-colors ${keyForm.limitMode === 'requests' ? 'border-teal-500 bg-teal-50 dark:border-teal-400 dark:bg-teal-950/30' : 'border-gray-200 dark:border-gray-700'}`}>
                          <input
                            type="radio"
                            name="limitMode"
                            value="requests"
                            checked={keyForm.limitMode === 'requests'}
                            onChange={(e) => setKeyForm({ ...keyForm, limitMode: e.target.value as LimitMode, tokenLimit: '', unlimitedUntil: '' })}
                            className="sr-only"
                          />
                          <span className="text-sm">By Requests</span>
                        </label>
                        <label className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 transition-colors ${keyForm.limitMode === 'tokens' ? 'border-teal-500 bg-teal-50 dark:border-teal-400 dark:bg-teal-950/30' : 'border-gray-200 dark:border-gray-700'}`}>
                          <input
                            type="radio"
                            name="limitMode"
                            value="tokens"
                            checked={keyForm.limitMode === 'tokens'}
                            onChange={(e) => setKeyForm({ ...keyForm, limitMode: e.target.value as LimitMode, requestLimit: '', unlimitedUntil: '' })}
                            className="sr-only"
                          />
                          <span className="text-sm">By Tokens</span>
                        </label>
                        <label className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 transition-colors ${keyForm.limitMode === 'date' ? 'border-teal-500 bg-teal-50 dark:border-teal-400 dark:bg-teal-950/30' : 'border-gray-200 dark:border-gray-700'}`}>
                          <input
                            type="radio"
                            name="limitMode"
                            value="date"
                            checked={keyForm.limitMode === 'date'}
                            onChange={(e) => setKeyForm({ ...keyForm, limitMode: e.target.value as LimitMode, requestLimit: '', tokenLimit: '' })}
                            className="sr-only"
                          />
                          <span className="text-sm">Until Date</span>
                        </label>
                      </div>

                      {keyForm.limitMode !== 'unlimited' && keyForm.limitMode !== 'date' && (
                        <label className="mt-3 block">
                          <span className="text-sm text-gray-600 dark:text-gray-300">Period</span>
                          <select
                            value={keyForm.limitPeriod}
                            onChange={(event) => setKeyForm({ ...keyForm, limitPeriod: event.target.value as Period })}
                            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                          >
                            <option value="day">Per Day</option>
                            <option value="week">Per Week</option>
                            <option value="month">Per Month</option>
                            <option value="year">Per Year</option>
                          </select>
                        </label>
                      )}

                      {keyForm.limitMode === 'requests' && (
                        <label className="mt-3 block">
                          <span className="text-sm text-gray-600 dark:text-gray-300">Max Requests</span>
                          <input
                            type="number"
                            min="1"
                            value={keyForm.requestLimit}
                            onChange={(event) => setKeyForm({ ...keyForm, requestLimit: event.target.value })}
                            placeholder="e.g., 1000"
                            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                          />
                        </label>
                      )}

                      {keyForm.limitMode === 'tokens' && (
                        <label className="mt-3 block">
                          <span className="text-sm text-gray-600 dark:text-gray-300">Max Tokens</span>
                          <input
                            type="number"
                            min="1"
                            value={keyForm.tokenLimit}
                            onChange={(event) => setKeyForm({ ...keyForm, tokenLimit: event.target.value })}
                            placeholder="e.g., 1000000"
                            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                          />
                        </label>
                      )}

                      {keyForm.limitMode === 'date' && (
                        <label className="mt-3 block">
                          <span className="text-sm text-gray-600 dark:text-gray-300">Valid Until</span>
                          <input
                            type="datetime-local"
                            value={keyForm.unlimitedUntil}
                            onChange={(event) => setKeyForm({ ...keyForm, unlimitedUntil: event.target.value })}
                            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                          />
                        </label>
                      )}
                    </div>
                    <button className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-500">
                      Create Key
                    </button>
                  </form>
                  {createdToken && (
                    <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-200">
                      <div className="mb-1 font-medium">New key</div>
                      <code className="block overflow-x-auto rounded bg-white p-2 text-xs dark:bg-gray-950">{createdToken}</code>
                      <div className="mt-2 text-xs">This key is now revealable to its assigned user in the API Console.</div>
                    </div>
                  )}
                </Panel>

                <Panel title="API Keys">
                  <div className="space-y-3">
                    {summary.apiKeys.map((key) => (
                      <div key={key.id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">{key.name}</div>
                            <div className="text-xs text-gray-500">
                              {key.keyPrefix}... - {key.assignedUserEmail || 'Unassigned'}
                            </div>
                            {!key.canRevealToken && (
                              <div className="mt-1 text-xs text-amber-600 dark:text-amber-300">Legacy key: user cannot reveal full token</div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => updateKey(key.id, { status: key.status === 'active' ? 'disabled' : 'active' })}
                              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                                key.status === 'active'
                                  ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-200'
                                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                              }`}
                            >
                              {key.status}
                            </button>
                            <button
                              onClick={() => deleteKey(key.id)}
                              className="rounded-lg bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-200 dark:bg-red-950 dark:text-red-200"
                              title="Delete API key"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        <CapabilityChecks value={key} onChange={(patch) => updateKey(key.id, patch)} compact />
                        <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                          <label className="block rounded-lg bg-gray-50 p-2 dark:bg-gray-950">
                            <span className="text-xs text-gray-500">User</span>
                            <select
                              value={key.assignedUserId || ''}
                              onChange={(event) => updateKey(key.id, { assignedUserId: event.target.value || null } as Partial<ApiKey>)}
                              className="mt-1 w-full bg-transparent outline-none"
                            >
                              <option value="">Unassigned</option>
                              {summary.users.map((user) => (
                                <option key={user.id} value={user.id}>{user.email}</option>
                              ))}
                            </select>
                          </label>
                          <KeyLimitEditor apiKey={key} onUpdate={(patch) => updateKey(key.id, patch)} />
                          <div className="rounded-lg bg-gray-50 p-2 dark:bg-gray-950">
                            <div className="text-xs text-gray-500">Last used</div>
                            <div>{dateFormat(key.lastUsedAt)}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            )}

            {tab === 'models' && (
              <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
                <Panel title="Add Model">
                  <form onSubmit={createModel} className="space-y-3">
                    <label className="block">
                      <span className="text-sm text-gray-600 dark:text-gray-300">Provider</span>
                      <select
                        value={modelForm.provider}
                        onChange={(event) => {
                          const provider = event.target.value as AIProvider;
                          const defaults = providerDefaults[provider];
                          setModelForm({
                            ...modelForm,
                            provider,
                            endpoint: defaults.endpoint || modelForm.endpoint,
                            model: defaults.model || modelForm.model,
                            label: modelForm.label || provider,
                          });
                        }}
                        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                      >
                        <option value="openai-compatible">OpenAI compatible</option>
                        <option value="openai">GPT / OpenAI</option>
                        <option value="anthropic">Claude</option>
                        <option value="gemini">Gemini</option>
                        <option value="perplexity">Perplexity</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-sm text-gray-600 dark:text-gray-300">Label</span>
                      <input
                        value={modelForm.label}
                        onChange={(event) => setModelForm({ ...modelForm, label: event.target.value })}
                        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                        placeholder="Production GPT"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm text-gray-600 dark:text-gray-300">Model ID</span>
                      <input
                        value={modelForm.model}
                        onChange={(event) => setModelForm({ ...modelForm, model: event.target.value })}
                        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                        placeholder="gpt-4.1-mini"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm text-gray-600 dark:text-gray-300">Endpoint</span>
                      <input
                        value={modelForm.endpoint}
                        onChange={(event) => setModelForm({ ...modelForm, endpoint: event.target.value })}
                        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                        placeholder="https://api.openai.com/v1/chat/completions"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm text-gray-600 dark:text-gray-300">API Token</span>
                      <input
                        type="password"
                        value={modelForm.apiKey}
                        onChange={(event) => setModelForm({ ...modelForm, apiKey: event.target.value })}
                        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                        placeholder="Provider token"
                      />
                    </label>
                    <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
                      <input
                        type="checkbox"
                        checked={modelForm.isDefault}
                        onChange={(event) => setModelForm({ ...modelForm, isDefault: event.target.checked })}
                      />
                      <span>Use as default model</span>
                    </label>
                    <ModelCapabilityChecks value={modelForm} onChange={(patch) => setModelForm({ ...modelForm, ...patch })} />
                    <button className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-500">
                      Add Model
                    </button>
                  </form>
                </Panel>

                <Panel title="Model Catalog">
                  <div className="space-y-3">
                    {models.map((model) => (
                      <ModelConfigCard
                        key={model.id}
                        model={model}
                        users={summary.users}
                        limits={modelLimits.filter((limit) => limit.modelConfigId === model.id)}
                        onUpdate={(patch) => updateModel(model.id, patch)}
                        onDelete={() => deleteModel(model.id)}
                        onSaveLimit={saveModelLimit}
                      />
                    ))}
                    {models.length === 0 && (
                      <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700">
                        No model configs yet. The app will keep using `.env` until you add one.
                      </div>
                    )}
                  </div>
                </Panel>
              </div>
            )}

            {tab === 'docs' && <DocsPanel />}
          </>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={`rounded-lg bg-white ${compact ? 'p-3' : 'p-4'} shadow-sm dark:bg-gray-900`}>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`${compact ? 'text-lg' : 'text-2xl'} mt-1 font-semibold`}>{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-900">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-gray-500">
          <tr>
            {headers.map((header) => (
              <th key={header} className="border-b border-gray-200 px-3 py-2 font-semibold dark:border-gray-800">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-3 py-6 text-center text-gray-500">No data yet</td>
            </tr>
          ) : rows.map((row, index) => (
            <tr key={index} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2 align-top">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CapabilityChecks({
  value,
  onChange,
  compact = false,
}: {
  value: CapabilityPatch;
  onChange: (patch: CapabilityPatch) => void;
  compact?: boolean;
}) {
  return (
    <div className={`grid grid-cols-2 gap-2 ${compact ? 'md:grid-cols-4' : ''}`}>
      {capabilityFields.map(([field, label]) => (
        <label key={field} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
          <input
            type="checkbox"
            checked={Boolean(value[field])}
            onChange={(event) => onChange({ [field]: event.target.checked })}
            className="h-4 w-4 rounded border-gray-300"
          />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}

function ModelCapabilityChecks({
  value,
  onChange,
  compact = false,
}: {
  value: Partial<Pick<AIModel, 'supportsText' | 'supportsImage' | 'supportsVoice' | 'supportsJson'>>;
  onChange: (patch: Partial<Pick<AIModel, 'supportsText' | 'supportsImage' | 'supportsVoice' | 'supportsJson'>>) => void;
  compact?: boolean;
}) {
  return (
    <div className={`grid grid-cols-2 gap-2 ${compact ? 'md:grid-cols-4' : ''}`}>
      {modelCapabilityFields.map(([field, label]) => (
        <label key={field} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
          <input
            type="checkbox"
            checked={Boolean(value[field])}
            onChange={(event) => onChange({ [field]: event.target.checked })}
            className="h-4 w-4 rounded border-gray-300"
          />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}

function ModelConfigCard({
  model,
  users,
  limits,
  onUpdate,
  onDelete,
  onSaveLimit,
}: {
  model: AIModel;
  users: SummaryUser[];
  limits: ModelUserLimit[];
  onUpdate: (patch: Partial<AIModel> & { apiKey?: string }) => void;
  onDelete: () => void;
  onSaveLimit: (input: {
    userId: string;
    modelConfigId: string;
    limitPeriod: Period;
    requestLimit: number | null;
    tokenLimit: number | null;
  }) => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [limitUserId, setLimitUserId] = useState('');
  const [limitPeriod, setLimitPeriod] = useState<Period>('month');
  const [requestLimit, setRequestLimit] = useState('');
  const [tokenLimit, setTokenLimit] = useState('');

  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium">{model.label}</div>
            {model.isDefault && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700 dark:bg-teal-950 dark:text-teal-200">Default</span>}
          </div>
          <div className="mt-1 text-xs text-gray-500">{model.provider} - {model.model}</div>
          <div className="mt-1 max-w-xl truncate text-xs text-gray-500">{model.endpoint}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onUpdate({ status: model.status === 'active' ? 'disabled' : 'active' })}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              model.status === 'active'
                ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-200'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            {model.status}
          </button>
          <button onClick={onDelete} className="rounded-lg bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-200 dark:bg-red-950 dark:text-red-200">
            Delete
          </button>
        </div>
      </div>
      <ModelCapabilityChecks value={model} onChange={onUpdate} compact />
      <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
        <button
          onClick={() => onUpdate({ isDefault: true, status: 'active' })}
          disabled={model.isDefault}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium disabled:opacity-50 dark:border-gray-700"
        >
          Make Default
        </button>
        <label className="block rounded-lg bg-gray-50 p-2 dark:bg-gray-950">
          <span className="text-xs text-gray-500">New token</span>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            className="mt-1 w-full bg-transparent outline-none"
            placeholder={model.hasApiKey ? 'Token saved' : 'Missing token'}
          />
        </label>
        <button
          onClick={() => {
            if (!apiKey.trim()) return;
            onUpdate({ apiKey: apiKey.trim() });
            setApiKey('');
          }}
          disabled={!apiKey.trim()}
          className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-950"
        >
          Update Token
        </button>
      </div>
      <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
        <div className="mb-2 text-sm font-medium">Per-user limits</div>
        <div className="grid gap-2 text-sm md:grid-cols-5">
          <select
            value={limitUserId}
            onChange={(event) => setLimitUserId(event.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-2 py-2 dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="">Select user</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.email}</option>
            ))}
          </select>
          <select
            value={limitPeriod}
            onChange={(event) => setLimitPeriod(event.target.value as Period)}
            className="rounded-lg border border-gray-300 bg-white px-2 py-2 dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="year">Year</option>
          </select>
          <input
            type="number"
            min="1"
            value={requestLimit}
            onChange={(event) => setRequestLimit(event.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-2 py-2 dark:border-gray-700 dark:bg-gray-900"
            placeholder="Request limit"
          />
          <input
            type="number"
            min="1"
            value={tokenLimit}
            onChange={(event) => setTokenLimit(event.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-2 py-2 dark:border-gray-700 dark:bg-gray-900"
            placeholder="Token limit"
          />
          <button
            onClick={() => {
              if (!limitUserId) return;
              onSaveLimit({
                userId: limitUserId,
                modelConfigId: model.id,
                limitPeriod,
                requestLimit: requestLimit ? Number(requestLimit) : null,
                tokenLimit: tokenLimit ? Number(tokenLimit) : null,
              });
              setRequestLimit('');
              setTokenLimit('');
            }}
            disabled={!limitUserId}
            className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Save Limit
          </button>
        </div>
        {limits.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {limits.map((limit) => {
              const user = users.find((item) => item.id === limit.userId);
              return (
                <span key={limit.id} className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                  {user?.email || limit.userId}: {limit.requestLimit ? `${numberFormat(limit.requestLimit)} req` : ''}{limit.requestLimit && limit.tokenLimit ? ' / ' : ''}{limit.tokenLimit ? `${numberFormat(limit.tokenLimit)} tok` : ''} per {limit.limitPeriod}
                </span>
              );
            })}
          </div>
        )}
      </div>
      <div className="mt-2 text-xs text-gray-500">Last used: {dateFormat(model.lastUsedAt)}</div>
    </div>
  );
}

function InlineSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block rounded-lg bg-gray-50 p-2 dark:bg-gray-950">
      <span className="text-xs text-gray-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full bg-transparent outline-none">
        <option value="day">Day</option>
        <option value="week">Week</option>
        <option value="month">Month</option>
        <option value="year">Year</option>
      </select>
    </label>
  );
}

function InlineNumber({ label, value, onBlur }: { label: string; value: number | null; onBlur: (value: number | null) => void }) {
  const [local, setLocal] = useState(value?.toString() || '');

  useEffect(() => {
    setLocal(value?.toString() || '');
  }, [value]);

  return (
    <label className="block rounded-lg bg-gray-50 p-2 dark:bg-gray-950">
      <span className="text-xs text-gray-500">{label}</span>
      <input
        type="number"
        min="1"
        value={local}
        onChange={(event) => setLocal(event.target.value)}
        onBlur={() => onBlur(local ? Number(local) : null)}
        className="mt-1 w-full bg-transparent outline-none"
      />
    </label>
  );
}

function KeyLimitEditor({ apiKey, onUpdate }: { apiKey: ApiKey; onUpdate: (patch: Partial<ApiKey>) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editMode, setEditMode] = useState<LimitMode>('unlimited');
  const [editPeriod, setEditPeriod] = useState<Period>('month');
  const [editValue, setEditValue] = useState('');
  const [editDate, setEditDate] = useState('');

  // Determine current mode from API key data
  const getCurrentMode = (): LimitMode => {
    if (apiKey.unlimitedUntil) return 'date';
    if (apiKey.requestLimit) return 'requests';
    if (apiKey.tokenLimit) return 'tokens';
    return 'unlimited';
  };

  const currentMode = getCurrentMode();

  const startEditing = () => {
    setEditMode(currentMode);
    setEditPeriod(apiKey.limitPeriod || 'month');
    setEditValue(apiKey.requestLimit?.toString() || apiKey.tokenLimit?.toString() || '');
    setEditDate(apiKey.unlimitedUntil?.slice(0, 16) || ''); // Format for datetime-local
    setIsEditing(true);
  };

  const save = () => {
    if (editMode === 'unlimited') {
      onUpdate({ limitMode: 'unlimited', requestLimit: null, tokenLimit: null, unlimitedUntil: null });
    } else if (editMode === 'requests') {
      const limit = parseInt(editValue, 10);
      if (limit > 0) {
        onUpdate({ limitMode: 'requests', requestLimit: limit, tokenLimit: null, unlimitedUntil: null, limitPeriod: editPeriod });
      }
    } else if (editMode === 'tokens') {
      const limit = parseInt(editValue, 10);
      if (limit > 0) {
        onUpdate({ limitMode: 'tokens', tokenLimit: limit, requestLimit: null, unlimitedUntil: null, limitPeriod: editPeriod });
      }
    } else if (editMode === 'date') {
      if (editDate) {
        onUpdate({ limitMode: 'date', unlimitedUntil: editDate, requestLimit: null, tokenLimit: null });
      }
    }
    setIsEditing(false);
  };

  const cancel = () => {
    setIsEditing(false);
  };

  // Format display of current limitation
  const formatLimitDisplay = () => {
    if (apiKey.unlimitedUntil) {
      const date = new Date(apiKey.unlimitedUntil);
      const isExpired = date.getTime() < Date.now();
      return (
        <span className={isExpired ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
          Until {date.toLocaleDateString()}{isExpired ? ' (expired)' : ''}
        </span>
      );
    }
    if (apiKey.requestLimit) {
      return <span>{apiKey.requestLimit.toLocaleString()} req/{apiKey.limitPeriod}</span>;
    }
    if (apiKey.tokenLimit) {
      return <span>{apiKey.tokenLimit.toLocaleString()} tok/{apiKey.limitPeriod}</span>;
    }
    return <span className="text-gray-500">Unlimited</span>;
  };

  if (!isEditing) {
    return (
      <div className="block rounded-lg bg-gray-50 p-2 dark:bg-gray-950">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-500">Limit</span>
            <div className="font-medium">{formatLimitDisplay()}</div>
          </div>
          <button
            onClick={startEditing}
            className="rounded bg-teal-100 px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-200 dark:bg-teal-950 dark:text-teal-200"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="block rounded-lg bg-teal-50 p-2 dark:bg-teal-950/30">
      <div className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">Limit Type</div>
      <div className="mb-2 grid grid-cols-2 gap-1">
        {(['unlimited', 'requests', 'tokens', 'date'] as LimitMode[]).map((mode) => (
          <label key={mode} className={`flex cursor-pointer items-center gap-1 rounded border p-1 text-xs ${editMode === mode ? 'border-teal-500 bg-teal-100 dark:border-teal-400 dark:bg-teal-900' : 'border-gray-200 dark:border-gray-700'}`}>
            <input
              type="radio"
              name={`limitMode-${apiKey.id}`}
              value={mode}
              checked={editMode === mode}
              onChange={(e) => setEditMode(e.target.value as LimitMode)}
              className="sr-only"
            />
            <span>{mode === 'unlimited' ? 'Unlimited' : mode === 'requests' ? 'Requests' : mode === 'tokens' ? 'Tokens' : 'Until Date'}</span>
          </label>
        ))}
      </div>

      {editMode !== 'unlimited' && editMode !== 'date' && (
        <select
          value={editPeriod}
          onChange={(e) => setEditPeriod(e.target.value as Period)}
          className="mb-2 w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800"
        >
          <option value="day">Per Day</option>
          <option value="week">Per Week</option>
          <option value="month">Per Month</option>
          <option value="year">Per Year</option>
        </select>
      )}

      {(editMode === 'requests' || editMode === 'tokens') && (
        <input
          type="number"
          min="1"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          placeholder={editMode === 'requests' ? 'Max requests' : 'Max tokens'}
          className="mb-2 w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800"
        />
      )}

      {editMode === 'date' && (
        <input
          type="datetime-local"
          value={editDate}
          onChange={(e) => setEditDate(e.target.value)}
          className="mb-2 w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800"
        />
      )}

      <div className="flex gap-1">
        <button onClick={save} className="flex-1 rounded bg-teal-600 px-2 py-1 text-xs font-medium text-white hover:bg-teal-500">Save</button>
        <button onClick={cancel} className="flex-1 rounded bg-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200">Cancel</button>
      </div>
    </div>
  );
}

function DocsPanel() {
  const origin = typeof window === 'undefined' ? 'https://your-domain.com' : window.location.origin;

  return (
    <Panel title="API Documentation">
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <p>
          Use an admin-created key with the public chat endpoint. Public API calls are metered separately from RAG and never call the RAG service.
        </p>
        <pre className="overflow-x-auto rounded-lg bg-gray-950 p-4 text-xs text-gray-100">{`curl ${origin}/api/v1/chat \\
  -H "Authorization: Bearer sk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [
      { "role": "user", "content": "Write a short welcome message" }
    ]
  }'`}</pre>
        <h3>Quota Rules</h3>
        <ul>
          <li>API keys can only have ONE limitation type: unlimited, request-based, token-based, or date-based.</li>
          <li>Request and token limits reset by the selected day, week, month, or year period.</li>
          <li>A date-based limit allows unlimited usage until that exact date expires.</li>
          <li>Token usage prefers provider usage fields and falls back to an approximate calculation for streamed output.</li>
        </ul>
        <h3>Capabilities</h3>
        <ul>
          <li>Text, image, video, and voice are controlled independently per key.</li>
          <li>The API rejects a request before calling the provider when the detected capability is disabled.</li>
        </ul>
        <h3>Models</h3>
        <ul>
          <li>Admins can add GPT, Gemini, Perplexity, Claude, or OpenAI-compatible models in the Models tab.</li>
          <li>Disabled model configs cannot be called from the public API by model id.</li>
          <li>Claude supports non-streaming public API calls through its native Messages API; streaming Claude support is a later integration step.</li>
        </ul>
      </div>
    </Panel>
  );
}
