'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { generateId } from '@/types';
import type { Message, ChatRun, ChatSession, APIConfiguration, AudioAttachment, ImageAttachment, PDFAttachment } from '@/types';
import { processImageFile } from '@/utils/imageProcessing';
import { useStreamingMessage } from '@/hooks/useStreamingMessage';
import { ErrorHandler } from '@/utils/errorHandling';
import { RAGClient } from '@/services/RAGClient';
import MessageList from './MessageList';
import MessageInput from './MessageInput';

interface ChatInterfaceProps {
  session: ChatSession;
  thinkingMode: boolean;
  apiConfig: APIConfiguration;
  onUpdateSession: (session: ChatSession) => void;
  onToggleThinkingMode: () => void;
  onOpenMemories?: () => void;
}

type ChatDragAttachmentType = 'image' | 'pdf' | 'mixed' | null;

interface AvailableModel {
  id: string;
  label: string;
  provider: string;
  model: string;
  isDefault: boolean;
}

function isImageFile(file: File) {
  return file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(file.name);
}

function isPDFFile(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export default function ChatInterface({
  session,
  thinkingMode,
  apiConfig,
  onUpdateSession,
  onToggleThinkingMode,
  onOpenMemories,
}: ChatInterfaceProps) {
  const [currentInput, setCurrentInput] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedImages, setSelectedImages] = useState<ImageAttachment[]>([]);
  const [selectedAudio, setSelectedAudio] = useState<AudioAttachment[]>([]);
  const [attachedPDFs, setAttachedPDFs] = useState<PDFAttachment[]>(session.attachedPDFs || []);
  const [isLoading, setIsLoading] = useState(false);
  const [processingLabel, setProcessingLabel] = useState('Processing');
  const [isPDFUploading, setIsPDFUploading] = useState(false);
  const [chatDragType, setChatDragType] = useState<ChatDragAttachmentType>(null);
  const [error, setError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [adaptiveAvailable, setAdaptiveAvailable] = useState(false);
  const [modelSelection, setModelSelection] = useState('default');
  const pendingSessionRef = useRef<ChatSession | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const activeRunSessionIdRef = useRef<string | null>(null);
  const previousSessionIdRef = useRef(session.id);
  const runAnswerRef = useRef('');
  const runThinkingRef = useRef('');
  const pollStopRef = useRef(false);
  
  void apiConfig;
  void onToggleThinkingMode;
  const ragClient = new RAGClient();
  const {
    isStreaming,
    streamingContent,
    startStreaming,
    stopStreaming,
    resetStreaming,
    onStreamChunk,
  } = useStreamingMessage();
  const {
    streamingContent: streamingThinkingContent,
    startStreaming: startThinkingStreaming,
    stopStreaming: stopThinkingStreaming,
    resetStreaming: resetThinkingStreaming,
    onStreamChunk: onThinkingStreamChunk,
  } = useStreamingMessage();

  const handleInputChange = (text: string) => {
    setCurrentInput(text);
  };

  useEffect(() => {
    let cancelled = false;
    fetch('/api/models', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Failed to load models');
        if (!cancelled) {
          setAvailableModels(data.models || []);
          setAdaptiveAvailable(Boolean(data.adaptiveAvailable));
        }
      })
      .catch((err) => {
        if (!cancelled) console.error('Failed to load available models:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFileSelect = async (files: File[]) => {
    if (!files || files.length === 0) return;

    // Clear any previous errors
    setError(null);

    try {
      // Process each image file
      const processedImages: ImageAttachment[] = [];
      
      for (const file of files) {
        try {
          const imageAttachment = await processImageFile(file);
          processedImages.push(imageAttachment);
        } catch (err) {
          // Show validation error for this specific file
          const errorMessage = err instanceof Error ? err.message : 'Failed to process image';
          setError(`${file.name}: ${errorMessage}`);
          return; // Stop processing on first error
        }
      }

      // Add successfully processed images
      setSelectedFiles((prev) => [...prev, ...files]);
      setSelectedImages((prev) => [...prev, ...processedImages]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process images';
      setError(errorMessage);
    }
  };

  const handleFileRemove = (fileId: string) => {
    setSelectedImages((prev) => prev.filter((img) => img.id !== fileId));
    // Also remove from selectedFiles by finding matching index
    const imageIndex = selectedImages.findIndex((img) => img.id === fileId);
    if (imageIndex !== -1) {
      setSelectedFiles((prev) => prev.filter((_, idx) => idx !== imageIndex));
    }
  };

  const handleVoiceSelect = (audio: AudioAttachment) => {
    setSelectedAudio([audio]);
    setError(null);
  };

  const handleVoiceRemove = (audioId: string) => {
    setSelectedAudio((current) => current.filter((audio) => audio.id !== audioId));
  };

  const handlePDFSelect = useCallback(async (file: File) => {
    setError(null);
    setIsPDFUploading(true);

    try {
      const pdfAttachment = await ragClient.uploadPDF(file, session.id);
      
      const currentPDFs = session.attachedPDFs || attachedPDFs;
      const newPDFs = [...currentPDFs.filter((pdf) => pdf.docId !== pdfAttachment.docId), pdfAttachment];
      setAttachedPDFs(newPDFs);
      
      // Update session with attached PDFs
      const updatedSession: ChatSession = {
        ...session,
        attachedPDFs: newPDFs,
        updatedAt: new Date(),
      };
      onUpdateSession(updatedSession);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload PDF';
      setError(errorMessage);
      ErrorHandler.logError(err);
    } finally {
      setIsPDFUploading(false);
    }
  }, [attachedPDFs, session, onUpdateSession]);

  const handlePDFRemove = useCallback((docId: string) => {
    const newPDFs = attachedPDFs.filter(pdf => pdf.docId !== docId);
    setAttachedPDFs(newPDFs);
    
    // Update session
    const updatedSession: ChatSession = {
      ...session,
      attachedPDFs: newPDFs,
      updatedAt: new Date(),
    };
    onUpdateSession(updatedSession);
  }, [attachedPDFs, session, onUpdateSession]);

  const handleChatDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const items = Array.from(event.dataTransfer.items || []);
    const fileItems = items.filter((item) => item.kind === 'file');
    const hasImage = fileItems.some((item) => item.type.startsWith('image/'));
    const hasPdf = fileItems.some((item) => item.type === 'application/pdf');
    const hasUnknownFile = fileItems.some((item) => !item.type);

    if (hasImage || hasPdf || hasUnknownFile) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setChatDragType(hasImage && hasPdf ? 'mixed' : hasImage ? 'image' : hasPdf ? 'pdf' : 'mixed');
    }
  }, []);

  const handleChatDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setChatDragType(null);
    }
  }, []);

  const handleChatDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const files = Array.from(event.dataTransfer.files || []);
    const imageFiles = files.filter(isImageFile);
    const pdf = files.find(isPDFFile);

    if (imageFiles.length || pdf) {
      event.preventDefault();
      setChatDragType(null);

      if (imageFiles.length) {
        void handleFileSelect(imageFiles);
      }

      if (pdf) {
        void handlePDFSelect(pdf);
      }
    }
  }, [handleFileSelect, handlePDFSelect]);

  const resetRunDisplay = useCallback(() => {
    activeRunIdRef.current = null;
    activeRunSessionIdRef.current = null;
    runAnswerRef.current = '';
    runThinkingRef.current = '';
    setIsLoading(false);
    setProcessingLabel('Processing');
    pendingSessionRef.current = null;
    resetStreaming();
    resetThinkingStreaming();
  }, [resetStreaming, resetThinkingStreaming]);

  const appendAssistantMessage = useCallback((assistantMessage: Message, baseSession?: ChatSession | null) => {
    const targetSession = baseSession || pendingSessionRef.current || session;
    const exists = targetSession.messages.some((message) => message.id === assistantMessage.id);
    const messages = exists
      ? targetSession.messages.map((message) => (message.id === assistantMessage.id ? assistantMessage : message))
      : [...targetSession.messages, assistantMessage];

    onUpdateSession({
      ...targetSession,
      messages,
      metadata: {
        ...(targetSession.metadata || {}),
        messageCount: messages.length,
      },
      updatedAt: new Date(),
    });
  }, [onUpdateSession, session]);

  const applyRunUpdate = useCallback((run: ChatRun | null) => {
    if (!run) return false;
    if (run.sessionId !== session.id) return false;

    const isActiveRun = run.status === 'queued' || run.status === 'processing' || run.status === 'streaming';

    if (activeRunIdRef.current !== run.id) {
      activeRunIdRef.current = run.id;
      activeRunSessionIdRef.current = run.sessionId;
      runAnswerRef.current = '';
      runThinkingRef.current = '';
      startStreaming();
      startThinkingStreaming();
    }

    setIsLoading(isActiveRun);
    setProcessingLabel(run.statusMessage || (isActiveRun ? 'Processing' : 'Processing'));

    if (run.answerText.startsWith(runAnswerRef.current)) {
      const delta = run.answerText.slice(runAnswerRef.current.length);
      if (delta) onStreamChunk(delta);
    } else if (run.answerText) {
      resetStreaming();
      startStreaming();
      onStreamChunk(run.answerText);
    }

    if (run.thinkingText.startsWith(runThinkingRef.current)) {
      const delta = run.thinkingText.slice(runThinkingRef.current.length);
      if (delta) onThinkingStreamChunk(delta);
    } else if (run.thinkingText) {
      resetThinkingStreaming();
      startThinkingStreaming();
      onThinkingStreamChunk(run.thinkingText);
    }

    runAnswerRef.current = run.answerText;
    runThinkingRef.current = run.thinkingText;

    if (run.status === 'completed') {
      stopStreaming();
      stopThinkingStreaming();
      if (run.assistantMessage) appendAssistantMessage(run.assistantMessage);
      resetRunDisplay();
      return false;
    }

    if (run.status === 'failed' || run.status === 'cancelled') {
      stopStreaming();
      stopThinkingStreaming();
      if (run.assistantMessage) appendAssistantMessage(run.assistantMessage);
      setError(run.error || 'Chat request stopped.');
      resetRunDisplay();
      return false;
    }

    return true;
  }, [
    appendAssistantMessage,
    onStreamChunk,
    onThinkingStreamChunk,
    resetRunDisplay,
    resetStreaming,
    resetThinkingStreaming,
    startStreaming,
    startThinkingStreaming,
    stopStreaming,
    stopThinkingStreaming,
    session.id,
  ]);

  const pollChatRun = useCallback(async (runId: string) => {
    pollStopRef.current = false;

    for (let attempt = 0; attempt < 1800 && !pollStopRef.current; attempt += 1) {
      const response = await fetch(`/api/chat-runs/${encodeURIComponent(runId)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Failed to check chat request status');
      }

      const keepPolling = applyRunUpdate(data.run as ChatRun);
      if (!keepPolling) return;

      await new Promise((resolve) => window.setTimeout(resolve, 900));
    }

    throw new Error('Chat request is still running in the background. Refresh or reopen this chat to continue watching it.');
  }, [applyRunUpdate]);

  const startBackendChatRun = useCallback(async (updatedSession: ChatSession) => {
    const response = await fetch('/api/chat-runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: updatedSession,
        messages: updatedSession.messages,
        thinkingMode,
        modelSelection,
      }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.run?.id) {
      throw new Error(data.error || 'Failed to start chat request');
    }

    applyRunUpdate(data.run as ChatRun);
    await pollChatRun(data.run.id);
  }, [applyRunUpdate, modelSelection, pollChatRun, thinkingMode]);

  useEffect(() => {
    if (previousSessionIdRef.current === session.id) return;

    previousSessionIdRef.current = session.id;
    pollStopRef.current = true;
    setAttachedPDFs(session.attachedPDFs || []);
    setSelectedFiles([]);
    setSelectedImages([]);
    setSelectedAudio([]);
    setCurrentInput('');
    setError(null);
    resetRunDisplay();
  }, [resetRunDisplay, session.id]);

  useEffect(() => {
    setAttachedPDFs(session.attachedPDFs || []);
  }, [session.attachedPDFs, session.id]);

  useEffect(() => {
    let cancelled = false;

    const recoverActiveRun = async () => {
      if (!session.id) return;
      if (activeRunIdRef.current && activeRunSessionIdRef.current === session.id) return;
      if (activeRunSessionIdRef.current !== session.id) {
        activeRunIdRef.current = null;
        activeRunSessionIdRef.current = null;
        runAnswerRef.current = '';
        runThinkingRef.current = '';
      }

      try {
        const response = await fetch(`/api/chat-runs?sessionId=${encodeURIComponent(session.id)}`, { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.run || cancelled) return;

        const run = data.run as ChatRun;
        if (applyRunUpdate(run)) {
          await pollChatRun(run.id);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to recover active chat run:', err);
        }
      }
    };

    void recoverActiveRun();

    return () => {
      cancelled = true;
      pollStopRef.current = true;
    };
  }, [applyRunUpdate, pollChatRun, session.id]);

  const handleSendMessage = async () => {
    const hasText = currentInput.trim().length > 0;
    const hasImages = selectedImages.length > 0;
    const hasAudio = selectedAudio.length > 0;

    // Validation: prevent empty submission (must have text, images, or audio)
    if (!hasText && !hasImages && !hasAudio) {
      return;
    }

    // Clear any previous errors
    setError(null);
    setIsLoading(true);
    try {
      // Create user message with PDF context
      const userMessage: Message = {
        id: generateId(),
        role: 'user',
        content: {
          text: currentInput,
          images: selectedImages.length > 0 ? selectedImages : undefined,
          audio: selectedAudio.length > 0 ? selectedAudio : undefined,
          pdfs: attachedPDFs.length > 0 ? attachedPDFs : undefined,
        },
        timestamp: new Date(),
      };

      // Add user message to session
      const updatedSession: ChatSession = {
        ...session,
        messages: [...session.messages, userMessage],
        updatedAt: new Date(),
      };
      onUpdateSession(updatedSession);
      pendingSessionRef.current = updatedSession;

      // Clear input and selected files (keep PDFs attached to session)
      setCurrentInput('');
      setSelectedFiles([]);
      setSelectedImages([]);
      setSelectedAudio([]);

      // Start streaming
      activeRunSessionIdRef.current = updatedSession.id;
      startStreaming();
      startThinkingStreaming();

      await startBackendChatRun(updatedSession);
    } catch (err) {
      // Stop streaming on error
      stopStreaming();
      stopThinkingStreaming();
      resetStreaming();
      resetThinkingStreaming();

      // Handle error with ErrorHandler
      const appError = await ErrorHandler.handle(err);
      setError(appError.message);
      
      // Log error for debugging
      ErrorHandler.logError(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinueResponse = async () => {
    if (isLoading || isStreaming || isPDFUploading || session.messages.length === 0) return;

    setError(null);
    setIsLoading(true);
    try {
      const continueMessage: Message = {
        id: generateId(),
        role: 'user',
        content: {
          text: 'Continue from exactly where you stopped. Do not repeat completed content.',
          pdfs: attachedPDFs.length > 0 ? attachedPDFs : undefined,
        },
        timestamp: new Date(),
      };
      const updatedSession: ChatSession = {
        ...session,
        messages: [
          ...session.messages.map((message, index) => (
            index === session.messages.length - 1 && message.role === 'assistant'
              ? {
                  ...message,
                  metadata: {
                    ...(message.metadata || {}),
                    incomplete: false,
                    canContinue: false,
                  },
                }
              : message
          )),
          continueMessage,
        ],
        updatedAt: new Date(),
      };

      onUpdateSession(updatedSession);
      pendingSessionRef.current = updatedSession;
      activeRunSessionIdRef.current = updatedSession.id;
      startStreaming();
      startThinkingStreaming();

      await startBackendChatRun(updatedSession);
    } catch (err) {
      stopStreaming();
      stopThinkingStreaming();
      resetStreaming();
      resetThinkingStreaming();
      const appError = await ErrorHandler.handle(err);
      setError(appError.message);
      ErrorHandler.logError(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelMessage = useCallback(() => {
    pollStopRef.current = true;
    const runId = activeRunIdRef.current;
    if (runId) {
      void fetch(`/api/chat-runs/${encodeURIComponent(runId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
    }
    stopStreaming();
    stopThinkingStreaming();
    resetStreaming();
    resetThinkingStreaming();
    setIsLoading(false);
    activeRunIdRef.current = null;
    activeRunSessionIdRef.current = null;
  }, [resetStreaming, resetThinkingStreaming, stopStreaming, stopThinkingStreaming]);

  const handleRetry = () => {
    // Retry the last message by calling handleSendMessage again
    // The input and files are already cleared, so we can't retry automatically
    // Just clear the error to allow user to try again
    setError(null);
  };

  // Button is disabled when loading or when there's no text and no images
  const showSessionStreaming = isStreaming && activeRunSessionIdRef.current === session.id;
  const isBusyInCurrentSession = (isLoading || isStreaming) && activeRunSessionIdRef.current === session.id;
  const isSubmitDisabled = isBusyInCurrentSession || isPDFUploading || (currentInput.trim().length === 0 && selectedImages.length === 0 && selectedAudio.length === 0);
  const lastMessage = session.messages[session.messages.length - 1];
  const canContinueLastMessage = lastMessage?.role === 'assistant' && lastMessage.metadata?.canContinue;

  return (
    <div
      className="relative flex flex-col bg-white dark:bg-gray-900"
      style={{ height: '100%' }}
      onDragOver={handleChatDragOver}
      onDragLeave={handleChatDragLeave}
      onDrop={handleChatDrop}
    >
      {chatDragType && (
        <div className="pointer-events-none absolute inset-4 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-blue-500 bg-blue-50/90 text-blue-900 shadow-lg dark:bg-blue-950/80 dark:text-blue-100">
          <div className="text-center">
            <div className="text-lg font-semibold">
              {chatDragType === 'image' ? 'Drop images to attach' : chatDragType === 'pdf' ? 'Drop PDF to attach' : 'Drop files to attach'}
            </div>
            <div className="mt-1 text-sm">
              {chatDragType === 'image'
                ? 'Images will be added to your next message.'
                : chatDragType === 'pdf'
                  ? 'It will be processed into this chat context.'
                  : 'Images attach to the next message; PDFs are processed into chat context.'}
            </div>
          </div>
        </div>
      )}
      {/* Error banner */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-4 py-3">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-red-800 dark:text-red-200 text-sm">{error}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {error.includes('network') || error.includes('connection') ? (
                <button
                  onClick={handleRetry}
                  className="text-sm text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100 font-medium"
                >
                  Retry
                </button>
              ) : null}
              <button
                onClick={() => setError(null)}
                className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
                aria-label="Dismiss error"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message list area */}
      <MessageList 
        messages={session.messages} 
        isStreaming={showSessionStreaming}
        streamingContent={showSessionStreaming ? streamingContent : ''}
        streamingThinkingContent={showSessionStreaming ? streamingThinkingContent : ''}
        showThinking={thinkingMode}
        onOpenMemories={onOpenMemories}
        processingLabel={processingLabel}
      />

      {/* Input area */}
      <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-4 md:px-6 md:py-6">
        <div className="max-w-3xl mx-auto">
          {canContinueLastMessage && !isBusyInCurrentSession && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
              <div className="font-medium">The response stopped before it finished.</div>
              <div className="mt-2 flex justify-center">
                <button
                  onClick={handleContinueResponse}
                  className="rounded-full bg-amber-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-500"
                >
                  Continue where it stopped
                </button>
              </div>
            </div>
          )}
          {availableModels.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
              <span className="font-medium text-gray-700 dark:text-gray-200">Model</span>
              <select
                value={modelSelection}
                onChange={(event) => setModelSelection(event.target.value)}
                disabled={isBusyInCurrentSession}
                className="min-w-[220px] rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-800 outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
              >
                <option value="default">Default</option>
                {adaptiveAvailable && <option value="adaptive">Adaptive</option>}
                {availableModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}{model.isDefault ? ' (default)' : ''} - {model.provider}
                  </option>
                ))}
              </select>
            </div>
          )}
          <MessageInput
            value={currentInput}
            onChange={handleInputChange}
            onSubmit={handleSendMessage}
            onCancel={handleCancelMessage}
            disabled={isSubmitDisabled}
            isSubmitting={isBusyInCurrentSession}
            onFileSelect={handleFileSelect}
            selectedFiles={selectedImages}
            onFileRemove={handleFileRemove}
            selectedAudio={selectedAudio}
            onVoiceSelect={handleVoiceSelect}
            onVoiceRemove={handleVoiceRemove}
            onVoiceError={setError}
            onPDFSelect={handlePDFSelect}
            selectedPDFs={attachedPDFs}
            onPDFRemove={handlePDFRemove}
            isPDFUploading={isPDFUploading}
          />
        </div>
      </div>
    </div>
  );
}
