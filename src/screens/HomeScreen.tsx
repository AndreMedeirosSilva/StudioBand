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
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setStringAsync as copyTextToClipboard } from '../lib/clipboard';
import { buildInviteUrl } from '../lib/inviteLink';
import { COLORS } from '../theme';
import { LoggedInUserBar } from '../components/LoggedInUserBar';
import type { UserProfile } from '../navigation/AppNavigator';
import {
  createOwnedBand,
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
  const [bandModalOpen, setBandModalOpen] = useState(false);
  const [newBandName, setNewBandName] = useState('');
  const [bandModalBusy, setBandModalBusy] = useState(false);

  useEffect(() => {
    if (!profile.ownedBandId) {
      setInviteUrl(null);
      return;
    }
    if (profile.ownedInviteToken) {
      setInviteUrl(buildInviteUrl(profile.ownedInviteToken));
      return;
    }
    void getInviteUrlForOwnedBand(profile.ownedBandId).then(setInviteUrl);
  }, [profile.ownedBandId, profile.ownedInviteToken]);

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

  const submitCreateBand = useCallback(async () => {
    const name = newBandName.trim();
    if (!name) {
      Alert.alert('Banda', 'Informe o nome da banda.');
      return;
    }
    if (!profile.userId) {
      Alert.alert('Banda', 'Sessão inválida. Saia e entre de novo.');
      return;
    }
    setBandModalBusy(true);
    try {
      const res = await createOwnedBand(profile.userId, name);
      if (!res.ok) {
        Alert.alert('Banda', res.message);
        return;
      }
      onProfileUpdate(res.profile);
      setBandModalOpen(false);
      setNewBandName('');
      const token = res.profile.ownedInviteToken;
      const nome = res.profile.ownedBandName ?? newBandName.trim();
      Alert.alert(
        'Banda criada',
        token
          ? `${nome}\n\nCódigo de convite (guardado na sessão):\n${token}\n\nO link completo aparece no painel abaixo.`
          : `${nome}\n\nO link de convite aparece no painel abaixo.`,
      );
    } finally {
      setBandModalBusy(false);
    }
  }, [newBandName, profile.userId, onProfileUpdate]);

  const applyJoinBand = useCallback(async () => {
    const code = joinCode.trim();
    if (!code) {
      Alert.alert(
        'Convite',
        'Cole o token (inv_…), o link completo com ?join=… ou o valor depois de join= na URL.',
      );
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

  const joinPlaceholder =
    Platform.OS === 'web'
      ? 'Ex.: inv_abc12… ou cole o link (https://…?join=inv_…)'
      : 'Ex.: inv_abc12… ou cole o link de convite inteiro';

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + 16 }]}>
      <LoggedInUserBar
        profile={profile}
        onLogout={onLogout}
        placement="overlay"
        top={insets.top + 8}
        right={pad}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingHorizontal: pad,
          paddingTop: insets.top + 56,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.appName}>Estudio Banda</Text>

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

        <View style={styles.bandHub}>
          <Text style={styles.bandHubEyebrow}>Bandas e convites</Text>
          <Text style={styles.bandHubTitle}>Criar banda ou entrar com convite</Text>
          <Text style={styles.bandHubLead}>
            Crie a sua banda aqui (ou no cadastro inicial) e compartilhe o convite. Para entrar numa banda existente, use o código ou o link abaixo.
          </Text>

          <View style={styles.bandHubDivider} />

          <View style={[styles.bandHubGrid, width >= 640 && styles.bandHubGridWide]}>
            <View style={[styles.bandHubCol, width >= 640 && styles.bandHubColWide]}>
              <View style={styles.bandPathCard}>
                <View style={styles.bandPathHead}>
                  <View style={styles.bandPathBadge}>
                    <Text style={styles.bandPathBadgeTxt}>1</Text>
                  </View>
                  <Text style={styles.bandPathTitle}>Criar uma banda</Text>
                </View>
                <Text style={styles.bandPathBody}>
                  Ainda não tem banda como administrador? Use o botão para registar o nome. No cadastro da conta também pode marcar “Criar banda”.
                </Text>
                {!profile.ownedBandId ? (
                  <Pressable
                    onPress={() => setBandModalOpen(true)}
                    style={({ pressed }) => [styles.registerBandBtn, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Cadastrar banda"
                  >
                    <Text style={styles.registerBandBtnText}>Cadastrar banda</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.bandOwnerNote}>
                    Já administra uma banda — o link de convite para novos membros está abaixo.
                  </Text>
                )}
              </View>

              {inviteUrl ? (
                <View style={styles.invitePanel}>
                  <View style={styles.invitePanelAccent} />
                  <View style={styles.invitePanelInner}>
                    <Text style={styles.invitePanelKicker}>O seu convite</Text>
                    <Text style={styles.invitePanelTitle}>
                      {profile.ownedBandName ? profile.ownedBandName : 'Compartilhar com a banda'}
                    </Text>
                    {profile.ownedInviteToken ? (
                      <View style={styles.inviteTokenBlock}>
                        <Text style={styles.inviteTokenLabel}>Código gerado</Text>
                        <Text selectable style={styles.inviteTokenValue}>
                          {profile.ownedInviteToken}
                        </Text>
                      </View>
                    ) : null}
                    <Text style={styles.invitePanelLead}>
                      {Platform.OS === 'web'
                        ? 'Quem receber cria conta, entra e cola o código em “Entrar com código”, abaixo. (Demo: mesmo navegador.)'
                        : 'Quem receber regista-se, entra e usa o código em “Entrar com código”, abaixo.'}
                    </Text>
                    <View style={styles.inviteUrlBox}>
                      <Text selectable style={styles.inviteUrlMono}>
                        {inviteUrl}
                      </Text>
                    </View>
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
                </View>
              ) : (
                <View style={styles.invitePlaceholder}>
                  <Text style={styles.invitePlaceholderText}>
                    Depois de cadastrar uma banda (botão acima ou no registo), o link de convite aparece aqui para copiar ou compartilhar.
                  </Text>
                </View>
              )}
            </View>

            <View style={[styles.bandHubCol, width >= 640 && styles.bandHubColWide]}>
              <View style={styles.bandPathCard}>
                <View style={styles.bandPathHead}>
                  <View style={[styles.bandPathBadge, styles.bandPathBadgeAlt]}>
                    <Text style={styles.bandPathBadgeTxt}>2</Text>
                  </View>
                  <Text style={styles.bandPathTitle}>Entrar com código</Text>
                </View>
                <Text style={styles.bandPathBody}>
                  Aceita o token <Text style={styles.bandPathMono}>inv_…</Text>, o URL com{' '}
                  <Text style={styles.bandPathMono}>?join=…</Text> ou texto que contenha esses valores — detetamos automaticamente.
                </Text>
                <Text style={styles.joinFieldLabel}>Código ou link de convite</Text>
                <TextInput
                  style={styles.joinInput}
                  placeholder={joinPlaceholder}
                  placeholderTextColor={COLORS.muted}
                  value={joinCode}
                  onChangeText={setJoinCode}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {joinBandPreview ? (
                  <Text style={styles.joinPreview}>Banda encontrada: {joinBandPreview}</Text>
                ) : joinCode.trim().length > 0 ? (
                  <Text style={styles.joinPreviewMuted}>A validar… se existir aqui, o nome da banda aparece.</Text>
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

              <View style={styles.bandsPanel}>
                <Text style={styles.bandsPanelTitle}>As suas bandas</Text>
                {bandRows.length > 0 ? (
                  bandRows.map((row, i) => (
                    <View
                      key={`${row.name}-${row.role}-${i}`}
                      style={[styles.bandChip, i > 0 && styles.bandChipSpaced]}
                    >
                      <View style={styles.bandChipMain}>
                        <Text style={styles.bandChipName} numberOfLines={1}>
                          {row.name}
                        </Text>
                        <Text style={styles.bandChipRole} numberOfLines={1}>
                          {row.role}
                        </Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.bandsEmpty}>
                    Ainda sem bandas — use o passo 1 (cadastro) ou o passo 2 (código).
                  </Text>
                )}
              </View>
            </View>
          </View>
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

      <Modal
        visible={bandModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !bandModalBusy && setBandModalOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalAvoid}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalWrap}>
            <Pressable
              style={styles.modalBackdrop}
              onPress={() => !bandModalBusy && setBandModalOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Fechar"
            />
            <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Cadastrar banda</Text>
            <Text style={styles.modalLead}>Este nome aparece para si e para os membros no Estudio Banda.</Text>
            <Text style={styles.modalFieldLabel}>Nome da banda</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ex.: Os Subterrâneos"
              placeholderTextColor={COLORS.muted}
              value={newBandName}
              onChangeText={setNewBandName}
              editable={!bandModalBusy}
              autoCorrect={false}
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => !bandModalBusy && setBandModalOpen(false)}
                style={({ pressed }) => [styles.modalBtnGhost, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <Text style={styles.modalBtnGhostText}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => void submitCreateBand()}
                disabled={bandModalBusy}
                style={({ pressed }) => [
                  styles.modalBtnPrimary,
                  bandModalBusy && styles.joinBtnOff,
                  pressed && !bandModalBusy && styles.pressed,
                ]}
                accessibilityRole="button"
              >
                {bandModalBusy ? (
                  <ActivityIndicator color={COLORS.accentText} />
                ) : (
                  <Text style={styles.modalBtnPrimaryText}>Criar banda</Text>
                )}
              </Pressable>
            </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
    position: 'relative',
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
  appName: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 20,
  },
  bandHub: {
    backgroundColor: COLORS.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    marginBottom: 24,
    ...Platform.select({
      web: {
        boxShadow: '0 0 0 1px rgba(255,255,255,0.04) inset',
      },
      default: {},
    }),
  },
  bandHubEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.accent,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  bandHubTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    lineHeight: 26,
  },
  bandHubLead: {
    marginTop: 8,
    fontSize: 14,
    color: COLORS.muted,
    lineHeight: 22,
    maxWidth: 560,
  },
  registerBandBtn: {
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
  },
  registerBandBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.accentText,
  },
  bandOwnerNote: {
    marginTop: 12,
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 20,
  },
  bandHubDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginTop: 18,
    marginBottom: 18,
    opacity: 0.9,
  },
  bandHubGrid: {
    flexDirection: 'column',
    gap: 16,
  },
  bandHubGridWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 18,
  },
  bandHubCol: {
    minWidth: 0,
    gap: 14,
  },
  bandHubColWide: {
    flex: 1,
  },
  bandPathCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  bandPathHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  bandPathBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bandPathBadgeAlt: {
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    borderColor: 'rgba(52, 211, 153, 0.35)',
  },
  bandPathBadgeTxt: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
  },
  bandPathTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    flex: 1,
  },
  bandPathBody: {
    fontSize: 14,
    color: COLORS.muted,
    lineHeight: 21,
  },
  bandPathMono: {
    fontFamily: Platform.select({ web: 'ui-monospace, monospace', default: 'monospace' }) as string,
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '600',
  },
  invitePanel: {
    flexDirection: 'row',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    backgroundColor: COLORS.card,
  },
  invitePanelAccent: {
    width: 4,
    backgroundColor: COLORS.accent,
  },
  invitePanelInner: {
    flex: 1,
    padding: 14,
    minWidth: 0,
  },
  invitePanelKicker: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  invitePanelTitle: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },
  invitePanelLead: {
    marginTop: 8,
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 19,
  },
  inviteTokenBlock: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(52, 211, 153, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.25)',
  },
  inviteTokenLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.success,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  inviteTokenValue: {
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.text,
    fontWeight: '600',
    fontFamily: Platform.select({ web: 'ui-monospace, monospace', default: 'monospace' }) as string,
  },
  inviteUrlBox: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inviteUrlMono: {
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.accent,
    fontWeight: '600',
    fontFamily: Platform.select({ web: 'ui-monospace, monospace', default: 'monospace' }) as string,
  },
  invitePlaceholder: {
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.border,
    padding: 14,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  invitePlaceholderText: {
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 20,
  },
  joinFieldLabel: {
    marginTop: 14,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
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
  bandsPanel: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  bandsPanelTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 12,
  },
  bandChip: {
    borderRadius: 12,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  bandChipSpaced: {
    marginTop: 10,
  },
  bandChipMain: {
    minWidth: 0,
  },
  bandChipName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  bandChipRole: {
    marginTop: 4,
    fontSize: 13,
    color: COLORS.muted,
  },
  bandsEmpty: {
    fontSize: 14,
    color: COLORS.muted,
    lineHeight: 21,
  },
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
    marginTop: 0,
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
  modalAvoid: {
    flex: 1,
  },
  modalWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  modalCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 16px 48px rgba(0,0,0,0.45)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
        elevation: 12,
      },
    }),
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  modalLead: {
    marginTop: 8,
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 19,
  },
  modalFieldLabel: {
    marginTop: 16,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
  },
  modalInput: {
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
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
  },
  modalBtnGhost: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgElevated,
  },
  modalBtnGhostText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  modalBtnPrimary: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnPrimaryText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.accentText,
  },
});
