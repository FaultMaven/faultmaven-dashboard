import { useEffect, useRef, useState, type FocusEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { accountInitials, elevatedRole, identityColor } from '../lib/identity';
import { getAccountProfile, type AccountProfile } from '../lib/api';
import { usePrefersExtensionForChat } from '../hooks/useChatSurface';
import { useCopilotPresence } from '../hooks/useCopilotPresence';
import { setPrefersExtensionForChat } from '../lib/copilot/chatSurfacePreference';
import { COPILOT_STORE_URL } from '../copilot/storeListing';

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
  const prefersExtension = usePrefersExtensionForChat();
  const copilotInstalled = useCopilotPresence();
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

          {/*
            WHERE CHAT LIVES (ADR-018 D3), and it must be reachable from here
            rather than only from an offer.
            Extension presence is reported by the auth-bridge content script,
            which registers only once host permission for this origin has been
            granted — on a self-hosted origin without that grant the Dashboard
            never learns the extension exists, so an offer would never appear
            and the preference would be unreachable for exactly the people most
            likely to want it.

            A toggle, not a link to a settings page: it is one boolean, it is
            per browser profile rather than per account, and the whole reason it
            is safe to have is that there is always a visible one-click way
            back. Burying it would remove that property.
          */}
          <div className="border-t border-fm-border px-4 py-3">
            {/* The label names the control and nothing else. Wrapping the
                helper sentence too put it in the ACCESSIBLE NAME, which then
                changed on every toggle — a control whose name mutates with its
                state is announced as a different control. It is a description,
                so it is referenced as one. */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={prefersExtension}
                onChange={(e) => setPrefersExtensionForChat(e.target.checked)}
                aria-describedby="chat-surface-help chat-surface-requirement"
                className="mt-0.5 accent-fm-accent"
              />
              <span className="min-w-0 text-sm text-fm-text-primary">
                Use the Copilot extension for chat
              </span>
            </label>

            {/* OUT of the label, which is where it always should have been.
                The comment above has claimed since it was written that this
                sentence is "a description, so it is referenced as one" — but it
                was referenced as one AND left inside the `<label>`, and
                `aria-describedby` does not remove content from the name
                computation. Measured: the accessible name was
                "Use the Copilot extension for chatChat here, beside the case
                record." and became "…This Dashboard shows cases only. Turn this
                off to chat here again." on toggle — a control announced as a
                different control every time it is used, which is the exact
                defect the comment says was avoided. Screen readers also read it
                twice, once as name and once as description. */}
            <span
              id="chat-surface-help"
              className="block pl-7 text-fm-xs text-fm-text-tertiary mt-0.5"
            >
              {prefersExtension
                ? 'This Dashboard shows cases only. Turn this off to chat here again.'
                : 'Chat here, beside the case record.'}
            </span>

            {/*
              THE PREREQUISITE, said before the switch rather than discovered
              after it.

              This toggle is the one place chat can be moved to the extension
              WITHOUT the extension having been seen — `CopilotEntry`'s offer
              only appears once something is announcing, and that is deliberate
              (a self-hosted user who never granted host permission is
              undetectable, so gating the toggle on detection would put the
              preference out of reach of exactly the people most likely to want
              it). The cost of leaving it open is that someone can switch chat
              to a side panel they have not installed and be left with no chat
              surface anywhere. A sentence and a link are what close that,
              without closing the toggle.

              OUTSIDE THE `<label>`, not inside it. A link nested in a label is
              reachable but not usable: the click bubbles and toggles the
              checkbox, so following it would flip the very preference the user
              came here to read about first. It is referenced as a DESCRIPTION
              instead, which is where it belongs anyway — the label names the
              control, and a name that changed with the install state would be
              announced as a different control.

              DETECTION IS ONE-DIRECTIONAL, so the two branches are not
              symmetric. Announcing PROVES installed, so that branch states it.
              Silence proves nothing — the content script does not register
              without host permission for this origin — so the other branch says
              what the switch NEEDS, never what the user lacks. Told "you do not
              have the extension", a self-hosted user typing into their side
              panel would simply know the sentence was wrong.

              ⚠️ BOTH BRANCHES NAME THE BROWSERS, and the detected one most of
              all. "Installed" is NOT the prerequisite — "installed AND has a
              side panel to move chat into" is, and those come apart on Firefox:
              `auth-bridge.content.ts` calls `announceCopilotPresence` with no
              browser gate, so the MV2 build stamps the attribute and this reads
              as installed, while `wxt.config.ts` declares `sidePanel` only for
              CHROMIUM_TARGETS and no `sidebar_action` exists anywhere. A green
              tick there told a Firefox user the prerequisite was met; they tick
              the box, the Dashboard removes the dock, `New Case` and
              `/investigate`, and NOTHING receives chat. This note existed to
              prevent that strand and was instead encouraging it.

              A web page cannot feature-detect another browser's side panel, so
              the copy names where one exists rather than pretending to know.
            */}
            <p
              // A CALLOUT only while something is owed. A requirement the user
              // has to act on earns the weight; one already met is a note, and
              // boxing it would give a satisfied condition the same urgency as
              // an unsatisfied one every time the menu is opened.
              // SAME left edge in both branches, and the same as the helper
              // sentence above (`pl-7` = 1.75rem). The detected branch indented
              // with padding while the callout shifted its whole box by `ml-7`
              // and then added its own `px-2.5`, putting its text 0.625rem
              // further right — so the sentence visibly jumped left the moment
              // an extension began announcing, which is the exact flow one of
              // these tests exercises and none of them could see.
              className={
                copilotInstalled
                  ? 'mt-1.5 pl-7 text-fm-xs leading-relaxed text-fm-success'
                  : 'mt-2 ml-[1.125rem] rounded-fm-btn bg-fm-surface-alt px-2.5 py-1.5 text-fm-xs leading-relaxed'
              }
            >
              {copilotInstalled ? (
                <span id="chat-surface-requirement">
                  <span aria-hidden="true">✓ </span>
                  Copilot extension detected. Chat moves to its side panel, which
                  Chrome, Edge and Opera have.
                </span>
              ) : (
                <>
                  {/* THE DESCRIBED ELEMENT IS THIS SPAN, not the paragraph.
                      Pointing `aria-describedby` at the whole `<p>` swept in the
                      link below it, so a screen reader read "Get the Copilot" as
                      description prose on every focus of the checkbox —
                      flattened to text, with no way to activate it from there.
                      The user had to leave the description and tab forward to
                      reach the real link. Describedby targets should be
                      non-interactive. */}
                  <span id="chat-surface-requirement" className="text-fm-text-tertiary">
                    Needs the Copilot extension, and a browser with a side panel
                    (Chrome, Edge or Opera).
                  </span>{' '}
                  <a
                    href={COPILOT_STORE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-fm-accent hover:underline whitespace-nowrap rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-fm-accent"
                  >
                    Get the Copilot
                    <span aria-hidden="true"> ↗</span>
                  </a>
                </>
              )}
            </p>
          </div>

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
