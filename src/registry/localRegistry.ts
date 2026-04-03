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
  leaveBandRemote,
  listOwnedBandsForUserRemote,
  promoteBandMemberForOwnerRemote,
  demoteBandAdminForOwnerRemote,
  removeBandMemberForOwnerRemote,
  listBandMembersForOwnerRemote,
  listBandsDetailForUserRemote,
  loginWithPasswordRemote,
  peekInviteBandNameRemote,
  regenerateOwnedBandInviteRemote,
  registerAccountRemote,
  renameOwnedBandRemote,
  updateOwnedBandPhotoRemote,
} from '../lib/supabase/remoteRegistry';
import type { RegisterInput } from './registerTypes';

export type { RegisterInput };
export type OwnedBandSummary = {
  id: string;
  name: string;
  inviteToken: string | null;
  photoUrl: string | null;
};

export type BandMemberSummary = {
  userId: string;
  displayName: string | null;
  email: string | null;
  role: 'admin' | 'member';
  joinedAt: string | null;
};

export type BandActionResult = { ok: true } | { ok: false; message: string };


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
  photoUrl: string | null;
  createdAt: string;
};

export type Membership = {
  userId: string;
  bandId: string;
  role: 'owner' | 'admin' | 'member';
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
  const randomLen = 24;
  let randomPart = '';

  const maybeCrypto = (globalThis as { crypto?: { getRandomValues?: (arr: Uint8Array) => Uint8Array } }).crypto;
  if (maybeCrypto?.getRandomValues) {
    const bytes = new Uint8Array(randomLen);
    maybeCrypto.getRandomValues(bytes);
    for (let i = 0; i < bytes.length; i++) {
      randomPart += chars[bytes[i] % chars.length];
    }
  } else {
    for (let i = 0; i < randomLen; i++) {
      randomPart += chars[Math.floor(Math.random() * chars.length)];
    }
  }

  const timePart = Date.now().toString(36);
  return `inv_${timePart}_${randomPart}`;
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
  const now = new Date().toISOString();
  const bandId = `bnd_${randomSuffix()}`;
  const inviteToken = newInviteToken();
  r.bands.push({
    id: bandId,
    name,
    ownerUserId: userId,
    inviteToken,
    photoUrl: null,
    createdAt: now,
  });
  r.memberships.push({ userId, bandId, role: 'owner' });
  await saveRegistry(r);
  return { ok: true, profile: buildProfileFromRegistry(r, user) };
}

export async function renameOwnedBand(userId: string, nextBandName: string, bandId?: string): Promise<JoinBandResult> {
  const name = nextBandName.trim();
  if (!name) {
    return { ok: false, message: 'Informe o nome da banda.' };
  }
  if (isSupabaseConfigured()) {
    return renameOwnedBandRemote(name, bandId);
  }
  const r = await loadRegistry();
  const user = r.users.find((u) => u.id === userId);
  if (!user) {
    return { ok: false, message: 'Sessão inválida. Entre de novo.' };
  }
  const managedBandId =
    bandId ??
    r.memberships.find((m) => m.userId === userId && (m.role === 'owner' || m.role === 'admin'))?.bandId ??
    null;
  if (!managedBandId) {
    return { ok: false, message: 'Você não tem permissão de administração em nenhuma banda.' };
  }
  const managed = r.bands.find((b) => b.id === managedBandId);
  if (!managed) {
    return { ok: false, message: 'Banda não encontrada.' };
  }
  const canManage = r.memberships.some(
    (m) => m.userId === userId && m.bandId === managedBandId && (m.role === 'owner' || m.role === 'admin'),
  );
  if (!canManage) {
    return { ok: false, message: 'Sem permissão para editar esta banda.' };
  }
  managed.name = name;
  await saveRegistry(r);
  return { ok: true, profile: buildProfileFromRegistry(r, user) };
}

export async function regenerateOwnedBandInvite(userId: string, bandId?: string): Promise<JoinBandResult> {
  if (isSupabaseConfigured()) {
    return regenerateOwnedBandInviteRemote(bandId);
  }
  const r = await loadRegistry();
  const user = r.users.find((u) => u.id === userId);
  if (!user) {
    return { ok: false, message: 'Sessão inválida. Entre de novo.' };
  }
  const managedBandId =
    bandId ??
    r.memberships.find((m) => m.userId === userId && (m.role === 'owner' || m.role === 'admin'))?.bandId ??
    null;
  if (!managedBandId) {
    return { ok: false, message: 'Você não tem permissão de administração em nenhuma banda.' };
  }
  const managed = r.bands.find((b) => b.id === managedBandId);
  if (!managed) {
    return { ok: false, message: 'Banda não encontrada.' };
  }
  const canManage = r.memberships.some(
    (m) => m.userId === userId && m.bandId === managedBandId && (m.role === 'owner' || m.role === 'admin'),
  );
  if (!canManage) {
    return { ok: false, message: 'Sem permissão para gerar convite desta banda.' };
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
  managed.inviteToken = token;
  await saveRegistry(r);
  return { ok: true, profile: buildProfileFromRegistry(r, user) };
}

export async function deleteOwnedBand(userId: string, bandId?: string): Promise<JoinBandResult> {
  if (isSupabaseConfigured()) {
    return deleteOwnedBandRemote(bandId);
  }
  const r = await loadRegistry();
  const user = r.users.find((u) => u.id === userId);
  if (!user) {
    return { ok: false, message: 'Sessão inválida. Entre de novo.' };
  }
  const managedBandId =
    bandId ??
    r.memberships.find((m) => m.userId === userId && (m.role === 'owner' || m.role === 'admin'))?.bandId ??
    null;
  if (!managedBandId) {
    return { ok: false, message: 'Você não tem permissão de administração em nenhuma banda.' };
  }
  const managed = r.bands.find((b) => b.id === managedBandId);
  if (!managed) {
    return { ok: false, message: 'Banda não encontrada.' };
  }
  const canManage = r.memberships.some(
    (m) => m.userId === userId && m.bandId === managedBandId && (m.role === 'owner' || m.role === 'admin'),
  );
  if (!canManage) {
    return { ok: false, message: 'Sem permissão para excluir esta banda.' };
  }
  const targetBandId = managed.id;
  r.bands = r.bands.filter((b) => b.id !== targetBandId);
  r.memberships = r.memberships.filter((m) => m.bandId !== targetBandId);
  await saveRegistry(r);
  return { ok: true, profile: buildProfileFromRegistry(r, user) };
}

export async function updateOwnedBandPhoto(
  userId: string,
  photoUrl: string | null,
  bandId?: string,
): Promise<JoinBandResult> {
  if (isSupabaseConfigured()) {
    return updateOwnedBandPhotoRemote(photoUrl, bandId);
  }
  const r = await loadRegistry();
  const user = r.users.find((u) => u.id === userId);
  if (!user) {
    return { ok: false, message: 'Sessão inválida. Entre de novo.' };
  }
  const managedBandId =
    bandId ??
    r.memberships.find((m) => m.userId === userId && (m.role === 'owner' || m.role === 'admin'))?.bandId ??
    null;
  if (!managedBandId) {
    return { ok: false, message: 'Você não tem permissão de administração em nenhuma banda.' };
  }
  const managed = r.bands.find((b) => b.id === managedBandId);
  if (!managed) {
    return { ok: false, message: 'Banda não encontrada.' };
  }
  const canManage = r.memberships.some(
    (m) => m.userId === userId && m.bandId === managedBandId && (m.role === 'owner' || m.role === 'admin'),
  );
  if (!canManage) {
    return { ok: false, message: 'Sem permissão para editar a foto desta banda.' };
  }
  managed.photoUrl = photoUrl;
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
      photoUrl: null,
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

export async function listBandsDetailForUser(
  userId: string,
): Promise<{ id: string; name: string; role: string; canManage: boolean; inviteToken: string | null; photoUrl: string | null }[]> {
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
        id: band.id,
        name: band.name,
        role: m.role === 'owner' || m.role === 'admin' ? 'Administrador' : 'Membro',
        canManage: m.role === 'owner' || m.role === 'admin',
        inviteToken: m.role === 'owner' || m.role === 'admin' ? band.inviteToken : null,
        photoUrl: band.photoUrl ?? null,
      };
    })
    .filter(
      (
        x,
      ): x is { id: string; name: string; role: string; canManage: boolean; inviteToken: string | null; photoUrl: string | null } =>
        x !== null,
    );
}

export async function listOwnedBandsForUser(userId: string): Promise<OwnedBandSummary[]> {
  if (isSupabaseConfigured()) {
    return listOwnedBandsForUserRemote(userId);
  }
  const r = await loadRegistry();
  const managedBandIds = new Set(
    r.memberships.filter((m) => m.userId === userId && (m.role === 'owner' || m.role === 'admin')).map((m) => m.bandId),
  );
  return r.bands
    .filter((b) => managedBandIds.has(b.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((b) => ({ id: b.id, name: b.name, inviteToken: b.inviteToken ?? null, photoUrl: b.photoUrl ?? null }));
}

export async function listBandMembersForOwner(userId: string, bandId: string): Promise<BandMemberSummary[]> {
  if (isSupabaseConfigured()) {
    return listBandMembersForOwnerRemote(userId, bandId);
  }
  const r = await loadRegistry();
  const canView = r.memberships.some((m) => m.userId === userId && m.bandId === bandId);
  if (!canView) return [];

  return r.memberships
    .filter((m) => m.bandId === bandId)
    .map((m) => {
      const u = r.users.find((x) => x.id === m.userId);
      const role: 'admin' | 'member' = m.role === 'member' ? 'member' : 'admin';
      return {
        userId: m.userId,
        displayName: u?.displayName ?? null,
        email: u?.email ?? null,
        role,
        joinedAt: null,
      };
    })
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === 'admin' ? -1 : 1;
      return (a.displayName || a.email || '').localeCompare(b.displayName || b.email || '');
    });
}

export async function demoteBandAdminForOwner(
  userId: string,
  bandId: string,
  memberUserId: string,
): Promise<BandActionResult> {
  if (isSupabaseConfigured()) {
    return demoteBandAdminForOwnerRemote(userId, bandId, memberUserId);
  }
  const r = await loadRegistry();
  const band = r.bands.find((b) => b.id === bandId);
  if (!band) return { ok: false, message: 'Banda não encontrada.' };
  const canManage = r.memberships.some(
    (m) => m.userId === userId && m.bandId === bandId && (m.role === 'owner' || m.role === 'admin'),
  );
  if (!canManage) return { ok: false, message: 'Somente administradores podem alterar privilégios.' };
  if (memberUserId === band.ownerUserId) return { ok: false, message: 'O criador da banda não pode perder privilégios.' };
  const member = r.memberships.find((m) => m.bandId === bandId && m.userId === memberUserId);
  if (!member) return { ok: false, message: 'Integrante não encontrado nesta banda.' };
  if (member.role !== 'admin') return { ok: false, message: 'Este integrante já é membro comum.' };
  member.role = 'member';
  await saveRegistry(r);
  return { ok: true };
}

export async function removeBandMemberForOwner(
  userId: string,
  bandId: string,
  memberUserId: string,
): Promise<BandActionResult> {
  if (isSupabaseConfigured()) {
    return removeBandMemberForOwnerRemote(userId, bandId, memberUserId);
  }
  const r = await loadRegistry();
  const band = r.bands.find((b) => b.id === bandId);
  if (!band) return { ok: false, message: 'Banda não encontrada.' };
  const canManage = r.memberships.some(
    (m) => m.userId === userId && m.bandId === bandId && (m.role === 'owner' || m.role === 'admin'),
  );
  if (!canManage) return { ok: false, message: 'Somente administradores podem remover integrantes.' };
  if (memberUserId === band.ownerUserId) return { ok: false, message: 'O criador da banda não pode ser removido.' };
  const before = r.memberships.length;
  r.memberships = r.memberships.filter((m) => !(m.bandId === bandId && m.userId === memberUserId));
  if (r.memberships.length === before) return { ok: false, message: 'Integrante não encontrado nesta banda.' };
  await saveRegistry(r);
  return { ok: true };
}

export async function promoteBandMemberForOwner(
  userId: string,
  bandId: string,
  memberUserId: string,
): Promise<BandActionResult> {
  if (isSupabaseConfigured()) {
    return promoteBandMemberForOwnerRemote(userId, bandId, memberUserId);
  }
  const r = await loadRegistry();
  const band = r.bands.find((b) => b.id === bandId);
  if (!band) return { ok: false, message: 'Banda não encontrada.' };
  const canManage = r.memberships.some(
    (m) => m.userId === userId && m.bandId === bandId && (m.role === 'owner' || m.role === 'admin'),
  );
  if (!canManage) return { ok: false, message: 'Somente administradores podem promover integrantes.' };
  if (memberUserId === band.ownerUserId) return { ok: false, message: 'O criador já é administrador principal.' };
  const member = r.memberships.find((m) => m.bandId === bandId && m.userId === memberUserId);
  if (!member) return { ok: false, message: 'Integrante não encontrado nesta banda.' };
  member.role = 'admin';
  await saveRegistry(r);
  return { ok: true };
}

export async function leaveBand(userId: string, bandId: string): Promise<JoinBandResult> {
  if (isSupabaseConfigured()) {
    return leaveBandRemote(userId, bandId);
  }
  const r = await loadRegistry();
  const user = r.users.find((u) => u.id === userId);
  if (!user) return { ok: false, message: 'Sessão inválida. Entre de novo.' };
  const band = r.bands.find((b) => b.id === bandId);
  if (!band) return { ok: false, message: 'Banda não encontrada.' };
  if (band.ownerUserId === userId) {
    return { ok: false, message: 'O dono não pode sair da própria banda. Exclua a banda ou transfira a gestão.' };
  }
  const before = r.memberships.length;
  r.memberships = r.memberships.filter((m) => !(m.bandId === bandId && m.userId === userId));
  if (r.memberships.length === before) return { ok: false, message: 'Você não faz parte desta banda.' };
  await saveRegistry(r);
  return { ok: true, profile: buildProfileFromRegistry(r, user) };
}
