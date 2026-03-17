import { Link, useLocation } from 'react-router-dom';
import { useNavigationItems } from '../hooks/useNavigationItems';

interface PageHeaderProps {
  onLogout: () => void;
}

export function PageHeader({ onLogout }: PageHeaderProps) {
  const location = useLocation();
  const navItems = useNavigationItems(location.pathname);

  return (
    <header className="bg-fm-surface border-b border-fm-border px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center">
          <img src="/icon/design-transparent.svg" alt="FaultMaven" className="h-10" />
        </div>

        <div className="flex items-center gap-4">
          <nav className="flex gap-2">
            {navItems.map((item) => {
              const base = 'px-4 py-2 text-sm font-medium rounded-fm-btn transition-colors';
              const cls = item.active
                ? `${base} text-white bg-fm-accent`
                : `${base} text-fm-text-secondary border border-fm-border hover:bg-fm-elevated`;
              return (
                <Link key={item.path} to={item.path} className={cls}>
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <button
            onClick={onLogout}
            className="px-4 py-2 text-sm font-medium text-fm-text-secondary hover:text-fm-text-primary transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
