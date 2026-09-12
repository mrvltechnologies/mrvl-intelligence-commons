/**
 * SIRI-VM live-vehicle correlation. SIRI (Service Interface for Real Time Information) is a
 * CEN standard (CEN/TS 15531); the SIRI standard DOCUMENT itself is CEN copyright and sold via
 * national standards bodies (BSI in the UK) — this module implements SIRI-VM's wire format in
 * original code, it does not embed or redistribute the standard's own text. UK bus SIRI-VM data
 * is published via BODS (Bus Open Data Service) — see this repository's `THIRD_PARTY_NOTICES.md`.
 *
 * This module fetches from a caller-supplied endpoint (e.g. your own server-side proxy that
 * holds any required API credentials) — it never embeds or requires a specific API key itself.
 */

import { LiveVehicleEvidence, LiveEvidenceLevel, classifyFreshness } from './types';

export interface BusOperationalQuery {
  operatorRef: string;
  lineRef: string;
  direction: string;
  /** When known (from a resolved scheduled journey), narrows the composite match to a single
   * vehicle. When absent, every live vehicle matching operator+line is returned so the caller
   * can attempt its own disambiguation (position, direction, etc). */
  datedVehicleJourneyRef?: string;
}

export interface BusOperationalIntelligenceProvider {
  queryLiveVehicles(query: BusOperationalQuery): Promise<LiveVehicleEvidence[]>;
}

function extractFirst(xml: string, tag: string): string | null {
  const re = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`);
  const m = re.exec(xml);
  return m ? m[1].trim() : null;
}

/** Parses SIRI-VM `VehicleActivity` elements out of a raw SIRI-VM XML payload. */
export function parseVehicleActivities(xml: string): Array<{
  operatorRef: string | null;
  lineRef: string | null;
  direction: string | null;
  datedVehicleJourneyRef: string | null;
  vehicleRef: string | null;
  recordedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  originName: string | null;
  destinationName: string | null;
}> {
  const activities: ReturnType<typeof parseVehicleActivities> = [];
  const vaRe = /<(?:\w+:)?VehicleActivity\b[^>]*>([\s\S]*?)<\/(?:\w+:)?VehicleActivity>/g;
  let m: RegExpExecArray | null;
  while ((m = vaRe.exec(xml))) {
    const block = m[1];
    const mvj = extractFirst(block, 'MonitoredVehicleJourney') ?? '';
    const fvj = extractFirst(mvj, 'FramedVehicleJourneyRef');
    const loc = extractFirst(mvj, 'VehicleLocation');
    activities.push({
      operatorRef: extractFirst(mvj, 'OperatorRef'),
      lineRef: extractFirst(mvj, 'LineRef'),
      direction: extractFirst(mvj, 'DirectionRef'),
      datedVehicleJourneyRef: fvj ? extractFirst(fvj, 'DatedVehicleJourneyRef') : null,
      vehicleRef: extractFirst(mvj, 'VehicleRef'),
      recordedAt: extractFirst(block, 'RecordedAtTime'),
      latitude: loc ? parseFloat(extractFirst(loc, 'Latitude') ?? '') : null,
      longitude: loc ? parseFloat(extractFirst(loc, 'Longitude') ?? '') : null,
      originName: extractFirst(mvj, 'OriginName'),
      destinationName: extractFirst(mvj, 'DestinationName'),
    });
  }
  return activities;
}

export type SiriVmFetcher = (query: BusOperationalQuery) => Promise<string>;

/**
 * A `BusOperationalIntelligenceProvider` backed by a SIRI-VM endpoint. Pass a `fetcher` that
 * knows how to reach your own SIRI-VM source (e.g. a server-side proxy in front of BODS) — this
 * class contains no embedded endpoint URL or credential.
 */
export class SiriVmOperationalProvider implements BusOperationalIntelligenceProvider {
  constructor(private readonly fetcher: SiriVmFetcher) {}

  async queryLiveVehicles(query: BusOperationalQuery): Promise<LiveVehicleEvidence[]> {
    let xml: string;
    try {
      xml = await this.fetcher(query);
    } catch {
      return []; // fail open — see legIdentityResolver.ts
    }

    const now = Date.now();
    const activities = parseVehicleActivities(xml).filter(
      (a) => a.operatorRef === query.operatorRef && a.lineRef === query.lineRef && a.direction === query.direction,
    );

    return activities
      .filter((a) => a.vehicleRef && a.recordedAt && a.latitude !== null && a.longitude !== null)
      .map((a) => {
        const recordedAtMs = new Date(a.recordedAt!).getTime();
        const evidenceAgeSeconds = Math.max(0, Math.round((now - recordedAtMs) / 1000));
        const exactMatch = query.datedVehicleJourneyRef && a.datedVehicleJourneyRef === query.datedVehicleJourneyRef;
        let evidenceLevel: LiveEvidenceLevel;
        let evidence: string;
        if (exactMatch) {
          // A composite operator+line+direction+DatedVehicleJourneyRef match, not a
          // provider-attested trip ID — deliberately never 'EXACT' for that reason.
          evidenceLevel = 'CORRELATED_HIGH';
          evidence = 'Composite match: operator+line+direction+DatedVehicleJourneyRef all agree with the resolved scheduled journey';
        } else if (query.datedVehicleJourneyRef) {
          evidenceLevel = 'CORRELATED';
          evidence = `Same operator/line/direction as the resolved journey, but DatedVehicleJourneyRef differs (${a.datedVehicleJourneyRef ?? 'unknown'} vs expected ${query.datedVehicleJourneyRef})`;
        } else {
          evidenceLevel = 'CORRELATED';
          evidence = 'Matches operator/line/direction; no specific scheduled journey was provided to narrow further';
        }
        return {
          vehicleRef: a.vehicleRef!,
          position: { latitude: a.latitude!, longitude: a.longitude! },
          recordedAt: a.recordedAt!,
          evidenceAgeSeconds,
          freshness: classifyFreshness(evidenceAgeSeconds),
          operatorRef: a.operatorRef ?? query.operatorRef,
          lineRef: a.lineRef ?? query.lineRef,
          datedVehicleJourneyRef: a.datedVehicleJourneyRef ?? 'unknown',
          direction: a.direction ?? query.direction,
          originName: a.originName,
          destinationName: a.destinationName,
          evidenceLevel,
          evidence,
        };
      });
  }
}
