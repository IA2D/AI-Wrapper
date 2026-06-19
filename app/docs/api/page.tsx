import SiteFooter from '@/components/SiteFooter';

const baseUrl = process.env.BASE_URL?.replace(/\/$/, '') || 'http://localhost:3000';

const params = [
  ['messages', 'array', 'Required. OpenAI-style chat messages. Supports text strings or multimodal content arrays.'],
  ['model', 'string', 'Optional. Defaults to the server MODEL env value. Passed through to the provider.'],
  ['stream', 'boolean', 'Optional. Returns server-sent events when true. Defaults to false.'],
  ['temperature', 'number', 'Optional. Provider sampling control, passed through unchanged.'],
  ['top_p', 'number', 'Optional. Provider nucleus sampling control, passed through unchanged.'],
  ['max_tokens', 'number', 'Optional. Maximum generated tokens for chat-completion providers.'],
  ['max_completion_tokens', 'number', 'Optional. Alternative output-token cap for compatible providers.'],
  ['stop', 'string | array', 'Optional. Stop sequence or sequences, passed through unchanged.'],
  ['presence_penalty', 'number', 'Optional. Passed through when supported by the provider.'],
  ['frequency_penalty', 'number', 'Optional. Passed through when supported by the provider.'],
  ['response_format', 'object', 'Optional. JSON/object response format options for compatible providers.'],
  ['tools', 'array', 'Optional. Function/tool definitions for compatible chat providers.'],
  ['tool_choice', 'string | object', 'Optional. Tool selection instruction for compatible providers.'],
  ['seed', 'number', 'Optional. Determinism hint for compatible providers.'],
  ['user', 'string', 'Optional. End-user identifier forwarded to compatible providers.'],
  ['metadata', 'object', 'Optional. Forwarded to providers that accept request metadata.'],
];

const useCases = [
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
  {
    title: 'Video-ready requests',
    mode: 'video',
    copy: 'Reserve separate keys and budgets for video payloads. Provider support varies, but the gateway can enforce video permissions now.',
    payload: `{
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "Describe the visible sequence." },
        { "type": "video_url", "video_url": { "url": "https://example.com/clip.mp4" } }
      ]
    }
  ]
}`,
  },
];

export default function ApiDocsPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10 bg-slate-950 px-4 py-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <a href="/" className="text-sm font-semibold tracking-[0.24em] text-cyan-100">AI CHAT API</a>
          <nav className="flex items-center gap-2 text-sm">
            <a href="/" className="rounded-lg px-3 py-2 text-slate-200 hover:bg-white/10">Landing</a>
            <a href="/api-console" className="rounded-lg px-3 py-2 text-slate-200 hover:bg-white/10">API Console</a>
            <a href="/chat" className="rounded-lg bg-cyan-300 px-4 py-2 font-semibold text-slate-950 hover:bg-cyan-200">Open Chat</a>
          </nav>
        </div>
      </header>

      <section className="border-b border-white/10 bg-slate-900 px-4 py-14">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex rounded-lg border border-cyan-300/40 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
              Public endpoint, no RAG
            </div>
            <h1 className="text-4xl font-semibold leading-tight md:text-6xl">API Usage Documentation</h1>
            <p className="mt-5 text-lg leading-8 text-slate-300">
              Use admin-created keys to call the public chat endpoint directly. Requests are metered against API key quotas
              and never use the RAG service or private chat-session document context.
            </p>
          </div>
        </div>
      </section>

      <section className="px-4 py-12">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <DocPanel title="Endpoint">
              <div className="grid gap-3 md:grid-cols-3">
                <InfoTile label="Method" value="POST" />
                <InfoTile label="Path" value="/api/v1/chat" />
                <InfoTile label="Auth" value="Bearer API key" />
              </div>
              <Code>{`curl ${baseUrl}/api/v1/chat \\
  -H "Authorization: Bearer sk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [
      { "role": "user", "content": "Write a launch announcement." }
    ]
  }'`}</Code>
            </DocPanel>

            <DocPanel title="Supported Parameters">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-cyan-100">
                    <tr>
                      <th className="border-b border-white/10 px-3 py-2">Parameter</th>
                      <th className="border-b border-white/10 px-3 py-2">Type</th>
                      <th className="border-b border-white/10 px-3 py-2">Behavior</th>
                    </tr>
                  </thead>
                  <tbody>
                    {params.map(([name, type, detail]) => (
                      <tr key={name} className="border-b border-white/10 last:border-0">
                        <td className="px-3 py-3 font-mono text-cyan-200">{name}</td>
                        <td className="px-3 py-3 text-slate-300">{type}</td>
                        <td className="px-3 py-3 text-slate-300">{detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-sm text-slate-400">
                The gateway validates the API key, required `messages`, capability permissions, and quota. Other request fields are forwarded
                to the configured provider, so exact support depends on your provider and selected model.
              </p>
              <p className="mt-3 text-sm text-slate-400">
                Assigned users can open `/api-console` to view their keys, limits, usage, and ready-to-copy commands.
              </p>
            </DocPanel>

            <DocPanel title="Use Cases">
              <div className="grid gap-4">
                {useCases.map((item) => (
                  <article key={item.title} className="rounded-lg border border-white/10 bg-slate-950 p-5">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">{item.mode}</div>
                    <h3 className="text-xl font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{item.copy}</p>
                    <Code>{item.payload}</Code>
                  </article>
                ))}
              </div>
            </DocPanel>

            <DocPanel title="Streaming">
              <p className="text-sm leading-6 text-slate-300">
                Set `stream` to `true` to receive server-sent events. Streamed output is still metered; if the provider does not report
                usage for the stream, output tokens are estimated from the generated text.
              </p>
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
            <DocPanel title="Quota Model">
              <ul className="space-y-3 text-sm leading-6 text-slate-300">
                <li>Limits can be per day, week, month, or year.</li>
                <li>Admins can limit requests, tokens, both, or neither.</li>
                <li>An unlimited-until date bypasses limits until it expires.</li>
                <li>Usage appears in the admin API usage tab.</li>
              </ul>
            </DocPanel>

            <DocPanel title="Capability Detection">
              <ul className="space-y-3 text-sm leading-6 text-slate-300">
                <li>`image_url` or image media requires image access.</li>
                <li>`audio_url`, `input_audio`, or audio media requires voice access.</li>
                <li>`video_url` or video media requires video access.</li>
                <li>Plain string messages require text access.</li>
              </ul>
            </DocPanel>

            <DocPanel title="Error Responses">
              <div className="space-y-3 text-sm text-slate-300">
                <InfoTile label="401" value="Missing or invalid API key" />
                <InfoTile label="403" value="Capability disabled" />
                <InfoTile label="429" value="Quota exceeded" />
                <InfoTile label="502" value="Provider request failed" />
              </div>
            </DocPanel>
          </aside>
        </div>
      </section>

      <SiteFooter variant="dark" />
    </main>
  );
}

function DocPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-slate-900 p-5 shadow-2xl shadow-black/20">
      <h2 className="mb-4 text-lg font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950 p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-4 overflow-x-auto rounded-lg border border-white/10 bg-black p-4 text-xs leading-6 text-cyan-50">
      <code>{children}</code>
    </pre>
  );
}
