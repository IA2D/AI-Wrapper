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

export const docsCopy = {
  en: {
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
    ] as [string, string, string][],
    useCasesData: [
      {
        title: 'Text automation',
        mode: 'text',
        copy: 'Build support responders, writing tools, research assistants, workflow copilots, and structured JSON extraction.',
      },
      {
        title: 'Image understanding',
        mode: 'image',
        copy: 'Analyze screenshots, UI mockups, forms, invoices, site photos, and visual QA evidence when image permission is enabled.',
      },
      {
        title: 'Voice and audio',
        mode: 'voice',
        copy: 'Send voice notes, call snippets, or base64 audio payloads for transcription-aware reasoning when voice permission is enabled.',
      },
    ],
    footer: ['Platform', 'Chat', 'Developers', 'API Docs'],
  },
  ar: {
    eyebrow: 'نقطة وصول عامة، بدون RAG',
    title: 'توثيق API للمحادثة والملفات وسير عمل المنتج.',
    subtitle:
      'استخدم المفاتيح التي أنشأها المسؤول للاتصال المباشر بنقطة المحادثة العامة. يتم قياس الطلبات مقابل حصص مفتاح API وتبقى منفصلة عن سياق المستند الخاص بجلسة المحادثة.',
    endpoint: 'نقطة الوصول',
    method: 'الطريقة',
    path: 'المسار',
    auth: 'المصادقة',
    authValue: 'Bearer مفتاح API',
    paramsTitle: 'المعاملات المدعومة',
    parameter: 'المعامل',
    type: 'النوع',
    behavior: 'السلوك',
    gatewayNote:
      'تتحقق البوابة من مفتاح API والرسائل المطلوبة وأذونات القدرات والحصة. يتم إعادة توجيه الحقول الأخرى إلى المزود المكوَّن.',
    consoleNote:
      'يمكن للمستخدمين المخصصين فتح /api-console لعرض المفاتيح والحدود والاستخدام والأوامر الجاهزة للنسخ.',
    useCases: 'حالات الاستخدام',
    streaming: 'البث المتدفق',
    streamingCopy:
      'اضبط stream على true لتلقي أحداث الخادم المُرسَلة. لا يزال الإخراج المبثوث يُقاس؛ عندما يحذف المزودون الاستخدام، يتم تقدير رموز الإخراج من النص المُنشأ.',
    quota: 'نموذج الحصة',
    capabilities: 'اكتشاف القدرات',
    errors: 'ردود الخطأ',
    curlPrompt: 'اكتب إعلان إطلاق.',
    quotaItems: [
      'يمكن أن تكون الحدود يومية أو أسبوعية أو شهرية أو سنوية.',
      'يمكن للمسؤولين تحديد الطلبات أو الرموز أو كليهما أو لا شيء.',
      'يتجاوز تاريخ "غير محدود حتى" الحدود حتى انتهاء صلاحيته.',
      'يظهر الاستخدام في علامة تبويب استخدام API للمسؤول.',
    ],
    capabilityItems: [
      'تتطلب image_url أو وسائط الصور صلاحية الصورة.',
      'تتطلب audio_url أو input_audio أو الوسائط الصوتية صلاحية الصوت.',
      'تتطلب video_url أو وسائط الفيديو صلاحية الفيديو.',
      'رسائل النص العادي تتطلب صلاحية النص.',
    ],
    params: [
      ['messages', 'array', 'مطلوب. رسائل محادثة بأسلوب OpenAI. يدعم سلاسل نصية أو مصفوفات محتوى متعدد الوسائط.'],
      ['model', 'string', 'اختياري. الافتراضي هو قيمة MODEL للخادم. يتم تمريره إلى المزود.'],
      ['stream', 'boolean', 'اختياري. يُرجع أحداث الخادم المُرسَلة عند true. الافتراضي false.'],
      ['temperature', 'number', 'اختياري. التحكم في أخذ العينات لدى المزود، يمر دون تغيير.'],
      ['top_p', 'number', 'اختياري. التحكم في أخذ العينات النووية لدى المزود، يمر دون تغيير.'],
      ['max_tokens', 'number', 'اختياري. الحد الأقصى للرموز المُنشأة لمزودي إكمال المحادثة.'],
      ['response_format', 'object', 'اختياري. خيارات تنسيق الاستجابة JSON/كائن للمزودين المتوافقين.'],
      ['tools', 'array', 'اختياري. تعريفات الأدوات/الوظائف للمزودين المتوافقين.'],
      ['metadata', 'object', 'اختياري. يتم إعادة توجيهه إلى المزودين الذين يقبلون بيانات وصفية للطلب.'],
    ] as [string, string, string][],
    useCasesData: [
      {
        title: 'أتمتة النص',
        mode: 'نص',
        copy: 'ابنِ مستجيبي الدعم وأدوات الكتابة والمساعدين البحثيين ومساعدي سير العمل واستخراج JSON المنظم.',
      },
      {
        title: 'فهم الصور',
        mode: 'صورة',
        copy: 'حلل لقطات الشاشة ونماذج واجهة المستخدم والنماذج والفواتير وصور المواقع وأدلة QA المرئية عند تفعيل صلاحية الصورة.',
      },
      {
        title: 'الصوت والمقاطع',
        mode: 'صوت',
        copy: 'أرسل مذكرات صوتية أو مقاطع مكالمات أو حمولات صوتية base64 للاستدلال الواعي بالنسخ عند تفعيل صلاحية الصوت.',
      },
    ],
    footer: ['المنصة', 'المحادثة', 'المطورون', 'توثيق API'],
  },
} as const;

export const apiConsoleCopy = {
  en: {
    assignedKeys: 'Assigned Keys',
    noKeys: 'No API keys are assigned to your account yet.',
    limits: 'Limits',
    period: 'Period',
    requests: 'Requests',
    tokens: 'Tokens',
    unlimited: 'Unlimited',
    unlimitedUntil: 'Unlimited until',
    notSet: 'Not set',
    lastUsed: 'Last used',
    never: 'Never',
    requestsMetric: 'Requests',
    tokensMetric: 'Tokens',
    inputMetric: 'Input',
    outputMetric: 'Output',
    readyCommands: 'Ready Commands',
    noRevealWarning:
      'This key was created before key reveal support. Ask an admin to create a new assigned key to enable one-click command copying.',
    copyCommand: 'Copy command',
    copied: 'Copied',
    apiKey: 'API Key',
    copyKey: 'Copy key',
    dailyUsage: 'Daily Usage',
    recentRequests: 'Recent Requests',
    noUsage: 'No usage yet',
    noAccess: 'No API access yet',
    noAccessBody:
      'When an admin assigns one or more API keys to your account, they will appear here with limits, usage, allowed media types, and ready-to-copy commands.',
    tableDay: 'Day',
    tableRequests: 'Requests',
    tableTokens: 'Tokens',
    tableWhen: 'When',
    tableMode: 'Mode',
  },
  ar: {
    assignedKeys: 'المفاتيح المخصصة',
    noKeys: 'لم يتم تخصيص أي مفاتيح API لحسابك بعد.',
    limits: 'الحدود',
    period: 'الفترة',
    requests: 'الطلبات',
    tokens: 'الرموز',
    unlimited: 'غير محدود',
    unlimitedUntil: 'غير محدود حتى',
    notSet: 'غير مضبوط',
    lastUsed: 'آخر استخدام',
    never: 'أبداً',
    requestsMetric: 'الطلبات',
    tokensMetric: 'الرموز',
    inputMetric: 'الإدخال',
    outputMetric: 'الإخراج',
    readyCommands: 'الأوامر الجاهزة',
    noRevealWarning:
      'تم إنشاء هذا المفتاح قبل دعم الكشف عن المفاتيح. اطلب من المسؤول إنشاء مفتاح مخصص جديد لتفعيل نسخ الأوامر بنقرة واحدة.',
    copyCommand: 'نسخ الأمر',
    copied: 'تم النسخ',
    apiKey: 'مفتاح API',
    copyKey: 'نسخ المفتاح',
    dailyUsage: 'الاستخدام اليومي',
    recentRequests: 'الطلبات الأخيرة',
    noUsage: 'لا يوجد استخدام بعد',
    noAccess: 'لا يوجد وصول لـ API بعد',
    noAccessBody:
      'عندما يخصص المسؤول مفتاحاً أو أكثر من مفاتيح API لحسابك، ستظهر هنا مع الحدود والاستخدام وأنواع الوسائط المسموح بها والأوامر الجاهزة للنسخ.',
    tableDay: 'اليوم',
    tableRequests: 'الطلبات',
    tableTokens: 'الرموز',
    tableWhen: 'التوقيت',
    tableMode: 'الوضع',
  },
} as const;
