import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { OrganizationPanel } from '../components/console/OrganizationPanel';
import { TeamsPanel } from '../components/console/TeamsPanel';
import { useAuth } from '../context/AuthContext';
import { logoutAuth } from '../lib/api';
import { APIError } from '../lib/knowledge/errors';
import {
  getOrganization,
  listOrgMembers,
  updateOrganization,
  inviteOrgMember,
  setOrgMemberRole,
  removeOrgMember,
} from '../lib/organization';
import { listAdminTeams, createTeam, updateTeam, deleteTeam } from '../lib/teams';
import type {
  Organization,
  OrganizationMember,
  OrgRole,
  UpdateOrganizationRequest,
  InviteMemberRequest,
} from '../types/organization';
import type { Team, CreateTeamRequest, UpdateTeamRequest } from '../types/teams';

/**
 * Org/Team management console (U13d; ADR-010 D7). The container for the
 * organization + teams admin panels: it owns all reads and write calls; the
 * panels are presentational.
 *
 * Reachability is gated by `canManageConsole` (the `managementConsole`
 * capability + platform_admin) at both the nav item and the route guard, so the
 * console is absent in standalone and pre-P2 cloud. The backend is the real
 * authority (org-role enforced per route); a 503 (service wired off) surfaces as
 * a friendly "not available" banner as a defensive fallback.
 */
export default function OrgTeamManagementPage() {
  const { clearAuthState } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const handleLogout = async () => {
    await logoutAuth();
    await clearAuthState();
  };

  const refreshOrg = useCallback(async () => {
    const [org, orgMembers] = await Promise.all([getOrganization(), listOrgMembers()]);
    setOrganization(org);
    setMembers(orgMembers);
  }, []);

  const refreshTeams = useCallback(async () => {
    setTeams(await listAdminTeams());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      await Promise.all([refreshOrg(), refreshTeams()]);
    } catch (err) {
      if (err instanceof APIError && err.statusCode === 503) {
        setUnavailable(true);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load the console');
      }
    } finally {
      setLoading(false);
    }
  }, [refreshOrg, refreshTeams]);

  useEffect(() => {
    void load();
  }, [load]);

  // Re-read after a write. The mutation is the awaited authority (its rejection
  // surfaces on the panel/modal that triggered it); a failed REFETCH must not be
  // reported as if the write failed, so it routes to the page banner instead —
  // the write already succeeded, the on-screen list is just briefly stale.
  const refetchOrError = useCallback(async (refetch: () => Promise<void>) => {
    try {
      await refetch();
      // A successful refresh clears any prior transient refetch banner so a
      // one-off failure doesn't stay pinned across later successful actions.
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh');
    }
  }, []);

  // --- organization handlers (refetch after each write) ------------------

  const handleUpdateOrganization = async (body: UpdateOrganizationRequest) => {
    setOrganization(await updateOrganization(body));
  };

  const handleInviteMember = async (body: InviteMemberRequest) => {
    await inviteOrgMember(body);
    await refetchOrError(refreshOrg);
  };

  const handleSetMemberRole = async (userId: string, role: OrgRole) => {
    await setOrgMemberRole(userId, role);
    await refetchOrError(refreshOrg);
  };

  const handleRemoveMember = async (userId: string) => {
    await removeOrgMember(userId);
    await refetchOrError(refreshOrg);
  };

  // --- team handlers -----------------------------------------------------

  const handleCreateTeam = async (body: CreateTeamRequest) => {
    await createTeam(body);
    await refetchOrError(refreshTeams);
  };

  const handleUpdateTeam = async (teamId: string, body: UpdateTeamRequest) => {
    await updateTeam(teamId, body);
    await refetchOrError(refreshTeams);
  };

  const handleDeleteTeam = async (teamId: string) => {
    await deleteTeam(teamId);
    await refetchOrError(refreshTeams);
  };

  return (
    <div className="min-h-screen bg-fm-canvas">
      <PageHeader onLogout={handleLogout} />

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-fm-heading font-bold text-fm-text-primary mb-1">Organization &amp; Teams</h2>
          <p className="text-fm-text-secondary text-sm">
            Manage your organization, its members, and its teams.
          </p>
        </div>

        {unavailable && (
          <div className="mb-4 text-sm text-fm-text-secondary bg-fm-surface-alt border border-fm-border rounded-fm-btn p-3">
            Organization management is not available in this deployment yet.
          </div>
        )}

        {error && (
          <div className="mb-4 text-sm text-fm-critical bg-fm-critical-bg border border-fm-critical-border rounded-fm-btn p-3">
            {error}
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-fm-text-tertiary text-sm">Loading…</div>
        ) : (
          organization && (
            <div className="space-y-6">
              <OrganizationPanel
                organization={organization}
                members={members}
                onUpdateOrganization={handleUpdateOrganization}
                onInviteMember={handleInviteMember}
                onSetMemberRole={handleSetMemberRole}
                onRemoveMember={handleRemoveMember}
              />
              <TeamsPanel
                teams={teams}
                orgMembers={members}
                onCreateTeam={handleCreateTeam}
                onUpdateTeam={handleUpdateTeam}
                onDeleteTeam={handleDeleteTeam}
              />
            </div>
          )
        )}
      </main>
    </div>
  );
}
