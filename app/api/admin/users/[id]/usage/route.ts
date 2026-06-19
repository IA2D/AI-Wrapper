import { NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import { requireAdminUser } from '@/lib/auth';
import { ensureDatabaseSchema, getPool } from '@/lib/db';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminUser();
    await ensureDatabaseSchema();

    const { id } = await context.params;

    const [users] = await getPool().execute<Array<RowDataPacket & {
      id: string;
      name: string;
      email: string;
      role: string;
      created_at: Date;
    }>>(
      'SELECT id, name, email, role, created_at FROM users WHERE id = ? LIMIT 1',
      [id]
    );

    if (!users[0]) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const [daily] = await getPool().execute<Array<RowDataPacket & {
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
       WHERE user_id = ?
       GROUP BY DATE(created_at)
       ORDER BY day DESC
       LIMIT 60`,
      [id]
    );

    const [events] = await getPool().execute<Array<RowDataPacket & {
      id: string;
      source: string;
      capability: string;
      request_count: number;
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
      model: string | null;
      created_at: Date;
    }>>(
      `SELECT id, source, capability, request_count, input_tokens,
              output_tokens, total_tokens, model, created_at
       FROM usage_events
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 100`,
      [id]
    );

    const totals = daily.reduce(
      (acc, row) => ({
        requests: acc.requests + Number(row.requests || 0),
        tokens: acc.tokens + Number(row.tokens || 0),
        inputTokens: acc.inputTokens + Number(row.input_tokens || 0),
        outputTokens: acc.outputTokens + Number(row.output_tokens || 0),
      }),
      { requests: 0, tokens: 0, inputTokens: 0, outputTokens: 0 }
    );

    return NextResponse.json({
      user: {
        id: users[0].id,
        name: users[0].name,
        email: users[0].email,
        role: users[0].role,
        createdAt: users[0].created_at.toISOString(),
      },
      totals,
      daily: daily.map((row) => ({
        day: row.day,
        requests: Number(row.requests || 0),
        tokens: Number(row.tokens || 0),
        inputTokens: Number(row.input_tokens || 0),
        outputTokens: Number(row.output_tokens || 0),
      })),
      events: events.map((event) => ({
        id: event.id,
        source: event.source,
        capability: event.capability,
        requestCount: event.request_count,
        inputTokens: event.input_tokens,
        outputTokens: event.output_tokens,
        totalTokens: event.total_tokens,
        model: event.model,
        createdAt: event.created_at.toISOString(),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Admin access required' },
      { status: 403 }
    );
  }
}
