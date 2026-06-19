import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { listUserApiKeys } from '@/lib/usage';

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const apiKeys = await listUserApiKeys(user.id);
    return NextResponse.json({ apiKeys });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Authentication required' },
      { status: 401 }
    );
  }
}
