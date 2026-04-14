export const CLOUD_BACKEND_URL =
  process.env.NEXT_PUBLIC_CLOUD_BACKEND_URL ?? 'http://127.0.0.1:8010';

export const CLERK_ENABLED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
