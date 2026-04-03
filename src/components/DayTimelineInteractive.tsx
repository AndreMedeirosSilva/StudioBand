import { useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, PanResponder } from 'react-native';
import {
  SCHEDULE_START_MIN,
  SCHEDULE_END_MAX_MIN,
  SCHEDULE_STEP_MIN,
  TIMELINE_ROW_PX,
  minToLabel,
  pxForRange,
  totalTimelineHeightPx,
  minuteAtTrackY,
  rangeFromDragEndpoints,
} from '../lib/schedule';
import { COLORS } from '../theme';
import type { TimelineSegment } from '../data/studioCatalog';
import type { MinuteRange } from '../lib/schedule';

type Props = {
  segments: TimelineSegment[];
  previewRange: MinuteRange | null;
  onChangeRange: (r: MinuteRange) => void;
  /** Enquanto arrasta, desativar ScrollView pai para não roubar o gesto. */
  onDragActiveChange?: (active: boolean) => void;
};

export function DayTimelineInteractive({
  segments,
  previewRange,
  onChangeRange,
  onDragActiveChange,
}: Props) {
  const H = totalTimelineHeightPx();
  const steps = Math.round((SCHEDULE_END_MAX_MIN - SCHEDULE_START_MIN) / SCHEDULE_STEP_MIN);
  const [trackH, setTrackH] = useState(0);
  const anchorRef = useRef<number | null>(null);

  const rows = useMemo(
    () =>
      Array.from({ length: steps }, (_, i) => {
        const m = SCHEDULE_START_MIN + i * SCHEDULE_STEP_MIN;
        const showLabel = m % 60 === 0;
        return { m, showLabel, key: m };
      }),
    [steps],
  );

  const setDragging = useCallback(
    (active: boolean) => {
      onDragActiveChange?.(active);
    },
    [onDragActiveChange],
  );

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => trackH > 0,
        onMoveShouldSetPanResponder: () => trackH > 0,
        onPanResponderGrant: (e) => {
          if (trackH <= 0) return;
          setDragging(true);
          const y = e.nativeEvent.locationY;
          const m = minuteAtTrackY(y, trackH);
          anchorRef.current = m;
          onChangeRange(rangeFromDragEndpoints(m, m));
        },
        onPanResponderMove: (e) => {
          if (trackH <= 0) return;
          const y = e.nativeEvent.locationY;
          const m = minuteAtTrackY(y, trackH);
          const a = anchorRef.current ?? m;
          onChangeRange(rangeFromDragEndpoints(a, m));
        },
        onPanResponderRelease: () => {
          anchorRef.current = null;
          setDragging(false);
        },
        onPanResponderTerminate: () => {
          anchorRef.current = null;
          setDragging(false);
        },
      }),
    [trackH, onChangeRange, setDragging],
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.caption}>
        Arraste na faixa para escolher o intervalo (de {SCHEDULE_STEP_MIN} em {SCHEDULE_STEP_MIN} min)
      </Text>
      <View style={styles.row}>
        <View style={[styles.labelsCol, { height: H }]}>
          {rows.map(({ m, showLabel, key }) => (
            <View key={key} style={{ height: TIMELINE_ROW_PX, justifyContent: 'flex-start' }}>
              {showLabel ? <Text style={styles.hourLabel}>{minToLabel(m)}</Text> : null}
            </View>
          ))}
        </View>
        <View
          style={[styles.track, { height: H }]}
          onLayout={(e) => setTrackH(e.nativeEvent.layout.height)}
        >
          {rows.map(({ key }) => (
            <View key={`g-${key}`} style={[styles.gridLine, { height: TIMELINE_ROW_PX }]} />
          ))}
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
                pointerEvents="none"
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
          <View style={styles.touchLayer} {...pan.panHandlers} />
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
  touchLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    backgroundColor: 'transparent',
  },
  segBooked: {
    backgroundColor: 'rgba(92, 211, 176, 0.35)',
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  segBlocked: {
    backgroundColor: 'rgba(255, 122, 155, 0.3)',
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  segPreview: {
    backgroundColor: 'rgba(255, 190, 152, 0.22)',
    borderWidth: 2,
    borderColor: COLORS.accent,
  },
  segTime: { fontSize: 11, fontWeight: '800', color: COLORS.text },
  segLabel: { fontSize: 10, fontWeight: '600', color: COLORS.muted, marginTop: 2 },
  segPreviewText: { fontSize: 11, fontWeight: '800', color: COLORS.accent },
});
