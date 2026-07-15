interface SiteFooterProps {
  variant?: 'light' | 'dark';
  compact?: boolean;
}

export default function SiteFooter({ variant = 'light', compact = false }: SiteFooterProps) {
  const isDark = variant === 'dark';
  const textClass = isDark ? 'text-slate-300' : 'text-gray-600 dark:text-gray-400';
  const linkClass = isDark
    ? 'text-white hover:text-teal-200'
    : 'text-gray-900 hover:text-teal-600 dark:text-white dark:hover:text-teal-300';

  return (
    <footer className={`${compact ? 'px-4 py-3 text-xs' : 'px-4 py-8 text-sm'} ${textClass}`}>
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="font-medium">AI Chat API Platform</div>
        <nav className="flex flex-wrap gap-x-4 gap-y-2">
          <a href="/" className={linkClass}>Landing</a>
          <a href="/chat" className={linkClass}>Chat</a>
          <a href="/api-console" className={linkClass}>API Console</a>
          <a href="/docs/api" className={linkClass}>API Docs</a>
          <a href="/admin" className={linkClass}>Admin</a>
        </nav>
      </div>
    </footer>
  );
}
