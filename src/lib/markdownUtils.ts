/** Strip YAML frontmatter (---...---) from markdown before rendering. */
export function stripFrontmatter(md: string): string {
  return md.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
}

/** Strip HTML comments (<!-- ... -->) — machine-readable annotations, not for display. */
export function stripHtmlComments(md: string): string {
  return md.replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * Prepare markdown content for react-markdown rendering.
 * Always strips HTML comments. Optionally strips YAML frontmatter.
 */
export function prepareMarkdown(md: string, opts?: { frontmatter?: boolean }): string {
  const result = opts?.frontmatter ? stripFrontmatter(md) : md;
  return stripHtmlComments(result);
}
