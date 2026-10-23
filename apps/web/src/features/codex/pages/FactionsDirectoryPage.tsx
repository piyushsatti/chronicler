import { CodexLinkedDirectoryPage } from './CodexLinkedDirectoryPage.js';

export function FactionsDirectoryPage(): React.JSX.Element {
  return (
    <CodexLinkedDirectoryPage
      title="Factions"
      categoryPrefix="Faction"
      noun="factions"
      singular="faction"
      lede="The groups that shape the region: who they are and what they want."
    />
  );
}
