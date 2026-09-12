/**
 * @mrvltechnologies/uk-transit-resolver — canonical domain types for UK bus operational-data
 * interoperability (NaPTAN stop identity, TransXChange scheduled journeys, SIRI-VM live
 * vehicle evidence), provider-independent.
 *
 * This module answers three questions honestly, never a fourth:
 *   1. Which stop is this? (NaPTAN identity resolution)
 *   2. Which scheduled journey is this? (TransXChange resolution)
 *   3. Is a vehicle actually running it right now? (SIRI-VM correlation)
 *
 * It deliberately does NOT answer "should a passenger take this journey" — that is a decision
 * a consuming application makes with its own logic, using this module's evidence as input.
 *
 * Time-evidence doctrine: SCHEDULED (TransXChange) / PREDICTED (a routing engine's estimate) /
 * OBSERVED (SIRI vehicle position) are never collapsed into one generic "time". A PREDICTED
 * value may support disambiguation between structurally-valid candidates; it never defines
 * timetable identity by itself.
 */

// MARK: - Stop identity

export type StopIdentityEvidenceLevel = 'CORRELATED_HIGH' | 'CORRELATED' | 'AMBIGUOUS' | 'UNAVAILABLE';

/** Canonical UK bus-stop identity — NaPTAN/ATCO derived, never a caller-specific stop id. */
export interface CanonicalStopIdentity {
  atcoCode: string;
  naptanCode: string | null;
  commonName: string;
  indicator: string | null;
  locality: string | null;
  coordinate: { latitude: number; longitude: number };
  stopType: string;
  adminAreaCode: string | null;
  /** ISO 8601 timestamp of when this NaPTAN record was fetched — reference-data freshness,
   * distinct from live operational freshness (a static reference dataset and a live vehicle
   * position have very different useful lifespans; never confuse the two). */
  sourceFetchedAt: string;
}

export interface TransitStopResolution {
  canonicalStopIdentity: CanonicalStopIdentity | null;
  evidenceLevel: StopIdentityEvidenceLevel;
  /** Human-diagnosable reason, e.g. "nearest candidate 1.3m, indicator match" — never a raw provider dump. */
  evidence: string;
  distanceMeters: number | null;
  /** Populated only when `evidenceLevel === 'AMBIGUOUS'` — real near-miss candidates (ATCO
   * codes, not indices) so a downstream route-context check can test each one against a
   * resolved line/direction without a second lookup round trip. Never used to widen/weaken the
   * underlying ambiguity threshold itself — only to see whether route membership legitimately
   * narrows it after the fact. */
  competingCandidates?: Array<{ atcoCode: string; distanceMeters: number }>;
}

// MARK: - Scheduled journey identity

export type ScheduledJourneyEvidenceLevel = 'EXACT' | 'CORRELATED' | 'AMBIGUOUS' | 'UNAVAILABLE';

export interface ScheduledJourneyResolution {
  operatorRef: string;
  /** TransXChange LineName — can diverge from a routing provider's own displayed route number.
   * Never assume these are the same string. */
  lineRef: string;
  serviceCode: string;
  journeyPatternRef: string;
  /** TransXChange `TicketMachine/JourneyCode`. Empirically observed equal to SIRI's
   * `DatedVehicleJourneyRef` for the operators this module has been tested against, but kept as
   * a distinct field since that equality is an observed fact about those operators, not a
   * guaranteed invariant of every BODS-publishing operator. */
  journeyCode: string;
  datedVehicleJourneyRef: string;
  boardingStopRef: string;
  alightingStopRef: string;
  /** SCHEDULED evidence only — never a predicted/estimated value. */
  scheduledBoardingDeparture: string;
  scheduledAlightingArrival: string | null;
  direction: string;
  timetableRevision: { revisionNumber: string; startDate: string; endDate: string | null };
  evidenceLevel: ScheduledJourneyEvidenceLevel;
  evidence: string;
}

// MARK: - Live vehicle evidence

export type LiveEvidenceLevel = 'EXACT' | 'CORRELATED_HIGH' | 'CORRELATED' | 'UNAVAILABLE';
export type EvidenceFreshness = 'FRESH' | 'DEGRADED' | 'STALE';

export interface LiveVehicleEvidence {
  vehicleRef: string;
  position: { latitude: number; longitude: number };
  /** OBSERVED evidence only (SIRI `RecordedAtTime`) — never a predicted/derived time. */
  recordedAt: string;
  evidenceAgeSeconds: number;
  freshness: EvidenceFreshness;
  operatorRef: string;
  lineRef: string;
  datedVehicleJourneyRef: string;
  direction: string;
  originName: string | null;
  destinationName: string | null;
  evidenceLevel: LiveEvidenceLevel;
  evidence: string;
}

export function classifyFreshness(evidenceAgeSeconds: number): EvidenceFreshness {
  // SIRI-VM publishers commonly heartbeat every ~15-30s; this module treats one missed cycle
  // (up to 60s) as still FRESH, and anything over 5 minutes as STALE. Adjust per your own
  // publisher's real cadence if it differs materially.
  if (evidenceAgeSeconds <= 60) return 'FRESH';
  if (evidenceAgeSeconds <= 300) return 'DEGRADED';
  return 'STALE';
}

// MARK: - Composite operational evidence (identity + provenance, NOT a recommendation)

export type TransitOperationalState =
  | 'SCHEDULE_ONLY'
  | 'LIVE_TRACKING_AVAILABLE'
  | 'LIVE_TRACKING_DEGRADED'
  | 'LIVE_TRACKING_UNAVAILABLE';

/** Composite evidence for one transit leg. Deliberately excludes ETA, connection-viability, or
 * intervention/rescue concepts — those require a decision layer this package does not provide. */
export interface TransitLegOperationalEvidence {
  legId: string;
  mode: 'bus';
  operationalState: TransitOperationalState;
  stopIdentity: TransitStopResolution;
  scheduledJourney: ScheduledJourneyResolution | null;
  liveVehicle: LiveVehicleEvidence | null;
  /** Weakest-link doctrine: never stronger than the weakest materially-contributing evidence tier. */
  overallEvidenceLevel: StopIdentityEvidenceLevel | ScheduledJourneyEvidenceLevel | LiveEvidenceLevel;
  resultEvidenceLevel: ResultEvidenceLevel;
  generatedAt: string;
}

/** Weakest-link combination across the three evidence tiers this module defines. A stronger
 * downstream tier (e.g. an EXACT live match) never hides a weaker upstream one (e.g. an
 * AMBIGUOUS stop match). */
export function combineEvidenceLevels(
  stop: StopIdentityEvidenceLevel,
  scheduled: ScheduledJourneyEvidenceLevel | null,
  live: LiveEvidenceLevel | null,
): StopIdentityEvidenceLevel | ScheduledJourneyEvidenceLevel | LiveEvidenceLevel {
  const rank = (level: string): number => {
    switch (level) {
      case 'UNAVAILABLE': return 0;
      case 'AMBIGUOUS': return 1;
      case 'CORRELATED': return 2;
      case 'CORRELATED_HIGH': return 3;
      case 'EXACT': return 4;
      default: return 0;
    }
  };
  const levels: string[] = [stop, scheduled, live].filter((l): l is NonNullable<typeof l> => l !== null);
  const weakest = levels.reduce((min, l) => (rank(l) < rank(min) ? l : min), levels[0]);
  return weakest as StopIdentityEvidenceLevel | ScheduledJourneyEvidenceLevel | LiveEvidenceLevel;
}

export type ResultEvidenceLevel =
  | 'LIVE_EXACT'
  | 'LIVE_CORRELATED_HIGH'
  | 'LIVE_CORRELATED'
  | 'SCHEDULE_ONLY'
  | 'AMBIGUOUS'
  | 'UNAVAILABLE';

/**
 * The composite result vocabulary a consuming application should surface, distinct from the
 * three raw per-tier evidence levels (which each stay honest about their own evidence and are
 * never rewritten by this function). A live SIRI vehicle whose `DatedVehicleJourneyRef` exactly
 * matches a temporally-narrowed TransXChange candidate is real, independent proof of identity —
 * it resolves timetable-only ambiguity with a different kind of evidence than the timetable
 * alone could offer, but it never hides that the underlying schedule was ambiguous (still fully
 * visible in `scheduledJourney.evidence`).
 *
 * Still strictly weakest-link: a live exact-ref match can never upgrade the result if the STOP
 * identity itself is unresolved — which physical stop is correct is unproven in that case, no
 * matter how good the live match looks. An exact live match against an ambiguous stop must never
 * produce `LIVE_EXACT`.
 */
export function deriveResultEvidenceLevel(
  stop: StopIdentityEvidenceLevel,
  scheduled: ScheduledJourneyEvidenceLevel | null,
  live: LiveEvidenceLevel | null,
  liveFreshness: EvidenceFreshness | null = null,
): ResultEvidenceLevel {
  if (stop === 'UNAVAILABLE' || !scheduled || scheduled === 'UNAVAILABLE') {
    return live && live !== 'UNAVAILABLE' ? 'AMBIGUOUS' : 'UNAVAILABLE';
  }
  if (stop === 'AMBIGUOUS' || scheduled === 'AMBIGUOUS') {
    return 'AMBIGUOUS'; // a live match cannot rescue an ambiguous stop or unresolved schedule
  }
  // From here: stop is CORRELATED or CORRELATED_HIGH, scheduled is EXACT or CORRELATED.
  // A STALE live match is real, observed evidence — it must never carry the same confidence as
  // a fresh exact match, so it is capped one tier down.
  const stale = liveFreshness === 'STALE';
  if (live === 'EXACT') return stale ? 'LIVE_CORRELATED_HIGH' : 'LIVE_EXACT';
  if (live === 'CORRELATED_HIGH') {
    if (stale) return 'LIVE_CORRELATED';
    return stop === 'CORRELATED_HIGH' ? 'LIVE_CORRELATED_HIGH' : 'LIVE_CORRELATED';
  }
  if (live === 'CORRELATED') return 'LIVE_CORRELATED';
  return 'SCHEDULE_ONLY'; // no live evidence yet — a not-yet-started journey is not a failure
}

export function operationalStateFor(
  stopLevel: StopIdentityEvidenceLevel,
  liveLevel: LiveEvidenceLevel | null,
  liveFreshness: EvidenceFreshness | null,
): TransitOperationalState {
  if (stopLevel === 'UNAVAILABLE') return 'SCHEDULE_ONLY';
  if (!liveLevel || liveLevel === 'UNAVAILABLE') return 'SCHEDULE_ONLY';
  if (liveFreshness === 'STALE') return 'LIVE_TRACKING_UNAVAILABLE';
  if (liveFreshness === 'DEGRADED') return 'LIVE_TRACKING_DEGRADED';
  return 'LIVE_TRACKING_AVAILABLE';
}
