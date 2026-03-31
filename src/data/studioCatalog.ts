/**
 * Catálogo de estúdios, salas e estado do “meu estúdio” (intervalos por sala e dia).
 */

import { addDays, startOfDay, toDateKey } from '../lib/dates';
import type { MinuteRange } from '../lib/schedule';
import { rangeOverlapsAny } from '../lib/schedule';

export type { MinuteRange } from '../lib/schedule';

/** Fotos demo (Unsplash) — URLs estáveis para logo e salas. */
const IMG = {
  logoStudio: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=640&auto=format&fit=crop',
  logoNeon: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=640&auto=format&fit=crop',
  logoVinyl: 'https://images.unsplash.com/photo-1461360370896-922624d12aa1?w=640&auto=format&fit=crop',
  roomDrums: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=640&auto=format&fit=crop',
  roomMixer: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=640&auto=format&fit=crop',
  roomMic: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=640&auto=format&fit=crop',
  roomGuitar: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=640&auto=format&fit=crop',
  roomKeys: 'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=640&auto=format&fit=crop',
  roomAmp: 'https://images.unsplash.com/photo-1540202404-a2f29016b523?w=640&auto=format&fit=crop',
  roomBooth: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=640&auto=format&fit=crop',
  roomDark: 'https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=640&auto=format&fit=crop',
} as const;

/** Logo de demonstração ao registar estúdio (substituir por upload real com backend). */
export const DEMO_OWNER_LOGO_URI = IMG.logoStudio;

export type StudioRoom = {
  id: string;
  name: string;
  /** Capacidade máxima recomendada (pessoas na sala). */
  capacityPeople: number;
  /** Fotos da sala (URLs remotas ou `file://` no dispositivo). */
  photoUris?: string[];
};

/** Texto curto para UI (ex.: lista de salas). */
export function formatRoomCapacity(people: number): string {
  return people === 1 ? '1 pessoa' : `até ${people} pessoas`;
}

export type DemoBooking = {
  id: string;
  /** Sala onde ocorre o ensaio. */
  roomId: string;
  dateKey: string;
  /** Minutos desde meia-noite (ex.: 9*60+30 = 9:30). */
  startMin: number;
  endMin: number;
  bandName: string;
  status: 'pending' | 'confirmed';
};

export type OwnerStudioState = {
  pricePerHour: number;
  /** Logo do estúdio (URL ou ficheiro local). */
  logoUri: string | null;
  /** Salas do estúdio (dono). */
  rooms: StudioRoom[];
  /** Por sala e dia: bloqueios do dono. */
  blockedRangesByRoomDate: Record<string, Record<string, MinuteRange[]>>;
  bookings: DemoBooking[];
};

export function defaultOwnerRooms(ownerStudioId: string): StudioRoom[] {
  return [
    {
      id: `${ownerStudioId}-sala-a`,
      name: 'Sala A (ensaios)',
      capacityPeople: 12,
      photoUris: [IMG.roomDrums, IMG.roomGuitar, IMG.roomAmp],
    },
    {
      id: `${ownerStudioId}-sala-b`,
      name: 'Sala B (gravação)',
      capacityPeople: 6,
      photoUris: [IMG.roomMixer, IMG.roomMic, IMG.roomBooth],
    },
    {
      id: `${ownerStudioId}-sala-c`,
      name: 'Sala C (rehearsal)',
      capacityPeople: 8,
      photoUris: [IMG.roomKeys, IMG.roomDark],
    },
  ];
}

export function emptyOwnerStudioState(): OwnerStudioState {
  return {
    pricePerHour: 90,
    logoUri: null,
    rooms: [],
    blockedRangesByRoomDate: {},
    bookings: [],
  };
}

/** Reservas de demonstração para o estúdio do dono (vários dias e salas). */
export function makeDemoBookings(studioKey: string, rooms: StudioRoom[]): DemoBooking[] {
  if (rooms.length === 0) return [];
  const t = startOfDay(new Date());
  const rid = (i: number) => rooms[i % rooms.length]!.id;

  const rows: Omit<DemoBooking, 'id' | 'roomId'>[] = [
    { dateKey: toDateKey(addDays(t, 0)), startMin: 10 * 60, endMin: 11 * 60 + 30, bandName: 'Os Polaroides', status: 'pending' },
    { dateKey: toDateKey(addDays(t, 0)), startMin: 15 * 60, endMin: 16 * 60 + 30, bandName: 'Lua Nova', status: 'confirmed' },
    { dateKey: toDateKey(addDays(t, 1)), startMin: 9 * 60, endMin: 10 * 60 + 30, bandName: 'Feedback', status: 'confirmed' },
    { dateKey: toDateKey(addDays(t, 1)), startMin: 18 * 60, endMin: 19 * 60 + 45, bandName: 'Três Acordes', status: 'pending' },
    { dateKey: toDateKey(addDays(t, 2)), startMin: 14 * 60, endMin: 16 * 60, bandName: 'Banda Convidada', status: 'confirmed' },
    { dateKey: toDateKey(addDays(t, 2)), startMin: 20 * 60, endMin: 21 * 60 + 30, bandName: 'Rock na Laje', status: 'confirmed' },
    { dateKey: toDateKey(addDays(t, 3)), startMin: 11 * 60, endMin: 12 * 60 + 15, bandName: 'Garage Trio', status: 'confirmed' },
    { dateKey: toDateKey(addDays(t, 4)), startMin: 16 * 60, endMin: 18 * 60, bandName: 'Sambass', status: 'pending' },
    { dateKey: toDateKey(addDays(t, 5)), startMin: 10 * 60 + 30, endMin: 12 * 60, bandName: 'JazzMineiros', status: 'confirmed' },
    { dateKey: toDateKey(addDays(t, 6)), startMin: 19 * 60, endMin: 20 * 60 + 30, bandName: 'Indie SP', status: 'confirmed' },
    { dateKey: toDateKey(addDays(t, 7)), startMin: 9 * 60 + 30, endMin: 11 * 60, bandName: 'Os Polaroides', status: 'confirmed' },
    { dateKey: toDateKey(addDays(t, 8)), startMin: 13 * 60, endMin: 14 * 60 + 30, bandName: 'Grupo Matriz', status: 'pending' },
    { dateKey: toDateKey(addDays(t, 9)), startMin: 17 * 60, endMin: 19 * 60, bandName: 'Baque do Vale', status: 'confirmed' },
    { dateKey: toDateKey(addDays(t, 10)), startMin: 10 * 60, endMin: 11 * 60, bandName: 'Eletricidade', status: 'confirmed' },
    { dateKey: toDateKey(addDays(t, 11)), startMin: 15 * 60 + 30, endMin: 17 * 60, bandName: 'Cover Station', status: 'pending' },
    { dateKey: toDateKey(addDays(t, 12)), startMin: 12 * 60, endMin: 13 * 60 + 45, bandName: 'Ensaio Geral', status: 'confirmed' },
    { dateKey: toDateKey(addDays(t, 13)), startMin: 18 * 60 + 30, endMin: 20 * 60, bandName: 'Noite Alta', status: 'confirmed' },
    { dateKey: toDateKey(addDays(t, 14)), startMin: 11 * 60 + 30, endMin: 13 * 60, bandName: 'Dupla Caipira', status: 'pending' },
  ];

  return rows.map((row, i) => ({
    id: `${studioKey}-b${i + 1}`,
    roomId: rid(i),
    ...row,
  }));
}

/** Bloqueios de exemplo (manutenção / fechado) por sala. */
export function makeDemoBlockedRanges(rooms: StudioRoom[]): Record<string, Record<string, MinuteRange[]>> {
  if (rooms.length === 0) return {};
  const t = startOfDay(new Date());
  const r0 = rooms[0]!.id;
  const r1 = rooms[1]?.id;
  const out: Record<string, Record<string, MinuteRange[]>> = {
    [r0]: {
      [toDateKey(addDays(t, 3))]: [{ startMin: 8 * 60, endMin: 9 * 60 }],
      [toDateKey(addDays(t, 7))]: [{ startMin: 12 * 60 + 30, endMin: 14 * 60 }],
    },
  };
  if (r1) {
    out[r1] = {
      [toDateKey(addDays(t, 4))]: [{ startMin: 13 * 60, endMin: 13 * 60 + 45 }],
      [toDateKey(addDays(t, 10))]: [{ startMin: 21 * 60, endMin: 22 * 60 }],
    };
  }
  return out;
}

export type PublicCatalogStudio = {
  id: string;
  name: string;
  city: string;
  pricePerHour: number;
  logoUri: string | null;
  rooms: StudioRoom[];
};

export const PUBLIC_CATALOG_STUDIOS: PublicCatalogStudio[] = [
  {
    id: 'pub-1',
    name: 'Estúdio Groove',
    city: 'São Paulo — Vila Madalena',
    pricePerHour: 85,
    logoUri: IMG.logoVinyl,
    rooms: [
      { id: 'pub-1-s1', name: 'Sala Grande', capacityPeople: 15, photoUris: [IMG.roomDrums, IMG.roomKeys, IMG.roomAmp] },
      { id: 'pub-1-s2', name: 'Sala Íntima', capacityPeople: 5, photoUris: [IMG.roomGuitar, IMG.roomMic] },
    ],
  },
  {
    id: 'pub-2',
    name: 'Sala 7 Áudio',
    city: 'São Paulo — Pinheiros',
    pricePerHour: 95,
    logoUri: IMG.logoNeon,
    rooms: [
      { id: 'pub-2-s1', name: 'Estúdio A', capacityPeople: 10, photoUris: [IMG.roomMixer, IMG.roomDrums] },
      { id: 'pub-2-s2', name: 'Estúdio B', capacityPeople: 8, photoUris: [IMG.roomBooth, IMG.roomDark] },
      { id: 'pub-2-s3', name: 'Cabine voz', capacityPeople: 3, photoUris: [IMG.roomMic, IMG.roomMixer] },
    ],
  },
  {
    id: 'pub-3',
    name: 'Rehearsal Box',
    city: 'Campinas — Centro',
    pricePerHour: 70,
    logoUri: IMG.logoStudio,
    rooms: [
      { id: 'pub-3-s1', name: 'Box 1', capacityPeople: 6, photoUris: [IMG.roomAmp, IMG.roomDrums] },
      { id: 'pub-3-s2', name: 'Box 2', capacityPeople: 6, photoUris: [IMG.roomGuitar, IMG.roomKeys] },
    ],
  },
  {
    id: 'pub-4',
    name: 'Amp Room',
    city: 'São Paulo — Consolação',
    pricePerHour: 110,
    logoUri: IMG.logoNeon,
    rooms: [
      { id: 'pub-4-s1', name: 'Live room', capacityPeople: 18, photoUris: [IMG.roomDrums, IMG.roomAmp, IMG.roomMixer] },
      { id: 'pub-4-s2', name: 'Booth', capacityPeople: 4, photoUris: [IMG.roomBooth, IMG.roomMic] },
      { id: 'pub-4-s3', name: 'Ensaio secos', capacityPeople: 7, photoUris: [IMG.roomKeys, IMG.roomGuitar] },
    ],
  },
  {
    id: 'pub-5',
    name: 'Subsolo Sessions',
    city: 'Rio de Janeiro — Botafogo',
    pricePerHour: 78,
    logoUri: IMG.logoVinyl,
    rooms: [
      { id: 'pub-5-s1', name: 'Sala 1', capacityPeople: 9, photoUris: [IMG.roomDark, IMG.roomDrums] },
      { id: 'pub-5-s2', name: 'Sala 2', capacityPeople: 9, photoUris: [IMG.roomMixer, IMG.roomAmp] },
    ],
  },
  {
    id: 'pub-6',
    name: 'Beat Factory',
    city: 'Belo Horizonte — Savassi',
    pricePerHour: 65,
    logoUri: IMG.logoStudio,
    rooms: [
      { id: 'pub-6-s1', name: 'Estúdio principal', capacityPeople: 11, photoUris: [IMG.roomMixer, IMG.roomDrums, IMG.roomKeys] },
      { id: 'pub-6-s2', name: 'Mini sala', capacityPeople: 4, photoUris: [IMG.roomGuitar, IMG.roomMic] },
      { id: 'pub-6-s3', name: 'Podcast corner', capacityPeople: 5, photoUris: [IMG.roomBooth, IMG.roomMic] },
    ],
  },
];

export type BookingStudioRow = {
  id: string;
  name: string;
  city: string;
  pricePerHour: number;
  isMine: boolean;
  logoUri: string | null;
};

export function listStudiosForBooking(
  profile: { ownerStudioId: string | null; studioName: string | null },
  owner: OwnerStudioState,
): BookingStudioRow[] {
  const rows: BookingStudioRow[] = PUBLIC_CATALOG_STUDIOS.map((s) => ({
    id: s.id,
    name: s.name,
    city: s.city,
    pricePerHour: s.pricePerHour,
    isMine: false,
    logoUri: s.logoUri,
  }));
  if (profile.ownerStudioId && profile.studioName) {
    rows.unshift({
      id: profile.ownerStudioId,
      name: profile.studioName,
      city: 'Meu estúdio',
      pricePerHour: 0,
      isMine: true,
      logoUri: owner.logoUri,
    });
  }
  return rows;
}

/** Salas disponíveis para marcação neste estúdio (catálogo ou dono). */
export function getRoomsForStudioRow(row: BookingStudioRow, owner: OwnerStudioState): StudioRoom[] {
  if (row.isMine) {
    if (owner.rooms.length > 0) return owner.rooms;
    return [{ id: `${row.id}-sala`, name: 'Sala principal', capacityPeople: 8 }];
  }
  const cat = PUBLIC_CATALOG_STUDIOS.find((s) => s.id === row.id);
  return cat?.rooms ?? [{ id: `${row.id}-sala`, name: 'Sala 1', capacityPeople: 6 }];
}

function strHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Padrões de ocupação simulada (sem sobreposição dentro do mesmo dia). */
const PUBLIC_BUSY_PATTERNS: MinuteRange[][] = [
  [],
  [{ startMin: 9 * 60 + 30, endMin: 11 * 60 }],
  [{ startMin: 14 * 60, endMin: 15 * 60 + 30 }],
  [{ startMin: 19 * 60, endMin: 20 * 60 + 45 }],
  [
    { startMin: 8 * 60, endMin: 9 * 60 },
    { startMin: 12 * 60, endMin: 13 * 60 + 30 },
    { startMin: 17 * 60, endMin: 18 * 60 + 15 },
  ],
  [{ startMin: 10 * 60, endMin: 12 * 60 }],
  [{ startMin: 15 * 60, endMin: 17 * 60 + 30 }],
  [
    { startMin: 11 * 60, endMin: 11 * 60 + 45 },
    { startMin: 16 * 60, endMin: 17 * 60 + 45 },
  ],
  [
    { startMin: 13 * 60, endMin: 14 * 60 + 15 },
    { startMin: 20 * 60, endMin: 21 * 60 + 30 },
  ],
  [{ startMin: 18 * 60, endMin: 19 * 60 + 30 }],
  [{ startMin: 21 * 60, endMin: 22 * 60 + 30 }],
  [
    { startMin: 9 * 60, endMin: 10 * 60 + 15 },
    { startMin: 14 * 60 + 30, endMin: 16 * 60 },
  ],
];

/** Reservas simuladas em estúdios públicos (por sala). */
export function getPublicDemoBusyRanges(studioId: string, roomId: string, dateKey: string): MinuteRange[] {
  const h = strHash(`${studioId}|${roomId}|${dateKey}`);
  const idx = h % PUBLIC_BUSY_PATTERNS.length;
  const pattern = PUBLIC_BUSY_PATTERNS[idx] ?? [];
  return pattern.map((r) => ({ ...r })).sort((a, b) => a.startMin - b.startMin);
}

/** Todos os intervalos indisponíveis na sala nesse dia. */
export function getBusyRangesForDay(
  row: BookingStudioRow,
  roomId: string,
  dateKey: string,
  owner: OwnerStudioState,
): MinuteRange[] {
  if (row.isMine) {
    const fromBookings = owner.bookings
      .filter((b) => b.roomId === roomId && b.dateKey === dateKey)
      .map((b) => ({ startMin: b.startMin, endMin: b.endMin }));
    const blocked = owner.blockedRangesByRoomDate[roomId]?.[dateKey] ?? [];
    return [...fromBookings, ...blocked];
  }
  return getPublicDemoBusyRanges(row.id, roomId, dateKey);
}

export type TimelineSegment = {
  kind: 'booked' | 'blocked';
  startMin: number;
  endMin: number;
  label?: string;
};

export function getTimelineSegmentsForDay(
  row: BookingStudioRow,
  roomId: string,
  dateKey: string,
  owner: OwnerStudioState,
): TimelineSegment[] {
  const out: TimelineSegment[] = [];
  if (row.isMine) {
    owner.bookings
      .filter((b) => b.roomId === roomId && b.dateKey === dateKey)
      .forEach((b) => {
        out.push({
          kind: 'booked',
          startMin: b.startMin,
          endMin: b.endMin,
          label: b.bandName,
        });
      });
    (owner.blockedRangesByRoomDate[roomId]?.[dateKey] ?? []).forEach((r) => {
      out.push({ kind: 'blocked', startMin: r.startMin, endMin: r.endMin, label: 'Bloqueado' });
    });
  } else {
    getPublicDemoBusyRanges(row.id, roomId, dateKey).forEach((r) => {
      out.push({ kind: 'booked', startMin: r.startMin, endMin: r.endMin, label: 'Reservado' });
    });
  }
  return out.sort((a, b) => a.startMin - b.startMin);
}

export function dayHasOccupiedSlots(
  row: BookingStudioRow,
  roomId: string,
  dateKey: string,
  owner: OwnerStudioState,
): boolean {
  return getBusyRangesForDay(row, roomId, dateKey, owner).length > 0;
}

export function isRangeAvailable(
  row: BookingStudioRow,
  roomId: string,
  dateKey: string,
  owner: OwnerStudioState,
  startMin: number,
  endMin: number,
): boolean {
  if (endMin <= startMin) return false;
  const proposal: MinuteRange = { startMin, endMin };
  return !rangeOverlapsAny(proposal, getBusyRangesForDay(row, roomId, dateKey, owner));
}

export function effectivePricePerHour(row: BookingStudioRow, owner: OwnerStudioState): number {
  if (row.isMine) return owner.pricePerHour;
  return row.pricePerHour;
}

export function estimatedPriceCents(pricePerHour: number, startMin: number, endMin: number): number {
  const hours = (endMin - startMin) / 60;
  return Math.round(pricePerHour * 100 * hours);
}

/** Remove um bloqueio numa sala/dia. */
export function removeBlockedRange(
  byRoomDate: Record<string, Record<string, MinuteRange[]>>,
  roomId: string,
  dateKey: string,
  r: MinuteRange,
): Record<string, Record<string, MinuteRange[]>> {
  const roomDays = { ...(byRoomDate[roomId] ?? {}) };
  const list = roomDays[dateKey] ?? [];
  const nextList = list.filter((x) => !(x.startMin === r.startMin && x.endMin === r.endMin));
  if (nextList.length === 0) {
    const { [dateKey]: _, ...restDays } = roomDays;
    const nextByRoom = { ...byRoomDate };
    if (Object.keys(restDays).length === 0) {
      const { [roomId]: __, ...restRooms } = nextByRoom;
      return restRooms;
    }
    nextByRoom[roomId] = restDays;
    return nextByRoom;
  }
  return { ...byRoomDate, [roomId]: { ...roomDays, [dateKey]: nextList } };
}
