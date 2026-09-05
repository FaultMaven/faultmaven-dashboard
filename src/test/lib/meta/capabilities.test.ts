import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../config', () => ({ default: { apiUrl: 'https://api.faultmaven.ai' } }));

import { getCapabilities } from '../../../lib/meta/capabilities';

/**
 * The capability probe has to reach the API, not the SPA.
 *
 * It used to request `/v1/meta/capabilities` — no `/api`. On a split-host
 * deployment that hit an alias and worked, which is why it survived. On the
 * SAME-ORIGIN deployment, where the proxy forwards `/api/*` and the SPA answers
 * everything else, it matched the SPA rewrite: a 200 carrying `index.html`.
 * `response.ok` was true, `json()` threw on the leading `<`, and the caller
 * swallowed it into an error state nothing logged — so on cloud the management
 * console was simply absent, with no way to tell that from "not enabled".
 */

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

/** A 200 carrying the SPA's index.html — what the rewrite actually returns. */
function spaRewriteResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON");
    },
  };
}

describe('the path it requests', () => {
  it('is under /api, like every other call this app makes', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ managementConsole: true }));

    await getCapabilities();

    expect(fetchMock).toHaveBeenCalledWith('https://api.faultmaven.ai/api/v1/meta/capabilities');
  });

  it('is not the un-prefixed path the SPA rewrite would answer', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    await getCapabilities();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).not.toMatch(/faultmaven\.ai\/v1\//);
  });

  it('composes correctly for the SAME-ORIGIN deployment', async () => {
    // `config.apiUrl` is `""` there, so the request must come out as a
    // root-relative `/api/v1/...` that the proxy forwards.
    vi.resetModules();
    vi.doMock('../../../config', () => ({ default: { apiUrl: '' } }));
    const { getCapabilities: sameOrigin } = await import('../../../lib/meta/capabilities');
    fetchMock.mockResolvedValue(jsonResponse({}));

    await sameOrigin();

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/meta/capabilities');
    vi.doUnmock('../../../config');
    vi.resetModules();
  });
});

describe('a 200 that is not JSON', () => {
  it('throws rather than resolving something unusable', async () => {
    fetchMock.mockResolvedValue(spaRewriteResponse());

    await expect(getCapabilities()).rejects.toThrow(/non-JSON 200/);
  });

  it('LOGS at error level, naming the path', async () => {
    // The whole diagnosis is the path: without it this is indistinguishable
    // from the backend being down, and the caller only records "error".
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockResolvedValue(spaRewriteResponse());

    await expect(getCapabilities()).rejects.toThrow();

    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(logged).toContain('/api/v1/meta/capabilities');
    expect(logged).toMatch(/SPA rewrite/i);
  });
});

describe('an outright failure', () => {
  it('still reports the status, and does not log the SPA diagnosis', async () => {
    // A 503 is the backend being unwell, which is a different thing to say.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

    await expect(getCapabilities()).rejects.toThrow(/503/);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
