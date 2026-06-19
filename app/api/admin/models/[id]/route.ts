import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth';
import { AIProvider, deleteAIModel, updateAIModel } from '@/lib/aiModels';

const providers = new Set(['openai', 'anthropic', 'gemini', 'perplexity', 'openai-compatible']);

function parseProvider(value: unknown): AIProvider | undefined {
  if (value === undefined) return undefined;
  const provider = String(value);
  return providers.has(provider) ? provider as AIProvider : undefined;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminUser();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const provider = parseProvider(body.provider);
    const updated = await updateAIModel(id, {
      ...(body.label !== undefined ? { label: String(body.label).trim() } : {}),
      ...(provider ? { provider } : {}),
      ...(body.model !== undefined ? { model: String(body.model).trim() } : {}),
      ...(body.endpoint !== undefined ? { endpoint: String(body.endpoint).trim() } : {}),
      ...(body.apiKey ? { apiKey: String(body.apiKey).trim() } : {}),
      ...(body.status === 'active' || body.status === 'disabled' ? { status: body.status } : {}),
      ...(body.isDefault !== undefined ? { isDefault: Boolean(body.isDefault) } : {}),
      ...(body.supportsText !== undefined ? { supportsText: Boolean(body.supportsText) } : {}),
      ...(body.supportsImage !== undefined ? { supportsImage: Boolean(body.supportsImage) } : {}),
      ...(body.supportsVoice !== undefined ? { supportsVoice: Boolean(body.supportsVoice) } : {}),
      ...(body.supportsJson !== undefined ? { supportsJson: Boolean(body.supportsJson) } : {}),
    });

    if (!updated) return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    return NextResponse.json({ model: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update model' },
      { status: 403 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminUser();
    const { id } = await params;
    const deleted = await deleteAIModel(id);
    if (!deleted) return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to delete model' },
      { status: 403 }
    );
  }
}
