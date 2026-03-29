import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OwnerStudioState } from '../data/studioCatalog';

const STORAGE_KEY = '@estudiobanda/session/v2';
const LEGACY_SESSION_V1 = '@estudiobanda/session/v1';

export type PersistedProfile = {
  userId: string;
  email: string;
  displayName: string | null;
  bandName: string | null;
  bandIds: string[];
  /** Banda que este usuário criou (para exibir link de convite). */
  ownedBandId: string | null;
  studioName: string | null;
  ownerStudioId: string | null;
};

/** Alias usado nas telas (mesmo tipo persistido). */
export type UserProfile = PersistedProfile;

/** Payload guardado no dispositivo (JSON). */
export type PersistedSessionV2 = {
  v: 2;
  profile: PersistedProfile;
  ownerStudio: OwnerStudioState;
  screen: string;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isPersistedProfile(x: unknown): x is PersistedProfile {
  if (!isRecord(x)) return false;
  return (
    typeof x.userId === 'string' &&
    typeof x.email === 'string' &&
    'displayName' in x &&
    'bandName' in x &&
    Array.isArray(x.bandIds) &&
    'ownedBandId' in x &&
    'studioName' in x &&
    'ownerStudioId' in x
  );
}

function isOwnerStudioState(x: unknown): x is OwnerStudioState {
  if (!isRecord(x)) return false;
  return (
    typeof x.pricePerHour === 'number' &&
    ('logoUri' in x && (x.logoUri === null || typeof x.logoUri === 'string')) &&
    Array.isArray(x.rooms) &&
    isRecord(x.blockedRangesByRoomDate) &&
    Array.isArray(x.bookings)
  );
}

function parseSession(raw: string | null): PersistedSessionV2 | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as unknown;
    if (!isRecord(data)) return null;
    if (data.v === 1) return null;
    if (data.v !== 2) return null;
    if (!isPersistedProfile(data.profile) || !isOwnerStudioState(data.ownerStudio)) return null;
    if (typeof data.screen !== 'string') return null;
    return {
      v: 2,
      profile: data.profile,
      ownerStudio: data.ownerStudio,
      screen: data.screen,
    };
  } catch {
    return null;
  }
}

export async function loadPersistedSession(): Promise<PersistedSessionV2 | null> {
  await AsyncStorage.removeItem(LEGACY_SESSION_V1);
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return parseSession(raw);
}

export async function savePersistedSession(
  session: Omit<PersistedSessionV2, 'v'> & { v?: 2 },
): Promise<void> {
  const payload: PersistedSessionV2 = {
    v: 2,
    profile: session.profile,
    ownerStudio: session.ownerStudio,
    screen: session.screen,
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export async function clearPersistedSession(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
