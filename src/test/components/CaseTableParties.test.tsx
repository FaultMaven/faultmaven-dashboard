import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CaseTable } from '../../components/CaseTable';
import { LAST_ACTIVITY_COLUMN } from '../../lib/cases/dateColumn';
import { cellUnderHeader } from '../support/caseDateColumn';
import type { CaseSummary } from '../../types/cases';

/**
 * CREATOR AND DRIVER ON EVERY ROW (ADR-020 D5).
 *
 * The Dashboard lists every case its user can read, and who may write each one
 * is its driver, not its creator — so the table names both, by display name,
 * falling back to a short id only when the server sent no name.
 */
const base: CaseSummary = {
  case_id: 'case-1',
  title: 'Database Outage',
  description: '',
  state: 'investigating',
  created_at: '2026-09-01T12:00:00Z',
  updated_at: '2026-09-20T12:00:00Z',
  last_activity_at: '2026-09-20T12:00:00Z',
  resolved_at: null,
  closed_at: null,
  closure_reason: null,
  user_id: 'u-ada-0000-1111',
  creator_display_name: 'Ada Lovelace',
  driver_id: 'u-grace-2222-3333',
  driver_display_name: 'Grace Hopper',
  enterprise_id: 'ent-1',
  current_turn: 5,
  source: 'copilot',
  stage: 'diagnosis',
  turns_without_progress: 0,
  is_terminal: false,
  shared_team_ids: [],
};

function renderRows(cases: CaseSummary[]) {
  return render(
    <MemoryRouter>
      <CaseTable cases={cases} loading={false} dateColumn={LAST_ACTIVITY_COLUMN} />
    </MemoryRouter>,
  );
}

describe('CaseTable — Creator and Driver', () => {
  it('names the creator and the driver, each in their own column', () => {
    renderRows([base]);

    expect(cellUnderHeader('Creator')).toHaveTextContent('Ada Lovelace');
    expect(cellUnderHeader('Driver')).toHaveTextContent('Grace Hopper');
  });

  it('shows the same person in both when the creator drives', () => {
    renderRows([{ ...base, driver_id: base.user_id, driver_display_name: 'Ada Lovelace' }]);

    expect(cellUnderHeader('Creator')).toHaveTextContent('Ada Lovelace');
    expect(cellUnderHeader('Driver')).toHaveTextContent('Ada Lovelace');
  });

  it('falls back to a SHORT id, with the whole id on hover, only when a name is absent', () => {
    renderRows([{ ...base, creator_display_name: null, driver_display_name: undefined }]);

    const creator = within(cellUnderHeader('Creator')).getByText('u-ada-00');
    expect(creator).toHaveAttribute('title', 'u-ada-0000-1111');
    const driver = within(cellUnderHeader('Driver')).getByText('u-grace-');
    expect(driver).toHaveAttribute('title', 'u-grace-2222-3333');
    // Never the bare whole id as the cell's text.
    expect(cellUnderHeader('Creator')).not.toHaveTextContent('u-ada-0000-1111');
  });

  it('prefers the name over the id whenever both are present', () => {
    renderRows([base]);

    expect(cellUnderHeader('Creator')).not.toHaveTextContent('u-ada-00');
    expect(cellUnderHeader('Driver')).not.toHaveTextContent('u-grace-');
  });

  it('names the CREATOR as driver on a pre-13.2.0 core, which sends no driver key', () => {
    // Before ADR-020 the creator was the only writer, and the Dashboard can
    // run ahead of its core (the images deploy independently).
    const old: CaseSummary = { ...base };
    delete old.driver_id;
    delete old.driver_display_name;
    renderRows([old]);

    expect(cellUnderHeader('Driver')).toHaveTextContent('Ada Lovelace');
  });

  it('says "Unknown" rather than nothing for a driver sent as null', () => {
    renderRows([{ ...base, driver_id: null, driver_display_name: null }]);

    expect(cellUnderHeader('Driver')).toHaveTextContent('Unknown');
  });

  it('keeps each row\'s people on its own row', () => {
    renderRows([
      base,
      {
        ...base,
        case_id: 'case-2',
        creator_display_name: 'Linus T',
        driver_display_name: 'Linus T',
      },
    ]);

    expect(cellUnderHeader('Driver', 1)).toHaveTextContent('Grace Hopper');
    expect(cellUnderHeader('Driver', 2)).toHaveTextContent('Linus T');
    expect(screen.getAllByRole('columnheader', { name: 'Driver' })).toHaveLength(1);
  });
});
