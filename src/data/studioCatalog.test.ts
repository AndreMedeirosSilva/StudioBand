import { describe, expect, it } from 'vitest';
import {
  dayHasOccupiedSlots,
  emptyOwnerStudioState,
  formatRoomCapacity,
  getBusyRangesForDay,
  getTimelineSegmentsForDay,
  isRangeAvailable,
  listStudiosForBooking,
  normalizeOwnerStudioState,
  removeBlockedRange,
} from './studioCatalog';

describe('studioCatalog', () => {
  it('formata capacidade e normaliza salas', () => {
    expect(formatRoomCapacity(1)).toBe('1 pessoa');
    expect(formatRoomCapacity(4)).toContain('4');

    const normalized = normalizeOwnerStudioState({
      ...emptyOwnerStudioState(),
      pricePerHour: 100,
      rooms: [
        { id: 'r1', name: 'Sala 1', capacityPeople: 5, pricePerHour: -1, photoUris: ['https://ok', '', 'x'] },
        { id: 'r2', name: '   ', capacityPeople: 5, pricePerHour: 80, photoUris: [] },
      ],
    });
    expect(normalized.rooms).toHaveLength(1);
    expect(normalized.rooms[0]?.pricePerHour).toBe(100);
    expect(normalized.rooms[0]?.photoUris).toEqual(['https://ok', 'x']);
  });

  it('lista estúdios com o meu estúdio no topo', () => {
    const owner = {
      ...emptyOwnerStudioState(),
      addressLine: 'Rua A',
      rooms: [{ id: 'room-1', name: 'Sala 1', capacityPeople: 5, pricePerHour: 120 }],
    };
    const rows = listStudiosForBooking(
      { ownerStudioId: 'my-studio', studioName: 'Meu Studio' },
      owner,
      [
        { id: 'other', name: 'Outro', addressLine: 'Rua B', photoUrl: null },
        { id: 'my-studio', name: 'Duplicado', addressLine: 'Rua C', photoUrl: null },
      ],
    );
    expect(rows[0]?.id).toBe('my-studio');
    expect(rows).toHaveLength(2);
  });

  it('calcula ocupação/segmentos e disponibilidade no estúdio próprio', () => {
    const owner = {
      ...emptyOwnerStudioState(),
      rooms: [{ id: 'r1', name: 'Sala 1', capacityPeople: 6, pricePerHour: 100 }],
      bookings: [{ id: 'b1', roomId: 'r1', dateKey: '2026-04-02', startMin: 600, endMin: 660, bandName: 'Band', status: 'confirmed' as const }],
      blockedRangesByRoomDate: { r1: { '2026-04-02': [{ startMin: 700, endMin: 730 }] } },
    };
    const row = { id: 'my', name: 'Meu', city: '', addressLine: null, pricePerHour: 100, isMine: true, logoUri: null };
    const busy = getBusyRangesForDay(row, 'r1', '2026-04-02', owner);
    expect(busy).toHaveLength(2);
    expect(dayHasOccupiedSlots(row, 'r1', '2026-04-02', owner)).toBe(true);
    expect(isRangeAvailable(row, 'r1', '2026-04-02', owner, 610, 620)).toBe(false);
    expect(getTimelineSegmentsForDay(row, 'r1', '2026-04-02', owner)).toHaveLength(2);
  });

  it('remove bloqueio e limpa árvore vazia', () => {
    const next = removeBlockedRange({ r1: { '2026-04-02': [{ startMin: 600, endMin: 660 }] } }, 'r1', '2026-04-02', {
      startMin: 600,
      endMin: 660,
    });
    expect(next).toEqual({});
  });
});
