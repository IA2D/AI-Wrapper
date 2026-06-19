import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth';
import { AIProvider, createAIModel, listAIModels, providerDefault } from '@/lib/aiModels';

const providers = new Set(['openai', 'anthropic', 'gemini', 'perplexity', 'openai-compatible']);

function parseProvider(value: unknown): AIProvider {
  const provider = String(value || 'openai-compatible');
  return providers.has(provider) ? provider as AIProvider : 'openai-compatible';
}

export async function GET() {
  try {
    await requireAdminUser();
    return NextResponse.json({ models: await listAIModels() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Admin access required' },
      { status: 403 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminUser();
    const body = await request.json().catch(() => ({}));
    const provider = parseProvider(body.provider);
    const defaults = providerDefault(provider);
    const label = String(body.label || '').trim();
    const model = String(body.model || defaults.model).trim();
    const endpoint = String(body.endpoint || defaults.endpoint).trim();
    const apiKey = String(body.apiKey || '').trim();

    if (!label) return NextResponse.json({ error: 'Model label is required' }, { status: 400 });
    if (!model) return NextResponse.json({ error: 'Model id is required' }, { status: 400 });
    if (!endpoint) return NextResponse.json({ error: 'Endpoint is required' }, { status: 400 });
    if (!apiKey) return NextResponse.json({ error: 'API token is required' }, { status: 400 });

    const created = await createAIModel({
      label,
      provider,
      model,
      endpoint,
      apiKey,
      status: body.status === 'disabled' ? 'disabled' : 'active',
      isDefault: Boolean(body.isDefault),
      supportsText: body.supportsText !== false,
      supportsImage: Boolean(body.supportsImage),
      supportsVoice: Boolean(body.supportsVoice),
      supportsJson: body.supportsJson !== false,
    });

    return NextResponse.json({ model: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to create model' },
      { status: 403 }
    );
  }
}
