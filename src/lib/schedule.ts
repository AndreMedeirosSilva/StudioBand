/** Grade do dia e intervalos em minutos desde meia-noite. */

export const SCHEDULE_STEP_MIN = 30;
/** Primeiro slot (minutos): 8:00 */
export const SCHEDULE_START_MIN = 8 * 60;
/** Último início possível (ex.: 23:30 se o fim pode ser 24:00) */
export const SCHEDULE_LAST_START_MIN = 23 * 60 + 30;
/** Fim máximo do dia de trabalho (24:00 = fim do dia) */
export const SCHEDULE_END_MAX_MIN = 24 * 60;

export type MinuteRange = { startMin: number; endMin: number };

export function minToLabel(totalMin: number): string {
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function rangeLabel(r: MinuteRange): string {
  return `${minToLabel(r.startMin)} – ${minToLabel(r.endMin)}`;
}

/** Opções de início/fim alinhadas a SCHEDULE_STEP_MIN entre START e LAST_START (para “das”). */
export function timeOptionsStart(): number[] {
  const out: number[] = [];
  for (let m = SCHEDULE_START_MIN; m <= SCHEDULE_LAST_START_MIN; m += SCHEDULE_STEP_MIN) {
    out.push(m);
  }
  return out;
}

/** Opções de fim: depois do início, até SCHEDULE_END_MAX_MIN. */
export function timeOptionsEndAfter(startMin: number): number[] {
  const out: number[] = [];
  const first = startMin + SCHEDULE_STEP_MIN;
  for (let m = first; m <= SCHEDULE_END_MAX_MIN; m += SCHEDULE_STEP_MIN) {
    out.push(m);
  }
  return out;
}

export function rangesOverlap(a: MinuteRange, b: MinuteRange): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

export function rangeOverlapsAny(r: MinuteRange, list: MinuteRange[]): boolean {
  return list.some((x) => rangesOverlap(r, x));
}

/** Altura em px de um bloco no eixo vertical (cada linha = um passo da grelha). */
export function pxForRange(startMin: number, endMin: number, pxPerStep: number): { top: number; height: number } {
  const t0 = startMin - SCHEDULE_START_MIN;
  const h = endMin - startMin;
  const steps = h / SCHEDULE_STEP_MIN;
  const topSteps = t0 / SCHEDULE_STEP_MIN;
  return { top: topSteps * pxPerStep, height: Math.max(steps * pxPerStep, 8) };
}

export const TIMELINE_ROW_PX = 22;

export function totalTimelineHeightPx(): number {
  const span = SCHEDULE_END_MAX_MIN - SCHEDULE_START_MIN;
  return (span / SCHEDULE_STEP_MIN) * TIMELINE_ROW_PX;
}

/** Minuto alinhado ao step a partir da posição Y dentro da faixa da timeline (0 = topo = início do dia útil). */
export function minuteAtTrackY(localY: number, trackHeightPx: number): number {
  const span = SCHEDULE_END_MAX_MIN - SCHEDULE_START_MIN;
  if (trackHeightPx <= 0) return SCHEDULE_START_MIN;
  const y = Math.max(0, Math.min(trackHeightPx, localY));
  const ratio = y / trackHeightPx;
  const raw = SCHEDULE_START_MIN + ratio * span;
  const stepCount = Math.round((raw - SCHEDULE_START_MIN) / SCHEDULE_STEP_MIN);
  const maxSteps = span / SCHEDULE_STEP_MIN;
  const idx = Math.max(0, Math.min(maxSteps, stepCount));
  return SCHEDULE_START_MIN + idx * SCHEDULE_STEP_MIN;
}

/** Intervalo entre dois pontos de arrasto (cada extremo alinha ao passo da grelha). */
export function rangeFromDragEndpoints(a: number, b: number): MinuteRange {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (lo === hi) {
    return { startMin: lo, endMin: Math.min(lo + SCHEDULE_STEP_MIN, SCHEDULE_END_MAX_MIN) };
  }
  return { startMin: lo, endMin: hi };
}
