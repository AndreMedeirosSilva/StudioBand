import { createElement, useState } from 'react';
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
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../theme';
import { WEB_AUTH_SPLIT_MIN_WIDTH } from '../layout/web';
import { loginWithPassword } from '../registry/localRegistry';
import type { UserProfile } from '../storage/persistSession';
import { isAppleAuthEnabled, isGoogleAuthEnabled } from '../lib/supabase/config';
import { signInWithGoogle } from '../lib/supabase/googleAuth';
import { signInWithApple } from '../lib/supabase/appleAuth';
import { GOOGLE_G_LOGO_URI } from '../assets/googleBrand';
import { isValidEmail, normalizeEmail } from '../lib/auth/credentialsPolicy';
import {
  clearLoginRateLimit,
  getLoginLockStatus,
  registerFailedLoginAttempt,
} from '../lib/auth/loginRateLimiter';

/** Servido pelo Expo a partir de `public/login-hero.jpg` (ServeStaticMiddleware). */
const HERO_PUBLIC_PATH = '/login-hero.jpg';

/** Fallback se o ficheiro em `public/` não existir (ex.: build sem copiar `public`). */
const HERO_FALLBACK_URI =
  'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1600&q=85';

const HERO_LOCAL = require('../assets/login-hero.jpg');

/**
 * Na web, `expo-image` + `require` com Metro SDK 52 é instável; um `<img>` com URL estática funciona.
 */
function HeroImageWeb() {
  const [src, setSrc] = useState(HERO_PUBLIC_PATH);
  return createElement('img', {
    alt: '',
    src,
    draggable: false,
    onError: () => setSrc(HERO_FALLBACK_URI),
    style: {
      position: 'absolute' as const,
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      objectFit: 'cover' as const,
      objectPosition: 'center',
      display: 'block',
    },
  });
}

type Props = {
  onGoRegister: () => void;
  onSuccess: (profile: UserProfile) => void | Promise<void>;
};

export function AuthScreen({ onGoRegister, onSuccess }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secure, setSecure] = useState(true);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  const showGoogle = isGoogleAuthEnabled();
  const showApple = isAppleAuthEnabled();
  const showAnySocial = showGoogle || showApple;

  const horizontalPad = Math.min(28, Math.max(18, width * 0.06));
  const heroHeight = Math.min(Math.max(height * 0.36, 240), width >= 900 ? 320 : 380);
  const webAuthSplit = Platform.OS === 'web' && width >= WEB_AUTH_SPLIT_MIN_WIDTH;

  const shouldCountAsCredentialFailure = (message: string): boolean => {
    const m = message.trim().toLowerCase();
    return (
      m.includes('senha incorreta') ||
      m.includes('e-mail ou senha incorretos') ||
      m.includes('e-mail não encontrado') ||
      m.includes('invalid login credentials')
    );
  };

  const submit = async () => {
    const e = normalizeEmail(email);
    if (!isValidEmail(e)) {
      Alert.alert('E-mail', 'Informe um e-mail válido.');
      return;
    }
    if (password.length < 1) {
      Alert.alert('Senha', 'Informe sua senha.');
      return;
    }
    const lock = await getLoginLockStatus(e);
    if (lock.locked) {
      Alert.alert('Acesso temporariamente bloqueado', lock.message ?? 'Tente novamente em instantes.');
      return;
    }
    setBusy(true);
    try {
      const res = await loginWithPassword(e, password);
      if (!res.ok) {
        if (shouldCountAsCredentialFailure(res.message)) {
          const lockMsg = await registerFailedLoginAttempt(e);
          if (lockMsg) {
            Alert.alert('Acesso temporariamente bloqueado', lockMsg);
            return;
          }
        }
        Alert.alert('Não foi possível entrar', res.message);
        return;
      }
      await clearLoginRateLimit(e);
      await Promise.resolve(onSuccess(res.profile));
    } catch (err) {
      const m = err instanceof Error ? err.message : 'Erro inesperado. Tente de novo.';
      Alert.alert('Erro', m);
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
        await Promise.resolve(onSuccess(r.profile));
        return;
      }
      /* kind === 'redirect': navegador web a sair para o Google */
    } catch (err) {
      const m = err instanceof Error ? err.message : 'Erro inesperado com Google.';
      Alert.alert('Google', m);
    } finally {
      if (Platform.OS !== 'web') {
        setGoogleBusy(false);
      }
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
        await Promise.resolve(onSuccess(r.profile));
        return;
      }
      /* redirect on web */
    } catch (err) {
      const m = err instanceof Error ? err.message : 'Erro inesperado com Apple.';
      Alert.alert('Apple', m);
    } finally {
      if (Platform.OS !== 'web') {
        setAppleBusy(false);
      }
    }
  };

  const heroVisual = (
    <>
      {Platform.OS === 'web' ? (
        <HeroImageWeb />
      ) : (
        <Image
          source={HERO_LOCAL}
          style={[styles.heroImage, { width, height: webAuthSplit ? height : heroHeight }]}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      )}
      <View style={styles.heroScrim} pointerEvents="none" />
      <View style={[styles.heroTop, { paddingTop: insets.top + 8, paddingHorizontal: horizontalPad }]} />
      <View style={[styles.heroBottom, { paddingHorizontal: horizontalPad, paddingBottom: 28 }]}>
        <Text style={styles.kicker}>ESTUDIO BANDA</Text>
        <Text style={styles.heroTitle}>Bem-vindo de volta</Text>
        <Text style={styles.heroSub}>Bandas, estúdios e ensaios num só lugar.</Text>
      </View>
    </>
  );

  const formBody = (
    <>
      {!webAuthSplit ? <View style={styles.sheetHandle} importantForAccessibility="no" /> : null}
      <Text style={styles.sheetTitle}>Entrar</Text>
      <Text style={styles.sheetSub}>
        {showAnySocial
          ? 'Entre com Google, Apple ou com e-mail e senha. Novo utilizador? Crie conta em seguida.'
          : Platform.OS === 'web'
            ? 'Entre com seu e-mail e senha para continuar.'
            : 'Use seu e-mail e senha para continuar.'}
      </Text>

      {showAnySocial ? (
        <>
          {showGoogle ? (
            <Pressable
              style={({ pressed }) => [
                styles.googleBtn,
                (googleBusy || pressed) && styles.pressed,
                googleBusy && styles.primaryBusy,
              ]}
              onPress={() => void onGoogle()}
              disabled={googleBusy || busy}
              accessibilityRole="button"
              accessibilityLabel="Continuar com Google"
            >
              {googleBusy ? (
                <ActivityIndicator color={COLORS.text} />
              ) : (
                <View style={styles.googleBtnInner}>
                  <Image
                    source={{ uri: GOOGLE_G_LOGO_URI }}
                    style={styles.googleMark}
                    contentFit="contain"
                    accessibilityIgnoresInvertColors
                  />
                  <Text style={styles.googleBtnText}>Continuar com Google</Text>
                </View>
              )}
            </Pressable>
          ) : null}
          {showApple ? (
            <Pressable
              style={({ pressed }) => [
                styles.appleBtn,
                (appleBusy || pressed) && styles.pressed,
                appleBusy && styles.primaryBusy,
              ]}
              onPress={() => void onApple()}
              disabled={appleBusy || busy || googleBusy}
              accessibilityRole="button"
              accessibilityLabel="Continuar com Apple"
            >
              {appleBusy ? (
                <ActivityIndicator color={COLORS.text} />
              ) : (
                <Text style={styles.appleBtnText}>Continuar com Apple</Text>
              )}
            </Pressable>
          ) : null}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>ou com e-mail</Text>
            <View style={styles.dividerLine} />
          </View>
        </>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.label}>E-mail</Text>
        <TextInput
          style={styles.input}
          placeholder="voce@email.com"
          placeholderTextColor={COLORS.muted}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={[styles.label, styles.labelSpaced]}>Senha</Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={[styles.input, styles.inputFlex]}
            placeholder="••••••••"
            placeholderTextColor={COLORS.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={secure}
          />
          <Pressable
            onPress={() => setSecure((s) => !s)}
            style={({ pressed }) => [styles.eye, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={secure ? 'Mostrar senha' : 'Ocultar senha'}
          >
            <Text style={styles.eyeTxt}>{secure ? 'Ver' : 'Ocultar'}</Text>
          </Pressable>
        </View>

        <Pressable style={styles.forgotWrap} accessibilityRole="button">
          <Text style={styles.forgot}>Esqueceu a senha?</Text>
        </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.primary,
                (busy || pressed) && styles.pressed,
                busy && styles.primaryBusy,
              ]}
              onPress={() => void submit()}
              disabled={busy || googleBusy || appleBusy}
              accessibilityRole="button"
              accessibilityState={{ busy }}
            >
              {busy ? (
                <ActivityIndicator color={COLORS.accentText} />
              ) : (
                <Text style={styles.primaryTxt}>Entrar</Text>
              )}
            </Pressable>
      </View>

      <Pressable
        onPress={onGoRegister}
        style={({ pressed }) => [styles.registerLinkWrap, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Criar conta"
      >
        <Text style={styles.registerLink}>
          É novo? <Text style={styles.registerLinkBold}>Criar conta</Text>
        </Text>
      </Pressable>

      <Text style={styles.credit}>Foto: estúdio (Unsplash)</Text>
    </>
  );

  if (webAuthSplit) {
    return (
      <KeyboardAvoidingView style={[styles.root, styles.rootWebSplit]} behavior={undefined}>
        <View style={[styles.webSplitRow, { minHeight: height }]}>
          <View style={styles.webHeroCol}>{heroVisual}</View>
          <ScrollView
            style={styles.webFormCol}
            contentContainerStyle={[
              styles.webFormScrollContent,
              { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 28, paddingHorizontal: horizontalPad },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            bounces={false}
          >
            {formBody}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View
          style={[
            styles.heroWrap,
            Platform.OS === 'web' ? { width: '100%', height: heroHeight } : { width, height: heroHeight },
          ]}
        >
          {heroVisual}
        </View>

        <View
          style={[
            styles.sheet,
            {
              marginTop: -26,
              paddingHorizontal: horizontalPad,
              paddingTop: 28,
              paddingBottom: insets.bottom + 28,
            },
          ]}
        >
          {formBody}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  rootWebSplit: {
    flex: 1,
    width: '100%',
  },
  webSplitRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
  },
  webHeroCol: {
    flex: 1,
    minWidth: 280,
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  webFormCol: {
    width: 400,
    flexShrink: 0,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(10, 11, 20, 0.86)',
    ...Platform.select({
      web: {
        maxWidth: '40%',
      },
      default: {},
    }),
  },
  webFormScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 1,
  },
  heroWrap: {
    alignSelf: 'center',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'space-between',
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6, 8, 20, 0.56)',
    zIndex: 0,
  },
  heroTop: {
    zIndex: 2,
  },
  heroBottom: {
    zIndex: 2,
  },
  googleBtn: {
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 15,
    paddingHorizontal: 18,
  },
  appleBtn: {
    marginBottom: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111111',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingVertical: 15,
    paddingHorizontal: 18,
  },
  appleBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  googleBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  googleMark: {
    width: 22,
    height: 22,
  },
  googleBtnText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
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
  registerLinkWrap: {
    marginTop: 20,
    paddingVertical: 8,
    alignItems: 'center',
  },
  registerLink: {
    color: COLORS.muted,
    fontSize: 15,
    textAlign: 'center',
  },
  registerLinkBold: {
    color: COLORS.accent,
    fontWeight: '800',
  },
  kicker: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.4,
    marginBottom: 10,
  },
  heroTitle: {
    color: '#fafafa',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 38,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  heroSub: {
    marginTop: 10,
    color: 'rgba(250,250,250,0.82)',
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 340,
  },
  sheet: {
    flex: 1,
    backgroundColor: 'rgba(10, 11, 20, 0.92)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.08)',
    minHeight: 400,
    ...Platform.select({
      web: {
        boxShadow: '0 -12px 40px rgba(0,0,0,0.42)',
        backdropFilter: 'blur(8px)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
        elevation: 12,
      },
    }),
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: 22,
    opacity: 0.85,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  sheetSub: {
    marginTop: 8,
    fontSize: 15,
    color: COLORS.muted,
    lineHeight: 22,
    marginBottom: 22,
  },
  card: {
    backgroundColor: 'rgba(26, 34, 54, 0.9)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 22,
    ...Platform.select({
      web: {
        boxShadow: '0 12px 28px rgba(0,0,0,0.28)',
      },
      default: {},
    }),
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
    marginTop: 10,
    backgroundColor: 'rgba(8, 11, 22, 0.74)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: Platform.select({ ios: 15, default: 13 }),
    fontSize: 16,
    color: COLORS.text,
    minHeight: 52,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  inputFlex: { flex: 1, marginTop: 0 },
  eye: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(18, 22, 38, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  eyeTxt: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  forgotWrap: { alignSelf: 'flex-end', marginTop: 14, paddingVertical: 4 },
  forgot: { color: COLORS.accent, fontSize: 14, fontWeight: '700' },
  primary: {
    marginTop: 22,
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 8px 24px rgba(255, 190, 152, 0.28)',
      },
      default: {
        shadowColor: COLORS.accent,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.28,
        shadowRadius: 12,
        elevation: 6,
      },
    }),
  },
  primaryBusy: { opacity: 0.85 },
  primaryTxt: { color: COLORS.accentText, fontSize: 17, fontWeight: '800', letterSpacing: 0.2 },
  credit: {
    marginTop: 24,
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.muted,
    opacity: 0.75,
  },
  pressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
});
