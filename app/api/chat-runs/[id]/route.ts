import { NextRequest, NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { getChatRun, updateChatRun } from '@/lib/chatRuns';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const run = await getChatRun(user.id, id);

    if (!run) {
      return NextResponse.json({ error: 'Chat run not found' }, { status: 404 });
    }

    return NextResponse.json({ run });
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { status?: string };

    if (body.status !== 'cancelled') {
      return NextResponse.json({ error: 'Only cancellation is supported' }, { status: 400 });
    }

    const run = await updateChatRun(user.id, id, {
      status: 'cancelled',
      statusMessage: null,
      stopReason: 'cancelled',
      error: 'Chat request was cancelled.',
    });

    if (!run) {
      return NextResponse.json({ error: 'Chat run not found' }, { status: 404 });
    }

    return NextResponse.json({ run });
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}
