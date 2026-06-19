/**
 * PDF Upload API Route
 * Forwards PDF uploads to the Python RAG service for processing.
 */

import { NextRequest, NextResponse } from 'next/server';

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://localhost:8001';

export async function POST(request: NextRequest) {
  try {
    // Get form data from request
    const formData = await request.formData();
    
    const file = formData.get('file') as File | null;
    const sessionId = formData.get('sessionId') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { error: 'Only PDF files are allowed' },
        { status: 400 }
      );
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size exceeds 50MB limit' },
        { status: 400 }
      );
    }

    // Forward to RAG service
    const ragFormData = new FormData();
    ragFormData.append('file', file);
    ragFormData.append('session_id', sessionId);

    const response = await fetch(`${RAG_SERVICE_URL}/upload-pdf`, {
      method: 'POST',
      body: ragFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[PDF Upload Error]', response.status, errorText);
      let errorMessage = `RAG service error: ${response.status} ${response.statusText}`;
      try {
        const parsed = JSON.parse(errorText);
        errorMessage = parsed.error || parsed.detail || parsed.details || errorMessage;
      } catch {
        // Keep the generic status message when the upstream body is not JSON.
      }
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Return standardized response
    return NextResponse.json({
      success: true,
      docId: data.doc_id,
      filename: data.filename,
      status: data.status,
      pageCount: data.page_count,
      chunkCount: data.chunk_count,
    });

  } catch (error) {
    console.error('[PDF Upload Error]', error);
    return NextResponse.json(
      { error: 'Failed to upload PDF' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    description: 'PDF Upload endpoint - forwards to RAG service',
    usage: {
      method: 'POST',
      contentType: 'multipart/form-data',
      fields: {
        file: 'PDF file (required, max 50MB)',
        sessionId: 'Chat session ID (required)',
      },
    },
  });
}
