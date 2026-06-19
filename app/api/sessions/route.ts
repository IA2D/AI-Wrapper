import { NextRequest, NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { ChatSession } from '@/types';
import { listChatSessions, saveChatSession } from '@/lib/chatSessions';

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const sessions = await listChatSessions(user.id);
    return NextResponse.json({ sessions });
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const session = (await request.json()) as ChatSession;
    const savedSession = await saveChatSession(user.id, session);
    return NextResponse.json({ session: savedSession }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}
