import { RowDataPacket } from 'mysql2';
import { ensureDatabaseSchema, getPool } from './db';
import { generateId } from '@/types';
import type { UserMemory, UserMemoryKind } from '@/types';

const MAX_USER_MEMORIES = 20;
const VALID_KINDS = new Set<UserMemoryKind>(['profile', 'preference', 'project', 'usage']);

interface UserMemoryRow extends RowDataPacket {
  id: string;
  kind: UserMemoryKind;
  content: string;
  importance: number;
  source_message_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MemoryCandidate {
  kind: UserMemoryKind;
  content: string;
  importance?: number;
  sourceMessageId?: string | null;
}

function serializeMemory(row: UserMemoryRow): UserMemory {
  return {
    id: row.id,
    kind: normalizeKind(row.kind),
    content: row.content,
    importance: clampImportance(row.importance),
    sourceMessageId: row.source_message_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function normalizeKind(kind: unknown): UserMemoryKind {
  return typeof kind === 'string' && VALID_KINDS.has(kind as UserMemoryKind)
    ? kind as UserMemoryKind
    : 'profile';
}

function clampImportance(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 3;
  return Math.max(1, Math.min(5, Math.round(numberValue)));
}

function normalizeContent(content: string) {
  return content.toLowerCase().replace(/\s+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, '').trim();
}

function cleanContent(content: unknown) {
  return String(content || '').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function isSimilarMemory(a: string, b: string) {
  const left = normalizeContent(a);
  const right = normalizeContent(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

export async function listUserMemories(userId: string) {
  await ensureDatabaseSchema();

  const [rows] = await getPool().execute<UserMemoryRow[]>(
    `SELECT id, kind, content, importance, source_message_id, created_at, updated_at
     FROM user_memories
     WHERE user_id = ?
     ORDER BY importance DESC, updated_at DESC`,
    [userId]
  );

  return rows.map(serializeMemory);
}

export async function getUserMemoryContext(userId: string) {
  const memories = await listUserMemories(userId);
  if (memories.length === 0) return '';

  return memories
    .map((memory) => `- [${memory.kind}, importance ${memory.importance}/5] ${memory.content}`)
    .join('\n');
}

export async function createUserMemory(userId: string, input: MemoryCandidate) {
  await ensureDatabaseSchema();

  const content = cleanContent(input.content);
  if (!content) return null;

  const existingMemories = await listUserMemories(userId);
  const similar = existingMemories.find((memory) => (
    memory.kind === normalizeKind(input.kind) && isSimilarMemory(memory.content, content)
  ));

  if (similar) {
    return updateUserMemory(userId, similar.id, {
      kind: normalizeKind(input.kind),
      content,
      importance: Math.max(similar.importance, clampImportance(input.importance)),
      sourceMessageId: input.sourceMessageId ?? similar.sourceMessageId,
    });
  }

  const nextImportance = clampImportance(input.importance);

  if (existingMemories.length >= MAX_USER_MEMORIES) {
    const replaceable = [...existingMemories].sort((a, b) => (
      a.importance - b.importance || a.updatedAt.getTime() - b.updatedAt.getTime()
    ))[0];

    if (replaceable && nextImportance <= replaceable.importance) {
      return null;
    }

    if (replaceable) {
      await deleteUserMemory(userId, replaceable.id);
    }
  }

  const id = generateId();
  await getPool().execute(
    `INSERT INTO user_memories
     (id, user_id, kind, content, importance, source_message_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      normalizeKind(input.kind),
      content,
      nextImportance,
      input.sourceMessageId || null,
    ]
  );

  return getUserMemory(userId, id);
}

export async function saveMemoryCandidates(userId: string, candidates: MemoryCandidate[]) {
  const saved: UserMemory[] = [];

  for (const candidate of candidates.slice(0, 3)) {
    const memory = await createUserMemory(userId, candidate);
    if (memory) saved.push(memory);
  }

  return saved;
}

export async function getUserMemory(userId: string, memoryId: string) {
  await ensureDatabaseSchema();

  const [rows] = await getPool().execute<UserMemoryRow[]>(
    `SELECT id, kind, content, importance, source_message_id, created_at, updated_at
     FROM user_memories
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
    [memoryId, userId]
  );

  return rows[0] ? serializeMemory(rows[0]) : null;
}

export async function updateUserMemory(
  userId: string,
  memoryId: string,
  updates: Partial<Pick<UserMemory, 'kind' | 'content' | 'importance' | 'sourceMessageId'>>
) {
  await ensureDatabaseSchema();
  const existing = await getUserMemory(userId, memoryId);
  if (!existing) return null;

  const content = updates.content === undefined ? existing.content : cleanContent(updates.content);
  if (!content) return existing;

  await getPool().execute(
    `UPDATE user_memories
     SET kind = ?, content = ?, importance = ?, source_message_id = ?
     WHERE id = ? AND user_id = ?`,
    [
      updates.kind === undefined ? existing.kind : normalizeKind(updates.kind),
      content,
      updates.importance === undefined ? existing.importance : clampImportance(updates.importance),
      updates.sourceMessageId === undefined ? existing.sourceMessageId ?? null : updates.sourceMessageId || null,
      memoryId,
      userId,
    ]
  );

  return getUserMemory(userId, memoryId);
}

export async function deleteUserMemory(userId: string, memoryId: string) {
  await ensureDatabaseSchema();

  const [result] = await getPool().execute(
    `DELETE FROM user_memories WHERE id = ? AND user_id = ?`,
    [memoryId, userId]
  );

  return Boolean((result as { affectedRows?: number }).affectedRows);
}
