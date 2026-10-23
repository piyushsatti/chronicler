import { CodexLinkedDirectoryPage } from './CodexLinkedDirectoryPage.js';

export function NpcsDirectoryPage(): React.JSX.Element {
  return (
    <CodexLinkedDirectoryPage
      title="NPCs"
      categoryPrefix="NPC"
      noun="NPCs"
      singular="NPC"
      lede="The people of the world: allies, rivals and everyone in between."
    />
  );
}
