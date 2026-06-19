import SiteFooter from './SiteFooter';

const lanes = Array.from({ length: 18 }, (_, index) => index);
const gridLines = Array.from({ length: 16 }, (_, index) => index);

const capabilities = [
  {
    title: 'Text agents',
    copy: 'Ship chat, analysis, workflow assistants, and internal copilots with metered API keys.',
    accent: 'border-cyan-300/50',
  },
  {
    title: 'Image intelligence',
    copy: 'Allow image input only for the keys that should inspect screenshots, designs, receipts, or field photos.',
    accent: 'border-emerald-300/50',
  },
  {
    title: 'Voice workflows',
    copy: 'Route voice notes and audio prompts through the same quota system as text and image traffic.',
    accent: 'border-amber-300/50',
  },
  {
    title: 'Video-ready access',
    copy: 'Prepare dedicated keys for video payloads with separate permissions and budget controls.',
    accent: 'border-fuchsia-300/50',
  },
];

const telemetry = [
  ['Requests', 'per day, week, month, or year'],
  ['Tokens', 'estimated or provider-reported'],
  ['Modes', 'text, image, voice, video'],
  ['Access', 'dashboard, docs, public API'],
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="relative min-h-[92vh] overflow-hidden border-b border-white/10">
        <div className="future-scene" aria-hidden="true">
          <div className="future-grid">
            {gridLines.map((line) => (
              <span key={`h-${line}`} className="future-grid-line future-grid-line-h" style={{ top: `${line * 7}%` }} />
            ))}
            {gridLines.map((line) => (
              <span key={`v-${line}`} className="future-grid-line future-grid-line-v" style={{ left: `${line * 7}%` }} />
            ))}
          </div>
          {lanes.map((lane) => (
            <span
              key={lane}
              className="future-lane"
              style={{
                left: `${6 + lane * 5.3}%`,
                animationDelay: `${lane * -0.38}s`,
                animationDuration: `${4.8 + (lane % 5) * 0.45}s`,
              }}
            />
          ))}
          <div className="future-core">
            <div className="future-ring future-ring-a" />
            <div className="future-ring future-ring-b" />
            <div className="future-console">
              <span>API GATEWAY</span>
              <strong>LIVE</strong>
              <small>quota-aware multimodal routing</small>
            </div>
          </div>
        </div>

        <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-4 py-5">
          <a href="/" className="text-sm font-semibold tracking-[0.24em] text-cyan-100">AI CHAT</a>
          <nav className="flex items-center gap-2 text-sm">
            <a href="/docs/api" className="rounded-lg px-3 py-2 text-slate-200 hover:bg-white/10">Docs</a>
            <a href="/chat" className="rounded-lg bg-white px-4 py-2 font-medium text-slate-950 hover:bg-cyan-100">Open Chat</a>
          </nav>
        </header>

        <div className="relative z-10 mx-auto flex min-h-[calc(92vh-80px)] max-w-7xl items-center px-4 pb-16 pt-10">
          <div className="max-w-4xl">
            <div className="mb-5 inline-flex rounded-lg border border-cyan-300/40 bg-slate-950/70 px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100">
              Admin-controlled AI infrastructure
            </div>
            <h1 className="max-w-4xl text-5xl font-semibold leading-tight text-white md:text-7xl">
              AI Chat API Platform
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-200">
              A futuristic control plane for chat, public API access, multimodal permissions, and live usage governance.
              Create keys, choose allowed media types, meter tokens, and keep RAG separate from external API traffic.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="/chat" className="rounded-lg bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-200">
                Launch Chat
              </a>
              <a href="/docs/api" className="rounded-lg border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15">
                Read API Docs
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-slate-900 px-4 py-14">
        <div className="mx-auto grid max-w-7xl gap-3 md:grid-cols-4">
          {telemetry.map(([label, copy]) => (
            <div key={label} className="rounded-lg border border-white/10 bg-slate-950 p-5">
              <div className="text-sm font-semibold text-cyan-200">{label}</div>
              <div className="mt-2 text-sm leading-6 text-slate-300">{copy}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-slate-950 px-4 py-16">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold text-white">One gateway, four media modes.</h2>
            <p className="mt-3 text-slate-300">
              Give every integration exactly the access it needs. Text can be broad, image can be restricted,
              voice can be budgeted, and video can wait behind a dedicated key.
            </p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {capabilities.map((item) => (
              <article key={item.title} className={`rounded-lg border ${item.accent} bg-slate-900 p-5`}>
                <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">{item.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-cyan-300 px-4 py-14 text-slate-950">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-semibold">Ready for governed AI access?</h2>
            <p className="mt-2 max-w-2xl text-slate-800">
              Open the chat, create admin API keys, and publish your integration with detailed public docs.
            </p>
          </div>
          <a href="/docs/api" className="inline-flex rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800">
            Explore API docs
          </a>
        </div>
      </section>

      <SiteFooter variant="dark" />
    </main>
  );
}
