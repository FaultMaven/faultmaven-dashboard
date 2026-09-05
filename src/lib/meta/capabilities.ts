// Backend capability discovery client.

import config from '../../config';
import type { MetaCapabilities } from '../../types/meta';

/**
 * Fetch the backend's advertised capabilities.
 *
 * This is the UNAUTHENTICATED discovery endpoint (`/v1/meta/capabilities`, not
 * under `/api`) that the dashboard uses to gate features on what the deployment
 * actually supports — e.g. the org/team management console (`managementConsole`)
 * and team sharing (`teamSharing`), both keyed on the live TeamService so they
 * stay off until Cloud multi-tenancy is ready (ADR-010 P2).
 */
/**
 * `/api/v1/...`, like every other call this app makes.
 *
 * It used to be `/v1/meta/capabilities`, with no `/api`. Against a split-host
 * deployment that reached an alias and worked. Against the SAME-ORIGIN
 * deployment — the Kubernetes one, where the proxy forwards `/api/*` and the
 * SPA answers everything else — it matched the SPA rewrite instead: a 200
 * carrying `index.html`. `response.ok` was true, `response.json()` threw on the
 * leading `<`, and `useCapabilities` swallowed it into an error state nothing
 * logged. The management console simply was not there, on cloud, silently.
 *
 * The core has served this path since bf41e0fda and keeps the alias for older
 * clients, so this is a client-side correction only.
 */
export async function getCapabilities(): Promise<MetaCapabilities> {
  const path = '/api/v1/meta/capabilities';
  const response = await fetch(`${config.apiUrl}${path}`);
  if (!response.ok) {
    throw new Error(`capabilities fetch failed: ${response.status}`);
  }
  try {
    return (await response.json()) as MetaCapabilities;
  } catch (error) {
    // A 200 that is not JSON is almost always the SPA rewrite answering a path
    // the API never saw. Name the path: that is the whole diagnosis, and
    // without it this failure is indistinguishable from the backend being down.
    console.error(
      `[capabilities] ${path} returned a 200 that is not JSON — the request probably ` +
        'reached the SPA rewrite rather than the API. Features gated on capabilities ' +
        'will be treated as unavailable.',
      error,
    );
    throw new Error(`capabilities fetch returned a non-JSON 200 for ${path}`);
  }
}
