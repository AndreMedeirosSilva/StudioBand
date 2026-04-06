import { describe, expect, it } from 'vitest';
import {
  SCHEDULE_END_MAX_MIN,
  SCHEDULE_START_MIN,
  minuteAtTrackY,
  pxForRange,
  rangeFromDragEndpoints,
  rangeOverlapsAny,
  rangesOverlap,
  timeOptionsEndAfter,
  timeOptionsStart,
} from './schedule';

describe('schedule', () => {
  it('gera opções de início e fim respeitando limites', () => {
    const start = timeOptionsStart();
    expect(start[0]).toBe(SCHEDULE_START_MIN);
    expect(start.length).toBeGreaterThan(0);

    const end = timeOptionsEndAfter(SCHEDULE_START_MIN);
    expect(end[0]).toBe(SCHEDULE_START_MIN + 30);
    expect(end.at(-1)).toBe(SCHEDULE_END_MAX_MIN);
  });

  it('detecta sobreposição de intervalos', () => {
    const a = { startMin: 600, endMin: 660 };
    const b = { startMin: 650, endMin: 720 };
    const c = { startMin: 720, endMin: 780 };
    expect(rangesOverlap(a, b)).toBe(true);
    expect(rangesOverlap(a, c)).toBe(false);
    expect(rangeOverlapsAny(a, [c, b])).toBe(true);
  });

  it('converte posição Y para minuto alinhado e com clamp', () => {
    expect(minuteAtTrackY(-100, 1000)).toBe(SCHEDULE_START_MIN);
    expect(minuteAtTrackY(2000, 1000)).toBe(SCHEDULE_END_MAX_MIN);
    expect(minuteAtTrackY(500, 1000)).toBeGreaterThanOrEqual(SCHEDULE_START_MIN);
  });

  it('calcula box em px e intervalo por arrasto', () => {
    const box = pxForRange(600, 660, 20);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.height).toBeGreaterThan(0);

    const samePoint = rangeFromDragEndpoints(600, 600);
    expect(samePoint).toEqual({ startMin: 600, endMin: 630 });
    expect(rangeFromDragEndpoints(720, 660)).toEqual({ startMin: 660, endMin: 720 });
  });
});
