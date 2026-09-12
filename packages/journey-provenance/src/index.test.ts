import { describe, it, expect } from 'vitest';
import { hasStatedConfidence, describeProvenance, classifyFreshness, EvidenceProvenance } from './index';

describe('hasStatedConfidence', () => {
  it('is false when confidence is null', () => {
    const p: EvidenceProvenance = { providerId: 'x', sourceType: 'REALTIME', fetchedAt: '2026-01-01T00:00:00Z', confidence: null };
    expect(hasStatedConfidence(p)).toBe(false);
  });

  it('is false when confidence is absent entirely', () => {
    const p: EvidenceProvenance = { providerId: 'x', sourceType: 'REALTIME', fetchedAt: '2026-01-01T00:00:00Z' };
    expect(hasStatedConfidence(p)).toBe(false);
  });

  it('is true only for a real numeric confidence, including 0', () => {
    const p: EvidenceProvenance = { providerId: 'x', sourceType: 'REALTIME', fetchedAt: '2026-01-01T00:00:00Z', confidence: 0 };
    expect(hasStatedConfidence(p)).toBe(true);
  });
});

describe('describeProvenance', () => {
  it('never fabricates a confidence value in its output', () => {
    const p: EvidenceProvenance = { providerId: 'acme', sourceType: 'SCHEDULED', fetchedAt: '2026-01-01T00:00:00Z' };
    expect(describeProvenance(p)).toContain('confidence=unstated');
    expect(describeProvenance(p)).not.toMatch(/confidence=0\.50/);
  });

  it('includes the stated confidence when present', () => {
    const p: EvidenceProvenance = { providerId: 'acme', sourceType: 'REALTIME', fetchedAt: '2026-01-01T00:00:00Z', confidence: 0.87 };
    expect(describeProvenance(p)).toContain('confidence=0.87');
  });
});

describe('classifyFreshness', () => {
  const thresholds = { freshMaxAgeSeconds: 60, degradedMaxAgeSeconds: 300 };

  it('returns UNKNOWN when no sourceTimestamp exists — never guesses a freshness', () => {
    expect(classifyFreshness({ sourceTimestamp: undefined }, '2026-01-01T00:02:00Z', thresholds)).toBe('UNKNOWN');
  });

  it('classifies FRESH within the fresh window', () => {
    expect(classifyFreshness({ sourceTimestamp: '2026-01-01T00:00:00Z' }, '2026-01-01T00:00:30Z', thresholds)).toBe('FRESH');
  });

  it('classifies DEGRADED between fresh and degraded thresholds', () => {
    expect(classifyFreshness({ sourceTimestamp: '2026-01-01T00:00:00Z' }, '2026-01-01T00:02:00Z', thresholds)).toBe('DEGRADED');
  });

  it('classifies STALE beyond the degraded threshold', () => {
    expect(classifyFreshness({ sourceTimestamp: '2026-01-01T00:00:00Z' }, '2026-01-01T00:10:00Z', thresholds)).toBe('STALE');
  });
});
