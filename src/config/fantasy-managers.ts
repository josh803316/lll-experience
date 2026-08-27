/** Current Sleeper league (walks `previous_league_id` back through history). */
export const UCSB_LEGACY_LEAGUE_ID = '1386100455410528256';

export const FANTASY_APP_SLUG = 'ucsb-legacy';

export interface CanonicalManager {
  slug: string;
  displayName: string;
  sleeperUserId: string;
}

/**
 * Stable GM identity across Sleeper username changes.
 * Key is Sleeper `user_id`; display names confirmed 2026-08-27.
 */
export const CANONICAL_MANAGERS: CanonicalManager[] = [
  {slug: 'josh', displayName: 'Josh', sleeperUserId: '338750436779515904'},
  {slug: 'tim', displayName: 'Tim', sleeperUserId: '1000203898965053440'},
  {slug: 'jeff', displayName: 'Jeff', sleeperUserId: '1000210728424382464'},
  {slug: 'jacob', displayName: 'Jacob', sleeperUserId: '1000240654305271808'},
  {slug: 'victor', displayName: 'Victor', sleeperUserId: '1000247677319245824'},
  {slug: 'brian', displayName: 'Brian', sleeperUserId: '1000431218392915968'},
  {slug: 'austin', displayName: 'Austin', sleeperUserId: '1125564516407881728'},
  {slug: 'connor', displayName: 'Connor', sleeperUserId: '1125566103884767232'},
  {slug: 'andrew', displayName: 'Andrew', sleeperUserId: '1114724829195841536'},
  {slug: 'jacob-s', displayName: 'Jacob S', sleeperUserId: '1127083720248356864'},
  {slug: 'nate', displayName: 'Nate', sleeperUserId: '1121091505395036160'},
  {slug: 'cai', displayName: 'Cai', sleeperUserId: '1263180646356893696'},
  {slug: 'finn', displayName: 'Finn', sleeperUserId: '1264154154239000576'},
  {slug: 'wlampe', displayName: 'wlampe', sleeperUserId: '1144876462861012992'},
];

const BY_SLEEPER_ID = new Map(CANONICAL_MANAGERS.map((m) => [m.sleeperUserId, m]));

export function managerForSleeperUser(
  sleeperUserId: string | null | undefined,
  fallbackDisplayName?: string | null,
): {slug: string; displayName: string} {
  if (sleeperUserId) {
    const known = BY_SLEEPER_ID.get(sleeperUserId);
    if (known) {
      return {slug: known.slug, displayName: known.displayName};
    }
  }
  const name = (fallbackDisplayName || 'Unknown').trim() || 'Unknown';
  const slug = slugify(sleeperUserId || name);
  return {slug, displayName: name};
}

export function slugify(value: string): string {
  const s = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'unknown';
}

export function dollarBucket(amount: number): string {
  if (amount <= 1) {
    return '1';
  }
  if (amount <= 5) {
    return '2-5';
  }
  if (amount <= 15) {
    return '6-15';
  }
  if (amount <= 30) {
    return '16-30';
  }
  if (amount <= 50) {
    return '31-50';
  }
  return '51+';
}

export function isLatePick(round: number, amount: number, totalRounds: number): boolean {
  return round >= Math.max(1, totalRounds - 2) || amount <= 2;
}

/** Normalize player names for PFF joins (Jr/II/punctuation). */
export function normPlayerName(name: string): string {
  let s = name.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\./g, '');
  s = s.replace(/\s+(jr|sr|ii|iii|iv)\s*$/i, '').trim();
  return s;
}
