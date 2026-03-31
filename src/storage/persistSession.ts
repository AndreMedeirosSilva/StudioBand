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
  /** Nome da banda criada por este utilizador (dono). */
  ownedBandName: string | null;
  /** Token `inv_…` gerado na criação — persistido para convite e reconstruir o link. */
  ownedInviteToken: string | null;
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

function coercePersistedProfile(x: unknown): PersistedProfile | null {
  if (!isRecord(x)) return null;
  if (typeof x.userId !== 'string' || typeof x.email !== 'string') return null;
  if (!('displayName' in x) || !('bandName' in x) || !Array.isArray(x.bandIds)) return null;
  if (!x.bandIds.every((id): id is string => typeof id === 'string')) return null;
  if (!('ownedBandId' in x) || !('studioName' in x) || !('ownerStudioId' in x)) return null;
  const ownedBandId = x.ownedBandId === null || typeof x.ownedBandId === 'string' ? x.ownedBandId : null;
  const displayName = x.displayName === null || typeof x.displayName === 'string' ? x.displayName : null;
  const bandName = x.bandName === null || typeof x.bandName === 'string' ? x.bandName : null;
  const studioName = x.studioName === null || typeof x.studioName === 'string' ? x.studioName : null;
  const ownerStudioId = x.ownerStudioId === null || typeof x.ownerStudioId === 'string' ? x.ownerStudioId : null;
  return {
    userId: x.userId,
    email: x.email,
    displayName,
    bandName,
    bandIds: x.bandIds,
    ownedBandId,
    ownedBandName: typeof x.ownedBandName === 'string' ? x.ownedBandName : null,
    ownedInviteToken: typeof x.ownedInviteToken === 'string' ? x.ownedInviteToken : null,
    studioName,
    ownerStudioId,
  };
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
    const profile = coercePersistedProfile(data.profile);
    if (!profile || !isOwnerStudioState(data.ownerStudio)) return null;
    if (typeof data.screen !== 'string') return null;
    return {
      v: 2,
      profile,
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
