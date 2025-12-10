interface NavButton {
  label: string;
  active?: boolean;
  onClick?: () => void;
  variant?: 'primary' | 'ghost';
}

interface PageHeaderProps {
  title: string;
  navButtons: NavButton[];
  onLogout: () => void;
}

export function PageHeader({ title, navButtons, onLogout }: PageHeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        </div>

        <div className="flex items-center gap-4">
          <nav className="flex gap-2">
            {navButtons.map((btn) => {
              const isPrimary = btn.variant === 'primary' || btn.active;
              const base = 'px-4 py-2 text-sm font-medium rounded-lg';
              const cls = isPrimary
                ? `${base} text-white bg-blue-600`
                : `${base} text-gray-700 bg-white border border-gray-300 hover:bg-gray-50`;
              return (
                <button key={btn.label} onClick={btn.onClick} className={cls} disabled={btn.active && !btn.onClick}>
                  {btn.label}
                </button>
              );
            })}
          </nav>
          <button
            onClick={onLogout}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
