'use client';

// Side-effect import — fires getLoopBuffer() the moment this module evaluates,
// before any view component mounts, so the offline render is done by the time
// the user reaches the plan-picker.
import '@/lib/menu-music';

export default function MusicPreloader() {
  return null;
}
