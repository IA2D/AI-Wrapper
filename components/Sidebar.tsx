'use client';

import { useState } from 'react';
import { ChatSession } from '@/types';
import { ToolMode } from './ToolWorkspace';
import WadiLogo from './WadiLogo';

interface SidebarProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSessionSelect: (sessionId: string) => void;
  onNewChat: () => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, newTitle: string) => void;
  activeTool: ToolMode | null;
  onToolSelect: (tool: ToolMode) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export default function Sidebar({
  sessions,
  currentSessionId,
  onSessionSelect,
  onNewChat,
  onDeleteSession,
  onRenameSession,
  activeTool,
  onToolSelect,
  isOpen,
  onToggle,
}: SidebarProps) {
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Sort sessions by updatedAt descending (newest first)
  const sortedSessions = [...sessions].sort((a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
  const tools: Array<{ id: ToolMode; label: string; detail: string }> = [
    { id: 'documents', label: 'Documents', detail: 'PDF, Word, Excel, slides' },
    { id: 'flow', label: 'Flow diagrams', detail: 'Create process diagrams' },
    { id: 'quiz', label: 'Quiz maker', detail: 'Build question sets' },
  ];

  // Generate session title based on requirements
  const getSessionTitle = (session: ChatSession): string => {
    // If custom title is set, use it
    if (session.title && session.title !== 'New Chat') {
      return session.title;
    }

    // If no messages, show "New Chat"
    if (!session.messages || session.messages.length === 0) {
      return 'New Chat';
    }

    // Show truncated first message
    const firstMessage = session.messages[0];
    const text = firstMessage.content.text || '';
    const maxLength = 40;
    
    if (text.length <= maxLength) {
      return text || 'New Chat';
    }
    
    return text.substring(0, maxLength) + '...';
  };

  // Format date for display
  const formatDate = (date: Date): string => {
    const now = new Date();
    const messageDate = new Date(date);
    const diffMs = now.getTime() - messageDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return messageDate.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: messageDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
    }
  };

  // Handle rename start
  const handleRenameStart = (session: ChatSession) => {
    setEditingSessionId(session.id);
    setEditTitle(session.title);
  };

  // Handle rename save
  const handleRenameSave = (sessionId: string) => {
    if (editTitle.trim()) {
      onRenameSession(sessionId, editTitle.trim());
    }
    setEditingSessionId(null);
    setEditTitle('');
  };

  // Handle rename cancel
  const handleRenameCancel = () => {
    setEditingSessionId(null);
    setEditTitle('');
  };

  // Handle delete with confirmation
  const handleDeleteClick = (sessionId: string) => {
    setDeleteConfirmId(sessionId);
  };

  const handleDeleteConfirm = (sessionId: string) => {
    onDeleteSession(sessionId);
    setDeleteConfirmId(null);
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmId(null);
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:relative top-0 left-0 h-full
          w-72
          flex flex-col
          transition-transform duration-300 ease-in-out
          z-50 md:z-auto
          wadi-chat-sidebar
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Header with New Chat button */}
        <div className="border-b border-black/10 p-4">
          <a href="/" className="mb-4 flex items-center justify-between gap-3 rounded-lg px-1">
            <WadiLogo />
            <span className="rounded-full border border-black/10 bg-white/70 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#1C7178]">
              Workspace
            </span>
          </a>
          <button
            onClick={onNewChat}
            className="wadi-sidebar-new-chat flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-black transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            <span>New Chat</span>
          </button>
        </div>

        <div className="border-b border-black/10 px-3 py-4">
          <div className="px-1 pb-2 text-xs font-black uppercase tracking-[0.18em] text-black/38">Tools</div>
          <div className="space-y-1">
            {tools.map((tool) => (
              <button
                key={tool.id}
                onClick={() => onToolSelect(tool.id)}
                className={`wadi-sidebar-tool w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                  activeTool === tool.id
                    ? 'is-active text-white'
                    : 'text-black/62 hover:bg-black/[0.035]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {tool.id === 'documents' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 3h7l5 5v13H7a2 2 0 01-2-2V5a2 2 0 012-2z" />}
                    {tool.id === 'flow' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h4v4H7V7zm6 6h4v4h-4v-4zM9 11v2a2 2 0 002 2h2m0-8h2a2 2 0 012 2v4" />}
                    {tool.id === 'quiz' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9a3 3 0 116 0c0 2-3 2-3 5m0 4h.01M5 4h14v16H5z" />}
                  </svg>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black">{tool.label}</div>
                    <div className={`truncate text-xs font-bold ${activeTool === tool.id ? 'text-[#15565c]/70' : 'text-black/34'}`}>{tool.detail}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto py-3 scrollbar-thin">
          {sortedSessions.length === 0 ? (
            <div className="mx-3 rounded-lg border border-black/10 bg-white/62 px-3 py-8 text-center text-sm font-bold text-black/38">
              No chat history yet
            </div>
          ) : (
            sortedSessions.map((session) => {
              const isActive = session.id === currentSessionId;
              const isHovered = session.id === hoveredSessionId;
              const isEditing = session.id === editingSessionId;
              const isDeleting = session.id === deleteConfirmId;

              return (
                <div
                  key={session.id}
                  className="px-2"
                  onMouseEnter={() => setHoveredSessionId(session.id)}
                  onMouseLeave={() => setHoveredSessionId(null)}
                >
                  {isDeleting ? (
                    // Delete confirmation
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-900">
                      <p className="text-sm mb-2">Delete this chat?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDeleteConfirm(session.id)}
                          className="flex-1 rounded bg-red-600 px-2 py-1 text-xs font-bold transition-colors hover:bg-red-700"
                        >
                          Delete
                        </button>
                        <button
                          onClick={handleDeleteCancel}
                          className="flex-1 rounded bg-black/10 px-2 py-1 text-xs font-bold transition-colors hover:bg-black/15"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : isEditing ? (
                    // Rename input
                    <div className="rounded-lg border border-black/10 bg-white/70 px-3 py-2">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleRenameSave(session.id);
                          } else if (e.key === 'Escape') {
                            handleRenameCancel();
                          }
                        }}
                        onBlur={() => handleRenameSave(session.id)}
                        className="w-full rounded border border-black/10 bg-white px-2 py-1 text-sm text-black outline-none focus:border-[#1C7178]"
                        autoFocus
                      />
                    </div>
                  ) : (
                    // Session item
                    <div
                      className={`
                        w-full px-3 py-2.5 rounded-lg
                        transition-colors relative wadi-sidebar-session
                        ${isActive 
                          ? 'is-active text-white' 
                          : 'text-black/62 hover:bg-black/[0.035]'
                        }
                      `}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          onClick={() => onSessionSelect(session.id)}
                          className="flex-1 min-w-0 text-left"
                        >
                          <div className="truncate text-sm font-black">
                            {getSessionTitle(session)}
                          </div>
                          <div className="mt-0.5 text-xs font-bold text-black/34">
                            {formatDate(session.updatedAt)}
                          </div>
                        </button>

                        {/* Action buttons on hover */}
                        {isHovered && !isActive && (
                          <div className="flex gap-1 flex-shrink-0">
                            <button
                              onClick={() => handleRenameStart(session)}
                              className="rounded p-1 transition-colors hover:bg-black/5"
                              aria-label="Rename chat"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteClick(session.id)}
                              className="rounded p-1 transition-colors hover:bg-red-600/20"
                              aria-label="Delete chat"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Mobile close button */}
        <button
          onClick={onToggle}
          className="border-t border-black/10 p-3 transition-colors hover:bg-black/5 md:hidden"
        >
          <svg
            className="w-5 h-5 mx-auto"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </aside>
    </>
  );
}
