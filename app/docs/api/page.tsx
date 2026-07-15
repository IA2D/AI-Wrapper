'use client';

import type React from 'react';
import { useEffect, useState } from 'react';
import { FiArrowRight } from 'react-icons/fi';
import WadiLogo from '@/components/WadiLogo';

const navItems = [
  { href: '/#hero', label: 'Home' },
  { href: '/#features', label: 'About' },
  { href: '/#how', label: 'Resources' },
  { href: '/#cta', label: 'Plans' },
];

const footerItems = [
  { href: '/#features', label: 'Platform' },
  { href: '/chat', label: 'Chat' },
  { href: '/#cta', label: 'Developers' },
  { href: '/docs/api', label: 'API Docs' },
];

const docsCopy = {
  eyebrow: 'Public endpoint, no RAG',
  title: 'API documentation for chat, files, and product workflows.',
  subtitle:
    'Use admin-created keys to call the public chat endpoint directly. Requests are metered against API key quotas and stay separate from private chat-session document context.',
  endpoint: 'Endpoint',
  method: 'Method',
  path: 'Path',
  auth: 'Auth',
  authValue: 'Bearer API key',
  paramsTitle: 'Supported Parameters',
  parameter: 'Parameter',
  type: 'Type',
  behavior: 'Behavior',
  gatewayNote:
    'The gateway validates the API key, required messages, capability permissions, and quota. Other fields are forwarded to the configured provider.',
  consoleNote:
    'Assigned users can open /api-console to view keys, limits, usage, and ready-to-copy commands.',
  useCases: 'Use Cases',
  streaming: 'Streaming',
  streamingCopy:
    'Set stream to true to receive server-sent events. Streamed output is still metered; when providers omit usage, output tokens are estimated from generated text.',
  quota: 'Quota Model',
  capabilities: 'Capability Detection',
  errors: 'Error Responses',
  curlPrompt: 'Write a launch announcement.',
  quotaItems: [
    'Limits can be per day, week, month, or year.',
    'Admins can limit requests, tokens, both, or neither.',
    'An unlimited-until date bypasses limits until it expires.',
    'Usage appears in the admin API usage tab.',
  ],
  capabilityItems: [
    'image_url or image media requires image access.',
    'audio_url, input_audio, or audio media requires voice access.',
    'video_url or video media requires video access.',
    'Plain string messages require text access.',
  ],
  params: [
    ['messages', 'array', 'Required. OpenAI-style chat messages. Supports text strings or multimodal content arrays.'],
    ['model', 'string', 'Optional. Defaults to the server MODEL env value. Passed through to the provider.'],
    ['stream', 'boolean', 'Optional. Returns server-sent events when true. Defaults to false.'],
    ['temperature', 'number', 'Optional. Provider sampling control, passed through unchanged.'],
    ['top_p', 'number', 'Optional. Provider nucleus sampling control, passed through unchanged.'],
    ['max_tokens', 'number', 'Optional. Maximum generated tokens for chat-completion providers.'],
    ['response_format', 'object', 'Optional. JSON/object response format options for compatible providers.'],
    ['tools', 'array', 'Optional. Function/tool definitions for compatible chat providers.'],
    ['metadata', 'object', 'Optional. Forwarded to providers that accept request metadata.'],
  ],
  useCasesData: [
    {
      title: 'Text automation',
      mode: 'text',
      copy: 'Build support responders, writing tools, research assistants, workflow copilots, and structured JSON extraction.',
      payload: `{
  "messages": [
    { "role": "system", "content": "Return concise JSON." },
    { "role": "user", "content": "Extract name and company from: Ahmed from Mojeb." }
  ],
  "response_format": { "type": "json_object" }
}`,
    },
    {
      title: 'Image understanding',
      mode: 'image',
      copy: 'Analyze screenshots, UI mockups, forms, invoices, site photos, and visual QA evidence when image permission is enabled.',
      payload: `{
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
    },
    {
      title: 'Voice and audio',
      mode: 'voice',
      copy: 'Send voice notes, call snippets, or base64 audio payloads for transcription-aware reasoning when voice permission is enabled.',
      payload: `{
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
    },
  ],
} as const;

const errors = [
  ['401', 'Missing or invalid API key'],
  ['403', 'Capability disabled'],
  ['429', 'Quota exceeded'],
  ['502', 'Provider request failed'],
];

export default function ApiDocsPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#fbfbfa] text-[#050505]" dir="ltr">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(75,163,170,0.18),transparent_30%),radial-gradient(circle_at_88%_12%,rgba(143,207,211,0.18),transparent_28%)]" />

      <header className={`minds-nav fixed inset-x-0 top-0 z-50 ${scrolled || menuOpen ? 'is-solid' : ''}`}>
        <div className="minds-nav-shell flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <a href="/" className="minds-brand-pill" aria-label="Wadi home">
              <WadiLogo />
            </a>

            <nav className="minds-nav-pill hidden items-center lg:flex" aria-label="Primary navigation">
              {navItems.map((item) => (
                <a key={item.href} href={item.href} className="minds-nav-item">
                  {item.label}
                </a>
              ))}
            </nav>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-1.5">
            <a href="/chat" className="minds-action-pill hidden sm:inline-flex">
              Sign In
            </a>
            <a href="/chat" className="minds-action-pill minds-action-primary hidden min-[520px]:inline-flex">
              <span aria-hidden="true" className="minds-arrow">
                <FiArrowRight />
              </span>
              Open Wadi
            </a>
            <button
              type="button"
              className="minds-menu-button lg:hidden"
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
            >
              <span className={`minds-menu-line ${menuOpen ? 'is-open' : ''}`} />
            </button>
          </div>
        </div>

        <div className={`minds-mobile-menu lg:hidden ${menuOpen ? 'is-open' : ''}`}>
          <nav className="mx-4 rounded-[28px] border border-black/10 bg-white/92 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.16)] backdrop-blur-2xl">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="block rounded-full px-5 py-3 text-base font-black text-black hover:bg-black/5"
              >
                {item.label}
              </a>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <a href="/chat" onClick={() => setMenuOpen(false)} className="rounded-full bg-black/[0.04] px-5 py-3 text-center text-base font-black">
                Sign In
              </a>
              <a href="/chat" onClick={() => setMenuOpen(false)} className="rounded-full bg-[#1C7178] px-5 py-3 text-center text-base font-black text-white">
                Open Wadi
              </a>
            </div>
          </nav>
        </div>
      </header>

      <section className="relative z-10 px-4 pb-14 pt-36 sm:px-6 lg:pb-20 lg:pt-44">
        <div className="mx-auto grid max-w-[1720px] gap-8 lg:grid-cols-[1fr_420px] lg:items-center">
          <div>
            <div className="minds-eyebrow">{docsCopy.eyebrow}</div>
            <h1 className="mt-5 max-w-4xl text-balance text-4xl font-black leading-tight md:text-6xl">{docsCopy.title}</h1>
            <p className="mt-5 max-w-3xl text-base font-bold leading-8 text-black/62">{docsCopy.subtitle}</p>
          </div>
          <div className="rounded-lg border border-black/10 bg-[#15565c] p-5 text-white shadow-[0_30px_90px_rgba(28,113,120,0.2)]">
            <div className="flex items-center justify-between gap-4 font-mono text-xs font-black text-[#d3edef]">
              <span>POST /api/v1/chat</span>
              <span className="rounded-full bg-[#8fcfd3] px-2 py-1 text-[#15565c]">stream</span>
            </div>
            <Code dark={false}>{`{
  "messages": [
    { "role": "user", "content": "${docsCopy.curlPrompt}" }
  ],
  "stream": true
}`}</Code>
          </div>
        </div>
      </section>

      <section className="relative z-10 px-4 pb-14 sm:px-6">
        <div className="mx-auto grid max-w-[1720px] gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <DocPanel title={docsCopy.endpoint}>
              <div className="grid gap-3 md:grid-cols-3">
                <InfoTile label={docsCopy.method} value="POST" />
                <InfoTile label={docsCopy.path} value="/api/v1/chat" />
                <InfoTile label={docsCopy.auth} value={docsCopy.authValue} />
              </div>
              <Code>{`curl https://your-domain.com/api/v1/chat \\
  -H "Authorization: Bearer sk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [
      { "role": "user", "content": "${docsCopy.curlPrompt}" }
    ]
  }'`}</Code>
            </DocPanel>

            <DocPanel title={docsCopy.paramsTitle}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="text-xs uppercase tracking-wide text-[#1C7178]">
                    <tr>
                      <th className="border-b border-black/10 px-3 py-2 text-start">{docsCopy.parameter}</th>
                      <th className="border-b border-black/10 px-3 py-2 text-start">{docsCopy.type}</th>
                      <th className="border-b border-black/10 px-3 py-2 text-start">{docsCopy.behavior}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docsCopy.params.map(([name, type, detail]) => (
                      <tr key={name} className="border-b border-black/10 last:border-0">
                        <td className="px-3 py-3 font-mono font-black text-[#1C7178]">{name}</td>
                        <td className="px-3 py-3 text-black/70">{type}</td>
                        <td className="px-3 py-3 text-black/70">{detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-sm font-bold leading-6 text-black/58">{docsCopy.gatewayNote}</p>
              <p className="mt-3 text-sm font-bold leading-6 text-black/58">{docsCopy.consoleNote}</p>
            </DocPanel>

            <DocPanel title={docsCopy.useCases}>
              <div className="grid gap-4">
                {docsCopy.useCasesData.map((item) => (
                  <article key={item.title} className="rounded-lg border border-black/10 bg-white/72 p-5">
                    <div className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-[#1C7178]">{item.mode}</div>
                    <h3 className="text-xl font-black">{item.title}</h3>
                    <p className="mt-2 text-sm font-bold leading-6 text-black/62">{item.copy}</p>
                    <Code>{item.payload}</Code>
                  </article>
                ))}
              </div>
            </DocPanel>

            <DocPanel title={docsCopy.streaming}>
              <p className="text-sm font-bold leading-6 text-black/62">{docsCopy.streamingCopy}</p>
              <Code>{`{
  "stream": true,
  "messages": [
    { "role": "user", "content": "Generate five product names." }
  ],
  "temperature": 0.7
}`}</Code>
            </DocPanel>
          </div>

          <aside className="space-y-5">
            <DocPanel title={docsCopy.quota}>
              <ul className="space-y-3 text-sm font-bold leading-6 text-black/62">
                {docsCopy.quotaItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </DocPanel>

            <DocPanel title={docsCopy.capabilities}>
              <ul className="space-y-3 text-sm font-bold leading-6 text-black/62">
                {docsCopy.capabilityItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </DocPanel>

            <DocPanel title={docsCopy.errors}>
              <div className="space-y-3 text-sm text-black/70">
                {errors.map(([label, value]) => (
                  <InfoTile key={label} label={label} value={value} />
                ))}
              </div>
            </DocPanel>
          </aside>
        </div>
      </section>

      <footer className="border-t border-black/10 bg-[#fbfbfa] px-4 py-8 text-sm text-black/58 sm:px-6">
        <div className="mx-auto flex max-w-[1720px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 font-black text-black">
            <WadiLogo />
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            {footerItems.map((item) => (
              <a key={item.href} href={item.href} className="font-black transition hover:text-[#1C7178]">
                {item.label}
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
    <section className="rounded-lg border border-black/10 bg-white/78 p-5 shadow-[0_20px_70px_rgba(28,113,120,0.08)] backdrop-blur-xl">
      <h2 className="mb-4 text-lg font-black text-black">{title}</h2>
      {children}
    </section>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-black/10 bg-[#f7fcfa] p-3">
      <div className="text-xs font-black uppercase tracking-wide text-black/45">{label}</div>
      <div className="mt-1 break-words text-sm font-black text-black">{value}</div>
    </div>
  );
}

function Code({ children, dark = true }: { children: string; dark?: boolean }) {
  return (
    <pre className={`mt-4 overflow-x-auto rounded-lg border p-4 text-xs leading-6 ${dark ? 'border-black/10 bg-[#050505] text-[#d3edef]' : 'border-white/10 bg-black/24 text-[#d3edef]'}`}>
      <code>{children}</code>
    </pre>
  );
}
