'use client';

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from './LanguageProvider';
import LandingNav from './LandingNav';
import { apiConsoleCopy } from '@/lib/i18n';

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

function formatDate(value: string | null, never: string) {
  if (!value) return never;
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
  const { locale, dir } = useLanguage();
  const t = apiConsoleCopy[locale];

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
    if (!selectedKey) { setUsage(null); return; }
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
    if (!allowed.includes(usageMode) && allowed[0]) setUsageMode(allowed[0]);
  }, [selectedKey, usageMode]);

  const payloadJson = useMemo(() => {
    if (usageMode === 'image') return `{
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
    if (usageMode === 'voice') return `{
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
    if (usageMode === 'video') return `{
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
    return `{
  "messages": [
    { "role": "user", "content": "Write a concise launch message." }
  ],
  "temperature": 0.7
}`;
  }, [usageMode]);

  const command = useMemo(() => {
    const endpoint = `${origin}/api/v1/chat`;
    if (commandKind === 'javascript') return `const response = await fetch("${endpoint}", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${token}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify(${payloadJson})
});

const data = await response.json();
console.log(data);`;
    if (commandKind === 'php') return `$payload = <<<'JSON'
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
    if (commandKind === 'python') return `import requests

response = requests.post(
    "${endpoint}",
    headers={
        "Authorization": "Bearer ${token}",
        "Content-Type": "application/json",
    },
    json=${payloadJson},
)

print(response.json())`;
    return `curl ${endpoint} \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '${payloadJson}'`;
  }, [commandKind, origin, payloadJson, token]);

  const copyToClipboard = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setCopyState(label);
    window.setTimeout(() => setCopyState(null), 1400);
  };

  return (
    <main className="wadi-api-console min-h-screen bg-[#fbfbfa] text-[#050505] dark:bg-[#080d0d] dark:text-white" dir={dir}>
      <LandingNav />

      <div className="mx-auto grid max-w-[1560px] gap-5 px-4 pt-24 pb-6 sm:px-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:pt-28 lg:pb-8">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 shadow-sm dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200 lg:col-span-2">
            {error}
          </div>
        )}

        <aside className="space-y-4">
          <Panel title={t.assignedKeys}>
            <div className="space-y-3">
              {apiKeys.length === 0 ? (
                <p className="text-sm font-bold leading-6 text-black/52 dark:text-white/58">{t.noKeys}</p>
              ) : apiKeys.map((key) => (
                <button
                  key={key.id}
                  onClick={() => setSelectedKeyId(key.id)}
                  className={`wadi-api-key-card ${selectedKey?.id === key.id ? 'is-active' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-black">{key.name}</div>
                      <div className="mt-1 text-xs font-bold text-black/44 dark:text-white/44" dir="ltr">{key.keyPrefix}...</div>
                    </div>
                    <span className={`wadi-api-status ${key.status === 'active' ? 'is-active' : ''}`}>
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
            <Panel title={t.limits}>
              <div className="space-y-3 text-sm">
                <LimitRow label={t.period} value={selectedKey.limitPeriod} />
                <LimitRow
                  label={t.requests}
                  value={selectedKey.requestLimit
                    ? `${formatNumber(selectedKey.requestLimit)} / ${selectedKey.limitPeriod}`
                    : t.unlimited}
                />
                <LimitRow
                  label={t.tokens}
                  value={selectedKey.tokenLimit
                    ? `${formatNumber(selectedKey.tokenLimit)} / ${selectedKey.limitPeriod}`
                    : t.unlimited}
                />
                <LimitRow
                  label={t.unlimitedUntil}
                  value={selectedKey.unlimitedUntil ? formatDate(selectedKey.unlimitedUntil, t.never) : t.notSet}
                />
                <LimitRow label={t.lastUsed} value={formatDate(selectedKey.lastUsedAt, t.never)} />
              </div>
            </Panel>
          )}
        </aside>

        <section className="space-y-5">
          {selectedKey ? (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <Metric label={t.requestsMetric} value={formatNumber(usage?.totals.requests || 0)} />
                <Metric label={t.tokensMetric}   value={formatNumber(usage?.totals.tokens || 0)} />
                <Metric label={t.inputMetric}    value={formatNumber(usage?.totals.inputTokens || 0)} />
                <Metric label={t.outputMetric}   value={formatNumber(usage?.totals.outputTokens || 0)} />
              </div>

              <Panel title={t.readyCommands}>
                {!selectedKey.token && (
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                    {t.noRevealWarning}
                  </div>
                )}
                <div className="mb-4 flex flex-wrap gap-2">
                  {keyModes(selectedKey).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setUsageMode(mode as UsageMode)}
                      className={`wadi-api-chip capitalize ${usageMode === mode ? 'is-active' : ''}`}
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
                      className={`wadi-api-chip capitalize ${commandKind === kind ? 'is-active' : ''}`}
                    >
                      {kind}
                    </button>
                  ))}
                  <button
                    onClick={() => copyToClipboard(command, 'command')}
                    className="wadi-api-secondary ms-auto"
                  >
                    {copyState === 'command' ? t.copied : t.copyCommand}
                  </button>
                </div>
                <pre className="wadi-api-code max-h-[440px] overflow-auto p-4 text-xs leading-6" dir="ltr">
                  <code>{command}</code>
                </pre>
              </Panel>

              <Panel title={t.apiKey}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <code className="wadi-api-code min-w-0 flex-1 overflow-x-auto px-3 py-3 text-xs" dir="ltr">
                    {selectedKey.token || `${selectedKey.keyPrefix}...`}
                  </code>
                  <button
                    disabled={!selectedKey.token}
                    onClick={() => selectedKey.token && copyToClipboard(selectedKey.token, 'token')}
                    className="wadi-api-primary px-4 py-3 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {copyState === 'token' ? t.copied : t.copyKey}
                  </button>
                </div>
              </Panel>

              <div className="grid gap-5 xl:grid-cols-2">
                <Panel title={t.dailyUsage}>
                  <DataTable
                    headers={[t.tableDay, t.tableRequests, t.tableTokens]}
                    rows={(usage?.daily || []).map((row) => [
                      row.day,
                      formatNumber(row.requests),
                      formatNumber(row.tokens),
                    ])}
                    noUsage={t.noUsage}
                  />
                </Panel>
                <Panel title={t.recentRequests}>
                  <DataTable
                    headers={[t.tableWhen, t.tableMode, t.tableTokens]}
                    rows={(usage?.events || []).map((event) => [
                      formatDate(event.createdAt, t.never),
                      event.capability,
                      formatNumber(event.totalTokens),
                    ])}
                    noUsage={t.noUsage}
                  />
                </Panel>
              </div>
            </>
          ) : (
            <Panel title={t.noAccess}>
              <p className="text-sm font-bold leading-6 text-black/56 dark:text-white/62">
                {t.noAccessBody}
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
    <section className="wadi-api-panel p-5">
      <h2 className="mb-4 text-base font-black text-[#062c30] dark:text-[#e9fbfc]">{title}</h2>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="wadi-api-metric p-4">
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-black/44 dark:text-white/46">{label}</div>
      <div className="mt-2 text-2xl font-black text-[#062c30] dark:text-[#e9fbfc]" dir="ltr">{value}</div>
    </div>
  );
}

function LimitRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="wadi-api-limit-row">
      <span>{label}</span>
      <strong dir="ltr">{value}</strong>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="wadi-api-pill">{children}</span>;
}

function DataTable({ headers, rows, noUsage }: { headers: string[]; rows: React.ReactNode[][]; noUsage: string }) {
  return (
    <div className="wadi-api-table-wrap max-h-80 overflow-auto">
      <table className="w-full min-w-[420px] text-start text-sm">
        <thead className="sticky top-0 text-[11px] uppercase tracking-[0.12em]">
          <tr>
            {headers.map((header) => (
              <th key={header} className="wadi-api-table-head px-3 py-3 font-black backdrop-blur">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="wadi-api-table-empty px-3 py-8 text-center font-bold">
                {noUsage}
              </td>
            </tr>
          ) : rows.map((row, index) => (
            <tr key={index} className="wadi-api-table-row">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="wadi-api-table-cell px-3 py-3 font-bold">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
