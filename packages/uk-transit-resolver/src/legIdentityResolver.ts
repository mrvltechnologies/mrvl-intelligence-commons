/**
 * Top-level orchestrator: resolves composite operational evidence for one transit leg by
 * chaining the three resolvers in this package (stop identity -> scheduled journey -> live
 * vehicle), applying the weakest-link doctrine throughout.
 *
 * FAIL OPEN IS NON-NEGOTIABLE: this function's only job is to *enrich* a leg with optional
 * evidence. It must never throw in a way that could break a caller's own journey-search or
 * booking path — every internal failure degrades to UNAVAILABLE evidence, never an exception
 * escaping to the caller. This is the safe public entry point; do not call the individual
 * resolvers directly from a customer-facing path without this wrapper's fail-open behaviour.
 */

import {
  TransitLegOperationalEvidence,
  TransitStopResolution,
  ScheduledJourneyResolution,
  LiveVehicleEvidence,
  combineEvidenceLevels,
  operationalStateFor,
  deriveResultEvidenceLevel,
} from './types';
import { NaptanStopIndex } from './naptanStopResolver';
import { resolveScheduledJourney, isStopServedByLineDirection, ParsedTxcFile } from './txcJourneyResolver';
import { BusOperationalIntelligenceProvider } from './busOperationalProvider';

/** A minimal, provider-independent description of one transit leg — deliberately not tied to
 * any particular application's own journey/leg model. Adapt your own leg type to this shape at
 * the call site. */
export interface TransitLegQuery {
  id: string;
  mode: 'bus' | string;
  origin: { name: string; coordinate: { latitude: number; longitude: number } };
  destination: { name: string; coordinate: { latitude: number; longitude: number } };
  /** ISO 8601 UTC instant — e.g. a routing provider's own predicted departure time. Optional
   * supporting evidence only; never treated as SCHEDULED truth. */
  predictedDepartureTimeUtc?: string;
}

export interface LegIdentityResolverDeps {
  provider: BusOperationalIntelligenceProvider;
  stopIndex: NaptanStopIndex;
  /** Already-parsed TXC files covering the operator/corridor in question. Downloading and
   * unzipping a TXC dataset is out of this package's scope — supply already-parsed files
   * (via `parseTxcFile` from `txcJourneyResolver.ts`) from your own ingestion job. An empty
   * array is a valid, honest input: it means "no timetable data available for this leg", not
   * an error. */
  txcFiles: ParsedTxcFile[];
  operatorRef: string;
  now?: () => Date;
}

/** UK local wall-clock HH:MM:SS for a UTC ISO instant, correct across the GMT/BST boundary
 * (a naive UTC+1 offset would be wrong for roughly half the year). */
export function toUkLocalTimeString(isoUtc: string): string {
  const date = new Date(isoUtc);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('hour')}:${get('minute')}:${get('second')}`;
}

function emptyEvidence(legId: string, stopIdentity: TransitStopResolution, generatedAt: string): TransitLegOperationalEvidence {
  return {
    legId,
    mode: 'bus',
    operationalState: 'SCHEDULE_ONLY',
    stopIdentity,
    scheduledJourney: null,
    liveVehicle: null,
    overallEvidenceLevel: stopIdentity.evidenceLevel,
    resultEvidenceLevel: deriveResultEvidenceLevel(stopIdentity.evidenceLevel, null, null),
    generatedAt,
  };
}

/**
 * Resolves composite operational evidence for one bus leg. Never throws — any internal failure
 * is captured and surfaces as UNAVAILABLE evidence on the relevant tier. The input leg is never
 * modified; this function is purely additive (evidence gathering), never decisioning — what a
 * caller does with the resulting evidence (rank it, display it, ignore it) is entirely up to
 * the caller.
 */
export async function resolveTransitLegEvidence(leg: TransitLegQuery, deps: LegIdentityResolverDeps): Promise<TransitLegOperationalEvidence | null> {
  if (leg.mode !== 'bus') return null;

  const generatedAt = (deps.now?.() ?? new Date()).toISOString();
  const operatingDate = generatedAt.slice(0, 10);

  // 1. Geocoded origin -> NaPTAN
  let stopIdentity: TransitStopResolution;
  try {
    stopIdentity = await deps.stopIndex.resolveTransitStop({
      name: leg.origin.name,
      latitude: leg.origin.coordinate.latitude,
      longitude: leg.origin.coordinate.longitude,
    });
  } catch (e) {
    stopIdentity = { canonicalStopIdentity: null, evidenceLevel: 'UNAVAILABLE', evidence: `Stop resolution failed: ${String(e)}`, distanceMeters: null };
  }

  if (stopIdentity.evidenceLevel === 'UNAVAILABLE' || !stopIdentity.canonicalStopIdentity) {
    return emptyEvidence(leg.id, stopIdentity, generatedAt); // fail open: no stop identity, no further enrichment attempted
  }

  let alightingAtco: string | null = null;
  try {
    const alightingResolution = await deps.stopIndex.resolveTransitStop({
      name: leg.destination.name,
      latitude: leg.destination.coordinate.latitude,
      longitude: leg.destination.coordinate.longitude,
    });
    alightingAtco = alightingResolution.canonicalStopIdentity?.atcoCode ?? null;
  } catch {
    alightingAtco = null; // fail open — scheduled-journey resolution below handles a missing alighting stop honestly
  }

  // 2. NaPTAN -> TXC scheduled journey
  let scheduledJourney: ScheduledJourneyResolution | null = null;
  if (alightingAtco) {
    try {
      const result = resolveScheduledJourney(
        deps.txcFiles,
        stopIdentity.canonicalStopIdentity.atcoCode,
        alightingAtco,
        operatingDate,
        deps.operatorRef,
        leg.predictedDepartureTimeUtc ? toUkLocalTimeString(leg.predictedDepartureTimeUtc) : undefined,
      );
      scheduledJourney = 'lineRef' in result ? result : null;
    } catch {
      scheduledJourney = null; // fail open
    }
  }

  // Route-context stop disambiguation: a genuinely ambiguous NaPTAN match can be legitimately
  // upgraded now that the real line/direction is known, but ONLY if exactly one of the
  // near-miss candidates is actually served by that line+direction in the current timetable —
  // if two or more still plausibly serve it, real ambiguity is retained honestly, never forced.
  if (scheduledJourney && stopIdentity.evidenceLevel === 'AMBIGUOUS' && stopIdentity.competingCandidates && stopIdentity.canonicalStopIdentity) {
    const chosenAtco = stopIdentity.canonicalStopIdentity.atcoCode;
    const otherCompetitorsServed = stopIdentity.competingCandidates
      .filter((c) => c.atcoCode !== chosenAtco)
      .filter((c) => isStopServedByLineDirection(deps.txcFiles, c.atcoCode, scheduledJourney!.lineRef, scheduledJourney!.direction, operatingDate));
    if (otherCompetitorsServed.length === 0) {
      stopIdentity = {
        ...stopIdentity,
        evidenceLevel: 'CORRELATED_HIGH',
        evidence: `${stopIdentity.evidence} — route-context upgrade: line ${scheduledJourney.lineRef} direction ${scheduledJourney.direction} is served only by ${chosenAtco} among the ${stopIdentity.competingCandidates.length} near-miss candidates`,
      };
    }
  }

  if (!scheduledJourney) {
    const overall = combineEvidenceLevels(stopIdentity.evidenceLevel, 'UNAVAILABLE', null);
    return {
      legId: leg.id,
      mode: 'bus',
      operationalState: 'SCHEDULE_ONLY',
      stopIdentity,
      scheduledJourney: null,
      liveVehicle: null,
      overallEvidenceLevel: overall,
      resultEvidenceLevel: deriveResultEvidenceLevel(stopIdentity.evidenceLevel, null, null),
      generatedAt,
    };
  }

  // 3. TXC -> SIRI live vehicle
  let liveVehicle: LiveVehicleEvidence | null = null;
  try {
    const candidates = await deps.provider.queryLiveVehicles({
      operatorRef: deps.operatorRef,
      lineRef: scheduledJourney.lineRef,
      direction: scheduledJourney.direction,
      datedVehicleJourneyRef: scheduledJourney.datedVehicleJourneyRef,
    });
    liveVehicle = candidates.find((c) => c.evidenceLevel === 'CORRELATED_HIGH' || c.evidenceLevel === 'EXACT') ?? candidates[0] ?? null;
  } catch {
    liveVehicle = null; // fail open — absence of a live vehicle is a valid, honest outcome (not-yet-started is not a failure)
  }

  const overall = combineEvidenceLevels(stopIdentity.evidenceLevel, scheduledJourney.evidenceLevel, liveVehicle?.evidenceLevel ?? 'UNAVAILABLE');
  const operationalState = operationalStateFor(stopIdentity.evidenceLevel, liveVehicle?.evidenceLevel ?? null, liveVehicle?.freshness ?? null);
  const resultEvidenceLevel = deriveResultEvidenceLevel(stopIdentity.evidenceLevel, scheduledJourney.evidenceLevel, liveVehicle?.evidenceLevel ?? null, liveVehicle?.freshness ?? null);

  return { legId: leg.id, mode: 'bus', operationalState, stopIdentity, scheduledJourney, liveVehicle, overallEvidenceLevel: overall, resultEvidenceLevel, generatedAt };
}
