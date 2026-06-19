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
import SiteFooter from './SiteFooter';

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

        // Use system theme preference without browser persistence.
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setIsDarkMode(prefersDark);
        
        // Apply theme to document
        if (prefersDark) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }

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
    
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
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
      <div className="flex items-center justify-center h-screen bg-white dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
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
    <div className="flex h-screen bg-white dark:bg-gray-900 overflow-hidden">
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
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header id="header" className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-3 py-3 md:px-4 flex-shrink-0">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
            {/* Left: Menu button (mobile) */}
            <button
              onClick={handleToggleSidebar}
              className="md:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
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
            <h1 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white truncate">
              {activeTool ? 'Tools' : 'Ai Chat'}
            </h1>

            {/* Right: Controls */}
            <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
              {user.role === 'admin' && (
                <a
                  href="/admin"
                  className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Admin
                </a>
              )}
              {hasApiKeys && (
                <a
                  href="/api-console"
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-cyan-700 dark:text-cyan-200 bg-cyan-50 dark:bg-cyan-950/50 hover:bg-cyan-100 dark:hover:bg-cyan-900 rounded-lg transition-colors"
                >
                  API Console
                </a>
              )}
              <button
                onClick={() => setIsMemoryOpen(true)}
                className="flex items-center justify-center rounded-lg bg-gray-100 p-2 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
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
                className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
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
            <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
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
              <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-900">
                <div className="text-center">
                  <p className="text-gray-500 dark:text-gray-400 mb-4">No session selected</p>
                  <button
                    onClick={handleNewChat}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Start New Chat
                  </button>
                </div>
              </div>
            )
          )}
          <div className="border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <SiteFooter compact />
          </div>
        </div>
      </div>
      <MemoryPanel isOpen={isMemoryOpen} onClose={() => setIsMemoryOpen(false)} />
    </div>
  );
}
