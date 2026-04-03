import { View, Text, Pressable, StyleSheet } from 'react-native';
import {
  getCalendarWeeks,
  toDateKey,
  compareDateKeys,
  WEEKDAY_LABELS_SHORT,
  MONTH_LABELS,
  addMonths,
} from '../lib/dates';
import { COLORS } from '../theme';

type Props = {
  viewYear: number;
  viewMonth: number;
  onChangeView: (year: number, month: number) => void;
  selectedDateKey: string;
  onSelectDate: (date: Date) => void;
  minDateKey: string;
  maxDateKey: string;
  /** Dias com pelo menos um horário ocupado/bloqueado (ponto no calendário). */
  markedDateKeys?: Set<string>;
  /** Destaca o dia de hoje (contorno). */
  todayDateKey?: string;
  /** Mostra legenda dos pontos abaixo do mês. */
  showLegend?: boolean;
  /** Instrução curta acima do mês (opcional). */
  instructionText?: string | null;
};

export function MonthCalendar({
  viewYear,
  viewMonth,
  onChangeView,
  selectedDateKey,
  onSelectDate,
  minDateKey,
  maxDateKey,
  markedDateKeys,
  todayDateKey,
  showLegend = true,
  instructionText,
}: Props) {
  const weeks = getCalendarWeeks(viewYear, viewMonth);
  const title = `${MONTH_LABELS[viewMonth]} ${viewYear}`;

  const prev = addMonths(viewYear, viewMonth, -1);
  const next = addMonths(viewYear, viewMonth, 1);
  /** Último dia do mês anterior ainda pode ser ≥ min. */
  const lastPrevMonth = toDateKey(new Date(viewYear, viewMonth, 0));
  /** Primeiro dia do mês seguinte ainda pode ser ≤ max. */
  const firstNextMonth = toDateKey(new Date(viewYear, viewMonth + 1, 1));

  const canPrev = compareDateKeys(lastPrevMonth, minDateKey) >= 0;
  const canNext = compareDateKeys(firstNextMonth, maxDateKey) <= 0;

  return (
    <View style={styles.wrap}>
      {instructionText ? <Text style={styles.hint}>{instructionText}</Text> : null}
      <View style={styles.header}>
        <Pressable
          onPress={() => canPrev && onChangeView(prev.year, prev.month)}
          style={[styles.navBtn, !canPrev && styles.navBtnOff]}
          disabled={!canPrev}
          accessibilityRole="button"
          accessibilityLabel="Mês anterior"
        >
          <Text style={styles.navBtnText}>‹</Text>
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <Pressable
          onPress={() => canNext && onChangeView(next.year, next.month)}
          style={[styles.navBtn, !canNext && styles.navBtnOff]}
          disabled={!canNext}
          accessibilityRole="button"
          accessibilityLabel="Próximo mês"
        >
          <Text style={styles.navBtnText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAY_LABELS_SHORT.map((w) => (
          <Text key={w} style={styles.weekday}>
            {w}
          </Text>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((cell, ci) => {
            if (!cell) {
              return <View key={`e-${ci}`} style={styles.cell} />;
            }
            const key = toDateKey(cell);
            const outOfRange = compareDateKeys(key, minDateKey) < 0 || compareDateKeys(key, maxDateKey) > 0;
            const selected = key === selectedDateKey;
            const marked = markedDateKeys?.has(key);
            const isToday = todayDateKey !== undefined && key === todayDateKey && !selected;
            return (
              <Pressable
                key={key}
                onPress={() => !outOfRange && onSelectDate(cell)}
                disabled={outOfRange}
                style={[
                  styles.cell,
                  styles.cellBtn,
                  outOfRange && styles.cellDisabled,
                  isToday && styles.cellToday,
                  selected && styles.cellSelected,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: outOfRange }}
                accessibilityLabel={`Dia ${cell.getDate()}`}
              >
                <Text style={[styles.cellNum, outOfRange && styles.cellNumDisabled, selected && styles.cellNumSelected]}>
                  {cell.getDate()}
                </Text>
                {marked ? <View style={styles.dot} /> : <View style={styles.dotPlaceholder} />}
              </Pressable>
            );
          })}
        </View>
      ))}
      {showLegend ? (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.legendDotBusy]} />
            <Text style={styles.legendText}>Dia com horário indisponível</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendRing, { borderColor: COLORS.accent }]} />
            <Text style={styles.legendText}>Dia selecionado</Text>
          </View>
          {todayDateKey ? (
            <View style={styles.legendItem}>
              <View style={[styles.legendRing, { borderColor: COLORS.muted }]} />
              <Text style={styles.legendText}>Hoje</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
  },
  hint: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.muted,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  navBtnOff: { opacity: 0.35 },
  navBtnText: { fontSize: 22, fontWeight: '700', color: COLORS.accent, marginTop: -2 },
  weekRow: { flexDirection: 'row' },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.muted,
    paddingVertical: 6,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  cellBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cellDisabled: { opacity: 0.28 },
  cellToday: {
    borderColor: COLORS.muted,
    borderWidth: 2,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  cellSelected: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(255, 190, 152, 0.15)',
    borderStyle: 'solid',
    borderWidth: 2,
  },
  cellNum: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  cellNumDisabled: { color: COLORS.muted },
  cellNumSelected: { color: COLORS.accent },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: COLORS.success,
    marginTop: 2,
  },
  dotPlaceholder: { height: 7, marginTop: 2 },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    justifyContent: 'center',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendDotBusy: { backgroundColor: COLORS.success },
  legendRing: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  legendText: { fontSize: 11, fontWeight: '600', color: COLORS.muted },
});
