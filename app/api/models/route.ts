import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { listActiveAIModels } from '@/lib/aiModels';

export async function GET() {
  try {
    await requireCurrentUser();
    const models = await listActiveAIModels();
    return NextResponse.json({
      models: models.map((model) => ({
        id: model.id,
        label: model.label,
        provider: model.provider,
        model: model.model,
        isDefault: model.isDefault,
        supportsText: model.supportsText,
        supportsImage: model.supportsImage,
        supportsVoice: model.supportsVoice,
      })),
      adaptiveAvailable: models.length > 1,
    });
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}
