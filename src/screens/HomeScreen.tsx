import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
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
  deleteOwnedBand,
  joinBandWithInvite,
  leaveBand,
  demoteBandAdminForOwner,
  listBandMembersForOwner,
  listBandsDetailForUser,
  listOwnedBandsForUser,
  peekInviteBandName,
  promoteBandMemberForOwner,
  regenerateOwnedBandInvite,
  removeBandMemberForOwner,
  renameOwnedBand,
  updateOwnedBandPhoto,
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

  const [ownedBands, setOwnedBands] = useState<
    { id: string; name: string; inviteToken: string | null; photoUrl: string | null }[]
  >([]);
  const [activeOwnedBandId, setActiveOwnedBandId] = useState<string | null>(null);
  const [activeBandMenu, setActiveBandMenu] = useState<'convites' | 'admin'>('convites');
  const [bandRows, setBandRows] = useState<
    { id: string; name: string; role: string; canManage: boolean; inviteToken: string | null; photoUrl: string | null }[]
  >([]);
  const [membersByBand, setMembersByBand] = useState<
    Record<string, { userId: string; displayName: string | null; email: string | null; role: 'admin' | 'member'; joinedAt: string | null }[]>
  >({});
  const [membersLoadingByBand, setMembersLoadingByBand] = useState<Record<string, boolean>>({});
  const [expandedMemberBands, setExpandedMemberBands] = useState<Record<string, boolean>>({});
  const [joinCode, setJoinCode] = useState('');
  const [joinBandPreview, setJoinBandPreview] = useState<string | null>(null);
  const [joinBusy, setJoinBusy] = useState(false);
  const [bandModalOpen, setBandModalOpen] = useState(false);
  const [newBandName, setNewBandName] = useState('');
  const [newBandPhotoUrl, setNewBandPhotoUrl] = useState('');
  const [bandModalBusy, setBandModalBusy] = useState(false);
  const [bandEditModalOpen, setBandEditModalOpen] = useState(false);
  const [editBandName, setEditBandName] = useState('');
  const [editBandPhotoUrl, setEditBandPhotoUrl] = useState('');
  const [editBandId, setEditBandId] = useState<string | null>(null);
  const [bandCrudBusy, setBandCrudBusy] = useState(false);

  useEffect(() => {
    if (!profile.userId) {
      setBandRows([]);
      setOwnedBands([]);
      setActiveOwnedBandId(null);
      setMembersByBand({});
      setExpandedMemberBands({});
      setMembersLoadingByBand({});
      return;
    }
    void (async () => {
      const [rows, owned] = await Promise.all([
        listBandsDetailForUser(profile.userId),
        listOwnedBandsForUser(profile.userId),
      ]);
      setBandRows(rows);
      setOwnedBands(owned);
      if (owned.length === 0) {
        setActiveOwnedBandId(null);
        return;
      }
      setActiveOwnedBandId((prev) => {
        if (prev && owned.some((b) => b.id === prev)) return prev;
        if (profile.ownedBandId && owned.some((b) => b.id === profile.ownedBandId)) return profile.ownedBandId;
        return owned[0].id;
      });
    })();
  }, [profile.userId, profile.ownedBandId]);

  useEffect(() => {
    setEditBandName(profile.ownedBandName ?? '');
    setEditBandId(profile.ownedBandId ?? null);
    setEditBandPhotoUrl('');
  }, [profile.ownedBandId, profile.ownedBandName]);

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

  const refreshBandData = useCallback(async () => {
    if (!profile.userId) return;
    const [rows, owned] = await Promise.all([listBandsDetailForUser(profile.userId), listOwnedBandsForUser(profile.userId)]);
    setBandRows(rows);
    setOwnedBands(owned);
    if (owned.length === 0) {
      setActiveOwnedBandId(null);
      return;
    }
    setActiveOwnedBandId((prev) => (prev && owned.some((b) => b.id === prev) ? prev : owned[0].id));
  }, [profile.userId]);

  const normalizePhotoUrl = useCallback((value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return null;
  }, []);

  const saveBandPhoto = useCallback(
    async (bandId: string, rawUrl: string) => {
      if (!profile.userId) return { ok: false as const, message: 'Sessão inválida. Entre de novo.' };
      const normalized = normalizePhotoUrl(rawUrl);
      const res = await updateOwnedBandPhoto(profile.userId, normalized, bandId);
      if (res.ok) {
        onProfileUpdate(res.profile);
        await refreshBandData();
      }
      return res;
    },
    [normalizePhotoUrl, onProfileUpdate, profile.userId, refreshBandData],
  );

  const toggleBandMembers = useCallback(
    async (bandId: string) => {
      const nextOpen = !expandedMemberBands[bandId];
      setExpandedMemberBands((prev) => ({ ...prev, [bandId]: nextOpen }));
      if (!nextOpen || membersByBand[bandId] || !profile.userId) return;
      setMembersLoadingByBand((prev) => ({ ...prev, [bandId]: true }));
      try {
        const rows = await listBandMembersForOwner(profile.userId, bandId);
        setMembersByBand((prev) => ({ ...prev, [bandId]: rows }));
      } finally {
        setMembersLoadingByBand((prev) => ({ ...prev, [bandId]: false }));
      }
    },
    [expandedMemberBands, membersByBand, profile.userId],
  );

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
      await refreshBandData();
      if (res.profile.ownedBandId) {
        setActiveOwnedBandId(res.profile.ownedBandId);
        if (newBandPhotoUrl.trim()) {
          const photoRes = await saveBandPhoto(res.profile.ownedBandId, newBandPhotoUrl);
          if (!photoRes.ok) {
            Alert.alert('Banda', `Banda criada, mas a foto não foi salva: ${photoRes.message}`);
          }
        }
      }
      setBandModalOpen(false);
      setNewBandName('');
      setNewBandPhotoUrl('');
      const token = res.profile.ownedInviteToken;
      const nome = res.profile.ownedBandName ?? newBandName.trim();
      Alert.alert(
        'Banda criada',
        token
          ? `${nome}\n\nCódigo de convite:\n${token}\n\nVocê encontra os detalhes no painel abaixo.`
          : `${nome}\n\nO link de convite aparece no painel abaixo.`,
      );
    } finally {
      setBandModalBusy(false);
    }
  }, [newBandName, newBandPhotoUrl, profile.userId, onProfileUpdate, refreshBandData, saveBandPhoto]);

  const applyJoinBand = useCallback(async () => {
    const code = joinCode.trim();
    if (!code) {
      Alert.alert('Convite', 'Cole aqui o código ou o link de convite que você recebeu.');
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
      await refreshBandData();
      setJoinCode('');
      setJoinBandPreview(null);
      Alert.alert('Banda', 'Você entrou na banda.');
    } finally {
      setJoinBusy(false);
    }
  }, [joinCode, profile.userId, onProfileUpdate, refreshBandData]);

  const openEditBandModal = useCallback((bandId: string, bandName: string, bandPhotoUrl: string | null) => {
    setEditBandId(bandId);
    setEditBandName(bandName);
    setEditBandPhotoUrl(bandPhotoUrl ?? '');
    setBandEditModalOpen(true);
  }, []);

  const applyRenameBand = useCallback(async () => {
    const name = editBandName.trim();
    if (!name) {
      Alert.alert('Banda', 'Informe o novo nome da banda.');
      return;
    }
    if (!editBandId) {
      Alert.alert('Banda', 'Selecione a banda para editar.');
      return;
    }
    if (!profile.userId) return;
    setBandCrudBusy(true);
    try {
      const renameRes = await renameOwnedBand(profile.userId, name, editBandId);
      if (!renameRes.ok) {
        Alert.alert('Banda', renameRes.message);
        return;
      }
      const photoRes = await updateOwnedBandPhoto(profile.userId, normalizePhotoUrl(editBandPhotoUrl), editBandId);
      if (!photoRes.ok) {
        onProfileUpdate(renameRes.profile);
        await refreshBandData();
        Alert.alert('Banda', `Nome salvo, mas a foto não foi atualizada: ${photoRes.message}`);
        return;
      }
      onProfileUpdate(photoRes.profile);
      await refreshBandData();
      setBandEditModalOpen(false);
      Alert.alert('Banda', 'Nome e foto atualizados com sucesso.');
    } finally {
      setBandCrudBusy(false);
    }
  }, [editBandId, editBandName, editBandPhotoUrl, normalizePhotoUrl, onProfileUpdate, profile.userId, refreshBandData]);

  const applyRegenerateInvite = useCallback(async (bandId: string) => {
    if (!profile.userId) return;
    setBandCrudBusy(true);
    try {
      const res = await regenerateOwnedBandInvite(profile.userId, bandId);
      if (!res.ok) {
        Alert.alert('Convite', res.message);
        return;
      }
      onProfileUpdate(res.profile);
      await refreshBandData();
      setActiveOwnedBandId(bandId);
      Alert.alert('Convite', 'Novo código de convite gerado.');
    } finally {
      setBandCrudBusy(false);
    }
  }, [onProfileUpdate, profile.userId, refreshBandData]);

  const runDeleteBand = useCallback(
    (bandId: string) => {
      if (!profile.userId) return;
      setBandCrudBusy(true);
      void deleteOwnedBand(profile.userId, bandId)
        .then(async (res) => {
          if (!res.ok) {
            Alert.alert('Banda', res.message);
            return;
          }
          setBandRows((prev) => prev.filter((row) => row.id !== bandId));
          if (editBandId === bandId) {
            setBandEditModalOpen(false);
            setEditBandId(null);
            setEditBandName('');
          }
          onProfileUpdate(res.profile);
          await refreshBandData();
          Alert.alert('Banda', 'Banda excluída com sucesso.');
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : 'Erro inesperado ao excluir banda.';
          Alert.alert('Banda', message);
        })
        .finally(() => setBandCrudBusy(false));
    },
    [editBandId, onProfileUpdate, profile.userId, refreshBandData],
  );

  const applyDeleteBand = useCallback(
    (bandId: string, bandName: string) => {
      if (!profile.userId) return;
      const message = `Esta ação remove a banda “${bandName}” e as associações de membros. Deseja continuar?`;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const confirmed = window.confirm(message);
        if (!confirmed) return;
        runDeleteBand(bandId);
        return;
      }
      Alert.alert('Excluir banda', message, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: () => runDeleteBand(bandId) },
      ]);
    },
    [profile.userId, runDeleteBand],
  );

  const runPromoteMember = useCallback(
    async (bandId: string, memberUserId: string) => {
      if (!profile.userId) return;
      setBandCrudBusy(true);
      try {
        const res = await promoteBandMemberForOwner(profile.userId, bandId, memberUserId);
        if (!res.ok) {
          Alert.alert('Integrantes', res.message);
          return;
        }
        const rows = await listBandMembersForOwner(profile.userId, bandId);
        setMembersByBand((prev) => ({ ...prev, [bandId]: rows }));
        Alert.alert('Integrantes', 'Integrante promovido para administrador.');
      } finally {
        setBandCrudBusy(false);
      }
    },
    [profile.userId],
  );

  const runRemoveMember = useCallback(
    async (bandId: string, memberUserId: string) => {
      if (!profile.userId) return;
      setBandCrudBusy(true);
      try {
        const res = await removeBandMemberForOwner(profile.userId, bandId, memberUserId);
        if (!res.ok) {
          Alert.alert('Integrantes', res.message);
          return;
        }
        const rows = await listBandMembersForOwner(profile.userId, bandId);
        setMembersByBand((prev) => ({ ...prev, [bandId]: rows }));
        await refreshBandData();
        Alert.alert('Integrantes', 'Integrante removido da banda.');
      } finally {
        setBandCrudBusy(false);
      }
    },
    [profile.userId, refreshBandData],
  );

  const askRemoveMember = useCallback(
    (bandId: string, memberUserId: string, memberLabel: string) => {
      const message = `Remover "${memberLabel}" desta banda?`;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        if (!window.confirm(message)) return;
        void runRemoveMember(bandId, memberUserId);
        return;
      }
      Alert.alert('Remover integrante', message, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', style: 'destructive', onPress: () => void runRemoveMember(bandId, memberUserId) },
      ]);
    },
    [runRemoveMember],
  );

  const askPromoteMember = useCallback(
    (bandId: string, memberUserId: string, memberLabel: string) => {
      const message = `Promover "${memberLabel}" para administrador?`;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        if (!window.confirm(message)) return;
        void runPromoteMember(bandId, memberUserId);
        return;
      }
      Alert.alert('Promover integrante', message, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Promover', onPress: () => void runPromoteMember(bandId, memberUserId) },
      ]);
    },
    [runPromoteMember],
  );

  const runDemoteMember = useCallback(
    async (bandId: string, memberUserId: string) => {
      if (!profile.userId) return;
      setBandCrudBusy(true);
      try {
        const res = await demoteBandAdminForOwner(profile.userId, bandId, memberUserId);
        if (!res.ok) {
          Alert.alert('Integrantes', res.message);
          return;
        }
        const rows = await listBandMembersForOwner(profile.userId, bandId);
        setMembersByBand((prev) => ({ ...prev, [bandId]: rows }));
        Alert.alert('Integrantes', 'Privilégios de administrador removidos.');
      } finally {
        setBandCrudBusy(false);
      }
    },
    [profile.userId],
  );

  const askDemoteMember = useCallback(
    (bandId: string, memberUserId: string, memberLabel: string) => {
      const message = `Retirar privilégios de administrador de "${memberLabel}"?`;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        if (!window.confirm(message)) return;
        void runDemoteMember(bandId, memberUserId);
        return;
      }
      Alert.alert('Retirar privilégios', message, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', style: 'destructive', onPress: () => void runDemoteMember(bandId, memberUserId) },
      ]);
    },
    [runDemoteMember],
  );

  const askLeaveBand = useCallback(
    (bandId: string, bandName: string) => {
      if (!profile.userId) return;
      const message = `Deseja sair da banda "${bandName}"?`;
      const run = () => {
        setBandCrudBusy(true);
        void leaveBand(profile.userId, bandId)
          .then(async (res) => {
            if (!res.ok) {
              Alert.alert('Banda', res.message);
              return;
            }
            onProfileUpdate(res.profile);
            await refreshBandData();
            Alert.alert('Banda', 'Você saiu da banda.');
          })
          .finally(() => setBandCrudBusy(false));
      };
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        if (!window.confirm(message)) return;
        run();
        return;
      }
      Alert.alert('Sair da banda', message, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sair', style: 'destructive', onPress: run },
      ]);
    },
    [onProfileUpdate, profile.userId, refreshBandData],
  );

  const ownedBandsWithInfo = ownedBands;
  const selectedOwnedBand =
    activeOwnedBandId != null ? ownedBandsWithInfo.find((b) => b.id === activeOwnedBandId) ?? null : null;
  const selectedOwnedBandIndex = selectedOwnedBand
    ? ownedBandsWithInfo.findIndex((b) => b.id === selectedOwnedBand.id)
    : -1;
  const selectedInviteUrl = selectedOwnedBand?.inviteToken ? buildInviteUrl(selectedOwnedBand.inviteToken) : null;

  const goToPreviousOwnedBand = useCallback(() => {
    if (ownedBandsWithInfo.length < 2 || selectedOwnedBandIndex < 0) return;
    const nextIndex = (selectedOwnedBandIndex - 1 + ownedBandsWithInfo.length) % ownedBandsWithInfo.length;
    setActiveOwnedBandId(ownedBandsWithInfo[nextIndex]?.id ?? null);
  }, [ownedBandsWithInfo, selectedOwnedBandIndex]);

  const goToNextOwnedBand = useCallback(() => {
    if (ownedBandsWithInfo.length < 2 || selectedOwnedBandIndex < 0) return;
    const nextIndex = (selectedOwnedBandIndex + 1) % ownedBandsWithInfo.length;
    setActiveOwnedBandId(ownedBandsWithInfo[nextIndex]?.id ?? null);
  }, [ownedBandsWithInfo, selectedOwnedBandIndex]);

  const copyInvite = async (inviteUrl: string | null) => {
    if (!inviteUrl) return;
    const ok = await copyTextToClipboard(inviteUrl);
    if (ok) Alert.alert('Copiado', 'O link do convite foi copiado.');
    else Alert.alert('Copiar', 'Não consegui copiar agora. Tente novamente em instantes.');
  };

  const shareInvite = async (inviteUrl: string | null) => {
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

  const copyInviteCode = async (code: string | null) => {
    const normalized = code?.trim() ?? '';
    if (!normalized) return;
    const ok = await copyTextToClipboard(normalized);
    if (ok) Alert.alert('Copiado', 'O código de convite foi copiado.');
    else Alert.alert('Copiar', 'Não consegui copiar agora. Tente novamente em instantes.');
  };

  const joinPlaceholder =
    Platform.OS === 'web'
      ? 'Cole aqui o código ou o link de convite'
      : 'Cole aqui o código ou o link de convite';

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

          <View style={styles.bandMenuTabs}>
            <Pressable
              onPress={() => setActiveBandMenu('convites')}
              style={({ pressed }) => [
                styles.bandMenuTabBtn,
                activeBandMenu === 'convites' && styles.bandMenuTabBtnActive,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Abrir menu de convites"
            >
              <Text
                style={[
                  styles.bandMenuTabBtnText,
                  activeBandMenu === 'convites' && styles.bandMenuTabBtnTextActive,
                ]}
              >
                Convites
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveBandMenu('admin')}
              style={({ pressed }) => [
                styles.bandMenuTabBtn,
                activeBandMenu === 'admin' && styles.bandMenuTabBtnActive,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Abrir menu minhas bandas"
            >
              <Text
                style={[
                  styles.bandMenuTabBtnText,
                  activeBandMenu === 'admin' && styles.bandMenuTabBtnTextActive,
                ]}
              >
                Minhas bandas
              </Text>
            </Pressable>
          </View>

          <View style={styles.bandHubDivider} />

          {activeBandMenu === 'convites' ? (
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
                    Crie uma nova banda e comece a organizar seus integrantes em poucos segundos.
                  </Text>
                  <Pressable
                    onPress={() => setBandModalOpen(true)}
                    style={({ pressed }) => [styles.registerBandBtn, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={profile.ownedBandId ? 'Cadastrar nova banda' : 'Cadastrar banda'}
                  >
                    <Text style={styles.registerBandBtnText}>
                      {profile.ownedBandId ? 'Cadastrar nova banda' : 'Cadastrar banda'}
                    </Text>
                  </Pressable>
                </View>

                {ownedBandsWithInfo.length > 0 ? (
                  <View style={styles.inviteCarouselWrap}>
                    <View style={styles.inviteCarouselTop}>
                      <Text style={styles.inviteCarouselTitle}>Códigos de convite (carrossel)</Text>
                      {ownedBandsWithInfo.length > 1 ? (
                        <View style={styles.inviteCarouselNav}>
                          <Pressable
                            onPress={goToPreviousOwnedBand}
                            style={({ pressed }) => [styles.inviteCarouselNavBtn, pressed && styles.pressed]}
                            accessibilityRole="button"
                            accessibilityLabel="Banda anterior"
                          >
                            <Text style={styles.inviteCarouselNavBtnText}>Anterior</Text>
                          </Pressable>
                          <Pressable
                            onPress={goToNextOwnedBand}
                            style={({ pressed }) => [styles.inviteCarouselNavBtn, pressed && styles.pressed]}
                            accessibilityRole="button"
                            accessibilityLabel="Próxima banda"
                          >
                            <Text style={styles.inviteCarouselNavBtnText}>Próxima</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                    {selectedOwnedBand ? (
                      <View style={[styles.invitePanel, styles.invitePanelActive]}>
                        <View style={styles.invitePanelAccent} />
                        <View style={styles.invitePanelInner}>
                          <Text style={styles.invitePanelKicker}>
                            Convite da banda{' '}
                            {selectedOwnedBandIndex >= 0 ? `(${selectedOwnedBandIndex + 1}/${ownedBandsWithInfo.length})` : ''}
                          </Text>
                          <View style={styles.bandIdentityHero}>
                            <View style={styles.bandAvatarHeroWrap}>
                              {selectedOwnedBand.photoUrl ? (
                                <Image source={{ uri: selectedOwnedBand.photoUrl }} style={styles.bandAvatarHeroImg} />
                              ) : (
                                <Text style={styles.bandAvatarHeroFallback}>
                                  {selectedOwnedBand.name.slice(0, 2).toUpperCase()}
                                </Text>
                              )}
                            </View>
                            <Text style={styles.invitePanelTitle}>{selectedOwnedBand.name}</Text>
                          </View>
                          {selectedOwnedBand.inviteToken ? (
                            <View style={styles.inviteTokenBlock}>
                              <Text style={styles.inviteTokenLabel}>Código</Text>
                              <Text selectable style={styles.inviteTokenValue}>
                                {selectedOwnedBand.inviteToken}
                              </Text>
                            </View>
                          ) : null}
                          <View style={styles.inviteUrlBox}>
                            <Text selectable style={styles.inviteUrlMono}>
                              {selectedInviteUrl ?? 'Sem link disponível'}
                            </Text>
                          </View>
                          <View style={styles.inviteActions}>
                            <Pressable
                              onPress={() => void copyInviteCode(selectedOwnedBand.inviteToken)}
                              style={({ pressed }) => [styles.inviteBtnSecondary, pressed && styles.pressed]}
                              accessibilityRole="button"
                              accessibilityLabel={`Copiar código de ${selectedOwnedBand.name}`}
                            >
                              <Text style={styles.inviteBtnSecondaryText}>Copiar código</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => void copyInvite(selectedInviteUrl)}
                              style={({ pressed }) => [styles.inviteBtn, pressed && styles.pressed]}
                              accessibilityRole="button"
                              accessibilityLabel={`Copiar link de ${selectedOwnedBand.name}`}
                            >
                              <Text style={styles.inviteBtnText}>Copiar link</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => void shareInvite(selectedInviteUrl)}
                              style={({ pressed }) => [styles.inviteBtnSecondary, pressed && styles.pressed]}
                              accessibilityRole="button"
                              accessibilityLabel={`Compartilhar convite de ${selectedOwnedBand.name}`}
                            >
                              <Text style={styles.inviteBtnSecondaryText}>Compartilhar</Text>
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    ) : null}
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
                    Você pode entrar com o código ou com o link de convite recebido. O sistema reconhece automaticamente.
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
              </View>
            </View>
          ) : (
            <View style={styles.adminPageWrap}>
              <Text style={styles.adminPageTitle}>Administração de bandas</Text>
              <Text style={styles.adminPageLead}>Escolha uma banda para editar, organizar integrantes e manter tudo em dia.</Text>
              <View style={styles.bandsPanel}>
                <Text style={styles.bandsPanelTitle}>Menu · Minhas bandas</Text>
                <Text style={styles.bandsPanelLead}>
                  Administre cada banda por aqui: editar nome, gerar novo código e excluir.
                </Text>
                {bandRows.length > 0 ? (
                  bandRows.map((row, i) => (
                    <View
                      key={`${row.id}-${row.role}-${i}`}
                      style={[styles.bandChip, i > 0 && styles.bandChipSpaced]}
                    >
                      <View style={styles.bandChipTopRow}>
                        <View style={styles.bandAvatarListWrap}>
                          {row.photoUrl ? (
                            <Image source={{ uri: row.photoUrl }} style={styles.bandAvatarListImg} />
                          ) : (
                            <Text style={styles.bandAvatarListFallback}>{row.name.slice(0, 2).toUpperCase()}</Text>
                          )}
                        </View>
                        <View style={styles.bandChipMain}>
                          <Text style={styles.bandChipName} numberOfLines={1}>
                            {row.name}
                          </Text>
                          <Text style={styles.bandChipRole} numberOfLines={1}>
                            {row.role}
                          </Text>
                          {row.inviteToken ? (
                            <Text style={styles.bandChipInfo} numberOfLines={1}>
                              Convite: {row.inviteToken}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      {row.canManage ? (
                        <View>
                          <View style={styles.bandChipActions}>
                            <Pressable
                              onPress={() => openEditBandModal(row.id, row.name, row.photoUrl)}
                              disabled={bandCrudBusy}
                              style={({ pressed }) => [
                                styles.ownerCrudBtn,
                                bandCrudBusy && styles.joinBtnOff,
                                pressed && !bandCrudBusy && styles.pressed,
                              ]}
                              accessibilityRole="button"
                              accessibilityLabel={`Editar ${row.name}`}
                            >
                              <Text style={styles.ownerCrudBtnText}>Editar</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => void applyRegenerateInvite(row.id)}
                              disabled={bandCrudBusy}
                              style={({ pressed }) => [
                                styles.ownerCrudBtn,
                                bandCrudBusy && styles.joinBtnOff,
                                pressed && !bandCrudBusy && styles.pressed,
                              ]}
                              accessibilityRole="button"
                              accessibilityLabel={`Gerar novo código para ${row.name}`}
                            >
                              <Text style={styles.ownerCrudBtnText}>Novo código</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => void toggleBandMembers(row.id)}
                              disabled={membersLoadingByBand[row.id]}
                              style={({ pressed }) => [
                                styles.ownerCrudBtn,
                                membersLoadingByBand[row.id] && styles.joinBtnOff,
                                pressed && !membersLoadingByBand[row.id] && styles.pressed,
                              ]}
                              accessibilityRole="button"
                              accessibilityLabel={`Ver integrantes de ${row.name}`}
                            >
                              <Text style={styles.ownerCrudBtnText}>
                                {expandedMemberBands[row.id] ? 'Ocultar integrantes' : 'Ver integrantes'}
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={() => applyDeleteBand(row.id, row.name)}
                              disabled={bandCrudBusy}
                              style={({ pressed }) => [
                                styles.ownerCrudBtnDanger,
                                bandCrudBusy && styles.joinBtnOff,
                                pressed && !bandCrudBusy && styles.pressed,
                              ]}
                              accessibilityRole="button"
                              accessibilityLabel={`Excluir ${row.name}`}
                            >
                              <Text style={styles.ownerCrudBtnDangerText}>Excluir</Text>
                            </Pressable>
                          </View>
                          {expandedMemberBands[row.id] ? (
                            <View style={styles.membersPanel}>
                              {membersLoadingByBand[row.id] ? (
                                <Text style={styles.membersHint}>Carregando integrantes...</Text>
                              ) : (membersByBand[row.id] ?? []).length > 0 ? (
                                (membersByBand[row.id] ?? []).map((member) => (
                                  <View key={`${row.id}-${member.userId}`} style={styles.memberRow}>
                                    <Text style={styles.memberName}>
                                      {member.displayName?.trim() || member.email || 'Integrante sem nome'}
                                    </Text>
                                    <Text style={styles.memberMeta}>
                                      {member.role === 'admin' ? 'Administrador' : 'Membro'}
                                      {member.email ? ` · ${member.email}` : ''}
                                    </Text>
                                    {member.userId !== profile.userId ? (
                                      <View style={styles.memberActions}>
                                        {member.role !== 'admin' ? (
                                          <Pressable
                                            onPress={() =>
                                              askPromoteMember(
                                                row.id,
                                                member.userId,
                                                member.displayName?.trim() || member.email || 'Integrante',
                                              )
                                            }
                                            disabled={bandCrudBusy}
                                            style={({ pressed }) => [
                                              styles.ownerCrudBtn,
                                              bandCrudBusy && styles.joinBtnOff,
                                              pressed && !bandCrudBusy && styles.pressed,
                                            ]}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Promover ${member.displayName || member.email || 'integrante'}`}
                                          >
                                            <Text style={styles.ownerCrudBtnText}>Tornar administrador</Text>
                                          </Pressable>
                                        ) : (
                                          <Pressable
                                            onPress={() =>
                                              askDemoteMember(
                                                row.id,
                                                member.userId,
                                                member.displayName?.trim() || member.email || 'Integrante',
                                              )
                                            }
                                            disabled={bandCrudBusy}
                                            style={({ pressed }) => [
                                              styles.ownerCrudBtn,
                                              bandCrudBusy && styles.joinBtnOff,
                                              pressed && !bandCrudBusy && styles.pressed,
                                            ]}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Retirar privilégios de ${member.displayName || member.email || 'integrante'}`}
                                          >
                                            <Text style={styles.ownerCrudBtnText}>Remover administração</Text>
                                          </Pressable>
                                        )}
                                        <Pressable
                                          onPress={() =>
                                            askRemoveMember(
                                              row.id,
                                              member.userId,
                                              member.displayName?.trim() || member.email || 'Integrante',
                                            )
                                          }
                                          disabled={bandCrudBusy}
                                          style={({ pressed }) => [
                                            styles.ownerCrudBtnDanger,
                                            bandCrudBusy && styles.joinBtnOff,
                                            pressed && !bandCrudBusy && styles.pressed,
                                          ]}
                                          accessibilityRole="button"
                                          accessibilityLabel={`Remover ${member.displayName || member.email || 'integrante'}`}
                                        >
                                          <Text style={styles.ownerCrudBtnDangerText}>Retirar</Text>
                                        </Pressable>
                                      </View>
                                    ) : null}
                                  </View>
                                ))
                              ) : (
                                <Text style={styles.membersHint}>Ainda não há integrantes visíveis nesta banda.</Text>
                              )}
                            </View>
                          ) : null}
                        </View>
                      ) : (
                        <View style={styles.bandChipActions}>
                          <Pressable
                            onPress={() => void toggleBandMembers(row.id)}
                            disabled={membersLoadingByBand[row.id]}
                            style={({ pressed }) => [
                              styles.ownerCrudBtn,
                              membersLoadingByBand[row.id] && styles.joinBtnOff,
                              pressed && !membersLoadingByBand[row.id] && styles.pressed,
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={`Ver integrantes de ${row.name}`}
                          >
                            <Text style={styles.ownerCrudBtnText}>
                              {expandedMemberBands[row.id] ? 'Ocultar integrantes' : 'Ver integrantes'}
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => askLeaveBand(row.id, row.name)}
                            disabled={bandCrudBusy}
                            style={({ pressed }) => [
                              styles.ownerCrudBtnDanger,
                              bandCrudBusy && styles.joinBtnOff,
                              pressed && !bandCrudBusy && styles.pressed,
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={`Sair da banda ${row.name}`}
                          >
                            <Text style={styles.ownerCrudBtnDangerText}>Sair da banda</Text>
                          </Pressable>
                        </View>
                      )}
                      {!row.canManage && expandedMemberBands[row.id] ? (
                        <View style={styles.membersPanel}>
                          {membersLoadingByBand[row.id] ? (
                            <Text style={styles.membersHint}>Carregando integrantes...</Text>
                          ) : (membersByBand[row.id] ?? []).length > 0 ? (
                            (membersByBand[row.id] ?? []).map((member) => (
                              <View key={`${row.id}-${member.userId}`} style={styles.memberRow}>
                                <Text style={styles.memberName}>
                                  {member.displayName?.trim() || member.email || 'Integrante sem nome'}
                                </Text>
                                <Text style={styles.memberMeta}>
                                  {member.role === 'admin' ? 'Administrador' : 'Membro'}
                                  {member.email ? ` · ${member.email}` : ''}
                                </Text>
                              </View>
                            ))
                          ) : (
                            <Text style={styles.membersHint}>Nenhum integrante visível nesta banda.</Text>
                          )}
                        </View>
                      ) : null}
                    </View>
                  ))
                ) : (
                  <Text style={styles.bandsEmpty}>
                    Ainda sem bandas — use o menu Convites para cadastrar ou entrar em uma banda.
                  </Text>
                )}
              </View>
            </View>
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
          <Text style={styles.mockDisclaimer}>Esta área é apenas uma prévia ilustrativa.</Text>
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
            Você está na versão web. Se trocar de navegador ou limpar os dados do site, pode ser necessário entrar novamente.
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
            <Text style={styles.modalFieldLabel}>Link da foto da banda (opcional)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="https://..."
              placeholderTextColor={COLORS.muted}
              value={newBandPhotoUrl}
              onChangeText={setNewBandPhotoUrl}
              editable={!bandModalBusy}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {normalizePhotoUrl(newBandPhotoUrl) ? (
              <Image source={{ uri: normalizePhotoUrl(newBandPhotoUrl) ?? '' }} style={styles.modalPhotoPreview} />
            ) : (
              <Text style={styles.modalHint}>Dica: use um link público https para exibir a foto da banda.</Text>
            )}
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

      <Modal
        visible={bandEditModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !bandCrudBusy && setBandEditModalOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalAvoid}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalWrap}>
            <Pressable
              style={styles.modalBackdrop}
              onPress={() => !bandCrudBusy && setBandEditModalOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Fechar"
            />
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Editar banda</Text>
              <Text style={styles.modalLead}>Altere o nome e a foto visível para os membros.</Text>
              <Text style={styles.modalFieldLabel}>Nome da banda</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Ex.: Os Subterrâneos"
                placeholderTextColor={COLORS.muted}
                value={editBandName}
                onChangeText={setEditBandName}
                editable={!bandCrudBusy}
                autoCorrect={false}
              />
              <Text style={styles.modalFieldLabel}>Link da foto da banda</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="https://..."
                placeholderTextColor={COLORS.muted}
                value={editBandPhotoUrl}
                onChangeText={setEditBandPhotoUrl}
                editable={!bandCrudBusy}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {normalizePhotoUrl(editBandPhotoUrl) ? (
                <Image source={{ uri: normalizePhotoUrl(editBandPhotoUrl) ?? '' }} style={styles.modalPhotoPreview} />
              ) : (
                <Text style={styles.modalHint}>Deixe vazio para remover a foto da banda.</Text>
              )}
              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => !bandCrudBusy && setBandEditModalOpen(false)}
                  style={({ pressed }) => [styles.modalBtnGhost, pressed && styles.pressed]}
                  accessibilityRole="button"
                >
                  <Text style={styles.modalBtnGhostText}>Cancelar</Text>
                </Pressable>
                <Pressable
                  onPress={() => void applyRenameBand()}
                  disabled={bandCrudBusy}
                  style={({ pressed }) => [
                    styles.modalBtnPrimary,
                    bandCrudBusy && styles.joinBtnOff,
                    pressed && !bandCrudBusy && styles.pressed,
                  ]}
                  accessibilityRole="button"
                >
                  {bandCrudBusy ? (
                    <ActivityIndicator color={COLORS.accentText} />
                  ) : (
                    <Text style={styles.modalBtnPrimaryText}>Salvar alterações</Text>
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
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 22,
    letterSpacing: 0.2,
  },
  bandHub: {
    backgroundColor: 'rgba(18, 22, 38, 0.9)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    marginBottom: 24,
    ...Platform.select({
      web: {
        boxShadow: '0 16px 36px rgba(0,0,0,0.28)',
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
  bandMenuTabs: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  bandMenuTabBtn: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgElevated,
  },
  bandMenuTabBtnActive: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(244, 176, 66, 0.14)',
  },
  bandMenuTabBtnText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  bandMenuTabBtnTextActive: {
    color: COLORS.accent,
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
  ownerCrudWrap: {
    marginTop: 10,
    gap: 10,
  },
  ownerBandName: {
    color: COLORS.text,
    fontWeight: '800',
  },
  ownerCrudActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ownerCrudBtn: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgElevated,
  },
  ownerCrudBtnText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  ownerCrudBtnDanger: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,122,155,0.45)',
    backgroundColor: 'rgba(255,122,155,0.14)',
  },
  ownerCrudBtnDangerText: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: '800',
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
    backgroundColor: 'rgba(26, 34, 54, 0.88)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
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
    backgroundColor: 'rgba(255, 190, 152, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 190, 152, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bandPathBadgeAlt: {
    backgroundColor: 'rgba(92, 211, 176, 0.12)',
    borderColor: 'rgba(92, 211, 176, 0.35)',
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
    borderColor: 'rgba(255, 190, 152, 0.35)',
    backgroundColor: COLORS.card,
  },
  inviteCarouselWrap: {
    gap: 10,
  },
  inviteCarouselTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  inviteCarouselTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text,
  },
  inviteCarouselNav: {
    flexDirection: 'row',
    gap: 8,
  },
  inviteCarouselNavBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgElevated,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  inviteCarouselNavBtnText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },
  inviteCarouselContent: {
    gap: 10,
    paddingRight: 6,
  },
  inviteCarouselItem: {
    width: Platform.select({ web: 370, default: 320 }) as number,
    flexShrink: 0,
  },
  invitePanelActive: {
    borderColor: COLORS.accent,
  },
  inviteCarouselHint: {
    fontSize: 12,
    color: COLORS.muted,
    lineHeight: 18,
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
  bandIdentityHero: {
    marginTop: 8,
    alignItems: 'center',
    gap: 8,
  },
  bandAvatarHeroWrap: {
    width: 92,
    height: 92,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 10px 24px rgba(244, 176, 66, 0.25)',
      },
      default: {},
    }),
  },
  bandAvatarHeroImg: {
    width: '100%',
    height: '100%',
  },
  bandAvatarHeroFallback: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '800',
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
    backgroundColor: 'rgba(92, 211, 176, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(92, 211, 176, 0.25)',
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
    backgroundColor: 'rgba(26, 34, 54, 0.88)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 16,
  },
  adminPageWrap: {
    gap: 12,
  },
  adminPageTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  adminPageLead: {
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 20,
  },
  bandsPanelTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 6,
  },
  bandsPanelLead: {
    fontSize: 12,
    color: COLORS.muted,
    lineHeight: 18,
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
  bandChipTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bandChipSpaced: {
    marginTop: 10,
  },
  bandChipMain: {
    minWidth: 0,
    flex: 1,
  },
  bandChipActions: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  membersPanel: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgElevated,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  memberRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    paddingBottom: 8,
  },
  memberName: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '700',
  },
  memberMeta: {
    marginTop: 2,
    fontSize: 12,
    color: COLORS.muted,
  },
  memberActions: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  membersHint: {
    fontSize: 12,
    color: COLORS.muted,
    lineHeight: 18,
  },
  bandAvatarListWrap: {
    width: 58,
    height: 58,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: COLORS.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...Platform.select({
      web: {
        boxShadow: '0 6px 16px rgba(0,0,0,0.22)',
      },
      default: {},
    }),
  },
  bandAvatarListImg: {
    width: '100%',
    height: '100%',
  },
  bandAvatarListFallback: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '800',
  },
  bandChipName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  bandChipRole: {
    marginTop: 4,
    fontSize: 13,
    color: COLORS.muted,
  },
  bandChipInfo: {
    marginTop: 5,
    fontSize: 12,
    color: COLORS.accent,
    fontFamily: Platform.select({ web: 'ui-monospace, monospace', default: 'monospace' }) as string,
  },
  bandsEmpty: {
    fontSize: 14,
    color: COLORS.muted,
    lineHeight: 21,
  },
  cta: {
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    padding: 20,
    marginBottom: 28,
    ...Platform.select({
      web: { boxShadow: '0 14px 30px rgba(244, 176, 66, 0.3)' },
      default: {},
    }),
  },
  ctaTitle: { color: COLORS.accentText, fontSize: 18, fontWeight: '800' },
  ctaSub: { marginTop: 6, color: COLORS.accentText, fontSize: 14, opacity: 0.9 },
  secondaryCta: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(26, 34, 54, 0.86)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 28,
    ...Platform.select({
      web: { boxShadow: '0 12px 26px rgba(0,0,0,0.22)' },
      default: {},
    }),
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
    backgroundColor: 'rgba(26, 34, 54, 0.88)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 18,
    marginBottom: 20,
    ...Platform.select({
      web: { boxShadow: '0 10px 22px rgba(0,0,0,0.18)' },
      default: {},
    }),
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
  mockTagAccent: { backgroundColor: 'rgba(255, 190, 152, 0.15)', borderColor: 'rgba(255, 190, 152, 0.35)' },
  mockTagWarn: { backgroundColor: 'rgba(255, 122, 155, 0.12)', borderColor: 'rgba(255, 122, 155, 0.35)' },
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
  modalPhotoPreview: {
    marginTop: 10,
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgElevated,
  },
  modalHint: {
    marginTop: 8,
    fontSize: 12,
    color: COLORS.muted,
    lineHeight: 18,
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
