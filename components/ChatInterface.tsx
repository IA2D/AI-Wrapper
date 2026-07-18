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
import { chatCopy } from '@/lib/chatCopy';
import { useLanguage } from './LanguageProvider';

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
  const { locale } = useLanguage();
  const copy = chatCopy[locale];
  const [currentInput, setCurrentInput] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedImages, setSelectedImages] = useState<ImageAttachment[]>([]);
  const [selectedAudio, setSelectedAudio] = useState<AudioAttachment[]>([]);
  const [attachedPDFs, setAttachedPDFs] = useState<PDFAttachment[]>(session.attachedPDFs || []);
  const [isLoading, setIsLoading] = useState(false);
  const [processingLabel, setProcessingLabel] = useState(copy.chat.processing);
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
    if (!isLoading && !isStreaming) {
      setProcessingLabel(copy.chat.processing);
    }
  }, [copy.chat.processing, isLoading, isStreaming]);

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
    setProcessingLabel(copy.chat.processing);
    pendingSessionRef.current = null;
    resetStreaming();
    resetThinkingStreaming();
  }, [copy.chat.processing, resetStreaming, resetThinkingStreaming]);

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
    setProcessingLabel(run.statusMessage || copy.chat.processing);

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
    copy.chat.processing,
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
      className="wadi-chat-interface relative flex flex-col"
      style={{ height: '100%' }}
      onDragOver={handleChatDragOver}
      onDragLeave={handleChatDragLeave}
      onDrop={handleChatDrop}
    >
      {chatDragType && (
        <div className="pointer-events-none absolute inset-4 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-[#1C7178] bg-[#e7f5f6]/90 text-[#15565c] shadow-[0_28px_90px_rgba(28,113,120,0.18)] backdrop-blur-xl dark:bg-[#082f33]/88 dark:text-[#d3edef]">
          <div className="text-center">
            <div className="text-lg font-black">
              {chatDragType === 'image' ? copy.chat.dropImage : chatDragType === 'pdf' ? copy.chat.dropPdf : copy.chat.dropFiles}
            </div>
            <div className="mt-1 text-sm font-bold opacity-70">
              {chatDragType === 'image'
                ? copy.chat.dropImageDetail
                : chatDragType === 'pdf'
                  ? copy.chat.dropPdfDetail
                  : copy.chat.dropFilesDetail}
            </div>
          </div>
        </div>
      )}
      {/* Error banner */}
      {error && (
        <div className="px-4 py-3">
          <div className="mx-auto flex max-w-4xl items-center justify-between rounded-lg border border-red-200 bg-red-50/90 px-4 py-3 shadow-sm backdrop-blur-xl dark:border-red-900/60 dark:bg-red-950/35">
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
                  {copy.chat.retry}
                </button>
              ) : null}
              <button
                onClick={() => setError(null)}
                className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
                aria-label={copy.chat.dismissError}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="wadi-chat-workbench flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col">
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
          <div className="wadi-chat-composer-wrap px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:px-6 md:py-5 md:pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <div className="mx-auto max-w-4xl">
              {session.messages.length === 0 && !currentInput && (
                <div className="mb-3 flex flex-nowrap justify-start gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:justify-center scrollbar-thin">
                  {copy.chat.starters.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setCurrentInput(prompt)}
                      className="wadi-starter-chip flex-shrink-0"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
              {canContinueLastMessage && !isBusyInCurrentSession && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/90 px-4 py-3 text-center text-sm font-bold text-amber-900 shadow-sm backdrop-blur-xl dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                  <div className="font-black">{copy.chat.stoppedTitle}</div>
                  <div className="mt-2 flex justify-center">
                    <button
                      onClick={handleContinueResponse}
                      className="rounded-full bg-amber-600 px-4 py-1.5 text-sm font-black text-white transition-colors hover:bg-amber-500"
                    >
                      {copy.chat.continue}
                    </button>
                  </div>
                </div>
              )}
              {availableModels.length > 0 && (
                <div className="wadi-model-selector mb-3 flex flex-col gap-2 rounded-lg px-3 py-2 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <span className="font-black text-black/72 dark:text-white/78">{copy.chat.model}</span>
                  <select
                    value={modelSelection}
                    onChange={(event) => setModelSelection(event.target.value)}
                    disabled={isBusyInCurrentSession}
                    className="min-w-0 w-full sm:w-auto sm:min-w-[220px] rounded-full border border-black/10 bg-white/90 px-3 py-1.5 text-sm font-bold text-gray-900 outline-none focus:border-[#1C7178] dark:border-white/10 dark:bg-[#111817] dark:text-gray-100"
                  >
                    <option value="default">{copy.chat.modelDefault}</option>
                    {adaptiveAvailable && <option value="adaptive">{copy.chat.modelAdaptive}</option>}
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
                thinkingMode={thinkingMode}
                onToggleThinkingMode={onToggleThinkingMode}
                labels={copy.input}
              />
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
