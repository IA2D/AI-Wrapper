import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth';
import { deleteModelUserLimit, listModelUserLimits, upsertModelUserLimit } from '@/lib/aiModels';
import type { ModelLimitPeriod } from '@/lib/aiModels';

const periods = new Set(['day', 'week', 'month', 'year']);

function parsePeriod(value: unknown): ModelLimitPeriod {
  const period = String(value || 'month');
  return periods.has(period) ? period as ModelLimitPeriod : 'month';
}

function positiveOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminUser();
    const modelId = request.nextUrl.searchParams.get('modelId') || undefined;
    return NextResponse.json({ limits: await listModelUserLimits(modelId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Admin access required' },
      { status: 403 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminUser();
    const body = await request.json().catch(() => ({}));
    const userId = String(body.userId || '').trim();
    const modelConfigId = String(body.modelConfigId || '').trim();

    if (!userId || !modelConfigId) {
      return NextResponse.json({ error: 'userId and modelConfigId are required' }, { status: 400 });
    }

    const requestLimit = positiveOrNull(body.requestLimit);
    const tokenLimit = positiveOrNull(body.tokenLimit);

    if (!requestLimit && !tokenLimit) {
      await deleteModelUserLimit(userId, modelConfigId);
      return NextResponse.json({ limit: null });
    }

    const limit = await upsertModelUserLimit({
      userId,
      modelConfigId,
      limitPeriod: parsePeriod(body.limitPeriod),
      requestLimit,
      tokenLimit,
    });

    return NextResponse.json({ limit });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to save model limit' },
      { status: 403 }
    );
  }
}
