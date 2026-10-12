import { describe, it, expect } from 'vitest';
import {
  isCaseCreator,
  isCaseDriver,
  mayReassignDriver,
  personLabel,
  creatorLabel,
  driverLabel,
  effectiveDriverId,
  SHORT_ID_LENGTH,
  disambiguatedLabels,
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

  it('an ABSENT driver_id key is a pre-13.2.0 core, where the creator drives', () => {
    // The Dashboard and the API deploy independently, so the Dashboard can run
    // ahead of its core. Before ADR-020 the creator was the only writer.
    expect(effectiveDriverId({ user_id: 'u-ada' })).toBe('u-ada');
    expect(isCaseDriver({ user_id: 'u-ada' }, 'u-ada')).toBe(true);
    expect(isCaseDriver({ user_id: 'u-ada' }, 'u-grace')).toBe(false);
  });

  it('a PRESENT null driver fails closed — even for the creator', () => {
    // No 13.2.0 core sends it (`driver_id` is the effective driver), so a null
    // is "unknown", never "the creator".
    expect(effectiveDriverId({ user_id: 'u-ada', driver_id: null })).toBeNull();
    expect(isCaseDriver({ user_id: 'u-ada', driver_id: null }, 'u-ada')).toBe(false);
  });

  it('a driver id that is not the viewer is read-only, whoever created it', () => {
    expect(isCaseDriver(HANDED_ON, 'u-ada')).toBe(false);
    expect(isCaseDriver(HANDED_ON, 'u-linus')).toBe(false);
  });

  it('fails CLOSED on an unknown viewer, or empty ids', () => {
    expect(isCaseDriver({ user_id: 'u-ada', driver_id: '' }, '')).toBe(false);
    expect(isCaseDriver({ user_id: '' }, '')).toBe(false);
    expect(isCaseDriver(OWN, undefined)).toBe(false);
    expect(isCaseDriver(OWN, null)).toBe(false);
    expect(isCaseDriver({ user_id: 'u-ada' }, undefined)).toBe(false);
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

  it('names the CREATOR as driver on a pre-13.2.0 core (no driver_id key), nobody on a null', () => {
    expect(driverLabel({ user_id: 'u-ada', creator_display_name: 'Ada' })?.text).toBe('Ada');
    expect(driverLabel({ user_id: 'u-ada', creator_display_name: 'Ada', driver_id: null })).toBeNull();
  });
});

describe('disambiguatedLabels — no two candidates read the same', () => {
  const A = { user_id: '3f9a12bc-0000-4000-8000-000000000001', display_name: 'Member 3f9a' };
  const B = { user_id: '3f9aeeee-0000-4000-8000-000000000002', display_name: 'Member 3f9a' };
  const ADA = { user_id: 'u-ada', display_name: 'Ada Lovelace' };

  it('appends the id prefix to each of two identical "Member xxxx" labels, keeping the whole id on hover', () => {
    const out = disambiguatedLabels([A, B, ADA]);
    expect(out.get(A.user_id)?.text).toBe('Member 3f9a (3f9a12bc)');
    expect(out.get(B.user_id)?.text).toBe('Member 3f9a (3f9aeeee)');
    expect(out.get(A.user_id)?.title).toBe(A.user_id);
  });

  it('tells apart a real name that collides with another real name', () => {
    const x = { user_id: 'aaaaaaaa-1', display_name: 'Sam Lee' };
    const y = { user_id: 'bbbbbbbb-2', display_name: ' Sam Lee ' };
    const out = disambiguatedLabels([x, y]);
    expect(out.get(x.user_id)?.text).toBe('Sam Lee (aaaaaaaa)');
    expect(out.get(y.user_id)?.text).toBe('Sam Lee (bbbbbbbb)');
  });

  it('leaves unique labels unchanged, and compares case-sensitively', () => {
    const out = disambiguatedLabels([ADA, { user_id: 'u-ada2', display_name: 'ada lovelace' }]);
    expect(out.get('u-ada')?.text).toBe('Ada Lovelace');
    expect(out.get('u-ada2')?.text).toBe('ada lovelace');
  });

  it.each([
    ['inner whitespace run', 'Sam  Lee'],
    ['non-breaking space', 'Sam\u00A0Lee'],
    ['zero-width character', 'Sam Le\u200Be'],
  ])('counts a %s variant as the same label', (_n, variant) => {
    const x = { user_id: 'aaaaaaaa-1', display_name: 'Sam Lee' };
    const y = { user_id: 'bbbbbbbb-2', display_name: variant };
    const out = disambiguatedLabels([x, y]);
    expect(out.get(x.user_id)?.text).toBe('Sam Lee (aaaaaaaa)');
    expect(out.get(y.user_id)?.text.endsWith('(bbbbbbbb)')).toBe(true);
  });

  it('counts NFC and NFD spellings of one name as the same label', () => {
    const x = { user_id: 'aaaaaaaa-1', display_name: 'Jos\u00E9' };
    const y = { user_id: 'bbbbbbbb-2', display_name: 'Jose\u0301' };
    const out = disambiguatedLabels([x, y]);
    expect(out.get(x.user_id)?.text).toMatch(/\(aaaaaaaa\)$/);
    expect(out.get(y.user_id)?.text).toMatch(/\(bbbbbbbb\)$/);
  });

  it('a real name equal to another candidate\'s id fallback renders distinct labels', () => {
    const named = { user_id: 'zzzzzzzz-9', display_name: '3f9a12bc' };
    const unnamed = { user_id: '3f9a12bc-0000-4000-8000-000000000001', display_name: null };
    const out = disambiguatedLabels([named, unnamed]);
    const a = out.get(named.user_id)?.text;
    const b = out.get(unnamed.user_id)?.text;
    expect(a).not.toBe(b);
    expect(a).toBe('3f9a12bc (zzzzzzzz)');
  });

  it('never suffixes an id stand-in label, even when it collides', () => {
    const named = { user_id: 'zzzzzzzz-9', display_name: '3f9a12bc' };
    const unnamed = { user_id: '3f9a12bc-0000-4000-8000-000000000001', display_name: null };
    const out = disambiguatedLabels([named, unnamed]);
    expect(out.get(unnamed.user_id)?.text).toBe('3f9a12bc');
    expect(out.get(unnamed.user_id)?.isId).toBe(true);
  });
});
