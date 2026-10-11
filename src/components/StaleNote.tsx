/**
 * What a case tab shows over content a refresh could not replace (#206).
 *
 * One quiet line above the content, never in place of it: the tab keeps what it
 * last read, because blowing away a working list on a transient failure is
 * worse, but it does not let that content pass as current. `role="status"`, so
 * the line is announced when it appears — a screen-reader user acting on
 * "active" hypotheses the server has since withdrawn is the case it exists for.
 */
export function StaleNote({ stale }: { stale: boolean }) {
  if (!stale) return null;
  return (
    <p role="status" className="text-xs text-fm-warning mb-2">
      Couldn&apos;t refresh — this may be out of date.
    </p>
  );
}
