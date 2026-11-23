/**
 * A case being deleted — the Dashboard's door to the shared notice and schedule.
 *
 * While a delete runs, `GET /cases/{case_id}` reads `deleting: true` (contract
 * 14.15.0). The case page and the docked panel show the same case, so they say
 * the same sentence and re-read on the same backoff (faultmaven#2341): one
 * implementation, in `@faultmaven/copilot-ui/deleting`.
 *
 * `/deleting`, never the package entry: the entry pulls the panel, the store and
 * the transport into the eager graph (ADR-016 D3), and the module behind this
 * door imports nothing. It is the fourth exempt subpath, beside `/contract`,
 * `/turn-label` and `/mermaid-config`, and this module is its one door.
 */
export { CASE_DELETING_NOTICE, nextDeletingReread } from '@faultmaven/copilot-ui/deleting';
