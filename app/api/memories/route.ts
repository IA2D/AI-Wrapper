import { NextRequest, NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { createUserMemory, listUserMemories } from '@/lib/userMemories';

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const memories = await listUserMemories(user.id);
    return NextResponse.json({ memories });
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json().catch(() => ({}));
    const memory = await createUserMemory(user.id, {
      kind: body.kind,
      content: body.content,
      importance: body.importance,
    });

    if (!memory) {
      return NextResponse.json({ error: 'Memory content is required' }, { status: 400 });
    }

    return NextResponse.json({ memory }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}
