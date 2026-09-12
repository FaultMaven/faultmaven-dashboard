import { describe, it, expect, afterEach } from 'vitest';
import {
  CAPABILITY_PANEL_WITHDRAW,
  COPILOT_WITHDRAWAL_MIN_VERSION,
  copilotAcceptsWithdrawal,
  copilotIsOutOfDate,
  installedCopilotCapabilities,
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
  document.documentElement.removeAttribute('data-faultmaven-copilot-capabilities');
});

function withCapabilities(value: string) {
  document.documentElement.setAttribute('data-faultmaven-copilot-capabilities', value);
}

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

});

describe('an extension that announced itself with no usable version', () => {
  it.each([['empty', ''], ['whitespace', '   ']])('REFUSES the assertion (%s)', (_l, value) => {
    // An empty attribute is an extension that IS present and told us nothing —
    // `hasAttribute` is how the install CTA detects one, and the bridge passes
    // the manifest version through with no validation. Reading that as "nobody
    // is listening" and asserting is the path to a dark tab: a pre-#257 install
    // would yield and never hear the retraction.
    withVersion(value);
    expect(copilotAcceptsWithdrawal()).toBe(false);
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


/**
 * CAPABILITIES BEAT THE VERSION, in both directions (ADR-019 D3).
 *
 * A version is a PROXY for a capability, and the proxy is wrong for exactly the
 * builds we develop against: an unpacked build with the withdrawal listener
 * still reports its manifest version, so the floor refuses the build the
 * feature is being tested with. That is what motivated ADR-019.
 */
describe('an extension that says what it can do', () => {
  it('is TRUSTED on the token alone, even below the version floor', () => {
    // The dev-build case. `1.0.3` is beneath the floor and would be refused on
    // the number; the token says it implements the behaviour, and the token is
    // the truth.
    withVersion('1.0.3');
    withCapabilities(CAPABILITY_PANEL_WITHDRAW);

    expect(copilotAcceptsWithdrawal()).toBe(true);
  });

  it('is REFUSED without the token, however new it is', () => {
    // Authoritative in the other direction too: a build that told us it cannot
    // do this must not be overridden by a version that happens to be high.
    withVersion('9.9.9');
    withCapabilities('page-capture');

    expect(copilotAcceptsWithdrawal()).toBe(false);
  });

  it('is refused on an EMPTY list, which is an answer and not a silence', () => {
    withVersion('9.9.9');
    withCapabilities('');

    expect(installedCopilotCapabilities()).toEqual([]);
    expect(copilotAcceptsWithdrawal()).toBe(false);
  });

  it('tolerates whatever spacing the extension emits', () => {
    withVersion('1.0.3');
    withCapabilities(`  page-capture   ${CAPABILITY_PANEL_WITHDRAW}  `);

    expect(copilotAcceptsWithdrawal()).toBe(true);
  });
});

describe('an extension from before capabilities', () => {
  it('reports null, which is NOT an empty list', () => {
    // The distinction the fallback rests on: `null` is "it never said", `[]` is
    // "it said none". Collapsing them would either refuse every old build the
    // floor would have accepted, or trust every new build that declined.
    withVersion('1.0.4');

    expect(installedCopilotCapabilities()).toBeNull();
  });

  it.each([
    ['above the floor', '1.0.4', true],
    ['below the floor', '1.0.3', false],
  ])('falls back to the version floor (%s)', (_label, version, expected) => {
    withVersion(version);
    expect(copilotAcceptsWithdrawal()).toBe(expected);
  });
});

describe('whether to tell the user their Copilot is old', () => {
  it('says so for a build that cannot stand its panel down', () => {
    // Without the withdrawal it never yields, so the user sees TWO chat panels
    // on one tab with no explanation — the symptom, pointing at neither cause
    // nor cure (ADR-019 D4).
    withVersion('1.0.3');
    expect(copilotIsOutOfDate()).toBe(true);
  });

  it('says nothing when the build is current', () => {
    withVersion(COPILOT_WITHDRAWAL_MIN_VERSION);
    expect(copilotIsOutOfDate()).toBe(false);
  });

  it('says nothing when the token is present, whatever the number', () => {
    withVersion('0.1.0');
    withCapabilities(CAPABILITY_PANEL_WITHDRAW);
    expect(copilotIsOutOfDate()).toBe(false);
  });

  it('says nothing when there is NO extension — nothing to update', () => {
    expect(copilotIsOutOfDate()).toBe(false);
  });
});
