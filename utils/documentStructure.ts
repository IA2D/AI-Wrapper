import { PDFContentStructure } from '@/types';

type Section = PDFContentStructure['sections'][number];

export function valueToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    const sanitized = unwrapInlineContentWrappers(value);
    const trimmed = sanitized.trim();

    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed !== value) {
          return valueToText(parsed);
        }
      } catch {
        const looseContentMatch = trimmed.match(/^\{\s*"content"\s*:\s*"([\s\S]*)"\s*\}$/);
        if (looseContentMatch) {
          return looseContentMatch[1].replace(/\\"/g, '"');
        }
        return sanitized;
      }
    }

    return sanitized;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(valueToText).filter(Boolean).join('\n');

  const record = value as Record<string, unknown>;
  if (typeof record.text === 'string') return record.text;
  if (typeof record.content === 'string') return record.content;
  if (typeof record.value === 'string') return record.value;
  if (typeof record.label === 'string') return record.label;

  return JSON.stringify(value);
}

function unwrapInlineContentWrappers(value: string) {
  return value.replace(
    /\{\s*['"]content['"]\s*:\s*(["'])([\s\S]*?)\1\s*(?:,\s*[^}]*)?\}/g,
    (_, __quote, inner: string) => inner
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\')
  );
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

function stripTags(value: string) {
  return decodeEntities(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function renderInlineMathLegacy(value: string): string {
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

  function toSubscript(str: string): string {
    return str.split('').map(c => subscriptMap[c] || c).join('');
  }

  function toSuperscript(str: string): string {
    return str.split('').map(c => superscriptMap[c] || c).join('');
  }

  return value
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/ext\{([^}]+)\}/g, '$1')
    .replace(/\^\{([^}]+)\}/g, (_, num) => toSuperscript(num))
    .replace(/\^([0-9a-zA-Z+-=()])/g, (_, num) => toSuperscript(num))
    .replace(/_\{([^}]+)\}/g, (_, num) => toSubscript(num))
    .replace(/_([0-9a-zA-Z+-=()])/g, (_, num) => toSubscript(num))
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
    .replace(/\\circ\b/g, '°')
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

function renderMathInText(text: string): string {
  return text.replace(/\$([^$]+)\$/g, (_, math) => renderInlineMath(math));
}

function renderInlineMath(value: string): string {
  const subscriptMap: Record<string, string> = {
    '0': '\u2080', '1': '\u2081', '2': '\u2082', '3': '\u2083', '4': '\u2084', '5': '\u2085',
    '6': '\u2086', '7': '\u2087', '8': '\u2088', '9': '\u2089',
    '+': '\u208A', '-': '\u208B', '=': '\u208C', '(': '\u208D', ')': '\u208E',
  };
  const superscriptMap: Record<string, string> = {
    '0': '\u2070', '1': '\u00B9', '2': '\u00B2', '3': '\u00B3', '4': '\u2074', '5': '\u2075',
    '6': '\u2076', '7': '\u2077', '8': '\u2078', '9': '\u2079',
    '+': '\u207A', '-': '\u207B', '=': '\u207C', '(': '\u207D', ')': '\u207E',
  };
  const toSubscript = (str: string) => str.split('').map((char) => subscriptMap[char] || char).join('');
  const toSuperscript = (str: string) => str.split('').map((char) => superscriptMap[char] || char).join('');

  return value
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/ext\{([^}]+)\}/g, '$1')
    .replace(/\^\{([^}]+)\}/g, (_, num) => toSuperscript(num))
    .replace(/\^([0-9a-zA-Z+-=()])/g, (_, num) => toSuperscript(num))
    .replace(/_\{([^}]+)\}/g, (_, num) => toSubscript(num))
    .replace(/_([0-9a-zA-Z+-=()])/g, (_, num) => toSubscript(num))
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
    .replace(/\\circ\b/g, '\u00B0')
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

export function textWithPreservedStructure(value: unknown) {
  const raw = valueToText(value);

  return decodeEntities(raw)
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|tr|table|h[1-6])>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\s+(\d+\.\s+)/g, '\n$1')
    .replace(/\s+([a-zA-Z]\.\s+)/g, '\n$1')
    .replace(/\s+([*-]\s+)/g, '\n$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function unusedLegacyCorruptGeneratedLineCheck(line: string) {
  const compact = line.replace(/\s+/g, '');
  if (compact.length < 12) return false;

  const lettersAndDigits = compact.match(/[A-Za-z0-9\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g)?.length || 0;
  const punctuation = compact.match(/[.,;:!?()[\]{}'"`،؛؟\-–—]/g)?.length || 0;
  const mojibake = compact.match(/[ÂØÙÎÏâÃáµÊË]/g)?.length || 0;

  return (lettersAndDigits / compact.length < 0.18 && punctuation / compact.length > 0.45) || mojibake > 8;
}

function cleanCell(value: string) {
  return renderMathInText(
    stripTags(valueToText(value))
      .replace(/^\*\*(.*)\*\*$/, '$1')
      .replace(/^:(-+):?$/, '')
  ).trim();
}

function parseHtmlTables(content: string) {
  const tables: string[][][] = [];
  const withoutTables = content.replace(/<table[\s\S]*?<\/table>/gi, (table) => {
    const rows: string[][] = [];

    for (const rowMatch of table.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
      const rowHtml = rowMatch[0];
      const cells = [...rowHtml.matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)]
        .map((cell) => cleanCell(cell[1]))
        .filter(Boolean);

      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    if (rows.length > 0) {
      tables.push(rows);
    }

    return '\n';
  });

  return { tables, text: textWithPreservedStructure(withoutTables) };
}

function isMarkdownTableSeparator(line: string) {
  const cells = line.trim().split('|').filter((cell) => cell.trim().length > 0);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function parseMarkdownRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cleanCell);
}

function parseMarkdownTables(content: string) {
  const lines = content.split(/\r?\n/);
  const tables: string[][][] = [];
  const remaining: string[] = [];

  for (let index = 0; index < lines.length; index++) {
    const current = lines[index];
    const next = lines[index + 1];

    if (current?.includes('|') && next && isMarkdownTableSeparator(next)) {
      const table: string[][] = [parseMarkdownRow(current)];
      index += 2;

      while (index < lines.length && lines[index].includes('|')) {
        table.push(parseMarkdownRow(lines[index]));
        index += 1;
      }

      tables.push(table);
      index -= 1;
    } else {
      remaining.push(current);
    }
  }

  return {
    tables,
    text: remaining
      .join('\n')
      .replace(/\*\*(Table\s+\d+(?:\.\d+)?:.*?)\*\*/gi, '$1')
      .trim(),
  };
}

function parseBracketTables(content: string) {
  const tables: string[][][] = [];
  const fragments: string[][] = [];
  const withoutFragments = content.replace(/\[\s*\[[\s\S]*?\]\s*\]/g, (match) => {
    try {
      const parsed = JSON.parse(match);
      if (Array.isArray(parsed) && parsed.every((row) => Array.isArray(row))) {
        fragments.push(...parsed.map((row) => row.map(valueToText)));
        return '\n';
      }
    } catch {
      return match;
    }

    return match;
  });

  if (fragments.length > 0) {
    tables.push(fragments);
  }

  return { tables, text: withoutFragments.trim() };
}

function splitEmbeddedTables(section: Section): Section[] {
  const content = valueToText(section.content);
  const html = parseHtmlTables(content);
  const bracket = parseBracketTables(html.text);
  const markdown = parseMarkdownTables(bracket.text);
  const tables = [...html.tables, ...bracket.tables, ...markdown.tables].filter((rows) => rows.length > 0);

  if (tables.length === 0) {
    return [section];
  }

  const normalized: Section[] = [];

  if (markdown.text.trim()) {
    normalized.push({
      ...section,
      content: markdown.text.trim(),
      type: section.type === 'table' ? 'paragraph' : section.type,
      rows: undefined,
    });
  }

  tables.forEach((rows, tableIndex) => {
    normalized.push({
      id: `${section.id || section.heading || 'section'}-table-${tableIndex + 1}`,
      heading: '',
      content: '',
      type: 'table',
      rows,
      pageCount: section.pageCount,
      style: section.style,
    });
  });

  return normalized;
}

function parseStringifiedObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function normalizeDocumentContent(content: PDFContentStructure): PDFContentStructure {
  return {
    title: content.title,
    sources: content.sources,
    sections: content.sections.flatMap((section) => {
      const stringifiedSection = parseStringifiedObject(section.content);
      const sourceSection = (stringifiedSection ? { ...section, ...stringifiedSection } : section) as Section;
      const normalizedSection = {
        ...sourceSection,
        heading: valueToText(sourceSection.heading),
        content: valueToText(sourceSection.content),
        items: Array.isArray(sourceSection.items) ? sourceSection.items.map(valueToText) : undefined,
        rows: Array.isArray(sourceSection.rows)
          ? sourceSection.rows.map((row) => (
              Array.isArray(row)
                ? row.map((cell) => cleanCell(valueToText(cell)))
                : [cleanCell(valueToText(row))]
            ))
          : undefined,
      };

      if (normalizedSection.type === 'table' && normalizedSection.rows?.length) {
        return [{ ...normalizedSection, heading: '' }];
      }

      return splitEmbeddedTables(normalizedSection);
    }),
  };
}

export function getPlainSectionText(section: Section, forPdf = false) {
  const render = forPdf ? (t: string) => t : renderMathInText;

  if (section.type === 'list' && section.items?.length) {
    const content = render(valueToText(section.content));
    const items = section.items.map((item) => `- ${render(valueToText(item))}`);
    return [content, ...items].filter(Boolean).join('\n');
  }

  return render(textWithPreservedStructure(section.content));
}
