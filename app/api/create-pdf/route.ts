import { NextRequest, NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { generatePDF, validatePDFContent, PDFContent } from '@/utils/pdfGenerator';
import { normalizeDocumentContent } from '@/utils/documentStructure';

interface CreatePDFRequest {
  content: PDFContent;
  filename?: string;
}

/**
 * POST /api/create-pdf
 * Generates a PDF file from structured content
 */
export async function POST(request: NextRequest) {
  try {
    await requireCurrentUser();
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body: CreatePDFRequest = await request.json();
    const { filename = 'generated-document' } = body;
    const content = body.content ? normalizeDocumentContent(body.content) : body.content;

    // Validate the content structure
    if (!content || !validatePDFContent(content)) {
      return NextResponse.json(
        { 
          error: 'Invalid content structure',
          required: {
            title: 'string (optional)',
            sections: 'array of objects with { heading?, content, type?, items?, rows? }',
          },
        },
        { status: 400 }
      );
    }

    // Generate the PDF
    const pdfBuffer = await generatePDF(content);

    // Return the PDF as a downloadable file
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('Create PDF error:', error);
    return NextResponse.json(
      { error: `Failed to create PDF: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/create-pdf
 * Returns endpoint info and example structure
 */
export async function GET() {
  return NextResponse.json({
    description: 'Generate PDF files from structured content',
    usage: {
      method: 'POST',
      contentType: 'application/json',
      body: {
        filename: 'Name for the downloaded file (optional, default: generated-document)',
        content: {
          title: 'Document title (optional)',
          sections: [
            {
              heading: 'Section heading (optional)',
              content: 'Text content',
              type: 'paragraph | list | table (default: paragraph)',
              items: ['For list type: array of items'],
              rows: [['For table type: array of rows with cell values']],
            },
          ],
        },
      },
    },
    example: {
      filename: 'my-report',
      content: {
        title: 'Monthly Report',
        sections: [
          {
            heading: 'Executive Summary',
            content: 'This report covers the performance metrics for the current month.',
            type: 'paragraph',
          },
          {
            heading: 'Key Highlights',
            content: 'Main achievements this month',
            type: 'list',
            items: ['Revenue increased by 20%', 'New partnerships established', 'Product launch successful'],
          },
          {
            heading: 'Performance Data',
            content: 'Sales figures by region',
            type: 'table',
            rows: [
              ['Region', 'Q1', 'Q2', 'Q3'],
              ['North', '100K', '120K', '140K'],
              ['South', '80K', '90K', '110K'],
            ],
          },
        ],
      },
    },
  });
}
