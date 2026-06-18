import { render, screen } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { CopilotEntry } from '../../components/CopilotEntry';

describe('CopilotEntry', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-faultmaven-copilot');
  });

  it('shows the Chrome Web Store CTA when the copilot is not detected', () => {
    render(<CopilotEntry />);
    const link = screen.getByText(/get the copilot/i).closest('a');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', expect.stringContaining('chromewebstore'));
  });

  it('shows the toolbar hint when the copilot has marked the page', () => {
    document.documentElement.setAttribute('data-faultmaven-copilot', '0.4.0');
    render(<CopilotEntry />);
    expect(screen.getByText(/in your toolbar/i)).toBeInTheDocument();
    expect(screen.queryByText(/get the copilot/i)).not.toBeInTheDocument();
  });
});
