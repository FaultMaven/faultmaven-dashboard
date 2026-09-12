import { Link, useLocation } from 'react-router-dom';
import { useNavigationItems } from '../hooks/useNavigationItems';
import { CopilotEntry } from './CopilotEntry';
import { AccountMenu } from './AccountMenu';

interface PageHeaderProps {
  onLogout: () => void;
}

export function PageHeader({ onLogout }: PageHeaderProps) {
  const location = useLocation();
  const navItems = useNavigationItems(location.pathname);

  return (
    <header className="bg-fm-surface border-b border-fm-border px-6 py-4">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-y-3">
        <div className="flex items-center">
          <img src="/icon/design-transparent.svg" alt="FaultMaven" className="h-10" />
        </div>

        <div className="flex items-center gap-4">
          {/* WRAPS. A cloud `platform_admin` with both capabilities on now gets
              eight items — New Case, Cases, Knowledge Base, Teams, All Cases,
              LLM Settings, Users, Organization — roughly 900px of pills sharing
              a `max-w-7xl` row with the logo, the Copilot entry and the account
              menu. Without wrapping they squeeze and their labels break
              mid-word on anything under ~1400px. `whitespace-nowrap` keeps each
              label intact so it is the ROW that gives, not the words. */}
          <nav className="flex flex-wrap justify-end gap-2">
            {navItems.map((item) => {
              const base =
                'px-4 py-2 text-sm font-medium rounded-fm-btn transition-colors whitespace-nowrap';
              // An ACTION is filled and carries a leading `+`; every other item
              // is a destination and is outlined. Without that distinction
              // "New Case" sat among "Cases" and "Knowledge Base" and read as
              // another view of the case list rather than a control that
              // creates one. The `+` is also what `@faultmaven/copilot-ui`
              // puts on the same button, so the two frontends agree.
              const cls = item.action
                ? `${base} text-white bg-fm-accent hover:bg-fm-accent/90`
                : item.active
                  ? `${base} text-white bg-fm-accent`
                  : `${base} text-fm-text-secondary border border-fm-border hover:bg-fm-elevated`;
              return (
                <Link key={item.path} to={item.path} className={cls}>
                  {item.action && <span aria-hidden="true">+ </span>}
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <CopilotEntry />
          <AccountMenu onLogout={onLogout} />
        </div>
      </div>
    </header>
  );
}
