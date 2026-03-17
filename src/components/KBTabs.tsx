export type KBTier = 'personal' | 'team' | 'global';

interface KBTabsProps {
  activeTab: KBTier;
  availableTabs: KBTier[];
  onChange: (tab: KBTier) => void;
}

const TAB_LABELS: Record<KBTier, string> = {
  personal: 'My Knowledge Base',
  team: 'Team KB',
  global: 'Global KB',
};

export function KBTabs({ activeTab, availableTabs, onChange }: KBTabsProps) {
  if (availableTabs.length <= 1) return null;

  const tabBtnBase = 'px-4 py-2 text-sm font-medium border-b-2 transition-colors';
  const tabActive = 'border-fm-accent text-fm-accent';
  const tabInactive = 'border-transparent text-fm-text-secondary hover:text-fm-text-primary';

  return (
    <div className="flex border-b border-fm-border mb-6">
      {availableTabs.map((tier) => (
        <button
          key={tier}
          onClick={() => onChange(tier)}
          className={`${tabBtnBase} ${activeTab === tier ? tabActive : tabInactive}`}
        >
          {TAB_LABELS[tier]}
        </button>
      ))}
    </div>
  );
}
