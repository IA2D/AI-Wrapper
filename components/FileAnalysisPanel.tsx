'use client';

import { useState, useCallback } from 'react';
import { DocumentFile, FileAnalysisTab, generateId } from '@/types';
import { useFileAnalysis } from '@/hooks/useFileAnalysis';

interface FileAnalysisPanelProps {
  thinkingMode: boolean;
}

const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.xlsx', '.xls'];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export default function FileAnalysisPanel({ thinkingMode }: FileAnalysisPanelProps) {
  const [activeTab, setActiveTab] = useState<FileAnalysisTab>('analyze');
  const [selectedFile, setSelectedFile] = useState<DocumentFile | null>(null);
  const [prompt, setPrompt] = useState('');
  const [editPrompt, setEditPrompt] = useState('Make this more professional and well-structured');
  const [newTitle, setNewTitle] = useState('');
  const [outputFormat, setOutputFormat] = useState<'text' | 'structured' | 'pdf'>('pdf');
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [generateTitle, setGenerateTitle] = useState('');
  const [generatePageCount, setGeneratePageCount] = useState(3);
  const [dragActive, setDragActive] = useState(false);

  const {
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
  } = useFileAnalysis();

  const getFileType = (filename: string): DocumentFile['type'] => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (ext === 'docx' || ext === 'doc') return 'docx';
    if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
    return 'unknown';
  };

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    if (file.size > MAX_FILE_SIZE) {
      return { valid: false, error: 'File size exceeds 20MB limit' };
    }
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      return { valid: false, error: `Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}` };
    }
    return { valid: true };
  };

  const handleFileSelect = useCallback((file: File) => {
    clearError();
    const validation = validateFile(file);
    if (!validation.valid) {
      alert(validation.error);
      return;
    }

    const docFile: DocumentFile = {
      file,
      id: generateId(),
      name: file.name,
      size: file.size,
      type: getFileType(file.name),
    };
    setSelectedFile(docFile);
    resetResults();
  }, [clearError, resetResults]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = '';
  }, [handleFileSelect]);

  const handleAnalyze = async () => {
    if (!selectedFile) return;
    await analyzeFile(selectedFile, prompt || undefined, thinkingMode);
  };

  const handleEdit = async () => {
    if (!selectedFile) return;
    await editFile(selectedFile, editPrompt, outputFormat, thinkingMode, newTitle || undefined);
  };

  const handleGeneratePDF = async () => {
    if (!generatePrompt.trim()) return;
    
    const structured = await generateStructuredContent(
      generatePrompt,
      generateTitle || undefined,
      thinkingMode,
      generatePageCount
    );
    if (structured) {
      const blob = await generatePDF(structured, generateTitle || 'generated-document');
      if (blob) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${generateTitle || 'document'}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const renderAnalyzeTab = () => (
    <div className="space-y-4">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20' : 'border-gray-300 dark:border-gray-600'
        }`}
      >
        <input
          type="file"
          accept=".pdf,.docx,.doc,.xlsx,.xls"
          onChange={handleFileInputChange}
          className="hidden"
          id="analyze-file-input"
        />
        <label htmlFor="analyze-file-input" className="cursor-pointer">
          <div className="text-gray-500 dark:text-gray-400">
            <svg className="mx-auto h-12 w-12 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-lg font-medium">Drop a file here or click to upload</p>
            <p className="text-sm mt-2">PDF, Word, or Excel (max 20MB)</p>
          </div>
        </label>
      </div>

      {selectedFile && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <svg className="h-8 w-8 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{selectedFile.name}</p>
                <p className="text-sm text-gray-500">{formatFileSize(selectedFile.size)} • {selectedFile.type.toUpperCase()}</p>
              </div>
            </div>
            <button
              onClick={() => { setSelectedFile(null); resetResults(); }}
              className="text-red-500 hover:text-red-700"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Enter custom prompt (optional, default: Summarize this document)"
        className="w-full p-3 border rounded-lg resize-none h-24 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
      />

      <button
        onClick={handleAnalyze}
        disabled={!selectedFile || isAnalyzing}
        className="w-full bg-teal-600 text-white py-3 rounded-lg font-medium hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isAnalyzing ? 'Analyzing...' : 'Analyze File'}
      </button>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg">
          {error}
        </div>
      )}

      {analysisResult && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-4">
          <div className="border-b pb-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">Analysis Results</h3>
            <p className="text-sm text-gray-500">{analysisResult.metadata.filename} • {analysisResult.metadata.fileType.toUpperCase()}</p>
          </div>
          <div className="prose dark:prose-invert max-w-none">
            <div className="whitespace-pre-wrap text-gray-800 dark:text-gray-200">{analysisResult.analysis}</div>
          </div>
          {analysisResult.originalText && (
            <details className="text-sm">
              <summary className="cursor-pointer text-teal-600 hover:text-teal-800">View original text (first 1000 chars)</summary>
              <div className="mt-2 p-3 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                {analysisResult.originalText}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );

  const renderEditTab = () => (
    <div className="space-y-4">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-300 dark:border-gray-600'
        }`}
      >
        <input
          type="file"
          accept=".pdf,.docx,.doc,.xlsx,.xls"
          onChange={handleFileInputChange}
          className="hidden"
          id="edit-file-input"
        />
        <label htmlFor="edit-file-input" className="cursor-pointer">
          <div className="text-gray-500 dark:text-gray-400">
            <svg className="mx-auto h-12 w-12 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <p className="text-lg font-medium">Drop a file to edit or click to upload</p>
            <p className="text-sm mt-2">AI will edit and generate a new PDF</p>
          </div>
        </label>
      </div>

      {selectedFile && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <svg className="h-8 w-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{selectedFile.name}</p>
                <p className="text-sm text-gray-500">{formatFileSize(selectedFile.size)}</p>
              </div>
            </div>
            <button
              onClick={() => { setSelectedFile(null); resetResults(); }}
              className="text-red-500 hover:text-red-700"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Edit Instructions
        </label>
        <textarea
          value={editPrompt}
          onChange={(e) => setEditPrompt(e.target.value)}
          placeholder="Describe how you want the AI to edit this document..."
          className="w-full p-3 border rounded-lg resize-none h-24 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          New Document Title (optional)
        </label>
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Enter title for the edited document"
          className="w-full p-3 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Output Format
        </label>
        <select
          value={outputFormat}
          onChange={(e) => setOutputFormat(e.target.value as 'text' | 'structured' | 'pdf')}
          className="w-full p-3 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white"
        >
          <option value="pdf">PDF Document (Download)</option>
          <option value="text">Plain Text</option>
          <option value="structured">Structured JSON</option>
        </select>
      </div>

      <button
        onClick={handleEdit}
        disabled={!selectedFile || isEditing}
        className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isEditing ? 'Editing...' : outputFormat === 'pdf' ? 'Edit & Download PDF' : 'Edit File'}
      </button>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg">
          {error}
        </div>
      )}

      {editResult && outputFormat !== 'pdf' && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Edited Content</h3>
          {editResult.editedContent && (
            <div className="whitespace-pre-wrap text-gray-800 dark:text-gray-200 prose dark:prose-invert max-w-none">
              {editResult.editedContent}
            </div>
          )}
          {editResult.structuredContent && (
            <pre className="mt-4 p-3 bg-gray-100 dark:bg-gray-700 rounded text-sm overflow-auto">
              {JSON.stringify(editResult.structuredContent, null, 2)}
            </pre>
          )}
        </div>
      )}

      {editResult?.format === 'pdf' && (
        <div className="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 p-4 rounded-lg">
          PDF has been downloaded successfully!
        </div>
      )}
    </div>
  );

  const renderGenerateTab = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Document Title (optional)
        </label>
        <input
          type="text"
          value={generateTitle}
          onChange={(e) => setGenerateTitle(e.target.value)}
          placeholder="Example: Climate Change Research Report"
          className="w-full p-3 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Prompt for the PDF
        </label>
        <textarea
          value={generatePrompt}
          onChange={(e) => setGeneratePrompt(e.target.value)}
          placeholder="Describe the PDF you want. Example: Create a 5-page research report about climate change with an introduction, causes, impacts, mitigation strategies, and two comparison tables."
          className="w-full p-3 border rounded-lg resize-none h-48 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Page Count
        </label>
        <select
          value={generatePageCount}
          onChange={(e) => setGeneratePageCount(Number(e.target.value))}
          className="w-full p-3 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white"
        >
          {Array.from({ length: 20 }, (_, index) => index + 1).map((count) => (
            <option key={count} value={count}>
              {count} {count === 1 ? 'page' : 'pages'}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={handleGeneratePDF}
        disabled={!generatePrompt.trim() || isGenerating}
        className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isGenerating ? 'Generating...' : 'Generate PDF'}
      </button>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg">
          {error}
        </div>
      )}
    </div>
  );

  return (
    <div className="w-full max-w-4xl mx-auto bg-white dark:bg-gray-900 rounded-xl shadow-lg overflow-hidden">
      {/* Header Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => { setActiveTab('analyze'); setSelectedFile(null); resetResults(); }}
          className={`flex-1 py-4 px-6 text-center font-medium transition-colors ${
            activeTab === 'analyze'
              ? 'text-teal-600 border-b-2 border-teal-600 bg-teal-50 dark:bg-teal-900/20'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <div className="flex items-center justify-center space-x-2">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Analyze File</span>
          </div>
        </button>
        <button
          onClick={() => { setActiveTab('edit'); setSelectedFile(null); resetResults(); }}
          className={`flex-1 py-4 px-6 text-center font-medium transition-colors ${
            activeTab === 'edit'
              ? 'text-green-600 border-b-2 border-green-600 bg-green-50 dark:bg-green-900/20'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <div className="flex items-center justify-center space-x-2">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span>Edit & Export</span>
          </div>
        </button>
        <button
          onClick={() => { setActiveTab('generate'); resetResults(); }}
          className={`flex-1 py-4 px-6 text-center font-medium transition-colors ${
            activeTab === 'generate'
              ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50 dark:bg-purple-900/20'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <div className="flex items-center justify-center space-x-2">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Generate PDF</span>
          </div>
        </button>
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === 'analyze' && renderAnalyzeTab()}
        {activeTab === 'edit' && renderEditTab()}
        {activeTab === 'generate' && renderGenerateTab()}
      </div>
    </div>
  );
}
