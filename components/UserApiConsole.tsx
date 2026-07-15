'use client';

import { useEffect, useMemo, useState } from 'react';

type Period = 'day' | 'week' | 'month' | 'year';
type CommandKind = 'curl' | 'javascript' | 'php' | 'python';
type UsageMode = 'text' | 'image' | 'voice' | 'video';

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
  lastUsedAt: string | null;
  createdAt: string;
  token: string | null;
}

interface Usage {
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
    capability: string;
    requestCount: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    model: string | null;
    createdAt: string;
  }>;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value || 0);
}

function formatDate(value: string | null) {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function keyModes(key: ApiKey) {
  return [
    key.allowText ? 'text' : null,
    key.allowImage ? 'image' : null,
    key.allowVoice ? 'voice' : null,
    key.allowVideo ? 'video' : null,
  ].filter(Boolean) as string[];
}

export default function UserApiConsole() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [commandKind, setCommandKind] = useState<CommandKind>('curl');
  const [usageMode, setUsageMode] = useState<UsageMode>('text');
  const [copyState, setCopyState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const origin = typeof window === 'undefined' ? 'http://localhost:3000' : window.location.origin;

  const selectedKey = apiKeys.find((key) => key.id === selectedKeyId) || apiKeys[0] || null;
  const token = selectedKey?.token || 'sk_your_key';

  useEffect(() => {
    fetch('/api/me/api-keys')
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Failed to load API keys');
        setApiKeys(data.apiKeys || []);
        setSelectedKeyId(data.apiKeys?.[0]?.id || null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load API keys'));
  }, []);

  useEffect(() => {
    if (!selectedKey) {
      setUsage(null);
      return;
    }

    fetch(`/api/me/api-keys/${selectedKey.id}/usage`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Failed to load usage');
        setUsage(data.usage);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load usage'));
  }, [selectedKey?.id]);

  useEffect(() => {
    if (!selectedKey) return;
    const allowed = keyModes(selectedKey) as UsageMode[];
    if (!allowed.includes(usageMode) && allowed[0]) {
      setUsageMode(allowed[0]);
    }
  }, [selectedKey, usageMode]);

  const payloadJson = useMemo(() => {
    if (usageMode === 'image') {
      return `{
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "Summarize this dashboard screenshot." },
        { "type": "image_url", "image_url": { "url": "https://example.com/dashboard.png" } }
      ]
    }
  ],
  "temperature": 0.4
}`;
    }

    if (usageMode === 'voice') {
      return `{
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "Extract action items from this voice note." },
        { "type": "audio_url", "audio_url": { "url": "https://example.com/note.wav" } }
      ]
    }
  ]
}`;
    }

    if (usageMode === 'video') {
      return `{
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "Describe the visible sequence in this clip." },
        { "type": "video_url", "video_url": { "url": "https://example.com/clip.mp4" } }
      ]
    }
  ]
}`;
    }

    return `{
  "messages": [
    { "role": "user", "content": "Write a concise launch message." }
  ],
  "temperature": 0.7
}`;
  }, [usageMode]);

  const command = useMemo(() => {
    const endpoint = `${origin}/api/v1/chat`;

    if (commandKind === 'javascript') {
      return `const response = await fetch("${endpoint}", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${token}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify(${payloadJson})
});

const data = await response.json();
console.log(data);`;
    }

    if (commandKind === 'php') {
      return `$payload = <<<'JSON'
${payloadJson}
JSON;

$ch = curl_init("${endpoint}");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    "Authorization: Bearer ${token}",
    "Content-Type: application/json"
  ],
  CURLOPT_POSTFIELDS => $payload
]);

$response = curl_exec($ch);
curl_close($ch);
echo $response;`;
    }

    if (commandKind === 'python') {
      return `import requests

response = requests.post(
    "${endpoint}",
    headers={
        "Authorization": "Bearer ${token}",
        "Content-Type": "application/json",
    },
    json=${payloadJson},
)

print(response.json())`;
    }

    return `curl ${endpoint} \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '${payloadJson}'`;
  }, [commandKind, origin, payloadJson, token]);

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setCopyState(label);
    window.setTimeout(() => setCopyState(null), 1400);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10 bg-slate-950/95 px-4 py-5">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">Developer Console</div>
            <h1 className="mt-1 text-2xl font-semibold">Your API Keys</h1>
          </div>
          <div className="flex gap-2">
            <a href="/docs/api" className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/10">Docs</a>
            <a href="/chat" className="rounded-lg bg-teal-300 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-200">Chat</a>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        {error && (
          <div className="rounded-lg border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-100 lg:col-span-2">
            {error}
          </div>
        )}

        <aside className="space-y-4">
          <Panel title="Assigned Keys">
            <div className="space-y-3">
              {apiKeys.length === 0 ? (
                <p className="text-sm leading-6 text-slate-400">No API keys are assigned to your account yet.</p>
              ) : apiKeys.map((key) => (
                <button
                  key={key.id}
                  onClick={() => setSelectedKeyId(key.id)}
                  className={`w-full rounded-lg border p-4 text-left transition ${
                    selectedKey?.id === key.id
                      ? 'border-teal-300 bg-teal-300/10'
                      : 'border-white/10 bg-slate-950 hover:border-white/25'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{key.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{key.keyPrefix}...</div>
                    </div>
                    <span className={`rounded px-2 py-1 text-xs ${key.status === 'active' ? 'bg-emerald-400/15 text-emerald-200' : 'bg-slate-700 text-slate-300'}`}>
                      {key.status}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {keyModes(key).map((mode) => <Pill key={mode}>{mode}</Pill>)}
                  </div>
                </button>
              ))}
            </div>
          </Panel>

          {selectedKey && (
            <Panel title="Limits">
              <div className="space-y-3 text-sm text-slate-300">
                <LimitRow label="Period" value={selectedKey.limitPeriod} />
                <LimitRow label="Requests" value={selectedKey.requestLimit ? `${formatNumber(selectedKey.requestLimit)} / ${selectedKey.limitPeriod}` : 'Unlimited'} />
                <LimitRow label="Tokens" value={selectedKey.tokenLimit ? `${formatNumber(selectedKey.tokenLimit)} / ${selectedKey.limitPeriod}` : 'Unlimited'} />
                <LimitRow label="Unlimited until" value={selectedKey.unlimitedUntil ? formatDate(selectedKey.unlimitedUntil) : 'Not set'} />
                <LimitRow label="Last used" value={formatDate(selectedKey.lastUsedAt)} />
              </div>
            </Panel>
          )}
        </aside>

        <section className="space-y-5">
          {selectedKey ? (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <Metric label="Requests" value={formatNumber(usage?.totals.requests || 0)} />
                <Metric label="Tokens" value={formatNumber(usage?.totals.tokens || 0)} />
                <Metric label="Input" value={formatNumber(usage?.totals.inputTokens || 0)} />
                <Metric label="Output" value={formatNumber(usage?.totals.outputTokens || 0)} />
              </div>

              <Panel title="Ready Commands">
                {!selectedKey.token && (
                  <div className="mb-4 rounded-lg border border-amber-300/30 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
                    This key was created before key reveal support. Ask an admin to create a new assigned key to enable one-click command copying.
                  </div>
                )}
                <div className="mb-4 flex flex-wrap gap-2">
                  {keyModes(selectedKey).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setUsageMode(mode as UsageMode)}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold capitalize ${
                        usageMode === mode
                          ? 'bg-emerald-300 text-slate-950'
                          : 'bg-white/10 text-slate-200 hover:bg-white/15'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
                <div className="mb-4 flex flex-wrap gap-2">
                  {(['curl', 'javascript', 'php', 'python'] as CommandKind[]).map((kind) => (
                    <button
                      key={kind}
                      onClick={() => setCommandKind(kind)}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold capitalize ${
                        commandKind === kind ? 'bg-teal-300 text-slate-950' : 'bg-white/10 text-slate-200 hover:bg-white/15'
                      }`}
                    >
                      {kind}
                    </button>
                  ))}
                  <button
                    onClick={() => copy(command, 'command')}
                    className="ml-auto rounded-lg border border-white/10 px-3 py-2 text-sm text-teal-100 hover:bg-white/10"
                  >
                    {copyState === 'command' ? 'Copied' : 'Copy command'}
                  </button>
                </div>
                <pre className="max-h-[440px] overflow-auto rounded-lg border border-white/10 bg-black p-4 text-xs leading-6 text-teal-50">
                  <code>{command}</code>
                </pre>
              </Panel>

              <Panel title="API Key">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-white/10 bg-black px-3 py-3 text-xs text-teal-100">
                    {selectedKey.token || `${selectedKey.keyPrefix}...`}
                  </code>
                  <button
                    disabled={!selectedKey.token}
                    onClick={() => selectedKey.token && copy(selectedKey.token, 'token')}
                    className="rounded-lg bg-white px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {copyState === 'token' ? 'Copied' : 'Copy key'}
                  </button>
                </div>
              </Panel>

              <div className="grid gap-5 xl:grid-cols-2">
                <Panel title="Daily Usage">
                  <DataTable
                    headers={['Day', 'Requests', 'Tokens']}
                    rows={(usage?.daily || []).map((row) => [
                      row.day,
                      formatNumber(row.requests),
                      formatNumber(row.tokens),
                    ])}
                  />
                </Panel>
                <Panel title="Recent Requests">
                  <DataTable
                    headers={['When', 'Mode', 'Tokens']}
                    rows={(usage?.events || []).map((event) => [
                      formatDate(event.createdAt),
                      event.capability,
                      formatNumber(event.totalTokens),
                    ])}
                  />
                </Panel>
              </div>
            </>
          ) : (
            <Panel title="No API access yet">
              <p className="text-sm leading-6 text-slate-300">
                When an admin assigns one or more API keys to your account, they will appear here with limits,
                usage, allowed media types, and ready-to-copy commands.
              </p>
            </Panel>
          )}
        </section>
      </div>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-slate-900 p-5 shadow-2xl shadow-black/20">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

function LimitRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-slate-950 px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-100">{value}</span>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-white/10 px-2 py-1 text-xs text-teal-100">{children}</span>;
}

function DataTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="max-h-80 overflow-auto">
      <table className="w-full min-w-[420px] text-left text-sm">
        <thead className="sticky top-0 bg-slate-900 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {headers.map((header) => (
              <th key={header} className="border-b border-white/10 px-3 py-2 font-semibold">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-3 py-8 text-center text-slate-500">No usage yet</td>
            </tr>
          ) : rows.map((row, index) => (
            <tr key={index} className="border-b border-white/10 last:border-0">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-3 text-slate-300">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
