import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../theme';

export type BookingFlowStep = 'studio' | 'rooms' | 'schedule';

const STEPS: { key: BookingFlowStep; label: string }[] = [
  { key: 'studio', label: 'Estúdio' },
  { key: 'rooms', label: 'Sala' },
  { key: 'schedule', label: 'Data' },
];

type Props = {
  current: BookingFlowStep;
};

function stepIndex(s: BookingFlowStep): number {
  return STEPS.findIndex((x) => x.key === s);
}

export function BookingFlowProgress({ current }: Props) {
  const active = stepIndex(current);

  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <View style={styles.track}>
        {STEPS.map((step, i) => {
          const done = i < active;
          const on = i === active;
          return (
            <View key={step.key} style={styles.trackItem}>
              <View
                style={[
                  styles.node,
                  done && styles.nodeDone,
                  on && styles.nodeActive,
                  !done && !on && styles.nodeTodo,
                ]}
              >
                {done ? (
                  <Text style={styles.nodeCheck}>✓</Text>
                ) : (
                  <Text style={[styles.nodeNum, on && styles.nodeNumActive]}>{i + 1}</Text>
                )}
              </View>
              {i < STEPS.length - 1 ? (
                <View style={[styles.connector, i < active ? styles.connectorDone : styles.connectorTodo]} />
              ) : null}
            </View>
          );
        })}
      </View>
      <View style={styles.labels}>
        {STEPS.map((step, i) => {
          const done = i < active;
          const on = i === active;
          return (
            <Text
              key={step.key}
              style={[styles.label, on && styles.labelActive, done && styles.labelDone]}
              numberOfLines={1}
            >
              {step.label}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 4,
    backgroundColor: COLORS.bgElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  node: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  nodeTodo: {
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  nodeActive: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(255, 190, 152, 0.22)',
  },
  nodeDone: {
    borderColor: COLORS.success,
    backgroundColor: 'rgba(92, 211, 176, 0.12)',
  },
  nodeNum: { fontSize: 15, fontWeight: '800', color: COLORS.muted },
  nodeNumActive: { color: COLORS.accent },
  nodeCheck: { fontSize: 16, fontWeight: '900', color: COLORS.success },
  connector: {
    width: 36,
    height: 3,
    borderRadius: 2,
    marginHorizontal: 4,
  },
  connectorDone: { backgroundColor: COLORS.success },
  connectorTodo: { backgroundColor: COLORS.border },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingHorizontal: 0,
  },
  label: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.muted,
    textAlign: 'center',
  },
  labelActive: { color: COLORS.accent },
  labelDone: { color: COLORS.success },
});
