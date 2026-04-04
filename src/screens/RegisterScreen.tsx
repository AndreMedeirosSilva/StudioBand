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
import { loginWithPassword, registerAccount } from '../registry/localRegistry';
import { isAppleAuthEnabled, isGoogleAuthEnabled, isSupabaseConfigured } from '../lib/supabase/config';
import { signInWithGoogle } from '../lib/supabase/googleAuth';
import { signInWithApple } from '../lib/supabase/appleAuth';
import { Image } from 'expo-image';
import { GOOGLE_G_LOGO_URI } from '../assets/googleBrand';
import { getPasswordPolicyError, isValidEmail, MIN_PASSWORD_LENGTH } from '../lib/auth/credentialsPolicy';

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
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  const showGoogle = isGoogleAuthEnabled();
  const showApple = isAppleAuthEnabled();
  const showSocial = showGoogle || showApple;

  const submit = async () => {
    const e = email.trim();
    if (!isValidEmail(e)) {
      Alert.alert('E-mail', 'Informe um e-mail válido.');
      return;
    }
    const passwordPolicyError = getPasswordPolicyError(password);
    if (passwordPolicyError) {
      Alert.alert('Senha', passwordPolicyError);
      return;
    }
    if (password !== passwordConfirm) {
      Alert.alert('Senha', 'As senhas não coincidem.');
      return;
    }
    setBusy(true);
    try {
      const res = await registerAccount({
        email: e,
        password,
        displayName: null,
        isBand: false,
        bandName: '',
        isStudio: false,
        studioName: '',
      });
      if (!res.ok) {
        const msg = res.message.toLowerCase();
        const canTryLogin =
          msg.includes('já está cadastrado') ||
          msg.includes('muitas tentativas') ||
          msg.includes('aguarde alguns minutos') ||
          msg.includes('confirme o e-mail');
        if (canTryLogin) {
          const loginRes = await loginWithPassword(e, password);
          if (loginRes.ok) {
            Alert.alert('Conta encontrada', 'Sua conta já estava criada. Você foi conectado com sucesso.');
            onComplete(loginRes.profile);
            return;
          }
        }
        Alert.alert('Cadastro', res.message);
        return;
      }
      Alert.alert('Cadastro concluído', 'Conta criada com sucesso. Agora faça seu login.');
      onBack();
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setGoogleBusy(true);
    try {
      const r = await signInWithGoogle();
      if (r.kind === 'error') {
        Alert.alert('Google', r.message);
        return;
      }
      if (r.kind === 'ok') {
        onComplete(r.profile);
      }
    } finally {
      if (Platform.OS !== 'web') setGoogleBusy(false);
    }
  };

  const onApple = async () => {
    setAppleBusy(true);
    try {
      const r = await signInWithApple();
      if (r.kind === 'error') {
        Alert.alert('Apple', r.message);
        return;
      }
      if (r.kind === 'ok') {
        onComplete(r.profile);
      }
    } finally {
      if (Platform.OS !== 'web') setAppleBusy(false);
    }
  };

  const canSubmit =
    email.trim().length > 0 &&
    password.length >= MIN_PASSWORD_LENGTH &&
    password === passwordConfirm;

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
        <Text style={styles.sub}>Escolha como quer entrar e comece a usar o app.</Text>

        <View style={[styles.card, { width: cardW, maxWidth: '100%', alignSelf: 'center' }]}>
          {showSocial ? (
            <View style={styles.socialWrap}>
              {showGoogle ? (
                <Pressable
                  style={({ pressed }) => [styles.socialGoogleBtn, (googleBusy || pressed) && styles.pressed]}
                  onPress={() => void onGoogle()}
                  disabled={googleBusy || appleBusy || busy}
                  accessibilityRole="button"
                  accessibilityLabel="Continuar com Google"
                >
                  {googleBusy ? (
                    <ActivityIndicator color={COLORS.text} />
                  ) : (
                    <View style={styles.googleBtnInner}>
                      <Image source={{ uri: GOOGLE_G_LOGO_URI }} style={styles.googleMark} contentFit="contain" />
                      <Text style={styles.socialGoogleText}>Continuar com Google</Text>
                    </View>
                  )}
                </Pressable>
              ) : null}
              {showApple ? (
                <Pressable
                  style={({ pressed }) => [styles.socialAppleBtn, (appleBusy || pressed) && styles.pressed]}
                  onPress={() => void onApple()}
                  disabled={googleBusy || appleBusy || busy}
                  accessibilityRole="button"
                  accessibilityLabel="Continuar com Apple"
                >
                  {appleBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.socialAppleText}>Continuar com Apple</Text>}
                </Pressable>
              ) : null}
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>ou com e-mail</Text>
                <View style={styles.dividerLine} />
              </View>
            </View>
          ) : null}

          <Text style={styles.sectionLabel}>Cadastro por e-mail</Text>
          <Text style={styles.fieldHint}>Preencha apenas e-mail e senha.</Text>

          <Text style={[styles.label, styles.labelSpaced]}>E-mail</Text>
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
            placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} (com maiúscula e número)`}
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
              ? 'Sua conta ficará salva com segurança para acessar quando quiser.'
              : 'No momento, o cadastro completo ainda não está disponível neste ambiente.'}
          </Text>

          <Pressable
            style={({ pressed }) => [styles.primary, !canSubmit && styles.primaryOff, pressed && canSubmit && styles.pressed]}
            onPress={() => void submit()}
            disabled={!canSubmit || busy || googleBusy || appleBusy}
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
  socialWrap: { marginTop: 8, marginBottom: 8 },
  socialGoogleBtn: {
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  googleBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  googleMark: {
    width: 20,
    height: 20,
  },
  socialGoogleText: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  socialAppleBtn: {
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111111',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  socialAppleText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
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
