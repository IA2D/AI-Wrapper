import PDFDocument from 'pdfkit';

export interface PDFContent {
  title?: string;
  sections: {
    heading?: string;
    content: string;
    type?: 'paragraph' | 'list' | 'table';
    items?: string[];
    rows?: string[][];
  }[];
}

// Color palette
const COLORS = {
  primary: '#2563eb',
  secondary: '#64748b',
  text: '#1e293b',
  heading: '#0f172a',
  accent: '#dc2626',
  white: '#ffffff',
  border: '#e2e8f0',
};

const PAGE = {
  margin: 50,
  width: 595.28,
  height: 841.89,
  bottomMargin: 50,
};

// Emoji to text mapping - converts emojis to text descriptions
const emojiMap: Record<string, string> = {
  '\uD83D\uDE0A': '(smile)',       // �
  '\uD83D\uDE02': '(laugh)',       // 😂
  '\uD83E\uDD72': '(sad)',         // 🥲
  '\u2764\uFE0F': '(heart)',       // ❤️
  '\uD83D\uDC4D': '(thumbs up)',   // 👍
  '\uD83D\uDC4E': '(thumbs down)', // �
  '\uD83D\uDD25': '(fire)',        // 🔥
  '\u2B50': '(star)',             // ⭐
  '\u2705': '(check)',            // ✅
  '\u274C': '(cross)',            // ❌
  '\u26A0\uFE0F': '(warning)',      // ⚠️
  '\uD83D\uDCA1': '(idea)',        // 💡
  '\uD83D\uDCCC': '(pin)',         // 📌
  '\uD83D\uDCCD': '(location)',    // 📍
  '\uD83C\uDF89': '(celebrate)',   // 🎉
  '\uD83D\uDE80': '(rocket)',      // 🚀
  '\uD83D\uDCAF': '(100)',         // 💯
  '\uD83D\uDCCA': '(chart)',       // 📊
  '\uD83D\uDCC8': '(up)',          // 📈
  '\uD83D\uDCC9': '(down)',        // 📉
  '\uD83D\uDCB0': '(money)',       // 💰
  '\u23F0': '(clock)',            // ⏰
  '\uD83D\uDCC5': '(calendar)',    // 📅
  '\uD83D\uDCC1': '(folder)',      // 📁
  '\uD83D\uDCC4': '(document)',     // 📄
  '\u270F\uFE0F': '(edit)',         // ✏️
  '\uD83D\uDDD1\uFE0F': '(delete)',  // 🗑️
  '\uD83D\uDD0D': '(search)',      // 🔍
  '\uD83D\uDD17': '(link)',        // �
  '\uD83D\uDD12': '(lock)',        // 🔒
  '\uD83D\uDD13': '(unlock)',      // 🔓
  '\uD83C\uDF0D': '(globe)',       // 🌍
  '\uD83C\uDF1F': '(glow star)',   // 🌟
  '\uD83D\uDCAC': '(chat)',        // �
  '\uD83D\uDCE2': '(announce)',    // 📢
  '\uD83C\uDFAF': '(target)',      // �
  '\uD83C\uDFC6': '(trophy)',      // 🏆
  '\uD83C\uDFA8': '(art)',         // 🎨
  '\uD83C\uDFB5': '(music)',       // �
  '\uD83C\uDFAC': '(video)',       // 🎬
  '\uD83D\uDCF8': '(camera)',      // �
  '\uD83D\uDCF1': '(phone)',       // �
  '\uD83D\uDCBB': '(computer)',     // 💻
  '\u2328\uFE0F': '(keyboard)',     // ⌨️
  '\uD83D\uDDB1\uFE0F': '(mouse)',   // 🖱️
  '\uD83D\uDDA8\uFE0F': '(printer)', // 🖨️
  '\uD83D\uDCE1': '(satellite)',    // 📡
  '\uD83D\uDD0B': '(battery)',      // 🔋
  '\uD83D\uDD0C': '(plug)',         // 🔌
  '\uD83D\uDD26': '(flashlight)',  // 🔦
  '\uD83D\uDD6F\uFE0F': '(candle)',  // �️
  '\uD83D\uDDC2\uFE0F': '(divider)', // 🗂️
};

// Convert hex to RGB
function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [
        parseInt(result[1], 16) / 255,
        parseInt(result[2], 16) / 255,
        parseInt(result[3], 16) / 255,
      ]
    : [0, 0, 0];
}

// Clean emojis from text
function cleanEmojis(text: string): string {
  let cleaned = text;
  for (const [emoji, replacement] of Object.entries(emojiMap)) {
    cleaned = cleaned.split(emoji).join(` ${replacement} `);
  }
  // Remove any remaining emojis
  return cleaned.replace(
    /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F100}-\u{1F1FF}\u{1F200}-\u{1F2FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu,
    ''
  );
}

// Check if text has Arabic
function hasArabic(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

/**
 * Generate a PDF buffer from structured content with Unicode support
 */
export async function generatePDF(content: PDFContent): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ margin: PAGE.margin, size: 'A4' });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Helper to set hex color
      const setColor = (hex: string) => {
        const [r, g, b] = hexToRgb(hex);
        doc.fillColor([r, g, b]);
      };

      // Add title with color
      if (content.title) {
        const cleanedTitle = cleanEmojis(content.title);
        const isArabic = hasArabic(cleanedTitle);
        
        doc.fontSize(24).font('Helvetica-Bold');
        setColor(COLORS.heading);
        doc.text(cleanedTitle, { align: 'center' });
        doc.moveDown(2);
      }

      // Add sections
      content.sections.forEach((section) => {
        const sectionHasArabic = hasArabic(section.content) || 
          (section.heading ? hasArabic(section.heading) : false);

        // Add heading with color
        if (section.heading) {
          const cleanedHeading = cleanEmojis(section.heading);
          
          doc.fontSize(16).font('Helvetica-Bold');
          setColor(COLORS.primary);
          doc.text(cleanedHeading);
          doc.moveDown(0.5);
        }

        // Handle different content types
        switch (section.type) {
          case 'list':
            if (section.items) {
              doc.fontSize(12).font('Helvetica');
              setColor(COLORS.text);
              section.items.forEach((item) => {
                const cleanedItem = cleanEmojis(item);
                doc.text(`• ${cleanedItem}`, { indent: 20 });
              });
            }
            break;

          case 'table':
            if (section.rows && section.rows.length > 0) {
              const tableX = PAGE.margin;
              const tableWidth = PAGE.width - PAGE.margin * 2;
              const columnWidth = tableWidth / Math.max(...section.rows.map((row) => row.length));
              const minCellHeight = 25;
              const cellPadding = 5;
              let y = doc.y;
              
              section.rows.forEach((row, rowIndex) => {
                const cleanedCells = row.map(cleanEmojis);
                const cellHeight = Math.max(
                  minCellHeight,
                  ...cleanedCells.map((cell) =>
                    doc
                      .font(rowIndex === 0 ? 'Helvetica-Bold' : 'Helvetica')
                      .fontSize(10)
                      .heightOfString(cell, {
                        width: columnWidth - cellPadding * 2,
                      }) + cellPadding * 2
                  )
                );

                if (y + cellHeight > PAGE.height - PAGE.bottomMargin) {
                  doc.addPage();
                  y = PAGE.margin;
                }
                
                let x = tableX;
                
                // Header background
                if (rowIndex === 0) {
                  const [r, g, b] = hexToRgb(COLORS.primary);
                  doc.rect(tableX, y, columnWidth * row.length, cellHeight).fill([r, g, b]);
                }
                
                cleanedCells.forEach((cleanedCell) => {
                  // Cell border
                  const [br, bg, bb] = hexToRgb(COLORS.border);
                  doc.rect(x, y, columnWidth, cellHeight).stroke([br, bg, bb]);
                  
                  // Cell text
                  doc.font(rowIndex === 0 ? 'Helvetica-Bold' : 'Helvetica')
                     .fontSize(10)
                     .fillColor(rowIndex === 0 ? 'white' : COLORS.text);
                  doc.text(cleanedCell, x + cellPadding, y + cellPadding, {
                    width: columnWidth - cellPadding * 2,
                    height: cellHeight - cellPadding * 2,
                  });
                  
                  x += columnWidth;
                });
                
                y += cellHeight;
              });

              doc.x = PAGE.margin;
              doc.y = y + 12;
            }
            break;

          case 'paragraph':
          default:
            const cleanedContent = cleanEmojis(section.content);
            
            doc.fontSize(12).font('Helvetica');
            setColor(COLORS.text);
            doc.text(cleanedContent, {
              align: sectionHasArabic ? 'right' : 'justify',
              lineGap: 5,
            });
            break;
        }

        doc.moveDown(1);
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Validate PDF content structure
 */
export function validatePDFContent(content: unknown): content is PDFContent {
  if (typeof content !== 'object' || content === null) {
    return false;
  }

  const pdfContent = content as PDFContent;

  if (!Array.isArray(pdfContent.sections)) {
    return false;
  }

  return pdfContent.sections.every((section) => {
    return typeof section.content === 'string';
  });
}
