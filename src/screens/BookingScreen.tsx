import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { MonthCalendar } from '../components/MonthCalendar';
import { BookingFlowProgress } from '../components/BookingFlowProgress';
import { RoomPhotosStrip } from '../components/StudioMedia';
import { DayTimelineInteractive } from '../components/DayTimelineInteractive';
import { COLORS } from '../theme';
import { LoggedInUserBar } from '../components/LoggedInUserBar';
import type { UserProfile } from '../navigation/AppNavigator';
import {
  listStudiosForBooking,
  getRoomsForStudioRow,
  formatRoomCapacity,
  effectivePricePerHour,
  dayHasOccupiedSlots,
  getTimelineSegmentsForDay,
  isRangeAvailable,
  estimatedPriceCents,
  type OwnerStudioState,
} from '../data/studioCatalog';
import { startOfDay, toDateKey, addDays, compareDateKeys } from '../lib/dates';
import { rangeLabel, SCHEDULE_END_MAX_MIN, SCHEDULE_STEP_MIN } from '../lib/schedule';
import type { MinuteRange } from '../lib/schedule';

type Props = {
  profile: UserProfile;
  ownerStudio: OwnerStudioState;
  onBack: () => void;
  onLogout: () => void;
};

function formatDayLong(d: Date): string {
  const w = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  return `${w[d.getDay()]}, ${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

const DEFAULT_START = 9 * 60;
const DEFAULT_END = 10 * 60 + 30;

type BookingStep = 'studio' | 'rooms' | 'schedule';

export function BookingScreen({ profile, ownerStudio, onBack, onLogout }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pad = Math.min(24, Math.max(14, width * 0.05));

  const today = useMemo(() => startOfDay(new Date()), []);
  const minDateKey = useMemo(() => toDateKey(today), [today]);
  const maxDateKey = useMemo(() => toDateKey(addDays(today, 90)), [today]);

  const [selectedDate, setSelectedDate] = useState(() => today);
  const [viewYear, setViewYear] = useState(() => today.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => today.getMonth());
  const [startMin, setStartMin] = useState(DEFAULT_START);
  const [endMin, setEndMin] = useState(DEFAULT_END);
  const [bookingModalVisible, setBookingModalVisible] = useState(false);
  const [timelineDragActive, setTimelineDragActive] = useState(false);
  const [scheduleDetailsOpen, setScheduleDetailsOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const lastCadastroDateKeyRef = useRef<string | null>(null);

  const dateKey = toDateKey(selectedDate);

  const rows = useMemo(() => listStudiosForBooking(profile, ownerStudio), [profile, ownerStudio]);
  const [studioId, setStudioId] = useState(rows[0]?.id ?? '');
  const [bookingStep, setBookingStep] = useState<BookingStep>('studio');
  const [roomId, setRoomId] = useState('');

  useEffect(() => {
    if (rows.length && !rows.some((r) => r.id === studioId)) {
      setStudioId(rows[0].id);
    }
  }, [rows, studioId]);

  const studio = rows.find((r) => r.id === studioId) ?? rows[0];
  const roomsList = useMemo(
    () => (studio ? getRoomsForStudioRow(studio, ownerStudio) : []),
    [studio, ownerStudio],
  );

  useEffect(() => {
    if (!roomsList.some((r) => r.id === roomId)) {
      setRoomId(roomsList[0]?.id ?? '');
    }
  }, [roomsList, roomId]);

  const selectedRoom = roomsList.find((r) => r.id === roomId);
  const price = studio ? effectivePricePerHour(studio, ownerStudio) : 0;

  const segments = useMemo(
    () =>
      studio && roomId
        ? getTimelineSegmentsForDay(studio, roomId, dateKey, ownerStudio)
        : [],
    [studio, roomId, dateKey, ownerStudio],
  );

  const markedDateKeys = useMemo(() => {
    if (!studio || !roomId) return new Set<string>();
    const set = new Set<string>();
    const dim = new Date(viewYear, viewMonth + 1, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      const dk = toDateKey(new Date(viewYear, viewMonth, d));
      if (compareDateKeys(dk, minDateKey) < 0 || compareDateKeys(dk, maxDateKey) > 0) continue;
      if (dayHasOccupiedSlots(studio, roomId, dk, ownerStudio)) set.add(dk);
    }
    return set;
  }, [studio, roomId, viewYear, viewMonth, ownerStudio, minDateKey, maxDateKey]);

  const previewRange: MinuteRange | null =
    endMin > startMin ? { startMin, endMin } : null;
  const available =
    studio && roomId && previewRange
      ? isRangeAvailable(studio, roomId, dateKey, ownerStudio, startMin, endMin)
      : false;

  const openCadastroForDay = (d: Date) => {
    const x = startOfDay(d);
    const key = toDateKey(x);
    setSelectedDate(x);
    setViewYear(x.getFullYear());
    setViewMonth(x.getMonth());
    if (lastCadastroDateKeyRef.current !== key) {
      setStartMin(DEFAULT_START);
      setEndMin(DEFAULT_END);
      setNotes('');
      lastCadastroDateKeyRef.current = key;
    }
    setBookingModalVisible(true);
  };

  const closeCadastro = () => {
    setBookingModalVisible(false);
    setTimelineDragActive(false);
  };

  const applyRangeFromDrag = useCallback((r: MinuteRange) => {
    let s = r.startMin;
    let e = r.endMin;
    if (e <= s) {
      e = Math.min(s + SCHEDULE_STEP_MIN, SCHEDULE_END_MAX_MIN);
    }
    setStartMin(s);
    setEndMin(e);
  }, []);

  const confirm = () => {
    if (!studio || !previewRange || !available || !selectedRoom) return;
    const cents = estimatedPriceCents(price, startMin, endMin);
    const reais = (cents / 100).toFixed(2);
    const noteLine = notes.trim() ? `\nNotas: ${notes.trim()}` : '';
    Alert.alert(
      'Reserva (demonstração)',
      `${studio.name}\nSala: ${selectedRoom.name} (${formatRoomCapacity(selectedRoom.capacityPeople)})\n${formatDayLong(selectedDate)}\n${rangeLabel(previewRange)}\n${price > 0 ? `Estimativa: R$ ${reais}\n` : ''}\n${profile.bandName ? `Banda: ${profile.bandName}` : 'Convidado'}${profile.displayName ? `\n${profile.displayName}` : ''}${noteLine}\n\nSem servidor — é só uma simulação.`,
      [{ text: 'OK', onPress: closeCadastro }],
    );
  };

  const goBackInFlow = () => {
    if (bookingStep === 'schedule') setBookingStep('rooms');
    else if (bookingStep === 'rooms') setBookingStep('studio');
    else onBack();
  };

  const topTitle =
    bookingStep === 'studio'
      ? 'Marcar ensaio'
      : bookingStep === 'rooms'
        ? 'Salas do estúdio'
        : 'Calendário e horário';

  return (
    <View style={styles.root}>
      <LoggedInUserBar
        profile={profile}
        onLogout={onLogout}
        placement="overlay"
        top={insets.top + 8}
        right={pad}
      />
      <View style={{ paddingTop: insets.top + 52, paddingHorizontal: pad }}>
      <View style={styles.topBar}>
        <Pressable onPress={goBackInFlow} style={({ pressed }) => [styles.back, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={styles.backText}>← Voltar</Text>
        </Pressable>
        <Text style={styles.topTitle}>{topTitle}</Text>
        <View style={{ width: 72 }} />
      </View>
      </View>

      <View style={{ paddingHorizontal: pad }}>
        <BookingFlowProgress current={bookingStep} />
      </View>

      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        {bookingStep === 'studio' ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionKicker}>Passo 1</Text>
              <Text style={styles.sectionTitle}>Onde você quer ensaiar?</Text>
              <Text style={styles.sectionSub}>Escolha um estúdio. Em seguida você vê as salas e o calendário.</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.studioRow}>
              {rows.map((s) => {
                const ph = effectivePricePerHour(s, ownerStudio);
                const nSalas = getRoomsForStudioRow(s, ownerStudio).length;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => {
                      setStudioId(s.id);
                      setBookingStep('rooms');
                    }}
                    style={({ pressed }) => [styles.studioCard, pressed && styles.cardPressed]}
                    accessibilityRole="button"
                  >
                    <View style={styles.studioCardLogoSlot}>
                      {s.logoUri ? (
                        <Image
                          source={{ uri: s.logoUri }}
                          style={styles.studioCardLogoImg}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={styles.studioCardLogoPh}>
                          <Text style={styles.studioCardLogoPhText}>Logo</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.studioName}>{s.name}</Text>
                    <Text style={styles.studioCity}>{s.city}</Text>
                    <View style={styles.studioMetaRow}>
                      <Text style={styles.studioPrice}>{ph > 0 ? `R$ ${ph.toFixed(0)}/hora` : 'Seu estúdio'}</Text>
                      <View style={styles.salaPill}>
                        <Text style={styles.salaPillText}>
                          {nSalas} {nSalas === 1 ? 'sala' : 'salas'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.studioCtaRow}>
                      <Text style={styles.studioCta}>Ver salas</Text>
                      <Text style={styles.studioCtaArrow}>→</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {bookingStep === 'rooms' && studio ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionKicker}>Passo 2</Text>
              <Text style={styles.sectionTitle}>Qual sala?</Text>
              <Text style={styles.sectionSub}>Cada sala tem sua agenda. Toque para continuar.</Text>
            </View>
            <Pressable
              onPress={() => setBookingStep('studio')}
              style={({ pressed }) => [styles.pillLink, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.pillLinkText}>← Trocar de estúdio</Text>
            </Pressable>
            <View style={styles.roomList}>
              {roomsList.map((room) => (
                <Pressable
                  key={room.id}
                  onPress={() => {
                    setRoomId(room.id);
                    setScheduleDetailsOpen(false);
                    setBookingStep('schedule');
                  }}
                  style={({ pressed }) => [styles.roomCardWrap, pressed && styles.cardPressed]}
                  accessibilityRole="button"
                >
                  <View style={styles.roomCardTop}>
                    <View style={styles.roomCardBody}>
                      <Text style={styles.roomCardName}>{room.name}</Text>
                      <Text style={styles.roomCapacity}>{formatRoomCapacity(room.capacityPeople)}</Text>
                      <Text style={styles.roomCardHint}>Ver calendário e marcar</Text>
                    </View>
                    <Text style={styles.roomChevron}>›</Text>
                  </View>
                  {room.photoUris && room.photoUris.length > 0 ? (
                    <View style={styles.roomCardGallery}>
                      <Text style={styles.roomCardGalleryLabel}>Fotos da sala</Text>
                      <RoomPhotosStrip uris={room.photoUris} variant="ribbon" thumbSize={102} />
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {bookingStep === 'schedule' && studio && selectedRoom ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionKicker}>Passo 3</Text>
              <Text style={styles.sectionTitle}>Primeiro o dia no calendário</Text>
              <Text style={styles.sectionSub}>
                O calendário é o foco aqui. Depois de escolher o dia, a janela que abre prioriza{' '}
                <Text style={styles.sectionSubEm}>arrastar na linha de horários</Text> para marcar o intervalo.
              </Text>
            </View>

            <View style={styles.scheduleToolbar}>
              <Pressable
                onPress={() => setBookingStep('rooms')}
                style={({ pressed }) => [styles.scheduleToolbarPill, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Escolher outra sala"
              >
                <Text style={styles.scheduleToolbarPillText}>← Outra sala</Text>
              </Pressable>
              <Text style={styles.scheduleToolbarHint} numberOfLines={1}>
                {studio.name} · {selectedRoom.name}
              </Text>
            </View>

            <View style={styles.calendarHero}>
              <MonthCalendar
                viewYear={viewYear}
                viewMonth={viewMonth}
                onChangeView={(y, m) => {
                  setViewYear(y);
                  setViewMonth(m);
                }}
                selectedDateKey={dateKey}
                onSelectDate={openCadastroForDay}
                minDateKey={minDateKey}
                maxDateKey={maxDateKey}
                markedDateKeys={markedDateKeys}
                todayDateKey={toDateKey(today)}
                instructionText="Toque em um dia para abrir a linha de horários e marcar o ensaio"
              />
              <View style={styles.selectedDayBarInHero}>
                <Text style={styles.selectedDayLabel}>Dia em foco</Text>
                <Text style={styles.selectedDayValue}>{formatDayLong(selectedDate)}</Text>
              </View>
            </View>

            <Text style={styles.muted}>
              {bookingModalVisible
                ? 'Ajuste o intervalo na janela arrastando na linha do dia.'
                : 'Toque em um dia (ou de novo no mesmo dia) para abrir a linha de horários.'}
            </Text>

            <Pressable
              onPress={() => setScheduleDetailsOpen((o) => !o)}
              style={({ pressed }) => [styles.detailsToggle, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityState={{ expanded: scheduleDetailsOpen }}
              accessibilityLabel={scheduleDetailsOpen ? 'Ocultar detalhes da sala' : 'Ver detalhes da sala e fotos'}
            >
              <Text style={styles.detailsToggleText}>
                {scheduleDetailsOpen ? 'Ocultar detalhes da sala' : 'Sala, capacidade e fotos'}
              </Text>
              <Text style={styles.detailsToggleChevron}>{scheduleDetailsOpen ? '▲' : '▼'}</Text>
            </Pressable>

            {scheduleDetailsOpen ? (
              <View style={styles.detailsPanel}>
                <View style={styles.contextBanner}>
                  {studio.logoUri ? (
                    <Image source={{ uri: studio.logoUri }} style={styles.contextBannerLogo} contentFit="cover" />
                  ) : (
                    <View style={[styles.contextBannerLogo, styles.contextBannerLogoPh]} />
                  )}
                  <View style={styles.contextBannerText}>
                    <Text style={styles.contextBannerStudio}>{studio.name}</Text>
                    <Text style={styles.contextBannerRoom}>{selectedRoom.name}</Text>
                    <Text style={styles.contextBannerCap}>{formatRoomCapacity(selectedRoom.capacityPeople)}</Text>
                  </View>
                </View>
                {selectedRoom.photoUris && selectedRoom.photoUris.length > 0 ? (
                  <View style={styles.detailsPhotos}>
                    <RoomPhotosStrip uris={selectedRoom.photoUris} title="Fotos da sala" variant="ribbon" thumbSize={88} />
                  </View>
                ) : (
                  <Text style={styles.detailsNoPhotos}>Sem fotos desta sala na demonstração do catálogo.</Text>
                )}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={bookingModalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeCadastro}
      >
        <View style={[styles.modalRoot, Platform.OS === 'web' && styles.modalRootWeb]}>
          <Pressable style={styles.modalBackdrop} onPress={closeCadastro} accessibilityLabel="Fechar" />
          <View
            style={[
              styles.modalSheet,
              Platform.OS === 'web' && styles.modalSheetWeb,
              {
                paddingBottom: Math.max(insets.bottom, 16),
                ...(Platform.OS === 'web' ? { maxHeight: '90vh' as never } : { maxHeight: '88%' }),
              },
            ]}
          >
            <View style={styles.modalHandle} />
            <Text style={styles.modalEyebrow}>Principal · arrastar na linha</Text>
            <Text style={styles.modalHeroTitle}>Marque o intervalo no dia</Text>
            <Text style={styles.modalContextLine} numberOfLines={2}>
              {formatDayLong(selectedDate)}
              {studio ? `\n${studio.name}` : ''}
              {selectedRoom ? ` · ${selectedRoom.name}` : ''}
              {selectedRoom ? ` · ${formatRoomCapacity(selectedRoom.capacityPeople)}` : ''}
            </Text>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              scrollEnabled={!timelineDragActive}
              contentContainerStyle={styles.modalScrollContent}
            >
              <View style={styles.modalTimelineShell}>
                <Text style={styles.modalTimelineLead}>
                  Arraste na faixa para definir início e fim do ensaio (única forma de escolher o horário).
                </Text>
                {studio && roomId ? (
                  <DayTimelineInteractive
                    segments={segments}
                    previewRange={previewRange}
                    onChangeRange={applyRangeFromDrag}
                    onDragActiveChange={setTimelineDragActive}
                  />
                ) : null}
              </View>

              <Text style={styles.notesLabel}>Notas (opcional)</Text>
              <TextInput
                style={styles.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="Ex.: precisamos de bateria completa"
                placeholderTextColor={COLORS.muted}
                multiline
                maxLength={500}
              />

              {previewRange ? (
                <View style={styles.validationCard}>
                  <Text style={styles.validationTitle}>Intervalo</Text>
                  <Text style={styles.validationRange}>{rangeLabel(previewRange)}</Text>
                  {price > 0 ? (
                    <Text style={styles.validationPrice}>
                      Estimativa: R$ {(estimatedPriceCents(price, startMin, endMin) / 100).toFixed(2)}
                    </Text>
                  ) : null}
                  {!available ? (
                    <Text style={styles.validationErr}>
                      Este horário conflita com uma reserva ou bloqueio. Ajuste arrastando na linha.
                    </Text>
                  ) : (
                    <Text style={styles.validationOk}>Horário livre para solicitar reserva (demonstração).</Text>
                  )}
                </View>
              ) : null}

              <View style={styles.modalActions}>
                <Pressable
                  onPress={closeCadastro}
                  style={({ pressed }) => [styles.btnSecondary, pressed && styles.pressed]}
                  accessibilityRole="button"
                >
                  <Text style={styles.btnSecondaryText}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.confirm,
                    (!available || !studio || !roomId) && styles.confirmOff,
                    pressed && available && styles.pressed,
                  ]}
                  onPress={confirm}
                  disabled={!available || !studio || !roomId}
                  accessibilityRole="button"
                >
                  <Text style={styles.confirmText}>Confirmar ensaio</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  /** Altura limitada à tela; sem isso o ScrollView cresce com o conteúdo e o scroll vertical não funciona. */
  mainScroll: { flex: 1, minHeight: 0 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  back: { paddingVertical: 8, paddingHorizontal: 4, minWidth: 72 },
  backText: { color: COLORS.accent, fontSize: 16, fontWeight: '600' },
  topTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  sectionCard: {
    backgroundColor: COLORS.bgElevated,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    marginTop: 8,
  },
  sectionHead: { marginBottom: 16 },
  sectionKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.accent,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  sectionTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, lineHeight: 28 },
  sectionSub: { marginTop: 8, fontSize: 14, color: COLORS.muted, lineHeight: 21 },
  sectionSubEm: { fontWeight: '800', color: COLORS.text },
  scheduleToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  scheduleToolbarPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  scheduleToolbarPillText: { fontSize: 13, fontWeight: '800', color: COLORS.accent },
  scheduleToolbarHint: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.muted,
    minWidth: 0,
    textAlign: 'right',
  },
  calendarHero: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
  },
  detailsToggleText: { fontSize: 14, fontWeight: '700', color: COLORS.text, flex: 1, marginRight: 8 },
  detailsToggleChevron: { fontSize: 12, color: COLORS.muted, fontWeight: '800' },
  detailsPanel: {
    marginTop: 12,
    paddingTop: 4,
  },
  detailsPhotos: { marginTop: 4 },
  detailsNoPhotos: { fontSize: 13, color: COLORS.muted, lineHeight: 20, marginTop: 8, fontStyle: 'italic' },
  studioRow: { gap: 12, paddingVertical: 4, paddingRight: 8, marginHorizontal: -4 },
  studioCard: {
    width: 212,
    padding: 0,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    overflow: 'hidden',
  },
  studioCardLogoSlot: { width: '100%', height: 100, backgroundColor: COLORS.bgElevated },
  studioCardLogoImg: { width: '100%', height: '100%' },
  studioCardLogoPh: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  studioCardLogoPhText: { fontSize: 12, fontWeight: '800', color: COLORS.muted },
  cardPressed: { opacity: 0.88 },
  studioName: { fontSize: 17, fontWeight: '800', color: COLORS.text, paddingHorizontal: 16, paddingTop: 14 },
  studioCity: { marginTop: 6, fontSize: 13, color: COLORS.muted, lineHeight: 18, paddingHorizontal: 16 },
  studioMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 16,
  },
  studioPrice: { fontSize: 14, fontWeight: '800', color: COLORS.accent },
  salaPill: {
    backgroundColor: 'rgba(255, 190, 152, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  salaPillText: { fontSize: 12, fontWeight: '700', color: COLORS.accent },
  studioCtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  studioCta: { fontSize: 14, fontWeight: '800', color: COLORS.accent },
  studioCtaArrow: { fontSize: 16, fontWeight: '800', color: COLORS.accent, marginLeft: 6 },
  pillLink: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14,
  },
  pillLinkText: { fontSize: 14, fontWeight: '700', color: COLORS.accent },
  roomList: { gap: 16 },
  roomCardWrap: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  roomCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roomCardGallery: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  roomCardGalleryLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  roomCardBody: { flex: 1, minWidth: 0 },
  roomCardName: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  roomCapacity: { marginTop: 6, fontSize: 15, fontWeight: '700', color: COLORS.accent },
  roomCardHint: { marginTop: 4, fontSize: 13, color: COLORS.muted },
  roomChevron: { fontSize: 28, fontWeight: '300', color: COLORS.muted, marginLeft: 8 },
  contextBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginBottom: 14,
  },
  contextBannerLogo: {
    width: 52,
    height: 52,
    borderRadius: 12,
    marginRight: 12,
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  contextBannerLogoPh: { borderStyle: 'dashed' },
  contextBannerText: { flex: 1, minWidth: 0 },
  contextBannerStudio: { fontSize: 13, fontWeight: '700', color: COLORS.muted },
  contextBannerRoom: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginTop: 2 },
  contextBannerCap: { fontSize: 14, fontWeight: '700', color: COLORS.accent, marginTop: 4 },
  contextBannerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  contextBannerBtnTxt: { fontSize: 13, fontWeight: '800', color: COLORS.accent },
  selectedDayBarInHero: {
    marginTop: 16,
    paddingTop: 14,
    paddingBottom: 4,
    paddingHorizontal: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  selectedDayLabel: { fontSize: 11, fontWeight: '800', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  selectedDayValue: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginTop: 4 },
  muted: { fontSize: 14, color: COLORS.muted, lineHeight: 21, marginBottom: 4, marginTop: 6 },
  validationCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginTop: 8,
    marginBottom: 8,
  },
  validationTitle: { fontSize: 12, fontWeight: '700', color: COLORS.muted, textTransform: 'uppercase' },
  validationRange: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginTop: 6 },
  validationPrice: { fontSize: 15, color: COLORS.accent, fontWeight: '700', marginTop: 6 },
  validationErr: { marginTop: 10, fontSize: 14, color: COLORS.danger, fontWeight: '600', lineHeight: 20 },
  validationOk: { marginTop: 10, fontSize: 14, color: COLORS.success, fontWeight: '600' },
  confirm: {
    flex: 1,
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmOff: { opacity: 0.4 },
  confirmText: { color: COLORS.accentText, fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.9 },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalRootWeb: {
    justifyContent: 'center',
    padding: 16,
    paddingBottom: 24,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalSheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  modalSheetWeb: {
    width: '100%',
    maxWidth: 540,
    alignSelf: 'center',
    borderRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    ...Platform.select({
      web: {
        boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
      },
      default: {},
    }),
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: 14,
  },
  modalEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  modalHeroTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, lineHeight: 28 },
  modalContextLine: {
    fontSize: 14,
    color: COLORS.muted,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 14,
  },
  modalTimelineShell: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 4,
  },
  modalTimelineLead: {
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 20,
    marginBottom: 12,
    fontWeight: '600',
  },
  modalScrollContent: { paddingBottom: 8 },
  notesLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 16,
    marginBottom: 8,
  },
  notesInput: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.select({ ios: 12, default: 10 }),
    fontSize: 15,
    color: COLORS.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    marginBottom: 4,
  },
  btnSecondary: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  btnSecondaryText: { fontSize: 16, fontWeight: '700', color: COLORS.text },
});
