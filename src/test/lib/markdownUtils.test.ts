import { describe, it, expect } from 'vitest';
import { stripFrontmatter, stripHtmlComments, prepareMarkdown } from '../../lib/markdownUtils';

describe('stripHtmlComments', () => {
  it('removes a well-formed comment', () => {
    expect(stripHtmlComments('before <!-- note --> after')).toBe('before  after');
  });

  it('removes several comments, including multi-line ones', () => {
    expect(stripHtmlComments('a<!-- one -->b<!--\ntwo\n-->c')).toBe('abc');
  });

  it('leaves content without comments untouched', () => {
    expect(stripHtmlComments('# Title\n\nA --> B\n')).toBe('# Title\n\nA --> B\n');
  });

  it('preserves the mermaid edge arrow, which is not a comment marker', () => {
    // Causal maps are mermaid graphs full of `-->`; stripping bare closers would
    // silently corrupt every diagram this renderer is meant to display.
    const mermaid = '```mermaid\ngraph TD\n  A --> B\n  B --> C\n```';
    expect(stripHtmlComments(mermaid)).toBe(mermaid);
  });

  it('does not nest — the first closer ends the comment, as in CommonMark', () => {
    // Content after the first `-->` is text, not part of the comment, and must
    // not be swallowed.
    expect(stripHtmlComments('<!-- ann <!-- inner --> REAL CONTENT -->')).toBe(
      ' REAL CONTENT -->'
    );
  });

  it('discards back to the marker that actually opened the region, not a stale start', () => {
    // The second `<!--` here exists only because removing the first one rejoined
    // `<!-` with the `-` behind it. The live region therefore begins earlier than
    // the point the first removal recorded, and the closer has to discard back to
    // the earlier point — discarding to the stale one leaks `BOD` into the output.
    expect(stripHtmlComments('KEEP<!-<!---BODY-->TAIL')).toBe('KEEPTAIL');
  });

  it('removes an unterminated open marker so the rest still renders as markdown', () => {
    // CommonMark treats a bare `<!--` as an HTML block running to end of input,
    // so anything after it would render as escaped plain text.
    expect(stripHtmlComments('intro\n\n<!--\n\n# Heading')).toBe('intro\n\n\n\n# Heading');
  });

  // --- the guarantee: no `<!--` survives, whatever the input ------------------
  //
  // These assert the invariant rather than a specific leftover: a bare `-->` is
  // ordinary text by the rule above, so what remains beside the marker is
  // incidental and may legitimately differ between implementations.

  it.each([
    // One pass matches the inner `<!-- -->` and joins the leftovers into
    // `<!-- x -->` — a comment the sanitizer created out of its own output.
    ['a complete comment spliced from partial markers', '<!-<!-- -->- x -->'],
    ['a dangling opener spliced from partial markers', '<!-<!-- -->-'],
    // Removing the marker here rejoins `<!-` with `-`, re-forming `<!--`.
    ['a marker re-formed by removing an overlapping one', '<!-<!---'],
    ['an unterminated comment containing a second opener', '<!-- a <!-- b'],
    ['stacked openers with matching closers', '<!--<!--<!--<!-- x -->-->-->-->'],
    ['openers with no closer at all', '<!--<!--<!--'],
  ])('leaves no comment marker: %s', (_label, input) => {
    expect(stripHtmlComments(input)).not.toContain('<!--');
  });

  it('leaves no comment marker for any nesting depth of the opening delimiter', () => {
    for (let depth = 1; depth <= 8; depth++) {
      const nested = '<!--'.repeat(depth) + ' x ' + '-->'.repeat(depth);
      expect(stripHtmlComments(nested)).not.toContain('<!--');
    }
  });

  it('holds the guarantee and idempotence over randomised marker soup', () => {
    // The failure mode is a splice at a seam, so bias the alphabet entirely
    // towards marker characters instead of hoping prose stumbles into one.
    const alphabet = ['<', '!', '-', '>', ' ', 'x', '\n', '\r'];
    let seed = 0x5eed;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

    for (let i = 0; i < 5000; i++) {
      let input = '';
      const len = 1 + Math.floor(rnd() * 24);
      for (let j = 0; j < len; j++) input += alphabet[Math.floor(rnd() * alphabet.length)];

      const once = stripHtmlComments(input);
      expect(once, `input ${JSON.stringify(input)}`).not.toContain('<!--');
      expect(stripHtmlComments(once), `input ${JSON.stringify(input)}`).toBe(once);
      // Marker-absence alone is satisfied by returning less than was asked for, so
      // pin the other side too: an input that never forms an opener comes back
      // byte for byte, CRLF and all.
      if (!input.includes('<!--')) {
        expect(once, `input ${JSON.stringify(input)}`).toBe(input);
      }
    }
  });

  it('is idempotent — a second pass changes nothing', () => {
    for (const input of ['<!-<!-- -->- x -->', '<!--<!-- x -->-->', '<!-<!-- -->-', 'A --> B']) {
      const once = stripHtmlComments(input);
      expect(stripHtmlComments(once)).toBe(once);
    }
  });

  it('stays linear on input crafted to make each removal create a new marker', () => {
    // Every removal in this shape splices exactly one fresh `<!--` out of the
    // leftovers, so an implementation that re-scans its own output does one pass
    // per marker: quadratic. At n=20000 (160KB) that measured ~2100ms, on the
    // main thread, reachable from a single KB document another user uploaded.
    // The single-pass scanner measured a 9.0ms median (worst of 9 runs 12.4ms).
    // The budget below sits ~20x above that worst local run — loose enough for a
    // loaded CI runner — and still ~8x below the ~2100ms it exists to catch.
    const n = 20000;
    const hostile = '<!-'.repeat(n) + '- -->' + '- -->'.repeat(n);
    expect(hostile.length).toBeGreaterThan(150000);

    // Warm up so the measurement is steady-state, not first-call JIT.
    for (let i = 0; i < 20; i++) stripHtmlComments('<!-'.repeat(500) + '- -->' + '- -->'.repeat(500));

    const started = performance.now();
    const result = stripHtmlComments(hostile);
    const elapsed = performance.now() - started;

    expect(result).not.toContain('<!--');
    expect(elapsed).toBeLessThan(250);
  });
});

describe('stripFrontmatter', () => {
  it('removes leading YAML frontmatter', () => {
    expect(stripFrontmatter('---\ntitle: x\n---\nbody')).toBe('body');
  });

  it('leaves a document without frontmatter untouched', () => {
    expect(stripFrontmatter('# Title\nbody')).toBe('# Title\nbody');
  });
});

describe('prepareMarkdown', () => {
  it('strips comments but keeps frontmatter by default', () => {
    expect(prepareMarkdown('---\na: b\n---\ntext <!-- c -->')).toBe('---\na: b\n---\ntext ');
  });

  it('strips both when frontmatter is requested', () => {
    expect(prepareMarkdown('---\na: b\n---\ntext <!-- c -->', { frontmatter: true })).toBe('text ');
  });
});
