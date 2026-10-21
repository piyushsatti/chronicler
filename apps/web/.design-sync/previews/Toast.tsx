import { Toast } from '@pi/chronicler-ds';

export function Tones() {
  return (
    <div className="stack" data-gap="3" style={{ maxWidth: 420 }}>
      <Toast tone="info">Session 14 notes saved as a draft.</Toast>
      <Toast tone="success">Kael Storm joined “The Drowned Bell of Saltmere”.</Toast>
      <Toast tone="error">Could not publish the chronicle. Try again in a moment.</Toast>
    </div>
  );
}
