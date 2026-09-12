import { describe, it, expect, beforeEach, vi } from 'vitest';
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
    // The WHOLE OBJECT is stubbed, not a method on it. happy-dom silently
    // ignores writes to `localStorage.getItem` — on the instance and on
    // `Storage.prototype` alike — so both of the obvious ways to write this
    // test pass without the throwing branch ever running. The first version of
    // this test did exactly that, while `createPrefixedLocalStore.read` really
    // did call `getItem` outside its try/catch.
    //
    // It matters because `resolvePostSignInLanding` calls
    // `prefersExtensionForChat()` OUTSIDE its own try, so a throw here rejected
    // the sign-in landing instead of falling back to `/cases`.
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {},
      removeItem() {},
      clear() {},
      key: () => null,
      length: 0,
    });
    try {
      resetChatSurfaceForTests();
      expect(prefersExtensionForChat()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
      resetChatSurfaceForTests();
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

  it('follows a change made in ANOTHER TAB', () => {
    // "Per browser profile" has to mean it. Without this the preference was per
    // tab as of page load: turn it on in one Dashboard tab and the others keep
    // the dock, keep the `New Case` item, and keep asserting — so the extension
    // stays yielded on them, and the user who just asked for chat in the
    // extension has neither the dock nor the side panel there.
    const seen: boolean[] = [];
    const unsubscribe = subscribeToChatSurface(() => seen.push(prefersExtensionForChat()));

    // What another tab's write looks like here: storage already changed, and
    // the event arrives without this tab having written anything.
    localStorage.setItem('faultmaven_prefersCopilotExtensionForChat', 'true');
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'faultmaven_prefersCopilotExtensionForChat' }),
    );

    expect(seen).toEqual([true]);
    unsubscribe();
  });

  it('follows a localStorage.clear() elsewhere, which reports a null key', () => {
    setPrefersExtensionForChat(true);
    const seen: boolean[] = [];
    const unsubscribe = subscribeToChatSurface(() => seen.push(prefersExtensionForChat()));

    localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null }));

    expect(seen).toEqual([false]);
    unsubscribe();
  });

  it('ignores an unrelated key', () => {
    const seen: boolean[] = [];
    const unsubscribe = subscribeToChatSurface(() => seen.push(prefersExtensionForChat()));

    window.dispatchEvent(new StorageEvent('storage', { key: 'faultmaven_something_else' }));

    expect(seen).toEqual([]);
    unsubscribe();
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
