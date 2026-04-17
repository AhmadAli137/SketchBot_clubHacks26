/**
 * Audio helpers used by the voice-input pipeline.
 *
 * We capture raw Float32 PCM directly via Web Audio (not MediaRecorder) so
 * we can stream partial transcriptions through Whisper while the student is
 * still speaking — mid-recording WebM chunks can't always be decoded, but
 * raw Float32 samples always can.
 */

/**
 * Concatenate a list of equal-rate mono Float32Arrays into one buffer.
 */
export function concatFloat32(chunks: readonly Float32Array[]): Float32Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/**
 * Resample a Float32 PCM buffer to 16 kHz (Whisper's required rate) using an
 * OfflineAudioContext. Returns the input unchanged when it's already 16 kHz.
 */
export async function resamplePcmTo16k(
  pcm: Float32Array,
  sampleRate: number,
): Promise<Float32Array> {
  if (pcm.length === 0) return pcm;
  if (sampleRate === 16_000) return pcm;

  const targetLength = Math.max(1, Math.ceil((pcm.length * 16_000) / sampleRate));
  const offlineCtx = new OfflineAudioContext(1, targetLength, 16_000);
  const buffer = offlineCtx.createBuffer(1, pcm.length, sampleRate);
  buffer.copyToChannel(pcm, 0);

  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineCtx.destination);
  source.start();

  const rendered = await offlineCtx.startRendering();
  return rendered.getChannelData(0);
}

/**
 * Encode a Float32 mono PCM buffer as a 16-bit WAV Blob. Whisper accepts
 * WAV natively, so this replaces our previous WebM upload path with
 * something that doesn't depend on a browser-specific container.
 */
export function pcmToWavBlob(pcm: Float32Array, sampleRate: number): Blob {
  const byteLength = 44 + pcm.length * 2;
  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  // RIFF header.
  writeString(0, 'RIFF');
  view.setUint32(4, byteLength - 8, true);
  writeString(8, 'WAVE');
  // fmt chunk.
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format = PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  // data chunk.
  writeString(36, 'data');
  view.setUint32(40, pcm.length * 2, true);

  let offset = 44;
  for (let i = 0; i < pcm.length; i++) {
    const clamped = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Legacy helper kept for any callers still decoding a finished WebM blob.
 * Prefer using direct PCM capture via Web Audio (see useVoiceInput).
 */
export async function blobToFloat32At16kHz(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();

  const audioCtx = new AudioContext();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);

  const targetLength = Math.ceil(decoded.duration * 16_000);
  const offlineCtx = new OfflineAudioContext(1, targetLength, 16_000);
  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineCtx.destination);
  source.start();

  const resampled = await offlineCtx.startRendering();
  await audioCtx.close();

  return resampled.getChannelData(0);
}
