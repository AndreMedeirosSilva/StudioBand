import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { COLORS } from '../theme';
import type { UserProfile } from '../navigation/AppNavigator';

type Props = {
  profile: UserProfile;
  onLogout: () => void;
  /**
   * `inlineEnd` — à direita na mesma linha que o título (painel).
   * `overlay` — canto superior direito do ecrã (Marcar ensaio / Agenda).
   */
  placement: 'inlineEnd' | 'overlay';
  top?: number;
  right?: number;
};

function avatarLetter(profile: UserProfile): string {
  const s = (profile.displayName || profile.email || '?').trim();
  const ch = s.charAt(0);
  return ch ? ch.toUpperCase() : '?';
}

export function LoggedInUserBar({ profile, onLogout, placement, top = 8, right = 16 }: Props) {
  const title = profile.displayName?.trim() || profile.email || 'Conta';
  const subtitle = profile.displayName?.trim() ? profile.email : null;

  const row = (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Text style={styles.avatarTxt}>{avatarLetter(profile)}</Text>
      </View>
      <View style={styles.textCol}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.sub} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={onLogout}
        style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Sair"
      >
        <Text style={styles.logoutTxt}>Sair</Text>
      </Pressable>
    </View>
  );

  if (placement === 'overlay') {
    return (
      <View style={[styles.overlayWrap, { top, right }]} accessibilityLabel={`Utilizador: ${title}. Sair`}>
        {row}
      </View>
    );
  }

  return (
    <View style={[styles.inlineWrap, Platform.OS === 'web' && styles.inlineWrapWeb]} accessibilityLabel={`Utilizador: ${title}`}>
      {row}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  overlayWrap: {
    position: 'absolute',
    zIndex: 100,
    maxWidth: 288,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 8,
      },
    }),
  },
  inlineWrap: {
    flexShrink: 0,
    maxWidth: 268,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inlineWrapWeb: {
    maxWidth: '48%' as never,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.accentText,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text,
  },
  sub: {
    marginTop: 1,
    fontSize: 11,
    color: COLORS.muted,
  },
  logout: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  logoutTxt: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.accent,
  },
  pressed: {
    opacity: 0.88,
  },
});
