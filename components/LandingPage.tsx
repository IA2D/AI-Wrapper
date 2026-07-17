'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiArrowRight } from 'react-icons/fi';
import { landingCopy, nextLocale, type Locale } from '@/lib/i18n';
import { applyTheme, getPreferredTheme, persistTheme } from '@/lib/theme';
import { useLanguage } from './LanguageProvider';
import ThemeToggle from './ThemeToggle';
import WadiLogo from './WadiLogo';

const featureLabels = ['Chat', 'Files', 'API', 'Models'];

type SectionId = 'hero' | 'features' | 'how' | 'cta';
type LandingCopy = (typeof landingCopy)[keyof typeof landingCopy];

const agentDemoCopy = {
  en: {
    eyebrow: 'AI workspace preview',
    title: 'A calm chat layer for files, memory, and API actions.',
    body: 'Ask once, run the agent, and keep the flow moving.',
    link: 'Explore API workflows',
    workspace: 'Wadi workspace',
    week: 'Flows',
    month: 'Actions',
    items: ['Chat', 'Files', 'Memory', 'API'],
    prompt: 'Prepare a response from the uploaded context.',
    userLabel: 'You',
    agentLabel: 'Wadi',
    agentReady: 'Ready to connect chat, files, and API actions.',
    agentRunning: 'Running the next step...',
    doneTitle: 'Updated',
    doneBody: 'The workspace flow is ready.',
    input: 'Ask Wadi to continue...',
    button: 'Run agent',
    running: 'Running...',
    status: 'Live preview',
    summary: 'Flow',
    steps: ['Files', 'Memory', 'Answer'],
  },
  ar: {
    eyebrow: 'معاينة مساحة العمل',
    title: 'طبقة محادثة هادئة للملفات والذاكرة و API.',
    body: 'اسأل مرة، شغل الوكيل، واترك التدفق يتحرك.',
    link: 'استكشف تدفقات API',
    workspace: 'مساحة Wadi',
    week: 'التدفقات',
    month: 'الإجراءات',
    items: ['المحادثة', 'الملفات', 'الذاكرة', 'API'],
    prompt: 'جهز ردا من السياق المرفوع.',
    userLabel: 'أنت',
    agentLabel: 'Wadi',
    agentReady: 'جاهز لربط المحادثة والملفات و API.',
    agentRunning: 'يتم تشغيل الخطوة التالية...',
    doneTitle: 'تم التحديث',
    doneBody: 'تدفق مساحة العمل جاهز.',
    input: 'اطلب من Wadi المتابعة...',
    button: 'شغل الوكيل',
    running: 'يعمل...',
    status: 'معاينة مباشرة',
    summary: 'التدفق',
    steps: ['ملفات', 'ذاكرة', 'إجابة'],
  },
} as const;

export default function LandingPage() {
  const { locale, dir, setLocale } = useLanguage();
  const copy = landingCopy[locale];
  const [activeSection, setActiveSection] = useState<SectionId>('hero');
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const navItems = useMemo(
    () => [
      { id: 'hero' as const, href: '#hero', label: copy.nav.home },
      { id: 'features' as const, href: '#features', label: copy.nav.about },
      { id: 'how' as const, href: '#how', label: copy.nav.resources },
      { id: 'cta' as const, href: '#cta', label: copy.nav.plans },
    ],
    [copy.nav.about, copy.nav.home, copy.nav.plans, copy.nav.resources]
  );

  useEffect(() => {
    const preferredTheme = getPreferredTheme();
    setIsDarkMode(preferredTheme === 'dark');
    applyTheme(preferredTheme);
  }, []);

  const handleThemeChange = useCallback((isDark: boolean) => {
    const nextTheme = isDark ? 'dark' : 'light';
    setIsDarkMode(isDark);
    persistTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  useEffect(() => {
    const revealItems = Array.from(document.querySelectorAll<HTMLElement>('.minds-reveal'));
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -14% 0px', threshold: 0.14 }
    );

    revealItems.forEach((item) => revealObserver.observe(item));
    return () => revealObserver.disconnect();
  }, []);

  useEffect(() => {
    const sectionIds: SectionId[] = ['hero', 'features', 'how', 'cta'];
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visible?.target.id) setActiveSection(visible.target.id as SectionId);
      },
      { rootMargin: '-34% 0px -46% 0px', threshold: [0.12, 0.25, 0.45, 0.6] }
    );

    sectionIds.forEach((id) => {
      const section = document.getElementById(id);
      if (section) sectionObserver.observe(section);
    });

    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      sectionObserver.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
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
    <main className="minds-landing relative min-h-screen overflow-hidden bg-[#fbfbfa] text-[#050505] dark:bg-[#070908] dark:text-white" dir={dir}>
      <ParticleField />
      <header className={`minds-nav fixed inset-x-0 top-0 z-50 ${scrolled || menuOpen ? 'is-solid' : ''}`}>
        <div className="minds-nav-shell flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <a href="/" className="minds-brand-pill" aria-label="Wadi home">
              <WadiLogo />
            </a>

            <nav className="minds-nav-pill hidden items-center lg:flex" aria-label="Primary navigation">
              {navItems.map((item) => (
                <a
                  key={item.id}
                  href={item.href}
                  className={`minds-nav-item ${activeSection === item.id ? 'is-active' : ''}`}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-1.5">
            <a href="/chat" className="minds-action-pill hidden sm:inline-flex">
              {copy.nav.signIn}
            </a>
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
            <a href="/chat" className="minds-action-pill minds-action-primary hidden min-[520px]:inline-flex">
              <span aria-hidden="true" className="minds-arrow"><FiArrowRight /></span>
              {copy.nav.launch}
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
          <nav className="mx-4 rounded-[28px] border border-black/10 bg-white/92 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.16)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#101413]/94">
            {navItems.map((item) => (
              <a
                key={item.id}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={`block rounded-full px-5 py-3 text-base font-black ${
                  activeSection === item.id ? 'bg-black text-white dark:bg-white dark:text-black' : 'text-black hover:bg-black/5 dark:text-white dark:hover:bg-white/8'
                }`}
              >
                {item.label}
              </a>
            ))}
          <div className="mt-2 grid grid-cols-2 gap-2">
              <a href="/chat" onClick={() => setMenuOpen(false)} className="rounded-full bg-black/[0.04] px-5 py-3 text-center text-base font-black dark:bg-white/8 dark:text-white">
                {copy.nav.signIn}
              </a>
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
              <a href="/chat" onClick={() => setMenuOpen(false)} className="rounded-full bg-[#1C7178] px-5 py-3 text-center text-base font-black text-white">
                {copy.nav.launch}
              </a>
            </div>
          </nav>
        </div>
      </header>

      <section id="hero" className="minds-hero relative z-10 min-h-screen overflow-hidden px-4 pt-24 sm:px-6">
        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-6rem)] max-w-[1800px] items-center">
          <div className="minds-reveal is-visible w-full max-w-[900px] pb-16 pt-16 lg:ms-[5vw] lg:pb-24 lg:pt-24">
            <h1 className="max-w-[820px] text-balance text-3xl font-black leading-tight tracking-normal text-black min-[430px]:text-4xl sm:text-5xl lg:text-[4rem] 2xl:text-[4.75rem] dark:text-white">
              {copy.hero.title}
            </h1>

            <div className="mt-7 max-w-[680px] border-s border-black ps-6 dark:border-white">
              <p className="text-pretty text-sm font-bold leading-7 text-black sm:text-base dark:text-white/72">
                {copy.hero.subtitle}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a href="/docs/api" className="minds-soft-pill">
                  {copy.hero.secondary}
                </a>
                <a href="/chat" className="minds-soft-pill minds-soft-strong">
                  <span aria-hidden="true" className="minds-arrow"><FiArrowRight /></span>
                  {copy.hero.primary}
                </a>
              </div>
            </div>
          </div>
        </div>

      </section>

      <AgentDemoSection locale={locale} />

      <section id="features" className="minds-section relative z-10 px-4 py-24 sm:px-6 lg:py-32">
        <div className="minds-reveal mx-auto max-w-[1720px]">
          <div className="grid gap-12 lg:grid-cols-[0.55fr_1.45fr] lg:items-end">
            <SectionIntro eyebrow={copy.sections.platform.eyebrow} title={copy.sections.platform.title} body={copy.sections.platform.copy} />
            <WorkspaceDemo copy={copy} />
          </div>
        </div>
      </section>

      <section id="how" className="minds-section minds-late-section relative z-10 overflow-hidden px-4 py-24 sm:px-6 lg:py-32">
        <div className="minds-late-background" aria-hidden="true" />
        <div className="minds-reveal relative mx-auto max-w-[1720px]">
          <SectionIntro eyebrow={copy.sections.services.eyebrow} title={copy.sections.services.title} body={copy.sections.services.copy} />
          <GroupShowcase copy={copy} />
        </div>
      </section>

      <section id="cta" className="relative z-10 overflow-hidden bg-black px-4 py-24 text-white sm:px-6 lg:py-32">
        <div className="minds-cta-field absolute inset-0" aria-hidden="true" />
        <div className="minds-reveal relative mx-auto grid max-w-[1720px] gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="minds-eyebrow text-[#8fcfd3]">{copy.sections.developers.eyebrow}</div>
            <h2 className="mt-5 max-w-3xl text-balance text-3xl font-black leading-tight sm:text-4xl lg:text-[3.75rem]">
              {copy.cta.title}
            </h2>
            <p className="mt-5 max-w-2xl text-sm font-bold leading-7 text-white/68 sm:text-base">{copy.cta.copy}</p>
          </div>

          <div className="flex flex-wrap gap-3 lg:justify-end">
            <a href="/docs/api" className="minds-dark-pill">
              {copy.cta.secondary}
            </a>
            <a href="/chat" className="minds-dark-pill minds-dark-primary">
              <span aria-hidden="true" className="minds-arrow"><FiArrowRight /></span>
              {copy.cta.primary}
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-black/10 bg-[#fbfbfa] px-4 py-8 text-sm text-black/58 sm:px-6 dark:border-white/10 dark:bg-[#070908] dark:text-white/58">
        <div className="mx-auto flex max-w-[1720px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 font-black text-black dark:text-white">
            <WadiLogo />
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            {copy.footer.map((item, index) => (
              <a
                key={item}
                href={['#features', '/chat', '#cta', '/docs/api'][index]}
                className="font-black transition hover:text-[#1C7178] dark:hover:text-[#8fcfd3]"
              >
                {item}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </main>
  );
}

function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let animationId = 0;
    let width = 0;
    let height = 0;
    let scrollProgress = 0;
    let scrollPulse = 0;
    let targetScrollPulse = 0;
    let smoothedEnergy = 0;
    let lastScrollY = window.scrollY;
    let isDarkTheme = document.documentElement.classList.contains('dark');
    let particles: {
      baseX: number;
      baseY: number;
      phase: number;
      drift: number;
      radius: number;
      alpha: number;
      color: string;
    }[] = [];

    const random = createRandom(26071988);

    const createCluster = (
      centerX: number,
      centerY: number,
      spreadX: number,
      spreadY: number,
      count: number,
      colors: string[]
    ) => {
      for (let index = 0; index < count; index += 1) {
        const angle = random() * Math.PI * 2;
        const distance = Math.sqrt(random());
        const wobble = 0.58 + random() * 0.58;

        particles.push({
          baseX: centerX + Math.cos(angle) * spreadX * distance * wobble,
          baseY: centerY + Math.sin(angle) * spreadY * distance * wobble,
          phase: random() * Math.PI * 2,
          drift: 0.6 + random() * 1.35,
          radius: 2.2 + random() * 2.5,
          alpha: 0.62 + random() * 0.34,
          color: colors[Math.floor(random() * colors.length)],
        });
      }
    };

    const getParticleColors = () => {
      if (isDarkTheme) {
        return {
          core: ['#d3edef', '#8fcfd3', '#4ba3aa'],
          edge: ['#8fcfd3', '#62b8be', '#d3edef'],
          deep: ['#4ba3aa', '#8fcfd3', '#15565c'],
          line: '#8fcfd3',
          stroke: '#d3edef',
        };
      }

      return {
        core: ['#8fcfd3', '#4ba3aa', '#15565c'],
        edge: ['#8fcfd3', '#4ba3aa', '#d3edef'],
        deep: ['#8fcfd3', '#4ba3aa', '#15565c'],
        line: '#1c7178',
        stroke: '#1c7178',
      };
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      const density = width < 700 ? 0.38 : width < 1100 ? 0.56 : 0.82;
      const colors = getParticleColors();
      particles = [];
      createCluster(width * 0.31, height * 0.31, width * 0.18, height * 0.15, Math.floor(1050 * density), colors.deep);
      createCluster(width * 0.65, height * 0.69, width * 0.22, height * 0.16, Math.floor(980 * density), colors.edge);
      createCluster(width * 0.73, height * 0.2, width * 0.14, height * 0.1, Math.floor(640 * density), colors.core);
      createCluster(width * 0.55, height * 0.47, width * 0.34, height * 0.22, Math.floor(240 * density), colors.core);
    };

    const updateScrollProgress = () => {
      const nextScrollY = window.scrollY;
      const scrollDelta = Math.abs(nextScrollY - lastScrollY);
      lastScrollY = nextScrollY;
      targetScrollPulse = Math.min(0.42, targetScrollPulse + scrollDelta / Math.max(window.innerHeight * 4.5, 1));
      scrollProgress = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 1.05)));
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);
      const colors = getParticleColors();
      const fadeStart = 0.58;
      const fadeEnd = 0.92;
      const fadeOut = scrollProgress <= fadeStart ? 1 : Math.max(0, 1 - (scrollProgress - fadeStart) / (fadeEnd - fadeStart));
      const activeScroll = Math.min(scrollProgress, 0.72);
      const expansion = 1 + activeScroll * 0.62;
      scrollPulse += (targetScrollPulse - scrollPulse) * 0.08;
      const energyTarget = prefersReducedMotion ? activeScroll : Math.min(0.72, activeScroll * 0.78 + scrollPulse * 0.42);
      smoothedEnergy += (energyTarget - smoothedEnergy) * 0.075;
      const animationEnergy = smoothedEnergy;
      const radiusBoost = 1 + activeScroll * 1.12 + animationEnergy * 0.22;
      const speedBoost = 1 + activeScroll * 1.25 + animationEnergy * 0.7;
      const lineAlpha = (activeScroll * 0.2 + animationEnergy * 0.08) * fadeOut;
      const darkGlow = isDarkTheme ? 1 : 0;
      const centerX = width * 0.52;
      const centerY = height * 0.5;

      const plotted: { x: number; y: number; radius: number; alpha: number; color: string }[] = [];

      for (let particleIndex = 0; particleIndex < particles.length; particleIndex += 1) {
        const particle = particles[particleIndex];
        const motion = prefersReducedMotion ? 0 : frame * 0.022 * speedBoost * particle.drift;
        const expandedX = centerX + (particle.baseX - centerX) * expansion;
        const expandedY = centerY + (particle.baseY - centerY) * expansion;
        const swirlAngle = particle.phase + motion * 0.46 + frame * 0.0035 * animationEnergy;
        const swirlDistance = animationEnergy * (3.5 + particle.drift * 6);
        const breathe = prefersReducedMotion
          ? 1
          : 1 + animationEnergy * (0.06 + (Math.sin(frame * 0.035 + particle.phase * 2.1) + 1) * 0.06);
        const x =
          expandedX +
          Math.cos(particle.phase + motion) * (7 + activeScroll * 16) +
          Math.cos(swirlAngle) * swirlDistance;
        const y =
          expandedY +
          Math.sin(particle.phase * 0.8 + motion) * (5.5 + activeScroll * 13) +
          Math.sin(swirlAngle) * swirlDistance;
        const radius = particle.radius * radiusBoost * breathe;

        if (animationEnergy > 0.2 && particleIndex % 37 === 0) {
          const ringPhase = (Math.sin(frame * 0.04 + particle.phase * 3) + 1) / 2;
          context.beginPath();
          context.arc(x, y, radius + 4 + ringPhase * 10 * animationEnergy, 0, Math.PI * 2);
          context.strokeStyle = particle.color;
          context.lineWidth = 0.45 + animationEnergy * 0.35;
          context.globalAlpha = (0.04 + ringPhase * 0.09) * animationEnergy * fadeOut;
          context.stroke();
        }

        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fillStyle = particle.color;
        context.shadowColor = isDarkTheme ? particle.color : 'transparent';
        context.shadowBlur = isDarkTheme ? 8 + animationEnergy * 10 : 0;
        context.globalAlpha = Math.min(1, particle.alpha + animationEnergy * 0.08 + darkGlow * 0.1) * fadeOut;
        context.fill();
        context.lineWidth = 0.85 + activeScroll * 0.6;
        context.shadowBlur = 0;
        context.strokeStyle = colors.stroke;
        context.globalAlpha = Math.min(1, particle.alpha + 0.08 + animationEnergy * 0.06 + darkGlow * 0.08) * fadeOut;
        context.stroke();
        plotted.push({ x, y, radius, alpha: particle.alpha, color: particle.color });
      }

      if (lineAlpha > 0.01) {
        context.lineWidth = 0.65 + animationEnergy * 0.28;
        context.strokeStyle = colors.line;
        const stride = animationEnergy > 0.5 ? 12 : 16;
        for (let index = 0; index < plotted.length; index += stride) {
          const point = plotted[index];
          const next = plotted[(index + 29 + Math.floor(frame * 0.035 * animationEnergy)) % plotted.length];
          const dx = point.x - next.x;
          const dy = point.y - next.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 170 + activeScroll * 220) {
            const wave = prefersReducedMotion ? 1 : 0.78 + Math.sin(frame * 0.025 + index * 0.13) * 0.22;
            context.globalAlpha = lineAlpha * wave * Math.max(0, 1 - distance / 360);
            context.beginPath();
            context.moveTo(point.x, point.y);
            context.lineTo(next.x, next.y);
            context.stroke();
          }
        }
      }

      context.globalAlpha = 1;
      context.shadowBlur = 0;
      frame += 1;
      targetScrollPulse *= 0.9;
      if (!prefersReducedMotion) animationId = window.requestAnimationFrame(draw);
    };

    const syncTheme = () => {
      const nextIsDark = document.documentElement.classList.contains('dark');
      if (nextIsDark === isDarkTheme) return;
      isDarkTheme = nextIsDark;
      resize();
    };

    const themeObserver = new MutationObserver(syncTheme);

    resize();
    updateScrollProgress();
    draw();
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', updateScrollProgress, { passive: true });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', updateScrollProgress);
      themeObserver.disconnect();
      window.cancelAnimationFrame(animationId);
    };
  }, []);

  return <canvas ref={canvasRef} className="minds-particle-field fixed inset-0 h-full w-full" aria-hidden="true" />;
}

function createRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function WorkspaceDemo({
  copy,
}: {
  copy: LandingCopy;
}) {
  return (
    <div className="minds-workspace-shell">
      <div className="minds-workspace-sidebar">
        <div className="flex items-center gap-3">
          <WadiLogo />
        </div>
        <div className="mt-8 space-y-2">
          {copy.cards.map((card, index) => (
            <div key={card.title} className={`minds-sidebar-row ${index === 0 ? 'is-active' : ''}`}>
              <span className="minds-sidebar-dot" />
              {featureLabels[index]}
            </div>
          ))}
        </div>
      </div>

      <div className="minds-workspace-main">
        <div className="minds-workspace-top">
          <div>
            <div className="minds-card-label">{copy.graph.nodes[0]}</div>
            <h3 className="mt-2 text-xl font-black leading-tight">{copy.graph.prompt}</h3>
          </div>
          <button type="button" className="minds-mini-button" aria-label="Workspace menu">
            <span />
            <span />
            <span />
          </button>
        </div>

        <div className="minds-chat-card">
          <div className="minds-chat-meta" aria-hidden="true">
            <span />
            <span />
            <strong>streaming</strong>
          </div>
          <p>{copy.graph.answer}</p>
          <div className="mt-5 rounded-full bg-[#e7f5f6] px-4 py-3 font-mono text-xs font-black text-[#1C7178]">
            {copy.graph.formula}
          </div>
          <div className="minds-token-trace" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>

        <div className="minds-feature-strip">
          {copy.cards.map((card, index) => (
            <article key={card.title} className="minds-demo-card" style={{ transitionDelay: `${index * 70}ms` }}>
              <span className="minds-card-number">{String(index + 1).padStart(2, '0')}</span>
              <h4>{card.title}</h4>
              <p>{card.copy}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentDemoSection({ locale }: { locale: Locale }) {
  const copy = agentDemoCopy[locale];
  const [isRunning, setIsRunning] = useState(false);
  const [runs, setRuns] = useState(0);

  const runAgent = () => {
    if (isRunning) return;
    setIsRunning(true);
    window.setTimeout(() => {
      setRuns((value) => value + 1);
      setIsRunning(false);
    }, 950);
  };

  return (
    <section className="minds-agent-section relative z-10 overflow-hidden px-4 py-20 text-white sm:px-6 lg:py-28">
      <div className="minds-agent-bg" aria-hidden="true" />
      <div className="minds-reveal relative mx-auto grid max-w-[1720px] gap-12 lg:grid-cols-[1.18fr_0.82fr] lg:items-center">
        <div className="minds-agent-window is-soft-preview" aria-label={copy.workspace}>
          <div className="minds-agent-chrome">
            <div className="minds-agent-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="minds-agent-address">wadi.ai/agent</div>
            <div className={`minds-agent-status ${isRunning ? 'is-running' : ''}`}>
              <span />
              {copy.status}
            </div>
          </div>

          <div className="minds-agent-app">
            <aside className="minds-agent-sidebar">
              <WadiLogo showText={false} className="minds-agent-mark" />
              <p>{copy.week}</p>
              {copy.items.slice(0, 3).map((item, index) => (
                <button key={item} type="button" className={`minds-agent-nav ${index === 0 ? 'is-active' : ''}`}>
                  <span />
                  {item}
                </button>
              ))}
              <p>{copy.month}</p>
              <button type="button" className="minds-agent-nav">
                <span />
                {copy.items[3]}
              </button>
            </aside>

            <div className="minds-agent-thread">
              <div className="minds-agent-title">{copy.workspace}</div>

              <div className="minds-agent-message is-user">
                <strong>{copy.userLabel}</strong>
                <p>{copy.prompt}</p>
              </div>

              <div className={`minds-agent-message is-ai ${isRunning ? 'is-running' : ''}`}>
                <strong>{copy.agentLabel}</strong>
                <p>{isRunning ? copy.agentRunning : copy.agentReady}</p>
              </div>

              <div className="minds-agent-preview" aria-hidden="true">
                <div>
                  <span />
                  <span />
                  <span />
                </div>
                <div className="minds-agent-chart">
                  <i />
                  <i />
                  <i />
                </div>
              </div>

              <div className="minds-agent-summary">
                <span>{copy.summary}</span>
                <div>
                  {copy.steps.map((step, index) => (
                    <strong key={step} className={index <= Math.min(runs, 2) || isRunning ? 'is-active' : ''}>
                      {step}
                    </strong>
                  ))}
                </div>
              </div>

              {runs > 0 && (
                <div className="minds-agent-message is-done">
                  <strong>{copy.doneTitle}</strong>
                  <p>{copy.doneBody}</p>
                </div>
              )}

              <div className="minds-agent-compose">
                <span>{copy.input}</span>
                <button type="button" onClick={runAgent} className="minds-agent-run" disabled={isRunning}>
                  {isRunning ? copy.running : copy.button}
                  <span aria-hidden="true" className="minds-icon-rtl-flip"><FiArrowRight /></span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="minds-agent-copy">
          <div className="minds-eyebrow text-[#8fcfd3]">{copy.eyebrow}</div>
          <h2>{copy.title}</h2>
          <p>{copy.body}</p>
          <a href="/docs/api">
            {copy.link}
            <span aria-hidden="true" className="minds-icon-rtl-flip"><FiArrowRight /></span>
          </a>
        </div>
      </div>
    </section>
  );
}

function GroupShowcase({
  copy,
}: {
  copy: LandingCopy;
}) {
  return (
    <div className="mt-16">
      <div className="minds-group-stage">
        {copy.rails.map(([title, body], index) => (
          <article key={title} className={`minds-group-card minds-group-card-${index + 1}`}>
            <div className="minds-network-scene" aria-hidden="true">
              <div className="minds-card-endpoint">
                <span>{index === 1 ? 'API' : index === 2 ? 'LLM' : index === 3 ? 'ADM' : 'CTX'}</span>
              </div>
              {Array.from({ length: 16 }).map((_, dotIndex) => (
                <span key={dotIndex} className={`minds-network-dot minds-network-dot-${dotIndex + 1}`} />
              ))}
              <div className="minds-card-scanline" />
            </div>
            <div className="minds-group-copy">
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          </article>
        ))}
      </div>

      <div className="minds-source-strip">
        <span>{copy.developer.title}</span>
        {copy.developer.pills.map((pill) => (
          <strong key={pill}>{pill}</strong>
        ))}
      </div>
    </div>
  );
}

function SectionIntro({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div>
      <div className="minds-eyebrow">{eyebrow}</div>
      <h2 className="mt-5 max-w-3xl text-balance text-3xl font-black leading-tight sm:text-4xl lg:text-[3.5rem]">
        {title}
      </h2>
      <p className="mt-5 max-w-2xl text-sm font-bold leading-7 text-black/62 sm:text-base dark:text-white/64">{body}</p>
    </div>
  );
}
