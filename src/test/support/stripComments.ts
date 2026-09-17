/**
 * Strip comments from a source file read with `?raw`, for the source-inspection
 * tests that assert what a module still SAYS.
 *
 * These tests all face the same trap: the prose in the file under test names
 * the very identifiers being asserted on, so matching raw text passes on
 * documentation alone. Stripping first is what makes the assertion about code.
 *
 * ‼ LINE COMMENTS FIRST, AND THAT ORDER IS THE WHOLE REASON THIS IS SHARED.
 * A line comment containing `/*` — `// see Omit<T, 'k'> /* legacy *\/` — starts
 * a block match that runs to the next `*\/` and deletes the real declarations
 * between them. Every `not.toMatch` downstream then passes against a hole.
 *
 * Four copies of this existed and two ran the strips in the opposite order,
 * including one in a file that had just gained new "the guard is still
 * declared" assertions reading the result. Consolidating `_Assert`/`_IsSubtype`
 * while leaving four copies of their test-side twin, one of them inverted, was
 * the same defect one layer out (#174).
 *
 * The `[^:]` guard keeps a `https://` from eating the rest of its line.
 */
export const stripComments = (raw: string): string =>
  raw.replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '');
