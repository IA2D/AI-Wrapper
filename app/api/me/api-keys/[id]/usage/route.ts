import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { getApiKeyUsage } from '@/lib/usage';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const usage = await getApiKeyUsage(id, user.id);

    if (!usage) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    return NextResponse.json({ usage });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Authentication required' },
      { status: 401 }
    );
  }
}
