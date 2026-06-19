import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth';
import { LimitPeriod, updateApiKey, deleteApiKey } from '@/lib/usage';

const periods = new Set(['day', 'week', 'month', 'year']);

function parseOptionalPositiveInt(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminUser();
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const update: Parameters<typeof updateApiKey>[1] = {};

    if ('name' in body) update.name = String(body.name || '').trim();
    if ('status' in body) update.status = body.status === 'disabled' ? 'disabled' : 'active';
    if ('allowText' in body) update.allowText = Boolean(body.allowText);
    if ('allowImage' in body) update.allowImage = Boolean(body.allowImage);
    if ('allowVideo' in body) update.allowVideo = Boolean(body.allowVideo);
    if ('allowVoice' in body) update.allowVoice = Boolean(body.allowVoice);
    if ('assignedUserId' in body) update.assignedUserId = body.assignedUserId ? String(body.assignedUserId) : null;

    // Handle limit mode change with mutual exclusivity
    if ('limitMode' in body) {
      const limitMode = body.limitMode;
      if (limitMode === 'unlimited') {
        update.requestLimit = null;
        update.tokenLimit = null;
        update.unlimitedUntil = null;
      } else if (limitMode === 'requests') {
        update.requestLimit = parseOptionalPositiveInt(body.requestLimit) ?? 0;
        update.tokenLimit = null;
        update.unlimitedUntil = null;
        if ('limitPeriod' in body && periods.has(body.limitPeriod)) {
          update.limitPeriod = body.limitPeriod as LimitPeriod;
        }
      } else if (limitMode === 'tokens') {
        update.tokenLimit = parseOptionalPositiveInt(body.tokenLimit) ?? 0;
        update.requestLimit = null;
        update.unlimitedUntil = null;
        if ('limitPeriod' in body && periods.has(body.limitPeriod)) {
          update.limitPeriod = body.limitPeriod as LimitPeriod;
        }
      } else if (limitMode === 'date') {
        update.unlimitedUntil = body.unlimitedUntil ? String(body.unlimitedUntil) : null;
        update.requestLimit = null;
        update.tokenLimit = null;
      }
    } else {
      // Individual field updates (backward compatible)
      if ('limitPeriod' in body && periods.has(body.limitPeriod)) update.limitPeriod = body.limitPeriod as LimitPeriod;
      if ('requestLimit' in body) update.requestLimit = parseOptionalPositiveInt(body.requestLimit);
      if ('tokenLimit' in body) update.tokenLimit = parseOptionalPositiveInt(body.tokenLimit);
      if ('unlimitedUntil' in body) update.unlimitedUntil = body.unlimitedUntil ? String(body.unlimitedUntil) : null;
    }

    const apiKey = await updateApiKey(id, update);
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    return NextResponse.json({ apiKey });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update API key' },
      { status: 403 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminUser();
    const { id } = await context.params;

    const deleted = await deleteApiKey(id);
    if (!deleted) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to delete API key' },
      { status: 403 }
    );
  }
}
