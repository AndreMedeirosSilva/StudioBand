/**
 * Estudio Banda — modelo de domínio (referência para API e banco de dados).
 *
 * Regras de negócio implícitas:
 * - Um User pode ter vários papéis: músico em N bandas, dono de M estúdios (N,M ≥ 0).
 * - Reserva (Booking): uma banda pede um intervalo em um estúdio; o dono confirma ou recusa.
 * - Agenda do estúdio: horários livres + bloqueios de manutenção (StudioBlock) + reservas confirmadas.
 */

export type ID = string;

export type ISODateTime = string;

/** Conta de login (e-mail, OAuth, etc.) */
export interface User {
  id: ID;
  email: string;
  displayName: string | null;
  phone: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Banda: vários usuários podem ser membros (ver BandMembership). */
export interface Band {
  id: ID;
  name: string;
  city: string | null;
  /** Usuário que criou / admin principal */
  primaryOwnerUserId: ID;
  createdAt: ISODateTime;
}

export type BandRole = 'admin' | 'member';

export interface BandMembership {
  id: ID;
  bandId: ID;
  userId: ID;
  role: BandRole;
  joinedAt: ISODateTime;
}

/** Estúdio físico com agenda e preço base. */
export interface Studio {
  id: ID;
  ownerUserId: ID;
  name: string;
  addressLine: string | null;
  city: string | null;
  /** Preço padrão por hora (centavos) para novos ensaios */
  defaultPricePerHourCents: number;
  timezone: string;
  createdAt: ISODateTime;
}

/**
 * Bloqueio na agenda (manutenção, evento privado): não aparece como livre para bandas.
 */
export interface StudioBlock {
  id: ID;
  studioId: ID;
  start: ISODateTime;
  end: ISODateTime;
  reason: string | null;
  createdByUserId: ID;
}

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'declined';

/**
 * Pedido de ensaio. `start`/`end` definem o slot exato (ex.: 2h).
 * `priceCents` fixado na confirmação (pode copiar o preço da hora vigente).
 */
export interface Booking {
  id: ID;
  studioId: ID;
  bandId: ID;
  requestedByUserId: ID;
  start: ISODateTime;
  end: ISODateTime;
  status: BookingStatus;
  priceCents: number;
  noteFromBand: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Índices úteis em SQL: Booking(studioId, start), StudioBlock(studioId, start), BandMembership(userId). */
