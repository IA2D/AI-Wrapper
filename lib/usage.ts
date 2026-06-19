import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'crypto';
import { RowDataPacket } from 'mysql2';
import { ensureDatabaseSchema, getPool } from './db';

export type UsageCapability = 'text' | 'image' | 'video' | 'voice';
export type LimitPeriod = 'day' | 'week' | 'month' | 'year';

export interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  status: 'active' | 'disabled';
  allowText: boolean;
  allowImage: boolean;
  allowVideo: boolean;
  allowVoice: boolean;
  limitPeriod: LimitPeriod;
  requestLimit: number | null;
  tokenLimit: number | null;
  unlimitedUntil: string | null;
  createdBy: string | null;
  assignedUserId: string | null;
  assignedUserName?: string | null;
  assignedUserEmail?: string | null;
  canRevealToken: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ApiKeyRow extends RowDataPacket {
  id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  status: 'active' | 'disabled';
  allow_text: number | boolean;
  allow_image: number | boolean;
  allow_video: number | boolean;
  allow_voice: number | boolean;
  limit_period: LimitPeriod;
  request_limit: number | null;
  token_limit: number | null;
  unlimited_until: Date | string | null;
  created_by: string | null;
  assigned_user_id: string | null;
  assigned_user_name?: string | null;
  assigned_user_email?: string | null;
  token_cipher: string | null;
  last_used_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function bool(value: number | boolean) {
  return value === true || value === 1;
}

function toIso(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapApiKey(row: ApiKeyRow): ApiKeyRecord {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    status: row.status,
    allowText: bool(row.allow_text),
    allowImage: bool(row.allow_image),
    allowVideo: bool(row.allow_video),
    allowVoice: bool(row.allow_voice),
    limitPeriod: row.limit_period,
    requestLimit: row.request_limit,
    tokenLimit: row.token_limit,
    unlimitedUntil: toIso(row.unlimited_until),
    createdBy: row.created_by,
    assignedUserId: row.assigned_user_id,
    assignedUserName: row.assigned_user_name || null,
    assignedUserEmail: row.assigned_user_email || null,
    canRevealToken: Boolean(row.token_cipher),
    lastUsedAt: toIso(row.last_used_at),
    createdAt: toIso(row.created_at) || new Date().toISOString(),
    updatedAt: toIso(row.updated_at) || new Date().toISOString(),
  };
}

export function hashApiKey(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function generateApiKey() {
  return `sk_${randomBytes(32).toString('base64url')}`;
}

function getTokenEncryptionKey() {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET || process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY || process.env.API_KEY || 'chatbot69-dev-key';
  return createHash('sha256').update(secret).digest();
}

function encryptApiToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getTokenEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

function decryptApiToken(cipherText: string | null) {
  if (!cipherText) return null;

  try {
    const [ivRaw, tagRaw, payloadRaw] = cipherText.split('.');
    if (!ivRaw || !tagRaw || !payloadRaw) return null;

    const decipher = createDecipheriv('aes-256-gcm', getTokenEncryptionKey(), Buffer.from(ivRaw, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(payloadRaw, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

export async function createApiKey(input: {
  name: string;
  createdBy: string;
  allowText: boolean;
  allowImage: boolean;
  allowVideo: boolean;
  allowVoice: boolean;
  limitPeriod: LimitPeriod;
  requestLimit?: number | null;
  tokenLimit?: number | null;
  unlimitedUntil?: string | null;
  assignedUserId?: string | null;
}) {
  await ensureDatabaseSchema();

  const rawKey = generateApiKey();
  const id = randomUUID();
  const keyPrefix = rawKey.slice(0, 15);
  const unlimitedUntil = input.unlimitedUntil ? new Date(input.unlimitedUntil) : null;

  await getPool().execute(
    `INSERT INTO api_keys
      (id, name, key_hash, key_prefix, allow_text, allow_image, allow_video, allow_voice,
       limit_period, request_limit, token_limit, unlimited_until, created_by, assigned_user_id, token_cipher)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      hashApiKey(rawKey),
      keyPrefix,
      input.allowText,
      input.allowImage,
      input.allowVideo,
      input.allowVoice,
      input.limitPeriod,
      input.requestLimit ?? null,
      input.tokenLimit ?? null,
      unlimitedUntil,
      input.createdBy,
      input.assignedUserId || null,
      encryptApiToken(rawKey),
    ]
  );

  const record = await getApiKeyById(id);
  return { apiKey: record, token: rawKey };
}

export async function listApiKeys() {
  await ensureDatabaseSchema();

  const [rows] = await getPool().execute<ApiKeyRow[]>(
    `SELECT api_keys.*, users.name AS assigned_user_name, users.email AS assigned_user_email
     FROM api_keys
     LEFT JOIN users ON users.id = api_keys.assigned_user_id
     ORDER BY api_keys.created_at DESC`
  );

  return rows.map(mapApiKey);
}

export async function getApiKeyById(id: string) {
  await ensureDatabaseSchema();

  const [rows] = await getPool().execute<ApiKeyRow[]>(
    `SELECT api_keys.*, users.name AS assigned_user_name, users.email AS assigned_user_email
     FROM api_keys
     LEFT JOIN users ON users.id = api_keys.assigned_user_id
     WHERE api_keys.id = ?
     LIMIT 1`,
    [id]
  );

  return rows[0] ? mapApiKey(rows[0]) : null;
}

export async function updateApiKey(id: string, input: Partial<{
  name: string;
  status: 'active' | 'disabled';
  allowText: boolean;
  allowImage: boolean;
  allowVideo: boolean;
  allowVoice: boolean;
  limitPeriod: LimitPeriod;
  requestLimit: number | null;
  tokenLimit: number | null;
  unlimitedUntil: string | null;
  assignedUserId: string | null;
}>) {
  await ensureDatabaseSchema();

  const fields: string[] = [];
  const values: Array<string | number | boolean | Date | null> = [];
  const mapping: Record<string, string> = {
    name: 'name',
    status: 'status',
    allowText: 'allow_text',
    allowImage: 'allow_image',
    allowVideo: 'allow_video',
    allowVoice: 'allow_voice',
    limitPeriod: 'limit_period',
    requestLimit: 'request_limit',
    tokenLimit: 'token_limit',
    unlimitedUntil: 'unlimited_until',
    assignedUserId: 'assigned_user_id',
  };

  for (const [key, column] of Object.entries(mapping)) {
    if (key in input) {
      fields.push(`${column} = ?`);
      const value = input[key as keyof typeof input];
      values.push(key === 'unlimitedUntil' && value ? new Date(String(value)) : value ?? null);
    }
  }

  if (fields.length === 0) return getApiKeyById(id);

  values.push(id);
  await getPool().execute(`UPDATE api_keys SET ${fields.join(', ')} WHERE id = ?`, values);
  return getApiKeyById(id);
}

export async function deleteApiKey(id: string) {
  await ensureDatabaseSchema();

  const [result] = await getPool().execute(
    'DELETE FROM api_keys WHERE id = ?',
    [id]
  );

  // Also clean up related usage events (optional - keep for audit or delete)
  // await getPool().execute('DELETE FROM usage_events WHERE api_key_id = ?', [id]);

  return (result as { affectedRows: number }).affectedRows > 0;
}

export async function authenticateApiKey(token: string) {
  await ensureDatabaseSchema();

  const [rows] = await getPool().execute<ApiKeyRow[]>(
    `SELECT api_keys.*, users.name AS assigned_user_name, users.email AS assigned_user_email
     FROM api_keys
     LEFT JOIN users ON users.id = api_keys.assigned_user_id
     WHERE key_hash = ? AND status = 'active'
     LIMIT 1`,
    [hashApiKey(token)]
  );

  return rows[0] ? mapApiKey(rows[0]) : null;
}

export async function listUserApiKeys(userId: string) {
  await ensureDatabaseSchema();

  const [rows] = await getPool().execute<ApiKeyRow[]>(
    `SELECT api_keys.*, users.name AS assigned_user_name, users.email AS assigned_user_email
     FROM api_keys
     LEFT JOIN users ON users.id = api_keys.assigned_user_id
     WHERE api_keys.assigned_user_id = ?
     ORDER BY api_keys.created_at DESC`,
    [userId]
  );

  return rows.map((row) => ({
    ...mapApiKey(row),
    token: decryptApiToken(row.token_cipher),
  }));
}

export async function userHasApiKeys(userId: string) {
  await ensureDatabaseSchema();

  const [rows] = await getPool().execute<Array<RowDataPacket & { count: number }>>(
    "SELECT COUNT(*) AS count FROM api_keys WHERE assigned_user_id = ? AND status = 'active'",
    [userId]
  );

  return Number(rows[0]?.count || 0) > 0;
}

export async function getApiKeyUsage(apiKeyId: string, userId?: string) {
  await ensureDatabaseSchema();

  const params: Array<string | Date> = [apiKeyId];
  const ownershipClause = userId ? ' AND api_keys.assigned_user_id = ?' : '';
  if (userId) params.push(userId);

  const [keys] = await getPool().execute<Array<RowDataPacket & { id: string }>>(
    `SELECT api_keys.id
     FROM api_keys
     WHERE api_keys.id = ?${ownershipClause}
     LIMIT 1`,
    params
  );

  if (!keys[0]) return null;

  const [totals] = await getPool().execute<Array<RowDataPacket & {
    requests: number | string;
    tokens: number | string;
    input_tokens: number | string;
    output_tokens: number | string;
  }>>(
    `SELECT COALESCE(SUM(request_count), 0) AS requests,
            COALESCE(SUM(total_tokens), 0) AS tokens,
            COALESCE(SUM(input_tokens), 0) AS input_tokens,
            COALESCE(SUM(output_tokens), 0) AS output_tokens
     FROM usage_events
     WHERE api_key_id = ?`,
    [apiKeyId]
  );

  const [byPeriod] = await getPool().execute<Array<RowDataPacket & {
    day: string;
    requests: number | string;
    tokens: number | string;
    input_tokens: number | string;
    output_tokens: number | string;
  }>>(
    `SELECT DATE(created_at) AS day,
            COALESCE(SUM(request_count), 0) AS requests,
            COALESCE(SUM(total_tokens), 0) AS tokens,
            COALESCE(SUM(input_tokens), 0) AS input_tokens,
            COALESCE(SUM(output_tokens), 0) AS output_tokens
     FROM usage_events
     WHERE api_key_id = ?
     GROUP BY DATE(created_at)
     ORDER BY day DESC
     LIMIT 90`,
    [apiKeyId]
  );

  const [events] = await getPool().execute<Array<RowDataPacket & {
    id: string;
    capability: UsageCapability;
    request_count: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    model: string | null;
    created_at: Date;
  }>>(
    `SELECT id, capability, request_count, input_tokens, output_tokens, total_tokens, model, created_at
     FROM usage_events
     WHERE api_key_id = ?
     ORDER BY created_at DESC
     LIMIT 100`,
    [apiKeyId]
  );

  return {
    totals: {
      requests: Number(totals[0]?.requests || 0),
      tokens: Number(totals[0]?.tokens || 0),
      inputTokens: Number(totals[0]?.input_tokens || 0),
      outputTokens: Number(totals[0]?.output_tokens || 0),
    },
    daily: byPeriod.map((row) => ({
      day: String(row.day),
      requests: Number(row.requests || 0),
      tokens: Number(row.tokens || 0),
      inputTokens: Number(row.input_tokens || 0),
      outputTokens: Number(row.output_tokens || 0),
    })),
    events: events.map((event) => ({
      id: event.id,
      capability: event.capability,
      requestCount: event.request_count,
      inputTokens: event.input_tokens,
      outputTokens: event.output_tokens,
      totalTokens: event.total_tokens,
      model: event.model,
      createdAt: event.created_at.toISOString(),
    })),
  };
}

function capabilityAllowed(apiKey: ApiKeyRecord, capability: UsageCapability) {
  if (capability === 'image') return apiKey.allowImage;
  if (capability === 'video') return apiKey.allowVideo;
  if (capability === 'voice') return apiKey.allowVoice;
  return apiKey.allowText;
}

function getPeriodStart(period: LimitPeriod) {
  const now = new Date();
  const start = new Date(now);

  if (period === 'day') {
    start.setHours(0, 0, 0, 0);
  } else if (period === 'week') {
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
    start.setHours(0, 0, 0, 0);
  } else if (period === 'month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  }

  return start;
}

export async function checkApiKeyAllowance(
  apiKey: ApiKeyRecord,
  capability: UsageCapability,
  estimatedInputTokens: number
) {
  if (!capabilityAllowed(apiKey, capability)) {
    return { allowed: false, status: 403, error: `${capability} usage is not allowed for this API key` };
  }

  // Priority 1: Date-based limit (unlimited until a specific date)
  // If the date is in the future, allow usage. If expired, fall through to other checks.
  if (apiKey.unlimitedUntil) {
    if (new Date(apiKey.unlimitedUntil).getTime() > Date.now()) {
      return { allowed: true };
    }
    // If date has passed and no other limits are set, deny access
    if (!apiKey.requestLimit && !apiKey.tokenLimit) {
      return {
        allowed: false,
        status: 403,
        error: 'API key has expired',
      };
    }
  }

  // Priority 2: Request-based limit (mutually exclusive with token limit)
  if (apiKey.requestLimit) {
    const periodStart = getPeriodStart(apiKey.limitPeriod);
    const [rows] = await getPool().execute<Array<RowDataPacket & { requests: number | string | null }>>(
      `SELECT COALESCE(SUM(request_count), 0) AS requests
       FROM usage_events
       WHERE api_key_id = ? AND created_at >= ?`,
      [apiKey.id, periodStart]
    );

    const usedRequests = Number(rows[0]?.requests || 0);

    if (usedRequests + 1 > apiKey.requestLimit) {
      return {
        allowed: false,
        status: 429,
        error: `Request quota exceeded: ${usedRequests} of ${apiKey.requestLimit} requests per ${apiKey.limitPeriod}`,
        usage: { usedRequests, requestLimit: apiKey.requestLimit },
      };
    }

    return { allowed: true };
  }

  // Priority 3: Token-based limit (mutually exclusive with request limit)
  if (apiKey.tokenLimit) {
    const periodStart = getPeriodStart(apiKey.limitPeriod);
    const [rows] = await getPool().execute<Array<RowDataPacket & { tokens: number | string | null }>>(
      `SELECT COALESCE(SUM(total_tokens), 0) AS tokens
       FROM usage_events
       WHERE api_key_id = ? AND created_at >= ?`,
      [apiKey.id, periodStart]
    );

    const usedTokens = Number(rows[0]?.tokens || 0);

    if (usedTokens + estimatedInputTokens > apiKey.tokenLimit) {
      return {
        allowed: false,
        status: 429,
        error: `Token quota exceeded: ${usedTokens} of ${apiKey.tokenLimit} tokens per ${apiKey.limitPeriod}`,
        usage: { usedTokens, tokenLimit: apiKey.tokenLimit },
      };
    }

    return { allowed: true };
  }

  // Priority 4: No limits set = unlimited
  return { allowed: true };
}

export async function touchApiKey(apiKeyId: string) {
  await getPool().execute('UPDATE api_keys SET last_used_at = NOW() WHERE id = ?', [apiKeyId]);
}

export async function recordUsage(input: {
  userId?: string | null;
  apiKeyId?: string | null;
  modelConfigId?: string | null;
  source: 'web' | 'api';
  capability: UsageCapability;
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
  model?: string | null;
  metadata?: unknown;
}) {
  await ensureDatabaseSchema();

  const totalTokens = input.totalTokens ?? input.inputTokens + input.outputTokens;

  await getPool().execute(
    `INSERT INTO usage_events
      (id, user_id, api_key_id, model_config_id, source, capability, input_tokens, output_tokens, total_tokens, model, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      input.userId ?? null,
      input.apiKeyId ?? null,
      input.modelConfigId ?? null,
      input.source,
      input.capability,
      Math.max(0, Math.round(input.inputTokens)),
      Math.max(0, Math.round(input.outputTokens)),
      Math.max(0, Math.round(totalTokens)),
      input.model ?? null,
      input.metadata === undefined ? null : JSON.stringify(input.metadata),
    ]
  );
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!content || typeof content !== 'object') return '';

  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part) return String((part as { text?: unknown }).text || '');
      return '';
    }).join(' ');
  }

  return String((content as { text?: unknown }).text || '');
}

export function detectCapability(messages: unknown[]): UsageCapability {
  const serialized = JSON.stringify(messages || []);
  if (/"video"|video_url|video\//i.test(serialized)) return 'video';
  if (/"audio"|audio_url|input_audio|voice|audio\//i.test(serialized)) return 'voice';
  if (/"image"|image_url|image\//i.test(serialized)) return 'image';
  return 'text';
}

export function estimateTokensFromMessages(messages: unknown[]): number {
  const textChars = (messages || []).reduce<number>((total, message) => {
    const content = (message as { content?: unknown })?.content;
    return total + textFromContent(content).length;
  }, 0);
  const serialized = JSON.stringify(messages || []);
  const imageCount = (serialized.match(/image_url|image\//gi) || []).length;
  const audioCount = (serialized.match(/audio_url|input_audio|audio\//gi) || []).length;
  const videoCount = (serialized.match(/video_url|video\//gi) || []).length;

  return Math.max(1, Math.ceil(textChars / 4) + imageCount * 1000 + audioCount * 1500 + videoCount * 3000);
}

export function parseProviderUsage(data: unknown, fallbackInputTokens: number, fallbackOutputText = '') {
  const usage = (data as { usage?: Record<string, unknown> })?.usage || {};
  const inputTokens = Number(
    usage.prompt_tokens ??
    usage.input_tokens ??
    usage.promptTokens ??
    fallbackInputTokens
  );
  const outputTokens = Number(
    usage.completion_tokens ??
    usage.output_tokens ??
    usage.completionTokens ??
    estimateTokensFromText(fallbackOutputText)
  );
  const totalTokens = Number(
    usage.total_tokens ??
    usage.totalTokens ??
    inputTokens + outputTokens
  );

  return { inputTokens, outputTokens, totalTokens };
}

export function estimateTokensFromText(text: string) {
  return text.trim() ? Math.max(1, Math.ceil(text.length / 4)) : 0;
}

export function extractTextFromProviderResponse(data: unknown) {
  const value = data as any;
  return String(
    value?.choices?.[0]?.message?.content ??
    value?.choices?.[0]?.delta?.content ??
    value?.output_text ??
    value?.response?.output_text ??
    value?.answer ??
    value?.content ??
    value?.message ??
    ''
  );
}

export function meterOpenAIStream(
  body: ReadableStream<Uint8Array> | null,
  onComplete: (outputText: string) => Promise<void> | void
) {
  if (!body) return body;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let outputText = '';
  let buffer = '';

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = body.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunkText = decoder.decode(value, { stream: true });
          buffer += chunkText;
          outputText += extractStreamingText(buffer);
          buffer = keepTrailingPartialEvent(buffer);
          controller.enqueue(value);
        }

        await onComplete(outputText);
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
    cancel() {
      void onComplete(outputText);
    },
  });
}

function keepTrailingPartialEvent(value: string) {
  const index = value.lastIndexOf('\n\n');
  return index === -1 ? value : value.slice(index + 2);
}

function extractStreamingText(buffer: string) {
  const events = buffer.split('\n\n');
  events.pop();

  let text = '';
  for (const event of events) {
    const data = event
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice(6))
      .join('\n');

    if (!data || data === '[DONE]') continue;

    try {
      const parsed = JSON.parse(data);
      const eventType = String(parsed.type || '');
      const delta = typeof parsed.delta === 'string' && !/reasoning|thinking/i.test(eventType)
        ? parsed.delta
        : '';
      text +=
        parsed.choices?.[0]?.delta?.content ||
        parsed.choices?.[0]?.message?.content ||
        parsed.output_text_delta ||
        parsed.response?.output_text?.delta ||
        parsed.answer ||
        parsed.content ||
        parsed.message ||
        delta ||
        '';
    } catch {
      // Some providers send non-JSON events. They still pass through unchanged.
    }
  }

  return text;
}
