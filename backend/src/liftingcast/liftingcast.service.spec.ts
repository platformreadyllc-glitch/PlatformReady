import { of, throwError } from 'rxjs';
import { AxiosError, AxiosHeaders } from 'axios';
import { LiftingCastService } from './liftingcast.service';

// Minimal fake matching the one or two HttpService methods each test
// exercises - a full HttpModule/HttpService instance would make a real
// network call, which none of these tests want.
function makeHttp() {
  return { post: jest.fn(), get: jest.fn() };
}

function axios401(): AxiosError {
  return new AxiosError(
    'Request failed',
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    {
      status: 401,
      statusText: 'Unauthorized',
      data: {},
      headers: {},
      config: { headers: new AxiosHeaders() },
    },
  );
}

describe('LiftingCastService', () => {
  describe('testConnection', () => {
    it('without a relayUrl, authenticates against the live site', async () => {
      const http = makeHttp();
      http.post.mockReturnValueOnce(of({ data: { ok: true } }));
      http.get.mockReturnValueOnce(
        of({ data: { docs: [{ _id: 'p1', name: 'Platform 1' }] } }),
      );
      const service = new LiftingCastService(http as never, {} as never);

      const result = await service.testConnection({
        meetId: 'm1',
        platformId: 'p1',
        password: 'pw',
      });

      expect(result).toEqual({ success: true, platformName: 'Platform 1' });
      expect(http.post).toHaveBeenCalledWith(
        'https://couchdb.liftingcast.com/_session',
        expect.any(String),
        expect.anything(),
      );
      expect(http.get).toHaveBeenCalledWith(
        'https://liftingcast.com/api/meets/m1/platforms',
      );
    });

    // The relay (liftingcast/liftingcast-local-relay-server) splits its
    // web UI (port 80, what relayUrl points at) from its actual CouchDB
    // instance (always port 5984) into two separate containers - _session
    // only exists on the latter. Confirmed live against a real relay: a
    // POST to relayUrl's own port for _session comes back 405, not 200/401.
    it('with a relayUrl, authenticates against the relay database on port 5984, not the relay web port', async () => {
      const http = makeHttp();
      http.post.mockReturnValueOnce(of({ data: { ok: true } }));
      http.get.mockReturnValueOnce(
        of({ data: { docs: [{ _id: 'p1', name: 'Platform 1' }] } }),
      );
      const service = new LiftingCastService(http as never, {} as never);

      const result = await service.testConnection({
        meetId: 'm1',
        platformId: 'p1',
        password: 'pw',
        relayUrl: 'http://192.168.1.50',
      });

      expect(result).toEqual({ success: true, platformName: 'Platform 1' });
      expect(http.post).toHaveBeenCalledWith(
        'http://192.168.1.50:5984/_session',
        expect.any(String),
        expect.anything(),
      );
      // The web-UI routes (platform lookup here; lights/clock/etc. via
      // getSessionUrl() below) stay on relayUrl as given - only the
      // CouchDB session check needs the port override.
      expect(http.get).toHaveBeenCalledWith(
        'http://192.168.1.50/api/meets/m1/platforms',
      );
    });

    it('ignores any port already present in relayUrl and still targets 5984 for the session check', async () => {
      const http = makeHttp();
      http.post.mockReturnValueOnce(of({ data: { ok: true } }));
      http.get.mockReturnValueOnce(of({ data: { docs: [] } }));
      const service = new LiftingCastService(http as never, {} as never);

      await service.testConnection({
        meetId: 'm1',
        platformId: 'p1',
        password: 'pw',
        relayUrl: 'http://192.168.1.50:8080',
      });

      expect(http.post).toHaveBeenCalledWith(
        'http://192.168.1.50:5984/_session',
        expect.any(String),
        expect.anything(),
      );
    });

    it('a malformed relayUrl fails cleanly instead of throwing', async () => {
      const http = makeHttp();
      const service = new LiftingCastService(http as never, {} as never);

      const result = await service.testConnection({
        meetId: 'm1',
        platformId: 'p1',
        password: 'pw',
        relayUrl: 'not a url',
      });

      expect(result).toEqual({
        success: false,
        error: 'Invalid relay server address',
      });
      expect(http.post).not.toHaveBeenCalled();
    });

    it('a wrong password (401 from the session check) reports invalid credentials', async () => {
      const http = makeHttp();
      http.post.mockReturnValueOnce(throwError(() => axios401()));
      const service = new LiftingCastService(http as never, {} as never);

      const result = await service.testConnection({
        meetId: 'm1',
        platformId: 'p1',
        password: 'wrong',
      });

      expect(result).toEqual({
        success: false,
        error: 'Invalid meet ID or password',
      });
      expect(http.get).not.toHaveBeenCalled();
    });

    it('a platformId not present in the meet reports it as not found', async () => {
      const http = makeHttp();
      http.post.mockReturnValueOnce(of({ data: { ok: true } }));
      http.get.mockReturnValueOnce(
        of({ data: { docs: [{ _id: 'other-platform', name: 'X' }] } }),
      );
      const service = new LiftingCastService(http as never, {} as never);

      const result = await service.testConnection({
        meetId: 'm1',
        platformId: 'p1',
        password: 'pw',
      });

      expect(result).toEqual({
        success: false,
        error: 'Platform ID not found in this meet',
      });
    });
  });

  describe('live push (notifyNextAttempt) session URL', () => {
    it('without a stored relayUrl, pushes to the live site', async () => {
      const http = makeHttp();
      http.post.mockReturnValueOnce(of({ data: {} }));
      const service = new LiftingCastService(http as never, {} as never);
      service.storeSession('platform-1', {
        meetId: 'm1',
        lcPlatformId: 'p1',
        password: 'pw',
      });

      await service.notifyNextAttempt('platform-1');

      expect(http.post).toHaveBeenCalledWith(
        'https://liftingcast.com/api/meets/m1/platforms/p1/next_attempt',
        { password: 'pw' },
      );
    });

    it('with a stored relayUrl, pushes to the relay instead - not port-shifted, unlike the _session check', async () => {
      const http = makeHttp();
      http.post.mockReturnValueOnce(of({ data: {} }));
      const service = new LiftingCastService(http as never, {} as never);
      service.storeSession('platform-1', {
        meetId: 'm1',
        lcPlatformId: 'p1',
        password: 'pw',
        relayUrl: 'http://192.168.1.50',
      });

      await service.notifyNextAttempt('platform-1');

      expect(http.post).toHaveBeenCalledWith(
        'http://192.168.1.50/api/meets/m1/platforms/p1/next_attempt',
        { password: 'pw' },
      );
    });

    it('with no session stored for the platform, skips the push without throwing', async () => {
      const http = makeHttp();
      const service = new LiftingCastService(http as never, {} as never);

      await expect(
        service.notifyNextAttempt('unknown-platform'),
      ).resolves.toBeUndefined();
      expect(http.post).not.toHaveBeenCalled();
    });
  });

  describe('browse relay passthrough', () => {
    it('fetchUpcomingMeets hits the relay when given one, the live site otherwise', async () => {
      const http = makeHttp();
      http.get.mockReturnValueOnce(of({ data: { docs: [] } }));
      const service = new LiftingCastService(http as never, {} as never);

      await service.fetchUpcomingMeets('http://192.168.1.50');

      expect(http.get).toHaveBeenCalledWith('http://192.168.1.50/api/meets');
    });
  });
});
