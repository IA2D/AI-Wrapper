import { NextRequest, NextResponse } from 'next/server';
import { parseFile, getFileType } from '@/utils/fileParser';
import { generatePDF, validatePDFContent, PDFContent } from '@/utils/pdfGenerator';

interface EditFileRequest {
  editPrompt: string;
  outputFormat?: 'text' | 'structured' | 'pdf';
  thinkingMode?: boolean;
  newTitle?: string;
}

function supportsChatTemplateKwargs(endpoint: string) {
  return !/generativelanguage\.googleapis\.com|api\.openai\.com|api\.perplexity\.ai|api\.anthropic\.com/i.test(endpoint);
}

/**
 * POST /api/edit-file
 * Combined workflow: Upload a file, AI analyzes and edits it, returns as structured text or PDF
 * 
 * Flow:
 * 1. User uploads file with edit instructions
 * 2. Parse file content
 * 3. Send to AI with edit prompt
 * 4. If outputFormat='pdf': Send AI response to generate-file to structure it, then create PDF
 * 5. If outputFormat='structured': Return structured content
 * 6. If outputFormat='text': Return raw AI response
 */
export async function POST(request: NextRequest) {
  const model = process.env.MODEL;
  const apiKey = process.env.API_KEY;
  const endpoint = process.env.API_ENDPOINT;
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

  if (!apiKey || !endpoint) {
    return NextResponse.json(
      { error: 'API configuration is missing' },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const editPrompt = (formData.get('editPrompt') as string) || 'Improve and restructure this content';
    const outputFormat = (formData.get('outputFormat') as 'text' | 'structured' | 'pdf') || 'text';
    const thinkingMode = formData.get('thinkingMode') === 'true';
    const newTitle = (formData.get('newTitle') as string) || undefined;

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

    // Validate file size (20MB max)
    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size exceeds 20MB limit' },
        { status: 400 }
      );
    }

    // Step 1: Parse the file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const parsedContent = await parseFile(buffer, file.name);

    // Step 2: Send to AI for editing
    const editSystemPrompt = `You are a document editing assistant. Your task is to edit and improve the provided document content according to the user's instructions.

Guidelines:
1. Maintain the original meaning and key information
2. Apply the requested changes thoroughly
3. Improve clarity, grammar, and structure where appropriate
4. Return the complete edited content

If the user wants structured output for PDF generation, organize the content with clear headings and sections.`;

    const editUserPrompt = `Original Document: ${parsedContent.metadata.filename}

Content:
${parsedContent.text}

Edit Instructions:
${editPrompt}

Please provide the complete edited version of this document.`;

    const editResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: editSystemPrompt },
          { role: 'user', content: editUserPrompt },
        ],
        stream: false,
        ...(supportsChatTemplateKwargs(endpoint)
          ? { chat_template_kwargs: { enable_thinking: thinkingMode } }
          : {}),
      }),
    });

    if (!editResponse.ok) {
      const errorText = await editResponse.text();
      console.error('[Edit File Error] AI edit request failed:', {
        status: editResponse.status,
        error: errorText,
      });
      return NextResponse.json(
        { error: `AI edit request failed: ${editResponse.status}` },
        { status: editResponse.status }
      );
    }

    const editData = await editResponse.json();
    const editedContent = editData.choices?.[0]?.message?.content;

    if (!editedContent) {
      return NextResponse.json(
        { error: 'No content received from AI' },
        { status: 500 }
      );
    }

    // Step 3: Return based on output format
    if (outputFormat === 'text') {
      return NextResponse.json({
        success: true,
        originalFile: parsedContent.metadata,
        editedContent,
        format: 'text',
      });
    }

    // Step 4: For structured or PDF output, call generate-file internally
    const generateResponse = await fetch(`${baseUrl}/api/generate-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: editedContent,
        title: newTitle || `Edited ${parsedContent.metadata.filename}`,
        format: 'structured',
        thinkingMode,
      }),
    });

    if (!generateResponse.ok) {
      const error = await generateResponse.text();
      console.error('[Edit File Error] Generate-file request failed:', error);
      return NextResponse.json(
        { error: 'Failed to structure edited content', details: error },
        { status: 500 }
      );
    }

    const structuredData = await generateResponse.json();
    const structuredContent = structuredData.content as PDFContent;

    if (outputFormat === 'structured') {
      return NextResponse.json({
        success: true,
        originalFile: parsedContent.metadata,
        editedContent,
        structuredContent,
        format: 'structured',
      });
    }

    // Step 5: For PDF output, generate the PDF
    if (outputFormat === 'pdf') {
      if (!validatePDFContent(structuredContent)) {
        return NextResponse.json(
          { error: 'Generated content is not valid for PDF creation' },
          { status: 500 }
        );
      }

      const pdfBuffer = await generatePDF(structuredContent);
      const filename = newTitle || `edited-${parsedContent.metadata.filename.replace(/\.[^/.]+$/, '')}`;

      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}.pdf"`,
          'Content-Length': pdfBuffer.length.toString(),
        },
      });
    }

    // Fallback (should not reach here)
    return NextResponse.json({
      success: true,
      editedContent,
    });

  } catch (error) {
    console.error('Edit file error:', error);
    return NextResponse.json(
      { error: `Failed to edit file: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/edit-file
 * Returns endpoint info
 */
export async function GET() {
  return NextResponse.json({
    description: 'Edit and regenerate PDF, Word, or Excel files using AI',
    supportedTypes: ['pdf', 'docx', 'doc', 'xlsx', 'xls'],
    maxFileSize: '20MB',
    usage: {
      method: 'POST',
      contentType: 'multipart/form-data',
      fields: {
        file: 'The file to edit (required)',
        editPrompt: 'Instructions for editing the content (optional)',
        outputFormat: 'text | structured | pdf (default: text)',
        thinkingMode: 'Enable AI thinking mode (optional, default: false)',
        newTitle: 'New title for the output document (optional)',
      },
    },
    workflow: {
      text: 'Returns edited content as plain text',
      structured: 'Returns edited content parsed into structured JSON',
      pdf: 'Parses file → AI edits → Structures content → Generates PDF',
    },
  });
}
