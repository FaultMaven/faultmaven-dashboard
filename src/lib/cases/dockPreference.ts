import { authLocalStore } from '../storage';

/**
 * Whether the conversation dock is collapsed, remembered per viewer.
 *
 * ONE module knows this key. The dock is the only thing that reads or writes
 * it, and a second caller spelling the key itself is how a preference quietly
 * splits into two that disagree.
 *
 * `lib/storage`'s existing instance for this app's `faultmaven_` keyspace, not
 * a second one over the same prefix: that module exists to be the single owner
 * of the codec, and a duplicate is a second place to update when it gains
 * behaviour. Deliberately NOT `fm.copilot.`,
 * which belongs to the panel and whose sole writer is the package
 * (`clearPersistedSession`). A Dashboard preference living in the panel's
 * namespace would be purged on sign-out along with the panel's session, and
 * would couple this app to a key name the package is free to change.
 *
 * Per browser profile rather than per account, matching what it describes: a
 * layout choice about this screen, not something the server has an opinion on.
 */
const store = authLocalStore;

const COLLAPSED_KEY = 'caseDockCollapsed';

/**
 * Open unless this viewer has said otherwise.
 *
 * The default is the whole point of the dock — a guest should see the record
 * and the conversation together without discovering a control first — so an
 * absent key, a blocked `localStorage` and a value of the wrong type all mean
 * OPEN. Only an explicit `true` collapses it.
 */
export function readDockCollapsed(): boolean {
  return store.read(COLLAPSED_KEY).value === true;
}

export function writeDockCollapsed(collapsed: boolean): void {
  store.write(COLLAPSED_KEY, collapsed);
}
