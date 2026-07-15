'use client';

import { useState } from 'react';
import { Message } from '@/types';
import MarkdownContent from './MarkdownContent';
import ThinkingBlock from './ThinkingBlock';
import VoiceMessageBubble from './VoiceMessageBubble';
import { textDirection, textAlignClass } from '@/utils/textDirection';

interface MessageItemProps {
  message: Message;
  onMeasure?: (id: string, height: number) => void;
  showThinking?: boolean;
  onOpenMemories?: () => void;
  [key: string]: unknown;
}

export default function MessageItem({ message, onMeasure, showThinking = false, onOpenMemories }: MessageItemProps) {
  const [showSources, setShowSources] = useState(false);
  const isUser = message.role === 'user';
  const text = message.content?.text || '';
  const dir = textDirection(text);
  const savedMemoryCount = message.metadata?.savedMemoryIds?.length || 0;
  const sources = message.metadata?.sources || [];
  const tokenUsage = message.metadata?.tokenUsage;
  const modelLabel = message.metadata?.modelLabel || message.metadata?.model;
  const hasAssistantMeta = !isUser && (savedMemoryCount > 0 || sources.length > 0);
  const hasOnlyAudio = Boolean(
    message.content?.audio?.length &&
    !text &&
    !message.content.images?.length &&
    !message.content.pdfs?.length
  );
  const bubbleClass = hasOnlyAudio
    ? ''
    : isUser
      ? 'wadi-user-bubble rounded-2xl rounded-tr-md text-white'
      : 'wadi-assistant-bubble rounded-2xl rounded-tl-md text-gray-900 dark:text-gray-100';

  return (
    <div
      ref={(node) => {
        if (node) onMeasure?.(message.id, node.offsetHeight);
      }}
      className="w-full px-4 py-3"
    >
      <div className={`mx-auto flex max-w-5xl ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div className={`flex max-w-[88%] items-start gap-2 sm:max-w-[78%] ${isUser ? 'flex-row-reverse' : ''}`}>
          <div
            className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${
              isUser
                ? 'wadi-user-avatar'
                : 'wadi-assistant-avatar'
            }`}
          >
            {isUser ? 'You' : 'AI'}
          </div>

        <div
          className={`relative min-w-0 max-w-full ${hasOnlyAudio ? 'p-0' : 'px-4 py-3'} ${bubbleClass} ${textAlignClass(text)}`}
          dir={dir}
        >
          {showThinking && message.thinking && <ThinkingBlock content={message.thinking} />}

          {message.content?.images?.length ? (
            <div className={`mb-3 flex flex-wrap gap-2 ${dir === 'rtl' ? 'justify-end' : 'justify-start'}`}>
              {message.content.images.map((image) => (
                <img
                  key={image.id}
                  src={image.url}
                  alt={image.name}
                  className="max-h-64 rounded-lg border border-gray-200 object-contain dark:border-gray-700"
                />
              ))}
            </div>
          ) : null}

          {message.content?.pdfs?.length ? (
            <div className={`mb-3 flex flex-wrap gap-2 ${dir === 'rtl' ? 'justify-end' : 'justify-start'}`}>
              {message.content.pdfs.map((pdf) => (
                <span
                  key={pdf.docId}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    isUser
                      ? 'border border-white/20 bg-white/15 text-white'
                      : 'border border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200'
                  }`}
                >
                  {pdf.name} ({pdf.pageCount}p)
                </span>
              ))}
            </div>
          ) : null}

          {message.content?.audio?.length ? (
            <div className={`${hasOnlyAudio ? '' : 'mb-3'} flex flex-wrap gap-2 ${dir === 'rtl' ? 'justify-end' : 'justify-start'}`}>
              {message.content.audio.map((audio) => (
                <VoiceMessageBubble key={audio.id} audio={audio} isUser={isUser} />
              ))}
            </div>
          ) : null}

          {text ? (
            <div className={`prose max-w-full prose-p:my-0 prose-p:break-words prose-pre:m-0 prose-pre:bg-transparent prose-pre:p-0 prose-code:break-words ${
              isUser
                ? 'prose-invert text-white'
                : 'text-gray-900 dark:prose-invert dark:text-gray-100'
            }`}>
              <MarkdownContent content={text} />
            </div>
          ) : null}
          {hasAssistantMeta && (
            <div className={`mt-3 flex flex-wrap items-center gap-2 ${dir === 'rtl' ? 'justify-start' : 'justify-end'}`}>
              {savedMemoryCount > 0 && (
                <button
                  type="button"
                  onClick={onOpenMemories}
                  className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700 shadow-sm ring-1 ring-teal-100 transition-colors hover:bg-teal-100 dark:bg-teal-950 dark:text-teal-200 dark:ring-teal-900 dark:hover:bg-teal-900"
                  aria-label="Open saved memory"
                  title={`${savedMemoryCount} memory${savedMemoryCount === 1 ? '' : 'ies'} saved`}
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5c-3 0-5.5 2.3-5.5 5.2 0 1.3.5 2.5 1.38 3.42.4.42.62.98.62 1.56V16c0 .83.67 1.5 1.5 1.5h4c.83 0 1.5-.67 1.5-1.5v-.82c0-.58.22-1.14.62-1.56A4.96 4.96 0 0 0 17.5 10.2C17.5 7.3 15 5 12 5Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 20h5" />
                  </svg>
                  Memory
                </button>
              )}
              {sources.length > 0 && (
                <div className="group inline-flex">
                  <button
                    type="button"
                    onClick={() => setShowSources(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800 transition-colors hover:bg-teal-100 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-200 dark:hover:bg-teal-900"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 13.5 13.5 10.5M8 16l-1.5 1.5a3.54 3.54 0 0 1-5-5L5 9a3.54 3.54 0 0 1 5 0M16 8l1.5-1.5a3.54 3.54 0 0 1 5 5L19 15a3.54 3.54 0 0 1-5 0" />
                    </svg>
                    {sources.length} source{sources.length === 1 ? '' : 's'}
                  </button>
                  <div className="pointer-events-none absolute bottom-10 left-3 z-20 hidden w-80 rounded-xl border border-gray-200 bg-white p-3 text-left text-xs text-gray-700 opacity-0 shadow-xl transition-opacity group-hover:block group-hover:opacity-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                    <div className="mb-2 font-semibold text-gray-900 dark:text-white">Sources used</div>
                    <div className="space-y-2">
                      {sources.slice(0, 5).map((source, index) => (
                        <div key={source.id || source.url}>
                          <div className="font-medium">{index + 1}. {source.title}</div>
                          <div className="truncate text-teal-600 dark:text-teal-300">{source.displayUrl || source.url}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {!isUser && (modelLabel || tokenUsage) && (
            <div className={`mt-2 text-[11px] text-gray-500 dark:text-gray-400 ${dir === 'rtl' ? 'text-left' : 'text-right'}`}>
              {tokenUsage ? `${tokenUsage.totalTokens.toLocaleString()} tokens` : 'Tokens unavailable'}
              {modelLabel ? ` - ${modelLabel}` : ''}
            </div>
          )}
          </div>
        </div>
      </div>
      {showSources && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setShowSources(false)}>
          <div className="max-h-[82vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-gray-200 bg-white p-5 text-left shadow-xl dark:border-gray-700 dark:bg-gray-900" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Sources used</h3>
              <button onClick={() => setShowSources(false)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800" aria-label="Close sources">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              {sources.map((source, index) => (
                <article key={source.id || source.url} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">{index + 1}. {source.title}</div>
                  <a href={source.url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-xs text-teal-600 hover:underline dark:text-teal-300">{source.url}</a>
                  <div className="mt-2 grid gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>Query: {source.query}</span>
                    {source.publishedDate && <span>Date: {source.publishedDate}</span>}
                    <span>Accessed: {new Date(source.accessedAt).toLocaleString()}</span>
                    {source.sourceType && <span>Type: {source.sourceType}</span>}
                  </div>
                  {source.context && <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-200">{source.context}</p>}
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
