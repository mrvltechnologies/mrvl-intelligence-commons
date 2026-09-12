import { describe, it, expect } from 'vitest';
import { hasResolvedGroundAccess, CompleteJourneyCandidate, FlightOfferCandidate } from './index';

function flight(): FlightOfferCandidate {
  return {
    id: 'f1',
    originAirport: 'XXX',
    destinationAirport: 'YYY',
    segments: [],
    departureTime: '2026-01-01T10:00:00Z',
    arrivalTime: '2026-01-01T11:00:00Z',
    durationSeconds: 3600,
    stops: 0,
    carriers: ['ZZ'],
    fare: { amount: 100, currency: 'GBP' },
    offerExpiresAt: null,
    baggage: { source: 'UNAVAILABLE', checkedBagsIncluded: null, carryOnBagsIncluded: null },
    provenance: { providerId: 'synthetic', sourceType: 'REALTIME', fetchedAt: '2026-01-01T09:00:00Z' },
  };
}

describe('hasResolvedGroundAccess', () => {
  it('is true only when ground access status is RESOLVED', () => {
    const candidate: CompleteJourneyCandidate = {
      flight: flight(),
      originGroundLeg: { status: 'RESOLVED', durationSeconds: 1200, transfers: 0, modeSummary: ['train'], cost: null },
      arrivalGroundLeg: null,
      comparativeDurationSeconds: 4800,
      fare: { amount: 100, currency: 'GBP' },
      evidenceCompleteness: { originGroundAccessResolved: true, arrivalGroundAccessIncluded: false },
    };
    expect(hasResolvedGroundAccess(candidate)).toBe(true);
  });

  it('is false when ground access is UNAVAILABLE, never guesses', () => {
    const candidate: CompleteJourneyCandidate = {
      flight: flight(),
      originGroundLeg: { status: 'UNAVAILABLE', durationSeconds: null, transfers: null, modeSummary: [], cost: null },
      arrivalGroundLeg: null,
      comparativeDurationSeconds: null,
      fare: { amount: 100, currency: 'GBP' },
      evidenceCompleteness: { originGroundAccessResolved: false, arrivalGroundAccessIncluded: false },
    };
    expect(hasResolvedGroundAccess(candidate)).toBe(false);
  });

  it('ground cost is always null — the type system forces this, this test documents why', () => {
    const candidate: CompleteJourneyCandidate = {
      flight: flight(),
      originGroundLeg: { status: 'RESOLVED', durationSeconds: 600, transfers: 0, modeSummary: ['walk'], cost: null },
      arrivalGroundLeg: null,
      comparativeDurationSeconds: 4200,
      fare: { amount: 100, currency: 'GBP' },
      evidenceCompleteness: { originGroundAccessResolved: true, arrivalGroundAccessIncluded: false },
    };
    expect(candidate.originGroundLeg.cost).toBeNull();
  });
});
