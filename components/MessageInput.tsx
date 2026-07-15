'use client';

import { useEffect, useRef, useState } from 'react';
import { AudioAttachment, ImageAttachment, PDFAttachment, generateId } from '@/types';
import { buildWaveformFromBlob, convertBlobToWav, createFlatWaveform, normalizeWaveform } from '@/utils/audioWaveform';
import { textDirection, textAlignClass } from '@/utils/textDirection';
import VoiceMessageBubble from './VoiceMessageBubble';

interface MessageInputProps {
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  disabled: boolean;
  isSubmitting?: boolean;
  onFileSelect: (files: File[]) => void;
  selectedFiles: ImageAttachment[];
  onFileRemove: (fileId: string) => void;
  selectedAudio?: AudioAttachment[];
  onVoiceSelect?: (audio: AudioAttachment) => void;
  onVoiceRemove?: (audioId: string) => void;
  onPDFSelect?: (file: File) => void;
  selectedPDFs?: PDFAttachment[];
  onPDFRemove?: (docId: string) => void;
  isPDFUploading?: boolean;
  onVoiceError?: (message: string) => void;
  thinkingMode: boolean;
  onToggleThinkingMode: () => void;
  labels: {
    attachImages: string;
    attachPdf: string;
    voiceStart: string;
    voiceStop: string;
    send: string;
    stop: string;
    thinkingOn: string;
    thinkingOff: string;
    thinkingTitle: string;
    processingPdf: string;
    stopRecording: string;
  };
}

function formatRecordingTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.min(60, seconds));
  return `0:${String(safeSeconds).padStart(2, '0')}`;
}

export default function MessageInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  disabled,
  isSubmitting = false,
  onFileSelect,
  selectedFiles,
  onFileRemove,
  selectedAudio = [],
  onVoiceSelect,
  onVoiceRemove,
  onPDFSelect,
  selectedPDFs = [],
  onPDFRemove,
  isPDFUploading = false,
  onVoiceError,
  thinkingMode,
  onToggleThinkingMode,
  labels,
}: MessageInputProps) {
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingLevels, setRecordingLevels] = useState(() => createFlatWaveform(34));
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const recordingAnimationRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef(0);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingTimeoutRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hasDraft = value.trim().length > 0;

  const clearVoiceTimers = () => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (recordingTimeoutRef.current) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
  };

  const stopVoiceWaveform = () => {
    if (recordingAnimationRef.current !== null) {
      window.cancelAnimationFrame(recordingAnimationRef.current);
      recordingAnimationRef.current = null;
    }

    audioAnalyserRef.current = null;
    audioSourceRef.current?.disconnect();
    audioSourceRef.current = null;
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    setRecordingLevels(createFlatWaveform(34));
  };

  const startVoiceWaveform = (stream: MediaStream) => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    const barCount = 34;

    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.72;
    const data = new Uint8Array(analyser.frequencyBinCount);
    source.connect(analyser);
    audioContextRef.current = audioContext;
    audioAnalyserRef.current = analyser;
    audioSourceRef.current = source;

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const bucketSize = Math.max(1, Math.floor(data.length / barCount));
      const levels: number[] = [];

      for (let bar = 0; bar < barCount; bar += 1) {
        const start = bar * bucketSize;
        const end = Math.min(data.length, start + bucketSize);
        let total = 0;

        for (let index = start; index < end; index += 1) {
          total += data[index] || 0;
        }

        levels.push(end > start ? total / (end - start) / 255 : 0);
      }

      setRecordingLevels(normalizeWaveform(levels, barCount));
      recordingAnimationRef.current = window.requestAnimationFrame(tick);
    };

    tick();
  };

  const stopVoiceRecording = () => {
    clearVoiceTimers();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.requestData();
      } catch {
        // Some browsers do not allow requestData in every recorder state.
      }
      mediaRecorderRef.current.stop();
    } else {
      stopVoiceWaveform();
    }
    setIsRecordingVoice(false);
  };

  useEffect(() => () => {
    clearVoiceTimers();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    stopVoiceWaveform();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const uploadAudioFile = async (blob: Blob, filename: string): Promise<string> => {
    const formData = new FormData();
    formData.append('file', blob, filename);

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to upload audio');
    }

    const result = await response.json();
    return result.url;
  };

  const startVoiceRecording = async () => {
    if (isSubmitting) return;

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onVoiceError?.('Voice recording is not supported in this browser. Try Chrome or Edge.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const recorder = new MediaRecorder(stream, preferredType ? { mimeType: preferredType } : undefined);

      audioChunksRef.current = [];
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        onVoiceError?.('Voice recording failed.');
        stopVoiceRecording();
      };

      recorder.onstop = async () => {
        clearVoiceTimers();
        setIsRecordingVoice(false);
        setRecordingSeconds(0);
        stream.getTracks().forEach((track) => track.stop());
        stopVoiceWaveform();
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;

        const durationSeconds = Math.min(60, Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000)));
        const mimeType = recorder.mimeType || preferredType || 'audio/webm';
        const recordedBlob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];

        if (recordedBlob.size === 0) return;

        try {
          const blob = await convertBlobToWav(recordedBlob);
          const waveform = await buildWaveformFromBlob(blob, 32);
          const filename = `voice-${Date.now()}.wav`;
          const url = await uploadAudioFile(blob, filename);
          onVoiceSelect?.({
            id: generateId(),
            name: `Voice message ${new Date().toLocaleTimeString()}`,
            url,
            mimeType: 'audio/wav',
            size: blob.size,
            durationSeconds,
            waveform,
          });
        } catch {
          onVoiceError?.('Failed to upload voice message. Please try again.');
        }
      };

      try {
        startVoiceWaveform(stream);
      } catch {
        setRecordingLevels(createFlatWaveform(34));
      }
      recorder.start(250);
      setIsRecordingVoice(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((seconds) => Math.min(60, seconds + 1));
      }, 1000);
      recordingTimeoutRef.current = window.setTimeout(stopVoiceRecording, 60000);
    } catch (error) {
      onVoiceError?.(error instanceof Error ? error.message : 'Microphone permission was denied.');
    }
  };

  const handleVoiceClick = () => {
    if (isRecordingVoice) {
      stopVoiceRecording();
      return;
    }

    startVoiceRecording();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !disabled) {
      event.preventDefault();
      onSubmit();
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value);
  };

  const handleComposerSurfaceClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('button, label, input, textarea')) return;
    textareaRef.current?.focus();
  };

  const handleSendClick = () => {
    if (isSubmitting) {
      onCancel?.();
      return;
    }

    if (!disabled) {
      onSubmit();
    }
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      onFileSelect(Array.from(files));
    }
    // Reset input value to allow selecting the same file again
    event.target.value = '';
  };

  const handlePDFInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0 && onPDFSelect) {
      // Only process the first PDF file
      const pdfFile = Array.from(files).find(f => f.type === 'application/pdf');
      if (pdfFile) {
        onPDFSelect(pdfFile);
      }
    }
    // Reset input value to allow selecting the same file again
    event.target.value = '';
  };

  return (
    <div className="wadi-message-input flex flex-col gap-2">
      {/* PDF chips */}
      {(selectedPDFs.length > 0 || isPDFUploading) && (
        <div className="mb-2 flex flex-wrap gap-2">
          {isPDFUploading && (
            <div className="flex animate-pulse items-center gap-2 rounded-full border border-amber-200 bg-amber-50/90 px-3 py-1.5 text-sm font-bold text-amber-700">
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>{labels.processingPdf}</span>
            </div>
          )}
          {selectedPDFs.map((pdf) => (
            <div
              key={pdf.docId}
              className="group flex items-center gap-2 rounded-full border border-[#8fcfd3]/70 bg-[#e7f5f6]/90 px-3 py-1.5 text-sm font-bold text-[#15565c]"
              title={`${pdf.name} (${pdf.pageCount} pages)`}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="max-w-[120px] truncate">{pdf.name}</span>
              <span className="text-xs text-teal-600">({pdf.pageCount}p)</span>
              {onPDFRemove && (
                <button
                  onClick={() => onPDFRemove(pdf.docId)}
                  className="ml-1 rounded-full p-0.5 transition-colors hover:bg-[#8fcfd3]/45"
                  aria-label={`Remove ${pdf.name}`}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Image previews */}
      {selectedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedFiles.map((file) => (
            <div
              key={file.id}
              className="group relative h-20 w-20 overflow-hidden rounded-lg border border-black/10 bg-white/70 shadow-sm dark:border-white/10 dark:bg-white/8"
            >
              <img
                src={file.url}
                alt={file.name}
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => onFileRemove(file.id)}
                className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                aria-label={`Remove ${file.name}`}
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
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

      {selectedAudio.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedAudio.map((audio) => (
            <VoiceMessageBubble
              key={audio.id}
              audio={audio}
              isUser
              onRemove={onVoiceRemove ? () => onVoiceRemove(audio.id) : undefined}
            />
          ))}
        </div>
      )}

      {isRecordingVoice && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-red-700 shadow-sm dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-25" />
            <svg className="relative h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 10v2a7 7 0 01-14 0v-2" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex h-5 items-center gap-0.5">
              {recordingLevels.map((level, index) => (
                <span
                  key={index}
                  className="w-0.5 rounded-full bg-red-500/80"
                  style={{ height: 4 + level * 21 }}
                />
              ))}
            </div>
            <div className="text-xs font-medium">{formatRecordingTime(recordingSeconds)} / 1:00</div>
          </div>
          <button
            type="button"
            onClick={stopVoiceRecording}
            className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
          >
            {labels.stopRecording}
          </button>
        </div>
      )}

      {/* Input area */}
      <div
        className={`wadi-composer-surface flex items-center rounded-[28px] p-2 transition-shadow ${
          hasDraft ? 'is-writing gap-2' : 'is-empty gap-2'
        }`}
        dir="ltr"
        onClick={handleComposerSurfaceClick}
      >
        <div className="wadi-composer-tool-group flex flex-shrink-0 items-center gap-1">
          {/* Attach button */}
          <input
            id="file-upload-input"
            type="file"
            multiple
            onChange={handleFileInputChange}
            className="hidden"
            accept="image/*"
          />
          <label
            htmlFor="file-upload-input"
            className="wadi-composer-icon flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors"
            aria-label={labels.attachImages}
            title={labels.attachImages}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </label>

          {/* PDF upload button */}
          {onPDFSelect && (
            <>
              <input
                id="pdf-upload-input"
                type="file"
                onChange={handlePDFInputChange}
                className="hidden"
                accept=".pdf,application/pdf"
              />
              <label
                htmlFor="pdf-upload-input"
                className="wadi-composer-icon flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors"
                aria-label={labels.attachPdf}
                title={labels.attachPdf}
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </label>
            </>
          )}
        </div>
        
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={1}
          dir={hasDraft ? textDirection(value) : 'auto'}
          className={`wadi-composer-textarea resize-none border-0 bg-transparent px-2 py-2.5 text-base font-bold text-gray-950 placeholder:text-gray-500 focus:outline-none focus:ring-0 dark:text-white dark:placeholder:text-white/45 ${
            hasDraft ? textAlignClass(value) : 'text-left'
          }`}
          style={{
            minHeight: '2.5rem',
            maxHeight: '8rem',
          }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = Math.min(target.scrollHeight, 128) + 'px';
          }}
        />

        <div className="wadi-composer-action-group flex flex-shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleThinkingMode}
          disabled={isSubmitting}
          className={`wadi-thinking-composer-toggle flex h-9 flex-shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-black transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            thinkingMode ? 'is-active' : ''
          }`}
          aria-pressed={thinkingMode}
          aria-label={labels.thinkingTitle}
          title={labels.thinkingTitle}
        >
          <span className="h-2 w-2 rounded-full" aria-hidden="true" />
          <span>{thinkingMode ? labels.thinkingOn : labels.thinkingOff}</span>
        </button>

        <button
          type="button"
          onClick={handleVoiceClick}
          disabled={isSubmitting}
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
            isRecordingVoice
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'wadi-composer-icon disabled:cursor-not-allowed disabled:opacity-50'
          }`}
          aria-label={isRecordingVoice ? labels.voiceStop : labels.voiceStart}
          title={isRecordingVoice ? `${recordingSeconds}s / 60s` : labels.voiceStart}
        >
          {isRecordingVoice ? (
            <span className="flex items-center gap-1 text-xs font-semibold">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
              </span>
            </span>
          ) : (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 10v2a7 7 0 01-14 0v-2m7 9v3m-4 0h8" />
            </svg>
          )}
        </button>
        
        {/* Send button */}
        <button
          type="button"
          onClick={handleSendClick}
          disabled={!isSubmitting && disabled}
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-all duration-200 ${
            isSubmitting
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-[#1C7178] hover:bg-[#15565c] disabled:cursor-not-allowed disabled:bg-gray-200 dark:disabled:bg-white/10'
          }`}
          aria-label={isSubmitting ? labels.stop : labels.send}
        >
          {isSubmitting ? (
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <rect x="7" y="7" width="10" height="10" rx="1.5" />
            </svg>
          ) : (
            <svg
              className={`w-5 h-5 ${disabled ? 'text-gray-400 dark:text-gray-500' : 'text-white'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          )}
        </button>
        </div>
      </div>
    </div>
  );
}
