import { describe, it, expect } from 'vitest';
import { deriveResultEvidenceLevel, combineEvidenceLevels } from './types';

describe('combineEvidenceLevels — weakest link', () => {
  it('a strong live match never hides a weak stop match', () => {
    expect(combineEvidenceLevels('AMBIGUOUS', 'EXACT', 'EXACT')).toBe('AMBIGUOUS');
  });

  it('returns the single strongest common level when all agree', () => {
    expect(combineEvidenceLevels('CORRELATED_HIGH', 'EXACT', 'EXACT')).toBe('CORRELATED_HIGH');
  });
});

describe('deriveResultEvidenceLevel', () => {
  it('an EXACT live match against an AMBIGUOUS stop must never produce LIVE_EXACT', () => {
    expect(deriveResultEvidenceLevel('AMBIGUOUS', 'EXACT', 'EXACT')).toBe('AMBIGUOUS');
  });

  it('a fresh EXACT live match against a resolved stop and schedule produces LIVE_EXACT', () => {
    expect(deriveResultEvidenceLevel('CORRELATED_HIGH', 'EXACT', 'EXACT', 'FRESH')).toBe('LIVE_EXACT');
  });

  it('a STALE live EXACT match is capped one tier down, never treated as fresh', () => {
    expect(deriveResultEvidenceLevel('CORRELATED_HIGH', 'EXACT', 'EXACT', 'STALE')).toBe('LIVE_CORRELATED_HIGH');
  });

  it('no live vehicle at all is SCHEDULE_ONLY, not a failure state', () => {
    expect(deriveResultEvidenceLevel('CORRELATED_HIGH', 'EXACT', null)).toBe('SCHEDULE_ONLY');
  });

  it('no stop or schedule resolved at all is UNAVAILABLE', () => {
    expect(deriveResultEvidenceLevel('UNAVAILABLE', null, null)).toBe('UNAVAILABLE');
  });
});
