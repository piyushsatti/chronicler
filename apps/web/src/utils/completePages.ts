/** Records one 100-row page of a complete paged read; false when the page breaks the paging contract. */
export function acceptCompletePage(
  seenIds: Set<string>,
  knownTotal: number | undefined,
  page: { total: number; ids: readonly string[] },
): boolean {
  const count = seenIds.size;
  if (
    page.total > 2_147_483_647 ||
    (knownTotal !== undefined && page.total !== knownTotal) ||
    page.ids.length > 100 ||
    count + page.ids.length > page.total ||
    (page.ids.length < 100 && count + page.ids.length < page.total)
  )
    return false;
  for (const raw of page.ids) {
    const id = raw.toLowerCase();
    if (seenIds.has(id)) return false;
    seenIds.add(id);
  }
  return true;
}
