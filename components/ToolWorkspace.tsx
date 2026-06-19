'use client';

import DocumentCreationPanel from './DocumentCreationPanel';
import FlowChartPanel from './FlowChartPanel';

export type ToolMode = 'documents' | 'flow' | 'quiz';

export default function ToolWorkspace({
  activeTool,
  thinkingMode,
}: {
  activeTool: ToolMode;
  thinkingMode: boolean;
}) {
  if (activeTool === 'documents') {
    return <DocumentCreationPanel thinkingMode={thinkingMode} />;
  }

  if (activeTool === 'flow') {
    return <FlowChartPanel />;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 text-gray-900 dark:text-gray-100">
      <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-xl font-semibold">Quiz Maker</h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          This tool slot is ready in the sidebar. It can share the same background job pattern for long quiz generation.
        </p>
      </div>
    </div>
  );
}
