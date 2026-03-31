/**
 * Esboço de API REST para Estudio Banda (contrato de referência).
 * Autenticação: `Authorization: Bearer <jwt>` em rotas protegidas.
 */

export const REST = {
  auth: {
    postRegister: 'POST /v1/auth/register',
    postLogin: 'POST /v1/auth/login',
    postRefresh: 'POST /v1/auth/refresh',
  },
  me: {
    get: 'GET /v1/me',
    patch: 'PATCH /v1/me',
  },
  bands: {
    post: 'POST /v1/bands',
    getById: 'GET /v1/bands/:bandId',
    patch: 'PATCH /v1/bands/:bandId',
    listMine: 'GET /v1/me/bands',
  },
  studios: {
    post: 'POST /v1/studios',
    getById: 'GET /v1/studios/:studioId',
    patch: 'PATCH /v1/studios/:studioId',
    listMine: 'GET /v1/me/studios',
    listPublic: 'GET /v1/studios?city=&q=',
  },
  /** Disponibilidade agregada para marcação (livre / bloqueado / ocupado). */
  studioAvailability: {
    getRange: 'GET /v1/studios/:studioId/availability?from=ISO&to=ISO',
  },
  blocks: {
    post: 'POST /v1/studios/:studioId/blocks',
    delete: 'DELETE /v1/studios/:studioId/blocks/:blockId',
    list: 'GET /v1/studios/:studioId/blocks?from=&to=',
  },
  bookings: {
    post: 'POST /v1/bookings',
    getById: 'GET /v1/bookings/:bookingId',
    patchStatus: 'PATCH /v1/bookings/:bookingId/status',
    listAsBand: 'GET /v1/me/bookings?as=band',
    listAsStudio: 'GET /v1/me/bookings?as=studio',
  },
} as const;

/**
 * Corpos típicos (JSON):
 *
 * POST /v1/bookings
 * { "studioId", "bandId", "start": ISO, "end": ISO, "noteFromBand"?: string }
 *
 * PATCH /v1/bookings/:id/status
 * { "status": "confirmed" | "declined" | "cancelled" }
 *
 * POST /v1/studios/:studioId/blocks
 * { "start": ISO, "end": ISO, "reason"?: string }
 *
 * PATCH /v1/studios/:studioId
 * { "defaultPricePerHourCents"?: number, "name"?: string, ... }
 */
