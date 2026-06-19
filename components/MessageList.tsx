'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Message } from '@/types';
import MessageItem from './MessageItem';
import MarkdownContent from './MarkdownContent';
import ThinkingBlock from './ThinkingBlock';
import { textDirection, textAlignClass } from '@/utils/textDirection';

interface MessageListProps {
  messages: Message[];
  isStreaming?: boolean;
  streamingContent?: string;
  streamingThinkingContent?: string;
  showThinking?: boolean;
  onOpenMemories?: () => void;
  processingLabel?: string;
}

export default function MessageList({
  messages,
  isStreaming = false,
  streamingContent = '',
  streamingThinkingContent = '',
  showThinking = false,
  onOpenMemories,
  processingLabel = 'Processing',
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(720);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [measuredHeights, setMeasuredHeights] = useState<Record<string, number>>({});
  const estimatedMessageHeight = 170;
  const overscan = 8;
  const shouldWindow = messages.length > 45;
  const messageHeights = useMemo(() => (
    messages.map((message) => measuredHeights[message.id] || estimatedMessageHeight)
  ), [measuredHeights, messages]);
  const cumulativeHeights = useMemo(() => {
    const heights = [0];

    messageHeights.forEach((height) => {
      heights.push(heights[heights.length - 1] + height);
    });

    return heights;
  }, [messageHeights]);
  const visibleRange = useMemo(() => {
    if (!shouldWindow) {
      return { start: 0, end: messages.length };
    }

    const viewportStart = Math.max(0, scrollTop - overscan * estimatedMessageHeight);
    const viewportEnd = scrollTop + viewportHeight + overscan * estimatedMessageHeight;
    let start = 0;
    let end = messages.length;

    while (start < messages.length && cumulativeHeights[start + 1] < viewportStart) {
      start += 1;
    }

    end = start;
    while (end < messages.length && cumulativeHeights[end] < viewportEnd) {
      end += 1;
    }

    return { start, end: Math.min(messages.length, Math.max(end, start + 1)) };
  }, [cumulativeHeights, messages.length, scrollTop, shouldWindow, viewportHeight]);
  const visibleMessages = shouldWindow
    ? messages.slice(visibleRange.start, visibleRange.end)
    : messages;
  const topSpacerHeight = shouldWindow ? cumulativeHeights[visibleRange.start] : 0;
  const bottomSpacerHeight = shouldWindow ? cumulativeHeights[messages.length] - cumulativeHeights[visibleRange.end] : 0;

  useEffect(() => {
    if (isNearBottom || isStreaming) {
      endRef.current?.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth', block: 'end' });
    }
  }, [isNearBottom, isStreaming, messages, streamingContent, streamingThinkingContent]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateViewport = () => setViewportHeight(element.clientHeight || 720);
    updateViewport();

    const resizeObserver = new ResizeObserver(updateViewport);
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, []);

  const handleScroll = () => {
    const element = containerRef.current;
    if (!element) return;
    const nextScrollTop = element.scrollTop;
    const nextNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 240;
    setScrollTop((current) => (Math.abs(current - nextScrollTop) < 24 ? current : nextScrollTop));
    setIsNearBottom((current) => (current === nextNearBottom ? current : nextNearBottom));
  };

  const handleMeasure = (id: string, height: number) => {
    setMeasuredHeights((current) => (
      Math.abs((current[id] || 0) - height) < 4 ? current : { ...current, [id]: height }
    ));
  };

  return (
    <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto bg-white dark:bg-gray-900">
      {messages.length === 0 && !isStreaming ? (
        <div className="flex h-full items-center justify-center px-4 text-center text-gray-500 dark:text-gray-400">
          <div>
            <div className="text-lg font-medium text-gray-700 dark:text-gray-200">Start a conversation</div>
            <div className="mt-1 text-sm">Ask anything, attach images, or drag a PDF into the chat.</div>
          </div>
        </div>
      ) : (
        <>
          {topSpacerHeight > 0 && <div style={{ height: topSpacerHeight }} />}
          {visibleMessages.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              onMeasure={handleMeasure}
              showThinking={showThinking}
              onOpenMemories={onOpenMemories}
            />
          ))}
          {bottomSpacerHeight > 0 && <div style={{ height: bottomSpacerHeight }} />}
        </>
      )}

      {isStreaming && !streamingContent && (!showThinking || !streamingThinkingContent) && (
        <div className="w-full px-4 py-3">
          <div className="mx-auto flex max-w-4xl justify-start">
            <div className="flex max-w-[88%] items-start gap-2 sm:max-w-[78%]">
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-800 dark:bg-gray-700 dark:text-gray-100">
                AI
              </div>
              <div className="min-w-0 rounded-2xl rounded-tl-md border border-gray-200 bg-gray-50 px-4 py-3 text-gray-700 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                <div className="flex items-center gap-2 text-sm">
                  <span>{processingLabel}</span>
                  <span className="flex items-center gap-1" aria-hidden="true">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.2s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.1s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isStreaming && (streamingContent || (showThinking && streamingThinkingContent)) && (
        <div className="w-full px-4 py-3">
          <div className="mx-auto flex max-w-4xl justify-start">
            <div className="flex max-w-[88%] items-start gap-2 sm:max-w-[78%]">
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-800 dark:bg-gray-700 dark:text-gray-100">
                AI
              </div>
              <div
                className={`min-w-0 max-w-full rounded-2xl rounded-tl-md border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 ${textAlignClass(streamingContent)}`}
                dir={textDirection(streamingContent)}
              >
                {showThinking && streamingThinkingContent && (
                  <ThinkingBlock content={streamingThinkingContent} active={!streamingContent} />
                )}
                {streamingContent ? (
                  <>
                    <div className="inline prose max-w-full prose-p:my-0 prose-p:inline prose-p:break-words prose-pre:m-0 prose-pre:block prose-pre:bg-transparent prose-pre:p-0 prose-code:break-words text-gray-900 dark:prose-invert dark:text-gray-100">
                      <MarkdownContent content={streamingContent} />
                    </div>
                    <span className="ml-0.5 inline-block h-5 w-1 animate-pulse rounded-sm bg-gray-700 align-[-0.2em] dark:bg-gray-200" aria-hidden="true" />
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <span>{processingLabel}</span>
                    <span className="flex items-center gap-1" aria-hidden="true">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.2s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.1s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
