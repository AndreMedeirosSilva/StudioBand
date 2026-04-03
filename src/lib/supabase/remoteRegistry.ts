import type { User } from '@supabase/supabase-js';
import type { PersistedProfile } from '../../storage/persistSession';
import type { RegisterInput } from '../../registry/registerTypes';
import { getPasswordPolicyError, isValidEmail, normalizeEmail } from '../auth/credentialsPolicy';
import { buildInviteUrl, parseInviteToken } from '../inviteLink';
import { getSupabase } from './client';
import { isSupabaseConfigured } from './config';

export type RemoteLoginResult =
  | { ok: true; profile: PersistedProfile }
  | { ok: false; message: string };

function mapAuthMessage(err: { message?: string } | null): string {
  const m = (err?.message ?? '').toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('invalid_credentials')) {
    return 'E-mail ou senha incorretos.';
  }
  if (m.includes('user already registered') || m.includes('already registered')) {
    return 'Este e-mail já está cadastrado. Use Entrar.';
  }
  if (m.includes('email not confirmed')) {
    return 'Confirme o e-mail antes de entrar.';
  }
  if (m.includes('database error saving new user') || m.includes('saving new user')) {
    return 'O Supabase falhou ao criar o perfil (tabela profiles ou trigger). Abra o SQL do projeto e os logs em Authentication.';
  }
  if (m.includes('password') && (m.includes('weak') || m.includes('least'))) {
    return 'Senha fraca: use mais caracteres ou misture letras e números.';
  }
  if (m.includes('signup') && m.includes('disabled')) {
    return 'Novos registos estão desativados no painel do Supabase (Authentication).';
  }
  if (m.includes('invalid') && m.includes('jwt')) {
    return 'Chave API inválida. No Supabase use a chave anon (JWT) em EXPO_PUBLIC_SUPABASE_ANON_KEY ou confirme a publishable.';
  }
  return err?.message?.trim() || 'Não foi possível concluir. Tente de novo.';
}

function mapDbError(msg: string | undefined): string {
  const m = (msg ?? '').toLowerCase();
  if (m.includes('row-level security') || m.includes('rls') || m.includes('policy')) {
    return 'A base de dados recusou a operação (RLS). Verifique as políticas no Supabase.';
  }
  return msg?.trim() || 'Erro ao guardar dados.';
}

/** Erros levantados por `public.create_owned_band` (RPC) ou mensagens do PostgREST. */
function mapOwnedBandRpcError(err: { message?: string; code?: string } | null): string {
  const raw = err?.message ?? '';
  const m = raw.toLowerCase();
  if (m.includes('not_authenticated')) {
    return 'Sessão inválida. Entre de novo.';
  }
  if (m.includes('already_has_owned_band')) {
    return 'Você já criou uma banda como administrador. Use o link de convite ou entre em outras bandas com código.';
  }
  if (m.includes('empty_band_name')) {
    return 'Informe o nome da banda.';
  }
  if (m.includes('empty_invite_token')) {
    return 'Erro ao gerar o código de convite. Tente de novo.';
  }
  if (
    m.includes('primary_owner_user_id') ||
    m.includes('owner_user_id') ||
    m.includes('already has owned band') ||
    m.includes('already_has_owned_band')
  ) {
    return 'Você já criou uma banda como administrador. Use o link de convite ou entre em outras bandas com código.';
  }
  if (m.includes('unique') || m.includes('duplicate') || m.includes('invite_token')) {
    return 'Conflito no código de convite. Tente criar a banda de novo.';
  }
  if (m.includes('create_owned_band') && (m.includes('does not exist') || m.includes('schema cache'))) {
    return 'Função create_owned_band em falta no Supabase. Execute a migração 20260329140000_create_owned_band_rpc.sql no SQL Editor do projeto.';
  }
  if (m.includes('permission denied') || m.includes('rls')) {
    return mapDbError(raw);
  }
  return raw.trim() || mapDbError(raw);
}

function isInviteTokenConflictError(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const m = (err.message ?? '').toLowerCase();
  const looksLikeOwnerUniq =
    m.includes('primary_owner_user_id') ||
    m.includes('owner_user_id') ||
    m.includes('already_has_owned_band') ||
    m.includes('already has owned band');
  if (looksLikeOwnerUniq) return false;
  return (
    (err.code === '23505' && m.includes('invite')) ||
    (m.includes('unique') && m.includes('invite_token')) ||
    (m.includes('duplicate key value') && m.includes('invite')) ||
    m.includes('invite_token')
  );
}

async function createOwnedBandWithRetry(
  sb: ReturnType<typeof getSupabase>,
  bandName: string,
): Promise<{ ok: true; bandId: string; inviteToken: string } | { ok: false; error: { message?: string; code?: string } | null }> {
  const MAX_TRIES = 6;
  for (let i = 0; i < MAX_TRIES; i++) {
    const token = newInviteToken();
    const { data: bandIdRaw, error } = await sb.rpc('create_owned_band', {
      p_name: bandName,
      p_invite_token: token,
    });
    if (!error && bandIdRaw != null) {
      return { ok: true, bandId: String(bandIdRaw), inviteToken: token };
    }
    if (!isInviteTokenConflictError(error)) {
      return { ok: false, error };
    }
  }
  return {
    ok: false,
    error: { message: 'Conflito repetido ao gerar código de convite. Tente novamente em alguns segundos.' },
  };
}

async function resolveAuthUser(sb: ReturnType<typeof getSupabase>): Promise<User | null> {
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (session?.user) return session.user;
  const {
    data: { user },
  } = await sb.auth.getUser();
  return user ?? null;
}

function newInviteToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = 'inv_';
  for (let i = 0; i < 22; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/** Perfil mínimo só a partir do JWT (OAuth Google, etc.) quando o Postgres ainda não respondeu. */
export function minimalProfileFromAuthUser(user: User): PersistedProfile {
  const meta = user.user_metadata ?? {};
  const fromMeta =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    (typeof meta.display_name === 'string' && meta.display_name) ||
    null;
  const email = (user.email ?? '').trim().toLowerCase() || (user.email ?? '');
  return {
    userId: user.id,
    email,
    displayName: fromMeta,
    bandName: null,
    bandIds: [],
    ownedBandId: null,
    ownedBandName: null,
    ownedInviteToken: null,
    studioName: null,
    ownerStudioId: null,
  };
}

export async function buildPersistedProfileForUser(user: User): Promise<PersistedProfile | null> {
  const sb = getSupabase();
  const userId = user.id;
  const email = (user.email ?? '').trim().toLowerCase();

  const { data: prof, error: pErr } = await sb.from('profiles').select('display_name').eq('id', userId).maybeSingle();
  const displayName =
    !pErr && prof?.display_name != null
      ? prof.display_name
      : (user.user_metadata?.display_name as string | undefined) ??
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        null;

  const { data: memberships, error: mErr } = await sb
    .from('band_memberships')
    .select('band_id, role, bands ( id, name, primary_owner_user_id )')
    .eq('user_id', userId);
  if (mErr) {
    return minimalProfileFromAuthUser(user);
  }

  type Row = {
    band_id: string;
    role: string;
    bands: { id: string; name: string; primary_owner_user_id: string } | null;
  };
  const rows = (memberships ?? []) as unknown as Row[];

  const bandIds = [...new Set(rows.map((r) => r.band_id).filter(Boolean))];
  const bands = rows
    .map((r) => r.bands)
    .filter((b): b is NonNullable<typeof b> => b != null)
    .sort((a, b) => a.name.localeCompare(b.name));
  const dedupBands = [...new Map(bands.map((b) => [b.id, b])).values()].sort((a, b) => a.name.localeCompare(b.name));

  const { data: ownedBand } = await sb
    .from('bands')
    .select('id, name, invite_token')
    .eq('primary_owner_user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  type OwnedBandRow = { id: string; name: string; invite_token: string | null };
  const ob = ownedBand as OwnedBandRow | null;
  const ownedBandId = ob?.id ?? null;
  const ownedBandName = ob?.name ?? null;
  const ownedInviteToken = ob?.invite_token?.trim() || null;

  const bandName =
    dedupBands.length > 0
      ? dedupBands.length === 1
        ? dedupBands[0].name
        : `${dedupBands[0].name} +${dedupBands.length - 1}`
      : null;

  const { data: studio } = await sb
    .from('studios')
    .select('id, name')
    .eq('owner_user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return {
    userId,
    email: email || (user.email ?? ''),
    displayName: typeof displayName === 'string' ? displayName : null,
    bandName,
    bandIds,
    ownedBandId,
    ownedBandName,
    ownedInviteToken,
    studioName: studio?.name ?? null,
    ownerStudioId: studio?.id ?? null,
  };
}

export async function loginWithPasswordRemote(email: string, password: string): Promise<RemoteLoginResult> {
  const e = normalizeEmail(email);
  const sb = getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email: e, password });
  if (error || !data.user) {
    return { ok: false, message: mapAuthMessage(error) };
  }
  const profile = await buildPersistedProfileForUser(data.user);
  if (!profile) {
    return { ok: false, message: 'Perfil indisponível. Verifique as tabelas no Supabase.' };
  }
  return { ok: true, profile };
}

export async function registerAccountRemote(input: RegisterInput): Promise<RemoteLoginResult> {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) {
    return { ok: false, message: 'Informe um e-mail válido.' };
  }
  const passwordPolicyError = getPasswordPolicyError(input.password);
  if (passwordPolicyError) {
    return { ok: false, message: passwordPolicyError };
  }
  if (input.isBand && !input.bandName.trim()) {
    return { ok: false, message: 'Informe o nome da banda ou desmarque “Criar banda”.' };
  }
  if (input.isStudio && !input.studioName.trim()) {
    return { ok: false, message: 'Informe o nome do estúdio ou desmarque “Dono de estúdio”.' };
  }

  const sb = getSupabase();
  const { data, error } = await sb.auth.signUp({
    email,
    password: input.password,
    options: {
      data: { display_name: input.displayName?.trim() || null },
    },
  });

  if (error) {
    return { ok: false, message: mapAuthMessage(error) };
  }
  if (!data.user) {
    return { ok: false, message: 'Cadastro incompleto. Tente de novo.' };
  }

  if (!data.session) {
    return {
      ok: false,
      message:
        'Conta criada no Supabase, mas ainda sem sessão: abra o link de confirmação no e-mail (e spam). Para testar sem e-mail: Dashboard → Authentication → Providers → Email → desligar “Confirm email”. Depois use Entrar ou cadastre de novo.',
    };
  }

  const userId = data.user.id;
  const displayName = input.displayName?.trim() || null;

  const { error: profUpdErr } = await sb
    .from('profiles')
    .update({ display_name: displayName, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (profUpdErr) {
    return { ok: false, message: mapDbError(profUpdErr.message) };
  }

  if (input.isStudio && input.studioName.trim()) {
    const { error: studioErr } = await sb.from('studios').insert({
      owner_user_id: userId,
      name: input.studioName.trim(),
      default_price_per_hour_cents: 9000,
      timezone: 'Europe/Lisbon',
    });
    if (studioErr) {
      return { ok: false, message: `Estúdio: ${mapDbError(studioErr.message)}` };
    }
  }

  let registeredOwned:
    | { bandId: string; bandName: string; inviteToken: string }
    | null = null;
  if (input.isBand && input.bandName.trim()) {
    const trimmedBandName = input.bandName.trim();
    const ownedCreate = await createOwnedBandWithRetry(sb, trimmedBandName);
    if (!ownedCreate.ok) {
      return {
        ok: false,
        message: mapOwnedBandRpcError(ownedCreate.error) || 'Não foi possível criar a banda.',
      };
    }
    registeredOwned = {
      bandId: ownedCreate.bandId,
      bandName: trimmedBandName,
      inviteToken: ownedCreate.inviteToken,
    };
  }

  const profile = await buildPersistedProfileForUser(data.user);
  if (!profile) {
    return {
      ok: false,
      message:
        'Sessão criada, mas não foi possível ler o perfil (tabelas profiles/bandas ou RLS). Confira o SQL aplicado e os logs do Supabase.',
    };
  }
  if (registeredOwned) {
    return {
      ok: true,
      profile: {
        ...profile,
        ownedBandId: registeredOwned.bandId,
        ownedBandName: registeredOwned.bandName,
        ownedInviteToken: registeredOwned.inviteToken,
      },
    };
  }
  return { ok: true, profile };
}

export async function createOwnedBandRemote(bandName: string): Promise<RemoteLoginResult> {
  const name = bandName.trim();
  if (!name) {
    return { ok: false, message: 'Informe o nome da banda.' };
  }
  const sb = getSupabase();
  const user = await resolveAuthUser(sb);
  if (!user) {
    return { ok: false, message: 'Sessão inválida. Entre de novo.' };
  }

  const created = await createOwnedBandWithRetry(sb, name);
  if (!created.ok) {
    return {
      ok: false,
      message: mapOwnedBandRpcError(created.error) || 'Não foi possível criar a banda.',
    };
  }

  const profile = await buildPersistedProfileForUser(user);
  if (!profile) {
    return { ok: false, message: 'Banda criada, mas falhou ao atualizar o perfil.' };
  }
  return {
    ok: true,
    profile: {
      ...profile,
      ownedBandId: created.bandId,
      ownedBandName: name,
      ownedInviteToken: created.inviteToken,
    },
  };
}

async function getOwnedBandForUserId(
  sb: ReturnType<typeof getSupabase>,
  userId: string,
): Promise<{ id: string; name: string; invite_token: string | null } | null> {
  const { data, error } = await sb
    .from('bands')
    .select('id, name, invite_token')
    .eq('primary_owner_user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

export async function renameOwnedBandRemote(nextBandName: string): Promise<RemoteLoginResult> {
  const name = nextBandName.trim();
  if (!name) {
    return { ok: false, message: 'Informe o nome da banda.' };
  }
  const sb = getSupabase();
  const user = await resolveAuthUser(sb);
  if (!user) {
    return { ok: false, message: 'Sessão inválida. Entre de novo.' };
  }
  const owned = await getOwnedBandForUserId(sb, user.id);
  if (!owned) {
    return { ok: false, message: 'Você ainda não tem banda como administrador.' };
  }
  const { error } = await sb
    .from('bands')
    .update({ name })
    .eq('id', owned.id)
    .eq('primary_owner_user_id', user.id);
  if (error) {
    return { ok: false, message: mapDbError(error.message) };
  }
  const profile = await buildPersistedProfileForUser(user);
  if (!profile) return { ok: false, message: 'Banda atualizada, mas falhou ao carregar o perfil.' };
  return { ok: true, profile };
}

export async function regenerateOwnedBandInviteRemote(): Promise<RemoteLoginResult> {
  const sb = getSupabase();
  const user = await resolveAuthUser(sb);
  if (!user) {
    return { ok: false, message: 'Sessão inválida. Entre de novo.' };
  }
  const owned = await getOwnedBandForUserId(sb, user.id);
  if (!owned) {
    return { ok: false, message: 'Você ainda não tem banda como administrador.' };
  }
  const MAX_TRIES = 8;
  for (let i = 0; i < MAX_TRIES; i++) {
    const token = newInviteToken();
    const { error } = await sb
      .from('bands')
      .update({ invite_token: token })
      .eq('id', owned.id)
      .eq('primary_owner_user_id', user.id);
    if (!error) {
      const profile = await buildPersistedProfileForUser(user);
      if (!profile) return { ok: false, message: 'Convite atualizado, mas falhou ao carregar o perfil.' };
      return {
        ok: true,
        profile: { ...profile, ownedInviteToken: token },
      };
    }
    if (!isInviteTokenConflictError(error)) {
      return { ok: false, message: mapDbError(error.message) };
    }
  }
  return { ok: false, message: 'Não foi possível gerar um novo código de convite agora. Tente de novo.' };
}

export async function deleteOwnedBandRemote(): Promise<RemoteLoginResult> {
  const sb = getSupabase();
  const user = await resolveAuthUser(sb);
  if (!user) {
    return { ok: false, message: 'Sessão inválida. Entre de novo.' };
  }
  const owned = await getOwnedBandForUserId(sb, user.id);
  if (!owned) {
    return { ok: false, message: 'Você ainda não tem banda como administrador.' };
  }

  const { error: membershipsErr } = await sb.from('band_memberships').delete().eq('band_id', owned.id);
  if (membershipsErr) {
    return { ok: false, message: mapDbError(membershipsErr.message) };
  }
  const { error: bandErr } = await sb
    .from('bands')
    .delete()
    .eq('id', owned.id)
    .eq('primary_owner_user_id', user.id);
  if (bandErr) {
    return { ok: false, message: mapDbError(bandErr.message) };
  }
  const profile = await buildPersistedProfileForUser(user);
  if (!profile) return { ok: false, message: 'Banda removida, mas falhou ao carregar o perfil.' };
  return { ok: true, profile };
}

export async function joinBandWithInviteRemote(userId: string, inviteToken: string): Promise<RemoteLoginResult> {
  const t = parseInviteToken(inviteToken);
  if (!t) {
    return { ok: false, message: 'Cole o código do convite (ex.: inv_…) ou o link com ?join=….' };
  }
  const sb = getSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || user.id !== userId) {
    return { ok: false, message: 'Sessão inválida. Entre de novo.' };
  }

  const { error } = await sb.rpc('join_band_by_invite', { p_token: t });
  if (error) {
    const msg = error.message?.toLowerCase() ?? '';
    if (msg.includes('invalid_invite') || msg.includes('invalid invite')) {
      return { ok: false, message: 'Convite inválido ou expirado.' };
    }
    if (msg.includes('already_member')) {
      return { ok: false, message: 'Você já faz parte desta banda.' };
    }
    return { ok: false, message: error.message || 'Não foi possível entrar na banda.' };
  }

  const profile = await buildPersistedProfileForUser(user);
  if (!profile) {
    return { ok: false, message: 'Associação ok, mas falhou ao carregar o perfil.' };
  }
  return { ok: true, profile };
}

export async function getInviteUrlForOwnedBandRemote(ownerBandId: string): Promise<string | null> {
  const sb = getSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb
    .from('bands')
    .select('invite_token')
    .eq('id', ownerBandId)
    .eq('primary_owner_user_id', user.id)
    .maybeSingle();
  if (!data?.invite_token) return null;
  return buildInviteUrl(data.invite_token);
}

export async function listBandsDetailForUserRemote(userId: string): Promise<{ name: string; role: string }[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('band_memberships')
    .select('role, bands ( name )')
    .eq('user_id', userId);
  if (error || !data) return [];
  type R = { role: string; bands: { name: string } | null };
  return (data as unknown as R[])
    .map((row) => {
      const name = row.bands?.name;
      if (!name) return null;
      return {
        name,
        role: row.role === 'admin' ? 'Administrador' : 'Membro',
      };
    })
    .filter((x): x is { name: string; role: string } => x !== null);
}

export async function peekInviteBandNameRemote(token: string): Promise<string | null> {
  const t = parseInviteToken(token);
  if (!t) return null;
  const sb = getSupabase();
  const { data, error } = await sb.rpc('peek_invite_band_name', { p_token: t });
  if (error || data == null) return null;
  return typeof data === 'string' ? data : null;
}

export async function signOutSupabaseIfNeeded(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    await getSupabase().auth.signOut();
  } catch {
    /* ignore */
  }
}
