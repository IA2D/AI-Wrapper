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
    <div className="flex flex-col gap-2">
      {/* PDF chips */}
      {(selectedPDFs.length > 0 || isPDFUploading) && (
        <div className="flex flex-wrap gap-2 mb-2">
          {isPDFUploading && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full text-sm text-amber-700 animate-pulse">
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Processing PDF...</span>
            </div>
          )}
          {selectedPDFs.map((pdf) => (
            <div
              key={pdf.docId}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-full text-sm text-blue-800 group"
              title={`${pdf.name} (${pdf.pageCount} pages)`}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="max-w-[120px] truncate">{pdf.name}</span>
              <span className="text-xs text-blue-600">({pdf.pageCount}p)</span>
              {onPDFRemove && (
                <button
                  onClick={() => onPDFRemove(pdf.docId)}
                  className="ml-1 p-0.5 rounded-full hover:bg-blue-200 transition-colors"
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
              className="relative group w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800"
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
            Stop
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-3xl shadow-sm hover:shadow-md transition-shadow focus-within:border-gray-400 dark:focus-within:border-gray-500 focus-within:shadow-md p-2">
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
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
          aria-label="Attach images"
        >
          <svg
            className="w-5 h-5 text-gray-500 dark:text-gray-400"
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
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              aria-label="Upload PDF"
            >
              <svg
                className="w-5 h-5 text-gray-500 dark:text-gray-400"
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
        
        <textarea
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Message..."
          rows={1}
          dir={textDirection(value)}
          className={`flex-1 px-2 py-2.5 text-base resize-none bg-transparent border-0 focus:outline-none focus:ring-0 placeholder:text-gray-400 dark:placeholder:text-gray-500 text-gray-900 dark:text-gray-100 ${textAlignClass(value)}`}
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

        <button
          type="button"
          onClick={handleVoiceClick}
          disabled={isSubmitting}
          className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition-colors ${
            isRecordingVoice
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'hover:bg-gray-100 text-gray-500 dark:text-gray-400 dark:hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50'
          }`}
          aria-label={isRecordingVoice ? 'Stop voice input' : 'Start voice input'}
          title={isRecordingVoice ? `Recording ${recordingSeconds}s / 60s` : 'Voice input'}
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
          onClick={handleSendClick}
          disabled={!isSubmitting && disabled}
          className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition-all duration-200 ${
            isSubmitting
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-black dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:cursor-not-allowed'
          }`}
          aria-label={isSubmitting ? 'Stop response' : 'Send message'}
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
  );
}
