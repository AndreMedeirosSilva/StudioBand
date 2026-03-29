import { useState, useCallback, useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform, Linking } from 'react-native';
import { WelcomeScreen } from '../screens/WelcomeScreen';
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
  type OwnerStudioState,
} from '../data/studioCatalog';
import {
  loadPersistedSession,
  savePersistedSession,
  clearPersistedSession,
  type UserProfile,
} from '../storage/persistSession';
import { hydrateProfileFromSupabase } from '../lib/supabase/sessionHydration';
import { signOutSupabaseIfNeeded } from '../lib/supabase/remoteRegistry';
import { COLORS } from '../theme';

export type { UserProfile };

export type Screen =
  | 'welcome'
  | 'auth'
  | 'register'
  | 'home'
  | 'booking'
  | 'studioAgenda';

const SCREENS: Screen[] = ['welcome', 'auth', 'register', 'home', 'booking', 'studioAgenda'];

const initialProfile: UserProfile = {
  userId: '',
  email: '',
  displayName: null,
  bandName: null,
  bandIds: [],
  ownedBandId: null,
  studioName: null,
  ownerStudioId: null,
};

function normalizeScreen(raw: string): Screen {
  return SCREENS.includes(raw as Screen) ? (raw as Screen) : 'auth';
}

function applyOwnerStudioForProfile(
  profile: UserProfile,
  setOwnerStudio: (o: OwnerStudioState | ((p: OwnerStudioState) => OwnerStudioState)) => void,
) {
  if (profile.ownerStudioId) {
    const rooms = defaultOwnerRooms(profile.ownerStudioId);
    setOwnerStudio({
      pricePerHour: 90,
      logoUri: DEMO_OWNER_LOGO_URI,
      rooms,
      blockedRangesByRoomDate: makeDemoBlockedRanges(rooms),
      bookings: makeDemoBookings(profile.ownerStudioId, rooms),
    });
  } else {
    setOwnerStudio(emptyOwnerStudioState());
  }
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
          applyOwnerStudioForProfile(remoteProfile, setOwnerStudio);
          const screenToUse =
            saved?.profile.userId === remoteProfile.userId ? normalizeScreen(saved.screen) : 'home';
          setScreen(screenToUse);
        } else if (!cancelled && saved) {
          setProfile(saved.profile);
          setOwnerStudio(saved.ownerStudio);
          setScreen(normalizeScreen(saved.screen));
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

  useEffect(() => {
    if (!hydrated || skipSaveRef.current) return;
    void savePersistedSession({ profile, ownerStudio, screen });
  }, [hydrated, profile, ownerStudio, screen]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const titles: Record<Screen, string> = {
      welcome: 'Início',
      auth: 'Entrar',
      register: 'Cadastro',
      home: 'Painel',
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
    setProfile(next);
    applyOwnerStudioForProfile(next, setOwnerStudio);
    setScreen('home');
  }, []);

  const handleRegister = useCallback((next: UserProfile) => {
    setProfile(next);
    applyOwnerStudioForProfile(next, setOwnerStudio);
    setScreen('home');
  }, []);

  const handleProfileUpdate = useCallback((next: UserProfile) => {
    setProfile(next);
    applyOwnerStudioForProfile(next, setOwnerStudio);
  }, []);

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
    case 'welcome':
      return (
        <WelcomeScreen
          onLogin={go('auth')}
          onRegister={go('register')}
          onBookDemo={go('booking')}
        />
      );
    case 'auth':
      return <AuthScreen onBack={go('welcome')} onSuccess={handleLogin} />;
    case 'register':
      return <RegisterScreen onBack={go('welcome')} onComplete={handleRegister} />;
    case 'home':
      return (
        <HomeScreen
          profile={profile}
          onBook={go('booking')}
          onStudioAgenda={go('studioAgenda')}
          onLogout={handleLogout}
          joinCodePrefill={joinCodePrefill}
          onConsumeJoinPrefill={consumeJoinPrefill}
          onProfileUpdate={handleProfileUpdate}
        />
      );
    case 'studioAgenda':
      return (
        <StudioAgendaScreen
          profile={profile}
          onBack={go('home')}
          ownerStudio={ownerStudio}
          setOwnerStudio={setOwnerStudio}
        />
      );
    case 'booking':
      return (
        <BookingScreen
          profile={profile}
          ownerStudio={ownerStudio}
          onBack={profile.email ? go('home') : go('welcome')}
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
