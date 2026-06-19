import { RowDataPacket } from 'mysql2';
import { DocumentCreationJob, DocumentJobStatus } from '@/types';
import { ensureDatabaseSchema, getPool } from './db';

interface DocumentJobRow extends RowDataPacket {
  id: string;
  title: string;
  prompt: string;
  status: DocumentJobStatus;
  page_count: number;
  page_range_json: string | DocumentCreationJob['pageRange'] | null;
  document_kind: DocumentCreationJob['documentKind'];
  export_format: DocumentCreationJob['exportFormat'];
  template_id: DocumentCreationJob['templateId'];
  include_tables: number | boolean;
  include_charts: number | boolean;
  enable_search: number | boolean;
  outline_json: string | DocumentCreationJob['outline'] | null;
  content_json: string | DocumentCreationJob['content'] | null;
  progress_json: string | DocumentCreationJob['progress'];
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SaveDocumentJobInput {
  id: string;
  userId: string;
  title: string;
  prompt: string;
  status: DocumentJobStatus;
  pageCount: number;
  pageRange?: DocumentCreationJob['pageRange'];
  documentKind: DocumentCreationJob['documentKind'];
  exportFormat: DocumentCreationJob['exportFormat'];
  templateId?: DocumentCreationJob['templateId'];
  includeTables: boolean;
  includeCharts: boolean;
  enableSearch?: boolean;
  outline?: DocumentCreationJob['outline'];
  content?: DocumentCreationJob['content'];
  progress?: DocumentCreationJob['progress'];
  error?: string | null;
}

export interface UpdateDocumentJobInput {
  title?: string;
  prompt?: string;
  status?: DocumentJobStatus;
  pageCount?: number;
  pageRange?: DocumentCreationJob['pageRange'];
  documentKind?: DocumentCreationJob['documentKind'];
  exportFormat?: DocumentCreationJob['exportFormat'];
  templateId?: DocumentCreationJob['templateId'];
  includeTables?: boolean;
  includeCharts?: boolean;
  enableSearch?: boolean;
  outline?: DocumentCreationJob['outline'];
  content?: DocumentCreationJob['content'];
  progress?: DocumentCreationJob['progress'];
  error?: string | null;
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

function serialize(row: DocumentJobRow): DocumentCreationJob {
  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    status: row.status,
    pageCount: row.page_count,
    pageRange: parseJson(row.page_range_json, undefined),
    documentKind: row.document_kind,
    exportFormat: row.export_format,
    templateId: row.template_id || 'executive',
    includeTables: Boolean(row.include_tables),
    includeCharts: Boolean(row.include_charts),
    enableSearch: Boolean(row.enable_search),
    outline: parseJson(row.outline_json, null),
    content: parseJson(row.content_json, null),
    progress: parseJson(row.progress_json, { completed: 0, total: 0, percent: 0 }),
    error: row.error_message,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function listDocumentJobs(userId: string) {
  await ensureDatabaseSchema();

  const [rows] = await getPool().execute<DocumentJobRow[]>(
    `SELECT *
     FROM document_jobs
     WHERE user_id = ?
     ORDER BY updated_at DESC
     LIMIT 50`,
    [userId]
  );

  return rows.map(serialize);
}

export async function getDocumentJob(userId: string, jobId: string) {
  await ensureDatabaseSchema();

  const [rows] = await getPool().execute<DocumentJobRow[]>(
    'SELECT * FROM document_jobs WHERE user_id = ? AND id = ? LIMIT 1',
    [userId, jobId]
  );

  return rows[0] ? serialize(rows[0]) : null;
}

export async function saveDocumentJob(input: SaveDocumentJobInput) {
  await ensureDatabaseSchema();

  const progress = input.progress || { completed: 0, total: 0, percent: 0 };

  await getPool().execute(
    `INSERT INTO document_jobs
     (id, user_id, title, prompt, status, page_count, page_range_json, document_kind, export_format, template_id,
      include_tables, include_charts, enable_search, outline_json, content_json, progress_json, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      title = VALUES(title),
      prompt = VALUES(prompt),
      status = VALUES(status),
      page_count = VALUES(page_count),
      page_range_json = VALUES(page_range_json),
      document_kind = VALUES(document_kind),
      export_format = VALUES(export_format),
      template_id = VALUES(template_id),
      include_tables = VALUES(include_tables),
      include_charts = VALUES(include_charts),
      enable_search = VALUES(enable_search),
      outline_json = VALUES(outline_json),
      content_json = VALUES(content_json),
      progress_json = VALUES(progress_json),
      error_message = VALUES(error_message)`,
    [
      input.id,
      input.userId,
      input.title,
      input.prompt,
      input.status,
      input.pageCount,
      JSON.stringify(input.pageRange || null),
      input.documentKind,
      input.exportFormat,
      input.templateId || 'executive',
      input.includeTables,
      input.includeCharts,
      Boolean(input.enableSearch),
      JSON.stringify(input.outline || null),
      JSON.stringify(input.content || null),
      JSON.stringify(progress),
      input.error || null,
    ]
  );
}

export async function updateDocumentJob(userId: string, jobId: string, updates: UpdateDocumentJobInput) {
  const existing = await getDocumentJob(userId, jobId);
  if (!existing) return null;

  await saveDocumentJob({
    id: existing.id,
    userId,
    title: updates.title ?? existing.title,
    prompt: updates.prompt ?? existing.prompt,
    status: updates.status ?? existing.status,
    pageCount: updates.pageCount ?? existing.pageCount,
    pageRange: updates.pageRange === undefined ? existing.pageRange : updates.pageRange,
    documentKind: updates.documentKind ?? existing.documentKind,
    exportFormat: updates.exportFormat ?? existing.exportFormat,
    templateId: updates.templateId ?? existing.templateId ?? 'executive',
    includeTables: updates.includeTables ?? existing.includeTables,
    includeCharts: updates.includeCharts ?? existing.includeCharts,
    enableSearch: updates.enableSearch ?? existing.enableSearch,
    outline: updates.outline === undefined ? existing.outline : updates.outline,
    content: updates.content === undefined ? existing.content : updates.content,
    progress: updates.progress ?? existing.progress,
    error: updates.error === undefined ? existing.error : updates.error,
  });

  return getDocumentJob(userId, jobId);
}

export async function deleteDocumentJob(userId: string, jobId: string) {
  await ensureDatabaseSchema();

  await getPool().execute(
    'DELETE FROM document_jobs WHERE user_id = ? AND id = ?',
    [userId, jobId]
  );
}
