import { APIConfiguration, ChatSession, StorageError } from '../types';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new StorageError(data.error || `Request failed: ${response.status}`, 'UNKNOWN');
  }

  return data as T;
}

/**
 * StorageService now persists account data through authenticated API routes.
 * Chat sessions and user preferences are stored in MySQL by the server.
 */
export class StorageService {
  static async saveSessions(sessions: ChatSession[]): Promise<void> {
    await Promise.all(sessions.map((session) => this.saveSession(session)));
  }

  static async loadSessions(): Promise<ChatSession[]> {
    const data = await requestJson<{ sessions: ChatSession[] }>('/api/sessions');

    return data.sessions.map((session) => ({
      ...session,
      createdAt: new Date(session.createdAt),
      updatedAt: new Date(session.updatedAt),
      messages: session.messages.map((message) => ({
        ...message,
        timestamp: new Date(message.timestamp),
      })),
      attachedPDFs: session.attachedPDFs?.map((pdf) => ({
        ...pdf,
        uploadedAt: new Date(pdf.uploadedAt),
      })),
    }));
  }

  static async saveSession(session: ChatSession): Promise<void> {
    await requestJson('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(session),
    });
  }

  static async updateSession(sessionId: string, updates: Partial<ChatSession>): Promise<void> {
    await requestJson(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  static async deleteSession(sessionId: string): Promise<void> {
    await requestJson(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
  }

  static async setCurrentSessionId(sessionId: string | null): Promise<void> {
    await requestJson('/api/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ currentSessionId: sessionId }),
    });
  }

  static async getCurrentSessionId(): Promise<string | null> {
    const data = await requestJson<{ currentSessionId: string | null }>('/api/preferences');
    return data.currentSessionId || null;
  }

  static async saveAPIConfig(_config: APIConfiguration): Promise<void> {
    return;
  }

  static async loadAPIConfig(): Promise<APIConfiguration | null> {
    return null;
  }

  static async saveThinkingMode(enabled: boolean): Promise<void> {
    await requestJson('/api/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ thinkingMode: enabled }),
    });
  }

  static async loadThinkingMode(): Promise<boolean> {
    const data = await requestJson<{ thinkingMode: boolean }>('/api/preferences');
    return data.thinkingMode;
  }

  static async clearAll(): Promise<void> {
    return;
  }

  static async getStorageUsage(): Promise<{ used: number; available: number }> {
    return { used: 0, available: 0 };
  }

  static isQuotaExceeded(error: Error): boolean {
    return error.message.includes('quota');
  }
}
