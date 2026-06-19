'use client';

type AudioContextConstructor = typeof AudioContext;

declare global {
  interface Window {
    webkitAudioContext?: AudioContextConstructor;
  }
}

export function createFlatWaveform(barCount = 32) {
  return Array.from({ length: barCount }, () => 0.28);
}

export function normalizeWaveform(values: number[], barCount = values.length || 32) {
  const source = values.length > 0 ? [...values] : createFlatWaveform(barCount);
  while (source.length < barCount) {
    source.push(0);
  }
  const max = Math.max(...source, 0.001);

  return source.slice(0, barCount).map((value) => {
    const normalized = Math.max(0, Math.min(1, value / max));
    return Math.max(0.16, Math.min(1, normalized));
  });
}

async function decodeAudioBuffer(arrayBuffer: ArrayBuffer) {
  if (typeof window === 'undefined') return null;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass || arrayBuffer.byteLength === 0) {
    return null;
  }

  const context = new AudioContextClass();

  try {
    return await context.decodeAudioData(arrayBuffer.slice(0));
  } catch {
    return null;
  } finally {
    const closePromise = context.close?.();
    void closePromise?.catch(() => undefined);
  }
}

export async function buildWaveformFromArrayBuffer(arrayBuffer: ArrayBuffer, barCount = 32) {
  const buffer = await decodeAudioBuffer(arrayBuffer);

  try {
    if (!buffer) {
      return createFlatWaveform(barCount);
    }

    if (buffer.length === 0 || buffer.numberOfChannels === 0) {
      return createFlatWaveform(barCount);
    }

    const channel = buffer.getChannelData(0);
    const samplesPerBar = Math.max(1, Math.floor(channel.length / barCount));
    const values: number[] = [];

    for (let bar = 0; bar < barCount; bar += 1) {
      const start = bar * samplesPerBar;
      const end = bar === barCount - 1 ? channel.length : Math.min(channel.length, start + samplesPerBar);
      let sum = 0;
      let count = 0;

      for (let index = start; index < end; index += 1) {
        const sample = channel[index] || 0;
        sum += sample * sample;
        count += 1;
      }

      values.push(count > 0 ? Math.sqrt(sum / count) : 0);
    }

    return normalizeWaveform(values, barCount);
  } catch {
    return createFlatWaveform(barCount);
  }
}

export async function buildWaveformFromBlob(blob: Blob, barCount = 32) {
  return buildWaveformFromArrayBuffer(await blob.arrayBuffer(), barCount);
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function encodeMonoPcmWav(buffer: AudioBuffer) {
  const sourceChannels = Math.max(1, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  const channelCount = 1;
  const dataSize = buffer.length * channelCount * bytesPerSample;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);
  const channels = Array.from(
    { length: sourceChannels },
    (_, channel) => buffer.getChannelData(channel)
  );

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let sampleIndex = 0; sampleIndex < buffer.length; sampleIndex += 1) {
    let mixed = 0;
    for (const channel of channels) {
      mixed += channel[sampleIndex] || 0;
    }

    const sample = Math.max(-1, Math.min(1, mixed / channels.length));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

export async function convertBlobToWav(blob: Blob) {
  if (blob.type.includes('wav') || blob.type.includes('wave')) {
    return blob;
  }

  const buffer = await decodeAudioBuffer(await blob.arrayBuffer());
  if (!buffer || buffer.length === 0 || buffer.numberOfChannels === 0) {
    throw new Error('Unable to decode voice recording');
  }

  return encodeMonoPcmWav(buffer);
}

export async function buildWaveformFromUrl(url: string, barCount = 32) {
  try {
    const response = await fetch(url);
    if (!response.ok) return createFlatWaveform(barCount);
    return buildWaveformFromArrayBuffer(await response.arrayBuffer(), barCount);
  } catch {
    return createFlatWaveform(barCount);
  }
}
