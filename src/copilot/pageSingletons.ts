import type { HostCapabilities } from '@faultmaven/copilot-ui';

/**
 * The Copilot UI singletons that belong to the PAGE, not to a session.
 *
 * The package needs three module singletons installed before anything reads
 * them. Two of them describe the document: the store is this page's
 * `localStorage`, and the endpoints are its build config. Neither changes while
 * the page is open, and neither has anything to do with who is signed in.
 *
 * Tying them to a component's lifetime was a category error with a real cost.
 * The shell unmounts the panel on sign-out — and the package's purge of the
 * signed-out user's data is still running at that moment, fire-and-forget,
 * across four store-backed steps. An unmount that pulled the store out from
 * under it made every step throw `No HostStore installed` and left most of
 * `fm.copilot.*` behind: exactly the residue the purge exists to remove,
 * recreated by the cleanup meant to be tidy.
 *
 * So they are installed once per document and never cleared. The third
 * singleton, the transport, closes over a session's credential and is
 * genuinely session-bound; it stays with the mount.
 */
type PackageInstallers = {
  setHostStore: (store: HostCapabilities['store']) => void;
  setHostEndpoints: (endpoints: HostCapabilities['endpoints']) => void;
};

let installed = false;

/**
 * Install the page-lifetime singletons, at most once per document.
 *
 * Idempotent rather than guarded at the call site, because "has this page done
 * it" is the question — and a second mount would install equivalent values,
 * which makes doing nothing the correct answer rather than merely a cheap one.
 */
export function installPageSingletons(
  ui: PackageInstallers,
  capabilities: HostCapabilities,
): void {
  if (installed) return;
  ui.setHostStore(capabilities.store);
  ui.setHostEndpoints(capabilities.endpoints);
  installed = true;
}

/** Test seam: a fresh document is a fresh module, but a test file is not. */
export function resetPageSingletonsForTests(): void {
  installed = false;
}
