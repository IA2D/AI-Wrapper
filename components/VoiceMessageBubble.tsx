'use client';

import { useEffect, useRef, useState } from 'react';
import { AudioAttachment } from '@/types';
import { buildWaveformFromUrl, createFlatWaveform, normalizeWaveform } from '@/utils/audioWaveform';

interface VoiceMessageBubbleProps {
  audio: AudioAttachment;
  isUser?: boolean;
  onRemove?: () => void;
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export default function VoiceMessageBubble({ audio, isUser = false, onRemove }: VoiceMessageBubbleProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadedDuration, setLoadedDuration] = useState(audio.durationSeconds);
  const [waveform, setWaveform] = useState(() => normalizeWaveform(audio.waveform || createFlatWaveform(32), 32));
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const duration = audioRef.current?.duration && Number.isFinite(audioRef.current.duration)
    ? audioRef.current.duration
    : loadedDuration;
  const progress = duration ? Math.min(100, (currentTime / duration) * 100) : 0;

  useEffect(() => {
    let cancelled = false;
    setPlaybackError(null);
    setCurrentTime(0);
    setLoadedDuration(audio.durationSeconds);

    if (audio.waveform?.length) {
      setWaveform(normalizeWaveform(audio.waveform, 32));
      return () => {
        cancelled = true;
      };
    }

    setWaveform(createFlatWaveform(32));
    void buildWaveformFromUrl(audio.url, 32).then((levels) => {
      if (!cancelled) setWaveform(levels);
    });

    return () => {
      cancelled = true;
    };
  }, [audio.durationSeconds, audio.url, audio.waveform]);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;

    const updateTime = () => setCurrentTime(element.currentTime || 0);
    const handleLoadedMetadata = () => {
      if (Number.isFinite(element.duration)) {
        setLoadedDuration(Math.round(element.duration));
      }
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const handlePlay = () => {
      setPlaybackError(null);
      setIsPlaying(true);
    };
    const handlePause = () => setIsPlaying(false);
    const handleError = () => {
      setPlaybackError('Cannot play this voice message.');
      setIsPlaying(false);
    };

    element.addEventListener('loadedmetadata', handleLoadedMetadata);
    element.addEventListener('durationchange', handleLoadedMetadata);
    element.addEventListener('timeupdate', updateTime);
    element.addEventListener('ended', handleEnded);
    element.addEventListener('play', handlePlay);
    element.addEventListener('pause', handlePause);
    element.addEventListener('error', handleError);
    element.load();

    return () => {
      element.removeEventListener('loadedmetadata', handleLoadedMetadata);
      element.removeEventListener('durationchange', handleLoadedMetadata);
      element.removeEventListener('timeupdate', updateTime);
      element.removeEventListener('ended', handleEnded);
      element.removeEventListener('play', handlePlay);
      element.removeEventListener('pause', handlePause);
      element.removeEventListener('error', handleError);
    };
  }, [audio.url]);

  const togglePlayback = async () => {
    const element = audioRef.current;
    if (!element) return;

    if (isPlaying) {
      element.pause();
      setIsPlaying(false);
      return;
    }

    try {
      setPlaybackError(null);
      element.muted = false;
      element.volume = 1;
      if (element.ended || (duration && element.currentTime >= duration)) {
        element.currentTime = 0;
      }
      if (element.readyState === 0) {
        element.load();
      }
      await element.play();
      setIsPlaying(true);
    } catch {
      setPlaybackError('Cannot play this voice message.');
      setIsPlaying(false);
    }
  };

  const seek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const element = audioRef.current;
    if (!element || !duration) return;

    const nextTime = (Number(event.target.value) / 100) * duration;
    element.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  return (
    <div
      className={`flex min-w-[230px] max-w-[310px] items-center gap-3 rounded-2xl px-3 py-2 shadow-sm ${
        isUser
          ? 'bg-emerald-500 text-white'
          : 'border border-gray-200 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'
      }`}
    >
      <audio ref={audioRef} src={audio.url} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={togglePlayback}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          isUser ? 'bg-white/20 hover:bg-white/30' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-200'
        }`}
        aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
      >
        {isPlaying ? (
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
          </svg>
        ) : (
          <svg className="ml-0.5 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex h-6 items-center gap-0.5">
          {waveform.map((level, index) => {
            const height = 5 + level * 20;
            const active = index < Math.ceil((progress / 100) * waveform.length);

            return (
              <span
                key={index}
                className={`w-0.5 rounded-full ${active ? 'opacity-100' : 'opacity-35'} ${
                  isUser ? 'bg-white' : 'bg-emerald-500'
                }`}
                style={{ height }}
              />
            );
          })}
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={progress}
          onChange={seek}
          className="sr-only"
          aria-label="Voice message progress"
        />
        <div className={`text-[11px] ${isUser ? 'text-white/85' : 'text-gray-500 dark:text-gray-400'}`}>
          {playbackError || formatDuration(isPlaying ? currentTime : duration)}
        </div>
      </div>

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className={`rounded-full p-1 ${isUser ? 'hover:bg-white/20' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          aria-label="Remove voice message"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
