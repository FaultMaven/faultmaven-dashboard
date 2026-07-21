// Team admin console DTOs (POST/PATCH/DELETE /api/v1/admin/teams/*).
//
// The management counterpart to the read-only `GET /teams` (types/cases.ts,
// U12): an org admin creating / renaming / deleting teams and managing their
// membership (ADR-013; U13b cloud API). Cloud-only and inert until
// multi-tenancy is ready (ADR-010 P2).

import type { Team } from './cases';

// Team is defined with the case DTOs (U12) where it is also consumed. Re-export
// it here so the admin console imports its team shape from the teams module.
export type { Team };

export interface TeamMember {
  user_id: string;
  team_id: string;
  /** No per-team role authority in v1 (org role governs); always null today. */
  team_role: string | null;
}

export interface CreateTeamRequest {
  name: string;
  description?: string;
}

export interface UpdateTeamRequest {
  name?: string;
  description?: string;
}
