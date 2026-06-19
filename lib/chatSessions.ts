import { RowDataPacket } from 'mysql2';
import type { ChatSession } from '@/types';
import { ensureDatabaseSchema, getPool } from './db';

interface SessionRow extends RowDataPacket {
  id: string;
  title: string;
  messages_json: string | ChatSession['messages'];
  metadata_json: string | ChatSession['metadata'] | null;
  attached_pdfs_json: string | ChatSession['attachedPDFs'] | null;
  created_at: Date;
  updated_at: Date;
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value !== 'string') return value as T;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function serializeSession(row: SessionRow): ChatSession {
  return {
    id: row.id,
    title: row.title,
    messages: parseJson(row.messages_json, []).map((message: any) => ({
      ...message,
      timestamp: new Date(message.timestamp),
    })),
    metadata: parseJson<ChatSession['metadata'] | undefined>(row.metadata_json, undefined),
    attachedPDFs: parseJson<ChatSession['attachedPDFs'] | undefined>(row.attached_pdfs_json, undefined)?.map((pdf: any) => ({
      ...pdf,
      uploadedAt: new Date(pdf.uploadedAt),
    })),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mergeSessionMessages(
  existing: ChatSession['messages'],
  incoming: ChatSession['messages']
): ChatSession['messages'] {
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

export async function listChatSessions(userId: string) {
  await ensureDatabaseSchema();

  const [rows] = await getPool().execute<SessionRow[]>(
    `SELECT id, title, messages_json, metadata_json, attached_pdfs_json, created_at, updated_at
     FROM chat_sessions
     WHERE user_id = ?
     ORDER BY updated_at DESC`,
    [userId]
  );

  return rows.map(serializeSession);
}

export async function getChatSession(userId: string, sessionId: string) {
  await ensureDatabaseSchema();

  const [rows] = await getPool().execute<SessionRow[]>(
    `SELECT id, title, messages_json, metadata_json, attached_pdfs_json, created_at, updated_at
     FROM chat_sessions
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
    [sessionId, userId]
  );

  return rows[0] ? serializeSession(rows[0]) : null;
}

export async function saveChatSession(userId: string, session: ChatSession) {
  await ensureDatabaseSchema();

  const createdAt = new Date(session.createdAt || new Date());
  const updatedAt = new Date(session.updatedAt || new Date());

  await getPool().execute(
    `INSERT INTO chat_sessions
     (id, user_id, title, messages_json, metadata_json, attached_pdfs_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       messages_json = VALUES(messages_json),
       metadata_json = VALUES(metadata_json),
       attached_pdfs_json = VALUES(attached_pdfs_json),
       updated_at = VALUES(updated_at)`,
    [
      session.id,
      userId,
      session.title,
      JSON.stringify(session.messages || []),
      JSON.stringify(session.metadata || null),
      JSON.stringify(session.attachedPDFs || null),
      createdAt,
      updatedAt,
    ]
  );

  return { ...session, createdAt, updatedAt };
}

export async function updateChatSession(userId: string, sessionId: string, updates: Partial<ChatSession>) {
  await ensureDatabaseSchema();
  const updatedAt = new Date();
  let messages = updates.messages;
  let metadata = updates.metadata;

  if (updates.messages !== undefined) {
    const currentSession = await getChatSession(userId, sessionId);
    messages = mergeSessionMessages(currentSession?.messages || [], updates.messages);
    metadata = {
      ...(updates.metadata || currentSession?.metadata || {}),
      messageCount: messages.length,
    };
  }

  await getPool().execute(
    `UPDATE chat_sessions
     SET title = COALESCE(?, title),
         messages_json = COALESCE(?, messages_json),
         metadata_json = COALESCE(?, metadata_json),
         attached_pdfs_json = COALESCE(?, attached_pdfs_json),
         updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [
      updates.title ?? null,
      updates.messages === undefined ? null : JSON.stringify(messages),
      metadata === undefined ? null : JSON.stringify(metadata),
      updates.attachedPDFs === undefined ? null : JSON.stringify(updates.attachedPDFs),
      updatedAt,
      sessionId,
      userId,
    ]
  );

  return updatedAt;
}
