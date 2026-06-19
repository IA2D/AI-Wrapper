import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { formatSearchContext, searchForContext } from '@/lib/braveSearch';
import { PDFContentStructure } from '@/types';
import { parseAiJson } from '@/utils/aiJson';
import { normalizeDocumentContent } from '@/utils/documentStructure';

const IS_DEV = process.env.NODE_ENV !== 'production';
const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://localhost:8001';

export interface FileContentStructure {
  title?: string;
  sections: {
    id?: string;
    heading?: string;
    content: string;
    type?: 'paragraph' | 'list' | 'table';
    pageCount?: number;
    style?: DocumentSectionPlan['style'];
    items?: string[];
    rows?: string[][];
  }[];
}

interface DocumentSectionPlan {
  id: string;
  heading: string;
  summary: string;
  pageCount: number;
  include: boolean;
  allowTables: boolean;
  allowCharts: boolean;
  needsSearch?: boolean;
  style?: {
    headingFontSize: number;
    bodyFontSize: number;
    tableFontSize: number;
    lineGap: number;
    spacingAfter: number;
    density: 'compact' | 'normal' | 'spacious';
    layout: 'single-column' | 'two-column' | 'table-first' | 'slide';
  };
}

interface GenerateFileRequest {
  action?: 'outline' | 'section' | 'document';
  prompt?: string;
  content?: string;
  title?: string;
  pageCount?: number;
  pageRange?: { min?: number; max?: number };
  format?: 'structured' | 'pdf';
  documentKind?: 'document' | 'excel' | 'presentation';
  exportFormat?: 'pdf' | 'doc' | 'docx' | 'sheet' | 'presentation';
  templateId?: 'executive' | 'research' | 'modern' | 'academic' | 'dashboard' | 'pitch';
  includeTables?: boolean;
  includeCharts?: boolean;
  enableSearch?: boolean;
  section?: DocumentSectionPlan;
  previousSections?: Array<{ heading?: string; content: string }>;
  thinkingMode?: boolean;
  async?: boolean;
}

type GeneratedSectionJson = {
  id?: unknown;
  heading?: unknown;
  content?: unknown;
  type?: unknown;
  pageCount?: unknown;
  style?: unknown;
  items?: unknown;
  rows?: unknown;
};

type GeneratedDocumentJson = {
  title?: unknown;
  sections?: GeneratedSectionJson[];
};

type GenerateJob =
  | { status: 'pending'; createdAt: number }
  | { status: 'completed'; createdAt: number; content: FileContentStructure }
  | { status: 'failed'; createdAt: number; error: string };

const globalForJobs = globalThis as typeof globalThis & {
  __generateFileJobs?: Map<string, GenerateJob>;
};

const jobs = globalForJobs.__generateFileJobs ?? new Map<string, GenerateJob>();
globalForJobs.__generateFileJobs = jobs;

class UpstreamAIError extends Error {
  status: number;
  statusText: string;
  endpoint: string;
  responseError: string;

  constructor({
    status,
    statusText,
    endpoint,
    responseError,
  }: {
    status: number;
    statusText: string;
    endpoint: string;
    responseError: string;
  }) {
    const summary = summarizeErrorBody(responseError);
    super(`Upstream AI API request failed: ${status} ${statusText || '<none>'}${summary ? ` - ${summary}` : ''}`);
    this.name = 'UpstreamAIError';
    this.status = status;
    this.statusText = statusText;
    this.endpoint = endpoint;
    this.responseError = responseError;
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireCurrentUser();
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const apiKey = process.env.API_KEY;
  const endpoint = process.env.API_ENDPOINT;
  const model = process.env.MODEL;

  if (!apiKey || !endpoint || !model) {
    return NextResponse.json({ error: 'API configuration is missing' }, { status: 500 });
  }

  try {
    const body: GenerateFileRequest = await request.json();
    const { title, format = 'structured', thinkingMode = false } = body;
    const documentPrompt = (body.prompt || body.content || '').trim();
    const pageRange = clampPageRange(body.pageRange, body.pageCount);
    const pageCount = pageRange.max;

    if (!documentPrompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    if (body.action === 'outline') {
      const searchSources = body.enableSearch
        ? await searchForContext(`${title || ''} ${documentPrompt}`.trim(), { count: 8, academic: true, freshness: 'py' }).catch((error) => {
            console.error('[Generate Outline] Brave search failed:', error);
            return [];
          })
        : [];
      const outline = await withRetries(() => generateDocumentOutline({
          apiKey,
          endpoint,
          model,
          documentPrompt,
          title,
          thinkingMode,
          pageCount,
          pageRange,
          documentKind: body.documentKind || 'document',
          exportFormat: body.exportFormat || 'pdf',
          templateId: body.templateId || 'executive',
          includeTables: body.includeTables ?? true,
          includeCharts: body.includeCharts ?? false,
          searchContext: formatSearchContext(searchSources),
        }),
        3,
        async (attempt, error) => {
          console.warn('[Generate Outline Retry]', {
            attempt,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      );

      return NextResponse.json({ success: true, outline });
    }

    if (body.action === 'section') {
      if (!body.section) {
        return NextResponse.json({ error: 'Section plan is required' }, { status: 400 });
      }

      if (body.section.pageCount > 10) {
        return NextResponse.json({ error: 'A section generation batch cannot exceed 10 pages' }, { status: 400 });
      }

      const sectionInput = {
        apiKey,
        endpoint,
        model,
        documentPrompt,
        title,
        thinkingMode,
        pageCount: Math.min(10, Math.max(1, body.section.pageCount)),
        documentKind: body.documentKind || 'document',
        exportFormat: body.exportFormat || 'pdf',
        templateId: body.templateId || 'executive',
        section: body.section,
        previousSections: body.previousSections || [],
      };

      if (body.async) {
        cleanupOldJobs();

        const jobId = randomUUID();
        jobs.set(jobId, { status: 'pending', createdAt: Date.now() });

        withRetries(() => generateDocumentSection(sectionInput), 3, async (attempt, error) => {
          console.warn('[Generate Section Retry]', {
            attempt,
            error: error instanceof Error ? error.message : String(error),
          });
        })
          .then((content) => {
            jobs.set(jobId, { status: 'completed', createdAt: Date.now(), content });
          })
          .catch((error) => {
            console.error('[Generate Section Job Error]', error);
            jobs.set(jobId, {
              status: 'failed',
              createdAt: Date.now(),
              error: error instanceof Error ? error.message : String(error),
            });
          });

        return NextResponse.json({ success: true, jobId, status: 'pending' }, { status: 202 });
      }

      const content = await withRetries(() => generateDocumentSection(sectionInput), 3, async (attempt, error) => {
        console.warn('[Generate Section Retry]', {
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      return NextResponse.json({ success: true, content, format: 'structured' });
    }

    const generationInput = {
      apiKey,
      endpoint,
      model,
      documentPrompt,
      title,
      thinkingMode,
      pageCount,
    };

    if (body.async) {
      cleanupOldJobs();

      const jobId = randomUUID();
      jobs.set(jobId, { status: 'pending', createdAt: Date.now() });

      generateStructuredDocument(generationInput)
        .then((content) => {
          jobs.set(jobId, { status: 'completed', createdAt: Date.now(), content });
        })
        .catch((error) => {
          console.error('[Generate File Job Error]', error);
          jobs.set(jobId, {
            status: 'failed',
            createdAt: Date.now(),
            error: error instanceof Error ? error.message : String(error),
          });
        });

      return NextResponse.json({ success: true, jobId, status: 'pending' }, { status: 202 });
    }

    const structuredContent = await generateStructuredDocument(generationInput);

    if (format === 'pdf') {
      const pdfResponse = await fetch(`${process.env.BASE_URL || 'http://localhost:3000'}/api/create-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: structuredContent }),
      });

      if (!pdfResponse.ok) {
        const error = await pdfResponse.text();
        return NextResponse.json({ error: 'Failed to generate PDF', details: error }, { status: 500 });
      }

      const pdfBuffer = await pdfResponse.arrayBuffer();
      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${title || 'generated'}.pdf"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      content: structuredContent,
      format: 'structured',
    });
  } catch (error) {
    console.error('Generate file error:', error);
    return NextResponse.json(
      { error: `Failed to generate file: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireCurrentUser();
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const jobId = request.nextUrl.searchParams.get('jobId');

  if (jobId) {
    const job = jobs.get(jobId);

    if (!job) {
      return NextResponse.json({ error: 'Generation job not found' }, { status: 404 });
    }

    return NextResponse.json({ jobId, ...job });
  }

  return NextResponse.json({
    description: 'Generate structured content for PDF creation',
    usage: {
      method: 'POST',
      contentType: 'application/json',
      body: {
        prompt: 'Instruction describing the PDF to create (required)',
        title: 'Document title (optional)',
        action: 'outline | section | document',
        pageCount: 'Number of pages to target, 1-100 for outlines and 1-10 for section batches (default: 3)',
        async: 'Start a background generation job and poll GET ?jobId=...',
        format: 'Output format: structured | pdf (default: structured)',
        thinkingMode: 'Enable AI thinking mode (optional, default: false)',
      },
    },
  });
}

async function generateStructuredDocument({
  apiKey,
  endpoint,
  model,
  documentPrompt,
  title,
  thinkingMode,
  pageCount,
}: {
  apiKey: string;
  endpoint: string;
  model: string;
  documentPrompt: string;
  title?: string;
  thinkingMode: boolean;
  pageCount: number;
}): Promise<FileContentStructure> {
  const systemPrompt = `You are a document research and formatting assistant. Your task is to generate comprehensive, well-researched content and format it as structured JSON for PDF generation.
${buildLengthRequirements(pageCount)}

CRITICAL INSTRUCTIONS:
1. Generate ACTUAL CONTENT - do NOT echo the user's request. Create informative, detailed documents.
2. Return ONLY the raw JSON object - no thinking, no reasoning, no explanations
3. Do NOT wrap the output in markdown code blocks (no \`\`\`json)
4. Do NOT include any text before or after the JSON
5. The response must be parseable by JSON.parse() directly
6. LaTeX math is allowed when the subject needs equations. Keep equations concise and valid, for example "$H|0\\rangle = \\frac{1}{\\sqrt{2}}(|0\\rangle + |1\\rangle)$"
7. The document length target is exactly ${pageCount} page${pageCount === 1 ? '' : 's'}. Ignore and override any different page count requested inside the user prompt.

Required JSON structure:
{
  "title": "Document Title",
  "sections": [
    {
      "heading": "Section Heading",
      "content": "Detailed paragraph content here",
      "type": "paragraph | list | table",
      "items": ["item1", "item2"],
      "rows": [["col1", "col2"], ["col1", "col2"]]
    }
  ]
}

Content generation rules:
- If the input is a request/topic, generate comprehensive content about it
- Include multiple sections with informative headings
- Use "paragraph" for detailed explanations
- Use "list" with "items" for bullet points or numbered lists
- Use "table" with "rows" for structured data comparisons
- NEVER put markdown pipe tables, HTML table tags, or JSON array text inside "content". Actual tables must be separate sections with "type": "table", empty "heading", empty "content", and "rows": [["Header", "Header"], ["Cell", "Cell"]].
- Keep table cells concise. Do not put long paragraphs in table cells; write long explanations as prose outside the table and keep table cells under about 25 words.
- Preserve equations and scientific symbols when they are important to the topic
- Follow the word count, section count, paragraph count, table count, and source count requirements above
- Ensure content is substantial and educational, not just echoing the input`;

  const userPrompt = `Generate a comprehensive PDF document from this user prompt and format it as structured JSON:

${title ? `Requested Document Title: ${title}\n\n` : ''}User prompt:
${documentPrompt}

System-selected page count: ${pageCount}

Create the actual document content requested by the user, but use the system-selected page count above even if the prompt says another number. Return ONLY valid JSON, no additional text.`;

  let aiContent = '';

  try {
    aiContent = stripThinkingContent(await collectResponsesText({
      apiKey,
      endpoint,
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      thinkingMode,
      pageCount,
    }));
  } catch (error) {
    if (error instanceof UpstreamAIError && error.status === 404) {
      const fallbackContent = await generateViaRAGService({
        content: `${systemPrompt}\n\n${userPrompt}`,
        thinkingMode,
      });

      if (fallbackContent) {
        aiContent = stripThinkingContent(fallbackContent);
      }
    }

    if (!aiContent) {
      const upstreamError = error instanceof UpstreamAIError ? error : null;
      const debug = {
        endpoint: upstreamError ? safeUrlForLogs(upstreamError.endpoint) : safeUrlForLogs(getResponsesEndpoint(endpoint)),
        envVar: 'API_ENDPOINT',
        model,
        upstreamStatus: upstreamError?.status,
        statusText: upstreamError?.statusText || '<none>',
        responseError: summarizeErrorBody(upstreamError?.responseError || String(error)),
        fallbackEndpoint: `${RAG_SERVICE_URL}/chat`,
        requestShape: {
          messageCount: 2,
          stream: true,
          maxOutputTokens: maxTokensForPageCount(pageCount),
          thinkingMode,
          pageCount,
        },
      };

      console.error('[Generate File Error] API request failed:', debug);
      throw new Error(`${upstreamError?.message || 'Upstream AI API request failed'}${IS_DEV ? ` ${JSON.stringify(debug)}` : ''}`);
    }
  }

  if (!aiContent) {
    throw new Error('No content received from AI');
  }

  try {
    return normalizeDocumentContent(parseAiJson(aiContent)) as FileContentStructure;
  } catch (parseError) {
    console.error('[Generate File Error] Failed to parse AI response as JSON:', {
      error: parseError instanceof Error ? parseError.message : String(parseError),
      rawResponse: aiContent,
    });
    throw new Error('Failed to parse AI response as structured content');
  }
}

async function generateDocumentOutline({
  apiKey,
  endpoint,
  model,
  documentPrompt,
  title,
  thinkingMode,
  pageCount,
  pageRange,
  documentKind,
  exportFormat,
  templateId,
  includeTables,
  includeCharts,
  searchContext,
}: {
  apiKey: string;
  endpoint: string;
  model: string;
  documentPrompt: string;
  title?: string;
  thinkingMode: boolean;
  pageCount: number;
  pageRange: { min: number; max: number };
  documentKind: string;
  exportFormat: string;
  templateId: string;
  includeTables: boolean;
  includeCharts: boolean;
  searchContext?: string;
}) {
  const systemPrompt = `You create document production plans. Return ONLY valid JSON.

Required JSON:
{
  "title": "Clear title",
  "totalPages": ${pageRange.max},
  "pageRange": { "min": ${pageRange.min}, "max": ${pageRange.max} },
  "documentKind": "${documentKind}",
  "exportFormat": "${exportFormat}",
  "templateId": "${templateId}",
  "sections": [
    {
      "id": "short-slug",
      "heading": "Section heading",
      "summary": "What this section will cover",
      "pageCount": 1,
      "include": true,
      "allowTables": ${includeTables},
      "allowCharts": ${includeCharts},
      "needsSearch": false,
      "style": {
        "headingFontSize": 16,
        "bodyFontSize": 10.5,
        "tableFontSize": 8,
        "lineGap": 3,
        "spacingAfter": 8,
        "density": "normal",
        "layout": "single-column"
      }
    }
  ]
}

Rules:
- Plan a document that naturally lands between ${pageRange.min} and ${pageRange.max} pages.
- Keep each section at 10 pages or less so generation can run in batches.
- For long documents, create enough specific named sections to cover the full page range. Do not use generic names like "Section 1", "Additional Coverage", "More Details", or filler descriptions.
- Every section heading must be meaningful, topic-specific, and suitable for a final document table of contents.
- Every section summary must describe concrete content that should be written, not a note about meeting page count.
- Treat each section pageCount as a target estimate, not a hard layout budget.
- Choose font sizes, spacing, density, and layout for readability. Do not pad content to fill pages.
- For excel/sheet output, plan worksheets, tables, metrics, formulas, and chart-ready data.
- For presentation output, plan slide groups instead of prose-only sections.
- For document output, plan report sections with research depth.
- Use the "${templateId}" visual template. Shape headings, density, tables, charts, and slide rhythm to fit that template.
- For excel/sheet output, include formula-driven tables where useful. Formula cells must start with "=" and use normal Excel syntax like "=SUM(B2:B10)" or "=AVERAGE(C2:C10)".
- Respect table/chart preferences but keep them editable per section.
- CRITICAL: Set "needsSearch" to true for sections that require current facts, statistics, recent data, news, research findings, or specific technical details. Set to false for sections covering general concepts, methodology, or established knowledge.
${searchContext ? `\nFresh sources from Brave Search API to guide the plan:\n${searchContext}` : ''}`;

  const userPrompt = `${title ? `Requested title: ${title}\n` : ''}Request: ${documentPrompt}`;
  const raw = stripThinkingContent(await collectResponsesText({
    apiKey,
    endpoint,
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    thinkingMode,
    pageCount: Math.min(10, pageCount),
  }));
  const parsed = parseAiJson(raw);
  const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
  const normalizedSections = sections.map((section: any, index: number) => ({
    id: String(section.id || `section-${index + 1}`).replace(/[^a-z0-9-]/gi, '-').toLowerCase(),
    heading: String(section.heading || `Section ${index + 1}`),
    summary: String(section.summary || ''),
    pageCount: Math.min(10, Math.max(1, Number(section.pageCount) || 1)),
    include: section.include !== false,
    allowTables: section.allowTables !== false && includeTables,
    allowCharts: Boolean(section.allowCharts && includeCharts),
    needsSearch: section.needsSearch === true,
    style: normalizeSectionStyle(section.style, documentKind),
  }));
  let allocatedPages = normalizedSections.reduce((sum: number, section: DocumentSectionPlan) => (
    section.include ? sum + section.pageCount : sum
  ), 0);

  while (allocatedPages < pageCount) {
    const nextPages = Math.min(10, pageCount - allocatedPages);
    const expansionSection = createExpansionSection(
      normalizedSections.length,
      documentPrompt,
      documentKind,
      includeTables,
      includeCharts
    );
    normalizedSections.push({
      id: expansionSection.id,
      heading: expansionSection.heading,
      summary: expansionSection.summary,
      pageCount: nextPages,
      include: true,
      allowTables: includeTables,
      allowCharts: includeCharts,
      needsSearch: false,
      style: normalizeSectionStyle(null, documentKind),
    });
    allocatedPages += nextPages;
  }

  for (let index = normalizedSections.length - 1; allocatedPages > pageCount && index >= 0; index--) {
    const section = normalizedSections[index];
    const removable = Math.min(section.pageCount - 1, allocatedPages - pageCount);
    section.pageCount -= removable;
    allocatedPages -= removable;
  }

  return {
    title: String(parsed.title || title || 'Generated Document'),
    totalPages: pageRange.max,
    pageRange,
    documentKind,
    exportFormat,
    templateId,
    sections: normalizedSections,
  };
}

function createExpansionSection(
  index: number,
  documentPrompt: string,
  documentKind: string,
  includeTables: boolean,
  includeCharts: boolean
) {
  const topic = inferDocumentTopic(documentPrompt);
  const templates = documentKind === 'presentation'
    ? [
        ['audience-story', 'Audience Storyline', `Build a stronger narrative arc for ${topic}, including audience pain points, stakes, and message flow.`],
        ['evidence-slides', 'Evidence and Proof Points', `Add data-backed proof points, examples, and visual talking points for ${topic}.`],
        ['implementation-slides', 'Implementation Roadmap', `Create a practical roadmap section for how ${topic} can be executed or adopted.`],
        ['risk-slides', 'Risks and Objections', `Cover likely objections, limitations, and mitigation strategies related to ${topic}.`],
      ]
    : [
        ['context-background', 'Context and Background', `Expand the historical, technical, and market context needed to understand ${topic}.`],
        ['core-analysis', 'Detailed Analysis', `Provide deeper analysis of the main mechanisms, causes, constraints, and implications of ${topic}.`],
        ['case-studies', 'Case Studies and Examples', `Add concrete examples, scenarios, comparisons, and lessons learned related to ${topic}.`],
        ['implementation', 'Implementation and Practical Guidance', `Explain practical steps, workflows, requirements, and decision criteria for ${topic}.`],
        ['risks-limitations', 'Risks, Limitations, and Mitigations', `Analyze risks, tradeoffs, limitations, failure modes, and mitigation strategies for ${topic}.`],
        ['future-outlook', 'Future Outlook and Recommendations', `Discuss future trends, recommendations, open questions, and next steps for ${topic}.`],
      ];
  const template = templates[index % templates.length];
  const cycle = Math.floor(index / templates.length) + 1;
  const suffix = cycle > 1 ? ` ${cycle}` : '';

  return {
    id: `${template[0]}-${index + 1}`,
    heading: `${template[1]}${suffix}`,
    summary: `${template[2]}${includeTables ? ' Include structured tables where they clarify the section.' : ''}${includeCharts ? ' Include chart-ready data where useful.' : ''}`,
  };
}

function inferDocumentTopic(prompt: string) {
  const cleaned = prompt
    .replace(/\s+/g, ' ')
    .replace(/^(write|create|generate|make|prepare|اعمل|اكتب|أنشئ)\s+/i, '')
    .trim();

  return cleaned.slice(0, 120) || 'the requested topic';
}

async function generateDocumentSection({
  apiKey,
  endpoint,
  model,
  documentPrompt,
  title,
  thinkingMode,
  pageCount,
  documentKind,
  exportFormat,
  templateId,
  section,
  previousSections,
  onChunk,
}: {
  apiKey: string;
  endpoint: string;
  model: string;
  documentPrompt: string;
  title?: string;
  thinkingMode: boolean;
  pageCount: number;
  documentKind: string;
  exportFormat: string;
  templateId: string;
  section: DocumentSectionPlan;
  previousSections: Array<{ heading?: string; content: string }>;
  onChunk?: (chunk: string) => void;
}): Promise<FileContentStructure> {
  if (documentKind === 'document' || exportFormat === 'pdf' || exportFormat === 'doc' || exportFormat === 'docx') {
    return generateDocumentSectionFromMiniPrompts({
      apiKey,
      endpoint,
      model,
      documentPrompt,
      title,
      thinkingMode,
      pageCount,
      documentKind,
      exportFormat,
      templateId,
      section,
      previousSections,
      onChunk,
    });
  }

  const minimumWords = minimumWordsForSection(section, pageCount);
  const systemPrompt = `You are generating one approved section of a larger document. Return ONLY valid JSON matching:
{
  "title": "Document title",
  "sections": [
    {
      "id": "${section.id}",
      "heading": "${section.heading}",
      "content": "Complete section content",
      "type": "paragraph | list | table",
      "pageCount": ${pageCount},
      "style": {
        "headingFontSize": ${section.style?.headingFontSize || 16},
        "bodyFontSize": ${section.style?.bodyFontSize || 10.5},
        "tableFontSize": ${section.style?.tableFontSize || 8},
        "lineGap": ${section.style?.lineGap || 3},
        "spacingAfter": ${section.style?.spacingAfter || 8},
        "density": "${section.style?.density || 'normal'}",
        "layout": "${section.style?.layout || 'single-column'}"
      },
      "items": [],
      "rows": []
    }
  ]
}

Rules:
- Generate only this section: ${section.heading}.
- Page target: about ${pageCount} page${pageCount === 1 ? '' : 's'} for this section. This is an estimate, not a strict layout contract.
- Content length target: ${minimumWords}-${Math.round(minimumWords * 1.15)} words of real section body text. Staying inside this range is mandatory for page accuracy.
- Use the requested style for readability: heading ${section.style?.headingFontSize || 16}pt, body ${section.style?.bodyFontSize || 10.5}pt, table ${section.style?.tableFontSize || 8}pt, density ${section.style?.density || 'normal'}, layout ${section.style?.layout || 'single-column'}.
- Content budget guide: compact 1 page is 350-450 words, normal 1 page is 450-550 words, spacious 1 page is 280-380 words. Multiply by pageCount and reduce prose when tables are present.
- For long sections, write complete paragraphs within the target range. Do not over-generate, pad, or rely on headings, bullet labels, or table rows to fake page length.
- This is a ${documentKind} meant for ${exportFormat} export.
- Visual template: ${templateId}. Write content that fits the template style and output type.
- The requested page range must be satisfied by generating the right amount of content here. The exporter will not delete or shorten content later.
- If this is excel/sheet output, create spreadsheet-ready rows with formulas in cells where useful. Formula cells must be strings beginning with "=" using Excel syntax, not explanations.
- ${section.allowTables ? 'Include tables where useful, but tables MUST be returned as structured rows arrays. Do not write HTML tables, markdown pipe tables, or JSON array text inside content.' : 'Do not include tables.'}
- ${section.allowCharts ? 'Describe chart data or include chart-ready tables where useful.' : 'Do not add chart-specific content.'}
- If a section is a table, put all table data in ONE rows array like [["Header 1","Header 2"],["Value 1","Value 2"]]. Never split rows into separate bracket arrays like [["Header"]] [["Row"]].
- For table sections, leave "heading" and "content" empty. Do not add a table title above the table.
- Keep table cells concise. Do not put long paragraphs in table cells; write long explanations as normal section prose and keep table cells under about 25 words.
- Do not repeat earlier sections; continue coherently from the provided context.
- Preserve mathematical notation when useful. Common LaTeX such as $H|0\\rangle$ and \\frac{1}{\\sqrt{2}} is allowed.
- Do not use markdown fences or explanatory text.`;

  const userPrompt = `${title ? `Document title: ${title}\n` : ''}Original user request:
${documentPrompt}

Current section plan:
${JSON.stringify(section, null, 2)}

Previously completed sections:
${previousSections.map((item, index) => `${index + 1}. ${item.heading || 'Untitled'}: ${item.content.slice(0, 800)}`).join('\n\n') || 'None'}`;

  const raw = stripThinkingContent(await collectResponsesText({
    apiKey,
    endpoint,
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    thinkingMode,
    pageCount,
    onChunk,
  }));
  const parsed = parseAiJson<GeneratedDocumentJson>(raw);

  const content: FileContentStructure = {
    title: valueToString(parsed.title, title || 'Generated Document'),
    sections: (Array.isArray(parsed.sections) ? parsed.sections : []).map((item: GeneratedSectionJson, index: number) => ({
      id: valueToString(item.id, section.id || `section-${index + 1}`),
      heading: valueToString(item.heading, section.heading),
      content: valueToString(item.content, ''),
      type: isSectionType(item.type) ? item.type : 'paragraph',
      pageCount,
      style: item.style && typeof item.style === 'object' ? item.style as DocumentSectionPlan['style'] : section.style || normalizeSectionStyle(null, documentKind),
      items: Array.isArray(item.items) ? item.items.map((value) => valueToString(value, '')) : undefined,
      rows: normalizeRows(item.rows),
    })),
  };

  if (documentKind === 'document') {
    await expandDocumentSectionIfTooShort({
      apiKey,
      endpoint,
      model,
      thinkingMode,
      content,
      section,
      pageCount,
      documentPrompt,
      title,
      onChunk,
    });
  }

  return normalizeDocumentContent(content as PDFContentStructure) as FileContentStructure;
}

async function generateDocumentSectionFromMiniPrompts({
  apiKey,
  endpoint,
  model,
  documentPrompt,
  title,
  thinkingMode,
  pageCount,
  documentKind,
  exportFormat,
  templateId,
  section,
  previousSections,
  onChunk,
}: {
  apiKey: string;
  endpoint: string;
  model: string;
  documentPrompt: string;
  title?: string;
  thinkingMode: boolean;
  pageCount: number;
  documentKind: string;
  exportFormat: string;
  templateId: string;
  section: DocumentSectionPlan;
  previousSections: Array<{ heading?: string; content: string }>;
  onChunk?: (chunk: string) => void;
}): Promise<FileContentStructure> {
  const minimumWords = minimumWordsForSection(section, pageCount);
  const chunkCount = Math.max(1, Math.min(6, Math.ceil(pageCount / 2)));
  const wordsPerChunk = Math.max(220, Math.round(minimumWords / chunkCount));
  const chunks: string[] = [];

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const systemPrompt = [
      'You write one prose chunk for a document section.',
      'Return plain text only. Do not return JSON, markdown fences, XML, YAML, or metadata.',
      'Write complete paragraphs. Do not include a section title unless the user explicitly asked for headings inside the section.',
      `Target about ${wordsPerChunk} words for this chunk. Do not over-generate.`,
      `This is chunk ${chunkIndex + 1} of ${chunkCount} for the section "${section.heading}".`,
      `Output type: ${documentKind} for ${exportFormat}. Template: ${templateId}.`,
      section.allowTables
        ? 'If a comparison is useful, describe it in prose. Do not create markdown tables in this chunk.'
        : 'Do not include tables.',
      section.allowCharts ? 'You may mention chart-ready metrics in prose if useful.' : 'Do not add chart-specific content.',
      'Preserve mathematical notation as readable inline text when needed.',
    ].join('\n');

    const userPrompt = `${title ? `Document title: ${title}\n` : ''}Original user request:
${documentPrompt}

Section plan:
${JSON.stringify(section, null, 2)}

Previously completed sections:
${previousSections.map((item, index) => `${index + 1}. ${item.heading || 'Untitled'}: ${item.content.slice(0, 700)}`).join('\n\n') || 'None'}

Already written for this section:
${chunks.join('\n\n').slice(-3500) || 'Nothing yet.'}

Write only the next chunk now.`;

    const raw = stripThinkingContent(await collectResponsesText({
      apiKey,
      endpoint,
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      thinkingMode,
      pageCount: Math.max(1, Math.ceil(pageCount / chunkCount)),
      onChunk,
    }));

    const cleaned = cleanPlainGeneratedChunk(raw);
    if (cleaned) chunks.push(cleaned);
  }

  const content: FileContentStructure = {
    title: title || 'Generated Document',
    sections: [{
      id: section.id,
      heading: section.heading,
      content: chunks.join('\n\n').trim(),
      type: 'paragraph',
      pageCount,
      style: section.style || normalizeSectionStyle(null, documentKind),
    }],
  };

  if (documentKind === 'document') {
    await expandDocumentSectionIfTooShort({
      apiKey,
      endpoint,
      model,
      thinkingMode,
      content,
      section,
      pageCount,
      documentPrompt,
      title,
      onChunk,
    });
  }

  return normalizeDocumentContent(content as PDFContentStructure) as FileContentStructure;
}

function cleanPlainGeneratedChunk(raw: string) {
  return raw
    .replace(/```(?:\w+)?/g, '')
    .replace(/^\s*\{?\s*"content"\s*:\s*"?/i, '')
    .replace(/"?\s*\}?\s*$/i, '')
    .trim();
}

async function expandDocumentSectionIfTooShort({
  apiKey,
  endpoint,
  model,
  thinkingMode,
  content,
  section,
  pageCount,
  documentPrompt,
  title,
  onChunk,
}: {
  apiKey: string;
  endpoint: string;
  model: string;
  thinkingMode: boolean;
  content: FileContentStructure;
  section: DocumentSectionPlan;
  pageCount: number;
  documentPrompt: string;
  title?: string;
  onChunk?: (chunk: string) => void;
}) {
  const mainSection = content.sections.find((item) => item.type !== 'table') || content.sections[0];
  if (!mainSection) return;

  const minimumWords = minimumWordsForSection(section, pageCount);
  let currentWords = countWords(getSectionTextForLength(mainSection));

  for (let attempt = 0; attempt < 3 && currentWords < minimumWords; attempt++) {
    const neededWords = Math.min(3500, Math.max(900, minimumWords - currentWords));
    const appendixRaw = stripThinkingContent(await collectResponsesText({
      apiKey,
      endpoint,
      model,
      messages: [
        {
          role: 'system',
          content: `Continue one section of a long document. Return plain text only.

Rules:
- Continue the section "${section.heading}".
- Add about ${neededWords} words of new, non-repetitive content.
- Do not summarize. Add detailed analysis, examples, evidence, implementation notes, risks, comparisons, and practical details.
- Do not repeat the existing text.
- Keep it coherent with the original request.
- Do not return JSON, markdown fences, or explanatory wrappers.`,
        },
        {
          role: 'user',
          content: `${title ? `Document title: ${title}\n` : ''}Original request:
${documentPrompt}

Section plan:
${JSON.stringify(section, null, 2)}

Existing section text:
${getSectionTextForLength(mainSection).slice(-5000)}

The section is too short for its ${pageCount}-page target. Append more content now.`,
        },
      ],
      thinkingMode,
      pageCount: Math.min(10, Math.max(2, Math.ceil(neededWords / 500))),
      onChunk,
    }));

    const appendix = cleanPlainGeneratedChunk(parseAppendixContent(appendixRaw));
    if (!appendix.trim()) break;

    mainSection.content = [mainSection.content, appendix.trim()].filter(Boolean).join('\n\n');
    currentWords = countWords(getSectionTextForLength(mainSection));
  }
}

function normalizeSectionStyle(style: any, documentKind: string): NonNullable<DocumentSectionPlan['style']> {
  const isPresentation = documentKind === 'presentation';
  const density = ['compact', 'normal', 'spacious'].includes(style?.density) ? style.density : 'normal';
  const layout = ['single-column', 'two-column', 'table-first', 'slide'].includes(style?.layout)
    ? style.layout
    : isPresentation ? 'slide' : 'single-column';

  return {
    headingFontSize: clampNumber(style?.headingFontSize, isPresentation ? 24 : 16, 12, 34),
    bodyFontSize: clampNumber(style?.bodyFontSize, isPresentation ? 16 : 10.5, 8, 22),
    tableFontSize: clampNumber(style?.tableFontSize, isPresentation ? 10 : 8, 6, 14),
    lineGap: clampNumber(style?.lineGap, 3, 0, 8),
    spacingAfter: clampNumber(style?.spacingAfter, 8, 0, 18),
    density,
    layout,
  };
}

function valueToString(value: unknown, fallback: string) {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function isSectionType(value: unknown): value is FileContentStructure['sections'][number]['type'] {
  return value === 'paragraph' || value === 'list' || value === 'table';
}

function normalizeRows(value: unknown): string[][] | undefined {
  if (!Array.isArray(value)) return undefined;

  const rows = value
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => row.map((cell) => valueToString(cell, '')));

  return rows.length > 0 ? rows : undefined;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function cleanupOldJobs() {
  const maxAgeMs = 30 * 60 * 1000;
  const now = Date.now();

  for (const [jobId, job] of jobs.entries()) {
    if (now - job.createdAt > maxAgeMs) {
      jobs.delete(jobId);
    }
  }
}

function safeUrlForLogs(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.replace(/([?&](?:api_?key|key|token)=)[^&]+/gi, '$1<redacted>');
  }
}

function getResponsesEndpoint(chatCompletionsEndpoint: string): string {
  if (chatCompletionsEndpoint.endsWith('/v1/chat/completions')) {
    return chatCompletionsEndpoint.replace(/\/v1\/chat\/completions$/, '/v1/responses');
  }

  return chatCompletionsEndpoint.replace(/\/chat\/completions$/, '/responses');
}

function supportsChatTemplateKwargs(endpoint: string) {
  return !/generativelanguage\.googleapis\.com|api\.openai\.com|api\.perplexity\.ai|api\.anthropic\.com/i.test(endpoint);
}

function summarizeErrorBody(body: string): string {
  if (!body) {
    return '<empty response body>';
  }

  const titleMatch = body.match(/<title>\s*([\s\S]*?)\s*<\/title>/i);
  if (titleMatch?.[1]) {
    return titleMatch[1].replace(/\s+/g, ' ').trim();
  }

  return body.replace(/\s+/g, ' ').trim().slice(0, 1000);
}

function stripThinkingContent(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

async function collectResponsesText({
  apiKey,
  endpoint,
  model,
  messages,
  thinkingMode,
  pageCount,
  onChunk,
}: {
  apiKey: string;
  endpoint: string;
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  thinkingMode: boolean;
  pageCount: number;
  onChunk?: (chunk: string) => void;
}): Promise<string> {
  const responsesEndpoint = getResponsesEndpoint(endpoint);
  const response = await fetch(responsesEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: messages,
      stream: true,
      max_output_tokens: maxTokensForPageCount(pageCount),
      temperature: 0.6,
      top_p: 0.8,
      ...(supportsChatTemplateKwargs(endpoint)
        ? { chat_template_kwargs: { enable_thinking: thinkingMode } }
        : {}),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new UpstreamAIError({
      status: response.status,
      statusText: response.statusText,
      endpoint: responsesEndpoint,
      responseError: errorText || '<empty response body>',
    });
  }

  if (!response.body) {
    throw new Error('Responses API stream is not readable');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let output = '';

  const processRawEvent = (rawEvent: string) => {
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
      return;
    }

    if (parsed.error) {
      throw new Error(`Responses API stream error: ${JSON.stringify(parsed.error)}`);
    }

    const delta =
      parsed.delta ??
      parsed.output_text_delta ??
      parsed.response?.output_text?.delta ??
      parsed.choices?.[0]?.delta?.content ??
      '';

    if (typeof delta === 'string' && delta) {
      output += delta;
      onChunk?.(delta);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const rawEvent of events) {
        processRawEvent(rawEvent);
      }
    }

    if (buffer.trim()) {
      processRawEvent(buffer);
    }
  } finally {
    reader.releaseLock();
  }

  return output;
}

function parseAppendixContent(raw: string) {
  try {
    const parsed = parseAiJson(raw) as any;
    return String(parsed.content || parsed.appendix || parsed.text || '');
  } catch {
    return raw.replace(/```json\s*/g, '').replace(/```/g, '').trim();
  }
}

function minimumWordsForSection(section: DocumentSectionPlan, pageCount: number) {
  const density = section.style?.density || 'normal';
  const wordsPerPage = density === 'compact' ? 420 : density === 'spacious' ? 330 : 480;
  const tableDiscount = section.allowTables ? 0.92 : 1;
  return Math.round(pageCount * wordsPerPage * tableDiscount);
}

function countWords(text: string) {
  const latinWords = text.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?/g) || [];
  const arabicWords = text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+/g) || [];
  return latinWords.length + arabicWords.length;
}

function getSectionTextForLength(section: FileContentStructure['sections'][number]) {
  if (section.type === 'list' && section.items?.length) {
    return [section.content, ...section.items].filter(Boolean).join('\n');
  }

  if (section.type === 'table' && section.rows?.length) {
    return section.rows.flat().join(' ');
  }

  return String(section.content || '');
}

async function withRetries<T>(
  operation: () => Promise<T>,
  maxAttempts: number,
  onRetry?: (attempt: number, error: unknown) => Promise<void> | void
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= maxAttempts) {
        break;
      }

      await onRetry?.(attempt + 1, error);
      await wait(700 * attempt);
    }
  }

  throw lastError;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampPageCount(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return 3;
  }
  return Math.min(100, Math.max(1, Math.round(parsed)));
}

function clampPageRange(value: unknown, fallbackPageCount: unknown): { min: number; max: number } {
  const fallback = clampPageCount(fallbackPageCount);
  const raw = value as { min?: unknown; max?: unknown } | undefined;
  const min = Number(raw?.min ?? 1);
  const max = Number(raw?.max ?? fallback);
  const safeMin = Math.min(100, Math.max(1, Number.isFinite(min) ? Math.round(min) : 1));
  const safeMax = Math.min(100, Math.max(safeMin, Number.isFinite(max) ? Math.round(max) : fallback));

  return { min: safeMin, max: safeMax };
}

function maxTokensForPageCount(pageCount: number): number {
  if (pageCount >= 10) {
    return 24576;
  }

  return 16384;
}

function buildLengthRequirements(pageCount: number): string {
  const targetWords = pageCount * 475;
  const minSections = Math.max(6, Math.ceil(pageCount * 1.5));
  const minParagraphSections = Math.max(4, pageCount);
  const minTables = pageCount >= 12 ? 5 : pageCount >= 6 ? 3 : 1;
  const minSources = pageCount >= 12 ? 12 : pageCount >= 6 ? 8 : 4;

  return `
LENGTH REQUIREMENTS:
- Target exactly ${pageCount} PDF page${pageCount === 1 ? '' : 's'}.
- Generate about ${targetWords} words of body content before references.
- Include at least ${minSections} sections total.
- Include at least ${minParagraphSections} paragraph-style sections with long, detailed content.
- Include at least ${minTables} tables with meaningful rows.
- If sources are requested, put at least ${minSources} source entries in the final section only.
- Do not satisfy a ${pageCount}-page request with a short summary. Expand each topic with evidence, examples, comparisons, and analysis.
`;
}

async function generateViaRAGService({
  content,
  thinkingMode,
}: {
  content: string;
  thinkingMode: boolean;
}): Promise<string | null> {
  try {
    const response = await fetch(`${RAG_SERVICE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: content,
        session_id: 'generate-file',
        history: [],
        stream: false,
        thinking_mode: thinkingMode,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Generate File Error] RAG fallback failed:', {
        status: response.status,
        statusText: response.statusText,
        endpoint: `${RAG_SERVICE_URL}/chat`,
        error: errorText || '<empty response body>',
      });
      return null;
    }

    const data = await response.json();
    return data.response || null;
  } catch (error) {
    console.error('[Generate File Error] RAG fallback unavailable:', error);
    return null;
  }
}
