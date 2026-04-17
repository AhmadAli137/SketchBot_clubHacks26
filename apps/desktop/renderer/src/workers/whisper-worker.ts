/// <reference lib="webworker" />

import { pipeline, type ProgressCallback } from '@huggingface/transformers';

const DEFAULT_MODEL = 'onnx-community/whisper-tiny.en';

type Transcriber = Awaited<ReturnType<typeof pipeline<'automatic-speech-recognition'>>>;
let transcriber: Transcriber | null = null;

const progressCb: ProgressCallback = (progress) => {
  if (progress.status === 'progress' && 'progress' in progress) {
    self.postMessage({
      type: 'progress',
      progress: Math.round(progress.progress),
      file: 'file' in progress ? progress.file : '',
    });
  }
};

async function loadModel(model: string) {
  const devices = ['webgpu', 'wasm'] as const;

  for (const device of devices) {
    try {
      transcriber = (await pipeline('automatic-speech-recognition', model, {
        dtype: 'fp32',
        device,
        progress_callback: progressCb,
      })) as Transcriber;

      self.postMessage({ type: 'status', status: 'ready', device });
      return;
    } catch {
      if (device === 'wasm') {
        throw new Error('Failed to load Whisper with both WebGPU and WASM backends');
      }
    }
  }
}

self.onmessage = async (event: MessageEvent) => {
  const { type } = event.data;

  if (type === 'load') {
    const model: string = event.data.model ?? DEFAULT_MODEL;
    self.postMessage({ type: 'status', status: 'loading' });
    try {
      await loadModel(model);
    } catch (err) {
      self.postMessage({ type: 'status', status: 'error', error: String(err) });
    }
    return;
  }

  if (type === 'transcribe') {
    if (!transcriber) {
      self.postMessage({ type: 'error', error: 'Model not loaded yet' });
      return;
    }
    try {
      const raw = await transcriber(event.data.audio as Float32Array);
      const text: string = Array.isArray(raw)
        ? (raw[0] as { text: string }).text
        : (raw as { text: string }).text;
      self.postMessage({ type: 'result', text: text.trim() });
    } catch (err) {
      self.postMessage({ type: 'error', error: String(err) });
    }
  }
};
