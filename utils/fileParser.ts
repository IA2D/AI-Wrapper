import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

export interface ParsedFileContent {
  text: string;
  metadata: {
    filename: string;
    fileType: string;
    pageCount?: number;
    sheetCount?: number;
  };
}

/**
 * Parse PDF file buffer to text
 */
export async function parsePDF(buffer: Buffer, filename: string): Promise<ParsedFileContent> {
  try {
    const data = await pdfParse(buffer);
    return {
      text: data.text,
      metadata: {
        filename,
        fileType: 'pdf',
        pageCount: data.numpages,
      },
    };
  } catch (error) {
    throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse Word document (.docx) file buffer to text
 */
export async function parseWordDoc(buffer: Buffer, filename: string): Promise<ParsedFileContent> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: result.value,
      metadata: {
        filename,
        fileType: 'docx',
      },
    };
  } catch (error) {
    throw new Error(`Failed to parse Word document: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse Excel file buffer to text (converts all sheets to readable format)
 */
export async function parseExcel(buffer: Buffer, filename: string): Promise<ParsedFileContent> {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    let fullText = '';

    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      fullText += `\n--- Sheet: ${sheetName} ---\n`;
      
      jsonData.forEach((row: unknown) => {
        if (Array.isArray(row)) {
          fullText += row.join('\t') + '\n';
        }
      });
    });

    return {
      text: fullText.trim(),
      metadata: {
        filename,
        fileType: 'xlsx',
        sheetCount: workbook.SheetNames.length,
      },
    };
  } catch (error) {
    throw new Error(`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Determine file type from filename extension
 */
export function getFileType(filename: string): 'pdf' | 'docx' | 'xlsx' | 'unknown' {
  const extension = filename.split('.').pop()?.toLowerCase();
  
  if (extension === 'pdf') return 'pdf';
  if (extension === 'docx' || extension === 'doc') return 'docx';
  if (extension === 'xlsx' || extension === 'xls') return 'xlsx';
  
  return 'unknown';
}

/**
 * Parse file based on its type
 */
export async function parseFile(
  buffer: Buffer,
  filename: string
): Promise<ParsedFileContent> {
  const fileType = getFileType(filename);

  switch (fileType) {
    case 'pdf':
      return parsePDF(buffer, filename);
    case 'docx':
      return parseWordDoc(buffer, filename);
    case 'xlsx':
      return parseExcel(buffer, filename);
    default:
      throw new Error(`Unsupported file type: ${fileType}. Supported types: PDF, DOCX, XLSX`);
  }
}
