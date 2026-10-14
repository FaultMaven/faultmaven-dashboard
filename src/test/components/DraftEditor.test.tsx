import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DraftEditor } from '../../components/DraftEditor';
import {
  DRAFT_CONTENT_MAX_CHARS,
  DRAFT_CONTENT_MIN_CHARS,
  countDraftCharacters,
  type ConversionDraft,
} from '../../lib/knowledge/conversion';
import { makeDraft } from '../support/kbDrafts';

function renderEditor(draft: ConversionDraft = makeDraft()) {
  const onSave = vi.fn().mockResolvedValue(null);
  render(<DraftEditor draft={draft} onSave={onSave} onVerify={vi.fn()} onCancel={vi.fn()} saving={false} />);
  return { onSave };
}

const textarea = () => screen.getByRole('textbox', { name: 'Runbook content' }) as HTMLTextAreaElement;
const saveButton = () => screen.getByRole('button', { name: 'Save Draft' });

async function type(text: string) {
  await act(async () => {
    fireEvent.change(textarea(), { target: { value: text } });
  });
}

describe('countDraftCharacters', () => {
  it('counts code points the way core does, not UTF-16 units', () => {
    expect(countDraftCharacters('')).toBe(0);
    expect(countDraftCharacters('abc')).toBe(3);
    // One emoji is two UTF-16 units and one character to core's `len()`.
    expect('😀'.length).toBe(2);
    expect(countDraftCharacters('😀')).toBe(1);
    expect(countDraftCharacters('a😀b')).toBe(3);
  });
});

describe('DraftEditor — the length limits are stated before the user hits them', () => {
  it('names the limits as one pair', () => {
    expect(DRAFT_CONTENT_MIN_CHARS).toBe(100);
    expect(DRAFT_CONTENT_MAX_CHARS).toBe(100_000);
  });

  it('shows the count against the limit', async () => {
    renderEditor(makeDraft({ content: 'x'.repeat(1234) }));

    expect(screen.getByText('1,234 / 100,000 characters')).toBeInTheDocument();
    await type('y'.repeat(2500));
    expect(screen.getByText('2,500 / 100,000 characters')).toBeInTheDocument();
  });

  it('does not use maxLength, which would truncate a paste without a word', () => {
    renderEditor();

    expect(textarea()).not.toHaveAttribute('maxlength');
  });

  it('disables Save over the limit and says by how much', async () => {
    renderEditor();

    await type('x'.repeat(DRAFT_CONTENT_MAX_CHARS + 5));

    expect(saveButton()).toBeDisabled();
    expect(screen.getByText(/5 characters over the limit/)).toBeInTheDocument();
    expect(saveButton()).toHaveAttribute('title', expect.stringMatching(/5 characters over the limit/));
    // The text is left exactly as pasted.
    expect(textarea().value).toHaveLength(DRAFT_CONTENT_MAX_CHARS + 5);
  });

  it('says "character" for an overshoot of one', async () => {
    renderEditor();

    await type('x'.repeat(DRAFT_CONTENT_MAX_CHARS + 1));

    expect(screen.getByText(/1 character over the limit/)).toBeInTheDocument();
  });

  it('disables Save under the floor and says what the floor is', async () => {
    renderEditor();

    await type('x'.repeat(DRAFT_CONTENT_MIN_CHARS - 1));

    expect(saveButton()).toBeDisabled();
    expect(screen.getByText(/needs at least 100 characters/)).toBeInTheDocument();
  });

  it('allows Save at exactly each bound', async () => {
    const { onSave } = renderEditor();

    await type('x'.repeat(DRAFT_CONTENT_MIN_CHARS));
    expect(saveButton()).toBeEnabled();
    await type('x'.repeat(DRAFT_CONTENT_MAX_CHARS));
    expect(saveButton()).toBeEnabled();

    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect(onSave).toHaveBeenCalledWith('x'.repeat(DRAFT_CONTENT_MAX_CHARS));
  });

  it('counts an emoji as one character, so a text core accepts is not refused', async () => {
    renderEditor();

    // 60 emoji: 120 UTF-16 units, but 60 characters to core, under its floor.
    await type('😀'.repeat(60));
    expect(screen.getByText('60 / 100,000 characters')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();

    await type('😀'.repeat(100));
    expect(saveButton()).toBeEnabled();
  });
});

describe('DraftEditor — a draft that is not a draft cannot be saved', () => {
  it('reads as read-only and offers no Save for an activated draft', async () => {
    renderEditor(makeDraft({ status: 'verified' }));

    expect(textarea()).toHaveAttribute('readonly');
    expect(screen.getByText('Activated')).toBeInTheDocument();
    expect(screen.getByText(/can no longer be edited/)).toBeInTheDocument();
    // Even if a change event slips through a read-only field, Save stays off.
    await type('x'.repeat(DRAFT_CONTENT_MIN_CHARS + 20));
    expect(saveButton()).toBeDisabled();
  });

  it('is editable, and Save needs a change, for a draft', async () => {
    renderEditor();

    expect(textarea()).not.toHaveAttribute('readonly');
    expect(saveButton()).toBeDisabled();
    await type(`${textarea().value} and a change`);
    expect(saveButton()).toBeEnabled();
  });
});
