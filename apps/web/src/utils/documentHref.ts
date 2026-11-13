/** Rule documents with this category live under /rules/rulings; the rest are guides. */
export function isRulingCategory(category: string | null | undefined): boolean {
  return category?.toLowerCase() === 'ruling';
}

/** Canonical readers for the current Document kinds. */
export function documentHref(document: {
  kind: string;
  slug: string;
  category?: string | null;
  questShortCode?: string | null;
}): string | null {
  const slug = encodeURIComponent(document.slug);
  switch (document.kind) {
    case 'codex_entry':
      return `/codex/${slug}`;
    case 'rule':
      return `/rules/${isRulingCategory(document.category) ? 'rulings' : 'guides'}/${slug}`;
    case 'summary':
      return `/chronicles/${slug}`;
    case 'community':
      if (document.category === 'hall_of_fame') return '/community?tab=hall-of-fame';
      // DM tables are retired in the UI; the documents stay in the database.
      if (document.category === 'dm_table') return null;
      return `/community/entries/${slug}`;
    case 'quest_brief':
      return document.questShortCode
        ? `/quests/${encodeURIComponent(document.questShortCode)}`
        : null;
    default:
      return null;
  }
}
