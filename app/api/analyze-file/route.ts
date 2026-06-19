import { NextRequest, NextResponse } from 'next/server';
import { parseFile, getFileType } from '@/utils/fileParser';

interface AnalyzeFileRequest {
  prompt?: string;
  thinkingMode?: boolean;
  stream?: boolean;
}

function supportsChatTemplateKwargs(endpoint: string) {
  return !/generativelanguage\.googleapis\.com|api\.openai\.com|api\.perplexity\.ai|api\.anthropic\.com/i.test(endpoint);
}

/**
 * POST /api/analyze-file
 * Accepts PDF, Word, or Excel files, parses them, and sends content to AI for analysis
 */
export async function POST(request: NextRequest) {
  const model = process.env.MODEL;
  const apiKey = process.env.API_KEY;
  const endpoint = process.env.API_ENDPOINT;

  if (!apiKey || !endpoint || !model) {
    return NextResponse.json(
      { error: 'API configuration is missing' },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const prompt = (formData.get('prompt') as string) || 'Analyze this file content and provide a summary.';
    const thinkingMode = formData.get('thinkingMode') === 'true';
    const stream = formData.get('stream') === 'true';

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const fileType = getFileType(file.name);
    const validTypes = ['pdf', 'docx', 'xlsx'];
    
    if (!validTypes.includes(fileType)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only PDF, DOCX, and XLSX are supported.' },
        { status: 400 }
      );
    }

    // Validate file size (20MB max for documents)
    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size exceeds 20MB limit' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Parse the file
    const parsedContent = await parseFile(buffer, file.name);

    // Prepare messages for AI
    const messages = [
      {
        role: 'system' as const,
        content: 'You are a helpful assistant that analyzes documents. Provide clear, concise analysis of the content provided.',
      },
      {
        role: 'user' as const,
        content: `File: ${parsedContent.metadata.filename}\n\nContent:\n${parsedContent.text}\n\n\n${prompt}`,
      },
    ];
    console.log('[Analyze File] Messages:', messages);
    // Send to AI
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages,
        stream: stream ?? false,
        ...(supportsChatTemplateKwargs(endpoint)
          ? { chat_template_kwargs: { enable_thinking: thinkingMode ?? false } }
          : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Analyze File Error] API request failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      return NextResponse.json(
        { error: `AI API request failed: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    // For streaming responses, proxy the stream
    if (stream) {
      return new Response(response.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // For non-streaming, return the AI response with metadata
    const data = await response.json();
    const aiContent = data.choices?.[0]?.message?.content;

    return NextResponse.json({
      success: true,
      analysis: aiContent,
      metadata: parsedContent.metadata,
      originalText: parsedContent.text.substring(0, 1000) + (parsedContent.text.length > 1000 ? '...' : ''),
    });

  } catch (error) {
    console.error('Analyze file error:', error);
    return NextResponse.json(
      { error: `Failed to analyze file: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/analyze-file
 * Returns supported file types and endpoint info
 */
export async function GET() {
  return NextResponse.json({
    description: 'Analyze PDF, Word, and Excel files using AI',
    supportedTypes: ['pdf', 'docx', 'doc', 'xlsx', 'xls'],
    maxFileSize: '20MB',
    usage: {
      method: 'POST',
      contentType: 'multipart/form-data',
      fields: {
        file: 'The file to analyze (required)',
        prompt: 'Custom prompt for analysis (optional, default: summary)',
        thinkingMode: 'Enable AI thinking mode (optional, default: false)',
        stream: 'Enable streaming response (optional, default: false)',
      },
    },
  });
}
