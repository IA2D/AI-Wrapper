import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth';
import { createApiKey, listApiKeys, LimitPeriod } from '@/lib/usage';

const periods = new Set(['day', 'week', 'month', 'year']);

function parseOptionalPositiveInt(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
}

export async function GET() {
  try {
    await requireAdminUser();
    return NextResponse.json({ apiKeys: await listApiKeys() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Admin access required' },
      { status: 403 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminUser();
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    const limitMode = body.limitMode || 'unlimited';

    if (!name) {
      return NextResponse.json({ error: 'API key name is required' }, { status: 400 });
    }

    // Enforce mutual exclusivity of limitation types
    let limitPeriod: LimitPeriod = 'month';
    let requestLimit: number | null = null;
    let tokenLimit: number | null = null;
    let unlimitedUntil: string | null = null;

    if (limitMode === 'requests') {
      limitPeriod = periods.has(body.limitPeriod) ? body.limitPeriod as LimitPeriod : 'month';
      requestLimit = parseOptionalPositiveInt(body.requestLimit);
      if (!requestLimit) {
        return NextResponse.json({ error: 'Request limit is required when mode is "requests"' }, { status: 400 });
      }
    } else if (limitMode === 'tokens') {
      limitPeriod = periods.has(body.limitPeriod) ? body.limitPeriod as LimitPeriod : 'month';
      tokenLimit = parseOptionalPositiveInt(body.tokenLimit);
      if (!tokenLimit) {
        return NextResponse.json({ error: 'Token limit is required when mode is "tokens"' }, { status: 400 });
      }
    } else if (limitMode === 'date') {
      unlimitedUntil = body.unlimitedUntil ? String(body.unlimitedUntil) : null;
      if (!unlimitedUntil) {
        return NextResponse.json({ error: 'Valid until date is required when mode is "date"' }, { status: 400 });
      }
    }
    // else: unlimited - all limits remain null

    const result = await createApiKey({
      name,
      createdBy: admin.id,
      allowText: Boolean(body.allowText ?? true),
      allowImage: Boolean(body.allowImage),
      allowVideo: Boolean(body.allowVideo),
      allowVoice: Boolean(body.allowVoice),
      limitPeriod,
      requestLimit,
      tokenLimit,
      unlimitedUntil,
      assignedUserId: body.assignedUserId ? String(body.assignedUserId) : null,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to create API key' },
      { status: 403 }
    );
  }
}
