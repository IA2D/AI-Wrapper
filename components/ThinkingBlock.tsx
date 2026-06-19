'use client';

interface ThinkingBlockProps {
  content: string;
  active?: boolean;
}

export default function ThinkingBlock({ content, active = false }: ThinkingBlockProps) {
  if (!content.trim()) return null;

  return (
    <details className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
      <summary className="cursor-pointer select-none font-medium">
        {active ? 'Thinking ...' : 'Thinking'}
      </summary>
      <div className="mt-2 whitespace-pre-wrap break-words text-xs leading-5">
        {content}
      </div>
    </details>
  );
}
