import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SourceBadge } from '../../components/SourceBadge';

describe('SourceBadge', () => {
  it('renders a Slack badge', () => {
    render(<SourceBadge source="slack" />);
    expect(screen.getByText('Slack')).toBeInTheDocument();
  });

  it('renders a Copilot badge', () => {
    render(<SourceBadge source="copilot" />);
    expect(screen.getByText('Copilot')).toBeInTheDocument();
  });

  it('renders nothing when source is undefined (older cases)', () => {
    const { container } = render(<SourceBadge source={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
