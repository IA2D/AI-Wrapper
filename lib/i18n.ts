export type Locale = 'en' | 'ar';

export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'wadi-locale';
export const LEGACY_LOCALE_COOKIE = 'aicrab-locale';

export const locales: Locale[] = ['en', 'ar'];

export const localeLabels: Record<Locale, string> = {
  en: 'English',
  ar: 'العربية',
};

export const localeDirections: Record<Locale, 'ltr' | 'rtl'> = {
  en: 'ltr',
  ar: 'rtl',
};

export function isLocale(value: string | null | undefined): value is Locale {
  return value === 'en' || value === 'ar';
}

export function getLocaleFromCookieValue(value: string | null | undefined): Locale | null {
  return isLocale(value) ? value : null;
}

export function nextLocale(locale: Locale): Locale {
  return locale === 'en' ? 'ar' : 'en';
}

export function getBrowserLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  const stored = window.localStorage.getItem('wadi-locale') || window.localStorage.getItem('aicrab-locale');
  if (isLocale(stored)) return stored;

  const cookieLocale = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith('wadi-locale=') || cookie.startsWith('aicrab-locale='))
    ?.split('=')[1];
  if (isLocale(cookieLocale)) return cookieLocale;

  const language = window.navigator.language.toLowerCase();
  return language.startsWith('ar') ? 'ar' : 'en';
}

export const landingCopy = {
  en: {
    brand: {
      name: 'Wadi',
      label: 'AI services',
    },
    nav: {
      home: 'Home',
      about: 'About',
      resources: 'Resources',
      plans: 'Plans',
      signIn: 'Sign In',
      platform: 'Platform',
      chat: 'Chat',
      developers: 'Developers',
      language: 'العربية',
      launch: 'Open Wadi',
    },
    hero: {
      eyebrow: 'AI chat, documents, and APIs',
      title: 'Your AI service layer for conversations and products.',
      subtitle:
        'Wadi brings an AI workspace, file-aware tools, Arabic and English support, and developer endpoints into one clean AI platform powered by accessible models.',
      primary: 'Start with chat',
      secondary: 'Read API docs',
      chips: ['Ask naturally', 'Attach files', 'Create documents', 'Connect apps'],
    },
    graph: {
      center: 'Wadi core',
      nodes: ['Chat', 'Files', 'Docs', 'Voice', 'API', 'Admin'],
      prompt: 'How can I turn this file into a clean proposal?',
      answer: 'I can read it, structure it, and prepare an export-ready draft.',
      formula: 'context + model + tools -> useful output',
    },
    sections: {
      platform: {
        eyebrow: 'The workspace',
        title: 'Built for people who need answers, not model plumbing.',
        copy:
          'The main experience is a fast assistant workspace: prompts, uploads, memory, generated files, flowcharts, and long responses all live in one place.',
      },
      services: {
        eyebrow: 'Service layer',
        title: 'The same intelligence can power the interface and your product.',
        copy:
          'Wadi is useful as an app and as infrastructure. Managed API keys let other tools call the AI service while keeping access, limits, and usage visible.',
      },
      developers: {
        eyebrow: 'For builders',
        title: 'Connect Wadi to the products and workflows you already run.',
        copy:
          'Use Wadi as a hosted assistant, an internal AI tool, or a developer-facing API layer with clear keys, routes, and usage boundaries.',
      },
    },
    cards: [
      {
        title: 'Assistant chat',
        copy: 'A familiar conversation surface for reasoning, writing, research, and everyday work.',
      },
      {
        title: 'Files and documents',
        copy: 'Analyze uploads, generate reports, build documents, and keep outputs tied to the conversation.',
      },
      {
        title: 'API endpoints',
        copy: 'Expose chat completions and AI capabilities to apps through managed keys and usage controls.',
      },
      {
        title: 'Model access',
        copy: 'Route prompts to available models and keep the service flexible as your AI stack changes.',
      },
    ],
    rails: [
      ['User asks', 'The chat workspace accepts natural language, files, and context.'],
      ['Wadi routes', 'The platform chooses the service path: chat, document, flow, voice, or API.'],
      ['Model responds', 'Accessible model providers produce answers, drafts, or structured outputs.'],
      ['Usage stays clear', 'Admins can govern keys, limits, users, and API consumption.'],
    ],
    developer: {
      title: 'For developers, Wadi becomes an AI backend.',
      copy:
        'Use API docs and assigned keys to connect external apps to the same assistant service that powers the workspace.',
      code: ['POST /api/v1/chat', 'Authorization: Bearer wk_...', 'model: default', 'stream: true'],
      pills: ['Hosted assistant', 'Product API', 'Workflow automation'],
    },
    cta: {
      title: 'Start with the workspace. Grow into the API.',
      copy: 'Open Wadi for chat now, then connect your product when you are ready to automate the same intelligence.',
      primary: 'Open Wadi',
      secondary: 'Developer docs',
    },
    footer: ['Platform', 'Chat', 'Developers', 'API Docs'],
  },
  ar: {
    brand: {
      name: 'Wadi',
      label: 'خدمات ذكاء اصطناعي',
    },
    nav: {
      home: 'الرئيسية',
      about: 'عن Wadi',
      resources: 'الموارد',
      plans: 'الخطط',
      signIn: 'تسجيل الدخول',
      platform: 'المنصة',
      chat: 'المحادثة',
      developers: 'للمطورين',
      language: 'English',
      launch: 'افتح Wadi',
    },
    hero: {
      eyebrow: 'محادثة وملفات وواجهات API',
      title: 'طبقة خدمات ذكاء اصطناعي للمحادثات والمنتجات.',
      subtitle:
        'يجمع Wadi بين مساحة عمل للذكاء الاصطناعي، وأدوات تفهم الملفات، ودعم العربية والإنجليزية، ونقاط API للمطورين داخل منصة واحدة تعمل بنماذج متاحة.',
      primary: 'ابدأ بالمحادثة',
      secondary: 'اقرأ توثيق API',
      chips: ['اسأل بطبيعية', 'أرفق الملفات', 'أنشئ المستندات', 'اربط التطبيقات'],
    },
    graph: {
      center: 'نواة Wadi',
      nodes: ['محادثة', 'ملفات', 'مستندات', 'صوت', 'API', 'إدارة'],
      prompt: 'كيف أحول هذا الملف إلى عرض مرتب؟',
      answer: 'يمكنني قراءته، تنظيمه، وتجهيز مسودة قابلة للتصدير.',
      formula: 'السياق + النموذج + الأدوات -> مخرج مفيد',
    },
    sections: {
      platform: {
        eyebrow: 'مساحة العمل',
        title: 'مصمم لمن يريد الإجابة، لا تفاصيل تشغيل النماذج.',
        copy:
          'التجربة الأساسية هي مساحة مساعد سريعة: أسئلة، ملفات، ذاكرة، مستندات مولدة، مخططات، واستجابات طويلة داخل مكان واحد.',
      },
      services: {
        eyebrow: 'طبقة الخدمات',
        title: 'نفس الذكاء يخدم الواجهة ومنتجك الخارجي.',
        copy:
          'Wadi مفيد كتطبيق ومفيد كبنية خلفية. مفاتيح API المدارة تسمح لأدوات أخرى باستخدام الخدمة مع وضوح الوصول والحدود والاستهلاك.',
      },
      developers: {
        eyebrow: 'للبناء والتكامل',
        title: 'اربط Wadi بالمنتجات وسير العمل التي تستخدمها بالفعل.',
        copy:
          'استخدم Wadi كمساعد مستضاف، أو أداة ذكاء داخلية، أو طبقة API للمنتجات مع مفاتيح ومسارات وحدود استخدام واضحة.',
      },
    },
    cards: [
      {
        title: 'محادثة المساعد',
        copy: 'واجهة محادثة مألوفة للتفكير والكتابة والبحث والعمل اليومي.',
      },
      {
        title: 'الملفات والمستندات',
        copy: 'حلل المرفقات، أنشئ التقارير، ابن المستندات، واربط المخرجات بالمحادثة.',
      },
      {
        title: 'نقاط API',
        copy: 'قدم قدرات المحادثة والذكاء الاصطناعي للتطبيقات عبر مفاتيح مدارة وحدود استخدام.',
      },
      {
        title: 'وصول للنماذج',
        copy: 'وجه الطلبات إلى النماذج المتاحة وحافظ على مرونة الخدمة مع تغير بنية الذكاء الاصطناعي.',
      },
    ],
    rails: [
      ['المستخدم يسأل', 'مساحة المحادثة تستقبل اللغة الطبيعية والملفات والسياق.'],
      ['Wadi يوجه', 'المنصة تختار المسار المناسب: محادثة، مستند، مخطط، صوت، أو API.'],
      ['النموذج يرد', 'النماذج المتاحة تنتج إجابات أو مسودات أو مخرجات منظمة.'],
      ['الاستخدام واضح', 'المسؤولون يديرون المفاتيح والحدود والمستخدمين واستهلاك API.'],
    ],
    developer: {
      title: 'للمطورين، يتحول Wadi إلى خلفية ذكاء اصطناعي.',
      copy:
        'استخدم التوثيق والمفاتيح المخصصة لربط التطبيقات الخارجية بنفس خدمة المساعد التي تعمل داخل مساحة العمل.',
      code: ['POST /api/v1/chat', 'Authorization: Bearer wk_...', 'model: default', 'stream: true'],
      pills: ['مساعد مستضاف', 'API للمنتجات', 'أتمتة سير العمل'],
    },
    cta: {
      title: 'ابدأ من مساحة العمل. ثم توسع إلى API.',
      copy: 'افتح Wadi للمحادثة الآن، ثم اربط منتجك عندما تحتاج إلى أتمتة نفس الذكاء.',
      primary: 'افتح Wadi',
      secondary: 'توثيق المطورين',
    },
    footer: ['المنصة', 'المحادثة', 'المطورون', 'توثيق API'],
  },
} as const;
