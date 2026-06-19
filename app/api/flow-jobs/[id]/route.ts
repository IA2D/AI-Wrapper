import { NextRequest, NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { deleteFlowJob, getFlowJob, updateFlowJob } from '@/lib/flowJobs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const job = await getFlowJob(user.id, id);
    if (!job) return NextResponse.json({ error: 'Flow chart job not found' }, { status: 404 });
    return NextResponse.json({ job });
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const job = await updateFlowJob(user.id, id, body);
    if (!job) return NextResponse.json({ error: 'Flow chart job not found' }, { status: 404 });
    return NextResponse.json({ job });
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}

export async function DELETE(
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

    await deleteFlowJob(user.id, id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}
