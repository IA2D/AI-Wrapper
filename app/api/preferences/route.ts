import { NextRequest, NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import { requireCurrentUser } from '@/lib/auth';
import { ensureDatabaseSchema, getPool } from '@/lib/db';

interface PreferenceRow extends RowDataPacket {
  thinking_mode: number | boolean;
  current_session_id: string | null;
}

export async function GET() {
  await ensureDatabaseSchema();

  try {
    const user = await requireCurrentUser();
    await getPool().execute('INSERT IGNORE INTO user_preferences (user_id) VALUES (?)', [user.id]);

    const [rows] = await getPool().execute<PreferenceRow[]>(
      'SELECT thinking_mode, current_session_id FROM user_preferences WHERE user_id = ? LIMIT 1',
      [user.id]
    );

    return NextResponse.json({
      thinkingMode: Boolean(rows[0]?.thinking_mode),
      currentSessionId: rows[0]?.current_session_id || null,
    });
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}

export async function PATCH(request: NextRequest) {
  await ensureDatabaseSchema();

  try {
    const user = await requireCurrentUser();
    const body = await request.json().catch(() => ({}));
    const existing = await getPool().execute('INSERT IGNORE INTO user_preferences (user_id) VALUES (?)', [user.id]);
    void existing;

    if (body.thinkingMode !== undefined) {
      await getPool().execute('UPDATE user_preferences SET thinking_mode = ? WHERE user_id = ?', [
        Boolean(body.thinkingMode),
        user.id,
      ]);
    }

    if (body.currentSessionId !== undefined) {
      await getPool().execute('UPDATE user_preferences SET current_session_id = ? WHERE user_id = ?', [
        body.currentSessionId,
        user.id,
      ]);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}
