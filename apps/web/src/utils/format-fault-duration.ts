const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/** >24h → N天；>60min 且 <24h → NH；其余 → N分钟。 */
export function formatFaultDuration(minutes: number): string {
  if (minutes > MINUTES_PER_DAY) {
    return `${Math.round(minutes / MINUTES_PER_DAY)}天`;
  }
  if (minutes > MINUTES_PER_HOUR && minutes < MINUTES_PER_DAY) {
    return `${Math.round(minutes / MINUTES_PER_HOUR)}H`;
  }
  return `${Math.round(minutes)}分钟`;
}
