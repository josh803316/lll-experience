/** Current Sleeper league (walks `previous_league_id` back through history). */
export const UCSB_LEGACY_LEAGUE_ID = '1386100455410528256'

export const FANTASY_APP_SLUG = 'ucsb-legacy'

export interface CanonicalManager {
  slug: string
  displayName: string
  sleeperUserId: string
  cohort: 'dad' | 'kid' | 'other'
  hue: number
}

/**
 * Stable GM identity across Sleeper username changes.
 * Key is Sleeper `user_id`; display names confirmed 2026-08-27.
 */
export const CANONICAL_MANAGERS: CanonicalManager[] = [
  {
    slug: 'josh',
    displayName: 'Josh',
    sleeperUserId: '338750436779515904',
    cohort: 'dad',
    hue: 262,
  },
  {
    slug: 'tim',
    displayName: 'Tim',
    sleeperUserId: '1000203898965053440',
    cohort: 'dad',
    hue: 158,
  },
  {
    slug: 'jeff',
    displayName: 'Jeff',
    sleeperUserId: '1000210728424382464',
    cohort: 'dad',
    hue: 196,
  },
  {
    slug: 'jacob',
    displayName: 'Jacob',
    sleeperUserId: '1000240654305271808',
    cohort: 'kid',
    hue: 42,
  },
  {
    slug: 'victor',
    displayName: 'Victor',
    sleeperUserId: '1000247677319245824',
    cohort: 'kid',
    hue: 318,
  },
  {
    slug: 'brian',
    displayName: 'Brian',
    sleeperUserId: '1000431218392915968',
    cohort: 'dad',
    hue: 22,
  },
  {
    slug: 'austin',
    displayName: 'Austin',
    sleeperUserId: '1125564516407881728',
    cohort: 'dad',
    hue: 96,
  },
  // Connor = 2024 DawgsOnTop15. Andrew’s 2024/25 account was drewmadness / bigsweatyfarts;
  // 2026 re-invite is nut1master (primary id below). See SLEEPER_ID_ALIASES.
  {
    slug: 'connor',
    displayName: 'Connor',
    sleeperUserId: '1114724829195841536',
    cohort: 'kid',
    hue: 176,
  },
  {
    slug: 'andrew',
    displayName: 'Andrew',
    sleeperUserId: '1398842100069490688',
    cohort: 'dad',
    hue: 286,
  },
  {
    slug: 'jacob-s',
    displayName: 'Jacob S',
    sleeperUserId: '1127083720248356864',
    cohort: 'other',
    hue: 130,
  },
  {
    slug: 'nate',
    displayName: 'Nate',
    sleeperUserId: '1121091505395036160',
    cohort: 'kid',
    hue: 232,
  },
  { slug: 'cai', displayName: 'Cai', sleeperUserId: '1263180646356893696', cohort: 'kid', hue: 54 },
  {
    slug: 'finn',
    displayName: 'Finn',
    sleeperUserId: '1264154154239000576',
    cohort: 'kid',
    hue: 8,
  },
  {
    slug: 'wlampe',
    displayName: 'wlampe',
    sleeperUserId: '1144876462861012992',
    cohort: 'other',
    hue: 300,
  },
]

/** Extra Sleeper user_ids that are the same person as a canonical slug (new login / rename). */
export const SLEEPER_ID_ALIASES: Record<string, string> = {
  '1125566103884767232': 'andrew', // 2024 drewmadness → 2025–26 bigsweatyfarts
}

const BY_SLEEPER_ID = new Map<string, CanonicalManager>()
for (const m of CANONICAL_MANAGERS) {
  BY_SLEEPER_ID.set(m.sleeperUserId, m)
}
for (const [sleeperUserId, slug] of Object.entries(SLEEPER_ID_ALIASES)) {
  const person = CANONICAL_MANAGERS.find((m) => m.slug === slug)
  if (person) {
    BY_SLEEPER_ID.set(sleeperUserId, person)
  }
}

export function canonicalManager(
  sleeperUserId: string | null | undefined
): CanonicalManager | undefined {
  if (!sleeperUserId) {
    return undefined
  }
  return BY_SLEEPER_ID.get(sleeperUserId)
}

export function managerForSleeperUser(
  sleeperUserId: string | null | undefined,
  fallbackDisplayName?: string | null
): { slug: string; displayName: string } {
  const known = canonicalManager(sleeperUserId)
  if (known) {
    return { slug: known.slug, displayName: known.displayName }
  }
  const name = (fallbackDisplayName || 'Unknown').trim() || 'Unknown'
  const slug = slugify(sleeperUserId || name)
  return { slug, displayName: name }
}

export function slugify(value: string): string {
  const s = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'unknown'
}

export function dollarBucket(amount: number): string {
  if (amount <= 1) {
    return '1'
  }
  if (amount <= 5) {
    return '2-5'
  }
  if (amount <= 15) {
    return '6-15'
  }
  if (amount <= 30) {
    return '16-30'
  }
  if (amount <= 50) {
    return '31-50'
  }
  return '51+'
}

export function isLatePick(round: number, amount: number, totalRounds: number): boolean {
  return round >= Math.max(1, totalRounds - 2) || amount <= 2
}

/** Normalize player names for PFF joins (Jr/II/punctuation). */
export function normPlayerName(name: string): string {
  let s = name.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\./g, '')
  s = s.replace(/\s+(jr|sr|ii|iii|iv)\s*$/i, '').trim()
  return s
}
