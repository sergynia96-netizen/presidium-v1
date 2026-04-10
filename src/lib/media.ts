/**
 * Media Processing Module
 *
 * Handles all media operations for E2E encrypted messaging:
 * - Voice messages: recording, Opus compression, waveform generation
 * - Video circles: camera capture, 60s limit, compression
 * - File handling: upload, download, encryption
 * - Image processing: compression, thumbnail generation
 *
 * All media is encrypted BEFORE upload using AES-256-GCM.
 * The server only sees encrypted blobs.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VoiceRecording {
  stream: MediaStream;
  recorder: MediaRecorder;
  chunks: Blob[];
  startTime: number;
  duration: number;
  waveform: number[];
}

export interface MediaFile {
  id: string;
  type: 'image' | 'video' | 'audio' | 'file';
  name: string;
  size: number;
  mimeType: string;
  duration?: number;
  width?: number;
  height?: number;
  thumbnail?: string; // base64 thumbnail
  blob: Blob;
}

export interface EncryptedMediaFile {
  id: string;
  type: string;
  mimeType: string;
  name: string;
  size: number;
  encryptedData: Uint8Array;
  iv: Uint8Array;
  tag: Uint8Array;
  encryptionKey: Uint8Array; // Will be sent via E2E channel
}

export interface VideoCircleConfig {
  maxDuration: number; // seconds
  maxWidth: number;
  maxHeight: number;
  targetBitrate: number; // bps
  fps: number;
}

export interface VoiceConfig {
  sampleRate: number;
  bitRate: number;
  maxDuration: number; // seconds
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const DEFAULT_VIDEO_CIRCLE_CONFIG: VideoCircleConfig = {
  maxDuration: 60,
  maxWidth: 480,
  maxHeight: 480,
  targetBitrate: 500000, // 500 kbps
  fps: 30,
};

export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  sampleRate: 48000,
  bitRate: 24000, // 24 kbps
  maxDuration: 300, // 5 minutes
};

// ─── Voice Recording ─────────────────────────────────────────────────────────

/**
 * Start recording a voice message.
 * Returns a VoiceRecording object with MediaRecorder and stream.
 */
export async function startVoiceRecording(
  config: Partial<VoiceConfig> = {},
): Promise<VoiceRecording> {
  const fullConfig = { ...DEFAULT_VOICE_CONFIG, ...config };

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      sampleRate: fullConfig.sampleRate,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  // Determine supported MIME type
  const mimeType = getSupportedAudioMimeType();

  const recorder = new MediaRecorder(stream, {
    mimeType,
    audioBitsPerSecond: fullConfig.bitRate,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  recorder.start(100); // Collect data every 100ms for waveform updates

  return {
    stream,
    recorder,
    chunks,
    startTime: Date.now(),
    duration: 0,
    waveform: [],
  };
}

/**
 * Stop voice recording and return the audio blob.
 */
export function stopVoiceRecording(recording: VoiceRecording): Promise<Blob> {
  return new Promise((resolve) => {
    recording.recorder.onstop = () => {
      recording.stream.getTracks().forEach(track => track.stop());
      const blob = new Blob(recording.chunks, {
        type: recording.recorder.mimeType || 'audio/webm',
      });
      resolve(blob);
    };
    recording.recorder.stop();
  });
}

/**
 * Cancel voice recording (discard all data).
 */
export function cancelVoiceRecording(recording: VoiceRecording): void {
  recording.stream.getTracks().forEach(track => track.stop());
  recording.chunks.length = 0;
  recording.recorder.stop();
}

/**
 * Generate waveform data from audio blob.
 * Returns an array of amplitude values (0-1).
 */
export async function generateWaveform(
  audioBlob: Blob,
  barCount: number = 50,
): Promise<number[]> {
  const audioContext = new AudioContext();

  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);
    const samplesPerBar = Math.floor(channelData.length / barCount);

    const waveform: number[] = [];
    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      const start = i * samplesPerBar;
      for (let j = 0; j < samplesPerBar; j++) {
        sum += Math.abs(channelData[start + j] || 0);
      }
      waveform.push(sum / samplesPerBar);
    }

    // Normalize to 0-1
    const max = Math.max(...waveform);
    return waveform.map(v => max > 0 ? v / max : 0);
  } finally {
    await audioContext.close();
  }
}

// ─── Video Circle Recording ─────────────────────────────────────────────────

/**
 * Start recording a video circle (circular video message).
 * Uses front camera by default, 60s max, 480x480.
 */
export async function startVideoCircleRecording(
  config: Partial<VideoCircleConfig> = {},
): Promise<{ stream: MediaStream; recorder: MediaRecorder; chunks: Blob[] }> {
  const fullConfig = { ...DEFAULT_VIDEO_CIRCLE_CONFIG, ...config };

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: fullConfig.maxWidth },
      height: { ideal: fullConfig.maxHeight },
      frameRate: { ideal: fullConfig.fps },
      facingMode: 'user',
    },
    audio: true,
  });

  const mimeType = getSupportedVideoMimeType();

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: fullConfig.targetBitrate,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  recorder.start(100);

  // Auto-stop after max duration
  setTimeout(() => {
    if (recorder.state === 'recording') {
      recorder.stop();
    }
  }, fullConfig.maxDuration * 1000);

  return { stream, recorder, chunks };
}

/**
 * Stop video circle recording.
 */
export function stopVideoCircleRecording(
  stream: MediaStream,
  recorder: MediaRecorder,
  chunks: Blob[],
): Promise<{ blob: Blob; duration: number }> {
  return new Promise((resolve) => {
    const startTime = Date.now();

    recorder.onstop = () => {
      stream.getTracks().forEach(track => track.stop());
      const blob = new Blob(chunks, {
        type: recorder.mimeType || 'video/webm',
      });
      resolve({ blob, duration: (Date.now() - startTime) / 1000 });
    };

    recorder.stop();
  });
}

/**
 * Cancel video circle recording.
 */
export function cancelVideoCircleRecording(
  stream: MediaStream,
  recorder: MediaRecorder,
  chunks: Blob[],
): void {
  stream.getTracks().forEach(track => track.stop());
  chunks.length = 0;
  recorder.stop();
}

// ─── Image Compression ──────────────────────────────────────────────────────

/**
 * Compress an image file.
 * Returns a compressed blob and thumbnail.
 */
export async function compressImage(
  file: File | Blob,
  options: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    generateThumbnail?: boolean;
    thumbnailSize?: number;
  } = {},
): Promise<{ compressed: Blob; thumbnail?: string }> {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.8,
    generateThumbnail = true,
    thumbnailSize = 200,
  } = options;

  const img = await createImageFromBlob(file);

  // Calculate new dimensions
  const { width, height } = calculateAspectRatio(
    img.width,
    img.height,
    maxWidth,
    maxHeight,
  );

  // Draw compressed image
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, width, height);

  const compressed = await new Promise<Blob>((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob!),
      'image/jpeg',
      quality,
    );
  });

  // Generate thumbnail
  let thumbnail: string | undefined;
  if (generateThumbnail) {
    const thumbCanvas = document.createElement('canvas');
    const { width: tw, height: th } = calculateAspectRatio(
      img.width,
      img.height,
      thumbnailSize,
      thumbnailSize,
    );
    thumbCanvas.width = tw;
    thumbCanvas.height = th;
    const thumbCtx = thumbCanvas.getContext('2d')!;
    thumbCtx.drawImage(img, 0, 0, tw, th);
    thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.7);
  }

  return { compressed, thumbnail };
}

// ─── Media Encryption ───────────────────────────────────────────────────────

/**
 * Encrypt a media file using AES-256-GCM.
 * Returns encrypted data, IV, tag, and the encryption key.
 */
export async function encryptMediaFile(
  blob: Blob,
): Promise<EncryptedMediaFile> {
  const arrayBuffer = await blob.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);

  // Generate random encryption key
  const encryptionKey = new Uint8Array(crypto.getRandomValues(new Uint8Array(32)));

  // Generate random IV
  const iv = new Uint8Array(crypto.getRandomValues(new Uint8Array(12)));

  // Import key
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encryptionKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );

  // Encrypt
  const encryptedResult = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    data,
  );

  const encryptedBytes = new Uint8Array(encryptedResult);
  const ciphertext = encryptedBytes.slice(0, -16);
  const tag = encryptedBytes.slice(-16);

  return {
    id: crypto.randomUUID(),
    type: blob.type.split('/')[0],
    mimeType: blob.type,
    name: 'media',
    size: blob.size,
    encryptedData: ciphertext,
    iv,
    tag,
    encryptionKey,
  };
}

/**
 * Decrypt a media file.
 * Returns the original blob.
 */
export async function decryptMediaFile(
  encrypted: EncryptedMediaFile,
): Promise<Blob> {
  // Import key
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encrypted.encryptionKey.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );

  // Reconstruct ciphertext + tag
  const fullCiphertext = new Uint8Array(
    encrypted.encryptedData.length + encrypted.tag.length,
  );
  fullCiphertext.set(encrypted.encryptedData);
  fullCiphertext.set(encrypted.tag, encrypted.encryptedData.length);

  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: encrypted.iv.buffer as ArrayBuffer },
    cryptoKey,
    fullCiphertext.buffer as ArrayBuffer,
  );

  return new Blob([decrypted], { type: encrypted.mimeType });
}

// ─── Media URL Generation ───────────────────────────────────────────────────

/**
 * Create a blob URL for a media blob.
 * Remember to revoke it when done.
 */
export function createMediaUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

/**
 * Revoke a blob URL.
 */
export function revokeMediaUrl(url: string): void {
  URL.revokeObjectURL(url);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSupportedAudioMimeType(): string {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ];

  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  return 'audio/webm';
}

function getSupportedVideoMimeType(): string {
  const types = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];

  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  return 'video/webm';
}

function createImageFromBlob(blob: Blob | File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

function calculateAspectRatio(
  srcWidth: number,
  srcHeight: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const ratio = Math.min(maxWidth / srcWidth, maxHeight / srcHeight);
  return {
    width: Math.round(srcWidth * ratio),
    height: Math.round(srcHeight * ratio),
  };
}
