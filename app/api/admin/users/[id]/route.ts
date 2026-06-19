import { NextRequest, NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import { requireAdminUser, hashPassword } from '@/lib/auth';
import { ensureDatabaseSchema, getPool } from '@/lib/db';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdminUser();
    await ensureDatabaseSchema();

    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const role = id === admin.id ? 'admin' : body.role === 'admin' ? 'admin' : 'user';
    const password = String(body.password || '');

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    const [conflicts] = await getPool().execute<Array<RowDataPacket & { id: string }>>(
      'SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1',
      [email, id]
    );

    if (conflicts[0]) {
      return NextResponse.json({ error: 'Another account already uses this email' }, { status: 409 });
    }

    if (password) {
      if (password.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
      }
      const { hash, salt } = hashPassword(password);
      await getPool().execute(
        'UPDATE users SET name = ?, email = ?, role = ?, password_hash = ?, password_salt = ? WHERE id = ?',
        [name, email, role, hash, salt, id]
      );
    } else {
      await getPool().execute(
        'UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?',
        [name, email, role, id]
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Admin access required' },
      { status: 403 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdminUser();
    await ensureDatabaseSchema();

    const { id } = await context.params;
    if (id === admin.id) {
      return NextResponse.json({ error: 'You cannot delete your own admin account' }, { status: 400 });
    }

    await getPool().execute('UPDATE api_keys SET assigned_user_id = NULL WHERE assigned_user_id = ?', [id]);
    await getPool().execute('DELETE FROM users WHERE id = ?', [id]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Admin access required' },
      { status: 403 }
    );
  }
}
