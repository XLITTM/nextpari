/** BetsAPI Events sport IDs, independent of direct bookmaker fixture IDs. */
export const eventsSports = {
  '1': 'football', '13': 'tennis', '18': 'basketball', '17': 'hockey',
  '91': 'volleyball', '92': 'table-tennis', '78': 'handball', '16': 'baseball',
  '94': 'badminton', '14': 'snooker', '83': 'futsal', '15': 'darts',
  '3': 'cricket', '12': 'american-football', '8': 'rugby', '19': 'rugby-league',
  '36': 'aussie-rules', '90': 'floorball', '95': 'beach-volleyball', '110': 'polo',
  '107': 'squash', '151': 'esports', '162': 'mma', '2': 'horse-racing',
  '4': 'greyhounds', '66': 'bowls', '9': 'boxing', '75': 'gaelic-sports',
} as const;

export type EventsSportId = keyof typeof eventsSports;

export function configuredAdditionalSports(value = process.env.BETSAPI_MULTISPORT_SPORT_IDS): EventsSportId[] {
  return [...new Set((value ?? '').split(',').map((id) => id.trim()))]
    .filter((id): id is EventsSportId => id !== '1' && Object.prototype.hasOwnProperty.call(eventsSports, id));
}
