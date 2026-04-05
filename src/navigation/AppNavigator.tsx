import { useState, useCallback, useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform, Linking } from 'react-native';
import { AuthScreen } from '../screens/AuthScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { BookingScreen } from '../screens/BookingScreen';
import { StudioAgendaScreen } from '../screens/StudioAgendaScreen';
import {
  emptyOwnerStudioState,
  makeDemoBookings,
  makeDemoBlockedRanges,
  defaultOwnerRooms,
  DEMO_OWNER_LOGO_URI,
  normalizeOwnerStudioState,
  type OwnerStudioState,
  type StudioRoom,
} from '../data/studioCatalog';
import {
  loadPersistedSession,
  savePersistedSession,
  clearPersistedSession,
  type UserProfile,
} from '../storage/persistSession';
import { hydrateProfileFromSupabase } from '../lib/supabase/sessionHydration';
import { signOutSupabaseIfNeeded, buildPersistedProfileForUser } from '../lib/supabase/remoteRegistry';
import { isSupabaseConfigured } from '../lib/supabase/config';
import { getSupabase } from '../lib/supabase/client';
import { COLORS } from '../theme';

export type { UserProfile };

export type Screen = 'auth' | 'register' | 'home' | 'bands' | 'studios' | 'booking' | 'studioAgenda';

const SCREENS: Screen[] = ['auth', 'register', 'home', 'bands', 'studios', 'booking', 'studioAgenda'];

const initialProfile: UserProfile = {
  userId: '',
  email: '',
  displayName: null,
  bandName: null,
  bandIds: [],
  ownedBandId: null,
  ownedBandName: null,
  ownedInviteToken: null,
  studioName: null,
  ownerStudioId: null,
};

function normalizeScreen(raw: string): Screen {
  if (raw === 'welcome') return 'auth';
  return SCREENS.includes(raw as Screen) ? (raw as Screen) : 'auth';
}

function ownerStudioStateForProfile(profile: UserProfile): OwnerStudioState {
  if (!profile.ownerStudioId) return emptyOwnerStudioState();
  const rooms = defaultOwnerRooms(profile.ownerStudioId);
  return normalizeOwnerStudioState({
    pricePerHour: 90,
    addressLine: '',
    logoUri: DEMO_OWNER_LOGO_URI,
    rooms,
    blockedRangesByRoomDate: makeDemoBlockedRanges(rooms),
    bookings: makeDemoBookings(profile.ownerStudioId, rooms),
  });
}

function applyOwnerStudioForProfile(
  profile: UserProfile,
  setOwnerStudio: (o: OwnerStudioState | ((p: OwnerStudioState) => OwnerStudioState)) => void,
) {
  setOwnerStudio(ownerStudioStateForProfile(profile));
}

function readJoinTokenFromUrl(href: string): string | null {
  try {
    const u = new URL(href);
    const q = u.searchParams.get('join');
    if (q) return q;
    const path = u.pathname.replace(/\/$/, '');
    const parts = path.split('/');
    const idx = parts.indexOf('join');
    if (idx >= 0 && parts[idx + 1]) return decodeURIComponent(parts[idx + 1]);
  } catch {
    /* ignore */
  }
  return null;
}

export function AppNavigator() {
  const [hydrated, setHydrated] = useState(false);
  const skipSaveRef = useRef(true);
  /** Código vindo de `?join=` — só aparece no painel depois de logado (pré-preenche o campo). */
  const [joinCodePrefill, setJoinCodePrefill] = useState<string | null>(null);

  const [screen, setScreen] = useState<Screen>('auth');
  const [profile, setProfile] = useState<UserProfile>(initialProfile);
  const [ownerStudio, setOwnerStudio] = useState<OwnerStudioState>(emptyOwnerStudioState);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const t = readJoinTokenFromUrl(window.location.href);
      if (t) setJoinCodePrefill(t);
      return;
    }
    void Linking.getInitialURL().then((url) => {
      if (!url) return;
      const t = readJoinTokenFromUrl(url);
      if (t) setJoinCodePrefill(t);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remoteProfile = await hydrateProfileFromSupabase();
        const saved = await loadPersistedSession();
        if (!cancelled && remoteProfile) {
          setProfile(remoteProfile);
          if (
            saved?.profile.userId === remoteProfile.userId &&
            saved.profile.ownerStudioId === remoteProfile.ownerStudioId &&
            remoteProfile.ownerStudioId
          ) {
            setOwnerStudio(normalizeOwnerStudioState(saved.ownerStudio));
          } else {
            applyOwnerStudioForProfile(remoteProfile, setOwnerStudio);
          }
          const screenToUse =
            saved?.profile.userId === remoteProfile.userId ? normalizeScreen(saved.screen) : 'home';
          setScreen(screenToUse);
        } else if (!cancelled && saved) {
          /** Com Supabase, só entramos “logados” se existir sessão JWT; senão o JSON local ficava a abrir o painel à toa. */
          if (isSupabaseConfigured()) {
            setProfile(initialProfile);
            setOwnerStudio(emptyOwnerStudioState());
            setScreen('auth');
            void clearPersistedSession();
          } else {
            setProfile(saved.profile);
            setOwnerStudio(saved.ownerStudio);
            setScreen(normalizeScreen(saved.screen));
          }
        } else if (!cancelled) {
          setScreen('auth');
        }
      } finally {
        if (!cancelled) {
          skipSaveRef.current = false;
          setHydrated(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Após OAuth na web, o Supabase pode atualizar a sessão sem recarregar o ecrã de login. */
  useEffect(() => {
    if (!hydrated || !isSupabaseConfigured()) return;
    const sb = getSupabase();
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED') return;
      if (event === 'SIGNED_OUT' || !session?.user) {
        if (event === 'SIGNED_OUT') {
          setProfile(initialProfile);
          setOwnerStudio(emptyOwnerStudioState());
          setScreen('auth');
        }
        return;
      }
      if (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') return;
      try {
        const p = await buildPersistedProfileForUser(session.user);
        if (!p) return;
        setProfile(p);
        applyOwnerStudioForProfile(p, setOwnerStudio);
        setScreen((prev) => (prev === 'auth' || prev === 'register' ? 'home' : prev));
      } catch {
        /* evita estado inconsistente se a rede falhar a meio */
      }
    });
    return () => subscription.unsubscribe();
  }, [hydrated]);

  /**
   * Web: após o Google devolver tokens no URL, a sessão pode ficar pronta uns ms depois da hidratação.
   * Isto evita ficar preso no ecrã de login até “entrar” de novo.
   */
  useEffect(() => {
    if (!hydrated || !isSupabaseConfigured()) return;
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const hasOAuthFragment =
      window.location.hash.includes('access_token') ||
      window.location.hash.includes('refresh_token') ||
      window.location.hash.includes('code=') ||
      window.location.search.includes('code=');

    const finishOAuthSession = async () => {
      const sb = getSupabase();
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (!session?.user) return;
      const p = await buildPersistedProfileForUser(session.user);
      if (!p) return;
      setProfile(p);
      applyOwnerStudioForProfile(p, setOwnerStudio);
      setScreen((prev) => (prev === 'auth' || prev === 'register' ? 'home' : prev));
      if (hasOAuthFragment) {
        const path = window.location.pathname || '/';
        window.history.replaceState({}, '', path);
      }
    };

    void finishOAuthSession();

    if (!hasOAuthFragment) return;

    const id = window.setInterval(() => void finishOAuthSession(), 150);
    const stop = window.setTimeout(() => window.clearInterval(id), 4000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(stop);
    };
  }, [hydrated]);

  /** Áreas autenticadas: sem sessão volta ao login. */
  useEffect(() => {
    if (!hydrated) return;
    const loggedIn = Boolean(profile.userId);
    const gated: Screen[] = ['home', 'bands', 'studios', 'booking', 'studioAgenda'];
    if (!loggedIn && gated.includes(screen)) {
      setScreen('auth');
    }
  }, [hydrated, profile.userId, screen]);

  useEffect(() => {
    if (!hydrated || skipSaveRef.current) return;
    void savePersistedSession({ profile, ownerStudio, screen });
  }, [hydrated, profile, ownerStudio, screen]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const titles: Record<Screen, string> = {
      auth: 'Entrar',
      register: 'Cadastro',
      home: 'Painel',
      bands: 'Bandas',
      studios: 'Estúdios',
      booking: 'Marcar ensaio',
      studioAgenda: 'Agenda do estúdio',
    };
    document.title = `${titles[screen]} · Estudio Banda`;
  }, [screen]);

  const go = useCallback((s: Screen) => () => setScreen(s), []);

  const stripJoinFromWebUrl = useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const path = window.location.pathname || '/';
      window.history.replaceState({}, '', path);
    }
  }, []);

  const consumeJoinPrefill = useCallback(() => {
    setJoinCodePrefill(null);
    stripJoinFromWebUrl();
  }, [stripJoinFromWebUrl]);

  const handleLogin = useCallback((next: UserProfile) => {
    const studio = ownerStudioStateForProfile(next);
    setProfile(next);
    setOwnerStudio(studio);
    setScreen('home');
    void savePersistedSession({ profile: next, ownerStudio: studio, screen: 'home' });
  }, []);

  const handleRegister = useCallback((next: UserProfile) => {
    const studio = ownerStudioStateForProfile(next);
    setProfile(next);
    setOwnerStudio(studio);
    setScreen('home');
    void savePersistedSession({ profile: next, ownerStudio: studio, screen: 'home' });
  }, []);

  const handleProfileUpdate = useCallback((next: UserProfile) => {
    setProfile(next);
    setOwnerStudio((prev) => {
      const studio =
        next.ownerStudioId !== profile.ownerStudioId
          ? ownerStudioStateForProfile(next)
          : normalizeOwnerStudioState(prev);
      void savePersistedSession({ profile: next, ownerStudio: studio, screen });
      return studio;
    });
  }, [profile.ownerStudioId, screen]);

  const handleUpsertStudio = useCallback(
    (input: { studioName: string; addressLine: string; photoUrl: string | null; rooms: StudioRoom[] }) => {
      const trimmedName = input.studioName.trim();
      const studioName = trimmedName || 'Meu estúdio';
      const studioId =
        profile.ownerStudioId ??
        `studio_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const nextProfile: UserProfile = {
        ...profile,
        studioName,
        ownerStudioId: studioId,
      };
      const baseOwner = profile.ownerStudioId
        ? ownerStudio
        : ownerStudioStateForProfile({ ...profile, studioName, ownerStudioId: studioId });
      const nextOwner = normalizeOwnerStudioState({
        ...baseOwner,
        addressLine: input.addressLine.trim(),
        logoUri: input.photoUrl,
        rooms: input.rooms.length > 0 ? input.rooms : baseOwner.rooms,
      });
      setProfile(nextProfile);
      setOwnerStudio(nextOwner);
      void savePersistedSession({ profile: nextProfile, ownerStudio: nextOwner, screen });
    },
    [ownerStudio, profile, screen],
  );

  const handleLogout = useCallback(() => {
    setProfile(initialProfile);
    setOwnerStudio(emptyOwnerStudioState());
    setScreen('auth');
    void signOutSupabaseIfNeeded();
    void clearPersistedSession();
  }, []);

  if (!hydrated) {
    return (
      <View style={styles.hydrate}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  switch (screen) {
    case 'auth':
      return <AuthScreen onGoRegister={go('register')} onSuccess={handleLogin} />;
    case 'register':
      return <RegisterScreen onBack={go('auth')} onComplete={handleRegister} />;
    case 'home':
      return (
        <HomeScreen
          profile={profile}
          ownerStudio={ownerStudio}
          onBook={go('booking')}
          onStudioAgenda={go('studioAgenda')}
          onLogout={handleLogout}
          joinCodePrefill={joinCodePrefill}
          onConsumeJoinPrefill={consumeJoinPrefill}
          onProfileUpdate={handleProfileUpdate}
          onUpsertStudio={handleUpsertStudio}
          mode="home"
          onGoBands={go('bands')}
          onGoStudios={go('studios')}
        />
      );
    case 'bands':
      return (
        <HomeScreen
          profile={profile}
          ownerStudio={ownerStudio}
          onBook={go('booking')}
          onStudioAgenda={go('studioAgenda')}
          onLogout={handleLogout}
          onProfileUpdate={handleProfileUpdate}
          onUpsertStudio={handleUpsertStudio}
          mode="bandas"
          onBackHome={go('home')}
        />
      );
    case 'studios':
      return (
        <HomeScreen
          profile={profile}
          ownerStudio={ownerStudio}
          onBook={go('booking')}
          onStudioAgenda={go('studioAgenda')}
          onLogout={handleLogout}
          onProfileUpdate={handleProfileUpdate}
          onUpsertStudio={handleUpsertStudio}
          mode="estudios"
          onBackHome={go('home')}
        />
      );
    case 'studioAgenda':
      return (
        <StudioAgendaScreen
          profile={profile}
          onBack={go('home')}
          onLogout={handleLogout}
          ownerStudio={ownerStudio}
          setOwnerStudio={setOwnerStudio}
          onProfileUpdate={handleProfileUpdate}
          onUpsertStudio={handleUpsertStudio}
        />
      );
    case 'booking':
      return (
        <BookingScreen
          profile={profile}
          ownerStudio={ownerStudio}
          onBack={profile.userId ? go('home') : go('auth')}
          onLogout={handleLogout}
        />
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  hydrate: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
