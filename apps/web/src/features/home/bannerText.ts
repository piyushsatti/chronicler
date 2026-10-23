/** A body that only repeats the title (ignoring case and trailing punctuation) adds nothing. */
export function isTitleEcho(title: string | null, body: string | null): boolean {
  if (!title || !body) return false;
  const norm = (v: string): string => v.trim().toLowerCase().replace(/[\s.!:;,-]+$/u, '');
  return norm(title) === norm(body);
}
