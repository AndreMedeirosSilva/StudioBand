import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeEmail } from './credentialsPolicy';

const STORAGE_KEY = '@estudiobanda/auth_rate_limiter/v1';
const ATTEMPT_WINDOW_MS = 15 * 60_000;
const RETENTION_MS = 24 * 60 * 60_000;
const LOCK_STEPS_MS = [0, 30_000, 2 * 60_000, 10 * 60_000, 30 * 60_000] as const;

type Entry = {
  count: number;
  windowStartAt: number;
  lockLevel: number;
  lockUntil: number;
  updatedAt: number;
};

type State = Record<string, Entry>;

function nowMs(): number {
  return Date.now();
}

function lockMessage(ms: number): string {
  const secs = Math.ceil(ms / 1000);
  if (secs < 60) return `Muitas tentativas. Aguarde ${secs}s e tente novamente.`;
  const mins = Math.ceil(secs / 60);
  return `Muitas tentativas. Aguarde ${mins} min e tente novamente.`;
}

async function loadState(): Promise<State> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as State;
  } catch {
    return {};
  }
}

async function saveState(state: State): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function cleanup(state: State, now: number): State {
  const next: State = {};
  for (const [k, entry] of Object.entries(state)) {
    if (now - entry.updatedAt <= RETENTION_MS) next[k] = entry;
  }
  return next;
}

export async function getLoginLockStatus(email: string): Promise<{ locked: boolean; message?: string }> {
  const key = normalizeEmail(email);
  if (!key) return { locked: false };
  const now = nowMs();
  const state = cleanup(await loadState(), now);
  const entry = state[key];
  if (!entry) {
    await saveState(state);
    return { locked: false };
  }
  if (entry.lockUntil > now) {
    await saveState(state);
    return { locked: true, message: lockMessage(entry.lockUntil - now) };
  }
  if (now - entry.windowStartAt > ATTEMPT_WINDOW_MS) {
    delete state[key];
    await saveState(state);
    return { locked: false };
  }
  await saveState(state);
  return { locked: false };
}

export async function registerFailedLoginAttempt(email: string): Promise<string | null> {
  const key = normalizeEmail(email);
  if (!key) return null;
  const now = nowMs();
  const state = cleanup(await loadState(), now);
  const prev = state[key];
  const resetWindow = !prev || now - prev.windowStartAt > ATTEMPT_WINDOW_MS;
  const count = resetWindow ? 1 : prev.count + 1;
  const lockLevel = Math.min(
    LOCK_STEPS_MS.length - 1,
    count >= 5 ? (prev?.lockLevel ?? 0) + 1 : prev?.lockLevel ?? 0,
  );
  const lockUntil = count >= 5 ? now + LOCK_STEPS_MS[lockLevel] : prev?.lockUntil ?? 0;
  state[key] = {
    count,
    lockLevel,
    lockUntil,
    windowStartAt: resetWindow ? now : prev.windowStartAt,
    updatedAt: now,
  };
  await saveState(state);
  if (lockUntil > now) return lockMessage(lockUntil - now);
  return null;
}

export async function clearLoginRateLimit(email: string): Promise<void> {
  const key = normalizeEmail(email);
  if (!key) return;
  const state = cleanup(await loadState(), nowMs());
  if (state[key]) {
    delete state[key];
    await saveState(state);
  }
}
