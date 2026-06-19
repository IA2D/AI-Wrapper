import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateApiKey,
  checkApiKeyAllowance,
  detectCapability,
  estimateTokensFromMessages,
  estimateTokensFromText,
  extractTextFromProviderResponse,
  meterOpenAIStream,
  parseProviderUsage,
  recordUsage,
  touchApiKey,
} from '@/lib/usage';
import { resolveAIModel, touchAIModel } from '@/lib/aiModels';
import type { ResolvedAIModelConfig } from '@/lib/aiModels';

const IS_DEV = process.env.NODE_ENV !== 'production';

function bearerToken(request: NextRequest) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function splitSystemMessages(messages: Array<{ role?: string; content?: unknown }>) {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => typeof message.content === 'string' ? message.content : '')
    .filter(Boolean)
    .join('\n\n');
  const rest = messages.filter((message) => message.role !== 'system');
  return { system, messages: rest };
}

async function callProvider({
  provider,
  payload,
  signal,
}: {
  provider: ResolvedAIModelConfig;
  payload: Record<string, any>;
  signal: AbortSignal;
}) {
  if (provider.provider === 'anthropic') {
    if (payload.stream) {
      throw new Error('Streaming Claude responses are not enabled yet. Use stream=false for this model.');
    }

    const { system, messages } = splitSystemMessages(payload.messages || []);
    const upstream = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal,
      body: JSON.stringify({
        model: provider.model,
        messages,
        ...(system ? { system } : {}),
        max_tokens: Number(payload.max_tokens || payload.max_completion_tokens || 4096),
        temperature: payload.temperature,
        top_p: payload.top_p,
      }),
    });

    if (!upstream.ok) return upstream;

    const data = await upstream.json();
    const text = Array.isArray(data.content)
      ? data.content.map((part: any) => part?.text || '').join('')
      : '';

    return NextResponse.json({
      id: data.id,
      model: data.model || provider.model,
      choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: data.stop_reason || null }],
      usage: {
        prompt_tokens: data.usage?.input_tokens || 0,
        completion_tokens: data.usage?.output_tokens || 0,
        total_tokens: Number(data.usage?.input_tokens || 0) + Number(data.usage?.output_tokens || 0),
      },
      provider: 'anthropic',
    });
  }

  return fetch(provider.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`,
    },
    signal,
    body: JSON.stringify(payload),
  });
}

export async function POST(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Bearer API key required' }, { status: 401 });
  }

  const apiKey = await authenticateApiKey(token);
  if (!apiKey) {
    return NextResponse.json({ error: 'Invalid or disabled API key' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const messages = Array.isArray(body.messages) ? body.messages : [];

    if (messages.length === 0) {
      return NextResponse.json({ error: 'messages must be a non-empty array' }, { status: 400 });
    }

    const provider = await resolveAIModel(body.model).catch((error) => {
      throw Object.assign(error instanceof Error ? error : new Error(String(error)), { statusCode: 403 });
    });

    const capability = detectCapability(messages);
    if (
      (capability === 'image' && !provider.supportsImage) ||
      (capability === 'voice' && !provider.supportsVoice) ||
      (capability === 'text' && !provider.supportsText)
    ) {
      return NextResponse.json(
        { error: `${capability} usage is disabled for model "${provider.label}"` },
        { status: 403 }
      );
    }

    const estimatedInputTokens = estimateTokensFromMessages(messages);
    const allowance = await checkApiKeyAllowance(apiKey, capability, estimatedInputTokens);

    if (!allowance.allowed) {
      return NextResponse.json(
        { error: allowance.error, usage: allowance.usage },
        { status: allowance.status || 429 }
      );
    }

    const upstreamPayload = {
      ...body,
      model: provider.model,
      stream: body.stream ?? false,
    };

    const upstream = await callProvider({ provider, payload: upstreamPayload, signal: request.signal });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      return NextResponse.json(
        {
          error: `Provider request failed: ${upstream.status} ${upstream.statusText}`,
          ...(IS_DEV ? { debug: errorText } : {}),
        },
        { status: 502 }
      );
    }

    await touchApiKey(apiKey.id);
    await touchAIModel(provider.id);

    if (upstreamPayload.stream) {
      const meteredStream = meterOpenAIStream(upstream.body, async (outputText) => {
        await recordUsage({
          userId: apiKey.assignedUserId,
          apiKeyId: apiKey.id,
          source: 'api',
          capability,
          inputTokens: estimatedInputTokens,
          outputTokens: estimateTokensFromText(outputText),
          model: upstreamPayload.model,
          modelConfigId: provider.id === 'env-default' ? null : provider.id,
          metadata: { provider: provider.provider, modelConfigId: provider.id },
        }).catch((error) => console.error('[Public API] Failed to record streaming usage:', error));
      });

      return new Response(meteredStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    const data = await upstream.json();
    const outputText = extractTextFromProviderResponse(data);
    const usage = parseProviderUsage(data, estimatedInputTokens, outputText);

    await recordUsage({
      apiKeyId: apiKey.id,
      userId: apiKey.assignedUserId,
      source: 'api',
      capability,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      model: upstreamPayload.model,
      modelConfigId: provider.id === 'env-default' ? null : provider.id,
      metadata: { provider: provider.provider, modelConfigId: provider.id },
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Public API] Request failed:', error);
    return NextResponse.json(
      {
        error: typeof (error as { statusCode?: unknown }).statusCode === 'number' && error instanceof Error
          ? error.message
          : 'Failed to process API request',
        ...(IS_DEV
          ? { debug: error instanceof Error ? error.message : String(error) }
          : {}),
      },
      { status: typeof (error as { statusCode?: unknown }).statusCode === 'number' ? (error as { statusCode: number }).statusCode : 500 }
    );
  }
}
