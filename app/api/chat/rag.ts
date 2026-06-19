/**
 * RAG Chat API Route
 * Forwards chat requests to the Python RAG service.
 * Falls back to direct LLM if RAG service is unavailable.
 */

import { NextRequest, NextResponse } from 'next/server';

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://localhost:8001';
const API_KEY = process.env.API_KEY;
const API_ENDPOINT = process.env.API_ENDPOINT;
const MODEL = process.env.MODEL;
const IS_DEV = process.env.NODE_ENV !== 'production';

interface ClientMessage {
  role: 'user' | 'assistant' | 'system';
  content: {
    text: string;
    images?: Array<{ url: string }>;
  };
}

interface ChatRequestBody {
  messages: ClientMessage[];
  sessionId: string;
  thinkingMode?: boolean;
  stream?: boolean;
}

function toRAGHistory(messages: ClientMessage[]) {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role,
      content: message.content.text,
    }))
    .filter((message) => message.content.trim().length > 0);
}

/**
 * Try to forward request to RAG service
 */
async function forwardToRAGService(
  requestBody: ChatRequestBody
): Promise<Response | null> {
  try {
    // Get the last user message
    const lastUserMessage = requestBody.messages
      .filter(m => m.role === 'user')
      .pop();
    
    if (!lastUserMessage) {
      throw new Error('No user message found');
    }

    const response = await fetch(`${RAG_SERVICE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: lastUserMessage.content.text,
        session_id: requestBody.sessionId,
        history: toRAGHistory(requestBody.messages),
        stream: requestBody.stream ?? true,
        thinking_mode: requestBody.thinkingMode ?? false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[RAG Service Error]', {
        status: response.status,
        statusText: response.statusText,
        url: `${RAG_SERVICE_URL}/chat`,
        sessionId: requestBody.sessionId,
        lastUserMessage: lastUserMessage.content.text,
        responseText: errorText,
      });
      return null;
    }

    return response;
  } catch (error) {
    console.error('[RAG Service Unavailable]', error);
    return null;
  }
}

/**
 * Fallback to direct LLM API
 */
async function fallbackToDirectLLM(
  requestBody: ChatRequestBody
): Promise<Response> {
  if (!API_KEY || !API_ENDPOINT || !MODEL) {
    throw new Error('API configuration is missing');
  }

  // Transform messages to simple format
  const messages = requestBody.messages.map(m => ({
    role: m.role,
    content: m.content.text,
  }));

  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.6,
      top_p: 0.8,
      max_tokens: 1024,
      stream: requestBody.stream ?? false,
      enable_thinking: requestBody.thinkingMode ?? false,
    }),
  });

  return response;
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequestBody = await request.json();
    const { sessionId, stream } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    // Try RAG service first
    const ragResponse = await forwardToRAGService(body);

    if (ragResponse) {
      // Return streaming response from RAG service
      if (stream) {
        return new Response(ragResponse.body, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      }

      // Non-streaming from RAG
      const data = await ragResponse.json();
      return NextResponse.json(data);
    }

    // Fallback to direct LLM
    console.log('[Chat API] Falling back to direct LLM');
    const llmResponse = await fallbackToDirectLLM(body);

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      return NextResponse.json(
        {
          error: `LLM API request failed: ${llmResponse.status} ${llmResponse.statusText}`,
          ...(IS_DEV
            ? {
                debug: {
                  endpoint: API_ENDPOINT,
                  model: MODEL,
                  status: llmResponse.status,
                  statusText: llmResponse.statusText,
                  responseError: errorText,
                },
              }
            : {}),
        },
        { status: llmResponse.status }
      );
    }

    // For streaming, proxy the stream
    if (stream) {
      return new Response(llmResponse.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Non-streaming
    const data = await llmResponse.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('[Chat API Error]', error);
    return NextResponse.json(
      {
        error: 'Failed to process chat request',
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
      { status: 500 }
    );
  }
}
