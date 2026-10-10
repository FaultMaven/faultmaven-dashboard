import { describe, it, expect } from 'vitest';
import {
  isCaseCreator,
  isCaseDriver,
  mayReassignDriver,
  personLabel,
  creatorLabel,
  driverLabel,
  SHORT_ID_LENGTH,
} from '../../../lib/cases/driver';

/**
 * ADR-020's three questions, kept apart. Every row separates the creator from
 * the driver, so a predicate keyed on the wrong one fails here.
 */
const HANDED_ON = { user_id: 'u-ada', driver_id: 'u-grace' };
const OWN = { user_id: 'u-ada', driver_id: 'u-ada' };

describe('isCaseDriver — who may write', () => {
  it('is the effective driver, never the creator', () => {
    expect(isCaseDriver(HANDED_ON, 'u-grace')).toBe(true);
    expect(isCaseDriver(HANDED_ON, 'u-ada')).toBe(false);
    expect(isCaseDriver(OWN, 'u-ada')).toBe(true);
  });

  it('fails CLOSED on an unknown driver or viewer', () => {
    expect(isCaseDriver({ user_id: 'u-ada' }, 'u-ada')).toBe(false);
    expect(isCaseDriver({ user_id: 'u-ada', driver_id: null }, 'u-ada')).toBe(false);
    expect(isCaseDriver({ user_id: 'u-ada', driver_id: '' }, '')).toBe(false);
    expect(isCaseDriver(OWN, undefined)).toBe(false);
    expect(isCaseDriver(OWN, null)).toBe(false);
  });
});

describe('isCaseCreator — who governs (share, unshare, delete)', () => {
  it('is the creator, never the driver', () => {
    expect(isCaseCreator(HANDED_ON, 'u-ada')).toBe(true);
    expect(isCaseCreator(HANDED_ON, 'u-grace')).toBe(false);
  });

  it('fails CLOSED on an unknown creator or viewer', () => {
    expect(isCaseCreator({ driver_id: 'u-ada' }, 'u-ada')).toBe(false);
    expect(isCaseCreator(OWN, undefined)).toBe(false);
  });
});

describe('mayReassignDriver — the creator OR the effective driver', () => {
  it.each([
    ['the creator who handed it on', HANDED_ON, 'u-ada', true],
    ['the driver who did not create it', HANDED_ON, 'u-grace', true],
    ['the creator who drives', OWN, 'u-ada', true],
    ['a reader who is neither', HANDED_ON, 'u-linus', false],
    ['an unknown viewer', HANDED_ON, undefined, false],
  ] as const)('%s → %s', (_name, row, viewer, expected) => {
    expect(mayReassignDriver(row, viewer)).toBe(expected);
  });
});

describe('personLabel — a name, else a short id', () => {
  it('uses the display name, with the whole id on hover', () => {
    expect(personLabel('Ada Lovelace', 'u-ada')).toEqual({
      text: 'Ada Lovelace',
      title: 'u-ada',
      isId: false,
    });
  });

  it('falls back to a SHORT id only when the name is absent or blank', () => {
    const id = '0123456789abcdef-0123';
    for (const name of [null, undefined, '', '   ']) {
      expect(personLabel(name, id)).toEqual({
        text: id.slice(0, SHORT_ID_LENGTH),
        title: id,
        isId: true,
      });
    }
  });

  it('is null when there is neither', () => {
    expect(personLabel(null, null)).toBeNull();
    expect(personLabel(undefined, undefined)).toBeNull();
  });

  it('reads the creator from user_id/creator_display_name and the driver from driver_id/driver_display_name', () => {
    const row = {
      user_id: 'u-ada',
      creator_display_name: 'Ada',
      driver_id: 'u-grace',
      driver_display_name: 'Grace',
    };
    expect(creatorLabel(row)?.text).toBe('Ada');
    expect(driverLabel(row)?.text).toBe('Grace');
  });
});
