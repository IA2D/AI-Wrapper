import { NextRequest, NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import { ChatSession } from '@/types';
import { updateChatSession } from '@/lib/chatSessions';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDatabaseSchema();

  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const updates = (await request.json()) as Partial<ChatSession>;
    const updatedAt = await updateChatSession(user.id, id, updates);

    return NextResponse.json({ success: true, updatedAt });
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDatabaseSchema();

  try {
    const user = await requireCurrentUser();
    const { id } = await params;

    await getPool().execute('DELETE FROM chat_sessions WHERE id = ? AND user_id = ?', [id, user.id]);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}
