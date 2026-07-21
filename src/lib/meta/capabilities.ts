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
export async function getCapabilities(): Promise<MetaCapabilities> {
  const response = await fetch(`${config.apiUrl}/v1/meta/capabilities`);
  if (!response.ok) {
    throw new Error(`capabilities fetch failed: ${response.status}`);
  }
  return response.json();
}
