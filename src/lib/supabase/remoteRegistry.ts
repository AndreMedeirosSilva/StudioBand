import type { User } from '@supabase/supabase-js';
import type { PersistedProfile } from '../../storage/persistSession';
import type { RegisterInput } from '../../registry/registerTypes';
import { buildInviteUrl } from '../inviteLink';
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
  return err?.message?.trim() || 'Não foi possível concluir. Tente de novo.';
}

function newInviteToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = 'inv_';
  for (let i = 0; i < 22; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export async function buildPersistedProfileForUser(user: User): Promise<PersistedProfile | null> {
  const sb = getSupabase();
  const userId = user.id;
  const email = (user.email ?? '').trim().toLowerCase();

  const { data: prof, error: pErr } = await sb.from('profiles').select('display_name').eq('id', userId).maybeSingle();
  if (pErr) return null;

  const displayName = prof?.display_name ?? user.user_metadata?.display_name ?? null;

  const { data: memberships, error: mErr } = await sb
    .from('band_memberships')
    .select('band_id, role, bands ( id, name, primary_owner_user_id )')
    .eq('user_id', userId);
  if (mErr) return null;

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
    .select('id, name')
    .eq('primary_owner_user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const ownedBandId = ownedBand?.id ?? null;

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
    studioName: studio?.name ?? null,
    ownerStudioId: studio?.id ?? null,
  };
}

export async function loginWithPasswordRemote(email: string, password: string): Promise<RemoteLoginResult> {
  const e = email.trim().toLowerCase();
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
  const email = input.email.trim().toLowerCase();
  if (!email.includes('@')) {
    return { ok: false, message: 'Informe um e-mail válido.' };
  }
  if (input.password.length < 6) {
    return { ok: false, message: 'A senha deve ter pelo menos 6 caracteres.' };
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
        'Conta criada. Confirme o e-mail para continuar (Auth → Providers no Supabase). Para desenvolvimento, desative “Confirm email”.',
    };
  }

  const userId = data.user.id;
  const displayName = input.displayName?.trim() || null;

  await sb
    .from('profiles')
    .update({ display_name: displayName, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (input.isStudio && input.studioName.trim()) {
    await sb.from('studios').insert({
      owner_user_id: userId,
      name: input.studioName.trim(),
      default_price_per_hour_cents: 9000,
      timezone: 'Europe/Lisbon',
    });
  }

  if (input.isBand && input.bandName.trim()) {
    const token = newInviteToken();
    const { data: bandRow, error: bandErr } = await sb
      .from('bands')
      .insert({
        name: input.bandName.trim(),
        primary_owner_user_id: userId,
        invite_token: token,
      })
      .select('id')
      .single();
    if (bandErr || !bandRow) {
      return { ok: false, message: bandErr?.message ?? 'Não foi possível criar a banda.' };
    }
    const { error: memErr } = await sb.from('band_memberships').insert({
      band_id: bandRow.id,
      user_id: userId,
      role: 'admin',
    });
    if (memErr) {
      return { ok: false, message: memErr.message ?? 'Não foi possível associar à banda.' };
    }
  }

  const profile = await buildPersistedProfileForUser(data.user);
  if (!profile) {
    return { ok: false, message: 'Conta criada mas o perfil não foi lido. Atualize o ecrã.' };
  }
  return { ok: true, profile };
}

export async function joinBandWithInviteRemote(userId: string, inviteToken: string): Promise<RemoteLoginResult> {
  const t = inviteToken.trim();
  if (!t) {
    return { ok: false, message: 'Cole o código do convite (ex.: inv_…).' };
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
  const t = token.trim();
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
