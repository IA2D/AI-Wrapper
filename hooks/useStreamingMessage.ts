import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Custom hook for managing streaming message state
 * Handles streaming content accumulation and state management
 * 
 * @returns Object with streaming state and control methods
 */
export function useStreamingMessage() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const chunkBufferRef = useRef('');
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getRevealSize = useCallback(() => {
    const length = chunkBufferRef.current.length;

    if (length > 6000) return 32;
    if (length > 3000) return 18;
    if (length > 1400) return 9;
    if (length > 500) return 4;
    return 1;
  }, []);

  const getRevealDelay = useCallback(() => {
    const length = chunkBufferRef.current.length;

    if (length > 3000) return 4;
    if (length > 900) return 7;
    return 12;
  }, []);

  const flushBufferedChunks = useCallback(() => {
    if (!chunkBufferRef.current) return;

    const revealSize = getRevealSize();
    const nextChunk = chunkBufferRef.current.slice(0, revealSize);
    chunkBufferRef.current = chunkBufferRef.current.slice(revealSize);
    setStreamingContent((prev) => prev + nextChunk);
  }, [getRevealSize]);

  const flushAllBufferedChunks = useCallback(() => {
    if (!chunkBufferRef.current) return;

    const nextChunk = chunkBufferRef.current;
    chunkBufferRef.current = '';
    setStreamingContent((prev) => prev + nextChunk);
  }, []);

  const clearFlushTimer = useCallback(() => {
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    clearFlushTimer();
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      flushBufferedChunks();

      if (chunkBufferRef.current) {
        scheduleFlush();
      }
    }, getRevealDelay());
  }, [clearFlushTimer, flushBufferedChunks, getRevealDelay]);

  // Start streaming
  const startStreaming = useCallback(() => {
    clearFlushTimer();
    chunkBufferRef.current = '';
    setIsStreaming(true);
    setStreamingContent('');
  }, [clearFlushTimer]);

  // Stop streaming
  const stopStreaming = useCallback(() => {
    flushAllBufferedChunks();
    clearFlushTimer();
    setIsStreaming(false);
  }, [clearFlushTimer, flushAllBufferedChunks]);

  // Reset streaming state
  const resetStreaming = useCallback(() => {
    clearFlushTimer();
    chunkBufferRef.current = '';
    setIsStreaming(false);
    setStreamingContent('');
  }, [clearFlushTimer]);

  // Callback for accumulating streaming chunks
  const onStreamChunk = useCallback((chunk: string) => {
    chunkBufferRef.current += chunk;

    if (!flushTimerRef.current) {
      scheduleFlush();
    }
  }, [scheduleFlush]);

  useEffect(() => () => {
    clearFlushTimer();
  }, [clearFlushTimer]);

  return {
    isStreaming,
    streamingContent,
    startStreaming,
    stopStreaming,
    resetStreaming,
    onStreamChunk,
  };
}
