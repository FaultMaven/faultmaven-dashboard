import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PaginationControls } from '../../components/PaginationControls';

describe('PaginationControls', () => {
  it('shows the row range for the current page (not a cumulative count)', () => {
    render(<PaginationControls page={1} pageSize={20} total={55} onPageChange={() => {}} />);
    // Page 2 of a 20-per-page list of 55 => rows 21–40.
    expect(screen.getByText(/Showing 21–40 of 55/)).toBeInTheDocument();
    expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument();
  });

  it('caps the range end at the total on the last, partial page', () => {
    render(<PaginationControls page={2} pageSize={20} total={55} onPageChange={() => {}} />);
    expect(screen.getByText(/Showing 41–55 of 55/)).toBeInTheDocument();
  });

  it('shows a 0 start when there are no rows', () => {
    render(<PaginationControls page={0} pageSize={20} total={0} onPageChange={() => {}} />);
    expect(screen.getByText(/Showing 0–0 of 0/)).toBeInTheDocument();
  });
});
