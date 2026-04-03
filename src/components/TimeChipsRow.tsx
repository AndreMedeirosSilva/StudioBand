import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { minToLabel } from '../lib/schedule';
import { COLORS } from '../theme';

type Props = {
  label: string;
  options: number[];
  value: number;
  onChange: (min: number) => void;
};

export function TimeChipsRow({ label, options, value, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {options.map((m) => (
          <Pressable
            key={m}
            onPress={() => onChange(m)}
            style={[styles.chip, value === m && styles.chipOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: value === m }}
          >
            <Text style={[styles.chipText, value === m && styles.chipTextOn]}>{minToLabel(m)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  row: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgElevated,
  },
  chipOn: { borderColor: COLORS.accent, backgroundColor: 'rgba(255, 190, 152, 0.15)' },
  chipText: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  chipTextOn: { color: COLORS.accent },
});
