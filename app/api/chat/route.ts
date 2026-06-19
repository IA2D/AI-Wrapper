import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { requireCurrentUser } from '@/lib/auth';
import { getUserMemoryContext } from '@/lib/userMemories';
import { formatSearchContext, getSearchPlanForChat, searchForContext } from '@/lib/braveSearch';
import {
  detectCapability,
  estimateTokensFromMessages,
  estimateTokensFromText,
  extractTextFromProviderResponse,
  meterOpenAIStream,
  parseProviderUsage,
  recordUsage,
} from '@/lib/usage';
import {
  checkModelUserAllowance,
  listActiveAIModels,
  resolveAIModel,
  touchAIModel,
} from '@/lib/aiModels';
import type { AIModelConfig, ResolvedAIModelConfig } from '@/lib/aiModels';
import type { SearchSource } from '@/types';

// Message type from client
interface ClientMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | {
    text: string;
    images?: Array<{ url: string; mimeType?: string; name?: string }>;
    audio?: Array<{ url: string; mimeType?: string; durationSeconds?: number }>;
  };
}

type AudioContentPart =
  | { type: 'audio'; audio: string }
  | { type: 'audio_url'; audio_url: { url: string } }
  | { type: 'input_audio'; input_audio: { data: string; format: string } };

type ModelContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | AudioContentPart;

// Message type for Qwen API
interface QwenMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ModelContentPart[];
}

/**
 * Downloads an image from URL and converts it to base64 data URL
 * Handles both local uploads and external URLs
 */
function getMimeTypeFromFilename(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
  };

  return mimeTypes[extension || ''] || 'image/jpeg';
}

function getUploadedImageFilename(imageUrl: string): string | null {
  if (!imageUrl) return null;

  try {
    const url = imageUrl.startsWith('http://') || imageUrl.startsWith('https://')
      ? new URL(imageUrl)
      : new URL(imageUrl, 'http://local');
    const path = decodeURIComponent(url.pathname);

    if (path.startsWith('/api/uploads/') || path.startsWith('/uploads/')) {
      const filename = path.split('/').pop() || '';
      if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return null;
      }

      return filename;
    }

    return null;
  } catch {
    return null;
  }
}

async function readUploadedImageAsDataUrl(filename: string): Promise<string> {
  const filepath = join(process.cwd(), 'public', 'uploads', filename);
  const fileBuffer = await readFile(filepath);
  const base64 = fileBuffer.toString('base64');
  return `data:${getMimeTypeFromFilename(filename)};base64,${base64}`;
}

async function downloadAndConvertImage(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('data:image/')) {
    return imageUrl;
  }

  const uploadedFilename = getUploadedImageFilename(imageUrl);
  if (uploadedFilename) {
    return readUploadedImageAsDataUrl(uploadedFilename);
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const base64 = buffer.toString('base64');
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error('Error downloading/converting image:', error);
    // Return original URL as fallback
    return imageUrl;
  }
}

async function transformMessages(messages: ClientMessage[]): Promise<QwenMessage[]> {
  const transformedMessages: QwenMessage[] = [];
  
  for (const msg of messages) {
    const text = typeof msg.content === 'string' ? msg.content : msg.content?.text || '';
    const images = typeof msg.content === 'string' ? [] : msg.content?.images || [];
    const audioItems = typeof msg.content === 'string' ? [] : msg.content?.audio || [];
    const hasImages = images.length > 0;
    const hasAudio = audioItems.length > 0;

    // Handle text-only messages
    if (!hasImages && !hasAudio) {
      transformedMessages.push({
        role: msg.role,
        content: text,
      });
      continue;
    }

    // Handle messages with images
    const contentParts: ModelContentPart[] = [];

    if (text.trim() && !hasAudio) {
      contentParts.push({
        type: 'text',
        text,
      });
    }

    // Download and convert images to base64
    for (const image of images) {
      const base64Url = await downloadAndConvertImage(image.url);
      contentParts.push({
        type: 'image_url',
        image_url: {
          url: base64Url,
        },
      });
    }

    for (const audio of audioItems) {
      contentParts.push(buildAudioContentPart(audio.url, audio.mimeType));
    }

    if (text.trim() && hasAudio) {
      contentParts.push({
        type: 'text',
        text,
      });
    }

    if (!text.trim() && hasImages) {
      contentParts.push({
        type: 'text',
        text: hasAudio
          ? 'Please review the attached image and voice message, then respond.'
          : 'Please review the attached image and respond.',
      });
    } else if (!text.trim() && hasAudio) {
      contentParts.push({
        type: 'text',
        text: 'Please listen to this voice message and respond to it.',
      });
    }

    transformedMessages.push({
      role: msg.role,
      content: contentParts,
    });
  }
  
  return transformedMessages;
}

function parseAudioDataUrl(url: string, fallbackMimeType = 'audio/wav') {
  const match = url.match(/^data:([^;,]+)(?:;[^,]*)?,(.+)$/);
  const mimeType = match?.[1] || fallbackMimeType;
  const data = match?.[2] || url;
  const format = mimeType.includes('mp4')
    ? 'mp4'
    : mimeType.includes('mpeg') || mimeType.includes('mp3')
      ? 'mp3'
      : mimeType.includes('wav') || mimeType.includes('wave')
        ? 'wav'
        : 'webm';

  return { data, format };
}

function audioDataUrl(url: string, fallbackMimeType = 'audio/wav') {
  // If it's already a public URL (not a data URL), use it directly
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  // If it's already a data URL, return as-is
  if (url.startsWith('data:')) return url;
  // Otherwise, convert to data URL (fallback for legacy data)
  const parsed = parseAudioDataUrl(url, fallbackMimeType);
  return `data:audio/${parsed.format};base64,${parsed.data}`;
}

function buildAudioContentPart(url: string, mimeType = 'audio/wav'): AudioContentPart {
  const audioFormat = (process.env.LLM_AUDIO_CONTENT_FORMAT || 'audio_url').toLowerCase();

  // If URL is a public http/https URL, use it directly
  const isPublicUrl = url.startsWith('http://') || url.startsWith('https://');

  if (['gemma', 'hf', 'huggingface', 'audio'].includes(audioFormat)) {
    return {
      type: 'audio',
      audio: isPublicUrl ? url : audioDataUrl(url, mimeType),
    };
  }

  if (['audio_url', 'openai_audio_url'].includes(audioFormat)) {
    return {
      type: 'audio_url',
      audio_url: { url: isPublicUrl ? url : audioDataUrl(url, mimeType) },
    };
  }

  return {
    type: 'input_audio',
    input_audio: isPublicUrl
      ? { data: url, format: mimeType.split('/')[1] || 'wav' }
      : parseAudioDataUrl(url, mimeType),
  };
}

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://localhost:8001';
const IS_DEV = process.env.NODE_ENV !== 'production';

function isLocalModel(model: Pick<AIModelConfig, 'provider' | 'label' | 'model'>) {
  return model.provider === 'openai-compatible' || /gemma|local/i.test(`${model.label} ${model.model}`);
}

async function resolveChatModel({
  requestedModel,
  userId,
  estimatedInputTokens,
  isLongRequest,
}: {
  requestedModel?: string | null;
  userId: string;
  estimatedInputTokens: number;
  isLongRequest: boolean;
}): Promise<ResolvedAIModelConfig> {
  const requested = requestedModel?.trim();
  const explicitModel = requested && requested !== 'default' ? requested : undefined;

  if (explicitModel === 'adaptive') {
    const active = await listActiveAIModels();
    if (active.length <= 1) {
      return resolveAIModel(active[0]?.id);
    }

    const local = active.find(isLocalModel);
    const external = active.find((model) => !isLocalModel(model) && model.isDefault)
      || active.find((model) => !isLocalModel(model));
    const chosen = isLongRequest ? (external || local || active[0]) : (local || active.find((model) => model.isDefault) || active[0]);
    const resolved = await resolveAIModel(chosen.id);
    const allowance = await checkModelUserAllowance(userId, resolved.id, estimatedInputTokens);
    if (!allowance.allowed) {
      throw Object.assign(new Error(allowance.error || `Usage limit reached for ${resolved.label}`), { statusCode: allowance.status || 429 });
    }
    return resolved;
  }

  const resolved = await resolveAIModel(explicitModel);
  const allowance = await checkModelUserAllowance(userId, resolved.id, estimatedInputTokens);
  if (!allowance.allowed) {
    throw Object.assign(new Error(allowance.error || `Usage limit reached for ${resolved.label}`), { statusCode: allowance.status || 429 });
  }
  return resolved;
}

function prependModelInfoStream(
  body: ReadableStream<Uint8Array> | null,
  info: { model: string; modelLabel: string; modelConfigId: string; provider: string; mode: string }
) {
  if (!body) return body;
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'model_info', ...info })}\n\n`));
      const reader = body.getReader();

      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      };

      void pump();
    },
  });
}

function safeUrlSummary(value: string | undefined) {
  if (!value) return 'missing';
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return 'invalid-url';
  }
}

function truncateLogText(value: string, maxLength = 4000) {
  return value.length > maxLength
    ? `${value.slice(0, maxLength)}... [truncated ${value.length - maxLength} chars]`
    : value;
}

function summarizeModelMessages(messages: QwenMessage[]) {
  return messages.map((message) => {
    if (typeof message.content === 'string') {
      return {
        role: message.role,
        format: 'text',
        chars: message.content.length,
      };
    }

    return {
      role: message.role,
      format: 'parts',
      parts: message.content.map((part) => part.type),
      textChars: message.content.reduce((total, part) => total + (part.type === 'text' ? part.text.length : 0), 0),
      imageCount: message.content.filter((part) => part.type === 'image_url').length,
      audioCount: message.content.filter((part) => part.type !== 'text' && part.type !== 'image_url').length,
      payloadChars: JSON.stringify(message.content).length,
    };
  });
}

function logStreamProgress(body: ReadableStream<Uint8Array> | null | undefined, label: string, traceId: string) {
  if (!body) return body;

  let chunkCount = 0;
  let byteCount = 0;
  const startedAt = Date.now();

  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      chunkCount += 1;
      byteCount += chunk.byteLength;

      if (chunkCount === 1) {
        console.log(`[${label}] First stream chunk`, {
          traceId,
          elapsedMs: Date.now() - startedAt,
          bytes: chunk.byteLength,
        });
      }

      if (chunkCount % 50 === 0) {
        console.log(`[${label}] Stream progress`, {
          traceId,
          chunks: chunkCount,
          bytes: byteCount,
          elapsedMs: Date.now() - startedAt,
        });
      }

      controller.enqueue(chunk);
    },
    flush() {
      console.log(`[${label}] Stream completed`, {
        traceId,
        chunks: chunkCount,
        bytes: byteCount,
        elapsedMs: Date.now() - startedAt,
      });
    },
  }));
}

function getMessageText(message: any): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  return message.content?.text || '';
}

function messageHasImages(message: any): boolean {
  return Array.isArray(message?.content?.images) && message.content.images.length > 0;
}

function messageHasAudio(message: any): boolean {
  return Array.isArray(message?.content?.audio) && message.content.audio.length > 0;
}

function conversationHasAudio(messages: any[]): boolean {
  return messages.some(messageHasAudio);
}

function toRAGHistory(messages: any[]) {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role,
      content: getMessageText(message),
    }))
    .filter((message) => message.content.trim().length > 0);
}

function withMemoryMessages(messages: ClientMessage[], memoryContext: string): ClientMessage[] {
  if (!memoryContext) return messages;

  return [
    {
      role: 'system',
      content: `Known user memory for personalization. Use only when relevant and do not reveal this list unless the user asks about memory.\n${memoryContext}`,
    },
    ...messages,
  ];
}

function getChatCapabilityContext() {
  return [
    'Interface capability context:',
    '- This chat can render flow diagrams when you return a Mermaid flowchart code block.',
    '- When the user asks for a flow, workflow, process map, decision tree, algorithm steps, architecture path, or diagram, offer to create one and output Mermaid using a fenced code block with language mermaid.',
    '- Use Mermaid flowchart syntax such as: ```mermaid\\nflowchart TD\\n  A[Start] --> B{Decision?}\\n  B -- Yes --> C[Action]\\n  B -- No --> D[Alternative]\\n```',
    '- Keep diagram node labels concise. Use the user language for labels when clear, including Arabic labels for Arabic prompts.',
    '- After the diagram, add a short explanation only if it helps. The UI can display and export the diagram.',
  ].join('\n');
}

function withCapabilityMessages(messages: ClientMessage[]): ClientMessage[] {
  return [
    {
      role: 'system',
      content: getChatCapabilityContext(),
    },
    ...messages,
  ];
}

function getRuntimeContext() {
  const now = new Date();
  const locale = process.env.APP_LOCALE || 'en-US';
  let timeZone = process.env.APP_TIME_ZONE || process.env.TZ || 'Africa/Cairo';
  try {
    new Intl.DateTimeFormat(locale, { timeZone }).format(now);
  } catch {
    timeZone = 'UTC';
  }
  const timeZoneName = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(now).find((part) => part.type === 'timeZoneName')?.value || 'GMT+00:00';
  const localIsoLike = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now).replace(' ', 'T');

  return [
    'Runtime timestamp context for this model request:',
    `- Current UTC ISO timestamp: ${now.toISOString()}`,
    `- User timezone: ${timeZone} (${timeZoneName})`,
    `- User locale: ${locale}`,
    `- User local timestamp: ${localIsoLike} ${timeZoneName}`,
    `- User local date/time: ${new Intl.DateTimeFormat(locale, {
      dateStyle: 'full',
      timeStyle: 'long',
      timeZone,
    }).format(now)}`,
    '- Use the UTC timestamp plus the explicit IANA timezone/offset above to convert dates and times for the user.',
    '- If the user asks for today, the date, current time, or recent/current facts, use this runtime context and/or Brave Search context directly.',
    '- Do not say you lack real-time access when runtime context or Brave Search context has been provided.',
  ].join('\n');
}

function withRuntimeMessages(messages: ClientMessage[], runtimeContext: string): ClientMessage[] {
  return [
    {
      role: 'system',
      content: runtimeContext,
    },
    ...messages,
  ];
}

function withSearchMessages(messages: ClientMessage[], searchContext: string): ClientMessage[] {
  if (!searchContext) return messages;

  return [
    {
      role: 'system',
      content: `Fresh web search context from Brave Search API is available below. Use it when relevant, cite source numbers naturally for current claims, and do not claim you cannot access current information when these sources answer the request.\n${searchContext}`,
    },
    ...messages,
  ];
}

function prependSearchSourcesStream(body: ReadableStream<Uint8Array> | null, sources: SearchSource[]) {
  if (!body || sources.length === 0) return body;

  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'search_sources', sources })}\n\n`));
      const reader = body.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });
}

function getResponsesEndpoint(chatCompletionsEndpoint: string): string {
  if (chatCompletionsEndpoint.endsWith('/v1/chat/completions')) {
    return chatCompletionsEndpoint.replace(/\/v1\/chat\/completions$/, '/v1/responses');
  }

  return chatCompletionsEndpoint.replace(/\/chat\/completions$/, '/responses');
}

function supportsChatTemplateKwargs(provider: AIModelConfig['provider']) {
  return provider === 'openai-compatible';
}

function withChatTemplateKwargs<T extends Record<string, unknown>>(
  payload: T,
  provider: AIModelConfig['provider'],
  thinkingMode: boolean
) {
  if (!supportsChatTemplateKwargs(provider)) {
    return payload;
  }

  return {
    ...payload,
    chat_template_kwargs: {
      enable_thinking: thinkingMode,
    },
  };
}

function toResponsesInput(messages: QwenMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: typeof message.content === 'string'
      ? message.content
      : message.content.map((part) => {
          if (part.type === 'text') {
            return { type: 'input_text', text: part.text };
          }

          if (part.type === 'input_audio') {
            return { type: 'input_audio', input_audio: part.input_audio };
          }

          if (part.type === 'audio') {
            return { type: 'input_audio', input_audio: parseAudioDataUrl(part.audio) };
          }

          if (part.type === 'audio_url') {
            return { type: 'input_audio', input_audio: parseAudioDataUrl(part.audio_url.url) };
          }

          return { type: 'input_image', image_url: part.image_url.url };
        }),
  }));
}

async function cancelResponse(endpoint: string, responseId: string, apiKey: string) {
  try {
    const cancelEndpoint = `${endpoint}/${responseId}/cancel`;
    const response = await fetch(cancelEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    console.log('[Responses API] Cancel requested:', {
      responseId,
      status: response.status,
      statusText: response.statusText,
    });
  } catch (error) {
    console.error('[Responses API] Cancel request failed:', { responseId, error });
  }
}

function streamResponsesAsChatCompletions({
  upstream,
  responsesEndpoint,
  apiKey,
  clientSignal,
  traceId,
}: {
  upstream: Response;
  responsesEndpoint: string;
  apiKey: string;
  clientSignal: AbortSignal;
  traceId?: string;
}) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let responseId: string | null = null;
  let cancelled = false;
  let providerEventCount = 0;
  let emittedEventCount = 0;
  const startedAt = Date.now();

  const cancelIfPossible = () => {
    if (responseId && !cancelled) {
      cancelled = true;
      void cancelResponse(responsesEndpoint, responseId, apiKey);
    }
  };

  clientSignal.addEventListener('abort', cancelIfPossible, { once: true });

  return new ReadableStream({
    async start(controller) {
      const reader = upstream.body?.getReader();

      if (!reader) {
        controller.error(new Error('Responses API stream is not readable'));
        return;
      }

      let buffer = '';

      try {
        while (true) {
          if (clientSignal.aborted) {
            cancelIfPossible();
            break;
          }

          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';

          for (const rawEvent of events) {
            const dataLines = rawEvent
              .split('\n')
              .filter((line) => line.startsWith('data: '))
              .map((line) => line.slice(6));

            if (dataLines.length === 0) continue;

            const data = dataLines.join('\n');
            if (data === '[DONE]') continue;

            let parsed: any;
            try {
              parsed = JSON.parse(data);
            } catch {
              continue;
            }

            providerEventCount += 1;
            if (traceId && providerEventCount === 1) {
              console.log('[Responses API Stream] First provider event', {
                traceId,
                eventType: parsed.type || null,
                elapsedMs: Date.now() - startedAt,
              });
            }

            responseId = parsed.response?.id || parsed.id || responseId;

            if (parsed.error) {
              const payload = JSON.stringify({ error: parsed.error });
              controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
              continue;
            }

            const eventType = String(parsed.type || '');
            const genericDelta = typeof parsed.delta === 'string' ? parsed.delta : '';
            const genericDeltaIsReasoning = /reasoning|thinking/i.test(eventType);
            const delta =
              (genericDelta && !genericDeltaIsReasoning ? genericDelta : '') ||
              parsed.choices?.[0]?.delta?.content ||
              parsed.choices?.[0]?.message?.content ||
              parsed.output_text_delta ||
              parsed.response?.output_text?.delta ||
              '';
            const reasoningDelta =
              (genericDelta && genericDeltaIsReasoning ? genericDelta : '') ||
              parsed.choices?.[0]?.delta?.reasoning_content ||
              parsed.choices?.[0]?.delta?.reasoning ||
              parsed.reasoning_delta ||
              parsed.reasoning_content_delta ||
              parsed.reasoning_content ||
              parsed.reasoning_summary_text_delta ||
              parsed.summary_text_delta ||
              parsed.response?.reasoning?.delta ||
              parsed.response?.reasoning_summary?.delta ||
              '';

            if ((typeof delta === 'string' && delta) || (typeof reasoningDelta === 'string' && reasoningDelta)) {
              emittedEventCount += 1;
              const payload = JSON.stringify({
                choices: [{
                  delta: {
                    ...(typeof delta === 'string' && delta ? { content: delta } : {}),
                    ...(typeof reasoningDelta === 'string' && reasoningDelta ? { reasoning_content: reasoningDelta } : {}),
                  },
                }],
              });
              controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
            }
          }
        }

        if (traceId) {
          console.log('[Responses API Stream] Finished reading provider stream', {
            traceId,
            providerEvents: providerEventCount,
            emittedEvents: emittedEventCount,
            elapsedMs: Date.now() - startedAt,
            responseId,
          });
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        if (clientSignal.aborted) {
          cancelIfPossible();
          controller.close();
          return;
        }

        if (traceId) {
          console.error('[Responses API Stream] Failed while reading provider stream', {
            traceId,
            providerEvents: providerEventCount,
            emittedEvents: emittedEventCount,
            elapsedMs: Date.now() - startedAt,
            error,
          });
        }
        controller.error(error);
      } finally {
        clientSignal.removeEventListener('abort', cancelIfPossible);
        reader.releaseLock();
      }
    },
    cancel() {
      cancelIfPossible();
    },
  });
}

export async function POST(request: NextRequest) {
  const traceId = randomUUID();
  const startedAt = Date.now();
  let user: Awaited<ReturnType<typeof requireCurrentUser>>;
  try {
    user = await requireCurrentUser();
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { messages, thinkingMode, stream, sessionId, modelSelection } = body;
    const requestMessages = Array.isArray(messages) ? messages : [];
    const usageCapability = detectCapability(requestMessages);
    const estimatedInputTokens = estimateTokensFromMessages(requestMessages);
    const lastUserMessage = Array.isArray(messages)
      ? requestMessages.filter((m: any) => m.role === 'user').pop()
      : null;
    const lastUserText = lastUserMessage ? getMessageText(lastUserMessage) : '';
    const selectedProvider = await resolveChatModel({
      requestedModel: modelSelection,
      userId: user.id,
      estimatedInputTokens,
      isLongRequest: estimatedInputTokens > 1200 || lastUserText.length > 1800,
    });
    const model = selectedProvider.model;
    const apiKey = selectedProvider.apiKey;
    const endpoint = selectedProvider.endpoint;
    const selectionMode = modelSelection === 'adaptive' ? 'adaptive' : 'manual';
    const modelInfo = {
      model,
      modelLabel: selectedProvider.label,
      modelConfigId: selectedProvider.id,
      provider: selectedProvider.provider,
      mode: selectionMode,
    };
    const recordWebUsage = async (outputText: string, usage?: { inputTokens: number; outputTokens: number; totalTokens: number }) => {
      await recordUsage({
        userId: user.id,
        modelConfigId: selectedProvider.id === 'env-default' ? null : selectedProvider.id,
        source: 'web',
        capability: usageCapability,
        inputTokens: usage?.inputTokens ?? estimatedInputTokens,
        outputTokens: usage?.outputTokens ?? estimateTokensFromText(outputText),
        totalTokens: usage?.totalTokens,
        model,
        metadata: { sessionId: sessionId || null, stream: Boolean(stream), provider: selectedProvider.provider, modelConfigId: selectedProvider.id },
      }).catch((error) => console.error('[Chat API] Failed to record usage:', error));
    };
    const runtimeContext = getRuntimeContext();
    const memoryContext = await getUserMemoryContext(user.id).catch((error) => {
      console.error('[Chat API] Failed to load user memory:', error);
      return '';
    });
    const searchPlan = getSearchPlanForChat(lastUserText);
    const searchSources = searchPlan.enabled
      ? await searchForContext(lastUserText, searchPlan.options).catch((error) => {
          console.error('[Chat API] Brave search failed:', error);
          return [];
        })
      : [];
    const searchContext = formatSearchContext(searchSources);
    const capabilityContext = getChatCapabilityContext();
    const combinedWebContext = [runtimeContext, capabilityContext, searchContext].filter(Boolean).join('\n\n');
    const modelMessages = withCapabilityMessages(
      withRuntimeMessages(
        withSearchMessages(
          withMemoryMessages(Array.isArray(messages) ? messages : [], memoryContext),
          searchContext
        ),
        runtimeContext
      )
    );
    const hasCurrentImage = messageHasImages(lastUserMessage);
    const hasAudioContext = Array.isArray(messages) && conversationHasAudio(messages);

    console.log('[Chat API] Request received', {
      traceId,
      sessionId,
      stream: Boolean(stream),
      thinkingMode: Boolean(thinkingMode),
      messageCount: requestMessages.length,
      lastUserChars: lastUserText.length,
      hasCurrentImage,
      hasAudioContext,
      model,
      endpoint: safeUrlSummary(endpoint),
      responsesEndpoint: safeUrlSummary(getResponsesEndpoint(endpoint)),
      ragServiceUrl: RAG_SERVICE_URL,
    });

    // RAG supports text/PDF/audio. Current image messages use the direct multimodal model path.
    if (sessionId && !hasCurrentImage && selectedProvider.provider === 'openai-compatible') {
      try {
        if (lastUserMessage) {
          console.log('[Chat API] Calling RAG service', {
            traceId,
            sessionId,
            url: `${RAG_SERVICE_URL}/chat`,
            stream: stream ?? true,
          });
          const ragResponse = await fetch(`${RAG_SERVICE_URL}/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            signal: request.signal,
            body: JSON.stringify({
              message: getMessageText(lastUserMessage) || (messageHasAudio(lastUserMessage) ? 'Voice message' : ''),
              session_id: sessionId,
              history: toRAGHistory(messages),
              memory_context: memoryContext,
              web_context: combinedWebContext,
              audio: lastUserMessage?.content?.audio || [],
              stream: stream ?? true,
              thinking_mode: thinkingMode ?? false,
            }),
          });

          if (ragResponse.ok) {
            console.log('[Chat API] RAG service accepted request', {
              traceId,
              sessionId,
              status: ragResponse.status,
              elapsedMs: Date.now() - startedAt,
            });
            // Return streaming response from RAG service
            if (stream) {
              await touchAIModel(selectedProvider.id);
              const meteredRagBody = prependModelInfoStream(meterOpenAIStream(ragResponse.body, recordWebUsage), modelInfo);
              return new Response(logStreamProgress(prependSearchSourcesStream(meteredRagBody, searchSources), 'Chat API RAG', traceId), {
                headers: {
                  'Content-Type': 'text/event-stream',
                  'Cache-Control': 'no-cache',
                  'Connection': 'keep-alive',
                },
              });
            }
            // Non-streaming from RAG
            const data = await ragResponse.json();
            const outputText = extractTextFromProviderResponse(data);
            await recordWebUsage(outputText);
            await touchAIModel(selectedProvider.id);
            return NextResponse.json({ ...data, sources: searchSources, modelInfo });
          }

          const ragErrorText = await ragResponse.text();
          console.error('[Chat API] RAG service returned an error:', {
            traceId,
            status: ragResponse.status,
            statusText: ragResponse.statusText,
            url: `${RAG_SERVICE_URL}/chat`,
            sessionId,
            lastUserChars: getMessageText(lastUserMessage).length,
            responseText: ragErrorText,
          });
        }
      } catch (ragError) {
        console.error('[Chat API] RAG service unavailable, falling back to direct LLM:', {
          traceId,
          url: `${RAG_SERVICE_URL}/chat`,
          sessionId,
          error: ragError,
        });
      }
    } else if (sessionId && (hasCurrentImage || selectedProvider.provider !== 'openai-compatible')) {
      console.log('[Chat API] Skipping RAG service; using direct model path.', {
        traceId,
        sessionId,
        hasAudioContext,
        provider: selectedProvider.provider,
      });
    }

    // Transform messages to Qwen format (async now)
    const qwenMessages = await transformMessages(modelMessages);
    console.log('[Chat API] Model messages prepared', {
      traceId,
      sessionId,
      elapsedMs: Date.now() - startedAt,
      messages: summarizeModelMessages(qwenMessages),
    });

    if (stream && !hasAudioContext && !hasCurrentImage && selectedProvider.provider === 'openai-compatible') {
      const responsesEndpoint = getResponsesEndpoint(endpoint);
      console.log('[Responses API] Sending request', {
        traceId,
        endpoint: safeUrlSummary(responsesEndpoint),
        model,
        messageCount: qwenMessages.length,
        hasCurrentImage,
      });
      const response = await fetch(responsesEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        signal: request.signal,
        body: JSON.stringify(withChatTemplateKwargs({
          model,
          input: toResponsesInput(qwenMessages),
          stream: true,
          max_output_tokens: 16384,
          temperature: 0.6,
          top_p: 0.8,
        }, selectedProvider.provider, thinkingMode ?? false)),
      });
      console.log('[Responses API] Received response headers', {
        traceId,
        status: response.status,
        statusText: response.statusText,
        elapsedMs: Date.now() - startedAt,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Responses API Error] Request failed:', {
          traceId,
          status: response.status,
          statusText: response.statusText,
          endpoint: responsesEndpoint,
          model,
          messageSummary: summarizeModelMessages(qwenMessages),
          responseError: truncateLogText(errorText),
        });

        return NextResponse.json(
          {
            error: `Responses API request failed: ${response.status} ${response.statusText}`,
            ...(IS_DEV
              ? {
                  debug: {
                    endpoint: responsesEndpoint,
                    model,
                    upstreamStatus: response.status,
                    statusText: response.statusText,
                    responseError: truncateLogText(errorText),
                  },
                }
              : {}),
          },
          { status: 502 }
        );
      }

      const directStream = streamResponsesAsChatCompletions({
        upstream: response,
        responsesEndpoint,
        apiKey,
        clientSignal: request.signal,
        traceId,
      });
      await touchAIModel(selectedProvider.id);
      const meteredDirectStream = prependModelInfoStream(meterOpenAIStream(directStream, recordWebUsage), modelInfo);

      return new Response(logStreamProgress(meteredDirectStream?.pipeThrough(new TransformStream({
        start(controller) {
          if (searchSources.length > 0) {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'search_sources', sources: searchSources })}\n\n`));
          }
        },
        transform(chunk, controller) {
          controller.enqueue(chunk);
        },
      })), 'Chat API Responses', traceId), {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      signal: request.signal,
      body: JSON.stringify(withChatTemplateKwargs({
        model: model,
        temperature: 0.6,
        top_p: 0.8,
        messages: qwenMessages,
        max_tokens: 16384,
        stream: stream ?? false,
      }, selectedProvider.provider, thinkingMode ?? false)),
    });
    console.log('[Chat Completions API] Received response headers', {
      traceId,
      endpoint: safeUrlSummary(endpoint),
      status: response.status,
      statusText: response.statusText,
      elapsedMs: Date.now() - startedAt,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[API Error] Request failed:', {
        traceId,
        status: response.status,
        statusText: response.statusText,
        endpoint,
        model: model,
        messagesCount: qwenMessages.length,
        messageSummary: summarizeModelMessages(qwenMessages),
        responseError: truncateLogText(errorText),
        env: {
          hasApiKey: !!apiKey,
          hasEndpoint: !!endpoint,
        },
      });
      return NextResponse.json(
        {
          error: `API request failed: ${response.status} ${response.statusText}`,
          ...(IS_DEV
            ? {
                debug: {
                  endpoint,
                  model,
                  upstreamStatus: response.status,
                  statusText: response.statusText,
                  responseError: truncateLogText(errorText),
                  messagesCount: qwenMessages.length,
                },
              }
            : {}),
        },
        { status: 502 }
      );
    }

    // For streaming responses, proxy the stream. Audio stays on chat completions
    // because this provider rejects input_audio on the Responses endpoint.
    if (stream) {
      await touchAIModel(selectedProvider.id);
      const meteredBody = prependModelInfoStream(meterOpenAIStream(response.body, recordWebUsage), modelInfo);
      return new Response(logStreamProgress(prependSearchSourcesStream(meteredBody, searchSources), 'Chat API Completions', traceId), {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // For non-streaming, return the JSON response
    const data = await response.json();
    const outputText = extractTextFromProviderResponse(data);
    await recordWebUsage(outputText, parseProviderUsage(data, estimatedInputTokens, outputText));
    await touchAIModel(selectedProvider.id);
    return NextResponse.json({ ...data, sources: searchSources, modelInfo });
  } catch (error) {
    console.error('API route error:', { traceId, elapsedMs: Date.now() - startedAt, error });
    const statusCode = typeof (error as { statusCode?: unknown }).statusCode === 'number'
      ? (error as { statusCode: number }).statusCode
      : 500;
    return NextResponse.json(
      {
        error: statusCode === 500 ? 'Failed to process request' : error instanceof Error ? error.message : 'Request rejected',
        ...(IS_DEV
          ? {
              debug: {
                name: error instanceof Error ? error.name : undefined,
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
              },
            }
          : {}),
      },
      { status: statusCode }
    );
  }
}
