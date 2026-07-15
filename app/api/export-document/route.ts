import { NextRequest, NextResponse } from 'next/server';
import { existsSync } from 'fs';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import pptxgen from 'pptxgenjs';
import {
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { requireCurrentUser } from '@/lib/auth';
import { DocumentTemplateId, PDFContentStructure, SearchSource } from '@/types';
import { getPlainSectionText, normalizeDocumentContent, valueToText } from '@/utils/documentStructure';

type ExportFormat = 'pdf' | 'doc' | 'docx' | 'sheet' | 'presentation';

interface ExportRequest {
  content: PDFContentStructure;
  format: ExportFormat;
  filename?: string;
  templateId?: DocumentTemplateId;
  pageRange?: {
    min?: number;
    max?: number;
  };
  pageCount?: number;
}

interface ExportTheme {
  id: DocumentTemplateId;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  titleFontSize: number;
  headingFontSize: number;
  bodyFontSize: number;
}

const pdfTextWidthCache = new Map<string, number>();

function getCachedPdfTextWidth(doc: PDFKit.PDFDocument, text: string, font: string, fontSize: number) {
  const key = `${font}|${fontSize}|${text}`;
  const cached = pdfTextWidthCache.get(key);
  if (cached !== undefined) return cached;

  doc.font(font).fontSize(fontSize);
  const width = doc.widthOfString(text);

  if (pdfTextWidthCache.size > 8000) {
    pdfTextWidthCache.clear();
  }

  pdfTextWidthCache.set(key, width);
  return width;
}

export async function POST(request: NextRequest) {
  try {
    await requireCurrentUser();
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as ExportRequest;
    const content = normalizeDocumentContent(body.content);
    const filename = safeFilename(body.filename || content.title || 'document');
    const theme = getExportTheme(body.templateId || 'executive');

    if (!content.sections?.length) {
      return NextResponse.json({ error: 'Document content is empty' }, { status: 400 });
    }

    if (body.format === 'sheet') {
      const buffer = createWorkbook(content, theme);
      return fileResponse(buffer, `${filename}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }

    if (body.format === 'presentation') {
      const buffer = await createPresentation(content, theme);
      return fileResponse(buffer, `${filename}.pptx`, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    }

    if (body.format === 'doc' || body.format === 'docx') {
      const buffer = await createWordDocument(content, theme);
      return fileResponse(buffer, `${filename}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    }

    const pageBudget = clampExportPageBudget(body.pageRange, body.pageCount);
    const buffer = await createPdf(content, theme, pageBudget.max);
    return fileResponse(buffer, `${filename}.pdf`, 'application/pdf');
  } catch (error) {
    console.error('[Export Document Error]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Export failed' },
      { status: 500 }
    );
  }
}

function fileResponse(buffer: Buffer | Uint8Array, filename: string, contentType: string) {
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    },
  });
}

function getExportTheme(templateId: DocumentTemplateId): ExportTheme {
  const themes: Record<DocumentTemplateId, ExportTheme> = {
    executive: {
      id: 'executive',
      primary: '0F172A',
      secondary: '1E293B',
      accent: '2563EB',
      background: 'F8FAFC',
      surface: 'FFFFFF',
      text: '111827',
      muted: '64748B',
      titleFontSize: 34,
      headingFontSize: 20,
      bodyFontSize: 14,
    },
    research: {
      id: 'research',
      primary: '1F2937',
      secondary: '374151',
      accent: '7C3AED',
      background: 'F9FAFB',
      surface: 'FFFFFF',
      text: '111827',
      muted: '6B7280',
      titleFontSize: 30,
      headingFontSize: 18,
      bodyFontSize: 12,
    },
    modern: {
      id: 'modern',
      primary: '0F766E',
      secondary: '115E59',
      accent: 'F59E0B',
      background: 'ECFDF5',
      surface: 'FFFFFF',
      text: '0F172A',
      muted: '475569',
      titleFontSize: 36,
      headingFontSize: 22,
      bodyFontSize: 15,
    },
    academic: {
      id: 'academic',
      primary: '111827',
      secondary: '4B5563',
      accent: '991B1B',
      background: 'FFFFFF',
      surface: 'F9FAFB',
      text: '111827',
      muted: '6B7280',
      titleFontSize: 28,
      headingFontSize: 17,
      bodyFontSize: 11,
    },
    dashboard: {
      id: 'dashboard',
      primary: '172554',
      secondary: '1D4ED8',
      accent: '10B981',
      background: 'EFF6FF',
      surface: 'FFFFFF',
      text: '0F172A',
      muted: '475569',
      titleFontSize: 32,
      headingFontSize: 19,
      bodyFontSize: 13,
    },
    pitch: {
      id: 'pitch',
      primary: '18181B',
      secondary: '27272A',
      accent: 'E11D48',
      background: 'FFF1F2',
      surface: 'FFFFFF',
      text: '18181B',
      muted: '71717A',
      titleFontSize: 40,
      headingFontSize: 24,
      bodyFontSize: 16,
    },
  };

  return themes[templateId] || themes.executive;
}

function createWorkbook(content: PDFContentStructure, theme: ExportTheme) {
  const workbook = XLSX.utils.book_new();
  const summaryRows = [['Section', 'Content']];
  let tableIndex = 1;

  for (const section of content.sections) {
    if (section.type === 'table' && section.rows?.length) {
      const sheet = rowsToFormulaSheet(section.rows, theme);
      const name = safeSheetName(section.heading || `Table ${tableIndex}`);
      XLSX.utils.book_append_sheet(workbook, sheet, name);
      tableIndex += 1;
    } else {
      summaryRows.push([section.heading || '', getPlainSectionText(section)]);
    }
  }

  XLSX.utils.book_append_sheet(workbook, rowsToFormulaSheet(summaryRows, theme), 'Content');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function rowsToFormulaSheet(rows: string[][], theme: ExportTheme) {
  const sheet = XLSX.utils.aoa_to_sheet(rows.map((row) => row.map((cell) => {
    const value = String(cell ?? '').trim();
    if (/^=/.test(value)) {
      return { f: value.slice(1), s: formulaCellStyle(theme) };
    }

    return { v: cell, s: bodyCellStyle(theme) };
  })));

  sheet['!cols'] = inferColumnWidths(rows);
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(0, rows.length - 1), c: Math.max(0, ...rows.map((row) => row.length - 1)) },
  }) };
  styleHeaderRow(sheet, rows, theme);
  return sheet;
}

function styleHeaderRow(sheet: XLSX.WorkSheet, rows: string[][], theme: ExportTheme) {
  if (!rows.length) return;

  rows[0].forEach((_, columnIndex) => {
    const address = XLSX.utils.encode_cell({ r: 0, c: columnIndex });
    if (sheet[address]) {
      sheet[address].s = headerCellStyle(theme);
    }
  });
}

function headerCellStyle(theme: ExportTheme) {
  return {
    font: { bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: theme.primary } },
    alignment: { vertical: 'center', wrapText: true },
  };
}

function bodyCellStyle(_theme: ExportTheme) {
  return {
    alignment: { vertical: 'top', wrapText: true },
  };
}

function formulaCellStyle(theme: ExportTheme) {
  return {
    font: { color: { rgb: theme.accent }, bold: true },
    alignment: { vertical: 'top', wrapText: true },
    numFmt: '0.00',
  };
}

function inferColumnWidths(rows: string[][]) {
  const columnCount = Math.max(1, ...rows.map((row) => row.length));

  return Array.from({ length: columnCount }, (_, columnIndex) => {
    const maxLength = Math.max(
      10,
      ...rows.map((row) => String(row[columnIndex] || '').length)
    );

    return { wch: Math.min(42, maxLength + 2) };
  });
}

async function createPresentation(content: PDFContentStructure, theme: ExportTheme) {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'AI Chat';
  pptx.subject = content.title || 'Generated presentation';
  pptx.title = content.title || 'Presentation';
  pptx.company = 'AI Chat';
  pptx.theme = {
    headFontFace: 'Aptos Display',
    bodyFontFace: 'Aptos',
  };

  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: theme.primary };
  titleSlide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 6.55,
    w: 13.33,
    h: 0.95,
    fill: { color: theme.accent },
    line: { color: theme.accent },
  });
  titleSlide.addText(content.title || 'Presentation', {
    x: 0.8,
    y: 2.0,
    w: 11.7,
    h: 1.25,
    fontSize: theme.titleFontSize,
    bold: true,
    color: 'FFFFFF',
    fit: 'shrink',
  });
  titleSlide.addText('Generated document deck', {
    x: 0.85,
    y: 3.35,
    w: 10.8,
    h: 0.4,
    fontSize: 16,
    color: 'E5E7EB',
    fit: 'shrink',
  });

  for (const [sectionIndex, section] of content.sections.entries()) {
    const slide = pptx.addSlide();
    slide.background = { color: theme.background };
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 13.33,
      h: 0.18,
      fill: { color: theme.accent },
      line: { color: theme.accent },
    });
    slide.addText(String(sectionIndex + 1).padStart(2, '0'), {
      x: 0.55,
      y: 0.32,
      w: 0.6,
      h: 0.34,
      fontSize: 11,
      bold: true,
      color: theme.accent,
      margin: 0,
    });
    slide.addText(section.heading || '', {
      x: 1.18,
      y: 0.26,
      w: 11.3,
      h: 0.65,
      fontSize: theme.headingFontSize,
      bold: true,
      color: theme.text,
      fit: 'shrink',
    });

    if (section.type === 'table' && section.rows?.length) {
      const tableRows = section.rows.map((row) => row.map((cell) => ({ text: String(cell || '') })));
      slide.addTable(tableRows, {
        x: 0.55,
        y: 1.15,
        w: 12.2,
        h: 5.95,
        fontFace: 'Aptos',
        fontSize: theme.id === 'pitch' ? 11 : 9,
        border: { color: 'CBD5E1', pt: 1 },
        color: theme.text,
        fill: { color: theme.surface },
        margin: 0.05,
      });
    } else {
      const bullets = toSlideBullets(getPlainSectionText(section)).slice(0, 6);
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.65,
        y: 1.18,
        w: 12.0,
        h: 5.75,
        fill: { color: theme.surface },
        line: { color: 'E2E8F0', transparency: 20 },
      });
      slide.addText(bullets.join('\n'), {
        x: 1.05,
        y: 1.48,
        w: 10.9,
        h: 5.05,
        fontSize: theme.bodyFontSize + (theme.id === 'pitch' ? 3 : 1),
        color: theme.text,
        breakLine: false,
        fit: 'shrink',
        bullet: { type: 'bullet' },
        paraSpaceAfter: 12,
      });
    }

    slide.addText(content.title || 'AI Chat', {
      x: 0.55,
      y: 7.08,
      w: 8,
      h: 0.22,
      fontSize: 8,
      color: theme.muted,
      margin: 0,
    });
  }

  return await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
}

async function createWordDocument(content: PDFContentStructure, theme: ExportTheme) {
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      children: [new TextRun({ text: content.title || 'Document', bold: true, color: theme.primary, size: 48 })],
      heading: HeadingLevel.TITLE,
    }),
  ];

  for (const section of content.sections) {
    if (section.heading && section.type !== 'table') {
      children.push(new Paragraph({
        children: [new TextRun({ text: section.heading, bold: true, color: theme.primary, size: 30 })],
        heading: HeadingLevel.HEADING_1,
      }));
    }

    if (section.type === 'table' && section.rows?.length) {
      children.push(createDocxTable(section.rows));
      continue;
    }

    for (const paragraph of getTextBlocks(getPlainSectionText(section), true)) {
      children.push(new Paragraph({
        children: markdownToTextRuns(paragraph),
        spacing: { after: 180 },
      }));
    }
  }

  const document = new Document({
    sections: [{ children }],
  });

  return Packer.toBuffer(document);
}

function createDocxTable(rows: string[][]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((row, rowIndex) => new TableRow({
      children: row.map((cell) => new TableCell({
        children: [
          new Paragraph({
            children: rowIndex === 0
              ? [new TextRun({ text: cell, bold: true })]
              : markdownToTextRuns(cell),
          }),
        ],
      })),
    })),
  });
}

async function createPdf(content: PDFContentStructure, theme: ExportTheme, maxPages?: number) {
  pdfTextWidthCache.clear();
  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
  const pdfContent = content;
  registerPdfFonts(doc);
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));

  const done = new Promise<Buffer>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('PDF export timed out while finalizing'));
    }, 60_000);

    doc.on('end', () => {
      clearTimeout(timeout);
      resolve(Buffer.concat(chunks));
    });
    doc.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  try {
    writePdfText(doc, pdfContent.title || 'Document', {
      fontSize: theme.id === 'pitch' ? 26 : 22,
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      align: 'center',
      color: theme.primary,
    });
    doc.moveDown(1.2);

    for (const [index, section] of pdfContent.sections.entries()) {
      renderStrictPdfSection(doc, section, index === 0, theme, pdfContent.sources || []);
    }

    doc.end();
  } catch (error) {
    doc.end();
    throw error;
  }

  return done;
}

function clampExportPageBudget(pageRange?: ExportRequest['pageRange'], fallbackPageCount?: unknown) {
  const fallback = Number(fallbackPageCount);
  const fallbackMax = Number.isFinite(fallback) ? Math.round(fallback) : undefined;
  const requestedMax = Number(pageRange?.max ?? fallbackMax);
  const max = Math.min(100, Math.max(1, Number.isFinite(requestedMax) ? Math.round(requestedMax) : 12));
  const requestedMin = Number(pageRange?.min ?? Math.min(max, fallbackMax || max));
  const min = Math.min(max, Math.max(1, Number.isFinite(requestedMin) ? Math.round(requestedMin) : 1));
  return { min, max };
}

function constrainContentToEstimatedPageBudget(content: PDFContentStructure, maxPages?: number): PDFContentStructure {
  const totalTargetPages = maxPages || content.sections.reduce((sum, section) => (
    sum + Math.max(1, Math.min(10, Number(section.pageCount) || 1))
  ), 0);

  if (totalTargetPages <= 0) return content;

  const sectionBudget = allocateSectionWordBudgets(content.sections, totalTargetPages);
  const constrainedSections = content.sections
    .map((section, index) => constrainSectionToPageBudget(section, sectionBudget[index]))
    .filter((section) => !isEmptyConstrainedSection(section));

  return {
    ...content,
    sections: constrainedSections,
    sources: maxPages && maxPages <= 5 ? (content.sources || []).slice(0, 4) : content.sources,
  };
}

function allocateSectionWordBudgets(sections: PDFContentStructure['sections'], totalTargetPages: number) {
  const sourcesReserve = sections.some(isSourcesSection) && totalTargetPages <= 5 ? 160 : 0;
  const totalWords = Math.max(300, totalTargetPages * 320 - sourcesReserve);
  const weightedSections = sections.map((section) => ({
    section,
    weight: isSourcesSection(section) ? (totalTargetPages <= 5 ? 0.35 : 0.8) : Math.max(1, Math.min(10, Number(section.pageCount) || 1)),
  }));
  const totalWeight = weightedSections.reduce((sum, item) => sum + item.weight, 0) || 1;

  return weightedSections.map(({ section, weight }) => {
    if (section.type === 'table') return Math.max(80, Math.round((totalWords * weight) / totalWeight));
    if (isSourcesSection(section)) return totalTargetPages <= 5 ? 180 : Math.max(220, Math.round((totalWords * weight) / totalWeight));
    return Math.max(140, Math.round((totalWords * weight) / totalWeight));
  });
}

function constrainSectionToPageBudget(section: PDFContentStructure['sections'][number], maxWordsOverride?: number) {
  if (section.type === 'table' || isSourcesSection(section)) {
    return constrainTableOrSourcesSection(section, maxWordsOverride);
  }

  const pageCount = Math.max(1, Math.min(10, Number(section.pageCount) || 1));
  const density = section.style?.density || 'normal';
  const maxWordsPerPage = density === 'compact' ? 620 : density === 'spacious' ? 420 : 540;
  const maxWords = maxWordsOverride || Math.max(180, pageCount * maxWordsPerPage);
  const text = getPlainSectionText(section, true);

  if (countBudgetWords(text) <= maxWords) {
    return section;
  }

  return {
    ...section,
    content: truncateTextByWords(text, maxWords),
    items: section.items?.length ? truncateListItems(section.items, Math.max(8, Math.round(maxWords / 45))) : section.items,
    style: {
      ...(section.style || {}),
      density: 'compact' as const,
      bodyFontSize: Math.min(Number(section.style?.bodyFontSize) || 10, 10),
      lineGap: Math.min(Number(section.style?.lineGap) || 1.5, 1.5),
      spacingAfter: Math.min(Number(section.style?.spacingAfter) || 4, 4),
    },
  };
}

function constrainTableOrSourcesSection(section: PDFContentStructure['sections'][number], maxWords = 180) {
  if (section.type === 'table' && section.rows?.length) {
    const maxRows = Math.max(3, Math.min(section.rows.length, Math.floor(maxWords / 28)));
    return { ...section, rows: section.rows.slice(0, maxRows) };
  }

  if (isSourcesSection(section)) {
    return {
      ...section,
      content: truncateTextByWords(valueToText(section.content), maxWords),
      style: {
        ...(section.style || {}),
        density: 'compact' as const,
        bodyFontSize: Math.min(Number(section.style?.bodyFontSize) || 9, 9),
        lineGap: 0,
        spacingAfter: 2,
      },
    };
  }

  return section;
}

function isEmptyConstrainedSection(section: PDFContentStructure['sections'][number]) {
  if (section.type === 'table') return !section.rows?.length;
  return !valueToText(section.content).trim() && !section.items?.length;
}

function getBufferedPdfPageCount(doc: PDFKit.PDFDocument) {
  const buffered = doc.bufferedPageRange();
  return buffered.start + buffered.count;
}

function countBudgetWords(text: string) {
  const latinWords = text.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?/g) || [];
  const arabicWords = text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+/g) || [];
  return latinWords.length + arabicWords.length;
}

function truncateTextByWords(text: string, _maxWords: number) {
  return text;
}

function truncateListItems(items: string[], maxItems: number) {
  return items.slice(0, maxItems).map((item) => truncateTextByWords(valueToText(item), 80));
}

function renderStrictPdfSection(
  doc: PDFKit.PDFDocument,
  section: PDFContentStructure['sections'][number],
  isFirstSection: boolean,
  theme: ExportTheme,
  allSources: SearchSource[]
) {
  const pageCount = Math.max(1, Math.min(10, Number(section.pageCount) || 1));
  const style = fitSectionStyleToPageBudget(doc, section, getSectionStyle(section), pageCount);
  const isInlineExtractedTable = section.type === 'table' && /-table-\d+$/.test(String(section.id || ''));

  placePdfSectionStart(doc, section, style, isFirstSection, isInlineExtractedTable, theme);

  renderSectionBody(doc, section, style, theme, allSources);
}

function placePdfSectionStart(
  doc: PDFKit.PDFDocument,
  section: PDFContentStructure['sections'][number],
  style: ReturnType<typeof getSectionStyle>,
  isFirstSection: boolean,
  isInlineExtractedTable: boolean,
  theme: ExportTheme
) {
  const estimatedHeight = estimateSectionHeight(doc, section, style);
  const remainingHeight = getPdfRemainingHeight(doc);
  const pageHeight = getPdfUsableHeight(doc);
  const compactGap = isInlineExtractedTable ? 8 : 18;
  const minimumCleanStart = Math.min(
    pageHeight * 0.35,
    Math.max(110, Math.min(estimatedHeight + compactGap, 190))
  );

  if (isFirstSection) {
    ensurePdfSpace(doc, Math.min(estimatedHeight, 160));
    return;
  }

  if (remainingHeight < minimumCleanStart) {
    doc.addPage();
    return;
  }

  if (isInlineExtractedTable) {
    doc.y += 6;
    return;
  }

  addPdfSectionSeparator(doc, theme, compactGap);
}

function addPdfSectionSeparator(doc: PDFKit.PDFDocument, theme: ExportTheme, gap: number) {
  ensurePdfSpace(doc, gap + 28);
  doc.moveDown(0.45);
  const x = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc
    .strokeColor(`#${theme.accent}`)
    .lineWidth(0.6)
    .opacity(0.32)
    .moveTo(x, doc.y)
    .lineTo(x + width, doc.y)
    .stroke()
    .opacity(1);

  doc.y += Math.max(8, gap - 6);
  resetPdfTextState(doc);
}

function renderSectionBody(
  doc: PDFKit.PDFDocument,
  section: PDFContentStructure['sections'][number],
  style: ReturnType<typeof getSectionStyle>,
  theme: ExportTheme,
  allSources: SearchSource[]
) {
  const headingIsRtl = isMostlyArabic(valueToText(section.heading));

  if (section.heading && section.type !== 'table') {
    const headingHeight = doc.fontSize(style.headingFontSize).heightOfString(section.heading, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 12,
      lineGap: 0,
    });
    const barHeight = Math.max(style.headingFontSize + 6, headingHeight);
    const barY = doc.y + Math.max(0, (headingHeight - barHeight) / 2);
    const accentX = headingIsRtl
      ? doc.page.width - doc.page.margins.right - 4
      : doc.page.margins.left;
    const headingWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right - 12;
    const headingX = headingIsRtl
      ? doc.page.margins.left
      : doc.page.margins.left + 12;

    doc.rect(accentX, barY, 4, barHeight)
      .fill(`#${theme.accent}`);
    doc.fillColor('#111827');
    writePdfTextWithScript(doc, section.heading, {
      fontSize: style.headingFontSize,
      width: headingWidth,
      x: headingX,
      y: doc.y,
      color: theme.primary,
    });
    doc.moveDown(style.density === 'compact' ? 0.25 : 0.45);
  }

  if (isSourcesSection(section)) {
    drawPdfSourcesSection(doc, section, style, theme, allSources);
    doc.moveDown(style.spacingAfter / 10);
    return;
  }

  if (section.type === 'table' && section.rows?.length) {
    drawPdfTable(doc, section.rows, style.tableFontSize);
    resetPdfTextState(doc);
    doc.moveDown(style.spacingAfter / 10);
    return;
  }

  if (section.style?.layout === 'two-column') {
    drawTwoColumnText(doc, getPlainSectionText(section, true), style);
    doc.moveDown(style.spacingAfter / 10);
    return;
  }

  drawStructuredPdfText(doc, getPlainSectionText(section, true), style);
  doc.moveDown(style.spacingAfter / 10);
}

function isSourcesSection(section: PDFContentStructure['sections'][number]) {
  return section.id === 'sources' || valueToText(section.heading).trim() === 'Sources';
}

function formatSourceDisplayUrl(url: string) {
  try {
    const parsed = new URL(url);
    const decodedPath = decodeURI(parsed.pathname || '/');
    const compact = `${parsed.hostname}${decodedPath === '/' ? '' : decodedPath}`;
    return compact.length > 64 ? `${compact.slice(0, 61)}...` : compact;
  } catch {
    return url.length > 64 ? `${url.slice(0, 61)}...` : url;
  }
}

function normalizeSourceKey(url: string) {
  return url.toLowerCase().replace(/\/$/, '');
}

function dedupeSources(sources: SearchSource[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = normalizeSourceKey(source.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseSourcesSectionText(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const introLines: string[] = [];
  const groups: Array<{
    sectionHeading?: string;
    title: string;
    url?: string;
    publishedDate?: string;
    accessedAt?: string;
  }> = [];

  let index = 0;
  while (index < lines.length && !lines[index].startsWith('## ')) {
    introLines.push(lines[index]);
    index += 1;
  }

  let currentSectionHeading: string | undefined;

  while (index < lines.length) {
    const line = lines[index];

    if (line.startsWith('## ')) {
      currentSectionHeading = line.replace(/^##\s+/, '').trim();
      index += 1;
      continue;
    }

    const titleMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (!titleMatch) {
      index += 1;
      continue;
    }

    const entry = {
      sectionHeading: currentSectionHeading,
      title: titleMatch[2].trim(),
      url: undefined as string | undefined,
      publishedDate: undefined as string | undefined,
      accessedAt: undefined as string | undefined,
    };

    index += 1;

    while (index < lines.length && !/^\d+\.\s+/.test(lines[index]) && !lines[index].startsWith('## ')) {
      const detail = lines[index];
      if (/^https?:\/\//i.test(detail)) {
        entry.url = detail;
      } else if (/^- Date:\s*/i.test(detail)) {
        entry.publishedDate = detail.replace(/^- Date:\s*/i, '').trim();
      } else if (/^- Accessed:\s*/i.test(detail)) {
        entry.accessedAt = detail.replace(/^- Accessed:\s*/i, '').trim();
      }
      index += 1;
    }

    groups.push(entry);
  }

  return {
    intro: introLines.join(' '),
    groups,
  };
}

function drawPdfSourcesSection(
  doc: PDFKit.PDFDocument,
  section: PDFContentStructure['sections'][number],
  style: ReturnType<typeof getSectionStyle>,
  theme: ExportTheme,
  allSources: SearchSource[]
) {
  const parsed = parseSourcesSectionText(getPlainSectionText(section, true));
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const contentX = doc.page.margins.left + 14;
  const contentWidth = Math.max(120, width - 14);
  const introText = allSources.length ? 'Sources used during research.' : parsed.intro;
  const sourceEntries = allSources.length
    ? dedupeSources(allSources).map((source, index) => ({
        index: index + 1,
        sectionHeading: undefined,
        title: source.title,
        url: source.url,
        displayUrl: source.displayUrl,
        publishedDate: source.publishedDate,
        accessedAt: source.accessedAt,
      }))
    : parsed.groups.map((group, index) => ({
        index: index + 1,
        ...group,
        displayUrl: undefined,
      }));

  if (introText) {
    writePdfText(doc, introText, {
      width,
      fontSize: style.bodyFontSize,
      lineGap: style.lineGap,
      color: theme.text,
    });
    doc.y += Math.max(6, style.paragraphGap);
  }

  for (const group of sourceEntries) {
    ensurePdfSpace(doc, 96);
    resetPdfTextState(doc);
    doc.fillColor(theme.text);

    if (group.sectionHeading) {
      writePdfText(doc, group.sectionHeading, {
        width: contentWidth,
        x: contentX,
        y: doc.y,
        fontSize: Math.max(style.bodyFontSize - 0.5, 10),
        font: 'Helvetica-Bold',
        color: theme.muted,
      });
      doc.y += 4;
    }

    writePdfTextWithScript(doc, `${group.index}. ${group.title}`, {
      width: contentWidth,
      x: contentX,
      y: doc.y,
      fontSize: style.bodyFontSize,
      font: 'Helvetica-Bold',
      lineGap: style.lineGap,
      color: theme.text,
    });
    doc.y += 4;

    if (group.url) {
      const urlLabel = group.displayUrl?.trim() || formatSourceDisplayUrl(group.url);

      writePdfTextWithScript(doc, urlLabel, {
        width: contentWidth,
        x: contentX,
        y: doc.y,
        fontSize: Math.max(style.bodyFontSize - 0.5, 10),
        lineGap: style.lineGap,
        color: '#1C7178',
        underline: true,
        link: group.url,
      });
      doc.y += 4;
    }

    resetPdfTextState(doc);

    if (group.publishedDate) {
      writePdfText(doc, `Published: ${group.publishedDate}`, {
        width: contentWidth,
        x: contentX,
        y: doc.y,
        fontSize: Math.max(style.bodyFontSize - 1, 9),
        lineGap: style.lineGap,
        color: theme.muted,
      });
      doc.y += 2;
    }

    if (group.accessedAt) {
      writePdfText(doc, `Accessed: ${group.accessedAt}`, {
        width: contentWidth,
        x: contentX,
        y: doc.y,
        fontSize: Math.max(style.bodyFontSize - 1, 9),
        lineGap: style.lineGap,
        color: theme.muted,
      });
      doc.y += 2;
    }

    doc.y += Math.max(12, style.paragraphGap + 4);
  }

  resetPdfTextState(doc);
}

function registerPdfFonts(doc: PDFKit.PDFDocument) {
  const regularArabicFont = findFont([
    process.env.ARABIC_FONT_REGULAR,
    process.env.PDF_ARABIC_FONT,
    'public/fonts/NotoSansArabic-Regular.ttf',
    'public/fonts/NotoNaskhArabic-Regular.ttf',
    '/usr/share/fonts/opentype/noto/NotoSansArabic-Regular.ttf',
    '/usr/share/fonts/opentype/noto/NotoNaskhArabic-Regular.ttf',
    '/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf',
    '/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/noto/NotoKufiArabic-Regular.ttf',
    '/usr/share/fonts/truetype/kacst/KacstOne.ttf',
    '/usr/share/fonts/truetype/kacst/KacstBook.ttf',
    'C:/Windows/Fonts/arial.ttf',
  ]);
  const boldArabicFont = findFont([
    process.env.ARABIC_FONT_BOLD,
    'public/fonts/NotoSansArabic-Bold.ttf',
    'public/fonts/NotoNaskhArabic-Bold.ttf',
    '/usr/share/fonts/opentype/noto/NotoSansArabic-Bold.ttf',
    '/usr/share/fonts/opentype/noto/NotoNaskhArabic-Bold.ttf',
    '/usr/share/fonts/truetype/noto/NotoSansArabic-Bold.ttf',
    '/usr/share/fonts/truetype/noto/NotoNaskhArabic-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/noto/NotoKufiArabic-Bold.ttf',
    'C:/Windows/Fonts/arialbd.ttf',
  ]);
  const mixedArabicFont = findFont([
    process.env.ARABIC_FONT_MIXED,
    process.env.PDF_ARABIC_MIXED_FONT,
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed.ttf',
    '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf',
    'C:/Windows/Fonts/arial.ttf',
    regularArabicFont,
  ]);

  if (regularArabicFont) {
    doc.registerFont('Arabic', regularArabicFont);
  }

  if (boldArabicFont) {
    doc.registerFont('Arabic-Bold', boldArabicFont);
  } else if (regularArabicFont) {
    doc.registerFont('Arabic-Bold', regularArabicFont);
  }

  if (mixedArabicFont) {
    doc.registerFont('Arabic-Mixed', mixedArabicFont);
  }
}

function findFont(candidates: Array<string | undefined>) {
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

function hasArabic(text: string) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text);
}

function hasLatinOrAscii(text: string) {
  return /[A-Za-z0-9()[\]{}.,:;!?/@#$%^&*_+=|\\<>"'-]/.test(text);
}

function countArabicChars(text: string) {
  return text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g)?.length || 0;
}

function countLatinChars(text: string) {
  return text.match(/[A-Za-z]/g)?.length || 0;
}

function isMostlyArabic(text: string) {
  const arabic = countArabicChars(text);
  const latin = countLatinChars(text);

  if (arabic === 0) return false;
  if (latin === 0) return true;

  return arabic >= latin;
}

function isSectionRtl(section: PDFContentStructure['sections'][number]) {
  const candidates = [
    valueToText(section.heading),
    getPlainSectionText(section, true),
    ...(section.rows?.flat() || []),
  ].map((value) => valueToText(value)).filter(Boolean);

  return isMostlyArabic(candidates.join(' '));
}

function isRtlTable(rows: string[][]) {
  return isMostlyArabic(rows.flat().map((cell) => valueToText(cell)).join(' '));
}

function makeBreakableText(text: string) {
  return text;
}

function splitArabicLineUnits(text: string) {
  const tokens = buildArabicRenderSegments(tokenizeBidiText(text));
  const units: string[] = [];
  let current = '';

  for (const token of tokens) {
    if (token.kind === 'space') {
      if (current) {
        units.push(current);
        current = '';
      }
      continue;
    }

    current += token.text;
  }

  if (current) {
    units.push(current);
  }

  return units.filter(Boolean);
}

function parsePdfScriptSegments(text: string) {
  const scriptPattern = /\{\{(sub|sup):([^}]+)\}\}/g;
  const segments: Array<{ text: string; script?: 'sub' | 'sup' }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = scriptPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) });
    }

    segments.push({ text: match[2], script: match[1] as 'sub' | 'sup' });
    lastIndex = scriptPattern.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) });
  }

  return segments.length ? segments : [{ text }];
}

function measurePdfInlineRun(
  doc: PDFKit.PDFDocument,
  text: string,
  font: string,
  fontSize: number
) {
  return parsePdfScriptSegments(text).reduce((width, segment) => {
    const segmentFontSize = segment.script ? fontSize * 0.65 : fontSize;
    return width + getCachedPdfTextWidth(doc, segment.text, font, segmentFontSize);
  }, 0);
}

function drawPdfInlineRun(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  options: {
    font: string;
    fontSize: number;
    color?: string;
    underline?: boolean;
    link?: string;
  }
) {
  let cursorX = x;

  for (const segment of parsePdfScriptSegments(text)) {
    const segmentFontSize = segment.script ? options.fontSize * 0.65 : options.fontSize;
    const yOffset = segment.script === 'sub'
      ? options.fontSize * 0.35
      : segment.script === 'sup'
        ? -(options.fontSize * 0.3)
        : 0;

    doc.font(options.font).fontSize(segmentFontSize).fillColor(options.color || '#111827');
    const segmentWidth = Math.max(0.01, getCachedPdfTextWidth(doc, segment.text, options.font, segmentFontSize));
    doc.text(segment.text, cursorX, y + yOffset, {
      lineBreak: false,
      width: segmentWidth + 1,
      height: segmentFontSize * 1.4,
      underline: options.underline,
      link: options.link,
    });
    cursorX += segmentWidth;
  }
}

function renderArabicVisualToken(text: string) {
  const usePresentationForms = process.env.PDF_ARABIC_PRESENTATION_FORMS === 'true';

  if (!hasArabic(text)) {
    return text;
  }

  return usePresentationForms ? shapeArabicToken(text) : text;
}

function mirrorBracketString(text: string) {
  return text
    .replace(/\(/g, '\uFFF0')
    .replace(/\)/g, '(')
    .replace(/\uFFF0/g, ')')
    .replace(/\[/g, '\uFFF1')
    .replace(/\]/g, '[')
    .replace(/\uFFF1/g, ']')
    .replace(/\{/g, '\uFFF2')
    .replace(/\}/g, '{')
    .replace(/\uFFF2/g, '}')
    .replace(/</g, '\uFFF3')
    .replace(/>/g, '<')
    .replace(/\uFFF3/g, '>');
}

function renderArabicVisualTokens(tokens: Array<{ kind: 'arabic' | 'latin' | 'space'; text: string }>) {
  return tokens.map((token, index) => {
    if (token.kind === 'space') {
      return token.text;
    }

    if (token.kind === 'latin' && /^[()[\]{}<>]+$/.test(token.text)) {
      let previousNonSpace: { kind: 'arabic' | 'latin' | 'space'; text: string } | undefined;
      let nextNonSpace: { kind: 'arabic' | 'latin' | 'space'; text: string } | undefined;

      for (let cursor = index - 1; cursor >= 0; cursor--) {
        if (tokens[cursor].kind !== 'space') {
          previousNonSpace = tokens[cursor];
          break;
        }
      }

      for (let cursor = index + 1; cursor < tokens.length; cursor++) {
        if (tokens[cursor].kind !== 'space') {
          nextNonSpace = tokens[cursor];
          break;
        }
      }

      const adjacentLatin = previousNonSpace?.kind === 'latin' || nextNonSpace?.kind === 'latin';
      return adjacentLatin ? token.text : mirrorBracketString(token.text);
    }

    return renderArabicVisualToken(token.text);
  });
}

function renderArabicRunText(text: string) {
  return shapeArabicForPdf(text);
}

function buildArabicPdfRuns(text: string) {
  const tokens = buildArabicRenderSegments(tokenizeBidiText(text));
  const runs: Array<{ kind: 'arabic' | 'latin'; text: string }> = [];

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];

    if (token.kind === 'latin') {
      runs.push({ kind: 'latin', text: renderArabicVisualTokens([token])[0] });
      continue;
    }

    let runText = token.text;

    while (index + 1 < tokens.length && tokens[index + 1].kind !== 'latin') {
      runText += tokens[index + 1].text;
      index += 1;
    }

    if (runText) {
      runs.push({ kind: 'arabic', text: renderArabicRunText(runText) });
    }
  }

  return runs.filter((run) => run.text.length > 0);
}

function isTerminalMixedPunctuation(text: string) {
  return /^[.,:;!?،؛]+$/.test(text);
}

function isOpenBracketToken(token: { kind: 'arabic' | 'latin' | 'space'; text: string } | undefined) {
  return token?.kind === 'latin' && /^[([{<]$/.test(token.text);
}

function isCloseBracketToken(token: { kind: 'arabic' | 'latin' | 'space'; text: string } | undefined) {
  return token?.kind === 'latin' && /^[)\]}>]$/.test(token.text);
}

function buildArabicRenderSegments(tokens: Array<{ kind: 'arabic' | 'latin' | 'space'; text: string }>) {
  const segments: Array<{ kind: 'arabic' | 'latin' | 'space'; text: string }> = [];

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];

    if (isOpenBracketToken(token) && tokens[index + 1]?.kind === 'latin') {
      let text = token.text;
      let cursor = index + 1;

      while (cursor < tokens.length) {
        const next = tokens[cursor];

        if (next.kind === 'arabic') {
          break;
        }

        text += next.text;

        if (isCloseBracketToken(next)) {
          cursor += 1;
          break;
        }

        cursor += 1;
      }

      segments.push({ kind: 'latin', text });
      index = cursor - 1;
      continue;
    }

    if (token.kind !== 'latin' || isTerminalMixedPunctuation(token.text)) {
      segments.push(token);
      continue;
    }

    let text = token.text;

    while (index + 1 < tokens.length) {
      const next = tokens[index + 1];
      const nextAfter = tokens[index + 2];

      if (next.kind === 'latin' && !isTerminalMixedPunctuation(next.text)) {
        text += next.text;
        index += 1;
        continue;
      }

      if (
        next.kind === 'space' &&
        nextAfter?.kind === 'latin' &&
        !isTerminalMixedPunctuation(nextAfter.text)
      ) {
        text += next.text + nextAfter.text;
        index += 2;
        continue;
      }

      break;
    }

    segments.push({ kind: 'latin', text });
  }

  return segments;
}

function renderArabicVisualLine(text: string) {
  if (!isMostlyArabic(text)) {
    return shapeArabicForPdf(makeBreakableText(text));
  }

  const tokens = buildArabicRenderSegments(tokenizeBidiText(text));
  return renderArabicVisualTokens(tokens).join('');
}

function measureArabicLogicalLineWidth(
  doc: PDFKit.PDFDocument,
  text: string,
  font: string,
  fontSize: number,
  requestedFont?: string
) {
  doc.font(font).fontSize(fontSize);

  if (!isMostlyArabic(text)) {
    return measurePdfInlineRun(doc, renderArabicVisualLine(text), font, fontSize);
  }

  const runs = buildArabicPdfRuns(text);

  return runs.reduce((total, run) => {
    const tokenFont = run.kind === 'arabic'
      ? font
      : getLatinFont(requestedFont);
    return total + measurePdfInlineRun(doc, run.text, tokenFont, fontSize);
  }, 0);
}

function wrapArabicLogicalLines(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
  font: string,
  fontSize: number,
  requestedFont?: string
) {
  const wrapped: string[] = [];
  const sourceLines = text.split('\n');

  doc.font(font).fontSize(fontSize);

  for (const sourceLine of sourceLines) {
    const trimmed = sourceLine.trim();

    if (!trimmed) {
      wrapped.push('');
      continue;
    }

    const words = isMostlyArabic(trimmed)
      ? splitArabicLineUnits(trimmed)
      : trimmed.split(/\s+/).filter(Boolean);
    let currentLine = '';
    let currentWidth = 0;
    const spaceWidth = measurePdfInlineRun(doc, ' ', font, fontSize);

    for (const word of words) {
      const wordWidth = measureArabicLogicalLineWidth(doc, word, font, fontSize, requestedFont);
      const candidateWidth = currentLine ? currentWidth + spaceWidth + wordWidth : wordWidth;

      if (!currentLine || candidateWidth <= width) {
        currentLine = currentLine ? `${currentLine} ${word}` : word;
        currentWidth = candidateWidth;
        continue;
      }

      wrapped.push(currentLine);
      currentLine = word;
      currentWidth = wordWidth;
    }

    if (currentLine) {
      wrapped.push(currentLine);
    }
  }

  return wrapped;
}

function writeArabicPdfText(
  doc: PDFKit.PDFDocument,
  text: string,
  options: {
    x?: number;
    y?: number;
    width?: number;
    fontSize: number;
    font?: string;
    align?: 'left' | 'center' | 'right';
    lineGap?: number;
    underline?: boolean;
    color?: string;
    link?: string;
  },
  font: string
) {
  const width = options.width || (doc.page.width - doc.page.margins.left - doc.page.margins.right);
  const startX = options.x ?? doc.x;
  let currentY = options.y ?? doc.y;
  const lineGap = options.lineGap || 0;
  const logicalLines = wrapArabicLogicalLines(doc, text, width, font, options.fontSize, options.font);

  doc.font(font).fontSize(options.fontSize).fillColor(options.color || '#111827');

  const lineHeight = doc.currentLineHeight() + lineGap;
  const pageBottom = doc.page.height - doc.page.margins.bottom;

  for (const logicalLine of logicalLines) {
    if (currentY + lineHeight > pageBottom) {
      doc.addPage();
      currentY = doc.page.margins.top;
    }

    if (!logicalLine) {
      currentY += lineHeight;
      continue;
    }

    const align = options.align || 'right';
    const renderedWidth = measureArabicLogicalLineWidth(doc, logicalLine, font, options.fontSize, options.font);
    let drawX = startX;

    if (align === 'right') {
      drawX = startX + Math.max(0, width - renderedWidth);
    } else if (align === 'center') {
      drawX = startX + Math.max(0, (width - renderedWidth) / 2);
    }

    if (isMostlyArabic(logicalLine)) {
      const runs = buildArabicPdfRuns(logicalLine);
      let cursorX = drawX + renderedWidth;

      for (const run of runs) {
        const tokenFont = run.kind === 'arabic'
          ? font
          : getLatinFont(options.font);
        const tokenWidth = measurePdfInlineRun(doc, run.text, tokenFont, options.fontSize);

        if (!run.text.trim()) {
          cursorX -= tokenWidth;
          continue;
        }

        const tokenX = cursorX - tokenWidth;

        drawPdfInlineRun(doc, run.text, tokenX, currentY, {
          font: tokenFont,
          fontSize: options.fontSize,
          color: options.color,
          underline: options.underline,
          link: options.link,
        });

        cursorX = tokenX;
      }
    } else {
      const renderedLine = renderArabicVisualLine(logicalLine);
      drawPdfInlineRun(doc, renderedLine, drawX, currentY, {
        font,
        fontSize: options.fontSize,
        color: options.color,
        underline: options.underline,
        link: options.link,
      });
    }

    currentY += lineHeight;
  }

  doc.x = startX;
  doc.y = currentY;
}

function writePdfText(
  doc: PDFKit.PDFDocument,
  text: string,
  options: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    fontSize: number;
    font?: string;
    align?: 'left' | 'center' | 'right';
    indent?: number;
    lineGap?: number;
    underline?: boolean;
    continued?: boolean;
    color?: string;
    link?: string;
  }
) {
  const isArabic = hasArabic(text);
  const font = resolvePdfFont(text, options.font);
  const align = options.align || (isArabic ? 'right' : 'left');

  try {
    doc.font(font);
  } catch {
    doc.font(options.font || 'Helvetica');
  }

  doc.fillColor(options.color || '#111827').fontSize(options.fontSize);

  if (isArabic && !options.continued) {
    writeArabicPdfText(doc, text, {
      x: options.x,
      y: options.y,
      width: options.width,
      fontSize: options.fontSize,
      font: options.font,
      align,
      lineGap: options.lineGap,
      underline: options.underline,
      color: options.color,
      link: options.link,
    }, font);
    return;
  }

  const renderedText = makeBreakableText(text);
  const textOptions = {
    width: options.width,
    height: options.height,
    align,
    indent: isArabic ? 0 : options.indent,
    lineGap: options.lineGap,
    underline: options.underline,
    continued: options.continued,
    link: options.link,
  };

  if (options.x !== undefined || options.y !== undefined) {
    doc.text(renderedText, options.x, options.y, textOptions);
  } else {
    doc.text(renderedText, textOptions);
  }
}

function getArabicFont(requestedFont?: string) {
  return requestedFont?.includes('Bold') ? 'Arabic-Bold' : 'Arabic';
}

function resolvePdfFont(text: string, requestedFont?: string) {
  if (!hasArabic(text)) {
    return requestedFont || 'Helvetica';
  }

  const wantsBold = /bold/i.test(requestedFont || '');

  if (wantsBold) {
    return 'Arabic-Bold';
  }

  if (hasLatinOrAscii(text)) {
    return getArabicMixedFont();
  }

  return getArabicFont(requestedFont);
}

function getArabicMixedFont() {
  return 'Arabic-Mixed';
}

function getLatinFont(requestedFont?: string) {
  if (requestedFont === 'Courier') return 'Courier';
  if (requestedFont?.includes('BoldOblique')) return 'Helvetica-BoldOblique';
  if (requestedFont?.includes('Bold')) return 'Helvetica-Bold';
  if (requestedFont?.includes('Oblique')) return 'Helvetica-Oblique';
  return requestedFont || 'Helvetica';
}

const arabicForms: Record<string, [string, string, string, string]> = {
  '\u0621': ['\uFE80', '\uFE80', '\uFE80', '\uFE80'],
  '\u0622': ['\uFE81', '\uFE82', '\uFE81', '\uFE82'],
  '\u0623': ['\uFE83', '\uFE84', '\uFE83', '\uFE84'],
  '\u0624': ['\uFE85', '\uFE86', '\uFE85', '\uFE86'],
  '\u0625': ['\uFE87', '\uFE88', '\uFE87', '\uFE88'],
  '\u0626': ['\uFE89', '\uFE8A', '\uFE8B', '\uFE8C'],
  '\u0627': ['\uFE8D', '\uFE8E', '\uFE8D', '\uFE8E'],
  '\u0628': ['\uFE8F', '\uFE90', '\uFE91', '\uFE92'],
  '\u0629': ['\uFE93', '\uFE94', '\uFE93', '\uFE94'],
  '\u062A': ['\uFE95', '\uFE96', '\uFE97', '\uFE98'],
  '\u062B': ['\uFE99', '\uFE9A', '\uFE9B', '\uFE9C'],
  '\u062C': ['\uFE9D', '\uFE9E', '\uFE9F', '\uFEA0'],
  '\u062D': ['\uFEA1', '\uFEA2', '\uFEA3', '\uFEA4'],
  '\u062E': ['\uFEA5', '\uFEA6', '\uFEA7', '\uFEA8'],
  '\u062F': ['\uFEA9', '\uFEAA', '\uFEA9', '\uFEAA'],
  '\u0630': ['\uFEAB', '\uFEAC', '\uFEAB', '\uFEAC'],
  '\u0631': ['\uFEAD', '\uFEAE', '\uFEAD', '\uFEAE'],
  '\u0632': ['\uFEAF', '\uFEB0', '\uFEAF', '\uFEB0'],
  '\u0633': ['\uFEB1', '\uFEB2', '\uFEB3', '\uFEB4'],
  '\u0634': ['\uFEB5', '\uFEB6', '\uFEB7', '\uFEB8'],
  '\u0635': ['\uFEB9', '\uFEBA', '\uFEBB', '\uFEBC'],
  '\u0636': ['\uFEBD', '\uFEBE', '\uFEBF', '\uFEC0'],
  '\u0637': ['\uFEC1', '\uFEC2', '\uFEC3', '\uFEC4'],
  '\u0638': ['\uFEC5', '\uFEC6', '\uFEC7', '\uFEC8'],
  '\u0639': ['\uFEC9', '\uFECA', '\uFECB', '\uFECC'],
  '\u063A': ['\uFECD', '\uFECE', '\uFECF', '\uFED0'],
  '\u0641': ['\uFED1', '\uFED2', '\uFED3', '\uFED4'],
  '\u0642': ['\uFED5', '\uFED6', '\uFED7', '\uFED8'],
  '\u0643': ['\uFED9', '\uFEDA', '\uFEDB', '\uFEDC'],
  '\u0644': ['\uFEDD', '\uFEDE', '\uFEDF', '\uFEE0'],
  '\u0645': ['\uFEE1', '\uFEE2', '\uFEE3', '\uFEE4'],
  '\u0646': ['\uFEE5', '\uFEE6', '\uFEE7', '\uFEE8'],
  '\u0647': ['\uFEE9', '\uFEEA', '\uFEEB', '\uFEEC'],
  '\u0648': ['\uFEED', '\uFEEE', '\uFEED', '\uFEEE'],
  '\u0649': ['\uFEEF', '\uFEF0', '\uFEEF', '\uFEF0'],
  '\u064A': ['\uFEF1', '\uFEF2', '\uFEF3', '\uFEF4'],
};

const rightJoiningOnly = new Set(['\u0622', '\u0623', '\u0624', '\u0625', '\u0627', '\u0629', '\u062F', '\u0630', '\u0631', '\u0632', '\u0648', '\u0649']);

function canConnectBefore(char: string) {
  return Boolean(arabicForms[char]) && !rightJoiningOnly.has(char);
}

function canConnectAfter(char: string) {
  return Boolean(arabicForms[char]);
}

function shapeArabicWord(word: string) {
  const chars = Array.from(word);
  return chars.map((char, index) => {
    const forms = arabicForms[char];
    if (!forms) return char;

    const previous = chars[index - 1];
    const next = chars[index + 1];
    const joinsPrevious = previous && canConnectBefore(previous) && canConnectAfter(char);
    const joinsNext = next && canConnectBefore(char) && canConnectAfter(next);

    if (joinsPrevious && joinsNext) return forms[3];
    if (joinsPrevious) return forms[1];
    if (joinsNext) return forms[2];
    return forms[0];
  }).join('');
}

function shapeArabicForPdf(text: string) {
  const usePresentationForms = process.env.PDF_ARABIC_PRESENTATION_FORMS === 'true';
  const lines = text.split('\n');

  return lines.map((line) => {
    const tokens = tokenizeBidiText(line);
    const orderedTokens = isMostlyArabic(line) ? reorderBidiTokens(tokens) : tokens;

    return orderedTokens
      .map((token) => {
        if (token.kind === 'latin' || token.kind === 'space') return token.text;
        return usePresentationForms ? shapeArabicToken(token.text) : token.text;
      })
      .join('');
  }).join('\n');
}

function tokenizeBidiText(text: string) {
  const tokens: Array<{ kind: 'arabic' | 'latin' | 'space'; text: string }> = [];
  const parts = text.match(
    /[\s\u200B]+|https?:\/\/\S+|www\.\S+|[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u064B-\u065F]+|[A-Za-z0-9]+(?:[._:/?#[\]@!$&'()*+,;=%-][A-Za-z0-9]+)*|[()[\]{}<>]+|[^\s\u200B]/g
  ) || [];

  for (const part of parts) {
    if (/^[\s\u200B]+$/.test(part)) {
      tokens.push({ kind: 'space', text: part });
    } else if (!hasArabic(part)) {
      tokens.push({ kind: 'latin', text: part });
    } else {
      tokens.push({ kind: 'arabic', text: part });
    }
  }

  return mergeLatinIslands(tokens);
}

function reorderBidiTokens(tokens: Array<{ kind: 'arabic' | 'latin' | 'space'; text: string }>) {
  const leadingSpaces: string[] = [];
  const trailingSpaces: string[] = [];
  const units: Array<{ kind: 'arabic' | 'latin'; text: string }> = [];
  const separators: string[] = [];
  let currentUnit = '';
  let currentKind: 'arabic' | 'latin' | null = null;
  let pendingSeparator = '';

  for (const token of tokens) {
    if (token.kind === 'space') {
      if (!currentUnit) {
        if (units.length === 0) {
          leadingSpaces.push(token.text);
        } else {
          trailingSpaces.push(token.text);
        }
      } else {
        units.push({ kind: currentKind!, text: currentUnit });
        currentUnit = '';
        currentKind = null;
        pendingSeparator = token.text;
      }
      continue;
    }

    if (pendingSeparator) {
      separators.push(pendingSeparator);
      pendingSeparator = '';
      trailingSpaces.length = 0;
    }

    if (!currentUnit) {
      currentKind = token.kind;
      currentUnit = token.text;
    } else {
      currentUnit += token.text;
    }
  }

  if (currentUnit) {
    units.push({ kind: currentKind!, text: currentUnit });
  }

  if (units.length <= 1) {
    return tokens;
  }

  const reordered: Array<{ kind: 'arabic' | 'latin' | 'space'; text: string }> = [];
  const leading = leadingSpaces.join('');
  const trailing = trailingSpaces.join('');

  if (leading) {
    reordered.push({ kind: 'space', text: leading });
  }

  for (let index = units.length - 1; index >= 0; index--) {
    reordered.push(units[index]);
    if (index > 0) {
      reordered.push({ kind: 'space', text: separators[index - 1] || ' ' });
    }
  }

  if (trailing) {
    reordered.push({ kind: 'space', text: trailing });
  }

  return reordered;
}

function mergeLatinIslands(tokens: Array<{ kind: 'arabic' | 'latin' | 'space'; text: string }>) {
  const merged: Array<{ kind: 'arabic' | 'latin' | 'space'; text: string }> = [];

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];

    if (token.kind !== 'latin') {
      merged.push(token);
      continue;
    }

    let text = token.text;
    while (
      tokens[index + 1]?.kind === 'space' &&
      tokens[index + 2]?.kind === 'latin'
    ) {
      text += tokens[index + 1].text + tokens[index + 2].text;
      index += 2;
    }

    merged.push({ kind: 'latin', text });
  }

  return merged;
}

function mergeBracketWrappedLatinTokens(tokens: Array<{ kind: 'arabic' | 'latin' | 'space'; text: string }>) {
  const merged: Array<{ kind: 'arabic' | 'latin' | 'space'; text: string }> = [];
  const openingToClosing: Record<string, string> = {
    '(': ')',
    '[': ']',
    '{': '}',
    '<': '>',
  };

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];

    if (
      token.kind === 'latin' &&
      token.text.length === 1 &&
      openingToClosing[token.text]
    ) {
      const openingToken = token;
      let text = token.text;
      let cursor = index + 1;
      let foundClosing = false;

      while (cursor < tokens.length) {
        const next = tokens[cursor];

        if (next.kind === 'arabic') {
          break;
        }

        text += next.text;

        if (next.kind === 'latin' && next.text === openingToClosing[openingToken.text]) {
          foundClosing = true;
          break;
        }

        cursor += 1;
      }

      if (foundClosing) {
        merged.push({ kind: 'latin', text });
        index = cursor;
        continue;
      }
    }

    merged.push(token);
  }

  return merged;
}

function shapeArabicToken(token: string) {
  const chars = Array.from(token);
  let shaped = '';
  let currentWord = '';

  const flushWord = () => {
    if (currentWord) {
      shaped += Array.from(shapeArabicWord(currentWord)).reverse().join('');
      currentWord = '';
    }
  };

  for (const char of chars) {
    if (arabicForms[char] || /[\u064B-\u065F]/.test(char)) {
      currentWord += char;
    } else {
      flushWord();
      shaped += char;
    }
  }

  flushWord();
  return shaped;
}

function drawTwoColumnText(
  doc: PDFKit.PDFDocument,
  text: string,
  style: ReturnType<typeof getSectionStyle>
) {
  const gap = 18;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const columnWidth = (pageWidth - gap) / 2;
  const processed = stripMarkdownMarkers(text, true);
  const isRtl = isMostlyArabic(processed);
  const sentences = processed.split(/(?<=[.!?])\s+/);
  const midpoint = Math.ceil(sentences.length / 2);
  const first = sentences.slice(0, midpoint).join(' ');
  const second = sentences.slice(midpoint).join(' ');
  const left = isRtl ? second : first;
  const right = isRtl ? first : second;
  const top = doc.y;

  writePdfTextWithScript(doc, left, {
    x: doc.page.margins.left,
    y: top,
    width: columnWidth,
    lineGap: style.lineGap,
    fontSize: style.bodyFontSize,
  });
  const leftBottom = doc.y;
  doc.y = top;
  writePdfTextWithScript(doc, right, {
    x: doc.page.margins.left + columnWidth + gap,
    y: top,
    width: columnWidth,
    lineGap: style.lineGap,
    fontSize: style.bodyFontSize,
  });
  doc.y = Math.max(doc.y, leftBottom);
}

function getSectionStyle(section: PDFContentStructure['sections'][number]) {
  const density = section.style?.density || 'normal';

  return {
    headingFontSize: clampNumber(section.style?.headingFontSize, 16, 10, 30),
    bodyFontSize: clampNumber(section.style?.bodyFontSize, density === 'compact' ? 10 : 11, 9, 18),
    tableFontSize: clampNumber(section.style?.tableFontSize, density === 'compact' ? 7.5 : 8.5, 7, 12),
    lineGap: clampNumber(section.style?.lineGap, density === 'compact' ? 1.5 : 3, 0, 8),
    spacingAfter: clampNumber(section.style?.spacingAfter, density === 'compact' ? 4 : 8, 0, 18),
    paragraphGap: density === 'compact' ? 4 : density === 'spacious' ? 12 : 8,
    density,
  };
}

function fitSectionStyleToPageBudget(
  doc: PDFKit.PDFDocument,
  section: PDFContentStructure['sections'][number],
  initialStyle: ReturnType<typeof getSectionStyle>,
  pageCount: number
) {
  if (isSectionRtl(section)) {
    return initialStyle;
  }

  const style = { ...initialStyle };
  const pageHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
  const budgetHeight = pageHeight * pageCount;

  for (let attempt = 0; attempt < 3; attempt++) {
    const estimatedHeight = estimateSectionHeight(doc, section, style);

    if (estimatedHeight <= budgetHeight) {
      return style;
    }

    style.bodyFontSize = Math.max(9, style.bodyFontSize - 0.4);
    style.tableFontSize = Math.max(7, style.tableFontSize - 0.35);
    style.lineGap = Math.max(0, style.lineGap - 0.5);
    style.spacingAfter = Math.max(0, style.spacingAfter - 1);
    style.paragraphGap = Math.max(0, style.paragraphGap - 1);
  }

  return style;
}

function spreadSectionStyleToBudget(
  doc: PDFKit.PDFDocument,
  section: PDFContentStructure['sections'][number],
  style: ReturnType<typeof getSectionStyle>,
  budgetHeight: number,
  estimatedHeight: number
) {
  if (section.type === 'table') {
    return style;
  }

  const extra = Math.max(0, budgetHeight - estimatedHeight);
  const text = getPlainSectionText(section, true);
  const lines = estimateLineCount(doc, text, style.bodyFontSize);
  const blockCount = Math.max(1, getTextBlocks(text, true).length);

  if (lines > 1) {
    style.lineGap += Math.min(96, (extra * 0.75) / Math.max(1, lines - 1));
  }

  if (blockCount > 1) {
    style.paragraphGap += Math.min(120, (extra * 0.25) / Math.max(1, blockCount - 1));
  }

  return style;
}

function getTextBlocks(text: string, forPdf = false) {
  return text
    .replace(/\$([^$]+)\$/g, (_, math) => renderInlineMath(math, forPdf))
    .split(/\n{2,}/)
    .flatMap((block) => {
      const lines = block.split(/\n/).map((line) => line.trim()).filter(Boolean);
      const hasStructuredLines = lines.some((line) => /^(#{1,6}\s+|\d+\.|[a-zA-Z]\.|[*-])\s+/.test(line));

      if (!hasStructuredLines) {
        return [lines.join(' ')];
      }

      const structuredBlocks: string[] = [];
      let paragraphLines: string[] = [];
      const flushParagraph = () => {
        if (paragraphLines.length) {
          structuredBlocks.push(paragraphLines.join(' '));
          paragraphLines = [];
        }
      };

      lines.forEach((line) => {
        if (/^(#{1,6}\s+|\d+\.|[a-zA-Z]\.|[*-])\s+/.test(line)) {
          flushParagraph();
          structuredBlocks.push(line);
          return;
        }

        paragraphLines.push(line);
      });

      flushParagraph();
      return structuredBlocks;
    })
    .map((block) => block.trim())
    .filter(Boolean);
}

function drawStructuredPdfText(
  doc: PDFKit.PDFDocument,
  text: string,
  style: ReturnType<typeof getSectionStyle>
) {
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const blocks = getTextBlocks(text, true);

  blocks.forEach((block, index) => {
    const isListLike = /^(\d+\.|[a-zA-Z]\.|[*-])\s+/.test(block);
    const indent = isListLike ? 14 : 0;
    drawMarkdownPdfBlock(doc, block, {
      width: width - indent,
      indent,
      lineGap: style.lineGap,
      bodyFontSize: style.bodyFontSize,
    });

    if (index < blocks.length - 1) {
      doc.y += style.paragraphGap;
    }
  });
}

function estimateLineCount(doc: PDFKit.PDFDocument, text: string, fontSize: number) {
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const lineHeight = fontSize * 1.2;
  const height = getTextBlocks(text, true).reduce((sum, block) => (
    sum + (hasArabic(block)
      ? wrapArabicLogicalLines(doc, block, width, resolvePdfFont(block), fontSize).length * lineHeight
      : doc.fontSize(fontSize).heightOfString(block, { width }))
  ), 0);

  return Math.max(1, Math.ceil(height / lineHeight));
}

function estimateStructuredTextHeight(
  doc: PDFKit.PDFDocument,
  text: string,
  style: ReturnType<typeof getSectionStyle>
) {
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const blocks = getTextBlocks(text, true);

  return blocks.reduce((sum, block, index) => (
    sum + (hasArabic(block)
      ? wrapArabicLogicalLines(doc, block, width, resolvePdfFont(block), style.bodyFontSize).length * (style.bodyFontSize * 1.2 + style.lineGap)
      : doc.fontSize(style.bodyFontSize).heightOfString(block, {
          width,
          lineGap: style.lineGap,
        })) + (index < blocks.length - 1 ? style.paragraphGap : 0)
  ), 0);
}

function parseMarkdownInline(text: string) {
  const tokens: Array<{ text: string; bold?: boolean; italic?: boolean; code?: boolean }> = [];
  const pattern = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: text.slice(lastIndex, match.index) });
    }

    const raw = match[0];
    if (raw.startsWith('***')) {
      tokens.push({ text: raw.slice(3, -3), bold: true, italic: true });
    } else if (raw.startsWith('**')) {
      tokens.push({ text: raw.slice(2, -2), bold: true });
    } else if (raw.startsWith('*')) {
      tokens.push({ text: raw.slice(1, -1), italic: true });
    } else if (raw.startsWith('`')) {
      tokens.push({ text: raw.slice(1, -1), code: true });
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({ text: text.slice(lastIndex) });
  }

  return tokens.filter((token) => token.text.length > 0);
}

function breakUrlDisplay(url: string) {
  return url.replace(/([/?#&=_%.:-])/g, '$1\u200B');
}

function decodeUrlForDisplay(url: string) {
  try {
    return decodeURI(url);
  } catch {
    return url;
  }
}

function prettifyUrlDisplay(url: string) {
  return breakUrlDisplay(decodeUrlForDisplay(url));
}

function splitTrailingUrlPunctuation(url: string) {
  const match = url.match(/^(.*?)([),.;:!?]+)$/);
  if (!match) {
    return { url, trailing: '' };
  }

  return {
    url: match[1],
    trailing: match[2],
  };
}

function parseMarkdownSegments(text: string) {
  const segments: Array<{
    text: string;
    url?: string;
    bold?: boolean;
    italic?: boolean;
    code?: boolean;
  }> = [];
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/\S+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push(...parseMarkdownInline(text.slice(lastIndex, match.index)));
    }

    if (match[1] && match[2]) {
      segments.push({ text: match[1], url: match[2] });
    } else if (match[3]) {
      const { url, trailing } = splitTrailingUrlPunctuation(match[3]);
      segments.push({ text: prettifyUrlDisplay(url), url });
      if (trailing) {
        segments.push({ text: trailing });
      }
    }

    lastIndex = linkPattern.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push(...parseMarkdownInline(text.slice(lastIndex)));
  }

  return segments.filter((segment) => segment.text.length > 0);
}

function markdownFont(token: { bold?: boolean; italic?: boolean; code?: boolean }) {
  if (token.code) return 'Courier';
  if (token.bold && token.italic) return 'Helvetica-BoldOblique';
  if (token.bold) return 'Helvetica-Bold';
  if (token.italic) return 'Helvetica-Oblique';
  return 'Helvetica';
}

function stripMarkdownMarkers(value: string, forPdf = false, preserveLinks = false) {
  const base = value
    .replace(/\$([^$]+)\$/g, (_, math) => renderInlineMath(math, forPdf))
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s+/, '');

  return preserveLinks ? base : base.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

// Unicode subscripts and superscripts for document formats that support them
const subscriptMap: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅',
  '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ', 'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ',
  'n': 'ₙ', 'o': 'ₒ', 'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ', 'v': 'ᵥ', 'x': 'ₓ',
  'A': 'ₐ', 'B': 'ᵦ', 'C': 'ᶜ', 'D': 'ᴰ', 'E': 'ₑ', 'G': 'ᴳ', 'H': 'ₕ', 'I': 'ᵢ',
  'J': 'ⱼ', 'K': 'ₖ', 'L': 'ₗ', 'M': 'ₘ', 'N': 'ₙ', 'O': 'ₒ', 'P': 'ₚ', 'Q': 'ᵠ',
  'R': 'ᵣ', 'S': 'ₛ', 'T': 'ₜ', 'U': 'ᵤ', 'V': 'ᵥ', 'W': 'ᵂ', 'X': 'ₓ', 'Y': 'ᵧ', 'Z': 'ᵨ',
};

const superscriptMap: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵',
  '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ', 'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ',
  'i': 'ⁱ', 'j': 'ʲ', 'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ', 'n': 'ⁿ', 'o': 'ᵒ', 'p': 'ᵖ',
  'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ', 'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ',
  'A': 'ᴬ', 'B': 'ᴮ', 'C': 'ᶜ', 'D': 'ᴰ', 'E': 'ᴱ', 'F': 'ᶠ', 'G': 'ᴳ', 'H': 'ᴴ',
  'I': 'ᴵ', 'J': 'ᴶ', 'K': 'ᴷ', 'L': 'ᴸ', 'M': 'ᴹ', 'N': 'ᴺ', 'O': 'ᴼ', 'P': 'ᴾ',
  'Q': 'Q', 'R': 'ᴿ', 'S': 'ˢ', 'T': 'ᵀ', 'U': 'ᵁ', 'V': 'ⱽ', 'W': 'ᵂ', 'X': 'ˣ', 'Y': 'ʸ', 'Z': 'ᶻ',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
};

function toSubscriptLegacy(str: string): string {
  return str.split('').map(c => subscriptMap[c] || c).join('');
}

function toSuperscriptLegacy(str: string): string {
  return str.split('').map(c => superscriptMap[c] || c).join('');
}

function toSubscript(str: string): string {
  const map: Record<string, string> = {
    '0': '\u2080', '1': '\u2081', '2': '\u2082', '3': '\u2083', '4': '\u2084', '5': '\u2085',
    '6': '\u2086', '7': '\u2087', '8': '\u2088', '9': '\u2089',
    '+': '\u208A', '-': '\u208B', '=': '\u208C', '(': '\u208D', ')': '\u208E',
  };
  return str.split('').map((char) => map[char] || char).join('');
}

function toSuperscript(str: string): string {
  const map: Record<string, string> = {
    '0': '\u2070', '1': '\u00B9', '2': '\u00B2', '3': '\u00B3', '4': '\u2074', '5': '\u2075',
    '6': '\u2076', '7': '\u2077', '8': '\u2078', '9': '\u2079',
    '+': '\u207A', '-': '\u207B', '=': '\u207C', '(': '\u207D', ')': '\u207E',
  };
  return str.split('').map((char) => map[char] || char).join('');
}

// For PDF: use markers that can be processed with text rise
function toSubscriptPdf(str: string): string {
  return `{{sub:${str}}}`;
}

function toSuperscriptPdf(str: string): string {
  return `{{sup:${str}}}`;
}

// Reverse-map Unicode subscripts/superscripts back to PDF markers
// (needed for table cells that were already converted to Unicode by cleanCell)
const unicodeSubscriptReverse: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5',
  '₆': '6', '₇': '7', '₈': '8', '₉': '9',
};
const unicodeSuperscriptReverse: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5',
  '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')',
};

function unicodeToPdfMarkers(text: string): string {
  const pdfSubscriptReverse: Record<string, string> = {
    ...unicodeSubscriptReverse,
    '\u2080': '0', '\u2081': '1', '\u2082': '2', '\u2083': '3', '\u2084': '4',
    '\u2085': '5', '\u2086': '6', '\u2087': '7', '\u2088': '8', '\u2089': '9',
    '\u208A': '+', '\u208B': '-', '\u208C': '=', '\u208D': '(', '\u208E': ')',
  };
  const pdfSuperscriptReverse: Record<string, string> = {
    ...unicodeSuperscriptReverse,
    '\u2070': '0', '\u00B9': '1', '\u00B2': '2', '\u00B3': '3', '\u2074': '4',
    '\u2075': '5', '\u2076': '6', '\u2077': '7', '\u2078': '8', '\u2079': '9',
    '\u207A': '+', '\u207B': '-', '\u207C': '=', '\u207D': '(', '\u207E': ')',
  };

  // Convert runs of Unicode subscript digits to {{sub:...}} markers
  let result = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (pdfSubscriptReverse[ch]) {
      let sub = '';
      while (i < text.length && pdfSubscriptReverse[text[i]]) {
        sub += pdfSubscriptReverse[text[i]];
        i++;
      }
      result += `{{sub:${sub}}}`;
    } else if (pdfSuperscriptReverse[ch]) {
      let sup = '';
      while (i < text.length && pdfSuperscriptReverse[text[i]]) {
        sup += pdfSuperscriptReverse[text[i]];
        i++;
      }
      result += `{{sup:${sup}}}`;
    } else {
      result += ch;
      i++;
    }
  }
  return result;
}

function renderInlineMathLegacy(value: string, forPdf = false) {
  const toSub = forPdf ? toSubscriptPdf : toSubscript;
  const toSup = forPdf ? toSuperscriptPdf : toSuperscript;

  return value
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/ext\{([^}]+)\}/g, '$1')
    .replace(/\^\{([^}]+)\}/g, (_, num) => toSup(num))
    .replace(/\^([0-9a-zA-Z+-=()])/g, (_, num) => toSup(num))
    .replace(/_\{([^}]+)\}/g, (_, num) => toSub(num))
    .replace(/_([0-9a-zA-Z+-=()])/g, (_, num) => toSub(num))
    .replace(/\\circ\b/g, '°')
    .replace(/\\rangle/g, '⟩')
    .replace(/\\langle/g, '⟨')
    .replace(/\\ket\{([^}]+)\}/g, '|$1⟩')
    .replace(/\\bra\{([^}]+)\}/g, '⟨$1|')
    .replace(/\\frac\{([^}]+)\}\{\\sqrt\{([^}]+)\}\}/g, '$1/√$2')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^}]+)\}/g, '√$1')
    .replace(/\\otimes/g, '⊗')
    .replace(/\\oplus/g, '⊕')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\gamma/g, 'γ')
    .replace(/\\theta/g, 'θ')
    .replace(/\\pi/g, 'π')
    .replace(/\\psi/g, 'ψ')
    .replace(/\\phi/g, 'φ')
    .replace(/\\Omega/g, 'Ω')
    .replace(/\\Delta/g, 'Δ')
    .replace(/\\\(/g, '')
    .replace(/\\\)/g, '')
    .replace(/\\/g, '');
}

function renderInlineMath(value: string, forPdf = false) {
  const toSub = forPdf ? toSubscriptPdf : toSubscript;
  const toSup = forPdf ? toSuperscriptPdf : toSuperscript;

  return value
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/ext\{([^}]+)\}/g, '$1')
    .replace(/\^\{([^}]+)\}/g, (_, num) => toSup(num))
    .replace(/\^([0-9a-zA-Z+-=()])/g, (_, num) => toSup(num))
    .replace(/_\{([^}]+)\}/g, (_, num) => toSub(num))
    .replace(/_([0-9a-zA-Z+-=()])/g, (_, num) => toSub(num))
    .replace(/\\circ\b/g, '\u00B0')
    .replace(/\\rangle/g, '\u27E9')
    .replace(/\\langle/g, '\u27E8')
    .replace(/\\ket\{([^}]+)\}/g, '|$1\u27E9')
    .replace(/\\bra\{([^}]+)\}/g, '\u27E8$1|')
    .replace(/\\frac\{([^}]+)\}\{\\sqrt\{([^}]+)\}\}/g, '$1/\u221A$2')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^}]+)\}/g, '\u221A$1')
    .replace(/\\otimes/g, '\u2297')
    .replace(/\\oplus/g, '\u2295')
    .replace(/\\times/g, '\u00D7')
    .replace(/\\cdot/g, '\u00B7')
    .replace(/\\alpha/g, '\u03B1')
    .replace(/\\beta/g, '\u03B2')
    .replace(/\\gamma/g, '\u03B3')
    .replace(/\\theta/g, '\u03B8')
    .replace(/\\pi/g, '\u03C0')
    .replace(/\\psi/g, '\u03C8')
    .replace(/\\phi/g, '\u03C6')
    .replace(/\\Omega/g, '\u03A9')
    .replace(/\\Delta/g, '\u0394')
    .replace(/\\\(/g, '')
    .replace(/\\\)/g, '')
    .replace(/\\/g, '');
}

function writePdfTextWithScript(
  doc: PDFKit.PDFDocument,
  text: string,
  options: {
    width: number;
    x?: number;
    y?: number;
    fontSize: number;
    font?: string;
    lineGap?: number;
    color?: string;
    continued?: boolean;
    link?: string;
    underline?: boolean;
  }
) {
  // Parse text for {{sub:...}} and {{sup:...}} markers
  const scriptPattern = /\{\{(sub|sup):([^}]+)\}\}/g;
  const parts: Array<{ text: string; script?: 'sub' | 'sup' }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = scriptPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index) });
    }
    parts.push({ text: match[2], script: match[1] as 'sub' | 'sup' });
    lastIndex = scriptPattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex) });
  }

  if (hasArabic(text)) {
    writePdfText(doc, text, options);
    return;
  }

  // No markers or single plain part — use regular writePdfText
  if (
    parts.length === 0 ||
    (
      parts.length === 1 &&
      !parts[0].script &&
      !options.link &&
      !text.includes('\u200B')
    )
  ) {
    writePdfText(doc, text, options);
    return;
  }

  // Flatten parts into a single line of character-level segments
  // then wrap manually based on available width
  const baseFontSize = options.fontSize;
  const scriptFontSize = baseFontSize * 0.65;
  const font = resolvePdfFont(text, options.font);
  const color = options.color || '#111827';
  const lineGap = options.lineGap || 0;
  const availWidth = options.width;

  const startX = options.x ?? doc.x;
  let curY = options.y ?? doc.y;
  let curX = startX;

  // Build lines: accumulate parts until we exceed width, then wrap
  const lines: Array<Array<{ text: string; script?: 'sub' | 'sup' }>> = [[]];
  let lineUsedWidth = 0;

  for (const part of parts) {
    const isScript = part.script === 'sub' || part.script === 'sup';
    const fontSize = isScript ? scriptFontSize : baseFontSize;
    doc.font(font).fontSize(fontSize);
    const partWidth = doc.widthOfString(part.text);

    // Split part text by spaces for word-level wrapping
    const words = part.text.split(/([\s\u200B]+)/);
    for (const word of words) {
      if (!word) continue;
      const wordIsSpace = /^[\s\u200B]+$/.test(word);
      const wordFontSize = isScript ? scriptFontSize : baseFontSize;
      doc.font(font).fontSize(wordFontSize);
      const wordWidth = doc.widthOfString(word);

      if (!wordIsSpace && lineUsedWidth + wordWidth > availWidth && lines[lines.length - 1].length > 0) {
        // Wrap to new line
        lines.push([]);
        lineUsedWidth = 0;
      }

      lines[lines.length - 1].push({ text: word, script: part.script });
      lineUsedWidth += wordWidth;
    }
  }

  // Render each line
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    curX = startX;

    for (const seg of line) {
      const isScript = seg.script === 'sub' || seg.script === 'sup';
      const fontSize = isScript ? scriptFontSize : baseFontSize;

      let yOffset = 0;
      if (seg.script === 'sub') {
        yOffset = baseFontSize * 0.35;
      } else if (seg.script === 'sup') {
        yOffset = -(baseFontSize * 0.3);
      }

      doc.font(font).fontSize(fontSize).fillColor(color);
      doc.text(seg.text, curX, curY + yOffset, {
        lineBreak: false,
        width: availWidth,
        link: options.link,
        underline: options.underline,
      });
      curX += doc.widthOfString(seg.text);
    }

    // Advance Y for next line
    if (lineIdx < lines.length - 1) {
      curY += baseFontSize + lineGap;
    }
  }

  // Restore cursor position
  if (!options.continued) {
    doc.x = startX;
    doc.y = curY + baseFontSize + lineGap;
  } else {
    doc.x = curX;
    doc.y = curY;
  }

  doc.fontSize(baseFontSize).font('Helvetica');
}

function drawMarkdownPdfBlock(
  doc: PDFKit.PDFDocument,
  rawBlock: string,
  options: {
    width: number;
    indent: number;
    lineGap: number;
    bodyFontSize: number;
  }
) {
  const heading = rawBlock.match(/^(#{1,6})\s+(.+)$/);
  const quote = rawBlock.match(/^>\s+(.+)$/);
  const block = stripMarkdownMarkers(rawBlock, true, false);
  const fontSize = heading
    ? Math.max(options.bodyFontSize + (7 - heading[1].length), options.bodyFontSize + 1)
    : options.bodyFontSize;
  const effectiveIndent = quote ? options.indent + 10 : options.indent;
  const blockStartX = doc.x;
  const blockStartY = doc.y;

  if (!block.trim()) return;

  ensurePdfParagraphStart(doc, block, {
    width: options.width - effectiveIndent,
    fontSize,
    font: heading ? 'Helvetica-Bold' : 'Helvetica',
    lineGap: options.lineGap,
    x: blockStartX + effectiveIndent,
  });

  writePdfTextWithScript(doc, block, {
    width: options.width - effectiveIndent,
    x: blockStartX + effectiveIndent,
    y: doc.y,
    lineGap: options.lineGap,
    fontSize,
    font: heading ? 'Helvetica-Bold' : 'Helvetica',
  });

  doc.x = blockStartX;
  doc.font('Helvetica');
}

function ensurePdfParagraphStart(
  doc: PDFKit.PDFDocument,
  text: string,
  options: {
    width: number;
    fontSize: number;
    font?: string;
    lineGap?: number;
    x?: number;
  }
) {
  const remainingHeight = doc.page.height - doc.page.margins.bottom - doc.y;
  const font = resolvePdfFont(text, options.font);
  const pageBodyHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
  const estimatedHeight = estimatePdfTextHeight(doc, text, options);
  const minimumLines = Math.min(3, Math.max(1, Math.ceil(estimatedHeight / Math.max(1, options.fontSize + (options.lineGap || 0)))));
  const neededHeight = minimumLines * (options.fontSize + (options.lineGap || 0));

  if (estimatedHeight <= pageBodyHeight && remainingHeight < estimatedHeight) {
    doc.addPage();
    if (options.x !== undefined) {
      doc.x = options.x;
    }
    doc.font(font).fontSize(options.fontSize);
    return;
  }

  if (remainingHeight >= neededHeight) return;

  doc.addPage();
  if (options.x !== undefined) {
    doc.x = options.x;
  }
  doc.font(font).fontSize(options.fontSize);
}

function estimatePdfTextHeight(
  doc: PDFKit.PDFDocument,
  text: string,
  options: {
    width: number;
    fontSize: number;
    font?: string;
    lineGap?: number;
  }
) {
  const font = resolvePdfFont(text, options.font);
  const cleanedText = stripMarkdownMarkers(text, true, false);

  if (hasArabic(cleanedText)) {
    const lines = wrapArabicLogicalLines(doc, cleanedText, options.width, font, options.fontSize, options.font);
    const lineGap = options.lineGap || 0;
    doc.font(font).fontSize(options.fontSize);
    return Math.max(options.fontSize, lines.length * (doc.currentLineHeight() + lineGap));
  }

  try {
    doc.font(font);
  } catch {
    doc.font(options.font || 'Helvetica');
  }
  const height = doc.fontSize(options.fontSize).heightOfString(cleanedText, {
    width: options.width,
    lineGap: options.lineGap || 0,
  });
  return Math.max(options.fontSize, height);
}

function markdownToTextRuns(text: string) {
  const stripped = stripMarkdownMarkers(text, false, true);
  const tokens = parseMarkdownSegments(stripped);

  return tokens.length
    ? tokens.map((token) => (
        token.url
          ? new ExternalHyperlink({
              link: token.url,
              children: [
                new TextRun({
                  text: token.text.replace(/\u200B/g, ''),
                  style: 'Hyperlink',
                }),
              ],
            })
          : new TextRun({
              text: token.text,
              bold: token.bold,
              italics: token.italic,
              font: token.code ? 'Courier New' : undefined,
            })
      ))
    : [new TextRun(stripped)];
}

function estimateSectionHeight(
  doc: PDFKit.PDFDocument,
  section: PDFContentStructure['sections'][number],
  style: ReturnType<typeof getSectionStyle>
) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  let height = 0;

  if (section.heading && section.type !== 'table') {
    height += doc.fontSize(style.headingFontSize).heightOfString(section.heading, { width: pageWidth }) + 14;
  }

  if (section.type === 'table' && section.rows?.length) {
    return height + estimateTableHeight(doc, section.rows, style.tableFontSize, pageWidth) + style.spacingAfter;
  }

  if (section.style?.layout === 'two-column') {
    const gap = 18;
    const columnWidth = (pageWidth - gap) / 2;
    const text = getPlainSectionText(section, true);
    const sentences = text.split(/(?<=[.!?])\s+/);
    const midpoint = Math.ceil(sentences.length / 2);
    const left = sentences.slice(0, midpoint).join(' ');
    const right = sentences.slice(midpoint).join(' ');
    const leftHeight = doc.fontSize(style.bodyFontSize).heightOfString(left, { width: columnWidth, lineGap: style.lineGap });
    const rightHeight = doc.fontSize(style.bodyFontSize).heightOfString(right, { width: columnWidth, lineGap: style.lineGap });
    return height + Math.max(leftHeight, rightHeight) + style.spacingAfter;
  }

  return height + estimateStructuredTextHeight(doc, getPlainSectionText(section, true), style) + style.spacingAfter;
}

function estimateTableHeight(doc: PDFKit.PDFDocument, rows: string[][], fontSize: number, pageWidth: number) {
  if (shouldStackPdfTable(rows)) {
    return estimateStackedTableHeight(doc, rows, fontSize, pageWidth);
  }

  const columns = Math.max(...rows.map((row) => row.length));
  const columnWidth = pageWidth / Math.max(1, columns);
  const padding = 5;

  return rows.reduce((total, row) => {
    const rowHeight = Math.max(
      24,
      ...Array.from({ length: columns }, (_, columnIndex) => (
        doc.fontSize(fontSize).heightOfString(row[columnIndex] || '', { width: columnWidth - padding * 2 }) + padding * 2
      ))
    );

    return total + rowHeight;
  }, 0);
}

function shouldStackPdfTable(rows: string[][]) {
  const columns = Math.max(0, ...rows.map((row) => row.length));
  if (columns <= 2 || rows.length <= 1) return false;

  const bodyCells = rows.slice(1).flat().map((cell) => String(cell || '').trim());
  const longestCell = Math.max(0, ...bodyCells.map((cell) => cell.length));
  const averageCellLength = bodyCells.length
    ? bodyCells.reduce((sum, cell) => sum + cell.length, 0) / bodyCells.length
    : 0;

  return columns >= 4 || longestCell > 130 || averageCellLength > 55;
}

function estimateStackedTableHeight(doc: PDFKit.PDFDocument, rows: string[][], fontSize: number, pageWidth: number) {
  const headers = rows[0] || [];
  const padding = 5;
  const labelWidth = Math.min(150, pageWidth * 0.32);
  const valueWidth = pageWidth - labelWidth;

  return rows.slice(1).reduce((total, row) => {
    const rowHeaderHeight = 22;
    const firstCell = String(row[0] || '').trim();
    const useFirstCellAsTitle = Boolean(firstCell && firstCell.length <= 80 && headers.length > 2);
    const startColumn = useFirstCellAsTitle ? 1 : 0;
    const pairHeight = headers.slice(startColumn).reduce((sum, header, offset) => {
      const columnIndex = startColumn + offset;
      const labelHeight = doc.fontSize(fontSize).heightOfString(String(header || ''), { width: labelWidth - padding * 2 });
      const valueHeight = doc.fontSize(fontSize).heightOfString(String(row[columnIndex] || ''), { width: valueWidth - padding * 2 });
      return sum + Math.max(22, labelHeight + padding * 2, valueHeight + padding * 2);
    }, 0);

    return total + rowHeaderHeight + pairHeight + 8;
  }, 0);
}

function drawPdfTable(doc: PDFKit.PDFDocument, rows: string[][], fontSize = 8) {
  if (shouldStackPdfTable(rows)) {
    drawStackedPdfTable(doc, rows, fontSize);
    return;
  }

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const columns = Math.max(...rows.map((row) => row.length));
  const columnWidth = pageWidth / columns;
  const padding = 5;
  const rtl = isRtlTable(rows);

  for (const [rowIndex, row] of rows.entries()) {
    const heights = Array.from({ length: columns }, (_, columnIndex) => {
      const value = row[columnIndex] || '';
      return doc.heightOfString(value, { width: columnWidth - padding * 2 }) + padding * 2;
    });
    const rowHeight = Math.max(24, ...heights);

    ensurePdfSpace(doc, rowHeight + 8);
    const startY = doc.y;

    for (let columnIndex = 0; columnIndex < columns; columnIndex++) {
      const visualIndex = rtl ? columns - 1 - columnIndex : columnIndex;
      const x = doc.page.margins.left + visualIndex * columnWidth;
      const value = row[columnIndex] || '';

      doc.rect(x, startY, columnWidth, rowHeight)
        .fillAndStroke(rowIndex === 0 ? '#E5E7EB' : '#FFFFFF', '#CBD5E1');
      writePdfTextWithScript(doc, unicodeToPdfMarkers(value), {
        x: x + padding,
        y: startY + padding,
        width: columnWidth - padding * 2,
        fontSize: rowIndex === 0 ? fontSize + 0.5 : fontSize,
      });
    }

    doc.y = startY + rowHeight;
  }

  resetPdfTextState(doc);
}

function drawStackedPdfTable(doc: PDFKit.PDFDocument, rows: string[][], fontSize = 8) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const headers = rows[0] || [];
  const padding = 5;
  const labelWidth = Math.min(150, pageWidth * 0.32);
  const valueWidth = pageWidth - labelWidth;
  const rtl = isRtlTable(rows);

  for (const [rowIndex, row] of rows.slice(1).entries()) {
    ensurePdfSpace(doc, 34);

    const firstCell = String(row[0] || '').trim();
    const useFirstCellAsTitle = Boolean(firstCell && firstCell.length <= 80 && headers.length > 2);
    const rowTitle = useFirstCellAsTitle ? firstCell : `Row ${rowIndex + 1}`;
    const titleY = doc.y;
    doc.rect(doc.page.margins.left, titleY, pageWidth, 22)
      .fillAndStroke('#E5E7EB', '#CBD5E1');
    writePdfTextWithScript(doc, unicodeToPdfMarkers(rowTitle), {
      x: doc.page.margins.left + padding,
      y: titleY + 5,
      width: pageWidth - padding * 2,
      fontSize: fontSize + 0.5,
      font: 'Helvetica-Bold',
    });
    doc.y = titleY + 22;

    const startColumn = useFirstCellAsTitle ? 1 : 0;

    for (let columnIndex = startColumn; columnIndex < headers.length; columnIndex++) {
      const label = String(headers[columnIndex] || `Column ${columnIndex + 1}`);
      const value = String(row[columnIndex] || '');
      const labelHeight = doc.fontSize(fontSize).heightOfString(label, { width: labelWidth - padding * 2 });
      const valueHeight = doc.fontSize(fontSize).heightOfString(value, { width: valueWidth - padding * 2 });
      const pairHeight = Math.max(22, labelHeight + padding * 2, valueHeight + padding * 2);

      ensurePdfSpace(doc, pairHeight + 6);
      const startY = doc.y;
      const x = doc.page.margins.left;
      const labelX = rtl ? x + valueWidth : x;
      const valueX = rtl ? x : x + labelWidth;

      doc.rect(labelX, startY, labelWidth, pairHeight)
        .fillAndStroke('#F8FAFC', '#CBD5E1');
      doc.rect(valueX, startY, valueWidth, pairHeight)
        .fillAndStroke('#FFFFFF', '#CBD5E1');

      writePdfTextWithScript(doc, unicodeToPdfMarkers(label), {
        x: labelX + padding,
        y: startY + padding,
        width: labelWidth - padding * 2,
        fontSize,
        font: 'Helvetica-Bold',
      });
      writePdfTextWithScript(doc, unicodeToPdfMarkers(value), {
        x: valueX + padding,
        y: startY + padding,
        width: valueWidth - padding * 2,
        fontSize,
      });

      doc.y = startY + pairHeight;
    }

    doc.y += 8;
  }

  resetPdfTextState(doc);
}

function resetPdfTextState(doc: PDFKit.PDFDocument) {
  doc.x = doc.page.margins.left;
  doc.fillColor('#111827');
  doc.font('Helvetica');
}

function ensurePdfSpace(doc: PDFKit.PDFDocument, neededHeight: number) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + neededHeight > bottom) {
    doc.addPage();
  }
}

function getPdfRemainingHeight(doc: PDFKit.PDFDocument) {
  return doc.page.height - doc.page.margins.bottom - doc.y;
}

function getPdfUsableHeight(doc: PDFKit.PDFDocument) {
  return doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function toSlideBullets(text: string) {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(0, 7);

  return sentences.length ? sentences : [text.slice(0, 900)];
}

function toSlideBulletText(text: string) {
  return toSlideBullets(text).join('\n');
}

function safeFilename(value: string) {
  return value.replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-') || 'document';
}

function safeSheetName(value: string) {
  return value.replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Sheet';
}
