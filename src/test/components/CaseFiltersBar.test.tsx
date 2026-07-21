import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CaseFiltersBar } from '../../components/CaseFiltersBar';
import type { CaseFilters } from '../../types/cases';

describe('CaseFiltersBar', () => {
  it('preserves other active filters when typing in search', async () => {
    const onChange = vi.fn();

    // Mount with no filters, then update filters (as the parent does after a
    // chip click). The debounced search callback is memoized on [onChange]; the
    // stale-closure bug captured the first-render (empty) filters and wiped the
    // state/archived chips on the next keystroke.
    const { rerender } = render(<CaseFiltersBar filters={{}} onChange={onChange} />);

    const activeFilters: CaseFilters = { state: 'resolved', include_archived: true };
    rerender(<CaseFiltersBar filters={activeFilters} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Search cases'), {
      target: { value: 'payment' },
    });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        state: 'resolved',
        include_archived: true,
        search: 'payment',
      })
    );
  });

  it('clears the search key when the query is emptied', async () => {
    const onChange = vi.fn();
    render(<CaseFiltersBar filters={{ state: 'investigating' }} onChange={onChange} />);

    const input = screen.getByLabelText('Search cases');
    fireEvent.change(input, { target: { value: 'db' } });
    fireEvent.change(input, { target: { value: '' } });

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({ state: 'investigating', search: undefined })
    );
  });

  it('applies a state chip without dropping an existing search term', () => {
    const onChange = vi.fn();
    render(<CaseFiltersBar filters={{ search: 'db' }} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Resolved' }));

    expect(onChange).toHaveBeenCalledWith({ search: 'db', state: 'resolved' });
  });
});
