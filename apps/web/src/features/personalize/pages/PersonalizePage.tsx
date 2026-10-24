import { SettingsForm } from '../../../chrome/SettingsForm.js';
import { MeShell } from '../../../chrome/MeShell.js';

export function PersonalizePage(): React.JSX.Element {
  return (
    <MeShell title="Personalize" lede="Choose how Chronicler looks on your device.">
      {({ data }) => <SettingsForm section="personalize" previewCharacter={data.roster.status === 'ready' ? data.roster.data[0] : undefined} />}
    </MeShell>
  );
}
