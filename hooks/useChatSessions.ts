import { useState, useCallback, useEffect, useRef } from 'react';
import { ChatSession, Message, generateId } from '../types';
import { StorageService } from '../services/StorageService';

function mergeMessages(existing: Message[], incoming: Message[]) {
  const merged = [...existing];
  const indexById = new Map(merged.map((message, index) => [message.id, index]));

  for (const message of incoming) {
    const existingIndex = indexById.get(message.id);

    if (existingIndex === undefined) {
      indexById.set(message.id, merged.length);
      merged.push(message);
      continue;
    }

    const current = merged[existingIndex];
    merged[existingIndex] = {
      ...current,
      ...message,
      content: {
        ...current.content,
        ...message.content,
      },
      metadata: current.metadata || message.metadata
        ? {
            ...(current.metadata || {}),
            ...(message.metadata || {}),
          }
        : undefined,
    };
  }

  return merged;
}

function mergeSessionUpdate(session: ChatSession, updates: Partial<ChatSession>): ChatSession {
  const messages = updates.messages === undefined
    ? session.messages
    : mergeMessages(session.messages, updates.messages);

  return {
    ...session,
    ...updates,
    messages,
    metadata: updates.metadata || session.metadata
      ? {
          ...(session.metadata || {}),
          ...(updates.metadata || {}),
          messageCount: messages.length,
        }
      : undefined,
    updatedAt: new Date(),
  };
}

/**
 * Custom hook for managing chat sessions
 * Provides CRUD operations and integrates with StorageService
 * 
 * @returns Object with sessions array and action methods
 */
export function useChatSessions() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const sessionsRef = useRef<ChatSession[]>([]);
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const reloadSessions = useCallback(async () => {
    try {
      setIsLoading(true);
      const loadedSessions = await StorageService.loadSessions();
      setSessions(loadedSessions);
      sessionsRef.current = loadedSessions;
      setError(null);
    } catch (err) {
      console.error('Failed to load sessions:', err);
      setError(err as Error);
      setSessions([]);
      sessionsRef.current = [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load sessions from storage on mount
  useEffect(() => {
    reloadSessions();
  }, [reloadSessions]);

  // Add a new session
  const addSession = useCallback(async (session: ChatSession) => {
    try {
      await StorageService.saveSession(session);
      const nextSessions = [...sessionsRef.current, session];
      sessionsRef.current = nextSessions;
      setSessions(nextSessions);
      setError(null);
    } catch (err) {
      const error = err as Error;
      console.error('Failed to add session:', error);
      setError(error);
      throw error;
    }
  }, []);

  // Update an existing session
  const updateSession = useCallback(async (sessionId: string, updates: Partial<ChatSession>) => {
    try {
      let updatedSession: ChatSession | null = null;
      const updatedSessions = sessionsRef.current.map((session) => {
        if (session.id !== sessionId) return session;

        const nextSession = mergeSessionUpdate(session, updates);
        updatedSession = nextSession;
        return nextSession;
      });

      sessionsRef.current = updatedSessions;
      setSessions(updatedSessions);

      if (updatedSession) {
        const sessionToSave = updatedSession;
        saveQueueRef.current = saveQueueRef.current
          .catch(() => undefined)
          .then(() => StorageService.updateSession(sessionId, sessionToSave))
          .catch((saveError) => {
            console.error('Failed to persist session update:', saveError);
            setError(saveError as Error);
          });
      }

      setError(null);
    } catch (err) {
      console.error('Failed to update session:', err);
      setError(err as Error);
      throw err;
    }
  }, []);

  // Delete a session
  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await StorageService.deleteSession(sessionId);
      const nextSessions = sessionsRef.current.filter((session) => session.id !== sessionId);
      sessionsRef.current = nextSessions;
      setSessions(nextSessions);
      setError(null);
    } catch (err) {
      const error = err as Error;
      console.error('Failed to delete session:', error);
      setError(error);
      throw error;
    }
  }, []);

  // Create a new empty session
  const createNewSession = useCallback((): ChatSession => {
    const newSession: ChatSession = {
      id: generateId(),
      title: 'New Chat',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        messageCount: 0,
      },
    };
    
    return newSession;
  }, []);

  return {
    sessions,
    isLoading,
    error,
    addSession,
    updateSession,
    deleteSession,
    createNewSession,
    reloadSessions,
  };
}
