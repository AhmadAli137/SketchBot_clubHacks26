/** SaySpark cloud backend — AI gateway + admin APIs */
export const CLOUD_API_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? 'https://sketchbot-backend.onrender.com';

/** Public site URL (used for og:url, canonical links) */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sayspark.ca';

/** Supabase is configured when these env vars are present */
export const SUPABASE_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
