import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireCurrentUser } from '@/lib/auth';
import { listFlowJobs, saveFlowJob } from '@/lib/flowJobs';

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const jobs = await listFlowJobs(user.id);
    return NextResponse.json({ jobs });
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json().catch(() => ({}));
    const prompt = String(body.prompt || '').trim();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const id = randomUUID();
    await saveFlowJob(user.id, {
      id,
      title: String(body.title || prompt.slice(0, 80) || 'Flow chart'),
      prompt,
      status: 'setup',
      progress: { completed: 0, total: 3, percent: 0, step: 'Created' },
      content: null,
      error: null,
    });

    return NextResponse.json({ job: { id } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}
