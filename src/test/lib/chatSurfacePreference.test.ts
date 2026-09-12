import { describe, it, expect, beforeEach } from 'vitest';
import {
  prefersExtensionForChat,
  setPrefersExtensionForChat,
  subscribeToChatSurface,
  resetChatSurfaceForTests,
} from '../../lib/copilot/chatSurfacePreference';

/**
 * "Use the Copilot extension for chat" (ADR-018 D3).
 *
 * The property that makes this preference SAFE is that it cannot strand anyone:
 * it is set by the person it affects, defaults to the Dashboard hosting chat,
 * and never governs the ability to READ a conversation. Everything here is
 * about that.
 */

beforeEach(() => {
  localStorage.clear();
  resetChatSurfaceForTests();
});

describe('the default', () => {
  it('is OFF — the Dashboard hosts chat until asked otherwise', () => {
    // Load-bearing. Off is the only correct answer for someone who has never
    // installed anything, and for the population that can never have a side
    // panel at all: Firefox, managed browsers, self-hosted.
    expect(prefersExtensionForChat()).toBe(false);
  });

  it.each([['"true"', '"true"'], ['1', '1'], ['null', 'null'], ['garbage', 'not json']])(
    'is OFF for a stored value of the wrong shape (%s)',
    (_label, raw) => {
      localStorage.setItem('faultmaven_prefersCopilotExtensionForChat', raw);
      resetChatSurfaceForTests();

      // Only an explicit boolean `true` moves chat away. Anything else is a
      // value nobody meant, and the safe reading of it is "keep the surface".
      expect(prefersExtensionForChat()).toBe(false);
    },
  );

  it('is OFF when storage throws, rather than propagating', () => {
    const real = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    try {
      resetChatSurfaceForTests();
      expect(prefersExtensionForChat()).toBe(false);
    } finally {
      Storage.prototype.getItem = real;
    }
  });
});

describe('setting it', () => {
  it('round-trips and survives a fresh read', () => {
    setPrefersExtensionForChat(true);
    resetChatSurfaceForTests(); // as a reload would
    expect(prefersExtensionForChat()).toBe(true);
  });

  it('is reversible, which is what makes it safe to offer at all', () => {
    setPrefersExtensionForChat(true);
    setPrefersExtensionForChat(false);
    resetChatSurfaceForTests();
    expect(prefersExtensionForChat()).toBe(false);
  });

  it('notifies every subscriber, so the page cannot contradict itself', () => {
    // The nav item, the dock and the account menu all read this. If they did
    // not move together, a user would see a `New Case` link beside a Dashboard
    // that had already stood down.
    const seen: boolean[] = [];
    const unsubscribe = subscribeToChatSurface(() => seen.push(prefersExtensionForChat()));

    setPrefersExtensionForChat(true);
    setPrefersExtensionForChat(false);
    unsubscribe();
    setPrefersExtensionForChat(true);

    expect(seen).toEqual([true, false]);
  });
});
