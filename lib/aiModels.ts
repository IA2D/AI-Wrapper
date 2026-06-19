import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'crypto';
import { RowDataPacket } from 'mysql2';
import { ensureDatabaseSchema, getPool } from './db';

export type AIProvider = 'openai' | 'anthropic' | 'gemini' | 'perplexity' | 'openai-compatible';
export type AIModelStatus = 'active' | 'disabled';

export interface AIModelConfig {
  id: string;
  label: string;
  provider: AIProvider;
  model: string;
  endpoint: string;
  status: AIModelStatus;
  isDefault: boolean;
  supportsText: boolean;
  supportsImage: boolean;
  supportsVoice: boolean;
  supportsJson: boolean;
  hasApiKey: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AIModelRow extends RowDataPacket {
  id: string;
  label: string;
  provider: AIProvider;
  model: string;
  endpoint: string;
  api_key_cipher: string | null;
  status: AIModelStatus;
  is_default: number | boolean;
  supports_text: number | boolean;
  supports_image: number | boolean;
  supports_voice: number | boolean;
  supports_json: number | boolean;
  last_used_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface ResolvedAIModelConfig extends AIModelConfig {
  apiKey: string;
}

export type ModelLimitPeriod = 'day' | 'week' | 'month' | 'year';

export interface AIModelUserLimit {
  id: string;
  userId: string;
  modelConfigId: string;
  limitPeriod: ModelLimitPeriod;
  requestLimit: number | null;
  tokenLimit: number | null;
  createdAt: string;
  updatedAt: string;
}

interface AIModelUserLimitRow extends RowDataPacket {
  id: string;
  user_id: string;
  model_config_id: string;
  limit_period: ModelLimitPeriod;
  request_limit: number | null;
  token_limit: number | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const providerDefaults: Record<AIProvider, { endpoint: string; model: string }> = {
  openai: { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4.1-mini' },
  anthropic: { endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-3-5-sonnet-latest' },
  gemini: { endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-1.5-pro' },
  perplexity: { endpoint: 'https://api.perplexity.ai/chat/completions', model: 'sonar-pro' },
  'openai-compatible': { endpoint: process.env.API_ENDPOINT || '', model: process.env.MODEL || '' },
};

function bool(value: number | boolean) {
  return value === true || value === 1;
}

function toIso(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapRow(row: AIModelRow): AIModelConfig {
  return {
    id: row.id,
    label: row.label,
    provider: row.provider,
    model: row.model,
    endpoint: row.endpoint,
    status: row.status,
    isDefault: bool(row.is_default),
    supportsText: bool(row.supports_text),
    supportsImage: bool(row.supports_image),
    supportsVoice: bool(row.supports_voice),
    supportsJson: bool(row.supports_json),
    hasApiKey: Boolean(row.api_key_cipher),
    lastUsedAt: toIso(row.last_used_at),
    createdAt: toIso(row.created_at) || new Date().toISOString(),
    updatedAt: toIso(row.updated_at) || new Date().toISOString(),
  };
}

function mapLimitRow(row: AIModelUserLimitRow): AIModelUserLimit {
  return {
    id: row.id,
    userId: row.user_id,
    modelConfigId: row.model_config_id,
    limitPeriod: row.limit_period,
    requestLimit: row.request_limit === null ? null : Number(row.request_limit),
    tokenLimit: row.token_limit === null ? null : Number(row.token_limit),
    createdAt: toIso(row.created_at) || new Date().toISOString(),
    updatedAt: toIso(row.updated_at) || new Date().toISOString(),
  };
}

function getEncryptionKey() {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET || process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY || process.env.API_KEY || 'chatbot69-dev-key';
  return createHash('sha256').update(secret).digest();
}

function encryptSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

function decryptSecret(cipherText: string | null) {
  if (!cipherText) return '';

  try {
    const [ivRaw, tagRaw, payloadRaw] = cipherText.split('.');
    if (!ivRaw || !tagRaw || !payloadRaw) return '';
    const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivRaw, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(payloadRaw, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return '';
  }
}

export function providerDefault(provider: AIProvider) {
  return providerDefaults[provider] || providerDefaults['openai-compatible'];
}

export async function listAIModels() {
  await ensureDatabaseSchema();
  const [rows] = await getPool().execute<AIModelRow[]>(
    'SELECT * FROM ai_model_configs ORDER BY is_default DESC, provider ASC, label ASC'
  );
  return rows.map(mapRow);
}

export async function createAIModel(input: {
  label: string;
  provider: AIProvider;
  model: string;
  endpoint: string;
  apiKey: string;
  status?: AIModelStatus;
  isDefault?: boolean;
  supportsText?: boolean;
  supportsImage?: boolean;
  supportsVoice?: boolean;
  supportsJson?: boolean;
}) {
  await ensureDatabaseSchema();
  const id = randomUUID();

  if (input.isDefault) {
    await getPool().execute('UPDATE ai_model_configs SET is_default = FALSE');
  }

  await getPool().execute(
    `INSERT INTO ai_model_configs
      (id, label, provider, model, endpoint, api_key_cipher, status, is_default,
       supports_text, supports_image, supports_voice, supports_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.label,
      input.provider,
      input.model,
      input.endpoint,
      encryptSecret(input.apiKey),
      input.status || 'active',
      Boolean(input.isDefault),
      input.supportsText ?? true,
      input.supportsImage ?? false,
      input.supportsVoice ?? false,
      input.supportsJson ?? true,
    ]
  );

  return getAIModelById(id);
}

export async function updateAIModel(id: string, input: Partial<{
  label: string;
  provider: AIProvider;
  model: string;
  endpoint: string;
  apiKey: string;
  status: AIModelStatus;
  isDefault: boolean;
  supportsText: boolean;
  supportsImage: boolean;
  supportsVoice: boolean;
  supportsJson: boolean;
}>) {
  await ensureDatabaseSchema();

  if (input.isDefault) {
    await getPool().execute('UPDATE ai_model_configs SET is_default = FALSE WHERE id <> ?', [id]);
  }

  const fields: string[] = [];
  const values: Array<string | boolean> = [];
  const mapping: Record<string, string> = {
    label: 'label',
    provider: 'provider',
    model: 'model',
    endpoint: 'endpoint',
    status: 'status',
    isDefault: 'is_default',
    supportsText: 'supports_text',
    supportsImage: 'supports_image',
    supportsVoice: 'supports_voice',
    supportsJson: 'supports_json',
  };

  for (const [key, column] of Object.entries(mapping)) {
    if (key in input) {
      const value = input[key as keyof typeof input];
      if (value === undefined) continue;
      fields.push(`${column} = ?`);
      values.push(value as string | boolean);
    }
  }

  if (input.apiKey) {
    fields.push('api_key_cipher = ?');
    values.push(encryptSecret(input.apiKey));
  }

  if (fields.length === 0) return getAIModelById(id);

  values.push(id);
  await getPool().execute(`UPDATE ai_model_configs SET ${fields.join(', ')} WHERE id = ?`, values);
  return getAIModelById(id);
}

export async function deleteAIModel(id: string) {
  await ensureDatabaseSchema();
  const [result] = await getPool().execute('DELETE FROM ai_model_configs WHERE id = ?', [id]);
  return (result as { affectedRows: number }).affectedRows > 0;
}

export async function getAIModelById(id: string) {
  await ensureDatabaseSchema();
  const [rows] = await getPool().execute<AIModelRow[]>(
    'SELECT * FROM ai_model_configs WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function listActiveAIModels() {
  await ensureDatabaseSchema();
  const [rows] = await getPool().execute<AIModelRow[]>(
    "SELECT * FROM ai_model_configs WHERE status = 'active' ORDER BY is_default DESC, provider ASC, label ASC"
  );
  return rows.map(mapRow);
}

export async function listModelUserLimits(modelConfigId?: string) {
  await ensureDatabaseSchema();
  const params: string[] = [];
  const where = modelConfigId ? 'WHERE model_config_id = ?' : '';
  if (modelConfigId) params.push(modelConfigId);

  const [rows] = await getPool().execute<AIModelUserLimitRow[]>(
    `SELECT * FROM ai_model_user_limits ${where} ORDER BY updated_at DESC`,
    params
  );
  return rows.map(mapLimitRow);
}

export async function upsertModelUserLimit(input: {
  userId: string;
  modelConfigId: string;
  limitPeriod?: ModelLimitPeriod;
  requestLimit?: number | null;
  tokenLimit?: number | null;
}) {
  await ensureDatabaseSchema();
  const id = randomUUID();
  const requestLimit = input.requestLimit && input.requestLimit > 0 ? Math.round(input.requestLimit) : null;
  const tokenLimit = input.tokenLimit && input.tokenLimit > 0 ? Math.round(input.tokenLimit) : null;
  const limitPeriod = input.limitPeriod || 'month';

  await getPool().execute(
    `INSERT INTO ai_model_user_limits
      (id, user_id, model_config_id, limit_period, request_limit, token_limit)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       limit_period = VALUES(limit_period),
       request_limit = VALUES(request_limit),
       token_limit = VALUES(token_limit)`,
    [id, input.userId, input.modelConfigId, limitPeriod, requestLimit, tokenLimit]
  );

  const [rows] = await getPool().execute<AIModelUserLimitRow[]>(
    'SELECT * FROM ai_model_user_limits WHERE user_id = ? AND model_config_id = ? LIMIT 1',
    [input.userId, input.modelConfigId]
  );
  return rows[0] ? mapLimitRow(rows[0]) : null;
}

export async function deleteModelUserLimit(userId: string, modelConfigId: string) {
  await ensureDatabaseSchema();
  const [result] = await getPool().execute(
    'DELETE FROM ai_model_user_limits WHERE user_id = ? AND model_config_id = ?',
    [userId, modelConfigId]
  );
  return (result as { affectedRows: number }).affectedRows > 0;
}

function getPeriodStart(period: ModelLimitPeriod) {
  const start = new Date();
  if (period === 'day') {
    start.setHours(0, 0, 0, 0);
  } else if (period === 'week') {
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    start.setDate(diff);
    start.setHours(0, 0, 0, 0);
  } else if (period === 'year') {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }
  return start;
}

export async function checkModelUserAllowance(
  userId: string,
  modelConfigId: string,
  estimatedInputTokens: number
) {
  if (modelConfigId === 'env-default') return { allowed: true };
  await ensureDatabaseSchema();
  const [limits] = await getPool().execute<AIModelUserLimitRow[]>(
    'SELECT * FROM ai_model_user_limits WHERE user_id = ? AND model_config_id = ? LIMIT 1',
    [userId, modelConfigId]
  );
  const limit = limits[0];
  if (!limit || (!limit.request_limit && !limit.token_limit)) return { allowed: true };

  const periodStart = getPeriodStart(limit.limit_period);
  if (limit.request_limit) {
    const [rows] = await getPool().execute<Array<RowDataPacket & { requests: number | string | null }>>(
      `SELECT COALESCE(SUM(request_count), 0) AS requests
       FROM usage_events
       WHERE user_id = ? AND model_config_id = ? AND source = 'web' AND created_at >= ?`,
      [userId, modelConfigId, periodStart]
    );
    const usedRequests = Number(rows[0]?.requests || 0);
    if (usedRequests + 1 > Number(limit.request_limit)) {
      return {
        allowed: false,
        status: 429,
        error: `Model request quota exceeded: ${usedRequests} of ${limit.request_limit} requests per ${limit.limit_period}`,
      };
    }
  }

  if (limit.token_limit) {
    const [rows] = await getPool().execute<Array<RowDataPacket & { tokens: number | string | null }>>(
      `SELECT COALESCE(SUM(total_tokens), 0) AS tokens
       FROM usage_events
       WHERE user_id = ? AND model_config_id = ? AND source = 'web' AND created_at >= ?`,
      [userId, modelConfigId, periodStart]
    );
    const usedTokens = Number(rows[0]?.tokens || 0);
    if (usedTokens + estimatedInputTokens > Number(limit.token_limit)) {
      return {
        allowed: false,
        status: 429,
        error: `Model token quota exceeded: ${usedTokens} of ${limit.token_limit} tokens per ${limit.limit_period}`,
      };
    }
  }

  return { allowed: true };
}

export async function resolveAIModel(requestedModel?: string | null): Promise<ResolvedAIModelConfig> {
  await ensureDatabaseSchema();

  const params: string[] = [];
  const requested = requestedModel?.trim();
  let where = "status = 'active'";

  if (requested) {
    where += ' AND (model = ? OR id = ?)';
    params.push(requested, requested);
  }

  const [rows] = await getPool().execute<AIModelRow[]>(
    `SELECT * FROM ai_model_configs
     WHERE ${where}
     ORDER BY is_default DESC, updated_at DESC
     LIMIT 1`,
    params
  );

  const row = rows[0];
  if (row) {
    const apiKey = decryptSecret(row.api_key_cipher);
    if (!apiKey) throw new Error(`API token is missing for model "${row.label}"`);
    return { ...mapRow(row), apiKey };
  }

  const [counts] = await getPool().execute<Array<RowDataPacket & { count: number }>>(
    'SELECT COUNT(*) AS count FROM ai_model_configs'
  );
  const hasCatalog = Number(counts[0]?.count || 0) > 0;
  if (requested && hasCatalog) {
    throw new Error(`Model "${requested}" is disabled or not configured`);
  }
  if (hasCatalog) {
    throw new Error('No active model is configured');
  }

  const envModel = process.env.MODEL;
  const envEndpoint = process.env.API_ENDPOINT;
  const envApiKey = process.env.API_KEY;
  if (requested && envModel && requested !== envModel) {
    throw new Error(`Model "${requested}" is disabled or not configured`);
  }

  if (!envModel || !envEndpoint || !envApiKey) {
    throw new Error('Provider API configuration is missing');
  }

  return {
    id: 'env-default',
    label: envModel,
    provider: 'openai-compatible',
    model: envModel,
    endpoint: envEndpoint,
    apiKey: envApiKey,
    status: 'active',
    isDefault: true,
    supportsText: true,
    supportsImage: true,
    supportsVoice: true,
    supportsJson: true,
    hasApiKey: true,
    lastUsedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function touchAIModel(id: string) {
  if (id === 'env-default') return;
  await getPool().execute('UPDATE ai_model_configs SET last_used_at = NOW() WHERE id = ?', [id]);
}
