import type { Locale } from './i18n';

export const chatCopy: Record<Locale, {
  header: {
    chatTitle: string;
    toolsTitle: string;
    subtitle: string;
    admin: string;
    apiConsole: string;
    language: string;
    memory: string;
    logout: string;
    loading: string;
    noSession: string;
    startNewChat: string;
  };
  sidebar: {
    workspace: string;
    newChat: string;
    newChatDisabled: string;
    tools: string;
    noHistory: string;
    today: string;
    yesterday: string;
    daysAgo: (days: number) => string;
    deletePrompt: string;
    delete: string;
    cancel: string;
    renameChat: string;
    deleteChat: string;
    close: string;
    toolItems: {
      documents: { label: string; detail: string };
      flow: { label: string; detail: string };
      quiz: { label: string; detail: string };
    };
  };
  chat: {
    processing: string;
    retry: string;
    dismissError: string;
    dropImage: string;
    dropPdf: string;
    dropFiles: string;
    dropImageDetail: string;
    dropPdfDetail: string;
    dropFilesDetail: string;
    starters: string[];
    model: string;
    modelDefault: string;
    modelAdaptive: string;
    stoppedTitle: string;
    continue: string;
    emptyTitle: string;
    emptyBody: string;
    emptyChips: string[];
    context: {
      session: string;
      messages: string;
      pdfs: string;
      media: string;
      memory: string;
      memoryBody: string;
      open: string;
      context: string;
      dropPdf: string;
    };
  };
  input: {
    attachImages: string;
    attachPdf: string;
    voiceStart: string;
    voiceStop: string;
    send: string;
    stop: string;
    thinkingOn: string;
    thinkingOff: string;
    thinkingTitle: string;
    processingPdf: string;
    stopRecording: string;
  };
}> = {
  en: {
    header: {
      chatTitle: 'Wadi chat',
      toolsTitle: 'Wadi tools',
      subtitle: 'Chat, files, memory, and API context.',
      admin: 'Admin',
      apiConsole: 'API Console',
      language: 'عربي',
      memory: 'Memory',
      logout: 'Logout',
      loading: 'Preparing your workspace...',
      noSession: 'No session selected',
      startNewChat: 'Start New Chat',
    },
    sidebar: {
      workspace: 'Workspace',
      newChat: 'New Chat',
      newChatDisabled: 'Finish your current chat before starting a new one',
      tools: 'Tools',
      noHistory: 'No chat history yet',
      today: 'Today',
      yesterday: 'Yesterday',
      daysAgo: (days) => `${days} days ago`,
      deletePrompt: 'Delete this chat?',
      delete: 'Delete',
      cancel: 'Cancel',
      renameChat: 'Rename chat',
      deleteChat: 'Delete chat',
      close: 'Close sidebar',
      toolItems: {
        documents: { label: 'Documents', detail: 'PDF, Word, Excel, slides' },
        flow: { label: 'Flow diagrams', detail: 'Create process diagrams' },
        quiz: { label: 'Quiz maker', detail: 'Build question sets' },
      },
    },
    chat: {
      processing: 'Processing',
      retry: 'Retry',
      dismissError: 'Dismiss error',
      dropImage: 'Drop images to attach',
      dropPdf: 'Drop PDF to attach',
      dropFiles: 'Drop files to attach',
      dropImageDetail: 'Images will be added to your next message.',
      dropPdfDetail: 'It will be processed into this chat context.',
      dropFilesDetail: 'Images attach to the next message; PDFs are processed into chat context.',
      starters: ['Summarize this PDF', 'Write a clear Arabic reply', 'Create a proposal outline', 'Turn notes into action items'],
      model: 'Model',
      modelDefault: 'Default',
      modelAdaptive: 'Adaptive',
      stoppedTitle: 'The response stopped before it finished.',
      continue: 'Continue where it stopped',
      emptyTitle: 'Start with a question, file, or voice note.',
      emptyBody: 'Wadi can read context, remember useful details, and turn messy work into clean answers.',
      emptyChips: ['Attach PDF', 'English or عربي', 'Generate files'],
      context: {
        session: 'Session',
        messages: 'Messages',
        pdfs: 'PDFs',
        media: 'Media',
        memory: 'Memory',
        memoryBody: 'Keep important facts attached to the workspace.',
        open: 'Open',
        context: 'Context',
        dropPdf: 'Drop a PDF into the chat to add context.',
      },
    },
    input: {
      attachImages: 'Attach images',
      attachPdf: 'Attach PDF',
      voiceStart: 'Start voice input',
      voiceStop: 'Stop voice input',
      send: 'Send message',
      stop: 'Stop response',
      thinkingOn: 'Thinking',
      thinkingOff: 'Direct',
      thinkingTitle: 'Toggle thinking mode',
      processingPdf: 'Processing PDF...',
      stopRecording: 'Stop',
    },
  },
  ar: {
    header: {
      chatTitle: 'محادثة وادي',
      toolsTitle: 'أدوات وادي',
      subtitle: 'محادثة وملفات وذاكرة وسياق API.',
      admin: 'الإدارة',
      apiConsole: 'وحدة API',
      language: 'EN',
      memory: 'الذاكرة',
      logout: 'خروج',
      loading: 'يتم تجهيز مساحة العمل...',
      noSession: 'لا توجد محادثة محددة',
      startNewChat: 'ابدأ محادثة جديدة',
    },
    sidebar: {
      workspace: 'مساحة العمل',
      newChat: 'محادثة جديدة',
      newChatDisabled: 'أنهِ محادثتك الحالية قبل بدء محادثة جديدة',
      tools: 'الأدوات',
      noHistory: 'لا يوجد سجل محادثات بعد',
      today: 'اليوم',
      yesterday: 'أمس',
      daysAgo: (days) => `منذ ${days} أيام`,
      deletePrompt: 'حذف هذه المحادثة؟',
      delete: 'حذف',
      cancel: 'إلغاء',
      renameChat: 'إعادة تسمية المحادثة',
      deleteChat: 'حذف المحادثة',
      close: 'إغلاق الشريط الجانبي',
      toolItems: {
        documents: { label: 'المستندات', detail: 'PDF وWord وExcel والعروض' },
        flow: { label: 'مخططات التدفق', detail: 'إنشاء مخططات العمليات' },
        quiz: { label: 'منشئ الاختبارات', detail: 'بناء مجموعات أسئلة' },
      },
    },
    chat: {
      processing: 'جار المعالجة',
      retry: 'إعادة المحاولة',
      dismissError: 'إغلاق الخطأ',
      dropImage: 'أفلت الصور لإرفاقها',
      dropPdf: 'أفلت ملف PDF لإرفاقه',
      dropFiles: 'أفلت الملفات لإرفاقها',
      dropImageDetail: 'ستضاف الصور إلى رسالتك التالية.',
      dropPdfDetail: 'سيتم تحويله إلى سياق لهذه المحادثة.',
      dropFilesDetail: 'الصور ترفق بالرسالة التالية وملفات PDF تضاف كسياق.',
      starters: ['لخص ملف PDF', 'اكتب ردا عربيا واضحا', 'أنشئ مخطط عرض', 'حول الملاحظات إلى مهام'],
      model: 'النموذج',
      modelDefault: 'الافتراضي',
      modelAdaptive: 'تلقائي',
      stoppedTitle: 'توقفت الإجابة قبل أن تكتمل.',
      continue: 'تابع من مكان التوقف',
      emptyTitle: 'ابدأ بسؤال أو ملف أو ملاحظة صوتية.',
      emptyBody: 'يمكن لوادي قراءة السياق وتذكر التفاصيل المفيدة وتحويل العمل الفوضوي إلى إجابات واضحة.',
      emptyChips: ['إرفاق PDF', 'العربية أو English', 'إنشاء ملفات'],
      context: {
        session: 'الجلسة',
        messages: 'الرسائل',
        pdfs: 'ملفات PDF',
        media: 'الوسائط',
        memory: 'الذاكرة',
        memoryBody: 'احتفظ بالحقائق المهمة داخل مساحة العمل.',
        open: 'فتح',
        context: 'السياق',
        dropPdf: 'أفلت ملف PDF في المحادثة لإضافة السياق.',
      },
    },
    input: {
      attachImages: 'إرفاق صور',
      attachPdf: 'إرفاق PDF',
      voiceStart: 'بدء إدخال صوتي',
      voiceStop: 'إيقاف الإدخال الصوتي',
      send: 'إرسال الرسالة',
      stop: 'إيقاف الإجابة',
      thinkingOn: 'تفكير',
      thinkingOff: 'مباشر',
      thinkingTitle: 'تبديل وضع التفكير',
      processingPdf: 'جار معالجة PDF...',
      stopRecording: 'إيقاف',
    },
  },
};
