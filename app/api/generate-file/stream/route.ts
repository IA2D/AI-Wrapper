import { NextRequest, NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { getDocumentJob, updateDocumentJob } from '@/lib/documentJobs';
import { getUserMemoryContext } from '@/lib/userMemories';
import { formatSearchContext, searchForContext } from '@/lib/braveSearch';
import { PDFContentStructure } from '@/types';
import type { SearchSource } from '@/types';
import { parseAiJson } from '@/utils/aiJson';
import { normalizeDocumentContent } from '@/utils/documentStructure';

const SECTION_MAX_ATTEMPTS = 3;

interface StreamRequest {
  prompt: string;
  jobId?: string;
  title?: string;
  thinkingMode?: boolean;
  documentKind: string;
  exportFormat: string;
  templateId?: string;
  enableSearch?: boolean;
  sections: Array<{
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
  }>;
}

type StreamSection = StreamRequest['sections'][number];
type ContentSection = PDFContentStructure['sections'][number];
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

function sendEvent(controller: ReadableStreamDefaultController, event: string, data: unknown) {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(`event: ${event}\n`));
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

function createSafeEventSender(controller: ReadableStreamDefaultController) {
  let closed = false;

  return {
    send(event: string, data: unknown) {
      if (closed) return;
      try {
        sendEvent(controller, event, data);
      } catch (error) {
        closed = true;
        if (!(error instanceof TypeError && /closed|invalid state/i.test(error.message))) {
          throw error;
        }
      }
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        controller.close();
      } catch (error) {
        if (!(error instanceof TypeError && /closed|invalid state/i.test(error.message))) {
          throw error;
        }
      }
    },
    get closed() {
      return closed;
    },
  };
}

interface SectionSource {
  sectionId: string;
  sectionHeading: string;
  sources: SearchSource[];
}

function createSourcesSection(allSectionSources: SectionSource[]): PDFContentStructure['sections'][number] | null {
  // Flatten and dedupe all sources
  const seenUrls = new Set<string>();
  const allSources: SearchSource[] = [];

  for (const sectionSource of allSectionSources) {
    for (const source of sectionSource.sources) {
      const key = source.url.toLowerCase().replace(/\/$/, '');
      if (!seenUrls.has(key)) {
        seenUrls.add(key);
        allSources.push(source);
      }
    }
  }

  if (allSources.length === 0) return null;

  // Create a readable source appendix grouped by section.
  // The markdown structure helps the generation/editing preview look polished,
  // while the export route can still render from canonical source objects.
  const lines: string[] = [];
  let globalIndex = 0;

  for (const sectionSource of allSectionSources) {
    if (sectionSource.sources.length === 0) continue;

    lines.push(`## ${sectionSource.sectionHeading}`);
    lines.push('');

    for (const source of sectionSource.sources) {
      globalIndex += 1;
      const displayUrl = source.displayUrl?.trim() || source.url;

      lines.push(`### ${globalIndex}. ${source.title}`);
      lines.push(`[${displayUrl}](${source.url})`);

      if (source.publishedDate) {
        lines.push(`- **Published:** ${source.publishedDate}`);
      }

      lines.push(`- **Accessed:** ${source.accessedAt}`);

      if (source.description?.trim()) {
        lines.push(`- **Summary:** ${source.description.trim()}`);
      }

      lines.push('');
    }
  }

  while (lines[lines.length - 1] === '') {
    lines.pop();
  }

  return {
    id: 'sources',
    heading: 'Sources',
    content: [
      'This section collects the research sources used in the document.',
      '',
      ...lines,
    ].join('\n'),
    type: 'paragraph',
  };
}

function withSources(content: PDFContentStructure, sectionSources: SectionSource[]): PDFContentStructure {
  const sourceSection = createSourcesSection(sectionSources);

  // Flatten all sources for the sources field
  const seenUrls = new Set<string>();
  const allSources: SearchSource[] = [];
  for (const ss of sectionSources) {
    for (const source of ss.sources) {
      const key = source.url.toLowerCase().replace(/\/$/, '');
      if (!seenUrls.has(key)) {
        seenUrls.add(key);
        allSources.push(source);
      }
    }
  }

  if (allSources.length === 0) return content;

  return {
    ...content,
    sources: allSources,
    sections: [
      ...content.sections.filter((section) => section.id !== 'sources' && section.heading !== 'Sources'),
      ...(sourceSection ? [sourceSection] : []),
    ],
  };
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
  memoryContext,
  searchContext,
  onChunk,
  signal,
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
  section: StreamSection;
  previousSections: Array<{ heading?: string; content: string }>;
  memoryContext?: string;
  searchContext?: string;
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
}): Promise<PDFContentStructure> {
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
      memoryContext,
      searchContext,
      onChunk,
      signal,
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
- Do not use markdown fences or explanatory text.
${memoryContext ? `\nKnown user memory for personalization. Use only when relevant.\n${memoryContext}` : ''}
${searchContext ? `\nFresh sources from Brave Search API. Use these for up-to-date and academic claims where relevant, and preserve source-worthy facts accurately.\n${searchContext}` : ''}`;

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
    signal,
  }));
  const parsed = parseAiJson<GeneratedDocumentJson>(raw);
  const content: PDFContentStructure = ensureGeneratedContentBelongsToPlan({
    title: valueToString(parsed.title, title || 'Generated Document'),
    sections: (Array.isArray(parsed.sections) ? parsed.sections : []).map((item: GeneratedSectionJson, index: number) => ({
      id: valueToString(item.id, section.id || `section-${index + 1}`),
      heading: valueToString(item.heading, section.heading),
      content: valueToString(item.content, ''),
      type: isSectionType(item.type) ? item.type : 'paragraph',
      pageCount,
      style: item.style && typeof item.style === 'object' ? item.style as ContentSection['style'] : section.style,
      items: Array.isArray(item.items) ? item.items.map((value) => valueToString(value, '')) : undefined,
      rows: normalizeRows(item.rows),
    })),
  }, section);

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
      signal,
    });
  }

  const normalized = ensureGeneratedContentBelongsToPlan(normalizeDocumentContent(content), section);
  assertGeneratedSectionUsable(normalized, section, documentKind);
  return normalized;
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
  memoryContext,
  searchContext,
  onChunk,
  signal,
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
  section: StreamSection;
  previousSections: Array<{ heading?: string; content: string }>;
  memoryContext?: string;
  searchContext?: string;
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
}): Promise<PDFContentStructure> {
  const minimumWords = minimumWordsForSection(section, pageCount);
  const chunkCount = Math.max(1, Math.min(6, Math.ceil(pageCount / 2)));
  const wordsPerChunk = Math.max(220, Math.round(minimumWords / chunkCount));
  const chunks: string[] = [];

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    if (signal?.aborted) {
      throw new Error('Document generation was interrupted. Resume the job to continue from the last saved section.');
    }

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
      memoryContext ? `Known user memory, only if relevant:\n${memoryContext}` : '',
      searchContext ? `Fresh research context, use accurately where relevant:\n${searchContext}` : '',
    ].filter(Boolean).join('\n');

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
      signal,
    }));

    const cleaned = cleanPlainGeneratedChunk(raw);
    if (cleaned) {
      chunks.push(cleaned);
    }
  }

  const content: PDFContentStructure = {
    title: title || 'Generated Document',
    sections: [{
      id: section.id,
      heading: section.heading,
      content: chunks.join('\n\n').trim(),
      type: 'paragraph',
      pageCount,
      style: section.style,
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
      signal,
    });
  }

  const normalized = ensureGeneratedContentBelongsToPlan(normalizeDocumentContent(content), section);
  assertGeneratedSectionUsable(normalized, section, documentKind);
  return normalized;
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
  signal,
}: {
  apiKey: string;
  endpoint: string;
  model: string;
  thinkingMode: boolean;
  content: PDFContentStructure;
  section: StreamSection;
  pageCount: number;
  documentPrompt: string;
  title?: string;
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
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
      signal,
    }));

    const appendix = cleanPlainGeneratedChunk(parseAppendixContent(appendixRaw));
    if (!appendix.trim()) break;

    mainSection.content = [mainSection.content, appendix.trim()].filter(Boolean).join('\n\n');
    currentWords = countWords(getSectionTextForLength(mainSection));
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

function valueToString(value: unknown, fallback: string) {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function isSectionType(value: unknown): value is ContentSection['type'] {
  return value === 'paragraph' || value === 'list' || value === 'table';
}

function normalizeRows(value: unknown): string[][] | undefined {
  if (!Array.isArray(value)) return undefined;

  const rows = value
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => row.map((cell) => valueToString(cell, '')));

  return rows.length > 0 ? rows : undefined;
}

function stripThinkingContent(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

function parseAppendixContent(raw: string) {
  try {
    const parsed = parseAiJson(raw);
    return String(parsed.content || parsed.appendix || parsed.text || '');
  } catch {
    return raw.replace(/```json\s*/g, '').replace(/```/g, '').trim();
  }
}

function minimumWordsForSection(section: StreamSection, pageCount: number) {
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

function getSectionTextForLength(section: ContentSection) {
  if (section.type === 'list' && section.items?.length) {
    return [section.content, ...section.items].filter(Boolean).join('\n');
  }

  if (section.type === 'table' && section.rows?.length) {
    return section.rows.flat().join(' ');
  }

  return String(section.content || '');
}

function sectionBelongsToPlan(section: ContentSection, plan: StreamSection) {
  const sectionId = String(section.id || '');
  const planId = String(plan.id || '');
  const sectionHeading = String(section.heading || '').trim().toLowerCase();
  const planHeading = String(plan.heading || '').trim().toLowerCase();

  return (
    sectionId === planId ||
    Boolean(planId && sectionId.startsWith(`${planId}-table-`)) ||
    Boolean(sectionHeading && planHeading && sectionHeading === planHeading)
  );
}

function ensureGeneratedContentBelongsToPlan(content: PDFContentStructure, plan: StreamSection): PDFContentStructure {
  const sections = content.sections || [];

  if (sections.some((section) => sectionBelongsToPlan(section, plan))) {
    return content;
  }

  const firstNonTableIndex = sections.findIndex((section) => section.type !== 'table');
  const targetIndex = firstNonTableIndex >= 0 ? firstNonTableIndex : 0;

  return {
    ...content,
    sections: sections.map((section, index) => (
      index === targetIndex
        ? { ...section, id: plan.id, heading: section.type === 'table' ? section.heading : (section.heading || plan.heading) }
        : section
    )),
  };
}

function hasUsableSectionContent(section: ContentSection) {
  if (section.type === 'table' && section.rows?.length && section.rows.length > 1) {
    return section.rows.some((row) => row.some((cell) => String(cell || '').trim()));
  }

  return countWords(getSectionTextForLength(section)) >= 35;
}

function assertGeneratedSectionUsable(content: PDFContentStructure, plan: StreamSection, documentKind: string) {
  const sections = content.sections.filter((section) => sectionBelongsToPlan(section, plan));

  if (sections.length === 0) {
    throw new Error(`The generated section "${plan.heading}" did not include usable content.`);
  }

  if (documentKind === 'excel' || documentKind === 'presentation') {
    return;
  }

  if (!sections.some(hasUsableSectionContent)) {
    throw new Error(`The generated section "${plan.heading}" was too empty to save.`);
  }
}

function isSavedPlanComplete(plan: StreamSection, savedSections: ContentSection[], documentKind: string) {
  const matchingSections = savedSections.filter((section) => sectionBelongsToPlan(section, plan));

  if (matchingSections.length === 0) {
    return false;
  }

  if (documentKind === 'excel' || documentKind === 'presentation') {
    return true;
  }

  return matchingSections.some(hasUsableSectionContent);
}

function getResumeContent(savedSections: ContentSection[], plans: StreamSection[], documentKind: string) {
  const completedPlanIds = new Set<string>();
  const completedSections: ContentSection[] = [];

  for (const plan of plans) {
    if (!isSavedPlanComplete(plan, savedSections, documentKind)) {
      continue;
    }

    completedPlanIds.add(plan.id);
    completedSections.push(...savedSections.filter((section) => sectionBelongsToPlan(section, plan)));
  }

  return { completedPlanIds, completedSections };
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

      if (
        (error instanceof Error && error.name === 'AbortError') ||
        (error instanceof Error && error.message.includes('interrupted'))
      ) {
        throw error;
      }

      if (attempt >= maxAttempts) {
        break;
      }

      await onRetry?.(attempt + 1, error);
      await wait(Math.min(5000, 900 * attempt));
    }
  }

  throw lastError;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function collectResponsesText({
  apiKey,
  endpoint,
  model,
  messages,
  thinkingMode,
  pageCount,
  onChunk,
  signal,
}: {
  apiKey: string;
  endpoint: string;
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  thinkingMode: boolean;
  pageCount: number;
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
}) {
  const response = await fetch(getResponsesEndpoint(endpoint), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    signal,
    body: JSON.stringify({
      model,
      input: messages,
      stream: true,
      max_output_tokens: pageCount >= 10 ? 24576 : 16384,
      temperature: 0.6,
      top_p: 0.8,
      ...(supportsChatTemplateKwargs(endpoint)
        ? { chat_template_kwargs: { enable_thinking: thinkingMode } }
        : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Upstream AI API request failed: ${response.status} ${response.statusText}`);
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
      if (signal?.aborted) {
        throw new Error('Document generation was interrupted. Resume the job to continue from the last saved section.');
      }

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

export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireCurrentUser();
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const apiKey = process.env.API_KEY;
  const endpoint = process.env.API_ENDPOINT;
  const model = process.env.MODEL;

  if (!apiKey || !endpoint || !model) {
    return NextResponse.json({ error: 'API configuration is missing' }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as StreamRequest;
  const sections = (body.sections || []).filter((section) => section.include);
  const savedJob = body.jobId ? await getDocumentJob(user.id, body.jobId) : null;
  const memoryContext = await getUserMemoryContext(user.id).catch(() => '');
  const normalizedSavedContent = savedJob?.content?.sections?.length ? normalizeDocumentContent(savedJob.content) : null;
  const rawInitialContent = normalizedSavedContent?.sections?.length ? normalizedSavedContent.sections : [];
  const resumeContent = getResumeContent(rawInitialContent, sections, body.documentKind || 'document');
  const initialContent = resumeContent.completedSections;
  const completedPlanIds = resumeContent.completedPlanIds;
  const remainingSections = sections.filter((section) => !completedPlanIds.has(section.id));

  if (!body.prompt?.trim() || sections.length === 0) {
    return NextResponse.json({ error: 'Prompt and at least one included section are required' }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const events = createSafeEventSender(controller);
      const completedSections: PDFContentStructure['sections'] = [...initialContent];
      const allSectionSources: SectionSource[] = [];

      try {
        if (body.jobId) {
          await updateDocumentJob(user.id, body.jobId, {
            status: 'generating',
            progress: {
              completed: completedPlanIds.size,
              total: sections.length,
              percent: Math.round((completedPlanIds.size / sections.length) * 100),
              activeSectionId: null,
            },
            error: null,
          });
        }

        events.send('progress', {
          completed: completedPlanIds.size,
          total: sections.length,
          percent: Math.round((completedPlanIds.size / sections.length) * 100),
        });

        for (const section of remainingSections) {
          if (request.signal.aborted) {
            throw new Error('Document generation was interrupted. Resume the job to continue from the last saved section.');
          }

          const index = sections.findIndex((item) => item.id === section.id);

          events.send('section_started', {
            index,
            total: sections.length,
            section,
          });

          // Search for this section if it needs search and search is enabled
          let sectionSearchSources: SearchSource[] = [];
          let sectionSearchContext = '';
          if (body.enableSearch && section.needsSearch) {
            events.send('section_searching', {
              index,
              sectionId: section.id,
              sectionHeading: section.heading,
            });
            sectionSearchSources = await searchForContext(
              `${section.heading} ${section.summary}`.trim(),
              { count: 6, academic: true, freshness: 'py' }
            ).catch((error) => {
              console.error(`[Document Generation] Brave search failed for section "${section.heading}":`, error);
              return [];
            });
            sectionSearchContext = formatSearchContext(sectionSearchSources);
            // Store section sources
            allSectionSources.push({
              sectionId: section.id,
              sectionHeading: section.heading,
              sources: sectionSearchSources,
            });
            events.send('section_search_complete', {
              index,
              sectionId: section.id,
              sourceCount: sectionSearchSources.length,
            });
          }

          if (body.jobId) {
            await updateDocumentJob(user.id, body.jobId, {
              status: 'generating',
              progress: {
                completed: completedPlanIds.size,
                total: sections.length,
                percent: Math.round((completedPlanIds.size / sections.length) * 100),
                activeSectionId: section.id,
              },
            });
          }

          const content = await withRetries(
            () => generateDocumentSection({
              apiKey,
              endpoint,
              model,
              documentPrompt: body.prompt,
              title: body.title,
              thinkingMode: Boolean(body.thinkingMode),
              pageCount: Math.min(10, Math.max(1, Number(section.pageCount) || 1)),
              documentKind: body.documentKind || 'document',
              exportFormat: body.exportFormat || 'pdf',
              templateId: body.templateId || savedJob?.templateId || 'executive',
              section,
              previousSections: completedSections,
              memoryContext,
              searchContext: sectionSearchContext,
              signal: request.signal,
              onChunk: (chunk) => events.send('section_delta', {
                index,
                sectionId: section.id,
                chunk,
              }),
            }),
            SECTION_MAX_ATTEMPTS,
            async (attempt, error) => {
              events.send('section_retry', {
                index,
                sectionId: section.id,
                attempt,
                maxAttempts: SECTION_MAX_ATTEMPTS,
                error: error instanceof Error ? error.message : 'Section generation failed',
              });

              if (body.jobId) {
                await updateDocumentJob(user.id, body.jobId, {
                  status: 'generating',
                  progress: {
                    completed: completedPlanIds.size,
                    total: sections.length,
                    percent: Math.round((completedPlanIds.size / sections.length) * 100),
                    activeSectionId: section.id,
                  },
                  error: `Retrying "${section.heading}" (${attempt}/${SECTION_MAX_ATTEMPTS})`,
                });
              }
            }
          );

          completedSections.push(...content.sections);
          completedPlanIds.add(section.id);

          if (body.jobId) {
            await updateDocumentJob(user.id, body.jobId, {
              status: completedPlanIds.size >= sections.length ? 'editing' : 'generating',
              content: {
                title: body.title || savedJob?.title || 'Generated Document',
                sections: withSources({ title: body.title || savedJob?.title || 'Generated Document', sections: completedSections }, allSectionSources).sections,
                sources: allSectionSources.flatMap(ss => ss.sources),
              },
              progress: {
                completed: completedPlanIds.size,
                total: sections.length,
                percent: Math.round((completedPlanIds.size / sections.length) * 100),
                activeSectionId: null,
              },
            });
          }

          events.send('section_completed', {
            index,
            total: sections.length,
            section,
            content,
          });

          events.send('progress', {
            completed: completedPlanIds.size,
            total: sections.length,
            percent: Math.round((completedPlanIds.size / sections.length) * 100),
          });
        }

        if (body.jobId) {
          await updateDocumentJob(user.id, body.jobId, {
            status: 'editing',
            content: {
              title: body.title || savedJob?.title || 'Generated Document',
              sections: withSources({ title: body.title || savedJob?.title || 'Generated Document', sections: completedSections }, allSectionSources).sections,
              sources: allSectionSources.flatMap(ss => ss.sources),
            },
            progress: {
              completed: sections.length,
              total: sections.length,
              percent: 100,
              activeSectionId: null,
            },
            error: null,
          });
        }

        events.send('completed', {
          content: {
            title: body.title || 'Generated Document',
            sections: withSources({ title: body.title || 'Generated Document', sections: completedSections }, allSectionSources).sections,
            sources: allSectionSources.flatMap(ss => ss.sources),
          },
        });
        events.close();
      } catch (error) {
        if (body.jobId) {
          await updateDocumentJob(user.id, body.jobId, {
            status: 'failed',
            content: {
              title: body.title || savedJob?.title || 'Generated Document',
              sections: withSources({ title: body.title || savedJob?.title || 'Generated Document', sections: completedSections }, allSectionSources).sections,
              sources: allSectionSources.flatMap(ss => ss.sources),
            },
            progress: {
              completed: completedPlanIds.size,
              total: sections.length,
              percent: Math.round((completedPlanIds.size / sections.length) * 100),
              activeSectionId: null,
            },
            error: error instanceof Error ? error.message : 'Document generation failed',
          });
        }

        events.send('error', {
          error: error instanceof Error ? error.message : 'Document generation failed',
        });
        events.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
