'use client';

import { PDFAttachment } from '@/types';

interface PDFContextChipsProps {
  pdfs: PDFAttachment[];
  onRemove?: (docId: string) => void;
  isLoading?: boolean;
}

export default function PDFContextChips({ pdfs, onRemove, isLoading }: PDFContextChipsProps) {
  if (pdfs.length === 0 && !isLoading) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {isLoading && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full text-sm text-amber-700 animate-pulse">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <span>Processing PDF...</span>
        </div>
      )}
      
      {pdfs.map((pdf) => (
        <div
          key={pdf.docId}
          className="flex items-center gap-2 px-3 py-1.5 bg-teal-50 border border-teal-200 rounded-full text-sm text-teal-800 group"
          title={`${pdf.name} (${pdf.pageCount} pages, ${pdf.chunkCount} chunks)`}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="max-w-[150px] truncate">{pdf.name}</span>
          <span className="text-xs text-teal-600">({pdf.pageCount}p)</span>
          
          {onRemove && (
            <button
              onClick={() => onRemove(pdf.docId)}
              className="ms-1 p-0.5 rounded-full hover:bg-teal-200 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label={`Remove ${pdf.name}`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      ))}
      
      {pdfs.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>PDF context active</span>
        </div>
      )}
    </div>
  );
}
