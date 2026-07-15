'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChatSession, APIConfiguration, generateId } from '@/types';
import { StorageService } from '@/services/StorageService';
import { useChatSessions } from '@/hooks/useChatSessions';
import Sidebar from './Sidebar';
import ChatInterface from './ChatInterface';
import ThinkingModeToggle from './ThinkingModeToggle';
import ThemeToggle from './ThemeToggle';
import AuthScreen from './AuthScreen';
import ToolWorkspace, { ToolMode } from './ToolWorkspace';
import MemoryPanel from './MemoryPanel';
import WadiLogo from './WadiLogo';
import { applyTheme, getPreferredTheme, persistTheme } from '@/lib/theme';

// Default API configuration from environment variables
const DEFAULT_API_CONFIG: APIConfiguration = {
  endpoint: process.env.NEXT_PUBLIC_QWEN_API_ENDPOINT || 'https://api.siliconflow.cn/v1/chat/completions',
  apiKey: process.env.NEXT_PUBLIC_QWEN_API_KEY || '',
  model: 'Qwen/Qwen3.5-9B',
};

export default function MainLayout() {
  // Session management
  const {
    sessions,
    isLoading: sessionsLoading,
    addSession,
    updateSession,
    deleteSession,
    createNewSession,
    reloadSessions,
  } = useChatSessions();

  const [user, setUser] = useState<{ id: string; name: string; email: string; role?: 'user' | 'admin' } | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeTool, setActiveTool] = useState<ToolMode | null>(null);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [hasApiKeys, setHasApiKeys] = useState(false);

  // Configuration state
  const [thinkingMode, setThinkingMode] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [apiConfig] = useState<APIConfiguration>(DEFAULT_API_CONFIG);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const response = await fetch('/api/auth/me');
        const data = await response.json().catch(() => ({}));
        setUser(data.user || null);
      } catch {
        setUser(null);
      } finally {
        setIsAuthLoading(false);
      }
    };

    loadUser();
  }, []);

  useEffect(() => {
    if (!user) {
      setHasApiKeys(false);
      return;
    }

    fetch('/api/me/api-keys')
      .then((response) => response.json())
      .then((data) => setHasApiKeys(Array.isArray(data.apiKeys) && data.apiKeys.length > 0))
      .catch(() => setHasApiKeys(false));
  }, [user]);

  // Initialize from storage on mount
  useEffect(() => {
    const initializeFromStorage = async () => {
      try {
        // Load thinking mode
        const savedThinkingMode = await StorageService.loadThinkingMode();
        setThinkingMode(savedThinkingMode);

        const preferredTheme = getPreferredTheme();
        setIsDarkMode(preferredTheme === 'dark');
        applyTheme(preferredTheme);

        // Load current session ID
        const savedSessionId = await StorageService.getCurrentSessionId();
        if (savedSessionId && sessions.some(s => s.id === savedSessionId)) {
          setCurrentSessionId(savedSessionId);
        } else if (sessions.length > 0) {
          // If no valid saved session, select the first one
          setCurrentSessionId(sessions[0].id);
          await StorageService.setCurrentSessionId(sessions[0].id);
        } else if (!sessionsLoading) {
          // If no sessions exist, create a new one
          const newSession = createNewSession();
          await addSession(newSession);
          setCurrentSessionId(newSession.id);
          await StorageService.setCurrentSessionId(newSession.id);
        }
      } catch (error) {
        console.error('Failed to initialize from storage:', error);
      }
    };

    if (user && !sessionsLoading) {
      initializeFromStorage();
    }
  }, [user, sessionsLoading, sessions, addSession, createNewSession]);

  // Get current session
  const currentSession = sessions.find(s => s.id === currentSessionId) || null;

  // Session management actions
  const handleNewChat = useCallback(async () => {
    const newSession = createNewSession();
    await addSession(newSession);
    setCurrentSessionId(newSession.id);
    setActiveTool(null);
    await StorageService.setCurrentSessionId(newSession.id);
  }, [createNewSession, addSession]);

  const handleSessionSelect = useCallback(async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setActiveTool(null);
    await StorageService.setCurrentSessionId(sessionId);
  }, []);

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    await deleteSession(sessionId);

    // If deleting current session, switch to another or create new
    if (sessionId === currentSessionId) {
      const remainingSessions = sessions.filter(s => s.id !== sessionId);
      
      if (remainingSessions.length > 0) {
        // Switch to the first remaining session
        setCurrentSessionId(remainingSessions[0].id);
        await StorageService.setCurrentSessionId(remainingSessions[0].id);
      } else {
        // No sessions left, create a new one
        const newSession = createNewSession();
        await addSession(newSession);
        setCurrentSessionId(newSession.id);
        await StorageService.setCurrentSessionId(newSession.id);
      }
    }
  }, [sessions, currentSessionId, deleteSession, createNewSession, addSession]);

  const handleRenameSession = useCallback(async (sessionId: string, newTitle: string) => {
    await updateSession(sessionId, { title: newTitle });
  }, [updateSession]);

  const handleUpdateSession = useCallback(async (updatedSession: ChatSession) => {
    await updateSession(updatedSession.id, updatedSession);
  }, [updateSession]);

  // Settings management
  const handleThemeChange = useCallback((isDark: boolean) => {
    setIsDarkMode(isDark);

    const nextTheme = isDark ? 'dark' : 'light';
    persistTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);



  // Thinking mode management
  const handleToggleThinkingMode = useCallback(async () => {
    const newMode = !thinkingMode;
    setThinkingMode(newMode);
    await StorageService.saveThinkingMode(newMode);
  }, [thinkingMode]);

  const handleThinkingModeChange = useCallback(async (enabled: boolean) => {
    setThinkingMode(enabled);
    await StorageService.saveThinkingMode(enabled);
  }, []);

  // Sidebar toggle
  const handleToggleSidebar = useCallback(() => {
    setIsSidebarOpen(prev => !prev);
  }, []);

  const handleToolSelect = useCallback((tool: ToolMode) => {
    setActiveTool(tool);
  }, []);

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setCurrentSessionId(null);
    setActiveTool(null);
  }, []);

  // Show loading state
  if (isAuthLoading || (user && sessionsLoading)) {
    return (
      <div className="wadi-chat-loading flex h-screen items-center justify-center">
        <div className="text-center">
          <WadiLogo showText={false} className="mx-auto mb-5 scale-150" />
          <div className="mx-auto mb-4 h-1.5 w-36 overflow-hidden rounded-full bg-[#d3edef]">
            <span className="block h-full w-1/2 rounded-full bg-[#1C7178] animate-[landing-meter-pulse_1.6s_ease-in-out_infinite]" />
          </div>
          <p className="text-sm font-black text-black/54">Preparing your workspace...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        onAuthenticated={async (authenticatedUser) => {
          await reloadSessions();
          setUser(authenticatedUser);
        }}
      />
    );
  }

  return (
    <div className="wadi-chat-shell flex h-screen overflow-hidden">
      <div className="wadi-chat-bg" aria-hidden="true" />
      {/* Sidebar */}
      <Sidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSessionSelect={handleSessionSelect}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        activeTool={activeTool}
        onToolSelect={handleToolSelect}
        isOpen={isSidebarOpen}
        onToggle={handleToggleSidebar}
      />

      {/* Main content area */}
      <div className="wadi-chat-main flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header id="header" className="wadi-chat-header flex-shrink-0 px-3 py-3 md:px-4">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            {/* Left: Menu button (mobile) */}
            <button
              onClick={handleToggleSidebar}
              className="wadi-chat-icon-button flex-shrink-0 md:hidden"
              aria-label="Toggle sidebar"
            >
              <svg
                className="w-5 h-5 text-gray-600 dark:text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>

            {/* Center: Title */}
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-3">
                <WadiLogo showText={false} className="hidden shrink-0 sm:inline-flex" />
                <div className="min-w-0">
                  <h1 className="truncate text-sm font-black text-black md:text-base dark:text-white">
                    {activeTool ? 'Wadi tools' : currentSession?.title && currentSession.title !== 'New Chat' ? currentSession.title : 'Wadi chat'}
                  </h1>
                  <p className="hidden text-xs font-bold text-black/45 sm:block dark:text-white/45">
                    Chat, files, memory, and API context.
                  </p>
                </div>
              </div>
            </div>

            {/* Right: Controls */}
            <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
              {user.role === 'admin' && (
                <a
                  href="/admin"
                  className="wadi-chat-pill hidden md:flex"
                >
                  Admin
                </a>
              )}
              {hasApiKeys && (
                <a
                  href="/api-console"
                  className="wadi-chat-pill wadi-chat-pill-primary flex"
                >
                  API Console
                </a>
              )}
              <button
                onClick={() => setIsMemoryOpen(true)}
                className="wadi-chat-icon-button"
                aria-label="Open memory"
                title="Memory"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.75c-3.2 0-5.8 2.45-5.8 5.48 0 1.4.55 2.68 1.47 3.65.43.45.66 1.05.66 1.67v1.08c0 .9.73 1.62 1.62 1.62h4.1c.9 0 1.62-.73 1.62-1.62v-1.08c0-.62.23-1.22.66-1.67a5.3 5.3 0 0 0 1.47-3.65c0-3.03-2.6-5.48-5.8-5.48Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.2 21h5.6M9 10.25h.01M12 10.25h.01M15 10.25h.01" />
                </svg>
              </button>
              <button
                onClick={handleLogout}
                className="wadi-chat-pill hidden md:flex"
              >
                Logout
              </button>
              <ThinkingModeToggle
                enabled={thinkingMode}
                onChange={handleThinkingModeChange}
              />
              <ThemeToggle
                isDark={isDarkMode}
                onChange={handleThemeChange}
              />
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          {/* Main content */}
          {activeTool ? (
            <div className="wadi-chat-tool-area flex-1 overflow-auto">
              <ToolWorkspace activeTool={activeTool} thinkingMode={thinkingMode} />
            </div>
          ) : (
            currentSession ? (
              <ChatInterface
                session={currentSession}
                thinkingMode={thinkingMode}
                apiConfig={apiConfig}
                onUpdateSession={handleUpdateSession}
                onToggleThinkingMode={handleToggleThinkingMode}
                onOpenMemories={() => setIsMemoryOpen(true)}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <div className="wadi-chat-empty-panel text-center">
                  <WadiLogo showText={false} className="mx-auto mb-4 scale-125" />
                  <p className="mb-4 text-sm font-black text-black/58 dark:text-white/58">No session selected</p>
                  <button
                    onClick={handleNewChat}
                    className="rounded-full bg-[#1C7178] px-5 py-3 text-sm font-black text-white transition hover:bg-[#15565c]"
                  >
                    Start New Chat
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      </div>
      <MemoryPanel isOpen={isMemoryOpen} onClose={() => setIsMemoryOpen(false)} />
    </div>
  );
}
