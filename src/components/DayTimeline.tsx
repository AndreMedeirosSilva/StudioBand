import { View, Text, StyleSheet } from 'react-native';
import {
  SCHEDULE_START_MIN,
  SCHEDULE_END_MAX_MIN,
  SCHEDULE_STEP_MIN,
  TIMELINE_ROW_PX,
  minToLabel,
  pxForRange,
  totalTimelineHeightPx,
} from '../lib/schedule';
import { COLORS } from '../theme';
import type { TimelineSegment } from '../data/studioCatalog';
import type { MinuteRange } from '../lib/schedule';

type Props = {
  segments: TimelineSegment[];
  /** Pré-visualização do intervalo que o utilizador está a escolher. */
  previewRange?: MinuteRange | null;
};

export function DayTimeline({ segments, previewRange }: Props) {
  const H = totalTimelineHeightPx();
  const steps = Math.round((SCHEDULE_END_MAX_MIN - SCHEDULE_START_MIN) / SCHEDULE_STEP_MIN);

  const rows = Array.from({ length: steps }, (_, i) => {
    const m = SCHEDULE_START_MIN + i * SCHEDULE_STEP_MIN;
    const showLabel = m % 60 === 0;
    return { m, showLabel, key: m };
  });

  return (
    <View style={styles.wrap}>
      <Text style={styles.caption}>Linha do dia (ocupado / indisponível)</Text>
      <View style={styles.row}>
        <View style={[styles.labelsCol, { height: H }]}>
          {rows.map(({ m, showLabel, key }) => (
            <View key={key} style={{ height: TIMELINE_ROW_PX, justifyContent: 'flex-start' }}>
              {showLabel ? <Text style={styles.hourLabel}>{minToLabel(m)}</Text> : null}
            </View>
          ))}
        </View>
        <View style={[styles.track, { height: H }]}>
          {rows.map(({ key }) => (
            <View key={`g-${key}`} style={[styles.gridLine, { height: TIMELINE_ROW_PX }]} />
          ))}
          {/* Pré-visualização primeiro: reservas/bloqueios ficam por cima se houver cruzamento. */}
          {previewRange && previewRange.endMin > previewRange.startMin
            ? (() => {
                const ph = pxForRange(previewRange.startMin, previewRange.endMin, TIMELINE_ROW_PX);
                return (
                  <View
                    style={[styles.segment, styles.segPreview, styles.segZBelow, { top: ph.top, height: ph.height }]}
                  >
                    <Text style={styles.segPreviewText} numberOfLines={1}>
                      {minToLabel(previewRange.startMin)} – {minToLabel(previewRange.endMin)}
                    </Text>
                  </View>
                );
              })()
            : null}
          {segments.map((s, i) => {
            const { top, height } = pxForRange(s.startMin, s.endMin, TIMELINE_ROW_PX);
            const isBooked = s.kind === 'booked';
            return (
              <View
                key={`seg-${i}-${s.startMin}`}
                style={[
                  styles.segment,
                  styles.segZAbove,
                  { top, height },
                  isBooked ? styles.segBooked : styles.segBlocked,
                ]}
              >
                <Text style={styles.segTime} numberOfLines={1}>
                  {minToLabel(s.startMin)} – {minToLabel(s.endMin)}
                </Text>
                {s.label ? (
                  <Text style={styles.segLabel} numberOfLines={1}>
                    {s.label}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>
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
    marginBottom: 12,
  },
  caption: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  row: { flexDirection: 'row' },
  labelsCol: { width: 48, marginRight: 4 },
  hourLabel: { fontSize: 11, fontWeight: '700', color: COLORS.muted, marginTop: -2 },
  track: {
    flex: 1,
    position: 'relative',
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    backgroundColor: COLORS.bg,
    borderRadius: 10,
    overflow: 'hidden',
  },
  gridLine: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  segment: {
    position: 'absolute',
    left: 4,
    right: 4,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
    justifyContent: 'center',
  },
  segZBelow: { zIndex: 1 },
  segZAbove: { zIndex: 2 },
  segBooked: {
    backgroundColor: 'rgba(52, 211, 153, 0.35)',
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  segBlocked: {
    backgroundColor: 'rgba(248, 113, 113, 0.3)',
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  segPreview: {
    backgroundColor: 'rgba(245, 158, 11, 0.22)',
    borderWidth: 2,
    borderColor: COLORS.accent,
  },
  segTime: { fontSize: 11, fontWeight: '800', color: COLORS.text },
  segLabel: { fontSize: 10, fontWeight: '600', color: COLORS.muted, marginTop: 2 },
  segPreviewText: { fontSize: 11, fontWeight: '800', color: COLORS.accent },
});
