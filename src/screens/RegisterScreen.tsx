import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../theme';
import type { UserProfile } from '../navigation/AppNavigator';
import { registerAccount } from '../registry/localRegistry';
import { isSupabaseConfigured } from '../lib/supabase/config';

type Props = {
  onBack: () => void;
  onComplete: (profile: UserProfile) => void;
};

export function RegisterScreen({ onBack, onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const horizontalPad = Math.min(28, Math.max(16, width * 0.06));
  const cardW = Math.min(440, width - horizontalPad * 2);

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isBand, setIsBand] = useState(false);
  const [isStudio, setIsStudio] = useState(false);
  const [bandName, setBandName] = useState('');
  const [studioName, setStudioName] = useState('');
  const [busy, setBusy] = useState(false);

  const toggle = (key: 'band' | 'studio') => {
    if (key === 'band') setIsBand((v) => !v);
    else setIsStudio((v) => !v);
  };

  const submit = async () => {
    const e = email.trim();
    if (!e || !e.includes('@')) {
      Alert.alert('E-mail', 'Informe um e-mail válido.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Senha', 'A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== passwordConfirm) {
      Alert.alert('Senha', 'As senhas não coincidem.');
      return;
    }
    if (isBand && !bandName.trim()) {
      Alert.alert('Banda', 'Informe o nome da banda ou desmarque “Criar banda”.');
      return;
    }
    if (isStudio && !studioName.trim()) {
      Alert.alert('Estúdio', 'Informe o nome do estúdio ou desmarque “Dono de estúdio”.');
      return;
    }

    setBusy(true);
    try {
      const res = await registerAccount({
        email: e,
        password,
        displayName: displayName.trim() || null,
        isBand,
        bandName,
        isStudio,
        studioName,
      });
      if (!res.ok) {
        Alert.alert('Cadastro', res.message);
        return;
      }
      onComplete(res.profile);
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    email.trim().length > 0 &&
    password.length >= 6 &&
    password === passwordConfirm &&
    (!isBand || bandName.trim().length > 0) &&
    (!isStudio || studioName.trim().length > 0);

  return (
    <KeyboardAvoidingView style={[styles.root, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingHorizontal: horizontalPad,
            paddingBottom: insets.bottom + 24,
            minHeight: height - insets.top,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={onBack} style={({ pressed }) => [styles.back, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={styles.backText}>← Já tenho conta — entrar</Text>
        </Pressable>

        <Text style={styles.title}>Criar conta</Text>
        <Text style={styles.sub}>
          {Platform.OS === 'web'
            ? 'Use o mesmo e-mail e senha para entrar depois. O código de convite da banda só pode ser usado no painel, já logado.'
            : 'Depois de entrar, use o painel para colar o código e entrar numa banda.'}
        </Text>

        <View style={[styles.card, { width: cardW, maxWidth: '100%', alignSelf: 'center' }]}>
          <Text style={styles.sectionLabel}>Eu também sou…</Text>
          <Text style={styles.fieldHint}>Opcional. Pode criar só a conta e juntar-se a uma banda depois no app.</Text>
          <View style={styles.toggles}>
            <Pressable
              onPress={() => toggle('band')}
              style={[styles.chip, isBand && styles.chipOn]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isBand }}
            >
              <Text style={[styles.chipText, isBand && styles.chipTextOn]}>Criar banda</Text>
            </Pressable>
            <Pressable
              onPress={() => toggle('studio')}
              style={[styles.chip, isStudio && styles.chipOn]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isStudio }}
            >
              <Text style={[styles.chipText, isStudio && styles.chipTextOn]}>Dono de estúdio</Text>
            </Pressable>
          </View>

          {isBand ? (
            <>
              <Text style={[styles.label, styles.labelSpaced]}>Nome da banda (nova)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex.: Os Polaroides"
                placeholderTextColor={COLORS.muted}
                value={bandName}
                onChangeText={setBandName}
              />
            </>
          ) : null}

          {isStudio ? (
            <>
              <Text style={[styles.label, styles.labelSpaced]}>Nome do estúdio</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex.: Estúdio Groove"
                placeholderTextColor={COLORS.muted}
                value={studioName}
                onChangeText={setStudioName}
              />
            </>
          ) : null}

          <Text style={[styles.label, styles.labelSpaced]}>Nome (como aparece para a banda)</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex.: Maria · guitarra"
            placeholderTextColor={COLORS.muted}
            value={displayName}
            onChangeText={setDisplayName}
          />

          <Text style={[styles.label, styles.labelSpaced]}>E-mail (login)</Text>
          <TextInput
            style={styles.input}
            placeholder="voce@email.com"
            placeholderTextColor={COLORS.muted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={[styles.label, styles.labelSpaced]}>Senha</Text>
          <TextInput
            style={styles.input}
            placeholder="Mínimo 6 caracteres"
            placeholderTextColor={COLORS.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />

          <Text style={[styles.label, styles.labelSpaced]}>Confirmar senha</Text>
          <TextInput
            style={styles.input}
            placeholder="Repita a senha"
            placeholderTextColor={COLORS.muted}
            value={passwordConfirm}
            onChangeText={setPasswordConfirm}
            secureTextEntry
            autoCapitalize="none"
          />

          <Text style={styles.hint}>
            {isSupabaseConfigured()
              ? 'Conta e dados ligados ao Supabase (nuvem).'
              : 'Os dados ficam só neste dispositivo/navegador (modo local).'}
          </Text>

          <Pressable
            style={({ pressed }) => [styles.primary, !canSubmit && styles.primaryOff, pressed && canSubmit && styles.pressed]}
            onPress={() => void submit()}
            disabled={!canSubmit || busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit || busy }}
          >
            {busy ? (
              <ActivityIndicator color={COLORS.accentText} />
            ) : (
              <Text style={styles.primaryTxt}>Criar conta</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: {
    flexGrow: 1,
    paddingTop: 8,
    ...Platform.select({
      web: {
        minHeight: '100vh' as never,
        justifyContent: 'center',
        paddingVertical: 24,
      },
      default: {},
    }),
  },
  back: { alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 8 },
  backText: { color: COLORS.accent, fontSize: 16, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.text, marginTop: 8 },
  sub: { marginTop: 8, fontSize: 15, color: COLORS.muted, lineHeight: 22, marginBottom: 20 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
  },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  fieldHint: { marginTop: 6, fontSize: 12, color: COLORS.muted, lineHeight: 17 },
  toggles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  chip: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  chipOn: { borderColor: COLORS.accent, backgroundColor: 'rgba(245, 158, 11, 0.12)' },
  chipText: { color: COLORS.muted, fontSize: 15, fontWeight: '600' },
  chipTextOn: { color: COLORS.accent },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  labelSpaced: { marginTop: 18 },
  input: {
    marginTop: 8,
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
  hint: { marginTop: 14, fontSize: 13, color: COLORS.muted, lineHeight: 20 },
  primary: {
    marginTop: 20,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryOff: { opacity: 0.45 },
  primaryTxt: { color: COLORS.accentText, fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.9 },
});
