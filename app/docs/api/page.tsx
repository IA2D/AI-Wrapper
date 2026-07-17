'use client';

import type React from 'react';
import { useLanguage } from '@/components/LanguageProvider';
import LandingNav from '@/components/LandingNav';
import WadiLogo from '@/components/WadiLogo';
import { docsCopy as allDocsCopy } from '@/lib/i18n';

const codePayloads = {
  text: `{
  "messages": [
    { "role": "system", "content": "Return concise JSON." },
    { "role": "user", "content": "Extract name and company from: Ahmed from Mojeb." }
  ],
  "response_format": { "type": "json_object" }
}`,
  image: `{
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "Summarize this dashboard screenshot." },
        { "type": "image_url", "image_url": { "url": "https://example.com/dashboard.png" } }
      ]
    }
  ]
}`,
  voice: `{
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "What action items are in this voice note?" },
        { "type": "audio_url", "audio_url": { "url": "https://example.com/note.wav" } }
      ]
    }
  ]
}`,
};

const errors = [
  ['401', 'Missing or invalid API key'],
  ['403', 'Capability disabled'],
  ['429', 'Quota exceeded'],
  ['502', 'Provider request failed'],
];

export default function ApiDocsPage() {
  const { locale, dir } = useLanguage();
  const copy = allDocsCopy[locale];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#fbfbfa] text-[#050505] dark:bg-[#070908] dark:text-white" dir={dir}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(75,163,170,0.18),transparent_30%),radial-gradient(circle_at_88%_12%,rgba(143,207,211,0.18),transparent_28%)]" />

      <LandingNav />

      {/* Hero */}
      <section className="relative z-10 px-4 pb-14 pt-36 sm:px-6 lg:pb-20 lg:pt-44">
        <div className="mx-auto grid max-w-[1720px] gap-8 lg:grid-cols-[1fr_420px] lg:items-center">
          <div>
            <div className="minds-eyebrow">{copy.eyebrow}</div>
            <h1 className="mt-5 max-w-4xl text-balance text-4xl font-black leading-tight md:text-6xl">{copy.title}</h1>
            <p className="mt-5 max-w-3xl text-base font-bold leading-8 text-black/62">{copy.subtitle}</p>
          </div>
          <div className="rounded-lg border border-black/10 bg-[#15565c] p-5 text-white shadow-[0_30px_90px_rgba(28,113,120,0.2)]">
            <div className="flex items-center justify-between gap-4 font-mono text-xs font-black text-[#d3edef]" dir="ltr">
              <span>POST /api/v1/chat</span>
              <span className="rounded-full bg-[#8fcfd3] px-2 py-1 text-[#15565c]">stream</span>
            </div>
            <Code dark={false}>{`{
  "messages": [
    { "role": "user", "content": "${copy.curlPrompt}" }
  ],
  "stream": true
}`}</Code>
          </div>
        </div>
      </section>

      {/* Main content */}
      <section className="relative z-10 px-4 pb-14 sm:px-6">
        <div className="mx-auto grid max-w-[1720px] gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">

            {/* Endpoint */}
            <DocPanel title={copy.endpoint}>
              <div className="grid gap-3 md:grid-cols-3">
                <InfoTile label={copy.method} value="POST" />
                <InfoTile label={copy.path} value="/api/v1/chat" />
                <InfoTile label={copy.auth} value={copy.authValue} />
              </div>
              <Code>{`curl https://your-domain.com/api/v1/chat \\
  -H "Authorization: Bearer sk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [
      { "role": "user", "content": "${copy.curlPrompt}" }
    ]
  }'`}</Code>
            </DocPanel>

            {/* Parameters */}
            <DocPanel title={copy.paramsTitle}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="text-xs uppercase tracking-wide text-[#1C7178] dark:text-[#8fcfd3]">
                    <tr>
                      <th className="border-b border-black/10 dark:border-white/12 px-3 py-2 text-start">{copy.parameter}</th>
                      <th className="border-b border-black/10 dark:border-white/12 px-3 py-2 text-start">{copy.type}</th>
                      <th className="border-b border-black/10 dark:border-white/12 px-3 py-2 text-start">{copy.behavior}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {copy.params.map(([name, type, detail]) => (
                      <tr key={name} className="border-b border-black/10 dark:border-white/10 last:border-0">
                        <td className="px-3 py-3 font-mono font-black text-[#1C7178] dark:text-[#8fcfd3]" dir="ltr">{name}</td>
                        <td className="px-3 py-3 text-black/70 dark:text-white/80" dir="ltr">{type}</td>
                        <td className="px-3 py-3 text-black/70 dark:text-white/80">{detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-sm font-bold leading-6 text-black/58 dark:text-white/72">{copy.gatewayNote}</p>
              <p className="mt-3 text-sm font-bold leading-6 text-black/58 dark:text-white/72">{copy.consoleNote}</p>
            </DocPanel>

            {/* Use cases */}
            <DocPanel title={copy.useCases}>
              <div className="grid gap-4">
                {copy.useCasesData.map((item, i) => (
                  <article key={item.title} className="rounded-lg border border-black/10 bg-white/72 p-5 dark:bg-white/[0.06] dark:border-white/12">
                    <div className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-[#1C7178] dark:text-[#8fcfd3]">{item.mode}</div>
                    <h3 className="text-xl font-black dark:text-white">{item.title}</h3>
                    <p className="mt-2 text-sm font-bold leading-6 text-black/62 dark:text-white/75">{item.copy}</p>
                    <Code>{codePayloads[(['text', 'image', 'voice'] as const)[i]]}</Code>
                  </article>
                ))}
              </div>
            </DocPanel>

            {/* Streaming */}
            <DocPanel title={copy.streaming}>
              <p className="text-sm font-bold leading-6 text-black/62 dark:text-white/75">{copy.streamingCopy}</p>
              <Code>{`{
  "stream": true,
  "messages": [
    { "role": "user", "content": "Generate five product names." }
  ],
  "temperature": 0.7
}`}</Code>
            </DocPanel>
          </div>

          {/* Sidebar */}
          <aside className="space-y-5">
            <DocPanel title={copy.quota}>
              <ul className="space-y-3 text-sm font-bold leading-6 text-black/62 dark:text-white/75">
                {copy.quotaItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </DocPanel>

            <DocPanel title={copy.capabilities}>
              <ul className="space-y-3 text-sm font-bold leading-6 text-black/62 dark:text-white/75">
                {copy.capabilityItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </DocPanel>

            <DocPanel title={copy.errors}>
              <div className="space-y-3 text-sm text-black/70 dark:text-white/80">
                {errors.map(([label, value]) => (
                  <InfoTile key={label} label={label} value={value} />
                ))}
              </div>
            </DocPanel>
          </aside>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-black/10 bg-[#fbfbfa] px-4 py-8 text-sm text-black/58 sm:px-6 dark:bg-[#070908] dark:border-white/10 dark:text-white/58">
        <div className="mx-auto flex max-w-[1720px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 font-black text-black dark:text-white">
            <WadiLogo />
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            {(['/#features', '/chat', '/#cta', '/docs/api'] as const).map((href, i) => (
              <a key={href} href={href} className="font-black transition hover:text-[#1C7178]">
                {copy.footer[i]}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </main>
  );
}

function DocPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-black/10 bg-white/78 p-5 shadow-[0_20px_70px_rgba(28,113,120,0.08)] backdrop-blur-xl dark:bg-white/[0.06] dark:border-white/12">
      <h2 className="mb-4 text-lg font-black text-black dark:text-white">{title}</h2>
      {children}
    </section>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-black/10 bg-[#f7fcfa] p-3 dark:bg-white/[0.07] dark:border-white/12">
      <div className="text-xs font-black uppercase tracking-wide text-black/45 dark:text-white/60">{label}</div>
      <div className="mt-1 break-words text-sm font-black text-black dark:text-white">{value}</div>
    </div>
  );
}

function Code({ children, dark = true }: { children: string; dark?: boolean }) {
  return (
    <pre
      dir="ltr"
      className={`mt-4 overflow-x-auto rounded-lg border p-4 text-xs leading-6 ${
        dark
          ? 'border-black/10 bg-[#050505] text-[#d3edef]'
          : 'border-white/10 bg-black/24 text-[#d3edef]'
      }`}
    >
      <code>{children}</code>
    </pre>
  );
}
