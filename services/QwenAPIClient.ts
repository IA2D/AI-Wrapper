import { Message, APIConfiguration, generateId } from '../types';

const IS_DEV = process.env.NODE_ENV !== 'production';

class APIResponseError extends Error {
  details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown>) {
    super(message);
    this.name = 'APIResponseError';
    this.details = details;
  }
}

/**
 * QwenAPIClient handles all communication with the Qwen API.
 * Supports both streaming and non-streaming responses, thinking mode,
 * and image attachments.
 */
export class QwenAPIClient {
  private config: APIConfiguration;

  constructor(config: APIConfiguration) {
    this.config = config;
  }

  /**
   * Update the API configuration
   */
  updateConfig(config: APIConfiguration): void {
    this.config = config;
  }

  /**
   * Send a message to the Qwen API and receive a response.
   * Supports both streaming and non-streaming modes.
   *
   * @param messages - Conversation history
   * @param thinkingMode - Whether to enable thinking mode
   * @param onStream - Optional callback for streaming chunks
   * @param sessionId - Session ID for RAG context retrieval
   * @returns Assistant's response message
   */
  async sendMessage(
    messages: Message[],
    thinkingMode: boolean,
    onStream?: (chunk: string) => void,
    sessionId?: string,
    signal?: AbortSignal
  ): Promise<Message> {
    const isStreaming = !!onStream;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages,
          thinkingMode,
          stream: isStreaming,
          model: this.config.model,
          sessionId,
        }),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new APIResponseError(`API request failed: ${response.status} ${response.statusText}`, {
          route: '/api/chat',
          status: response.status,
          statusText: response.statusText,
          responseText: errorText,
        });
      }

      let content: string;
      let responseDebug: Record<string, unknown> = {};
      let stopReason: 'length' | 'unknown' | undefined;

      if (isStreaming) {
        const streamResult = await this.handleStreamingResponse(response, onStream);
        content = streamResult.content;
        responseDebug = streamResult.debug;
        stopReason = streamResult.stopReason;
      } else {
        const data = await response.json();
        content = data.choices?.[0]?.message?.content || data.response || '';
        responseDebug = { responseJson: data };
        stopReason = data.choices?.[0]?.finish_reason === 'length' ? 'length' : undefined;
      }

      if (!content) {
        throw new APIResponseError('Invalid API response: missing content', {
          route: '/api/chat',
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers.get('content-type'),
          streaming: isStreaming,
          ...responseDebug,
        });
      }

      const { thinking, answer } = this.parseThinkingContent(content);

      return {
        id: generateId(),
        role: 'assistant',
        content: {
          text: answer,
        },
        timestamp: new Date(),
        thinking,
        metadata: stopReason
          ? {
              incomplete: stopReason === 'length',
              stopReason,
              canContinue: stopReason === 'length',
            }
          : undefined,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to send message: Unknown error');
    }
  }

  /**
   * Test API connectivity by sending a minimal request
   * @returns true if connection successful, false otherwise
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
          thinkingMode: false,
          stream: false,
          model: this.config.model,
        }),
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Handle streaming response using Server-Sent Events (SSE).
   */
  private async handleStreamingResponse(
    response: Response,
    onStream: (chunk: string) => void
  ): Promise<{ content: string; debug: Record<string, unknown>; stopReason?: 'length' | 'unknown' }> {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';
    const debug = {
      contentType: response.headers.get('content-type'),
      rawSamples: [] as string[],
      parsedSamples: [] as unknown[],
      malformedSamples: [] as string[],
      doneSeen: false,
      chunksWithContent: 0,
      finishReason: undefined as string | undefined,
    };
    let reasoningBlockOpen = false;

    if (!reader) {
      throw new Error('Response body is not readable');
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (debug.rawSamples.length < 5) {
            debug.rawSamples.push(data);
          }

          if (data === '[DONE]') {
            debug.doneSeen = true;
            return {
              content: `${fullContent}${reasoningBlockOpen ? '</think>' : ''}`,
              debug,
              stopReason: debug.finishReason === 'length' ? 'length' : undefined,
            };
          }

          try {
            const parsed = JSON.parse(data);
            if (debug.parsedSamples.length < 3) {
              debug.parsedSamples.push(parsed);
            }

            if (parsed.error) {
              throw new APIResponseError('Streaming API error', {
                route: '/api/chat',
                status: response.status,
                statusText: response.statusText,
                sseError: parsed.error,
                debug,
              });
            }

            const eventType = String(parsed.type || '');
            const genericDelta = typeof parsed.delta === 'string' ? parsed.delta : '';
            const genericDeltaIsReasoning = /reasoning|thinking/i.test(eventType);
            const reasoningContent =
              (genericDelta && genericDeltaIsReasoning ? genericDelta : '') ||
              parsed.choices?.[0]?.delta?.reasoning_content ||
              parsed.choices?.[0]?.delta?.reasoning ||
              parsed.reasoning_content ||
              parsed.reasoning ||
              parsed.reasoning_delta ||
              parsed.reasoning_content_delta ||
              parsed.reasoning_summary_text_delta ||
              parsed.summary_text_delta ||
              '';
            const content =
              (genericDelta && !genericDeltaIsReasoning ? genericDelta : '') ||
              parsed.choices?.[0]?.delta?.content ||
              parsed.choices?.[0]?.message?.content ||
              parsed.response ||
              '';

            if (reasoningContent) {
              const thinkingChunk = `${reasoningBlockOpen ? '' : '<think>'}${reasoningContent}`;
              fullContent += thinkingChunk;
              debug.chunksWithContent += 1;
              reasoningBlockOpen = true;
              onStream(thinkingChunk);
            }

            if (content) {
              const answerChunk = `${reasoningBlockOpen ? '</think>' : ''}${content}`;
              fullContent += answerChunk;
              debug.chunksWithContent += 1;
              reasoningBlockOpen = false;
              onStream(answerChunk);
            }

            const finishReason = parsed.choices?.[0]?.finish_reason;
            if (finishReason) {
              debug.finishReason = finishReason;
            }
          } catch (e) {
            if (e instanceof APIResponseError) {
              throw e;
            }

            if (debug.malformedSamples.length < 3) {
              debug.malformedSamples.push(data);
            }

            if (data) {
              fullContent += data;
              debug.chunksWithContent += 1;
              onStream(data);
            }

            if (IS_DEV) {
              console.error('[API Client] Failed to parse SSE chunk as JSON:', e, data);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return {
      content: `${fullContent}${reasoningBlockOpen ? '</think>' : ''}`,
      debug,
      stopReason: debug.finishReason === 'length' ? 'length' : undefined,
    };
  }

  /**
   * Parse thinking content from response.
   * Extracts content between <think>...</think> tags.
   *
   * @param content - Raw response content
   * @returns Object with optional thinking and answer text
   */
  private parseThinkingContent(content: string): {
    thinking?: string;
    answer: string;
  } {
    const thinkingRegex = /<think>([\s\S]*?)<\/think>/;
    const match = content.match(thinkingRegex);

    if (match) {
      return {
        thinking: match[1].trim(),
        answer: content.replace(thinkingRegex, '').trim(),
      };
    }

    return { answer: content };
  }
}
