import { RowDataPacket } from 'mysql2';
import type { ChatRun, ChatRunStatus, Message } from '@/types';
import { ensureDatabaseSchema, getPool } from './db';
import { parseJson } from './chatSessions';

interface ChatRunRow extends RowDataPacket {
  id: string;
  session_id: string;
  status: ChatRunStatus;
  status_message: string | null;
  thinking_mode: number | boolean;
  answer_text: string;
  thinking_text: string;
  assistant_message_json: string | Message | null;
  error_message: string | null;
  stop_reason: ChatRun['stopReason'] | null;
  created_at: Date;
  updated_at: Date;
}

export interface SaveChatRunInput {
  id: string;
  userId: string;
  sessionId: string;
  status: ChatRunStatus;
  statusMessage?: string | null;
  thinkingMode: boolean;
  requestMessages: Message[];
  answerText?: string;
  thinkingText?: string;
  assistantMessage?: Message | null;
  error?: string | null;
  stopReason?: ChatRun['stopReason'];
}

export interface UpdateChatRunInput {
  status?: ChatRunStatus;
  statusMessage?: string | null;
  answerText?: string;
  thinkingText?: string;
  assistantMessage?: Message | null;
  error?: string | null;
  stopReason?: ChatRun['stopReason'];
}

function serializeRun(row: ChatRunRow): ChatRun {
  const assistantMessage = parseJson<Message | null>(row.assistant_message_json, null);

  return {
    id: row.id,
    sessionId: row.session_id,
    status: row.status,
    statusMessage: row.status_message,
    thinkingMode: Boolean(row.thinking_mode),
    answerText: row.answer_text || '',
    thinkingText: row.thinking_text || '',
    assistantMessage: assistantMessage
      ? { ...assistantMessage, timestamp: new Date(assistantMessage.timestamp) }
      : null,
    error: row.error_message,
    stopReason: row.stop_reason,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function saveChatRun(input: SaveChatRunInput) {
  await ensureDatabaseSchema();

  await getPool().execute(
    `INSERT INTO chat_runs
     (id, user_id, session_id, status, status_message, thinking_mode, request_messages_json, answer_text, thinking_text,
      assistant_message_json, error_message, stop_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       status_message = VALUES(status_message),
       thinking_mode = VALUES(thinking_mode),
       request_messages_json = VALUES(request_messages_json),
       answer_text = VALUES(answer_text),
       thinking_text = VALUES(thinking_text),
       assistant_message_json = VALUES(assistant_message_json),
       error_message = VALUES(error_message),
       stop_reason = VALUES(stop_reason)`,
    [
      input.id,
      input.userId,
      input.sessionId,
      input.status,
      input.statusMessage || null,
      input.thinkingMode,
      JSON.stringify(input.requestMessages || []),
      input.answerText || '',
      input.thinkingText || '',
      JSON.stringify(input.assistantMessage || null),
      input.error || null,
      input.stopReason || null,
    ]
  );
}

export async function updateChatRun(userId: string, runId: string, updates: UpdateChatRunInput) {
  await ensureDatabaseSchema();
  const existing = await getChatRun(userId, runId);
  if (!existing) return null;

  await getPool().execute(
    `UPDATE chat_runs
     SET status = COALESCE(?, status),
         status_message = ?,
         answer_text = COALESCE(?, answer_text),
         thinking_text = COALESCE(?, thinking_text),
         assistant_message_json = COALESCE(?, assistant_message_json),
         error_message = ?,
         stop_reason = COALESCE(?, stop_reason)
     WHERE id = ? AND user_id = ?`,
    [
      updates.status ?? null,
      updates.statusMessage === undefined ? existing.statusMessage : updates.statusMessage,
      updates.answerText === undefined ? null : updates.answerText,
      updates.thinkingText === undefined ? null : updates.thinkingText,
      updates.assistantMessage === undefined ? null : JSON.stringify(updates.assistantMessage),
      updates.error === undefined ? existing.error : updates.error,
      updates.stopReason ?? null,
      runId,
      userId,
    ] as Array<string | boolean | null>
  );

  return getChatRun(userId, runId);
}

export async function getChatRun(userId: string, runId: string) {
  await ensureDatabaseSchema();

  const [rows] = await getPool().execute<ChatRunRow[]>(
    `SELECT id, session_id, status, status_message, thinking_mode, answer_text, thinking_text,
            assistant_message_json, error_message, stop_reason, created_at, updated_at
     FROM chat_runs
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
    [runId, userId]
  );

  return rows[0] ? serializeRun(rows[0]) : null;
}

export async function getLatestSessionRun(userId: string, sessionId: string) {
  await ensureDatabaseSchema();

  const [rows] = await getPool().execute<ChatRunRow[]>(
    `SELECT id, session_id, status, status_message, thinking_mode, answer_text, thinking_text,
            assistant_message_json, error_message, stop_reason, created_at, updated_at
     FROM chat_runs
     WHERE user_id = ? AND session_id = ?
     ORDER BY updated_at DESC
     LIMIT 1`,
    [userId, sessionId]
  );

  return rows[0] ? serializeRun(rows[0]) : null;
}

export async function getActiveSessionRun(userId: string, sessionId: string) {
  await ensureDatabaseSchema();

  const [rows] = await getPool().execute<ChatRunRow[]>(
    `SELECT id, session_id, status, status_message, thinking_mode, answer_text, thinking_text,
            assistant_message_json, error_message, stop_reason, created_at, updated_at
     FROM chat_runs
     WHERE user_id = ? AND session_id = ? AND status IN ('queued', 'processing', 'streaming')
     ORDER BY updated_at DESC
     LIMIT 1`,
    [userId, sessionId]
  );

  return rows[0] ? serializeRun(rows[0]) : null;
}
