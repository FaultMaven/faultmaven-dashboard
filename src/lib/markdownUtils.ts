/** Strip YAML frontmatter (---...---) from markdown before rendering. */
export function stripFrontmatter(md: string): string {
  return md.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
}

/**
 * Strip HTML comments (<!-- ... -->) — machine-readable annotations, not for display.
 *
 * Guarantee: no `<!--` survives into the output, for any input, at any size.
 *
 * A single `.replace(/<!--[\s\S]*?-->/g, '')` cannot provide that, because it can
 * splice two partial markers into a fresh one: `<!-<!-- -->- x -->` comes back as
 * `<!-- x -->`, a live comment the sanitizer manufactured out of its own output.
 * Re-running the replace to a fixed point does close that hole, but quadratically —
 * hostile input of the shape `'<!-'.repeat(n) + '- -->' + '- -->'.repeat(n)` makes
 * every pass yield exactly one more splice, so 160KB of it costs seconds on the
 * render thread. `DocumentCard` renders KB documents authored by other people, so
 * that cost is reachable from one uploaded file.
 *
 * So scan once, and check the *output* rather than the input. Characters are
 * appended one at a time; the only 4-character window a push can complete is the
 * one ending at that character, so testing just that window after each push is
 * enough to see every marker that ever forms — including ones formed across the
 * seam left by an earlier removal. Every removal only shortens the buffer, and
 * shortening cannot create a window that was not already checked. The buffer
 * therefore never contains `<!--` at any point, which is the guarantee above, and
 * each character is handled in constant time, which keeps the whole thing linear.
 *
 * Comments do not nest, matching CommonMark: an opener seen while already inside a
 * comment is dropped as a marker but does not start a second region, so the first
 * `-->` closes. Deleting those inner markers costs nothing when the comment closes
 * (the whole region is discarded anyway) and is what keeps the guarantee when it
 * never closes.
 *
 * An unterminated `<!--` loses its marker but keeps its text. CommonMark reads a
 * dangling opener as an HTML block running to end of input, so leaving it would
 * make react-markdown render the rest of the document as escaped plain text — the
 * report body survives but loses all formatting.
 *
 * Only *opening* markers are removed. A bare `-->` is ordinary text and occurs in
 * every mermaid edge (`A --> B`), which these same renderers pass through to the
 * causal-map diagrams.
 *
 * This is a rendering-correctness guarantee, not an XSS control. None of the call
 * sites enable rehype-raw, so react-markdown escapes raw HTML rather than rendering
 * it (`<img onerror>` arrives as `&lt;img onerror...&gt;`); a comment marker in the
 * output cannot open an HTML element.
 */
export function stripHtmlComments(md: string): string {
  // Code points, not UTF-16 units, so a surrogate pair is never split.
  const out: string[] = [];
  // Where the body of the comment currently being scanned begins, or -1 outside one.
  let bodyStart = -1;

  const endsWithOpen = () =>
    out.length >= 4 &&
    out[out.length - 4] === '<' &&
    out[out.length - 3] === '!' &&
    out[out.length - 2] === '-' &&
    out[out.length - 1] === '-';

  const endsWithClose = () =>
    out.length >= 3 &&
    out[out.length - 3] === '-' &&
    out[out.length - 2] === '-' &&
    out[out.length - 1] === '>';

  for (const ch of md) {
    out.push(ch);

    if (endsWithOpen()) {
      out.length -= 4;
      // Opening a region, or clamping one whose start this removal just undercut.
      if (bodyStart === -1 || bodyStart > out.length) bodyStart = out.length;
    } else if (bodyStart !== -1 && endsWithClose()) {
      out.length = bodyStart;
      bodyStart = -1;
    }
  }

  // A region left open at end of input keeps its text; its marker is already gone.
  return out.join('');
}

/**
 * Prepare markdown content for react-markdown rendering.
 * Always strips HTML comments. Optionally strips YAML frontmatter.
 */
export function prepareMarkdown(md: string, opts?: { frontmatter?: boolean }): string {
  const result = opts?.frontmatter ? stripFrontmatter(md) : md;
  return stripHtmlComments(result);
}
