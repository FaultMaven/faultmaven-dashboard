import { useEffect, useRef, useState, type FocusEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { accountInitials, elevatedRole, identityColor } from '../lib/identity';
import { getAccountProfile, type AccountProfile } from '../lib/api';

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
  const panelRef = useRef<HTMLDivElement>(null);
  // Guards on the request, not on its result: `profile` is still null while one
  // is in flight, so open/close/open would otherwise fire a fetch per open.
  const fetchStartedRef = useRef(false);

  const user = authState?.user;

  // The organization is only on /auth/me, and only interesting once someone
  // asks whose session this is — so it is fetched when the menu opens, not on
  // every page load. A failure leaves the row out; the stored identity below
  // still renders, because that is what the user came here to read.
  useEffect(() => {
    if (!open || fetchStartedRef.current) return;
    fetchStartedRef.current = true;
    let cancelled = false;
    getAccountProfile()
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        // Display-only: the menu is still useful without the tenant name. The
        // guard stays set — a failing /auth/me should not be retried on every
        // open of a menu that reads fine without it.
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Move focus into the panel when it opens, so a screen reader announces the
  // account details it just revealed instead of leaving the user on a trigger
  // whose popup they now have to hunt for. The panel itself takes focus (not
  // the sign-out button): the details are what the user came for, and landing
  // on a destructive action is a poor place to arrive.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

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
  // Trimmed on the same terms as the initials, so the two halves of the trigger
  // cannot disagree: a whitespace-only display_name would otherwise render a
  // blank name beside a monogram derived from the username.
  const name = user.display_name?.trim() || user.username?.trim() || user.email;
  const role = elevatedRole(profile?.roles ?? user.roles);
  const organization = profile?.organization ?? null;

  // Closing when focus leaves keeps the panel from floating over the page after
  // a keyboard user tabs past it. relatedTarget null (window blur, browser
  // chrome) deliberately does not close: focus is coming back.
  const onPanelBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && !containerRef.current?.contains(next)) setOpen(false);
  };

  return (
    <div className="relative" ref={containerRef} onBlur={onPanelBlur}>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
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
        // A dialog, not a menu: nearly everything in here is read, not chosen.
        // role="menu" puts a screen reader into application mode, where the
        // identity rows — the reason the panel exists — commonly go unannounced
        // and arrow-key navigation is expected but absent.
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Account details"
          tabIndex={-1}
          className="absolute right-0 mt-2 w-72 bg-fm-elevated border border-fm-border-strong rounded-fm-card shadow-fm-card overflow-hidden z-50 focus:outline-none"
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
              type="button"
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
