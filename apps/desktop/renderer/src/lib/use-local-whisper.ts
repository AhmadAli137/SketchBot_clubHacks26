'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type WhisperStatus = 'idle' | 'loading' | 'downloading' | 'ready' | 'error';

export function useLocalWhisper(autoLoad = false) {
  const workerRef = useRef<Worker | null>(null);
  const [status, setStatus] = useState<WhisperStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [device, setDevice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pendingRef = useRef<{
    resolve: (text: string) => void;
    reject: (err: Error) => void;
  } | null>(null);

  const getWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;

    const worker = new Worker(
      new URL('../workers/whisper-worker.ts', import.meta.url),
    );

    worker.onmessage = (event: MessageEvent) => {
      const data = event.data as Record<string, unknown>;

      switch (data.type) {
        case 'status': {
          const s = data.status as WhisperStatus;
          setStatus(s);
          if (s === 'ready') {
            setDevice((data.device as string) ?? null);
            setProgress(100);
          }
          if (s === 'error') {
            setError((data.error as string) ?? 'Unknown error');
            pendingRef.current?.reject(new Error((data.error as string) ?? 'Model error'));
            pendingRef.current = null;
          }
          break;
        }
        case 'progress':
          setStatus('downloading');
          setProgress((data.progress as number) ?? 0);
          break;

        case 'result':
          pendingRef.current?.resolve(((data.text as string) ?? '').trim());
          pendingRef.current = null;
          break;

        case 'error':
          pendingRef.current?.reject(new Error((data.error as string) ?? 'Transcription failed'));
          pendingRef.current = null;
          break;
      }
    };

    workerRef.current = worker;
    return worker;
  }, []);

  const loadModel = useCallback(() => {
    if (status === 'ready' || status === 'loading' || status === 'downloading') return;
    const worker = getWorker();
    setStatus('loading');
    setError(null);
    setProgress(0);
    worker.postMessage({ type: 'load' });
  }, [getWorker, status]);

  const transcribe = useCallback(
    (audio: Float32Array): Promise<string> =>
      new Promise((resolve, reject) => {
        if (!workerRef.current || status !== 'ready') {
          reject(new Error('Whisper model not ready'));
          return;
        }
        pendingRef.current = { resolve, reject };
        workerRef.current.postMessage({ type: 'transcribe', audio });
      }),
    [status],
  );

  useEffect(() => {
    if (autoLoad) loadModel();
  }, [autoLoad, loadModel]);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    [],
  );

  return {
    status,
    progress,
    device,
    error,
    isReady: status === 'ready',
    isLoading: status === 'loading' || status === 'downloading',
    loadModel,
    transcribe,
  };
}
