import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  compareDateKeys,
  fromDateKey,
  getCalendarWeeks,
  startOfDay,
  toDateKey,
} from './dates';

describe('dates', () => {
  it('normaliza para início do dia e gera/parsa dateKey', () => {
    const original = new Date(2026, 3, 2, 18, 45, 12, 99);
    const start = startOfDay(original);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(toDateKey(original)).toBe('2026-04-02');
    expect(toDateKey(fromDateKey('2026-04-02'))).toBe('2026-04-02');
  });

  it('soma dias e meses com rollover correto', () => {
    expect(toDateKey(addDays(new Date(2026, 0, 30), 3))).toBe('2026-02-02');
    expect(addMonths(2026, 11, 2)).toEqual({ year: 2027, month: 1 });
  });

  it('monta semanas do mês com padding', () => {
    const weeks = getCalendarWeeks(2026, 1); // fevereiro/2026
    expect(weeks.length).toBeGreaterThanOrEqual(4);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it('compara dateKeys em ordem lexicográfica válida', () => {
    expect(compareDateKeys('2026-01-01', '2026-01-02')).toBeLessThan(0);
    expect(compareDateKeys('2026-02-01', '2026-01-31')).toBeGreaterThan(0);
  });
});
