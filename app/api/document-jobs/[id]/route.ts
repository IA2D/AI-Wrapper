import { NextRequest, NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { deleteDocumentJob, getDocumentJob, updateDocumentJob } from '@/lib/documentJobs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const job = await getDocumentJob(user.id, id);

    if (!job) {
      return NextResponse.json({ error: 'Document job not found' }, { status: 404 });
    }

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
    const updates = await request.json().catch(() => ({}));
    const job = await updateDocumentJob(user.id, id, updates);

    if (!job) {
      return NextResponse.json({ error: 'Document job not found' }, { status: 404 });
    }

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
    const job = await getDocumentJob(user.id, id);

    if (!job) {
      return NextResponse.json({ error: 'Document job not found' }, { status: 404 });
    }

    await deleteDocumentJob(user.id, id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}
