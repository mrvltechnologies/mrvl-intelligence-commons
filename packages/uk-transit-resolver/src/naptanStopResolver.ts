/**
 * Resolves a geocoded transit stop (e.g. from a routing/geocoding provider) to a canonical
 * NaPTAN stop identity via nearest-neighbour distance + name-normalisation matching.
 *
 * Data source: NaPTAN (National Public Transport Access Nodes), published by the UK Department
 * for Transport under the Open Government Licence v3.0 — see this repository's
 * `THIRD_PARTY_NOTICES.md`. This module fetches NaPTAN's own public CSV export at runtime; it
 * does not bundle or redistribute NaPTAN data itself.
 *
 * Storage strategy: deliberately not a national ingestion pipeline. `KNOWN_ATCO_AREAS` is an
 * explicit, easily-extended allowlist of ATCO area codes this resolver has real fixture/test
 * coverage for — a coordinate outside these areas correctly resolves `UNAVAILABLE` rather than
 * silently returning nothing or crashing. Extend it for the areas your own application needs.
 */

import { CanonicalStopIdentity, TransitStopResolution, StopIdentityEvidenceLevel } from './types';

const NAPTAN_API_BASE = 'https://naptan.api.dft.gov.uk/v1/access-nodes';

/** ATCO area codes: keys are DfT's own area codes, values are a human label. Extend as needed. */
export const KNOWN_ATCO_AREAS: Record<string, string> = {
  '240': 'Kent',
  '490': 'Greater London',
};

export interface NaptanRow {
  atco: string;
  naptan: string | null;
  name: string;
  indicator: string | null;
  locality: string | null;
  lat: number;
  lon: number;
  stopType: string;
  adminAreaCode: string | null;
  status: string;
}

export interface GoogleTransitStop {
  name: string;
  latitude: number;
  longitude: number;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lon2 - lon1);
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLambda / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function parseCsvLine(line: string): string[] {
  // NaPTAN's CSV export is simple (no embedded commas/quotes in the fields this resolver reads)
  // — a full RFC 4180 CSV parser is not needed for this dataset.
  return line.split(',');
}

function parseNaptanCsv(text: string): NaptanRow[] {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]);
  const idx = (col: string) => header.indexOf(col);
  const iAtco = idx('ATCOCode');
  const iNaptan = idx('NaptanCode');
  const iName = idx('CommonName');
  const iIndicator = idx('Indicator');
  const iLocality = idx('LocalityName');
  const iLat = idx('Latitude');
  const iLon = idx('Longitude');
  const iStopType = idx('StopType');
  const iAdminArea = idx('AdministrativeAreaCode');
  const iStatus = idx('Status');

  const rows: NaptanRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const lat = parseFloat(cols[iLat]);
    const lon = parseFloat(cols[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    rows.push({
      atco: cols[iAtco],
      naptan: cols[iNaptan] || null,
      name: cols[iName],
      indicator: cols[iIndicator] || null,
      locality: cols[iLocality] || null,
      lat,
      lon,
      stopType: cols[iStopType],
      adminAreaCode: cols[iAdminArea] || null,
      status: cols[iStatus],
    });
  }
  return rows;
}

/** Default fetcher: calls NaPTAN's own public, unauthenticated CSV export. Override this (see
 * `NaptanStopIndex`'s constructor) for tests, or to supply pre-downloaded/cached rows. */
export async function fetchAtcoAreaFromNaptanApi(atcoAreaCode: string): Promise<NaptanRow[]> {
  const url = `${NAPTAN_API_BASE}?dataFormat=csv&atcoAreaCodes=${atcoAreaCode}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`NaPTAN API returned ${res.status} for area ${atcoAreaCode}`);
  return parseNaptanCsv(await res.text());
}

function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(stop [a-z0-9]+\)/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

export type AtcoAreaFetcher = (atcoAreaCode: string) => Promise<NaptanRow[]>;

/**
 * A cached, in-memory index over one or more NaPTAN ATCO areas, with nearest-neighbour +
 * name-normalisation stop resolution. Construct one per application process; call
 * `resolveTransitStop` per lookup.
 */
export class NaptanStopIndex {
  private cache: { rows: NaptanRow[]; fetchedAt: string } | null = null;

  constructor(
    private readonly atcoAreas: Record<string, string> = KNOWN_ATCO_AREAS,
    private readonly fetchArea: AtcoAreaFetcher = fetchAtcoAreaFromNaptanApi,
  ) {}

  /** Discards the in-memory cache — call between test cases, or to force a re-fetch. */
  resetCache(): void {
    this.cache = null;
  }

  private async ensureCache(): Promise<NaptanRow[]> {
    if (this.cache) return this.cache.rows;
    // Dedup by ATCOCode across areas defensively — a stop appearing twice must never manufacture
    // false self-ambiguity.
    const byAtco = new Map<string, NaptanRow>();
    for (const atcoArea of Object.keys(this.atcoAreas)) {
      const rows = await this.fetchArea(atcoArea);
      for (const r of rows.filter((row) => row.status === 'active')) byAtco.set(r.atco, r);
    }
    const allRows = Array.from(byAtco.values());
    this.cache = { rows: allRows, fetchedAt: new Date().toISOString() };
    return allRows;
  }

  /**
   * Resolves a geocoded transit stop to canonical NaPTAN identity via nearest-neighbour
   * distance plus name-normalisation matching. Any other real candidate within 40m of the best
   * one is treated as a genuine disambiguation risk (e.g. opposite-direction stops, multiple
   * bays at the same location), not suppressed as a false positive.
   */
  async resolveTransitStop(stop: GoogleTransitStop): Promise<TransitStopResolution> {
    let rows: NaptanRow[];
    try {
      rows = await this.ensureCache();
    } catch (e) {
      return { canonicalStopIdentity: null, evidenceLevel: 'UNAVAILABLE', evidence: `NaPTAN lookup failed: ${String(e)}`, distanceMeters: null };
    }

    const scored = rows
      .map((r) => ({ row: r, distance: haversineMeters(stop.latitude, stop.longitude, r.lat, r.lon) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);

    if (scored.length === 0) {
      return {
        canonicalStopIdentity: null,
        evidenceLevel: 'UNAVAILABLE',
        evidence: 'No NaPTAN candidate found — coordinate likely outside a configured ATCO area',
        distanceMeters: null,
      };
    }

    const [best, ...rest] = scored;
    const googleNorm = normaliseName(stop.name);
    const bestNorm = normaliseName(best.row.name);
    const nameMatch = bestNorm === googleNorm || googleNorm.includes(bestNorm) || bestNorm.includes(googleNorm);
    const ambiguous = rest.slice(0, 2).some((c) => c.distance > 0.01 && c.distance < best.distance + 40);

    const canonicalStopIdentity: CanonicalStopIdentity = {
      atcoCode: best.row.atco,
      naptanCode: best.row.naptan,
      commonName: best.row.name,
      indicator: best.row.indicator,
      locality: best.row.locality,
      coordinate: { latitude: best.row.lat, longitude: best.row.lon },
      stopType: best.row.stopType,
      adminAreaCode: best.row.adminAreaCode,
      sourceFetchedAt: this.cache?.fetchedAt ?? new Date().toISOString(),
    };

    let evidenceLevel: StopIdentityEvidenceLevel;
    if (ambiguous) {
      evidenceLevel = 'AMBIGUOUS';
    } else if (best.distance <= 15 && nameMatch) {
      evidenceLevel = 'CORRELATED_HIGH';
    } else if (best.distance <= 40) {
      evidenceLevel = 'CORRELATED';
    } else {
      evidenceLevel = 'UNAVAILABLE';
    }

    const evidence =
      evidenceLevel === 'UNAVAILABLE' && !ambiguous
        ? `Nearest candidate ${best.distance.toFixed(1)}m away — too far to trust (>40m)`
        : `${ambiguous ? 'Ambiguous: ' : ''}nearest candidate ${best.row.atco} at ${best.distance.toFixed(1)}m, name_match=${nameMatch}`;

    return {
      canonicalStopIdentity: evidenceLevel === 'UNAVAILABLE' ? null : canonicalStopIdentity,
      evidenceLevel,
      evidence,
      distanceMeters: best.distance,
      // Only genuine within-40m near-misses — never a farther "next nearest" that happens to be
      // a real stop but isn't part of the real ambiguity.
      competingCandidates: ambiguous
        ? [
            { atcoCode: best.row.atco, distanceMeters: best.distance },
            ...rest.filter((c) => c.distance > 0.01 && c.distance < best.distance + 40).map((c) => ({ atcoCode: c.row.atco, distanceMeters: c.distance })),
          ]
        : undefined,
    };
  }
}
