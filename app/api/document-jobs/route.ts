import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireCurrentUser } from '@/lib/auth';
import { listDocumentJobs, saveDocumentJob } from '@/lib/documentJobs';
import { DocumentCreationJob } from '@/types';

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const jobs = await listDocumentJobs(user.id);
    return NextResponse.json({ jobs });
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const body = (await request.json().catch(() => ({}))) as Partial<DocumentCreationJob>;
    const id = body.id || randomUUID();
    const title = String(body.title || 'Untitled document job').trim();
    const prompt = String(body.prompt || '').trim();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    await saveDocumentJob({
      id,
      userId: user.id,
      title,
      prompt,
      status: body.status || 'setup',
      pageCount: body.pageCount || 1,
      pageRange: body.pageRange,
      documentKind: body.documentKind || 'document',
      exportFormat: body.exportFormat || 'pdf',
      templateId: body.templateId || 'executive',
      includeTables: body.includeTables ?? true,
      includeCharts: body.includeCharts ?? false,
      enableSearch: body.enableSearch ?? false,
      outline: body.outline || null,
      content: body.content || null,
      progress: body.progress || { completed: 0, total: 0, percent: 0 },
      error: body.error || null,
    });

    return NextResponse.json({ job: { id } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}
