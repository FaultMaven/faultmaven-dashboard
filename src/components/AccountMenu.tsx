import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { accountInitials, elevatedRole, identityColor } from '../lib/identity';
import { getAccountProfile, type AccountProfile } from '../lib/auth/functions';

interface AccountMenuProps {
  onLogout: () => void;
}

/**
 * Signed-in account, and the control that ends the session.
 *
 * Replaces a bare "Logout" button that named an action without its object. The
 * Copilot signs in separately, so which account the Dashboard holds is a real
 * question a user can otherwise only answer by signing out to find out.
 */
export function AccountMenu({ onLogout }: AccountMenuProps) {
  const { authState } = useAuth();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const user = authState?.user;

  // The organization is only on /auth/me, and only interesting once someone
  // asks whose session this is — so it is fetched when the menu opens, not on
  // every page load. A failure leaves the row out; the stored identity below
  // still renders, because that is what the user came here to read.
  useEffect(() => {
    if (!open || profile) return;
    let cancelled = false;
    getAccountProfile()
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        /* Display-only: the menu is still useful without the tenant name. */
      });
    return () => {
      cancelled = true;
    };
  }, [open, profile]);

  // Close on outside click and on Escape. Escape returns focus to the trigger
  // so keyboard users are not dropped at the top of the document.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  const initials = accountInitials(user.display_name, user.username, user.email);
  const color = identityColor(user.user_id);
  const name = user.display_name || user.username;
  const role = elevatedRole(profile?.roles ?? user.roles);
  const organization = profile?.organization ?? null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${name}`}
        className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border border-fm-border bg-fm-surface-alt hover:bg-fm-elevated transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-fm-accent"
      >
        <span
          className="w-7 h-7 rounded-full grid place-items-center text-fm-xs font-bold text-fm-base shrink-0"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        >
          {initials}
        </span>
        <span className="text-sm font-medium text-fm-text-primary max-w-[11rem] truncate">
          {name}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-72 bg-fm-elevated border border-fm-border-strong rounded-fm-card shadow-fm-card overflow-hidden z-50"
        >
          <div className="flex items-start gap-3 p-4">
            <span
              className="w-10 h-10 rounded-fm-btn grid place-items-center text-sm font-bold text-fm-base shrink-0"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            >
              {initials}
            </span>
            <div className="min-w-0 flex flex-col">
              <span className="text-sm font-semibold text-fm-text-primary truncate">
                {name}
              </span>
              <span className="text-fm-xs text-fm-text-tertiary font-mono truncate">
                {user.email}
              </span>
            </div>
          </div>

          <dl className="border-t border-fm-border text-fm-xs">
            <div className="flex items-center justify-between gap-3 px-4 py-2">
              <dt className="text-fm-text-tertiary uppercase tracking-wide">
                Signed in as
              </dt>
              <dd className="text-fm-text-secondary truncate">{user.username}</dd>
            </div>

            {organization && (
              <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-fm-border">
                <dt className="text-fm-text-tertiary uppercase tracking-wide">
                  Organization
                </dt>
                <dd className="text-fm-text-secondary truncate">
                  {organization.name}
                </dd>
              </div>
            )}

            {role && (
              <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-fm-border">
                <dt className="text-fm-text-tertiary uppercase tracking-wide">
                  Role
                </dt>
                <dd>
                  <span className="px-2 py-0.5 rounded text-fm-xs font-semibold text-fm-warning bg-fm-warning-bg border border-fm-warning-border">
                    {role}
                  </span>
                </dd>
              </div>
            )}
          </dl>

          <div className="border-t border-fm-border p-1">
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="w-full text-left px-3 py-2 rounded-fm-btn text-sm text-fm-critical hover:bg-fm-critical-bg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-fm-critical"
            >
              Sign out everywhere
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
