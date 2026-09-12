import { describe, it, expect, afterEach } from 'vitest';
import {
  COPILOT_WITHDRAWAL_MIN_VERSION,
  copilotAcceptsWithdrawal,
  installedCopilotVersion,
} from '../../copilot/copilotCapability';

/**
 * Which installs may be told the Dashboard is showing a panel.
 *
 * Asserting makes ANY extension yield its side panel; only one carrying
 * faultmaven-copilot#257 can hear the retraction. Creating that state for an
 * older install leaves a tab with NEITHER surface — measured against the
 * pre-#257 build, and it self-heals only by navigating off the origin.
 *
 * So every ambiguous answer here must resolve to "do not assert". The one
 * exception is an absent extension, where the assertion reaches nobody.
 */

afterEach(() => {
  document.documentElement.removeAttribute('data-faultmaven-copilot');
});

function withVersion(version: string) {
  document.documentElement.setAttribute('data-faultmaven-copilot', version);
}

describe('no extension has announced itself', () => {
  it('ALLOWS the assertion — it reaches nobody', () => {
    // Either no extension, or one whose content script never registered for
    // this origin (host permission is optional and commonly ungranted on a
    // self-hosted Dashboard). Refusing here would withhold the behaviour from
    // everyone who installs later in the same page's life, for no safety gain.
    expect(installedCopilotVersion()).toBeNull();
    expect(copilotAcceptsWithdrawal()).toBe(true);
  });

  it('treats an empty attribute the same way', () => {
    withVersion('');
    expect(copilotAcceptsWithdrawal()).toBe(true);
  });
});

describe('an extension that predates the withdrawal', () => {
  it.each(['1.0.3', '1.0.0', '0.9.9', '1'])('refuses the assertion for %s', (version) => {
    withVersion(version);
    expect(copilotAcceptsWithdrawal()).toBe(false);
  });

  it('refuses it for a version it cannot parse', () => {
    // "We could not tell" must resolve to the branch that cannot produce a dark
    // tab. A garbled version is not evidence of a new extension.
    withVersion('not-a-version');
    expect(copilotAcceptsWithdrawal()).toBe(false);
  });
});

describe('an extension that understands it', () => {
  it.each(['1.0.4', '1.0.5', '1.1.0', '2.0.0'])('allows the assertion for %s', (version) => {
    withVersion(version);
    expect(copilotAcceptsWithdrawal()).toBe(true);
  });

  it('compares segments NUMERICALLY, not as strings', () => {
    // `'1.0.10' < '1.0.4'` under string ordering, which would withhold the
    // assertion from a newer extension forever — and silently, because the
    // symptom is simply that yielding never happens.
    withVersion('1.0.10');
    expect(copilotAcceptsWithdrawal()).toBe(true);
    withVersion('1.0.30');
    expect(copilotAcceptsWithdrawal()).toBe(true);
  });

  it('treats a missing patch segment as zero', () => {
    withVersion('1.1');
    expect(copilotAcceptsWithdrawal()).toBe(true);
  });

  it('accepts the threshold itself', () => {
    withVersion(COPILOT_WITHDRAWAL_MIN_VERSION);
    expect(copilotAcceptsWithdrawal()).toBe(true);
  });
});
