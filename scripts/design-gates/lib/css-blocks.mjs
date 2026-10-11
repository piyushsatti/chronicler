// Shared CSS-block parser, used by check-theme-schema.mjs's logic and the
// check-contrast.mjs gate (B7 #467) — one parser, not a second
// implementation of "find a [data-theme][data-mode] block's body".
//
// Strips /* ... */ comments first so commented-out placeholder blocks never
// count as present, then locates a selector and matches its following
// brace pair.

export function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Extract the `{ ... }` body of a `[data-theme="X"][data-mode="Y"]` block
 * (either attribute order), or null if no such block exists. */
export function blockBody(cssLive, theme, mode) {
  const patterns = [
    new RegExp(
      `\\[data-theme=["']${theme}["']\\]\\[data-mode=["']${mode}["']\\]\\s*\\{`,
    ),
    new RegExp(
      `\\[data-mode=["']${mode}["']\\]\\[data-theme=["']${theme}["']\\]\\s*\\{`,
    ),
  ];
  for (const re of patterns) {
    const m = re.exec(cssLive);
    if (!m) continue;
    const start = m.index + m[0].length;
    const end = cssLive.indexOf('}', start);
    if (end === -1) continue;
    return cssLive.slice(start, end);
  }
  return null;
}

/** Parse `--p-name: value;` declarations out of a block body into a map. */
export function parseTokens(body) {
  const tokens = new Map();
  const re = /--p-([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(body))) {
    tokens.set(m[1], m[2].trim());
  }
  return tokens;
}
