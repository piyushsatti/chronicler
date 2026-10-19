type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

function timeOfDay(hour: number = new Date().getHours()): TimeOfDay {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

export function greeting(displayName?: string | null): string {
  const salutation = {
    morning: 'Good morning',
    afternoon: 'Good afternoon',
    evening: 'Good evening',
    night: 'Good night',
  }[timeOfDay()];

  return `${salutation}, ${displayName ?? 'Mortal'}.`;
}
