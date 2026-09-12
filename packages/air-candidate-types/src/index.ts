/**
 * @mrvltechnologies/air-candidate-types — provider-independent flight-offer and ground-access candidate
 * types for building air-travel decision-support tooling.
 *
 * Scope, deliberately narrow: this package describes EVIDENCE about flight offers and ground
 * access (what a provider offered, what it costs, whether ground access could be resolved) — it
 * contains NO ranking, scoring, recommendation, or cost/time-materiality logic. Which candidate
 * to prefer, and why, is a decision-layer concern that stays application-specific and is
 * intentionally not part of this package.
 *
 * Two honesty rules baked into these types, not optional to respect when using them:
 *   - UNKNOWN TIME IS NOT INSTANT — see `TimeEvidenceBasis`.
 *   - UNKNOWN COST IS NOT £0 (or any other currency's zero) — see `GroundAccessLeg.cost`,
 *     always `null`, never defaulted.
 */

import { EvidenceProvenance } from '@mrvltechnologies/journey-provenance';

export interface FlightSegment {
  origin: string; // IATA code
  destination: string; // IATA code
  departingAt: string; // ISO 8601
  arrivingAt: string; // ISO 8601
  marketingCarrier: string | null;
  flightNumber: string | null;
}

export type BaggageEvidenceSource = 'PROVIDER' | 'UNAVAILABLE';

export interface BaggageEvidence {
  source: BaggageEvidenceSource;
  checkedBagsIncluded: number | null;
  carryOnBagsIncluded: number | null;
}

/**
 * A single provider-normalised flight offer. Implementations should normalise a provider's raw
 * response into this shape at the acquisition boundary and never let raw provider fields leak
 * past it into application code.
 */
export interface FlightOfferCandidate {
  id: string;
  originAirport: string; // IATA
  destinationAirport: string; // IATA
  segments: FlightSegment[];
  departureTime: string; // ISO 8601 — first segment's departingAt
  arrivalTime: string; // ISO 8601 — last segment's arrivingAt
  durationSeconds: number;
  stops: number;
  carriers: string[]; // deduplicated marketing carrier codes across segments
  fare: { amount: number; currency: string };
  offerExpiresAt: string | null;
  baggage: BaggageEvidence;
  provenance: EvidenceProvenance;
}

/**
 * Ground access is COMPARATIVE journey time (ground duration + the air candidate's own
 * duration), never a literal doorstep-to-gate elapsed time — no check-in/security buffer should
 * ever be invented as fact by a consumer of this type.
 */
export type GroundAccessEvidenceStatus = 'RESOLVED' | 'UNAVAILABLE';

export interface GroundAccessLeg {
  status: GroundAccessEvidenceStatus;
  durationSeconds: number | null;
  transfers: number | null;
  modeSummary: string[]; // e.g. ['train', 'walk'] — real modes only, never invented
  /**
   * Ground fare/cost. Deliberately typed as always `null` in this package's own producers,
   * because no widely-available data source reliably supplies it — kept as an explicit field
   * (not omitted) specifically so every consumer of this type is structurally forced to confront
   * that ground cost is unknown, rather than silently treating an absent field as zero.
   */
  cost: null;
  provenance?: EvidenceProvenance;
}

/**
 * A complete origin-to-airport-and-flight candidate. Arrival-side (airport-to-destination)
 * ground access is out of scope for this package's v0 — `arrivalGroundLeg` is always `null`,
 * and `evidenceCompleteness` says so explicitly so nothing downstream can mistake this for a
 * true doorstep-to-doorstep total.
 */
export interface CompleteJourneyCandidate {
  flight: FlightOfferCandidate;
  originGroundLeg: GroundAccessLeg;
  arrivalGroundLeg: null;
  /** Ground duration + flight duration only, when ground access resolved. `null` when it did not. */
  comparativeDurationSeconds: number | null;
  fare: { amount: number; currency: string };
  evidenceCompleteness: {
    originGroundAccessResolved: boolean;
    arrivalGroundAccessIncluded: false; // always false in this package's v0 — documented, not a silent gap
  };
}

/**
 * UNKNOWN TIME IS NOT INSTANT. Distinguishes what basis a candidate's time was actually
 * compared on, so a consuming application can never present an incomplete or air-only
 * comparison as a true door-to-door "fastest" result.
 *
 * - `KNOWN_COMPARATIVE_JOURNEY_TIME` — this candidate's own ground access resolved.
 * - `INCOMPLETE_TIME_EVIDENCE` — this candidate's ground access did not resolve, while at least
 *   one other candidate in the same comparison set did — it should be excluded from a
 *   time-based comparison entirely rather than compared on an inconsistent basis.
 * - `AIR_ONLY_TIME` — no candidate in the comparison set had resolved ground access; every
 *   candidate was compared on air-only duration. A result on this basis may be described as an
 *   air-itinerary time comparison, but must not be labelled a door-to-door "fastest" result.
 */
export type TimeEvidenceBasis = 'KNOWN_COMPARATIVE_JOURNEY_TIME' | 'AIR_ONLY_TIME' | 'INCOMPLETE_TIME_EVIDENCE';

/**
 * UNKNOWN COST IS NOT £0. Ground-access cost is unsourced by this package's own producers
 * (`GroundAccessLeg.cost` is always `null`) — `LOWEST_AIRFARE` is the only cost claim that can
 * be honestly made from these types alone. There is deliberately no "cheapest door-to-door"
 * variant, because no evidence contract in this package supports computing one.
 */
export type AirCostBasis = 'LOWEST_AIRFARE';

/** True only when a candidate's own ground access genuinely resolved — never infers this. */
export function hasResolvedGroundAccess(candidate: CompleteJourneyCandidate): boolean {
  return candidate.originGroundLeg.status === 'RESOLVED';
}
