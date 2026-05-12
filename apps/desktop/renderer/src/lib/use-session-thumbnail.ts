'use client';

/**
 * Hook that resolves a session's screenshot thumbnail asynchronously.
 *
 * Resolution order:
 *   1) IndexedDB blob (set by the dashboard's autosave) → object URL
 *   2) Inline `thumbnailDataUrl` on the SavedSession itself (legacy
 *      path, kept so sessions saved with the previous version still
 *      render until they're re-saved)
 *   3) null — caller falls back to the `thumbnailSvg` top-down view or
 *      the empty-state placeholder.
 *
 * Lifecycle: the object URL is revoked on unmount or sessionId change
 * so we don't leak Blob references.
 */

import { useEffect, useState } from 'react';
import { getThumbnail } from './thumbnail-store';

export function useSessionThumbnail(
  sessionId: string | null | undefined,
  inlineDataUrl: string | null | undefined,
): string | null {
  const [url, setUrl] = useState<string | null>(inlineDataUrl ?? null);

  useEffect(() => {
    if (!sessionId) {
      setUrl(inlineDataUrl ?? null);
      return;
    }
    let active = true;
    let createdUrl: string | null = null;
    void getThumbnail(sessionId).then((blob) => {
      if (!active) return;
      if (blob) {
        const u = URL.createObjectURL(blob);
        createdUrl = u;
        setUrl(u);
      } else {
        setUrl(inlineDataUrl ?? null);
      }
    });
    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [sessionId, inlineDataUrl]);

  return url;
}
