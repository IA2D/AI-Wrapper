import { NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import { requireAdminUser } from '@/lib/auth';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import { listApiKeys } from '@/lib/usage';

export async function GET() {
  try {
    await requireAdminUser();
    await ensureDatabaseSchema();

    const [users] = await getPool().execute<Array<RowDataPacket & {
      id: string;
      name: string;
      email: string;
      role: string;
      created_at: Date;
      requests: number | string;
      tokens: number | string;
      input_tokens: number | string;
      output_tokens: number | string;
      last_used_at: Date | null;
    }>>(
      `SELECT users.id, users.name, users.email, users.role, users.created_at,
              COALESCE(SUM(usage_events.request_count), 0) AS requests,
              COALESCE(SUM(usage_events.total_tokens), 0) AS tokens,
              COALESCE(SUM(usage_events.input_tokens), 0) AS input_tokens,
              COALESCE(SUM(usage_events.output_tokens), 0) AS output_tokens,
              MAX(usage_events.created_at) AS last_used_at
       FROM users
       LEFT JOIN usage_events ON usage_events.user_id = users.id
       GROUP BY users.id, users.name, users.email, users.role, users.created_at
       ORDER BY users.created_at DESC`
    );

    const [apiUsage] = await getPool().execute<Array<RowDataPacket & {
      api_key_id: string | null;
      name: string | null;
      key_prefix: string | null;
      requests: number | string;
      tokens: number | string;
      input_tokens: number | string;
      output_tokens: number | string;
      last_used_at: Date | null;
    }>>(
      `SELECT api_keys.id AS api_key_id, api_keys.name, api_keys.key_prefix,
              COALESCE(SUM(usage_events.request_count), 0) AS requests,
              COALESCE(SUM(usage_events.total_tokens), 0) AS tokens,
              COALESCE(SUM(usage_events.input_tokens), 0) AS input_tokens,
              COALESCE(SUM(usage_events.output_tokens), 0) AS output_tokens,
              MAX(usage_events.created_at) AS last_used_at
       FROM api_keys
       LEFT JOIN usage_events ON usage_events.api_key_id = api_keys.id
       GROUP BY api_keys.id, api_keys.name, api_keys.key_prefix
       ORDER BY tokens DESC, requests DESC`
    );

    const [recentEvents] = await getPool().execute<Array<RowDataPacket & {
      id: string;
      source: string;
      capability: string;
      request_count: number;
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
      model: string | null;
      created_at: Date;
      user_name: string | null;
      user_email: string | null;
      api_key_name: string | null;
      key_prefix: string | null;
    }>>(
      `SELECT usage_events.id, usage_events.source, usage_events.capability,
              usage_events.request_count, usage_events.input_tokens,
              usage_events.output_tokens, usage_events.total_tokens,
              usage_events.model, usage_events.created_at,
              users.name AS user_name, users.email AS user_email,
              api_keys.name AS api_key_name, api_keys.key_prefix
       FROM usage_events
       LEFT JOIN users ON users.id = usage_events.user_id
       LEFT JOIN api_keys ON api_keys.id = usage_events.api_key_id
       ORDER BY usage_events.created_at DESC
       LIMIT 50`
    );

    return NextResponse.json({
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.created_at.toISOString(),
        requests: Number(user.requests || 0),
        tokens: Number(user.tokens || 0),
        inputTokens: Number(user.input_tokens || 0),
        outputTokens: Number(user.output_tokens || 0),
        lastUsedAt: user.last_used_at?.toISOString() || null,
      })),
      apiKeys: await listApiKeys(),
      apiUsage: apiUsage.map((row) => ({
        apiKeyId: row.api_key_id,
        name: row.name,
        keyPrefix: row.key_prefix,
        requests: Number(row.requests || 0),
        tokens: Number(row.tokens || 0),
        inputTokens: Number(row.input_tokens || 0),
        outputTokens: Number(row.output_tokens || 0),
        lastUsedAt: row.last_used_at?.toISOString() || null,
      })),
      recentEvents: recentEvents.map((event) => ({
        id: event.id,
        source: event.source,
        capability: event.capability,
        requestCount: event.request_count,
        inputTokens: event.input_tokens,
        outputTokens: event.output_tokens,
        totalTokens: event.total_tokens,
        model: event.model,
        createdAt: event.created_at.toISOString(),
        userName: event.user_name,
        userEmail: event.user_email,
        apiKeyName: event.api_key_name,
        keyPrefix: event.key_prefix,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Admin access required' },
      { status: 403 }
    );
  }
}
