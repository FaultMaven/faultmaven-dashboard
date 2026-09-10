import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { OrganizationPanel } from '../components/console/OrganizationPanel';
import { useAuth } from '../context/AuthContext';
import { logoutAuth } from '../lib/api';
import { APIError } from '../lib/knowledge/errors';
import {
  getOrganization,
  listOrgMembers,
  updateOrganization,
  addOrgMember,
  setOrgMemberRole,
  removeOrgMember,
} from '../lib/organization';
import type {
  Organization,
  OrganizationMember,
  OrgManagementRole,
  UpdateOrganizationRequest,
  AddMemberRequest,
} from '../types/organization';

/**
 * The billing organization console (ADR-017 D5).
 *
 * An organization answers one question — who pays for these accounts — and
 * decides nothing about what anyone can see. Teams are the sharing surface and
 * live on their own page; this one used to carry both, and carrying both is
 * what made "organization" read as a visibility boundary.
 *
 * **Having no organization is the normal state.** Nobody pays for a beta
 * account, so the cloud console answers 404 and this page renders that as an
 * empty state rather than as an error. A console that reported "failed to load"
 * to every user of the product would be describing the product as broken.
 */
export default function OrganizationPage() {
  const { clearAuthState } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      await refreshOrg();
    } catch (err) {
      if (err instanceof APIError && err.statusCode === 503) {
        setUnavailable(true);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load the console');
      }
    } finally {
      setLoading(false);
    }
  }, [refreshOrg]);

  useEffect(() => {
    void load();
  }, [load]);

  // Re-read after a write. The mutation is the awaited authority (its rejection
  // surfaces on the panel/modal that triggered it); a failed REFETCH must not be
  // reported as if the write failed, so it routes to the page banner instead —
  // the write already succeeded, the on-screen list is just briefly stale.
  const refetchOrError = useCallback(async () => {
    try {
      await refreshOrg();
      // A successful refresh clears any prior transient refetch banner so a
      // one-off failure doesn't stay pinned across later successful actions.
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh');
    }
  }, [refreshOrg]);

  const handleUpdateOrganization = async (body: UpdateOrganizationRequest) => {
    setOrganization(await updateOrganization(body));
  };

  const handleAddMember = async (body: AddMemberRequest) => {
    await addOrgMember(body);
    await refetchOrError();
  };

  const handleSetMemberRole = async (userId: string, role: OrgManagementRole) => {
    await setOrgMemberRole(userId, role);
    await refetchOrError();
  };

  const handleRemoveMember = async (userId: string) => {
    await removeOrgMember(userId);
    await refetchOrError();
  };

  return (
    <div className="min-h-screen bg-fm-canvas">
      <PageHeader onLogout={handleLogout} />

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-fm-heading font-bold text-fm-text-primary mb-1">Organization</h2>
          <p className="text-fm-text-secondary text-sm">
            An organization is who pays for a set of accounts. It sets the plan and what is
            metered — it does not decide what anyone can see. Sharing happens in a team.
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
        ) : organization ? (
          <OrganizationPanel
            organization={organization}
            members={members}
            onUpdateOrganization={handleUpdateOrganization}
            onAddMember={handleAddMember}
            onSetMemberRole={handleSetMemberRole}
            onRemoveMember={handleRemoveMember}
          />
        ) : (
          !unavailable && (
            <section className="bg-fm-surface rounded-fm-card border border-fm-border p-6">
              <h3 className="text-fm-heading font-bold text-fm-text-primary mb-1">
                No billing organization yet
              </h3>
              <p className="text-sm text-fm-text-secondary">
                Nobody is being billed for this account, so there is nothing to manage here. An
                organization is created when a subscription starts; until then your account runs on
                the standard allowance. Sharing does not wait for it — start a team whenever you
                like.
              </p>
            </section>
          )
        )}
      </main>
    </div>
  );
}
