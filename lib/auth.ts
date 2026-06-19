import { cookies } from 'next/headers';
import { randomBytes, randomUUID, pbkdf2Sync, timingSafeEqual, createHash } from 'crypto';
import { RowDataPacket } from 'mysql2';
import { ensureDatabaseSchema, getPool } from './db';

const SESSION_COOKIE = 'chatbot69_session';
const SESSION_DAYS = 30;

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
}

interface UserRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  password_hash: string;
  password_salt: string;
}

interface SessionUserRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
}

export function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const hash = pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, salt: string, expectedHash: string) {
  const { hash } = hashPassword(password, salt);
  const actual = Buffer.from(hash, 'hex');
  const expected = Buffer.from(expectedHash, 'hex');

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function getExpiryDate() {
  const date = new Date();
  date.setDate(date.getDate() + SESSION_DAYS);
  return date;
}

export async function createUserSession(userId: string) {
  await ensureDatabaseSchema();

  const token = randomBytes(32).toString('hex');
  const sessionId = randomUUID();
  const expiresAt = getExpiryDate();

  await getPool().execute(
    'INSERT INTO auth_sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    [sessionId, userId, hashToken(token), expiresAt]
  );

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export async function clearUserSession() {
  await ensureDatabaseSchema();

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await getPool().execute('DELETE FROM auth_sessions WHERE token_hash = ?', [hashToken(token)]);
  }

  cookieStore.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0),
  });
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  await ensureDatabaseSchema();

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [rows] = await getPool().execute<SessionUserRow[]>(
    `SELECT users.id, users.name, users.email, users.role
     FROM auth_sessions
     INNER JOIN users ON users.id = auth_sessions.user_id
     WHERE auth_sessions.token_hash = ? AND auth_sessions.expires_at > NOW()
     LIMIT 1`,
    [hashToken(token)]
  );

  return rows[0]
    ? {
        id: rows[0].id,
        name: rows[0].name,
        email: rows[0].email,
        role: rows[0].role === 'admin' ? 'admin' : 'user',
      }
    : null;
}

export async function requireCurrentUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Authentication required');
  }

  return user;
}

export async function requireAdminUser(): Promise<AuthUser> {
  const user = await requireCurrentUser();
  if (user.role !== 'admin') {
    throw new Error('Admin access required');
  }

  return user;
}

export async function findUserByEmail(email: string) {
  await ensureDatabaseSchema();

  const [rows] = await getPool().execute<UserRow[]>(
    'SELECT id, name, email, role, password_hash, password_salt FROM users WHERE email = ? LIMIT 1',
    [email.toLowerCase()]
  );

  return rows[0] || null;
}
