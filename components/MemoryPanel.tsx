'use client';

import { useEffect, useState } from 'react';
import type { UserMemory, UserMemoryKind } from '@/types';

interface MemoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const memoryKinds: UserMemoryKind[] = ['profile', 'preference', 'project', 'usage'];

function MemoryIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.75c-3.2 0-5.8 2.45-5.8 5.48 0 1.4.55 2.68 1.47 3.65.43.45.66 1.05.66 1.67v1.08c0 .9.73 1.62 1.62 1.62h4.1c.9 0 1.62-.73 1.62-1.62v-1.08c0-.62.23-1.22.66-1.67a5.3 5.3 0 0 0 1.47-3.65c0-3.03-2.6-5.48-5.8-5.48Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.2 21h5.6M9 10.25h.01M12 10.25h.01M15 10.25h.01" />
    </svg>
  );
}

export default function MemoryPanel({ isOpen, onClose }: MemoryPanelProps) {
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [draftKind, setDraftKind] = useState<UserMemoryKind>('profile');
  const [draftImportance, setDraftImportance] = useState(3);

  const loadMemories = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/memories', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to load memory');
      setMemories(data.memories || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memory');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) void loadMemories();
  }, [isOpen]);

  const startEditing = (memory: UserMemory) => {
    setEditingId(memory.id);
    setDraftContent(memory.content);
    setDraftKind(memory.kind);
    setDraftImportance(memory.importance);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setDraftContent('');
    setDraftKind('profile');
    setDraftImportance(3);
  };

  const saveEdit = async (memoryId: string) => {
    setError(null);
    try {
      const response = await fetch(`/api/memories/${encodeURIComponent(memoryId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: draftKind,
          content: draftContent,
          importance: draftImportance,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to update memory');
      setMemories((current) => current.map((memory) => memory.id === memoryId ? data.memory : memory));
      cancelEditing();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update memory');
    }
  };

  const deleteMemory = async (memoryId: string) => {
    setError(null);
    try {
      const response = await fetch(`/api/memories/${encodeURIComponent(memoryId)}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to delete memory');
      setMemories((current) => current.filter((memory) => memory.id !== memoryId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete memory');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <button className="flex-1 cursor-default" aria-label="Close memory panel" onClick={onClose} />
      <aside className="flex h-full w-full max-w-md flex-col border-s border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-200">
              <MemoryIcon />
            </span>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Memory</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">{memories.length}/20 saved</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            aria-label="Close memory panel"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">Loading memory...</div>
          ) : memories.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              Important details the AI learns about you will appear here.
            </div>
          ) : (
            <div className="space-y-3">
              {memories.map((memory) => (
                <div key={memory.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                  {editingId === memory.id ? (
                    <div className="space-y-3">
                      <textarea
                        value={draftContent}
                        onChange={(event) => setDraftContent(event.target.value)}
                        maxLength={500}
                        className="min-h-24 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-teal-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={draftKind}
                          onChange={(event) => setDraftKind(event.target.value as UserMemoryKind)}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                        >
                          {memoryKinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                        </select>
                        <select
                          value={draftImportance}
                          onChange={(event) => setDraftImportance(Number(event.target.value))}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                        >
                          {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>Importance {value}</option>)}
                        </select>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button onClick={cancelEditing} className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700">
                          Cancel
                        </button>
                        <button onClick={() => saveEdit(memory.id)} className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700">
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium capitalize text-teal-700 dark:bg-gray-900 dark:text-teal-200">
                          {memory.kind}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">Importance {memory.importance}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-gray-900 dark:text-gray-100">{memory.content}</p>
                      <div className="mt-3 flex justify-end gap-2">
                        <button onClick={() => startEditing(memory)} className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700">
                          Edit
                        </button>
                        <button onClick={() => deleteMemory(memory.id)} className="rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30">
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
