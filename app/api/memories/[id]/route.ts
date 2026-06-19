import { NextRequest, NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { deleteUserMemory, getUserMemory, updateUserMemory } from '@/lib/userMemories';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const memory = await getUserMemory(user.id, id);

    if (!memory) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
    }

    return NextResponse.json({ memory });
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const memory = await updateUserMemory(user.id, id, {
      kind: body.kind,
      content: body.content,
      importance: body.importance,
    });

    if (!memory) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
    }

    return NextResponse.json({ memory });
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const deleted = await deleteUserMemory(user.id, id);

    if (!deleted) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}
