import type { User } from '@supabase/supabase-js';
import type { PersistedProfile } from '../../storage/persistSession';
import type { RegisterInput } from '../../registry/registerTypes';
import { getPasswordPolicyError, isValidEmail, normalizeEmail } from '../auth/credentialsPolicy';
import { buildInviteUrl, parseInviteToken } from '../inviteLink';
import { getSupabase } from './client';
import { isSupabaseConfigured } from './config';

const SUPABASE_OP_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, timeoutMessage: string, ms = SUPABASE_OP_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export type RemoteLoginResult =
  | { ok: true; profile: PersistedProfile }
  | { ok: false; message: string };

export type RemoteActionResult = { ok: true } | { ok: false; message: string };

export type RemoteStudioUpsertInput = {
  studioName: string;
  addressLine: string;
  photoUrl: string | null;
};

export type RemoteStudioSummary = {
  id: string;
  name: string;
  addressLine: string | null;
  photoUrl: string | null;
  inviteToken: string | null;
};

function isMissingRpcError(rawMessage: string, fnName: string): boolean {
  const m = rawMessage.toLowerCase();
  return (
    m.includes(fnName.toLowerCase()) &&
    (m.includes('does not exist') || m.includes('schema cache') || m.includes('function'))
  );
}

async function getManagedStudioSummaryForUser(
  sb: ReturnType<typeof getSupabase>,
  userId: string,
): Promise<RemoteStudioSummary | null> {
  const { data: rpcData, error: rpcErr } = await sb.rpc('get_managed_studio_summary');
  if (!rpcErr && rpcData) {
    const rawRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!rawRow) return null;
    const row = rawRow as {
      studio_id: string;
      studio_name: string;
      address_line: string | null;
      photo_url: string | null;
      invite_token: string | null;
    };
    return {
      id: row.studio_id,
      name: row.studio_name,
      addressLine: row.address_line ?? null,
      photoUrl: row.photo_url?.trim() || null,
      inviteToken: row.invite_token?.trim() || null,
    };
  }
  const raw = rpcErr?.message ?? '';
  if (!raw || !isMissingRpcError(raw, 'get_managed_studio_summary')) {
    return null;
  }
  // Fallback para schema antigo: apenas o estúdio do owner.
  const { data: legacy } = await sb
    .from('studios')
    .select('id, name, address_line, photo_url, invite_token')
    .eq('owner_user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!legacy) return null;
  const l = legacy as {
    id: string;
    name: string;
    address_line?: string | null;
    photo_url?: string | null;
    invite_token?: string | null;
  };
  return {
    id: l.id,
    name: l.name,
    addressLine: l.address_line ?? null,
    photoUrl: l.photo_url?.trim() || null,
    inviteToken: l.invite_token?.trim() || null,
  };
}

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
  if (
    (m.includes('email') && m.includes('rate limit')) ||
    m.includes('email rate limit exceeded') ||
    m.includes('over_email_send_rate_limit') ||
    m.includes('rate_limit')
  ) {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos antes de tentar novamente, ou entre com Google/Apple.';
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
    return 'A função SQL create_owned_band ainda limita a uma banda por utilizador. Atualize essa função no Supabase para permitir várias bandas.';
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
    m.includes('band_memberships_user_id_key') ||
    m.includes('already_in_band') ||
    m.includes('already has owned band') ||
    m.includes('already_has_owned_band')
  ) {
    return 'Restrição de unicidade no Supabase bloqueou a operação. Se quiser múltiplas bandas por utilizador, remova a restrição única em band_memberships(user_id) e a validação de create_owned_band.';
  }
  const mentionsInviteToken =
    m.includes('invite_token') || m.includes('bands_invite_token_key') || m.includes('invite token');
  if ((m.includes('unique') || m.includes('duplicate')) && mentionsInviteToken) {
    return 'Conflito no código de convite. Tente criar a banda de novo.';
  }
  if (m.includes('unique') || m.includes('duplicate')) {
    return `Conflito de dados ao criar banda no Supabase. Detalhe: ${raw.trim() || 'erro de unicidade'}`;
  }
  if (m.includes('create_owned_band') && (m.includes('does not exist') || m.includes('schema cache'))) {
    return 'Função create_owned_band em falta no Supabase. Execute a migração 20260329140000_create_owned_band_rpc.sql no SQL Editor do projeto.';
  }
  if (m.includes('infinite recursion') && m.includes('policy') && m.includes('bands')) {
    return 'Política RLS recursiva em bands detectada no Supabase. Aplique a migração de RPC create_owned_band e use esse fluxo para criar banda.';
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
  const looksLikeUniqueViolation = err.code === '23505' || m.includes('duplicate key value') || m.includes('unique');
  const mentionsInviteToken =
    m.includes('invite_token') || m.includes('bands_invite_token_key') || m.includes('invite token');
  return looksLikeUniqueViolation && mentionsInviteToken;
}

async function createOwnedBandWithRetry(
  sb: ReturnType<typeof getSupabase>,
  userId: string,
  bandName: string,
): Promise<{ ok: true; bandId: string; inviteToken: string } | { ok: false; error: { message?: string; code?: string } | null }> {
  const MAX_TRIES = 6;
  for (let i = 0; i < MAX_TRIES; i++) {
    const token = newInviteToken();
    let bandInsert:
      | { data: { id: string } | null; error: { message?: string; code?: string } | null }
      | null = null;
    try {
      bandInsert = await withTimeout(
        Promise.resolve(
          sb
            .from('bands')
            .insert({
              name: bandName,
              primary_owner_user_id: userId,
              invite_token: token,
            })
            .select('id')
            .single(),
        ),
        'Tempo esgotado ao criar banda no Supabase. Verifique as policies e tente de novo.',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha de comunicação com o Supabase.';
      return { ok: false, error: { message } };
    }
    const bandId = bandInsert?.data?.id;
    const error = bandInsert?.error ?? null;
    if (!error && bandId) {
      const membership = await withTimeout(
        Promise.resolve(
          sb.from('band_memberships').insert({
            band_id: bandId,
            user_id: userId,
            role: 'admin',
          }),
        ),
        'Tempo esgotado ao vincular o utilizador à nova banda. Tente de novo.',
      );
      if (!membership.error) {
        return { ok: true, bandId, inviteToken: token };
      }
      return { ok: false, error: membership.error };
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

  // Inclui entropia temporal para reduzir ainda mais qualquer chance de colisão.
  const timePart = Date.now().toString(36);
  return `inv_${timePart}_${randomPart}`;
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

  const studio = await getManagedStudioSummaryForUser(sb, userId);

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

export async function upsertManagedStudioRemote(input: RemoteStudioUpsertInput): Promise<RemoteLoginResult> {
  const sb = getSupabase();
  const user = await resolveAuthUser(sb);
  if (!user) return { ok: false, message: 'Sessão inválida. Entre de novo.' };

  const studioName = input.studioName.trim();
  const addressLine = input.addressLine.trim();
  const photoUrl = input.photoUrl?.trim() ?? null;
  if (!studioName) return { ok: false, message: 'Informe o nome do estúdio.' };
  if (!addressLine) return { ok: false, message: 'Informe o endereço do estúdio.' };
  if (photoUrl && !/^https?:\/\//i.test(photoUrl)) {
    return { ok: false, message: 'A foto do estúdio precisa ser um link válido (http/https).' };
  }

  const { error } = await sb.rpc('admin_upsert_my_studio', {
    p_name: studioName,
    p_address_line: addressLine,
    p_photo_url: photoUrl,
  });
  if (error) {
    return { ok: false, message: mapDbError(error.message) };
  }
  const profile = await buildPersistedProfileForUser(user);
  if (!profile) return { ok: false, message: 'Estúdio salvo, mas falhou ao atualizar seu perfil.' };
  return { ok: true, profile };
}

export async function joinStudioWithInviteRemote(userId: string, inviteToken: string): Promise<RemoteLoginResult> {
  const t = parseInviteToken(inviteToken);
  if (!t) return { ok: false, message: 'Cole um código de convite válido do estúdio.' };
  const sb = getSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || user.id !== userId) {
    return { ok: false, message: 'Sessão inválida. Entre de novo.' };
  }
  const { error } = await sb.rpc('join_studio_by_invite', { p_token: t });
  if (error) {
    const m = (error.message ?? '').toLowerCase();
    if (m.includes('invalid_invite')) return { ok: false, message: 'Código de estúdio inválido.' };
    if (m.includes('already_member')) return { ok: false, message: 'Você já administra este estúdio.' };
    return { ok: false, message: mapDbError(error.message) };
  }
  const profile = await buildPersistedProfileForUser(user);
  if (!profile) return { ok: false, message: 'Convite aceito, mas não consegui atualizar seu perfil.' };
  return { ok: true, profile };
}

export async function peekInviteStudioNameRemote(token: string): Promise<string | null> {
  const t = parseInviteToken(token);
  if (!t) return null;
  const sb = getSupabase();
  const { data, error } = await sb.rpc('peek_invite_studio_name', { p_token: t });
  if (error || data == null) return null;
  return typeof data === 'string' ? data : null;
}

export async function getManagedStudioInviteTokenRemote(userId: string): Promise<string | null> {
  const sb = getSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || user.id !== userId) return null;
  const studio = await getManagedStudioSummaryForUser(sb, userId);
  if (!studio) return null;
  if (studio.inviteToken?.trim()) return studio.inviteToken.trim();
  const regen = await regenerateManagedStudioInviteRemote(userId);
  return regen.ok ? regen.inviteToken : null;
}

export async function regenerateManagedStudioInviteRemote(userId: string): Promise<{ ok: true; inviteToken: string } | { ok: false; message: string }> {
  const sb = getSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || user.id !== userId) {
    return { ok: false, message: 'Sessão inválida. Entre de novo.' };
  }
  const studio = await getManagedStudioSummaryForUser(sb, userId);
  if (!studio) return { ok: false, message: 'Você ainda não administra nenhum estúdio.' };
  const { data, error } = await sb.rpc('admin_regenerate_studio_invite', { p_studio_id: studio.id });
  if (error) return { ok: false, message: mapDbError(error.message) };
  const token = typeof data === 'string' ? data.trim() : '';
  if (!token) return { ok: false, message: 'Não foi possível gerar novo convite agora.' };
  return { ok: true, inviteToken: token };
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
        'Sua conta foi criada. Confirme seu e-mail (inclusive spam/lixo eletrônico) e depois entre normalmente.',
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
    const { error: studioErr } = await sb.rpc('admin_upsert_my_studio', {
      p_name: input.studioName.trim(),
      p_address_line: '',
      p_photo_url: null,
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
    const ownedCreate = await withTimeout(
      createOwnedBandWithRetry(sb, userId, trimmedBandName),
      'Tempo esgotado ao criar banda no Supabase. Verifique as policies/RPC e tente de novo.',
    );
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

  const created = await createOwnedBandWithRetry(sb, user.id, name);
  if (!created.ok) {
    return {
      ok: false,
      message: mapOwnedBandRpcError(created.error) || 'Não foi possível criar a banda.',
    };
  }

  const profile = await withTimeout(
    buildPersistedProfileForUser(user),
    'Banda criada, mas o perfil demorou demais para atualizar. Recarregue a página.',
  );
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

export async function renameOwnedBandRemote(nextBandName: string, bandId?: string): Promise<RemoteLoginResult> {
  const name = nextBandName.trim();
  if (!name) {
    return { ok: false, message: 'Informe o nome da banda.' };
  }
  const sb = getSupabase();
  const user = await resolveAuthUser(sb);
  if (!user) {
    return { ok: false, message: 'Sessão inválida. Entre de novo.' };
  }
  if (bandId) {
    const { error: adminErr } = await sb.rpc('admin_rename_band', { p_band_id: bandId, p_name: name });
    if (!adminErr) {
      const profile = await buildPersistedProfileForUser(user);
      if (!profile) return { ok: false, message: 'Banda atualizada, mas falhou ao carregar o perfil.' };
      return { ok: true, profile };
    }
    const m = (adminErr.message ?? '').toLowerCase();
    const rpcMissing =
      m.includes('admin_rename_band') && (m.includes('does not exist') || m.includes('schema cache') || m.includes('function'));
    if (!rpcMissing) {
      if (m.includes('not_admin')) return { ok: false, message: 'Apenas administradores podem editar esta banda.' };
      if (m.includes('band_not_found')) return { ok: false, message: 'Banda não encontrada.' };
      return { ok: false, message: mapDbError(adminErr.message) };
    }
  }
  const owned = bandId
    ? await sb
        .from('bands')
        .select('id, name, invite_token')
        .eq('id', bandId)
        .eq('primary_owner_user_id', user.id)
        .maybeSingle()
        .then(({ data, error }) => (error || !data ? null : data))
    : await getOwnedBandForUserId(sb, user.id);
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

export async function updateOwnedBandPhotoRemote(
  photoUrl: string | null,
  bandId?: string,
): Promise<RemoteLoginResult> {
  const sb = getSupabase();
  const user = await resolveAuthUser(sb);
  if (!user) {
    return { ok: false, message: 'Sessão inválida. Entre de novo.' };
  }
  const normalized = photoUrl?.trim() ?? null;
  if (bandId) {
    const { error: adminErr } = await sb.rpc('admin_update_band_photo', {
      p_band_id: bandId,
      p_photo_url: normalized && /^https?:\/\//i.test(normalized) ? normalized : null,
    });
    if (!adminErr) {
      const profile = await buildPersistedProfileForUser(user);
      if (!profile) return { ok: false, message: 'Foto atualizada, mas falhou ao carregar o perfil.' };
      return { ok: true, profile };
    }
    const m = (adminErr.message ?? '').toLowerCase();
    const rpcMissing =
      m.includes('admin_update_band_photo') &&
      (m.includes('does not exist') || m.includes('schema cache') || m.includes('function'));
    if (!rpcMissing) {
      if (m.includes('not_admin')) return { ok: false, message: 'Apenas administradores podem editar a foto desta banda.' };
      if (m.includes('band_not_found')) return { ok: false, message: 'Banda não encontrada.' };
      if (m.includes('photo_url') && (m.includes('does not exist') || m.includes('schema cache'))) {
        return {
          ok: false,
          message: 'A coluna photo_url ainda não existe no Supabase. Aplique a migration SQL de foto da banda e tente novamente.',
        };
      }
      return { ok: false, message: mapDbError(adminErr.message) };
    }
  }
  const owned = bandId
    ? await sb
        .from('bands')
        .select('id')
        .eq('id', bandId)
        .eq('primary_owner_user_id', user.id)
        .maybeSingle()
        .then(({ data, error }) => (error || !data ? null : data))
    : await getOwnedBandForUserId(sb, user.id);
  if (!owned?.id) {
    return { ok: false, message: 'Você ainda não tem banda como administrador.' };
  }
  const { error } = await sb
    .from('bands')
    .update({ photo_url: normalized && /^https?:\/\//i.test(normalized) ? normalized : null })
    .eq('id', owned.id)
    .eq('primary_owner_user_id', user.id);
  if (error) {
    const msg = (error.message ?? '').toLowerCase();
    if (msg.includes('photo_url') && (msg.includes('does not exist') || msg.includes('schema cache'))) {
      return {
        ok: false,
        message:
          'A coluna photo_url ainda não existe no Supabase. Aplique a migration SQL de foto da banda e tente novamente.',
      };
    }
    return { ok: false, message: mapDbError(error.message) };
  }
  const profile = await buildPersistedProfileForUser(user);
  if (!profile) return { ok: false, message: 'Foto atualizada, mas falhou ao carregar o perfil.' };
  return { ok: true, profile };
}

export async function regenerateOwnedBandInviteRemote(bandId?: string): Promise<RemoteLoginResult> {
  const sb = getSupabase();
  const user = await resolveAuthUser(sb);
  if (!user) {
    return { ok: false, message: 'Sessão inválida. Entre de novo.' };
  }
  if (bandId) {
    const { data: adminToken, error: adminErr } = await sb.rpc('admin_regenerate_band_invite', { p_band_id: bandId });
    if (!adminErr) {
      const profile = await buildPersistedProfileForUser(user);
      if (!profile) return { ok: false, message: 'Convite atualizado, mas falhou ao carregar o perfil.' };
      return {
        ok: true,
        profile: { ...profile, ownedInviteToken: typeof adminToken === 'string' ? adminToken : profile.ownedInviteToken },
      };
    }
    const m = (adminErr.message ?? '').toLowerCase();
    const rpcMissing =
      m.includes('admin_regenerate_band_invite') &&
      (m.includes('does not exist') || m.includes('schema cache') || m.includes('function'));
    if (!rpcMissing) {
      if (m.includes('not_admin')) return { ok: false, message: 'Apenas administradores podem gerar novo convite.' };
      if (m.includes('band_not_found')) return { ok: false, message: 'Banda não encontrada.' };
      return { ok: false, message: mapDbError(adminErr.message) };
    }
  }
  const owned = bandId
    ? await sb
        .from('bands')
        .select('id, name, invite_token')
        .eq('id', bandId)
        .eq('primary_owner_user_id', user.id)
        .maybeSingle()
        .then(({ data, error }) => (error || !data ? null : data))
    : await getOwnedBandForUserId(sb, user.id);
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

export async function deleteOwnedBandRemote(bandId?: string): Promise<RemoteLoginResult> {
  try {
    const sb = getSupabase();
    const user = await resolveAuthUser(sb);
    if (!user) {
      return { ok: false, message: 'Sessão inválida. Entre de novo.' };
    }
    if (bandId) {
      const { error: adminErr } = await withTimeout(
        Promise.resolve(sb.rpc('admin_delete_band', { p_band_id: bandId })),
        'Tempo esgotado ao excluir banda no Supabase. Tente novamente.',
      );
      if (!adminErr) {
        const profile = await buildPersistedProfileForUser(user);
        if (!profile) return { ok: false, message: 'Banda removida, mas falhou ao carregar o perfil.' };
        return { ok: true, profile };
      }
      const m = (adminErr.message ?? '').toLowerCase();
      const rpcMissing =
        m.includes('admin_delete_band') && (m.includes('does not exist') || m.includes('schema cache') || m.includes('function'));
      if (!rpcMissing) {
        if (m.includes('not_admin')) return { ok: false, message: 'Apenas administradores podem excluir esta banda.' };
        if (m.includes('band_not_found')) return { ok: false, message: 'Banda não encontrada.' };
        return { ok: false, message: mapDbError(adminErr.message) };
      }
    }
    const owned = bandId
      ? await sb
          .from('bands')
          .select('id, name, invite_token')
          .eq('id', bandId)
          .eq('primary_owner_user_id', user.id)
          .maybeSingle()
          .then(({ data, error }) => (error || !data ? null : data))
      : await getOwnedBandForUserId(sb, user.id);
    if (!owned) {
      return { ok: false, message: 'Você ainda não tem banda como administrador.' };
    }

    const targetBandId = owned.id;

    const { error: rpcErr } = await withTimeout(
      Promise.resolve(sb.rpc('delete_owned_band', { p_band_id: targetBandId })),
      'Tempo esgotado ao excluir banda no Supabase. Tente novamente.',
    );
    if (!rpcErr) {
      const { data: stillThere, error: verifyErr } = await sb
        .from('bands')
        .select('id')
        .eq('id', targetBandId)
        .eq('primary_owner_user_id', user.id)
        .maybeSingle();
      if (!verifyErr && !stillThere) {
        const profile = await buildPersistedProfileForUser(user);
        if (!profile) return { ok: false, message: 'Banda removida, mas falhou ao carregar o perfil.' };
        return { ok: true, profile };
      }
    }

    const rpcMsg = (rpcErr?.message ?? '').toLowerCase();
    const rpcMissing =
      rpcMsg.includes('delete_owned_band') &&
      (rpcMsg.includes('does not exist') || rpcMsg.includes('schema cache') || rpcMsg.includes('function'));

    const { data: deletedRows, error: bandErr } = await withTimeout(
      Promise.resolve(
        sb.from('bands').delete().eq('id', targetBandId).eq('primary_owner_user_id', user.id).select('id'),
      ),
      'Tempo esgotado ao excluir banda no Supabase. Tente novamente.',
    );
    if (bandErr) {
      const m = (bandErr.message ?? '').toLowerCase();
      if (rpcMissing || m.includes('rls') || m.includes('permission denied')) {
        return {
          ok: false,
          message:
            'Exclusão bloqueada no Supabase (RLS). Crie a RPC delete_owned_band no SQL Editor ou adicione policy DELETE em bands para o owner.',
        };
      }
      return { ok: false, message: mapDbError(bandErr.message) };
    }
    if (!deletedRows || deletedRows.length === 0) {
      return {
        ok: false,
        message:
          'A banda não foi excluída (sem permissão do owner ou registro não encontrado). Verifique se está logado com a conta dona da banda.',
      };
    }

    const profile = await buildPersistedProfileForUser(user);
    if (!profile) return { ok: false, message: 'Banda removida, mas falhou ao carregar o perfil.' };
    return { ok: true, profile };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao excluir banda.';
    return { ok: false, message };
  }
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

export async function listBandsDetailForUserRemote(
  userId: string,
): Promise<{ id: string; name: string; role: string; canManage: boolean; inviteToken: string | null; photoUrl: string | null }[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('band_memberships')
    .select('role, bands ( id, name, primary_owner_user_id, invite_token, photo_url )')
    .eq('user_id', userId);
  const missingPhotoColumn =
    !!error &&
    (error.message ?? '').toLowerCase().includes('photo_url') &&
    ((error.message ?? '').toLowerCase().includes('does not exist') ||
      (error.message ?? '').toLowerCase().includes('schema cache'));
  const fallback = missingPhotoColumn
    ? await sb.from('band_memberships').select('role, bands ( id, name, primary_owner_user_id, invite_token )').eq('user_id', userId)
    : null;
  const rawData = missingPhotoColumn ? fallback?.data : data;
  const rawError = missingPhotoColumn ? fallback?.error : error;
  if (rawError || !rawData) return [];
  type R = {
    role: string;
    bands: {
      id: string;
      name: string;
      primary_owner_user_id: string;
      invite_token: string | null;
      photo_url?: string | null;
    } | null;
  };
  return (rawData as unknown as R[])
    .map((row) => {
      const name = row.bands?.name;
      const id = row.bands?.id;
      const ownerId = row.bands?.primary_owner_user_id;
      if (!name || !id || !ownerId) return null;
      return {
        id,
        name,
        role: row.role === 'admin' ? 'Administrador' : 'Membro',
        canManage: row.role === 'admin' || ownerId === userId,
        inviteToken: row.role === 'admin' || ownerId === userId ? row.bands?.invite_token?.trim() || null : null,
        photoUrl: row.bands?.photo_url?.trim() || null,
      };
    })
    .filter(
      (
        x,
      ): x is { id: string; name: string; role: string; canManage: boolean; inviteToken: string | null; photoUrl: string | null } =>
        x !== null,
    );
}

export async function listOwnedBandsForUserRemote(
  userId: string,
): Promise<{ id: string; name: string; inviteToken: string | null; photoUrl: string | null }[]> {
  const sb = getSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || user.id !== userId) return [];

  const { data, error } = await sb
    .from('band_memberships')
    .select('bands ( id, name, invite_token, photo_url, created_at )')
    .eq('user_id', userId)
    .eq('role', 'admin');
  const missingPhotoColumn =
    !!error &&
    (error.message ?? '').toLowerCase().includes('photo_url') &&
    ((error.message ?? '').toLowerCase().includes('does not exist') ||
      (error.message ?? '').toLowerCase().includes('schema cache'));
  const fallback = missingPhotoColumn
    ? await sb
        .from('band_memberships')
        .select('bands ( id, name, invite_token, created_at )')
        .eq('user_id', userId)
        .eq('role', 'admin')
    : null;
  const rawData = missingPhotoColumn ? fallback?.data : data;
  const rawError = missingPhotoColumn ? fallback?.error : error;

  if (rawError || !rawData) return [];
  type MRow = {
    bands: { id: string; name: string; invite_token: string | null; photo_url?: string | null; created_at?: string | null } | null;
  };
  return (rawData as unknown as MRow[])
    .map((row) => row.bands)
    .filter((b): b is NonNullable<MRow['bands']> => !!b)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
    .map((b) => ({
      id: b.id,
      name: b.name,
      inviteToken: b.invite_token?.trim() || null,
      photoUrl: b.photo_url?.trim() || null,
    }));
}

export async function listBandMembersForOwnerRemote(
  userId: string,
  bandId: string,
): Promise<{ userId: string; displayName: string | null; email: string | null; role: 'admin' | 'member'; joinedAt: string | null }[]> {
  const sb = getSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || user.id !== userId) return [];

  const { data, error } = await sb.rpc('list_band_members_for_admin', { p_band_id: bandId });
  const adminMsg = (error?.message ?? '').toLowerCase();
  const missingAdminRpc =
    !!error &&
    adminMsg.includes('list_band_members_for_admin') &&
    (adminMsg.includes('does not exist') || adminMsg.includes('schema cache') || adminMsg.includes('function'));
  const notAdmin = !!error && adminMsg.includes('not_admin');
  const memberCall = notAdmin ? await sb.rpc('list_band_members_for_member', { p_band_id: bandId }) : null;
  const ownerFallback = missingAdminRpc ? await sb.rpc('list_band_members_for_owner', { p_band_id: bandId }) : null;
  const rawData = missingAdminRpc ? ownerFallback?.data : notAdmin ? memberCall?.data : data;
  const rawError = missingAdminRpc ? ownerFallback?.error : notAdmin ? memberCall?.error : error;
  if (rawError || !rawData) return [];

  type RpcRow = {
    user_id: string;
    role: 'admin' | 'member';
    joined_at: string | null;
    display_name: string | null;
    email: string | null;
  };

  return (rawData as unknown as RpcRow[]).map((row) => ({
    userId: row.user_id,
    displayName: row.display_name ?? null,
    email: row.email ?? null,
    role: row.role === 'admin' ? 'admin' : 'member',
    joinedAt: row.joined_at ?? null,
  }));
}

export async function demoteBandAdminForOwnerRemote(
  userId: string,
  bandId: string,
  memberUserId: string,
): Promise<RemoteActionResult> {
  const sb = getSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || user.id !== userId) {
    return { ok: false, message: 'Sessão inválida. Entre de novo.' };
  }
  const { error } = await sb.rpc('set_band_member_role_for_admin', {
    p_band_id: bandId,
    p_user_id: memberUserId,
    p_role: 'member',
  });
  const m0 = (error?.message ?? '').toLowerCase();
  const rpcMissing =
    !!error &&
    m0.includes('set_band_member_role_for_admin') &&
    (m0.includes('does not exist') || m0.includes('schema cache') || m0.includes('function'));
  const fallback = rpcMissing
    ? await sb.rpc('set_band_member_role_for_owner', { p_band_id: bandId, p_user_id: memberUserId, p_role: 'member' })
    : null;
  const rawError = rpcMissing ? fallback?.error : error;
  if (!rawError) return { ok: true };
  const m = (rawError.message ?? '').toLowerCase();
  if (m.includes('not_owner')) return { ok: false, message: 'Somente o criador da banda pode retirar privilégios.' };
  if (m.includes('not_admin')) return { ok: false, message: 'Somente administradores podem alterar privilégios.' };
  if (m.includes('owner_role_immutable')) return { ok: false, message: 'O criador da banda não pode perder privilégios.' };
  if (m.includes('member_not_found')) return { ok: false, message: 'Integrante não encontrado nesta banda.' };
  return { ok: false, message: mapDbError(rawError.message) };
}

export async function removeBandMemberForOwnerRemote(
  userId: string,
  bandId: string,
  memberUserId: string,
): Promise<RemoteActionResult> {
  const sb = getSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || user.id !== userId) {
    return { ok: false, message: 'Sessão inválida. Entre de novo.' };
  }
  const { error } = await sb.rpc('remove_band_member_for_admin', {
    p_band_id: bandId,
    p_user_id: memberUserId,
  });
  const m0 = (error?.message ?? '').toLowerCase();
  const rpcMissing =
    !!error &&
    m0.includes('remove_band_member_for_admin') &&
    (m0.includes('does not exist') || m0.includes('schema cache') || m0.includes('function'));
  const fallback = rpcMissing
    ? await sb.rpc('remove_band_member_for_owner', { p_band_id: bandId, p_user_id: memberUserId })
    : null;
  const rawError = rpcMissing ? fallback?.error : error;
  if (!rawError) return { ok: true };
  const m = (rawError.message ?? '').toLowerCase();
  if (m.includes('not_owner')) return { ok: false, message: 'Somente o dono da banda pode remover integrantes.' };
  if (m.includes('not_admin')) return { ok: false, message: 'Somente administradores podem remover integrantes.' };
  if (m.includes('cannot_remove_owner')) return { ok: false, message: 'O dono da banda não pode ser removido.' };
  if (m.includes('member_not_found')) return { ok: false, message: 'Integrante não encontrado nesta banda.' };
  return { ok: false, message: mapDbError(rawError.message) };
}

export async function promoteBandMemberForOwnerRemote(
  userId: string,
  bandId: string,
  memberUserId: string,
): Promise<RemoteActionResult> {
  const sb = getSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || user.id !== userId) {
    return { ok: false, message: 'Sessão inválida. Entre de novo.' };
  }
  const { error } = await sb.rpc('set_band_member_role_for_admin', {
    p_band_id: bandId,
    p_user_id: memberUserId,
    p_role: 'admin',
  });
  const m0 = (error?.message ?? '').toLowerCase();
  const rpcMissing =
    !!error &&
    m0.includes('set_band_member_role_for_admin') &&
    (m0.includes('does not exist') || m0.includes('schema cache') || m0.includes('function'));
  const fallback = rpcMissing
    ? await sb.rpc('set_band_member_role_for_owner', { p_band_id: bandId, p_user_id: memberUserId, p_role: 'admin' })
    : null;
  const rawError = rpcMissing ? fallback?.error : error;
  if (!rawError) return { ok: true };
  const m = (rawError.message ?? '').toLowerCase();
  if (m.includes('not_owner')) return { ok: false, message: 'Somente o dono da banda pode promover integrantes.' };
  if (m.includes('not_admin')) return { ok: false, message: 'Somente administradores podem promover integrantes.' };
  if (m.includes('owner_role_immutable')) return { ok: false, message: 'O dono já é administrador principal.' };
  if (m.includes('member_not_found')) return { ok: false, message: 'Integrante não encontrado nesta banda.' };
  return { ok: false, message: mapDbError(rawError.message) };
}

export async function leaveBandRemote(userId: string, bandId: string): Promise<RemoteLoginResult> {
  const sb = getSupabase();
  const user = await resolveAuthUser(sb);
  if (!user || user.id !== userId) {
    return { ok: false, message: 'Sessão inválida. Entre de novo.' };
  }
  const { error } = await sb.rpc('leave_band', { p_band_id: bandId });
  if (error) {
    const m = (error.message ?? '').toLowerCase();
    if (m.includes('owner_cannot_leave')) {
      return { ok: false, message: 'O dono não pode sair da própria banda. Exclua a banda ou transfira a gestão.' };
    }
    if (m.includes('not_member')) {
      return { ok: false, message: 'Você não faz parte desta banda.' };
    }
    return { ok: false, message: mapDbError(error.message) };
  }
  const profile = await buildPersistedProfileForUser(user);
  if (!profile) return { ok: false, message: 'Você saiu da banda, mas falhou ao atualizar o perfil.' };
  return { ok: true, profile };
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
