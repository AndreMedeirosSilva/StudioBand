import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  ScrollView,
  Platform,
  Share,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setStringAsync as copyTextToClipboard } from '../lib/clipboard';
import { COLORS } from '../theme';
import type { UserProfile } from '../navigation/AppNavigator';
import {
  getInviteUrlForOwnedBand,
  joinBandWithInvite,
  listBandsDetailForUser,
  peekInviteBandName,
} from '../registry/localRegistry';

type Props = {
  profile: UserProfile;
  onBook: () => void;
  onStudioAgenda: () => void;
  onLogout: () => void;
  /** Token de `?join=` na URL — pré-preenche o campo (só no painel). */
  joinCodePrefill?: string | null;
  onConsumeJoinPrefill?: () => void;
  onProfileUpdate: (profile: UserProfile) => void;
};

/** Dados de exemplo no painel (sem API). */
const MOCK_ACTIVITY_ROWS = [
  { when: 'Hoje · 21:00', where: 'Subsolo Sessions · Sala 2', tag: 'Seu ensaio', tone: 'accent' as const },
  { when: 'Sábado · 10:30', where: 'Estúdio Groove · Sala Grande', tag: 'Lembrete', tone: 'muted' as const },
  { when: 'Domingo · 16:00', where: 'Beat Factory · Mini sala', tag: 'Sugestão', tone: 'muted' as const },
  { when: 'Pedido pendente', where: 'Sala 7 Áudio · Cabine voz', tag: 'Estúdio', tone: 'warn' as const },
  { when: '2 novos', where: 'Mensagens de estúdios (demo)', tag: 'Inbox', tone: 'muted' as const },
];

export function HomeScreen({
  profile,
  onBook,
  onStudioAgenda,
  onLogout,
  joinCodePrefill,
  onConsumeJoinPrefill,
  onProfileUpdate,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pad = Math.min(24, Math.max(16, width * 0.05));

  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [bandRows, setBandRows] = useState<{ name: string; role: string }[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [joinBandPreview, setJoinBandPreview] = useState<string | null>(null);
  const [joinBusy, setJoinBusy] = useState(false);

  useEffect(() => {
    if (!profile.ownedBandId) {
      setInviteUrl(null);
      return;
    }
    void getInviteUrlForOwnedBand(profile.ownedBandId).then(setInviteUrl);
  }, [profile.ownedBandId]);

  useEffect(() => {
    if (!profile.userId) {
      setBandRows([]);
      return;
    }
    void listBandsDetailForUser(profile.userId).then(setBandRows);
  }, [profile.userId]);

  useEffect(() => {
    const t = joinCodePrefill?.trim();
    if (!t) return;
    setJoinCode(t);
    onConsumeJoinPrefill?.();
  }, [joinCodePrefill, onConsumeJoinPrefill]);

  useEffect(() => {
    const t = joinCode.trim();
    if (!t) {
      setJoinBandPreview(null);
      return;
    }
    const id = setTimeout(() => {
      void peekInviteBandName(t).then(setJoinBandPreview);
    }, 400);
    return () => clearTimeout(id);
  }, [joinCode]);

  const applyJoinBand = useCallback(async () => {
    const code = joinCode.trim();
    if (!code) {
      Alert.alert('Convite', 'Cole o código (ex.: inv_…) ou o trecho depois de join= no link.');
      return;
    }
    if (!profile.userId) return;
    setJoinBusy(true);
    try {
      const res = await joinBandWithInvite(profile.userId, code);
      if (!res.ok) {
        Alert.alert('Convite', res.message);
        return;
      }
      onProfileUpdate(res.profile);
      setJoinCode('');
      setJoinBandPreview(null);
      Alert.alert('Banda', 'Você entrou na banda.');
    } finally {
      setJoinBusy(false);
    }
  }, [joinCode, profile.userId, onProfileUpdate]);

  const copyInvite = async () => {
    if (!inviteUrl) return;
    const ok = await copyTextToClipboard(inviteUrl);
    if (ok) Alert.alert('Copiado', 'O link do convite foi copiado.');
    else Alert.alert('Copiar', 'Não foi possível copiar (permissão ou navegador sem suporte).');
  };

  const shareInvite = async () => {
    if (!inviteUrl) return;
    try {
      await Share.share({
        message: `Entre na minha banda no Estudio Banda: ${inviteUrl}`,
        title: 'Convite — Estudio Banda',
      });
    } catch {
      /* cancelado */
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.appName}>Estudio Banda</Text>
            <Text style={styles.displayName} numberOfLines={1}>
              {profile.displayName || profile.email}
            </Text>
            <Text style={styles.email} numberOfLines={1}>
              {profile.email}
            </Text>
          </View>
          <Pressable onPress={onLogout} style={({ pressed }) => [styles.logout, pressed && styles.pressed]} accessibilityRole="button">
            <Text style={styles.logoutTxt}>Sair</Text>
          </Pressable>
        </View>

        <Pressable onPress={onBook} style={({ pressed }) => [styles.cta, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={styles.ctaTitle}>Marcar ensaio</Text>
          <Text style={styles.ctaSub}>
            {Platform.OS === 'web'
              ? 'Calendário e horários direto no navegador'
              : 'Ver agenda dos estúdios e reservar um horário'}
          </Text>
        </Pressable>

        {profile.studioName ? (
          <Pressable
            onPress={onStudioAgenda}
            style={({ pressed }) => [styles.secondaryCta, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Gerenciar agenda e preço do estúdio"
          >
            <Text style={styles.secondaryCtaTitle}>Gerenciar agenda do estúdio</Text>
            <Text style={styles.secondaryCtaSub}>Bloquear horários, preço por hora e ver reservas</Text>
          </Pressable>
        ) : null}

        {inviteUrl ? (
          <View style={styles.inviteCard}>
            <Text style={styles.inviteTitle}>Convidar membros da banda</Text>
            <Text style={styles.inviteLead}>
              {Platform.OS === 'web'
                ? 'Envie o link. A pessoa cria conta, entra e cola o código da banda no painel (“Entrar numa banda”). Demo local: banda e convite têm de existir no mesmo navegador.'
                : 'Envie o link. A pessoa cadastra, entra e usa o código no painel para entrar na banda (demo local neste aparelho).'}
            </Text>
            <Text selectable style={styles.inviteUrl}>
              {inviteUrl}
            </Text>
            <View style={styles.inviteActions}>
              <Pressable
                onPress={() => void copyInvite()}
                style={({ pressed }) => [styles.inviteBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Copiar link do convite"
              >
                <Text style={styles.inviteBtnText}>Copiar link</Text>
              </Pressable>
              <Pressable
                onPress={() => void shareInvite()}
                style={({ pressed }) => [styles.inviteBtnSecondary, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Compartilhar convite"
              >
                <Text style={styles.inviteBtnSecondaryText}>Compartilhar</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <Text style={styles.section}>Entrar numa banda</Text>
        <View style={styles.card}>
          <Text style={styles.muted}>
            Cole o código do convite (inv_…) depois de cadastrado e logado. Quem criou a banda no mesmo dispositivo/navegador pode partilhar o link ou o código.
          </Text>
          <TextInput
            style={styles.joinInput}
            placeholder="Código inv_… ou valor de join= na URL"
            placeholderTextColor={COLORS.muted}
            value={joinCode}
            onChangeText={setJoinCode}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {joinBandPreview ? (
            <Text style={styles.joinPreview}>Banda encontrada: {joinBandPreview}</Text>
          ) : joinCode.trim().length > 0 ? (
            <Text style={styles.joinPreviewMuted}>
              Se o convite existir aqui, o nome da banda aparece ao validar.
            </Text>
          ) : null}
          <Pressable
            onPress={() => void applyJoinBand()}
            disabled={joinBusy}
            style={({ pressed }) => [styles.joinBtn, joinBusy && styles.joinBtnOff, pressed && !joinBusy && styles.pressed]}
            accessibilityRole="button"
          >
            {joinBusy ? (
              <ActivityIndicator color={COLORS.accentText} />
            ) : (
              <Text style={styles.joinBtnText}>Entrar na banda</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.section}>Suas bandas</Text>
        <View style={styles.card}>
          {bandRows.length > 0 ? (
            bandRows.map((row, i) => (
              <View key={`${row.name}-${row.role}-${i}`} style={styles.bandRow}>
                <Text style={styles.roleLine}>{row.name}</Text>
                <Text style={styles.bandRole}>{row.role}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.muted}>Nenhuma banda ainda — crie uma no cadastro ou entre com um convite acima.</Text>
          )}
        </View>

        <Text style={styles.section}>Estúdio</Text>
        <View style={styles.card}>
          {profile.studioName ? (
            <Text style={styles.roleLine}>{profile.studioName}</Text>
          ) : (
            <Text style={styles.muted}>Cadastre-se como dono de estúdio para gerir agenda e salas.</Text>
          )}
        </View>

        <Text style={styles.section}>Resumo (demonstração)</Text>
        <View style={styles.card}>
          <Text style={styles.mockDisclaimer}>
            Exemplos fixos — com a API ligada, isso vem dos seus dados reais.
          </Text>
          {MOCK_ACTIVITY_ROWS.map((row, i) => (
            <View key={i} style={[styles.mockRow, i > 0 && styles.mockRowBorder]}>
              <View style={styles.mockRowMain}>
                <Text style={styles.mockWhen}>{row.when}</Text>
                <Text style={styles.mockWhere}>{row.where}</Text>
              </View>
              <View
                style={[
                  styles.mockTag,
                  row.tone === 'accent' && styles.mockTagAccent,
                  row.tone === 'warn' && styles.mockTagWarn,
                ]}
              >
                <Text
                  style={[
                    styles.mockTagText,
                    row.tone === 'accent' && styles.mockTagTextAccent,
                    row.tone === 'warn' && styles.mockTagTextWarn,
                  ]}
                >
                  {row.tag}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {Platform.OS === 'web' ? (
          <Text style={styles.webFootnote}>
            Você está na versão web: login, bandas e convites ficam armazenados neste navegador (localmente). Limpar dados do site ou usar outro navegador pede cadastro de novo até existir conta na nuvem.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
    ...Platform.select({
      web: { minHeight: '100vh' as never },
      default: {},
    }),
  },
  scroll: {
    ...Platform.select({
      web: { flex: 1, minHeight: 0 },
      default: {},
    }),
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
  appName: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  displayName: { marginTop: 4, fontSize: 16, fontWeight: '700', color: COLORS.text },
  email: { marginTop: 2, fontSize: 13, color: COLORS.muted },
  inviteCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.accent,
    padding: 16,
    marginBottom: 24,
  },
  inviteTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  inviteLead: { marginTop: 8, fontSize: 13, color: COLORS.muted, lineHeight: 20 },
  inviteUrl: {
    marginTop: 12,
    fontSize: 12,
    color: COLORS.accent,
    lineHeight: 18,
    fontWeight: '600',
  },
  inviteActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  inviteBtn: {
    backgroundColor: COLORS.accent,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  inviteBtnText: { color: COLORS.accentText, fontWeight: '800', fontSize: 14 },
  inviteBtnSecondary: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgElevated,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  inviteBtnSecondaryText: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  bandRow: { marginBottom: 12 },
  bandRole: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  logout: { paddingVertical: 8, paddingHorizontal: 12 },
  logoutTxt: { color: COLORS.accent, fontWeight: '700', fontSize: 15 },
  cta: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    padding: 18,
    marginBottom: 28,
  },
  ctaTitle: { color: COLORS.accentText, fontSize: 18, fontWeight: '800' },
  ctaSub: { marginTop: 6, color: COLORS.accentText, fontSize: 14, opacity: 0.9 },
  secondaryCta: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 18,
    marginBottom: 28,
  },
  secondaryCtaTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  secondaryCtaSub: { marginTop: 6, color: COLORS.muted, fontSize: 14, lineHeight: 20 },
  section: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  joinInput: {
    marginTop: 12,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.select({ ios: 14, default: 12 }),
    fontSize: 16,
    color: COLORS.text,
    minHeight: 48,
  },
  joinPreview: { marginTop: 10, fontSize: 14, fontWeight: '700', color: COLORS.success },
  joinPreviewMuted: { marginTop: 10, fontSize: 13, color: COLORS.muted, lineHeight: 18 },
  joinBtn: {
    marginTop: 14,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  joinBtnOff: { opacity: 0.6 },
  joinBtnText: { color: COLORS.accentText, fontWeight: '800', fontSize: 15 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 20,
  },
  roleLine: { fontSize: 16, color: COLORS.text, fontWeight: '600', marginBottom: 8 },
  muted: { fontSize: 15, color: COLORS.muted, lineHeight: 22 },
  mockDisclaimer: { fontSize: 13, color: COLORS.muted, lineHeight: 19, marginBottom: 14 },
  mockRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  mockRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  mockRowMain: { flex: 1, minWidth: 0 },
  mockWhen: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  mockWhere: { fontSize: 13, color: COLORS.muted, marginTop: 3, lineHeight: 18 },
  mockTag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  mockTagAccent: { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: 'rgba(245, 158, 11, 0.35)' },
  mockTagWarn: { backgroundColor: 'rgba(248, 113, 113, 0.12)', borderColor: 'rgba(248, 113, 113, 0.35)' },
  mockTagText: { fontSize: 11, fontWeight: '800', color: COLORS.muted },
  mockTagTextAccent: { color: COLORS.accent },
  mockTagTextWarn: { color: COLORS.danger },
  webFootnote: {
    marginTop: 8,
    fontSize: 12,
    color: COLORS.muted,
    lineHeight: 18,
    opacity: 0.9,
  },
  pressed: { opacity: 0.9 },
});
