import { NextRequest, NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { getChatSession, saveChatSession, updateChatSession } from '@/lib/chatSessions';
import { getActiveSessionRun, getChatRun, getLatestSessionRun, saveChatRun, updateChatRun } from '@/lib/chatRuns';
import { listUserMemories, saveMemoryCandidates } from '@/lib/userMemories';
import { hasBraveSearchConfigured, shouldUseSearchForChat } from '@/lib/braveSearch';
import { estimateTokensFromMessages, estimateTokensFromText } from '@/lib/usage';
import { generateId } from '@/types';
import type { ChatRun, ChatSession, Message, UserMemoryKind } from '@/types';
import type { SearchSource } from '@/types';

const ACTIVE_STATUSES = new Set<ChatRun['status']>(['queued', 'processing', 'streaming']);

function splitThinkingContent(raw: string) {
  const openTag = '<think>';
  const closeTag = '</think>';
  const start = raw.indexOf(openTag);

  if (start === -1) {
    return { thinking: '', answer: raw };
  }

  const beforeThinking = raw.slice(0, start);
  const afterOpen = raw.slice(start + openTag.length);
  const end = afterOpen.indexOf(closeTag);

  if (end === -1) {
    return {
      thinking: afterOpen,
      answer: beforeThinking,
    };
  }

  return {
    thinking: afterOpen.slice(0, end),
    answer: beforeThinking + afterOpen.slice(end + closeTag.length),
  };
}

function buildAssistantMessage({
  answerText,
  thinkingText,
  stopReason,
  failed,
}: {
  answerText: string;
  thinkingText: string;
  stopReason?: ChatRun['stopReason'];
  failed?: boolean;
}): Message | null {
  const answer = answerText.trim();
  const thinking = thinkingText.trim();

  if (!answer && !thinking) {
    return null;
  }

  return {
    id: generateId(),
    role: 'assistant',
    content: {
      text: (failed || stopReason === 'cancelled') && answer
        ? `${answer}\n\n_Response stopped before it finished. Continue where it stopped?_`
        : answer,
    },
    timestamp: new Date(),
    thinking: thinking || undefined,
    metadata: failed || stopReason === 'length' || stopReason === 'cancelled'
      ? {
          incomplete: true,
          stopReason: failed ? 'error' : stopReason === 'cancelled' ? 'cancelled' : 'length',
          canContinue: true,
        }
      : undefined,
  };
}

async function persistRunProgress(userId: string, runId: string, answerText: string, thinkingText: string) {
  if (await isRunCancelled(userId, runId)) return;

  await updateChatRun(userId, runId, {
    status: answerText || thinkingText ? 'streaming' : 'processing',
    statusMessage: answerText || thinkingText ? null : undefined,
    answerText,
    thinkingText,
    error: null,
  });
}

async function appendAssistantToSession(userId: string, sessionId: string, assistantMessage: Message) {
  const session = await getChatSession(userId, sessionId);
  if (!session) return;

  const alreadyExists = session.messages.some((message) => message.id === assistantMessage.id);
  const nextMessages = alreadyExists ? session.messages : [...session.messages, assistantMessage];

  await updateChatSession(userId, sessionId, {
    messages: nextMessages,
    metadata: {
      ...(session.metadata || {}),
      messageCount: nextMessages.length,
    },
  });
}

async function isRunCancelled(userId: string, runId: string) {
  const run = await getChatRun(userId, runId);
  return run?.status === 'cancelled';
}

function getResponsesEndpoint(chatCompletionsEndpoint: string): string {
  if (chatCompletionsEndpoint.endsWith('/v1/chat/completions')) {
    return chatCompletionsEndpoint.replace(/\/v1\/chat\/completions$/, '/v1/responses');
  }

  return chatCompletionsEndpoint.replace(/\/chat\/completions$/, '/responses');
}

function extractTextFromResponse(data: any) {
  if (typeof data?.output_text === 'string') return data.output_text;
  if (typeof data?.choices?.[0]?.message?.content === 'string') return data.choices[0].message.content;

  const output = Array.isArray(data?.output) ? data.output : [];
  return output
    .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
    .map((part: any) => part?.text || part?.content || '')
    .filter(Boolean)
    .join('\n');
}

function parseMemoryJson(text: string) {
  const trimmed = text.trim();
  const jsonText = trimmed.startsWith('{')
    ? trimmed
    : trimmed.match(/\{[\s\S]*\}/)?.[0] || '';

  if (!jsonText) return [];

  const parsed = JSON.parse(jsonText);
  return Array.isArray(parsed?.memories) ? parsed.memories : [];
}

function getLastUserText(messages: Message[]) {
  const lastUser = [...messages].reverse().find((message) => message.role === 'user');
  return lastUser?.content?.text?.trim() || '';
}

function getSearchStatusText(messages: Message[]) {
  const lastUserText = getLastUserText(messages);
  if (!hasBraveSearchConfigured() || !shouldUseSearchForChat(lastUserText)) return null;

  const statuses = [
    'Searching the web...',
    'Surfing the web...',
    'Checking fresh sources...',
  ];
  return statuses[Math.floor(Math.random() * statuses.length)];
}

function normalizeBaseUrl(value: string | undefined | null) {
  return value?.trim().replace(/\/+$/, '') || '';
}

function getChatApiBaseUrlCandidates(origin: string) {
  const candidates = [
    process.env.INTERNAL_APP_URL,
    process.env.NEXT_INTERNAL_URL,
    process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : '',
    'http://127.0.0.1:3000',
    process.env.BASE_URL,
    origin,
  ]
    .map(normalizeBaseUrl)
    .filter(Boolean)
    .filter((baseUrl) => !/^https:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(baseUrl));

  return Array.from(new Set(candidates));
}

async function fetchChatStream({
  origin,
  cookie,
  body,
  traceId,
}: {
  origin: string;
  cookie: string;
  body: unknown;
  traceId: string;
}) {
  const targets = getChatApiBaseUrlCandidates(origin);
  const errors: string[] = [];

  console.log('[Chat Run] Internal chat API targets', {
    traceId,
    targets,
  });

  for (const baseUrl of targets) {
    const url = `${baseUrl}/api/chat`;

    try {
      const startedAt = Date.now();
      console.log('[Chat Run] Calling internal chat API', {
        traceId,
        url,
      });
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify(body),
      });

      console.log('[Chat Run] Internal chat API responded', {
        traceId,
        url,
        status: response.status,
        statusText: response.statusText,
        hasBody: Boolean(response.body),
        elapsedMs: Date.now() - startedAt,
      });

      if (!response.ok) {
        return response;
      }

      if (!response.body) {
        errors.push(`${url} -> ${response.status} ${response.statusText}: empty response body`);
        continue;
      }

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const cause = error instanceof Error && 'cause' in error ? String((error as Error & { cause?: unknown }).cause || '') : '';
      errors.push(`${url} -> ${message}${cause ? ` (${cause})` : ''}`);
      console.error('[Chat Run] Internal chat API call failed', {
        traceId,
        url,
        error,
      });
    }
  }

  throw new Error(`Unable to reach internal chat API. Tried: ${errors.join(' | ') || 'no targets'}`);
}

function normalizeMemoryKind(value: unknown): UserMemoryKind {
  return value === 'preference' || value === 'project' || value === 'usage' || value === 'profile'
    ? value
    : 'profile';
}

async function saveUsefulMemories({
  userId,
  messages,
  assistantMessage,
}: {
  userId: string;
  messages: Message[];
  assistantMessage: Message;
}) {
  const apiKey = process.env.API_KEY;
  const endpoint = process.env.API_ENDPOINT;
  const model = process.env.MODEL;
  const userText = getLastUserText(messages);
  const assistantText = assistantMessage.content.text.trim();

  if (!apiKey || !endpoint || !model || (!userText && !assistantText)) return [];

  try {
    const existingMemories = await listUserMemories(userId);
    const response = await fetch(getResponsesEndpoint(endpoint), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: [
                  'Extract only durable, user-specific memories that will help personalize future chats.',
                  'Good memories: name, preferred response style, stable project/product context, recurring workflow preferences.',
                  'Do not save one-off prompts, temporary task details, secrets, credentials, private IDs, or sensitive inferred traits.',
                  'Return only JSON shaped exactly as {"memories":[{"kind":"profile|preference|project|usage","content":"short memory","importance":1-5}]}',
                  'Return an empty memories array if nothing is worth saving. Maximum 3 memories.',
                ].join('\n'),
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: JSON.stringify({
                  existingMemories: existingMemories.map((memory) => ({
                    kind: memory.kind,
                    content: memory.content,
                    importance: memory.importance,
                  })),
                  latestUserMessage: userText,
                  latestAssistantMessage: assistantText.slice(0, 6000),
                }),
              },
            ],
          },
        ],
        stream: false,
        max_output_tokens: 700,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.error('[Memory Extraction] Request failed:', response.status, await response.text().catch(() => ''));
      return [];
    }

    const data = await response.json();
    const candidates = parseMemoryJson(extractTextFromResponse(data))
      .map((candidate: any) => ({
        kind: normalizeMemoryKind(candidate?.kind),
        content: String(candidate?.content || '').trim(),
        importance: Number(candidate?.importance || 3),
        sourceMessageId: assistantMessage.id,
      }))
      .filter((candidate: { content: string }) => candidate.content.length >= 8)
      .slice(0, 3);

    if (candidates.length === 0) return [];

    return saveMemoryCandidates(userId, candidates);
  } catch (error) {
    console.error('[Memory Extraction] Failed:', error);
    return [];
  }
}

async function runChatInBackground({
  userId,
  runId,
  sessionId,
  messages,
  thinkingMode,
  modelSelection,
  origin,
  cookie,
}: {
  userId: string;
  runId: string;
  sessionId: string;
  messages: Message[];
  thinkingMode: boolean;
  modelSelection?: string;
  origin: string;
  cookie: string;
}) {
  const traceId = runId;
  const runStartedAt = Date.now();
  let answerText = '';
  let thinkingText = '';
  let rawContentText = '';
  let reasoningText = '';
  let stopReason: ChatRun['stopReason'] = null;
  let searchSources: SearchSource[] = [];
  let modelInfo: {
    model?: string;
    modelLabel?: string;
    provider?: string;
    modelConfigId?: string;
  } = {};
  let lastPersistedAt = 0;

  const persistSoon = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastPersistedAt < 700) return;
    lastPersistedAt = now;
    await persistRunProgress(userId, runId, answerText, thinkingText);
  };

  try {
    console.log('[Chat Run] Background run started', {
      traceId,
      runId,
      sessionId,
      messageCount: messages.length,
      thinkingMode,
      origin,
    });

    await updateChatRun(userId, runId, {
      status: 'processing',
      statusMessage: getSearchStatusText(messages) || 'Processing...',
      error: null,
    });

    const response = await fetchChatStream({
      origin,
      cookie,
      traceId,
      body: {
        messages,
        thinkingMode,
        modelSelection,
        stream: true,
        sessionId,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Internal chat API returned ${response.status} ${response.statusText}${errorText ? `: ${errorText.slice(0, 500)}` : ''}`);
    }

    await updateChatRun(userId, runId, {
      status: 'processing',
      statusMessage: 'Connected to model stream...',
      error: null,
    });

    if (!response.body) {
      throw new Error('Chat stream response body is empty');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let chunkCount = 0;
    let byteCount = 0;
    let eventCount = 0;

    const processRawEvent = async (rawEvent: string) => {
      eventCount += 1;
      const dataLines = rawEvent
        .split('\n')
        .map((line) => line.replace(/\r$/, ''))
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6));

      if (dataLines.length === 0) return;

      const data = dataLines.join('\n');
      if (data === '[DONE]') return;

      let parsed: any;
      try {
        parsed = JSON.parse(data);
      } catch {
        answerText += data;
        await persistSoon();
        return;
      }

      if (parsed.error) {
        throw new Error(parsed.error.message || JSON.stringify(parsed.error));
      }

      if (parsed.type === 'search_sources' && Array.isArray(parsed.sources)) {
        searchSources = parsed.sources;
        console.log('[Chat Run] Search sources received', {
          traceId,
          count: searchSources.length,
        });
        return;
      }

      if (parsed.type === 'model_info') {
        modelInfo = {
          model: typeof parsed.model === 'string' ? parsed.model : undefined,
          modelLabel: typeof parsed.modelLabel === 'string' ? parsed.modelLabel : undefined,
          provider: typeof parsed.provider === 'string' ? parsed.provider : undefined,
          modelConfigId: typeof parsed.modelConfigId === 'string' ? parsed.modelConfigId : undefined,
        };
        return;
      }

      const delta = parsed.choices?.[0]?.delta || {};
      const content = delta.content || parsed.choices?.[0]?.message?.content || parsed.response || '';
      const reasoning = delta.reasoning_content || delta.reasoning || parsed.reasoning_content || '';
      const finishReason = parsed.choices?.[0]?.finish_reason;

      if (reasoning) {
        reasoningText += reasoning;
        thinkingText = `${reasoningText}${splitThinkingContent(rawContentText).thinking}`;
      }

      if (content) {
        rawContentText += content;
        const parsedContent = splitThinkingContent(rawContentText);
        thinkingText = `${reasoningText}${parsedContent.thinking}`;
        answerText = parsedContent.answer;
      }
      if (finishReason === 'length') stopReason = 'length';

      await persistSoon();
    };

    try {
      while (true) {
        if (await isRunCancelled(userId, runId)) {
          throw new Error('Chat request was cancelled.');
        }

        const { done, value } = await reader.read();
        if (done) break;

        chunkCount += 1;
        byteCount += value.byteLength;
        if (chunkCount === 1) {
          console.log('[Chat Run] First internal stream chunk received', {
            traceId,
            bytes: value.byteLength,
            elapsedMs: Date.now() - runStartedAt,
          });
          await updateChatRun(userId, runId, {
            status: 'streaming',
            statusMessage: 'Receiving model output...',
            error: null,
          });
        } else if (chunkCount % 50 === 0) {
          console.log('[Chat Run] Internal stream progress', {
            traceId,
            chunks: chunkCount,
            bytes: byteCount,
            events: eventCount,
            answerChars: answerText.length,
            thinkingChars: thinkingText.length,
            elapsedMs: Date.now() - runStartedAt,
          });
        }

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const rawEvent of events) {
          await processRawEvent(rawEvent);
        }
      }

      if (buffer.trim()) {
        await processRawEvent(buffer);
      }
    } finally {
      reader.releaseLock();
    }

    console.log('[Chat Run] Internal stream finished', {
      traceId,
      chunks: chunkCount,
      bytes: byteCount,
      events: eventCount,
      answerChars: answerText.length,
      thinkingChars: thinkingText.length,
      elapsedMs: Date.now() - runStartedAt,
    });

    await persistSoon(true);
    if (await isRunCancelled(userId, runId)) {
      throw new Error('Chat request was cancelled.');
    }

    const assistantMessage = buildAssistantMessage({ answerText, thinkingText, stopReason });

    if (!assistantMessage) {
      throw new Error('Chat request finished without an assistant response.');
    }

    const usageMetadata = {
      ...modelInfo,
      tokenUsage: {
        inputTokens: estimateTokensFromMessages(messages),
        outputTokens: estimateTokensFromText(answerText),
        totalTokens: estimateTokensFromMessages(messages) + estimateTokensFromText(answerText),
      },
    };
    const savedMemories = await saveUsefulMemories({ userId, messages, assistantMessage });
    const finalAssistantMessage = savedMemories.length > 0
      ? {
          ...assistantMessage,
          metadata: {
            ...(assistantMessage.metadata || {}),
            ...usageMetadata,
            savedMemoryIds: savedMemories.map((memory) => memory.id),
            ...(searchSources.length > 0 ? { sources: searchSources } : {}),
          },
        }
      : searchSources.length > 0
        ? {
            ...assistantMessage,
            metadata: {
              ...(assistantMessage.metadata || {}),
              ...usageMetadata,
              sources: searchSources,
            },
          }
        : {
            ...assistantMessage,
            metadata: {
              ...(assistantMessage.metadata || {}),
              ...usageMetadata,
            },
          };

    await appendAssistantToSession(userId, sessionId, finalAssistantMessage);
    await updateChatRun(userId, runId, {
      status: 'completed',
      statusMessage: null,
      answerText,
      thinkingText,
      assistantMessage: finalAssistantMessage,
      stopReason,
      error: null,
    });
    console.log('[Chat Run] Background run completed', {
      traceId,
      runId,
      sessionId,
      answerChars: answerText.length,
      thinkingChars: thinkingText.length,
      elapsedMs: Date.now() - runStartedAt,
    });
  } catch (error) {
    const cancelled = error instanceof Error && /cancelled/i.test(error.message);
    const assistantMessage = buildAssistantMessage({
      answerText,
      thinkingText,
      failed: !cancelled,
      stopReason: cancelled ? 'cancelled' : 'error',
    });

    if (assistantMessage) {
      await appendAssistantToSession(userId, sessionId, assistantMessage);
    }

    await updateChatRun(userId, runId, {
      status: cancelled ? 'cancelled' : 'failed',
      statusMessage: null,
      answerText,
      thinkingText,
      assistantMessage,
      stopReason: cancelled ? 'cancelled' : 'error',
      error: error instanceof Error ? error.message : 'Chat request failed',
    });
    console.error('[Chat Run] Background run failed', {
      traceId,
      runId,
      sessionId,
      elapsedMs: Date.now() - runStartedAt,
      error,
    });
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const sessionId = request.nextUrl.searchParams.get('sessionId');
    const includeLatest = request.nextUrl.searchParams.get('latest') === '1';

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const run = includeLatest
      ? await getLatestSessionRun(user.id, sessionId)
      : await getActiveSessionRun(user.id, sessionId);

    return NextResponse.json({ run, active: run ? ACTIVE_STATUSES.has(run.status) : false });
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const body = (await request.json().catch(() => ({}))) as {
      session?: ChatSession;
      messages?: Message[];
      thinkingMode?: boolean;
      modelSelection?: string;
    };
    const session = body.session;
    const messages = body.messages || session?.messages || [];

    if (!session?.id || messages.length === 0) {
      return NextResponse.json({ error: 'Session and messages are required' }, { status: 400 });
    }

    const activeRun = await getActiveSessionRun(user.id, session.id);
    if (activeRun) {
      return NextResponse.json({ run: activeRun }, { status: 202 });
    }

    const savedSession = await saveChatSession(user.id, {
      ...session,
      messages,
      metadata: {
        ...(session.metadata || {}),
        messageCount: messages.length,
      },
      updatedAt: new Date(),
    });
    const runId = generateId();

    await saveChatRun({
      id: runId,
      userId: user.id,
      sessionId: session.id,
      status: 'queued',
      thinkingMode: Boolean(body.thinkingMode),
      requestMessages: messages,
    });

    void runChatInBackground({
      userId: user.id,
      runId,
      sessionId: session.id,
      messages,
      thinkingMode: Boolean(body.thinkingMode),
      modelSelection: typeof body.modelSelection === 'string' ? body.modelSelection : undefined,
      origin: request.nextUrl.origin,
      cookie: request.headers.get('cookie') || '',
    });

    const run = await getChatRun(user.id, runId);
    return NextResponse.json({ run, session: savedSession }, { status: 202 });
  } catch (error) {
    console.error('[Chat Run Error]', error);
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}
