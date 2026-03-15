interface NavButton {
  label: string;
  active?: boolean;
  onClick?: () => void;
}

interface PageHeaderProps {
  title: string;
  navButtons: NavButton[];
  onLogout: () => void;
}

export function PageHeader({ title, navButtons, onLogout }: PageHeaderProps) {
  return (
    <header className="bg-fm-surface border-b border-fm-border px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img src="/icon/square-transparent.svg" alt="FaultMaven" className="w-10 h-10 rounded-lg" />
          <h1 className="text-xl font-bold text-fm-text-primary">{title}</h1>
        </div>

        <div className="flex items-center gap-4">
          <nav className="flex gap-2">
            {navButtons.map((btn) => {
              const base = 'px-4 py-2 text-sm font-medium rounded-fm-btn transition-colors';
              const cls = btn.active
                ? `${base} text-white bg-fm-accent`
                : `${base} text-fm-text-secondary border border-fm-border hover:bg-fm-elevated`;
              return (
                <button key={btn.label} onClick={btn.onClick} className={cls} disabled={btn.active && !btn.onClick}>
                  {btn.label}
                </button>
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
