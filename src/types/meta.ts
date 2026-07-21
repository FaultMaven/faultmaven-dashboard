// Backend capability discovery (GET /v1/meta/capabilities).
//
// The unauthenticated endpoint the dashboard and copilot read to gate features
// on what the deployment actually supports. Every field is optional so an older
// backend (or a partial response) degrades to "feature off" rather than throwing.

export interface MetaCapabilityFeatures {
  extensionKB?: boolean;
  adminKB?: boolean;
  /** Team-based KB/case sharing (ADR-013). Lit only when a TeamService is wired. */
  teamSharing?: boolean;
  /**
   * Org/Team management console (the composed Cloud admin module, ADR-010 D7).
   * Keyed on the live TeamService, so it stays off in standalone AND in cloud
   * until multi-tenancy is ready (ADR-010 P2). The console UI gates on this.
   */
  managementConsole?: boolean;
  caseHistory?: boolean;
  sso?: boolean;
}

export interface MetaCapabilities {
  deploymentMode?: string;
  kbManagement?: string;
  dashboardUrl?: string;
  features?: MetaCapabilityFeatures;
}
