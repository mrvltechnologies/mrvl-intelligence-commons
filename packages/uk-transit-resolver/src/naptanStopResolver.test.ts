import { describe, it, expect } from 'vitest';
import { NaptanStopIndex, NaptanRow } from './naptanStopResolver';

// Synthetic coordinates — do not correspond to any real place. See fixtures/synthetic/README.md.
function row(atco: string, name: string, lat: number, lon: number): NaptanRow {
  return { atco, naptan: null, name, indicator: null, locality: 'Fenbridge', lat, lon, stopType: 'BCT', adminAreaCode: '9999', status: 'active' };
}

async function fetcherReturning(rows: NaptanRow[]) {
  return async () => rows;
}

describe('NaptanStopIndex.resolveTransitStop', () => {
  it('resolves a close, name-matching stop as CORRELATED_HIGH', async () => {
    const index = new NaptanStopIndex({ '9999': 'Fenbridge' }, await fetcherReturning([row('FEN000001', 'Fenbridge Market Square', 51.0, 1.0)]));
    const result = await index.resolveTransitStop({ name: 'Fenbridge Market Square', latitude: 51.0, longitude: 1.0 });
    expect(result.evidenceLevel).toBe('CORRELATED_HIGH');
    expect(result.canonicalStopIdentity?.atcoCode).toBe('FEN000001');
  });

  it('resolves a farther match with no name agreement as CORRELATED, not CORRELATED_HIGH', async () => {
    const index = new NaptanStopIndex({ '9999': 'Fenbridge' }, await fetcherReturning([row('FEN000001', 'Fenbridge Market Square', 51.0002, 1.0002)]));
    const result = await index.resolveTransitStop({ name: 'Completely Different Name', latitude: 51.0, longitude: 1.0 });
    expect(result.evidenceLevel).toBe('CORRELATED');
  });

  it('returns UNAVAILABLE when nothing is within 40m', async () => {
    const index = new NaptanStopIndex({ '9999': 'Fenbridge' }, await fetcherReturning([row('FEN000001', 'Fenbridge Market Square', 52.0, 2.0)]));
    const result = await index.resolveTransitStop({ name: 'Fenbridge Market Square', latitude: 51.0, longitude: 1.0 });
    expect(result.evidenceLevel).toBe('UNAVAILABLE');
    expect(result.canonicalStopIdentity).toBeNull();
  });

  it('returns AMBIGUOUS with real competing candidates when two stops are within 40m of each other', async () => {
    const index = new NaptanStopIndex(
      { '9999': 'Fenbridge' },
      await fetcherReturning([row('FEN000001', 'Fenbridge Bus Station Bay A', 51.0, 1.0), row('FEN000002', 'Fenbridge Bus Station Bay B', 51.00015, 1.0)]),
    );
    const result = await index.resolveTransitStop({ name: 'Fenbridge Bus Station', latitude: 51.0, longitude: 1.0 });
    expect(result.evidenceLevel).toBe('AMBIGUOUS');
    expect(result.competingCandidates?.length).toBeGreaterThanOrEqual(1);
  });

  it('never lets a real ~1km distant stop count as a competing candidate merely because it exists', async () => {
    const index = new NaptanStopIndex(
      { '9999': 'Fenbridge' },
      await fetcherReturning([row('FEN000001', 'Fenbridge Bus Station', 51.0, 1.0), row('FEN000999', 'Fenbridge Far Stop', 51.01, 1.0)]),
    );
    const result = await index.resolveTransitStop({ name: 'Fenbridge Bus Station', latitude: 51.0, longitude: 1.0 });
    expect(result.evidenceLevel).toBe('CORRELATED_HIGH'); // not ambiguous — the far stop is not a genuine competitor
  });

  it('fails open to UNAVAILABLE when the fetcher throws, never crashes the caller', async () => {
    const index = new NaptanStopIndex({ '9999': 'Fenbridge' }, async () => {
      throw new Error('network down');
    });
    const result = await index.resolveTransitStop({ name: 'Anywhere', latitude: 51.0, longitude: 1.0 });
    expect(result.evidenceLevel).toBe('UNAVAILABLE');
  });
});
