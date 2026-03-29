import { useState, useMemo, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  ScrollView,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MonthCalendar } from '../components/MonthCalendar';
import { DayTimeline } from '../components/DayTimeline';
import { TimeChipsRow } from '../components/TimeChipsRow';
import { StudioLogoBanner, RoomPhotosStrip } from '../components/StudioMedia';
import { COLORS } from '../theme';
import type { UserProfile } from '../navigation/AppNavigator';
import {
  getTimelineSegmentsForDay,
  dayHasOccupiedSlots,
  getBusyRangesForDay,
  removeBlockedRange,
  formatRoomCapacity,
  type OwnerStudioState,
  type BookingStudioRow,
} from '../data/studioCatalog';
import { startOfDay, toDateKey, addDays, compareDateKeys } from '../lib/dates';
import { timeOptionsStart, timeOptionsEndAfter, rangeOverlapsAny, rangeLabel } from '../lib/schedule';
import type { MinuteRange } from '../lib/schedule';

type Props = {
  profile: UserProfile;
  onBack: () => void;
  ownerStudio: OwnerStudioState;
  setOwnerStudio: Dispatch<SetStateAction<OwnerStudioState>>;
};

export function StudioAgendaScreen({ profile, onBack, ownerStudio, setOwnerStudio }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pad = Math.min(24, Math.max(14, width * 0.05));

  const today = useMemo(() => startOfDay(new Date()), []);
  const minDateKey = useMemo(() => toDateKey(today), [today]);
  const maxDateKey = useMemo(() => toDateKey(addDays(today, 90)), [today]);

  const [selectedDate, setSelectedDate] = useState(() => today);
  const [viewYear, setViewYear] = useState(() => today.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => today.getMonth());
  const [priceDraft, setPriceDraft] = useState(String(ownerStudio.pricePerHour));
  const [blockStart, setBlockStart] = useState(12 * 60);
  const [blockEnd, setBlockEnd] = useState(13 * 60 + 30);
  const [roomId, setRoomId] = useState(() => ownerStudio.rooms[0]?.id ?? '');

  const dateKey = toDateKey(selectedDate);

  const mineRow = useMemo<BookingStudioRow>(
    () => ({
      id: profile.ownerStudioId ?? 'local-studio',
      name: profile.studioName ?? '',
      city: '',
      pricePerHour: 0,
      isMine: true,
      logoUri: ownerStudio.logoUri,
    }),
    [profile.ownerStudioId, profile.studioName, ownerStudio.logoUri],
  );

  useEffect(() => {
    setPriceDraft(String(ownerStudio.pricePerHour));
  }, [ownerStudio.pricePerHour, profile.ownerStudioId]);

  useEffect(() => {
    const ids = ownerStudio.rooms.map((r) => r.id);
    if (!ids.includes(roomId)) {
      setRoomId(ids[0] ?? '');
    }
  }, [ownerStudio.rooms, roomId]);

  const segments = useMemo(
    () => (roomId ? getTimelineSegmentsForDay(mineRow, roomId, dateKey, ownerStudio) : []),
    [mineRow, roomId, dateKey, ownerStudio],
  );

  const blockEndOptions = useMemo(() => timeOptionsEndAfter(blockStart), [blockStart]);
  useEffect(() => {
    if (blockEnd <= blockStart || !blockEndOptions.includes(blockEnd)) {
      const n = blockEndOptions[0];
      if (n !== undefined) setBlockEnd(n);
    }
  }, [blockStart, blockEnd, blockEndOptions]);

  const blockPreview: MinuteRange | null =
    blockEnd > blockStart ? { startMin: blockStart, endMin: blockEnd } : null;

  const busyForBlock = useMemo(
    () => (roomId ? getBusyRangesForDay(mineRow, roomId, dateKey, ownerStudio) : []),
    [mineRow, roomId, dateKey, ownerStudio],
  );
  const blockOverlapsBusy =
    blockPreview !== null && rangeOverlapsAny(blockPreview, busyForBlock);

  const markedDateKeys = useMemo(() => {
    const set = new Set<string>();
    const dim = new Date(viewYear, viewMonth + 1, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      const dk = toDateKey(new Date(viewYear, viewMonth, d));
      if (compareDateKeys(dk, minDateKey) < 0 || compareDateKeys(dk, maxDateKey) > 0) continue;
      if (roomId && dayHasOccupiedSlots(mineRow, roomId, dk, ownerStudio)) set.add(dk);
    }
    return set;
  }, [mineRow, roomId, viewYear, viewMonth, ownerStudio, minDateKey, maxDateKey]);

  const bookingsToday = useMemo(
    () => ownerStudio.bookings.filter((b) => b.roomId === roomId && b.dateKey === dateKey),
    [ownerStudio.bookings, roomId, dateKey],
  );

  const blocksToday = roomId ? (ownerStudio.blockedRangesByRoomDate[roomId]?.[dateKey] ?? []) : [];

  const commitPrice = () => {
    const n = parseFloat(priceDraft.replace(',', '.'));
    if (Number.isFinite(n) && n >= 0) {
      setOwnerStudio((s) => ({ ...s, pricePerHour: n }));
    } else {
      setPriceDraft(String(ownerStudio.pricePerHour));
    }
  };

  const addBlock = () => {
    if (!blockPreview) return;
    if (rangeOverlapsAny(blockPreview, busyForBlock)) {
      Alert.alert(
        'Conflito',
        'Este intervalo conflita com uma reserva ou outro bloqueio. Escolha outro horário ou remova o bloqueio existente.',
      );
      return;
    }
    if (!roomId) return;
    setOwnerStudio((s) => {
      const prevRoom = s.blockedRangesByRoomDate[roomId] ?? {};
      const prev = prevRoom[dateKey] ?? [];
      return {
        ...s,
        blockedRangesByRoomDate: {
          ...s.blockedRangesByRoomDate,
          [roomId]: {
            ...prevRoom,
            [dateKey]: [...prev, { startMin: blockPreview.startMin, endMin: blockPreview.endMin }],
          },
        },
      };
    });
  };

  const removeBlock = (r: MinuteRange) => {
    if (!roomId) return;
    setOwnerStudio((s) => ({
      ...s,
      blockedRangesByRoomDate: removeBlockedRange(s.blockedRangesByRoomDate, roomId, dateKey, r),
    }));
  };

  const onBookingPress = (b: (typeof bookingsToday)[0]) => {
    const sala = ownerStudio.rooms.find((r) => r.id === b.roomId);
    const cap = sala ? `\n${formatRoomCapacity(sala.capacityPeople)}` : '';
    Alert.alert(
      'Reserva',
      `${b.bandName}\n${rangeLabel({ startMin: b.startMin, endMin: b.endMin })}${cap}\n${b.status === 'pending' ? 'Pendente' : 'Confirmada'}`,
    );
  };

  const priceHint = Number.parseFloat(priceDraft.replace(',', '.')) || 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={[styles.topBar, { paddingHorizontal: pad }]}>
        <Pressable onPress={onBack} style={({ pressed }) => [styles.back, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={styles.backText}>← Voltar</Text>
        </Pressable>
        <Text style={styles.topTitle}>Agenda do estúdio</Text>
        <View style={{ width: 72 }} />
      </View>

      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: insets.bottom + 28 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <StudioLogoBanner uri={ownerStudio.logoUri} height={128} />

        <View style={styles.studioTitleBlock}>
          <Text style={styles.studioName}>{profile.studioName ?? 'Seu estúdio'}</Text>
          <Text style={styles.sub}>
            Escolha a sala (capacidade em destaque; fotos abaixo). Reservas (verde) e bloqueios (vermelho) são por sala.
          </Text>
        </View>

        <Text style={[styles.section, { marginTop: 4, marginBottom: 8 }]}>Salas</Text>
        {ownerStudio.rooms.length === 0 ? (
          <Text style={[styles.muted, { marginBottom: 14 }]}>Ainda não há salas cadastradas neste estúdio.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roomPickRow}>
            {ownerStudio.rooms.map((r) => {
              const on = roomId === r.id;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => setRoomId(r.id)}
                  style={[styles.roomPickCard, on && styles.roomPickCardOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <View style={styles.roomPickCapSlot}>
                    <Text style={[styles.roomPickCapNum, on && styles.roomPickCapNumOn]}>{r.capacityPeople}</Text>
                    <Text style={styles.roomPickCapLabel}>pessoas</Text>
                  </View>
                  <Text style={[styles.roomPickName, on && styles.roomPickNameOn]} numberOfLines={2}>
                    {r.name}
                  </Text>
                  <Text style={[styles.roomPickCapHint, on && styles.roomPickCapHintOn]} numberOfLines={1}>
                    {formatRoomCapacity(r.capacityPeople)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {ownerStudio.rooms.length > 0 && roomId ? (
          <View style={styles.roomPhotosBlock}>
            <RoomPhotosStrip
              uris={ownerStudio.rooms.find((x) => x.id === roomId)?.photoUris}
              title="Fotos desta sala"
              variant="grid"
            />
          </View>
        ) : null}

        <Text style={styles.label}>Preço por hora (R$)</Text>
        <TextInput
          style={styles.priceInput}
          value={priceDraft}
          onChangeText={setPriceDraft}
          onBlur={commitPrice}
          keyboardType="decimal-pad"
          placeholder="90"
          placeholderTextColor={COLORS.muted}
        />
        <Text style={styles.priceHint}>
          {priceHint > 0 ? `Para marcar ensaio: ~R$ ${priceHint.toFixed(2)}/h (proporcional ao tempo).` : ''}
        </Text>

        <Text style={[styles.section, styles.sectionSpaced]}>Calendário</Text>
        <MonthCalendar
          viewYear={viewYear}
          viewMonth={viewMonth}
          onChangeView={(y, m) => {
            setViewYear(y);
            setViewMonth(m);
          }}
          selectedDateKey={dateKey}
          onSelectDate={(d) => {
            const x = startOfDay(d);
            setSelectedDate(x);
            setViewYear(x.getFullYear());
            setViewMonth(x.getMonth());
          }}
          minDateKey={minDateKey}
          maxDateKey={maxDateKey}
          markedDateKeys={markedDateKeys}
          todayDateKey={toDateKey(today)}
          instructionText="Toque em um dia para ver a agenda desta data"
        />

        <Text style={[styles.section, styles.sectionSpaced]}>Linha do dia</Text>
        <DayTimeline segments={segments} previewRange={blockPreview} />

        <Text style={[styles.section, styles.sectionSpaced]}>Novo bloqueio (manutenção / indisponível)</Text>
        <TimeChipsRow label="Começa às" options={timeOptionsStart()} value={blockStart} onChange={setBlockStart} />
        <TimeChipsRow label="Termina às" options={blockEndOptions} value={blockEnd} onChange={setBlockEnd} />
        {blockPreview ? (
          <View style={styles.blockValidation}>
            {blockOverlapsBusy ? (
              <Text style={styles.blockValidationErr}>
                Este intervalo conflita com uma reserva ou outro bloqueio — não é possível sobrepor horários.
              </Text>
            ) : (
              <Text style={styles.blockValidationOk}>Intervalo disponível para bloquear.</Text>
            )}
          </View>
        ) : null}
        <Pressable
          style={({ pressed }) => [
            styles.addBtn,
            blockOverlapsBusy && styles.addBtnOff,
            pressed && !blockOverlapsBusy && styles.pressed,
          ]}
          onPress={addBlock}
          disabled={blockOverlapsBusy}
          accessibilityRole="button"
        >
          <Text style={styles.addBtnText}>Adicionar bloqueio</Text>
        </Pressable>

        {blocksToday.length > 0 ? (
          <View style={styles.listCard}>
            <Text style={styles.listTitle}>Bloqueios neste dia</Text>
            {blocksToday.map((r, i) => (
              <View key={`${r.startMin}-${r.endMin}-${i}`} style={styles.listRow}>
                <Text style={styles.listText}>{rangeLabel(r)}</Text>
                <Pressable onPress={() => removeBlock(r)} accessibilityRole="button">
                  <Text style={styles.remove}>Remover</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={[styles.section, styles.sectionSpaced]}>Reservas neste dia</Text>
        <View style={styles.card}>
          {bookingsToday.length === 0 ? (
            <Text style={styles.muted}>Nenhuma reserva de exemplo neste dia.</Text>
          ) : (
            bookingsToday.map((b) => (
              <Pressable key={b.id} onPress={() => onBookingPress(b)} style={styles.bookingRow}>
                <Text style={styles.bookingTime}>{rangeLabel({ startMin: b.startMin, endMin: b.endMin })}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bookingBand}>{b.bandName}</Text>
                  <Text style={styles.bookingStatus}>{b.status === 'pending' ? 'Pendente' : 'Confirmada'} · toque para ver os detalhes</Text>
                </View>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
    ...Platform.select({
      web: { minHeight: '100vh' as never },
      default: {},
    }),
  },
  mainScroll: Platform.select({
    web: { flex: 1, minHeight: 0 },
    default: {},
  }),
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  back: { paddingVertical: 8, paddingHorizontal: 4, minWidth: 72 },
  backText: { color: COLORS.accent, fontSize: 16, fontWeight: '600' },
  topTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  studioTitleBlock: { marginTop: 14, marginBottom: 4 },
  studioName: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  sub: { fontSize: 14, color: COLORS.muted, lineHeight: 21, marginBottom: 14 },
  roomPickRow: { flexDirection: 'row', gap: 18, paddingVertical: 8, marginBottom: 18, paddingRight: 12 },
  roomPickCard: {
    width: 140,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    overflow: 'hidden',
  },
  roomPickCardOn: { borderColor: COLORS.accent, backgroundColor: 'rgba(245, 158, 11, 0.08)' },
  roomPickCapSlot: {
    width: '100%',
    minHeight: 88,
    backgroundColor: COLORS.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  roomPickCapNum: { fontSize: 32, fontWeight: '900', color: COLORS.text, lineHeight: 36 },
  roomPickCapNumOn: { color: COLORS.accent },
  roomPickCapLabel: { fontSize: 11, fontWeight: '700', color: COLORS.muted, textTransform: 'uppercase', marginTop: 2 },
  roomPickName: { fontSize: 12, fontWeight: '800', color: COLORS.text, paddingHorizontal: 10, paddingTop: 10, lineHeight: 16 },
  roomPickNameOn: { color: COLORS.accent },
  roomPickCapHint: { fontSize: 11, fontWeight: '600', color: COLORS.muted, paddingHorizontal: 10, paddingBottom: 10, paddingTop: 4 },
  roomPickCapHintOn: { color: COLORS.accent },
  roomPhotosBlock: { marginBottom: 22, marginTop: 4 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  priceInput: {
    marginTop: 8,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.select({ ios: 14, default: 12 }),
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    minHeight: 48,
  },
  priceHint: { marginTop: 8, fontSize: 13, color: COLORS.muted, lineHeight: 19 },
  section: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionSpaced: { marginTop: 22, marginBottom: 10 },
  addBtn: {
    backgroundColor: COLORS.danger,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  addBtnOff: { opacity: 0.45 },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  blockValidation: { marginTop: 10, marginBottom: 4 },
  blockValidationOk: { fontSize: 14, fontWeight: '600', color: COLORS.success },
  blockValidationErr: { fontSize: 14, fontWeight: '600', color: COLORS.danger, lineHeight: 20 },
  listCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginBottom: 16,
  },
  listTitle: { fontSize: 13, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  listText: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  remove: { fontSize: 14, fontWeight: '700', color: COLORS.accent },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
  },
  muted: { fontSize: 15, color: COLORS.muted, lineHeight: 22 },
  bookingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  bookingTime: { fontSize: 14, fontWeight: '800', color: COLORS.accent, minWidth: 120 },
  bookingBand: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  bookingStatus: { marginTop: 2, fontSize: 13, color: COLORS.muted },
  pressed: { opacity: 0.9 },
});
