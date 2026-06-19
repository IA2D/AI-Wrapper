import { NextRequest, NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { getFlowJob, updateFlowJob } from '@/lib/flowJobs';
import { startFlowGeneration } from '@/lib/flowGeneration';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const job = await getFlowJob(user.id, id);

    if (!job) {
      return NextResponse.json({ error: 'Flow chart job not found' }, { status: 404 });
    }

    await updateFlowJob(user.id, id, {
      status: 'generating',
      progress: { completed: 0, total: 4, percent: 5, step: 'Queued' },
      error: null,
    });
    await startFlowGeneration(user.id, id);
    return NextResponse.json({ success: true, jobId: id, status: 'generating' }, { status: 202 });
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}
