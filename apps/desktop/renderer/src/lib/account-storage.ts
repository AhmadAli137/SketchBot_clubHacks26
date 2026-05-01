/**
 * Account preferences + optional Supabase Auth.
 * When Supabase env vars are set, sign-in uses `signInWithPassword`; otherwise a dev stub is used.
 */

import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

export const ACCOUNT_STORAGE_KEY = 'sketchbot-account-v1';

export type AccountRole = 'student' | 'teacher';

export type AccountRecord = {
  email: string;
  displayName: string;
  rememberMe: boolean;
  /** Legacy stub token, or `'supabase'` when using Supabase Auth */
  sessionToken?: string;
  lastRole: AccountRole;
  savedAt: number;
};

function safeParse(raw: string | null): AccountRecord | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<AccountRecord>;
    if (typeof o.email !== 'string' || !o.email.includes('@')) return null;
    if (typeof o.displayName !== 'string') return null;
    if (o.rememberMe !== true && o.rememberMe !== false) return null;
    if (o.lastRole !== 'student' && o.lastRole !== 'teacher') return null;
    return {
      email: o.email,
      displayName: o.displayName,
      rememberMe: o.rememberMe,
      sessionToken: typeof o.sessionToken === 'string' ? o.sessionToken : undefined,
      lastRole: o.lastRole,
      savedAt: typeof o.savedAt === 'number' ? o.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function loadAccount(): AccountRecord | null {
  if (typeof window === 'undefined') return null;
  return safeParse(window.localStorage.getItem(ACCOUNT_STORAGE_KEY));
}

/**
 * Show "Continue" when we have a saved profile and either a live Supabase session
 * (email match — regardless of rememberMe) or a legacy stub token with rememberMe.
 */
export function shouldShowQuickContinue(
  account: AccountRecord | null,
  supabaseUserEmail: string | null,
): boolean {
  if (!account) return false;
  const email = account.email.trim().toLowerCase();
  // Live Supabase session: always offer quick-continue (user signed in, session is valid)
  if (supabaseUserEmail) {
    return email === supabaseUserEmail.trim().toLowerCase();
  }
  // Legacy stub: require explicit rememberMe
  if (!account.rememberMe) return false;
  return Boolean(account.sessionToken);
}

/** Dev-only when Supabase is not configured */
export async function validateCredentialsStub(email: string, password: string): Promise<boolean> {
  await new Promise((r) => setTimeout(r, 280));
  const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  if (!okEmail) return false;
  if (password.length < 8) return false;
  return true;
}

function persistAccountRecord(record: AccountRecord): void {
  window.localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(record));
}

export async function signInWithPassword(options: {
  email: string;
  password: string;
  rememberMe: boolean;
  lastRole: AccountRole;
}): Promise<{ ok: boolean; error?: string }> {
  if (typeof window === 'undefined') return { ok: false, error: 'Unavailable' };

  const email = options.email.trim().toLowerCase();
  const supabase = getSupabaseBrowserClient();

  if (supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: options.password,
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    const user = data.user;
    if (!user?.email) {
      return { ok: false, error: 'No email on profile.' };
    }
    const meta = user.user_metadata as { full_name?: string; name?: string };
    const displayName =
      meta.full_name?.trim() || meta.name?.trim() || user.email.split('@')[0] || 'Learner';
    const record: AccountRecord = {
      email: user.email.toLowerCase(),
      displayName,
      rememberMe: options.rememberMe,
      sessionToken: 'supabase',
      lastRole: options.lastRole,
      savedAt: Date.now(),
    };
    persistAccountRecord(record);
    return { ok: true };
  }

  const ok = await validateCredentialsStub(email, options.password);
  if (!ok) {
    return { ok: false, error: 'Check your email and password (8+ characters).' };
  }

  const displayName = email.split('@')[0] || 'Learner';
  const record: AccountRecord = {
    email,
    displayName,
    rememberMe: options.rememberMe,
    sessionToken: options.rememberMe ? crypto.randomUUID() : undefined,
    lastRole: options.lastRole,
    savedAt: Date.now(),
  };
  persistAccountRecord(record);
  return { ok: true };
}

export async function signUpWithPassword(options: {
  email: string;
  password: string;
  displayName: string;
  lastRole: AccountRole;
}): Promise<{ ok: boolean; error?: string; needsConfirmation?: boolean }> {
  if (typeof window === 'undefined') return { ok: false, error: 'Unavailable' };

  const email = options.email.trim().toLowerCase();
  const supabase = getSupabaseBrowserClient();

  if (supabase) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: options.password,
      options: {
        data: {
          full_name: options.displayName.trim(),
          role: options.lastRole,
        },
      },
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    // Supabase returns user even before confirmation — session may be null
    if (!data.session) {
      return { ok: true, needsConfirmation: true };
    }
    const user = data.user!;
    const record: AccountRecord = {
      email: user.email!.toLowerCase(),
      displayName: options.displayName.trim() || email.split('@')[0],
      rememberMe: true,
      sessionToken: 'supabase',
      lastRole: options.lastRole,
      savedAt: Date.now(),
    };
    persistAccountRecord(record);
    return { ok: true };
  }

  // Dev stub — no Supabase configured
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Enter a valid email address.' };
  }
  if (options.password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }
  const record: AccountRecord = {
    email,
    displayName: options.displayName.trim() || email.split('@')[0],
    rememberMe: true,
    sessionToken: crypto.randomUUID(),
    lastRole: options.lastRole,
    savedAt: Date.now(),
  };
  persistAccountRecord(record);
  return { ok: true };
}

export function clearSavedAccount(): void {
  window.localStorage.removeItem(ACCOUNT_STORAGE_KEY);
}

export async function signOutAuth(): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  clearSavedAccount();
}

export function updateAccountLastRole(lastRole: AccountRole): void {
  const cur = loadAccount();
  if (!cur) return;
  persistAccountRecord({ ...cur, lastRole, savedAt: Date.now() });
}
