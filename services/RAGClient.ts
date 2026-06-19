import { PDFAttachment, generateId } from '../types';

/**
 * RAGClient handles all communication with the Python RAG service.
 * Supports: chat with RAG, PDF upload, PDF analysis, PDF edit suggestions.
 */
export class RAGClient {
  private baseUrl: string;

  constructor(baseUrl: string = getDefaultRAGBaseUrl()) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
  }

  /**
   * Upload a PDF file to the RAG service for processing.
   * The PDF will be chunked, embedded, and stored in Qdrant.
   */
  async uploadPDF(
    file: File,
    sessionId: string,
    onProgress?: (progress: number) => void
  ): Promise<PDFAttachment> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('session_id', sessionId);

    try {
      const response = await fetch(`${this.baseUrl}/upload-pdf`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorDetails = await readErrorDetails(response);
        throw new Error(`PDF upload failed: ${response.status} ${response.statusText} - ${errorDetails}`);
      }

      const data = await response.json();

      return {
        id: generateId(),
        docId: data.doc_id,
        name: data.filename,
        size: file.size,
        pageCount: data.page_count,
        chunkCount: data.chunk_count,
        uploadedAt: new Date(),
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to upload PDF: Unknown error');
    }
  }

  /**
   * Send a chat message with RAG context.
   * Automatically includes any PDFs attached to the session.
   */
  async sendMessage(
    message: string,
    sessionId: string,
    thinkingMode: boolean = false,
    onStream?: (chunk: string) => void
  ): Promise<string> {
    const isStreaming = !!onStream;

    try {
      const response = await fetch(`${this.baseUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          session_id: sessionId,
          stream: isStreaming,
          thinking_mode: thinkingMode,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Chat request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      if (isStreaming && response.body) {
        return await this.handleStreamingResponse(response, onStream);
      } else {
        const data = await response.json();
        return data.response;
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to send message: Unknown error');
    }
  }

  /**
   * Handle streaming response from RAG service.
   */
  private async handleStreamingResponse(
    response: Response,
    onStream: (chunk: string) => void
  ): Promise<string> {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    if (!reader) {
      throw new Error('Response body is not readable');
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') return fullContent;

          // For RAG service, chunks are plain text, not JSON
          fullContent += data;
          onStream(data);
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullContent;
  }

  /**
   * Get a summary of a PDF document.
   */
  async summarizePDF(sessionId: string, docId?: string): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/pdf/summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          doc_id: docId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Summarize request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.summary;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to summarize PDF: Unknown error');
    }
  }

  /**
   * Get edit suggestions for a PDF document.
   */
  async getEditSuggestions(
    sessionId: string,
    instruction: string,
    docId?: string
  ): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/pdf/edit-suggestions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          instruction,
          doc_id: docId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Edit suggestions request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.suggestions;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to get edit suggestions: Unknown error');
    }
  }

  /**
   * Get all PDFs attached to a session.
   */
  async getSessionPDFs(sessionId: string): Promise<PDFAttachment[]> {
    try {
      const response = await fetch(`${this.baseUrl}/session/${sessionId}/pdfs`);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get session PDFs: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      return data.pdfs.map((pdf: any) => ({
        id: generateId(),
        docId: pdf.doc_id,
        name: pdf.filename,
        size: 0, // Not provided by backend
        pageCount: pdf.page_count,
        chunkCount: pdf.chunk_count,
        uploadedAt: new Date(pdf.uploaded_at),
      }));
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to get session PDFs: Unknown error');
    }
  }

  /**
   * Remove a PDF from a session.
   */
  async removePDF(sessionId: string, docId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/session/${sessionId}/pdf/${docId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to remove PDF: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to remove PDF: Unknown error');
    }
  }

  /**
   * Test RAG service connectivity.
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

function getDefaultRAGBaseUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_RAG_SERVICE_URL;

  if (!configuredUrl) {
    return '/api/rag';
  }

  try {
    const url = new URL(configuredUrl);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return '/api/rag';
    }
  } catch {
    return configuredUrl;
  }

  return configuredUrl;
}

async function readErrorDetails(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') || '';
  const body = await response.text();

  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(body);
      return parsed.error || parsed.detail || parsed.details || body;
    } catch {
      return body;
    }
  }

  const title = body.match(/<title>(.*?)<\/title>/i)?.[1];
  if (title) {
    return title.replace(/\s+/g, ' ').trim();
  }

  return body.length > 500 ? `${body.slice(0, 500)}...` : body;
}

// Singleton instance for convenience
let defaultClient: RAGClient | null = null;

export function getRAGClient(): RAGClient {
  if (!defaultClient) {
    defaultClient = new RAGClient();
  }
  return defaultClient;
}
