'use client';

import { validateFileType, generateId } from '@/types';
import { useState } from 'react';

interface SelectedFile {
  id: string;
  file: File;
  error?: string;
}

interface FileUploadProps {
  selectedFiles: SelectedFile[];
  onFileSelect: (files: SelectedFile[]) => void;
  onFileRemove: (fileId: string) => void;
}

export default function FileUpload({
  selectedFiles,
  onFileSelect,
  onFileRemove,
}: FileUploadProps) {
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const newFiles: SelectedFile[] = [];
    let hasError = false;

    Array.from(files).forEach((file) => {
      const validation = validateFileType(file);
      
      if (!validation.valid) {
        setErrorMessage(validation.error || 'Invalid file type');
        hasError = true;
      } else {
        newFiles.push({
          id: generateId(),
          file,
        });
      }
    });

    if (newFiles.length > 0) {
      onFileSelect([...selectedFiles, ...newFiles]);
      setErrorMessage('');
    }

    // Reset input to allow selecting the same file again
    event.target.value = '';
  };

  const handleRemove = (fileId: string) => {
    onFileRemove(fileId);
    setErrorMessage('');
  };

  return (
    <div className="space-y-2">
      {/* File input button */}
      <div className="flex items-center gap-2">
        <label
          htmlFor="file-upload"
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
            />
          </svg>
          Attach Files
        </label>
        <input
          id="file-upload"
          type="file"
          multiple
          onChange={handleFileChange}
          className="hidden"
          accept=".pdf,.docx,.txt,.mp4,.mov,.avi,.jpg,.jpeg,.png,.gif,.webp"
        />
      </div>

      {/* Error message */}
      {errorMessage && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {errorMessage}
        </div>
      )}

      {/* Selected files list */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          {selectedFiles.map((selectedFile) => (
            <div
              key={selectedFile.id}
              className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <svg
                  className="w-5 h-5 text-gray-500 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span className="text-sm text-gray-900 truncate">
                  {selectedFile.file.name}
                </span>
                <span className="text-xs text-gray-500 flex-shrink-0">
                  ({Math.round(selectedFile.file.size / 1024)} KB)
                </span>
              </div>
              <button
                onClick={() => handleRemove(selectedFile.id)}
                className="flex-shrink-0 p-1 text-gray-400 hover:text-red-600 transition-colors"
                aria-label={`Remove ${selectedFile.file.name}`}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
