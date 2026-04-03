import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PersistedProfile } from '../storage/persistSession';
import { buildInviteUrl, parseInviteToken } from '../lib/inviteLink';
import { isInsecureLocalAuthAllowed, isSupabaseConfigured } from '../lib/supabase/config';
import { getPasswordPolicyError, isValidEmail, normalizeEmail } from '../lib/auth/credentialsPolicy';
import {
  createOwnedBandRemote,
  deleteOwnedBandRemote,
  getInviteUrlForOwnedBandRemote,
  joinBandWithInviteRemote,
  listBandsDetailForUserRemote,
  loginWithPasswordRemote,
  peekInviteBandNameRemote,
  regenerateOwnedBandInviteRemote,
  registerAccountRemote,
  renameOwnedBandRemote,
} from '../lib/supabase/remoteRegistry';
import type { RegisterInput } from './registerTypes';

export type { RegisterInput };

const REGISTRY_KEY = '@estudiobanda/local_registry/v1';

export type LocalUser = {
  id: string;
  email: string;
  password: string;
  displayName: string | null;
  createdAt: string;
  studioName: string | null;
  ownerStudioId: string | null;
};

export type LocalBand = {
  id: string;
  name: string;
  ownerUserId: string;
  inviteToken: string;
  createdAt: string;
};

export type Membership = {
  userId: string;
  bandId: string;
  role: 'owner' | 'member';
};

export type LocalRegistryV1 = {
  v: 1;
  users: LocalUser[];
  bands: LocalBand[];
  memberships: Membership[];
};

function emptyRegistry(): LocalRegistryV1 {
  return { v: 1, users: [], bands: [], memberships: [] };
}

function isRegistry(x: unknown): x is LocalRegistryV1 {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return o.v === 1 && Array.isArray(o.users) && Array.isArray(o.bands) && Array.isArray(o.memberships);
}

export async function loadRegistry(): Promise<LocalRegistryV1> {
  try {
    const raw = await AsyncStorage.getItem(REGISTRY_KEY);
    if (!raw) return emptyRegistry();
    const data = JSON.parse(raw) as unknown;
    if (!isRegistry(data)) return emptyRegistry();
    return data;
  } catch {
    return emptyRegistry();
  }
}

export async function saveRegistry(r: LocalRegistryV1): Promise<void> {
  await AsyncStorage.setItem(REGISTRY_KEY, JSON.stringify(r));
}

function randomSuffix(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function newInviteToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = 'inv_';
  for (let i = 0; i < 22; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function findUserByEmail(r: LocalRegistryV1, email: string): LocalUser | undefined {
  const n = normalizeEmail(email);
  return r.users.find((u) => u.email === n);
}

export async function peekInviteBandName(token: string): Promise<string | null> {
  const t = parseInviteToken(token);
  if (!t) return null;
  if (isSupabaseConfigured()) {
    return peekInviteBandNameRemote(t);
  }
  const r = await loadRegistry();
  const b = findBandByInviteToken(r, t);
  return b?.name ?? null;
}

export function findBandByInviteToken(r: LocalRegistryV1, token: string): LocalBand | undefined {
  const t = token.trim();
  return r.bands.find((b) => b.inviteToken === t);
}

function buildProfileFromRegistry(r: LocalRegistryV1, user: LocalUser): PersistedProfile {
  const myMemberships = r.memberships.filter((m) => m.userId === user.id);
  const bandIds = [...new Set(myMemberships.map((m) => m.bandId))];
  const bands = bandIds
    .map((id) => r.bands.find((b) => b.id === id))
    .filter((b): b is LocalBand => b !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));

  const owned = r.bands.find((b) => b.ownerUserId === user.id);
  const ownedBandId = owned?.id ?? null;

  const bandName =
    bands.length > 0
      ? bands.length === 1
        ? bands[0].name
        : `${bands[0].name} +${bands.length - 1}`
      : null;

  return {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    bandName,
    bandIds,
    ownedBandId,
    ownedBandName: owned?.name ?? null,
    ownedInviteToken: owned?.inviteToken ?? null,
    studioName: user.studioName ?? null,
    ownerStudioId: user.ownerStudioId ?? null,
  };
}

export type LoginResult =
  | { ok: true; profile: PersistedProfile }
  | { ok: false; message: string };

export async function loginWithPassword(email: string, password: string): Promise<LoginResult> {
  if (isSupabaseConfigured()) {
    return loginWithPasswordRemote(email, password);
  }
  if (!isInsecureLocalAuthAllowed()) {
    return {
      ok: false,
      message:
        'Login local está desativado por segurança. Configure Supabase (.env) ou ative EXPO_PUBLIC_ALLOW_INSECURE_LOCAL_AUTH apenas para desenvolvimento.',
    };
  }
  const r = await loadRegistry();
  const u = findUserByEmail(r, email.trim());
  if (!u) {
    return { ok: false, message: 'E-mail não encontrado. Cadastre-se primeiro.' };
  }
  if (u.password !== password) {
    return { ok: false, message: 'Senha incorreta.' };
  }
  return { ok: true, profile: buildProfileFromRegistry(r, u) };
}

export type JoinBandResult =
  | { ok: true; profile: PersistedProfile }
  | { ok: false; message: string };

/** Só depois de logado: associa o utilizador à banda pelo token do convite (dados locais). */
export async function joinBandWithInvite(userId: string, inviteToken: string): Promise<JoinBandResult> {
  const t = parseInviteToken(inviteToken);
  if (!t) {
    return { ok: false, message: 'Cole o código do convite (ex.: inv_…) ou o link com ?join=….' };
  }
  if (isSupabaseConfigured()) {
    return joinBandWithInviteRemote(userId, t);
  }
  const r = await loadRegistry();
  const user = r.users.find((u) => u.id === userId);
  if (!user) {
    return { ok: false, message: 'Sessão inválida. Entre de novo.' };
  }
  const band = findBandByInviteToken(r, t);
  if (!band) {
    return { ok: false, message: 'Convite inválido neste aparelho/navegador (a banda tem de existir aqui).' };
  }
  const already = r.memberships.some((m) => m.userId === userId && m.bandId === band.id);
  if (already) {
    return { ok: false, message: 'Você já faz parte desta banda.' };
  }
  r.memberships.push({ userId, bandId: band.id, role: 'member' });
  await saveRegistry(r);
  return { ok: true, profile: buildProfileFromRegistry(r, user) };
}

export async function createOwnedBand(userId: string, bandName: string): Promise<JoinBandResult> {
  const name = bandName.trim();
  if (!name) {
    return { ok: false, message: 'Informe o nome da banda.' };
  }
  if (isSupabaseConfigured()) {
    const res = await createOwnedBandRemote(name);
    if (!res.ok) return { ok: false, message: res.message };
    return { ok: true, profile: res.profile };
  }
  const r = await loadRegistry();
  const user = r.users.find((u) => u.id === userId);
  if (!user) {
    return { ok: false, message: 'Sessão inválida. Entre de novo.' };
  }
  if (r.bands.some((b) => b.ownerUserId === userId)) {
    return {
      ok: false,
      message: 'Você já criou uma banda como administrador. Convide membros pelo link ou entre em outras bandas com código.',
    };
  }
  const now = new Date().toISOString();
  const bandId = `bnd_${randomSuffix()}`;
  const inviteToken = newInviteToken();
  r.bands.push({
    id: bandId,
    name,
    ownerUserId: userId,
    inviteToken,
    createdAt: now,
  });
  r.memberships.push({ userId, bandId, role: 'owner' });
  await saveRegistry(r);
  return { ok: true, profile: buildProfileFromRegistry(r, user) };
}

export async function renameOwnedBand(userId: string, nextBandName: string): Promise<JoinBandResult> {
  const name = nextBandName.trim();
  if (!name) {
    return { ok: false, message: 'Informe o nome da banda.' };
  }
  if (isSupabaseConfigured()) {
    return renameOwnedBandRemote(name);
  }
  const r = await loadRegistry();
  const user = r.users.find((u) => u.id === userId);
  if (!user) {
    return { ok: false, message: 'Sessão inválida. Entre de novo.' };
  }
  const owned = r.bands.find((b) => b.ownerUserId === userId);
  if (!owned) {
    return { ok: false, message: 'Você ainda não tem banda como administrador.' };
  }
  owned.name = name;
  await saveRegistry(r);
  return { ok: true, profile: buildProfileFromRegistry(r, user) };
}

export async function regenerateOwnedBandInvite(userId: string): Promise<JoinBandResult> {
  if (isSupabaseConfigured()) {
    return regenerateOwnedBandInviteRemote();
  }
  const r = await loadRegistry();
  const user = r.users.find((u) => u.id === userId);
  if (!user) {
    return { ok: false, message: 'Sessão inválida. Entre de novo.' };
  }
  const owned = r.bands.find((b) => b.ownerUserId === userId);
  if (!owned) {
    return { ok: false, message: 'Você ainda não tem banda como administrador.' };
  }
  let token = '';
  for (let i = 0; i < 8; i++) {
    const candidate = newInviteToken();
    if (!r.bands.some((b) => b.inviteToken === candidate)) {
      token = candidate;
      break;
    }
  }
  if (!token) {
    return { ok: false, message: 'Não foi possível gerar novo convite agora. Tente de novo.' };
  }
  owned.inviteToken = token;
  await saveRegistry(r);
  return { ok: true, profile: buildProfileFromRegistry(r, user) };
}

export async function deleteOwnedBand(userId: string): Promise<JoinBandResult> {
  if (isSupabaseConfigured()) {
    return deleteOwnedBandRemote();
  }
  const r = await loadRegistry();
  const user = r.users.find((u) => u.id === userId);
  if (!user) {
    return { ok: false, message: 'Sessão inválida. Entre de novo.' };
  }
  const owned = r.bands.find((b) => b.ownerUserId === userId);
  if (!owned) {
    return { ok: false, message: 'Você ainda não tem banda como administrador.' };
  }
  const bandId = owned.id;
  r.bands = r.bands.filter((b) => b.id !== bandId);
  r.memberships = r.memberships.filter((m) => m.bandId !== bandId);
  await saveRegistry(r);
  return { ok: true, profile: buildProfileFromRegistry(r, user) };
}

export type RegisterResult =
  | { ok: true; profile: PersistedProfile }
  | { ok: false; message: string };

export async function registerAccount(input: RegisterInput): Promise<RegisterResult> {
  if (isSupabaseConfigured()) {
    return registerAccountRemote(input);
  }
  if (!isInsecureLocalAuthAllowed()) {
    return {
      ok: false,
      message:
        'Cadastro local está desativado por segurança. Configure Supabase (.env) ou ative EXPO_PUBLIC_ALLOW_INSECURE_LOCAL_AUTH apenas para desenvolvimento.',
    };
  }
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) {
    return { ok: false, message: 'Informe um e-mail válido.' };
  }
  const passwordPolicyError = getPasswordPolicyError(input.password);
  if (passwordPolicyError) {
    return { ok: false, message: passwordPolicyError };
  }

  const r = await loadRegistry();
  if (findUserByEmail(r, email)) {
    return { ok: false, message: 'Este e-mail já está cadastrado. Use Entrar.' };
  }

  if (input.isBand && !input.bandName.trim()) {
    return { ok: false, message: 'Informe o nome da banda ou desmarque “Criar banda”.' };
  }
  if (input.isStudio && !input.studioName.trim()) {
    return { ok: false, message: 'Informe o nome do estúdio ou desmarque “Dono de estúdio”.' };
  }

  const userId = `usr_${randomSuffix()}`;
  const now = new Date().toISOString();
  let ownerStudioId: string | null = null;
  let studioName: string | null = null;
  if (input.isStudio && input.studioName.trim()) {
    ownerStudioId = `studio_${randomSuffix()}`;
    studioName = input.studioName.trim();
  }

  const user: LocalUser = {
    id: userId,
    email,
    password: input.password,
    displayName: input.displayName?.trim() || null,
    createdAt: now,
    studioName,
    ownerStudioId,
  };
  r.users.push(user);

  let bandIds: string[] = [];
  let bandName: string | null = null;
  let ownedBandId: string | null = null;
  let ownedBandName: string | null = null;
  let ownedInviteToken: string | null = null;

  if (input.isBand && input.bandName.trim()) {
    const bandId = `bnd_${randomSuffix()}`;
    const inviteToken = newInviteToken();
    const band: LocalBand = {
      id: bandId,
      name: input.bandName.trim(),
      ownerUserId: userId,
      inviteToken,
      createdAt: now,
    };
    r.bands.push(band);
    r.memberships.push({ userId, bandId, role: 'owner' });
    bandIds = [bandId];
    bandName = band.name;
    ownedBandId = bandId;
    ownedBandName = band.name;
    ownedInviteToken = inviteToken;
  }

  const profile: PersistedProfile = {
    userId,
    email,
    displayName: user.displayName,
    bandName,
    bandIds,
    ownedBandId,
    ownedBandName,
    ownedInviteToken,
    studioName,
    ownerStudioId,
  };

  await saveRegistry(r);
  return { ok: true, profile };
}

export async function getInviteUrlForOwnedBand(ownerBandId: string): Promise<string | null> {
  if (isSupabaseConfigured()) {
    return getInviteUrlForOwnedBandRemote(ownerBandId);
  }
  const r = await loadRegistry();
  const b = r.bands.find((x) => x.id === ownerBandId);
  if (!b) return null;
  return buildInviteUrl(b.inviteToken);
}

export async function listBandsDetailForUser(userId: string): Promise<{ name: string; role: string }[]> {
  if (isSupabaseConfigured()) {
    return listBandsDetailForUserRemote(userId);
  }
  const r = await loadRegistry();
  const mids = r.memberships.filter((m) => m.userId === userId);
  return mids
    .map((m) => {
      const band = r.bands.find((b) => b.id === m.bandId);
      if (!band) return null;
      return {
        name: band.name,
        role: m.role === 'owner' ? 'Administrador' : 'Membro',
      };
    })
    .filter((x): x is { name: string; role: string } => x !== null);
}
