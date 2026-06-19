'use client';

import { useState, useCallback } from 'react';
import { DocumentFile, FileAnalysisResult, FileEditResult, PDFContentStructure } from '@/types';

async function pollGenerateJob(jobId: string): Promise<PDFContentStructure> {
  const maxAttempts = 180;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const response = await fetch(`/api/generate-file?jobId=${encodeURIComponent(jobId)}`);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || `Failed to check generation job: ${response.status}`);
    }

    if (data.status === 'completed') {
      return data.content as PDFContentStructure;
    }

    if (data.status === 'failed') {
      throw new Error(data.error || 'PDF content generation failed');
    }
  }

  throw new Error('PDF content generation timed out');
}

interface UseFileAnalysisReturn {
  // State
  isAnalyzing: boolean;
  isEditing: boolean;
  isGenerating: boolean;
  error: string | null;
  analysisResult: FileAnalysisResult | null;
  editResult: FileEditResult | null;
  
  // Actions
  analyzeFile: (file: DocumentFile, prompt?: string, thinkingMode?: boolean) => Promise<void>;
  editFile: (
    file: DocumentFile,
    editPrompt: string,
    outputFormat: 'text' | 'structured' | 'pdf',
    thinkingMode?: boolean,
    newTitle?: string
  ) => Promise<void>;
  generatePDF: (content: PDFContentStructure, filename?: string) => Promise<Blob | null>;
  generateStructuredContent: (
    prompt: string,
    title?: string,
    thinkingMode?: boolean,
    pageCount?: number
  ) => Promise<PDFContentStructure | null>;
  clearError: () => void;
  resetResults: () => void;
}

export function useFileAnalysis(): UseFileAnalysisReturn {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<FileAnalysisResult | null>(null);
  const [editResult, setEditResult] = useState<FileEditResult | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const resetResults = useCallback(() => {
    setAnalysisResult(null);
    setEditResult(null);
    setError(null);
  }, []);

  const analyzeFile = useCallback(async (
    file: DocumentFile,
    prompt?: string,
    thinkingMode?: boolean
  ) => {
    setIsAnalyzing(true);
    setError(null);
    setAnalysisResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file.file);
      if (prompt) formData.append('prompt', prompt);
      if (thinkingMode) formData.append('thinkingMode', 'true');

      const response = await fetch('/api/analyze-file', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        const error = new Error(errorData.error || `Request failed: ${response.status}`);
        (error as any).details = {
          status: response.status,
          statusText: response.statusText,
          ...errorData,
        };
        throw error;
      }

      const result: FileAnalysisResult = await response.json();
      setAnalysisResult(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze file';
      setError(message);
      console.error('Analyze file error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const editFile = useCallback(async (
    file: DocumentFile,
    editPrompt: string,
    outputFormat: 'text' | 'structured' | 'pdf',
    thinkingMode?: boolean,
    newTitle?: string
  ) => {
    setIsEditing(true);
    setError(null);
    setEditResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file.file);
      formData.append('editPrompt', editPrompt);
      formData.append('outputFormat', outputFormat);
      if (thinkingMode) formData.append('thinkingMode', 'true');
      if (newTitle) formData.append('newTitle', newTitle);

      const response = await fetch('/api/edit-file', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        const error = new Error(errorData.error || `Request failed: ${response.status}`);
        (error as any).details = {
          status: response.status,
          statusText: response.statusText,
          ...errorData,
        };
        throw error;
      }

      // Handle PDF response
      if (outputFormat === 'pdf') {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${newTitle || 'edited-document'}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        setEditResult({
          success: true,
          originalFile: { filename: file.name, fileType: file.type },
          format: 'pdf',
        });
      } else {
        const result: FileEditResult = await response.json();
        setEditResult(result);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to edit file';
      setError(message);
      console.error('Edit file error:', err);
    } finally {
      setIsEditing(false);
    }
  }, []);

  const generatePDF = useCallback(async (
    content: PDFContentStructure,
    filename?: string
  ): Promise<Blob | null> => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/create-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, filename }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Request failed: ${response.status}`);
      }

      return await response.blob();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate PDF';
      setError(message);
      console.error('Generate PDF error:', err);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const generateStructuredContent = useCallback(async (
    prompt: string,
    title?: string,
    thinkingMode?: boolean,
    pageCount?: number
  ): Promise<PDFContentStructure | null> => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/generate-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          title,
          pageCount,
          format: 'structured',
          thinkingMode,
          async: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        const error = new Error(errorData.error || `Request failed: ${response.status}`);
        (error as any).details = {
          status: response.status,
          statusText: response.statusText,
          ...errorData,
        };
        throw error;
      }

      const result = await response.json();
      if (result.content) {
        return result.content as PDFContentStructure;
      }

      if (!result.jobId) {
        throw new Error('Generate request did not return a job ID');
      }

      return await pollGenerateJob(result.jobId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate structured content';
      setError(message);
      console.error('Generate structured content error:', {
        error: err,
        details: err instanceof Error ? (err as any).details : undefined,
      });
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  return {
    isAnalyzing,
    isEditing,
    isGenerating,
    error,
    analysisResult,
    editResult,
    analyzeFile,
    editFile,
    generatePDF,
    generateStructuredContent,
    clearError,
    resetResults,
  };
}
