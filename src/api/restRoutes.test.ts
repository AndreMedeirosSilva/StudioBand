import { describe, expect, it } from 'vitest';
import { REST } from './restRoutes';

describe('restRoutes', () => {
  it('expõe rotas principais esperadas', () => {
    expect(REST.auth.postLogin).toBe('POST /v1/auth/login');
    expect(REST.studios.listPublic).toContain('/v1/studios');
    expect(REST.bookings.patchStatus).toContain('/v1/bookings/:bookingId/status');
    expect(REST.blocks.post).toContain('/v1/studios/:studioId/blocks');
  });
});
