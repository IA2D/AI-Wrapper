import { RowDataPacket } from 'mysql2';
import { FlowChartJob } from '@/types';
import { ensureDatabaseSchema, getPool } from './db';

interface FlowJobRow extends RowDataPacket {
  id: string;
  title: string;
  prompt: string;
  status: FlowChartJob['status'];
  content_json: string | FlowChartJob['content'] | null;
  progress_json: string | FlowChartJob['progress'];
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function serialize(row: FlowJobRow): FlowChartJob {
  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    status: row.status,
    content: parseJson(row.content_json, null),
    progress: parseJson(row.progress_json, { completed: 0, total: 1, percent: 0 }),
    error: row.error_message,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function listFlowJobs(userId: string) {
  await ensureDatabaseSchema();
  const [rows] = await getPool().execute<FlowJobRow[]>(
    'SELECT * FROM flow_chart_jobs WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50',
    [userId]
  );
  return rows.map(serialize);
}

export async function getFlowJob(userId: string, jobId: string) {
  await ensureDatabaseSchema();
  const [rows] = await getPool().execute<FlowJobRow[]>(
    'SELECT * FROM flow_chart_jobs WHERE user_id = ? AND id = ? LIMIT 1',
    [userId, jobId]
  );
  return rows[0] ? serialize(rows[0]) : null;
}

export async function saveFlowJob(userId: string, job: Partial<FlowChartJob> & { id: string; title: string; prompt: string }) {
  await ensureDatabaseSchema();

  await getPool().execute(
    `INSERT INTO flow_chart_jobs
     (id, user_id, title, prompt, status, content_json, progress_json, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      title = VALUES(title),
      prompt = VALUES(prompt),
      status = VALUES(status),
      content_json = VALUES(content_json),
      progress_json = VALUES(progress_json),
      error_message = VALUES(error_message)`,
    [
      job.id,
      userId,
      job.title,
      job.prompt,
      job.status || 'setup',
      JSON.stringify(job.content || null),
      JSON.stringify(job.progress || { completed: 0, total: 1, percent: 0 }),
      job.error || null,
    ]
  );
}

export async function updateFlowJob(userId: string, jobId: string, updates: Partial<FlowChartJob>) {
  const existing = await getFlowJob(userId, jobId);
  if (!existing) return null;

  await saveFlowJob(userId, {
    id: existing.id,
    title: updates.title ?? existing.title,
    prompt: updates.prompt ?? existing.prompt,
    status: updates.status ?? existing.status,
    content: updates.content === undefined ? existing.content : updates.content,
    progress: updates.progress ?? existing.progress,
    error: updates.error === undefined ? existing.error : updates.error,
  });

  return getFlowJob(userId, jobId);
}

export async function deleteFlowJob(userId: string, jobId: string) {
  await ensureDatabaseSchema();

  await getPool().execute(
    'DELETE FROM flow_chart_jobs WHERE user_id = ? AND id = ?',
    [userId, jobId]
  );
}
