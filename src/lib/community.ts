/**
 * Ways to look at FaultMaven that need no account at all, in one place.
 *
 * The cloud sign-in screen offers both: it is the first thing a curious
 * visitor sees, and "sign in" is a wall to someone who has not decided yet.
 *
 * These live in a module rather than inline for the same reason
 * `COPILOT_STORE_URL` does — a URL that appears in two components can drift in
 * one of them, and `LoginPage.test.tsx` scans all of `src/` so a second copy
 * fails the build rather than rotting quietly.
 *
 * ‼ A Slack `shared_invite` link is revocable and can be rotated from the
 * workspace admin UI. When it changes, change it HERE — and note that the same
 * URL is also published in several repositories' READMEs and on the marketing
 * site, which this constant cannot reach.
 */
export const COMMUNITY_SLACK_URL =
  'https://join.slack.com/t/faultmaven-community/shared_invite/zt-493fv3w3o-mPBBI2v3mMYQKS4649mY1A';

/** The published investigation transcript — the zero-friction "see it work". */
export const TRANSCRIPT_URL = 'https://www.faultmaven.ai/investigation';
