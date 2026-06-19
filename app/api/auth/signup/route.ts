import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createUserSession, findUserByEmail, hashPassword } from '@/lib/auth';
import { ensureDatabaseSchema, getPool } from '@/lib/db';

export async function POST(request: NextRequest) {
  await ensureDatabaseSchema();

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!name || !email || password.length < 8) {
    return NextResponse.json(
      { error: 'Name, valid email, and password of at least 8 characters are required' },
      { status: 400 }
    );
  }

  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    return NextResponse.json({ error: 'An account already exists for this email' }, { status: 409 });
  }

  const id = randomUUID();
  const { hash, salt } = hashPassword(password);

  await getPool().execute(
    'INSERT INTO users (id, name, email, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)',
    [id, name, email, hash, salt]
  );
  await getPool().execute('INSERT INTO user_preferences (user_id) VALUES (?)', [id]);

  await createUserSession(id);

  return NextResponse.json({ user: { id, name, email, role: 'user' } }, { status: 201 });
}
