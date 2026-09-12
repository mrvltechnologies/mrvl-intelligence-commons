/**
 * TransXChange (TXC) scheduled-journey resolver. TransXChange is the UK Department for
 * Transport's XML standard for bus schedule data (schema: Crown copyright, royalty-free
 * reproduction with acknowledgement — see this repository's `THIRD_PARTY_NOTICES.md`).
 * Operator-originated schedule *content* published through this schema belongs to the
 * respective publishing operator; this module implements the schema's wire format, it does not
 * redistribute any operator's actual dataset.
 *
 * XML handling is a small, deliberately scoped regex-based extractor, not a general XML parser
 * — real TXC structure is regular enough for this to be a safe, minimal choice for the elements
 * this resolver reads. If your dataset defeats this extractor, that is real evidence to add a
 * proper XML parser dependency, not a reason to add one speculatively.
 */

import { ScheduledJourneyResolution, ScheduledJourneyEvidenceLevel } from './types';

interface TimingLink {
  /** The JourneyPatternTimingLink's own `id` attribute (e.g. "JPTL1") — the key
   * VehicleJourneyTimingLink overrides reference. Overrides do NOT repeat `StopPointRef`; they
   * reference the original link by this id and carry only a replacement RunTime/WaitTime (and
   * sometimes Activity), never re-stating stop identity. Keying overrides by boarding stop
   * instead silently drops every override for operators that use this override style. */
  id: string;
  from: string;
  to: string;
  runTimeSeconds: number;
  waitTimeSeconds: number;
}

interface ResolvedJourneyPattern {
  id: string;
  direction: string;
  destinationDisplay: string | null;
  stopSequence: string[]; // ordered StopPointRefs, start to end
  links: TimingLink[];
}

interface ParsedVehicleJourney {
  journeyCode: string;
  vehicleJourneyCode: string;
  journeyPatternRef: string;
  departureTime: string; // HH:MM:SS, local time — TXC's own convention, never UTC-shifted here
  daysOfWeek: string[] | null;
  servicedOrganisationRef: string | null;
  /** VehicleJourneyTimingLink overrides keyed by `JourneyPatternTimingLinkRef` (e.g. "JPTL1")
   * — not by stop; see `TimingLink`'s doc comment for why. Some operators supply these, others
   * don't — this resolver must handle both, never assume either. */
  timingOverrides: Map<string, { runTimeSeconds: number | null; waitTimeSeconds: number | null }>;
}

export interface ParsedTxcFile {
  serviceCode: string;
  lineName: string;
  operatingPeriod: { startDate: string; endDate: string | null };
  revisionNumber: string;
  serviceDaysOfWeek: string[] | null;
  journeyPatterns: Map<string, ResolvedJourneyPattern>;
  vehicleJourneys: ParsedVehicleJourney[];
}

function extractAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'g');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

function extractFirst(xml: string, tag: string): string | null {
  const re = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`);
  const m = re.exec(xml);
  return m ? m[1].trim() : null;
}

function extractAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*\\b${attr}="([^"]*)"`);
  const m = re.exec(xml);
  return m ? m[1] : null;
}

function extractSelfClosingTags(xml: string): string[] {
  // For enum-shaped elements like <Monday/> inside DaysOfWeek — no text content to capture.
  const re = /<(?:\w+:)?([A-Za-z][A-Za-z0-9]*)\s*\/>/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

function parseDuration(s: string | null): number {
  if (!s) return 0;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(s);
  if (!m) return 0;
  const [, h, min, sec] = m;
  return (parseInt(h || '0', 10) * 3600) + (parseInt(min || '0', 10) * 60) + parseInt(sec || '0', 10);
}

export function parseTxcFile(xml: string): ParsedTxcFile {
  const revisionNumber = extractAttr(xml, 'TransXChange', 'RevisionNumber') ?? 'unknown';
  const serviceBlock = extractFirst(xml, 'Service') ?? '';
  const serviceCode = extractFirst(serviceBlock, 'ServiceCode') ?? 'unknown';
  const opPeriodBlock = extractFirst(serviceBlock, 'OperatingPeriod') ?? '';
  const startDate = extractFirst(opPeriodBlock, 'StartDate') ?? 'unknown';
  const endDate = extractFirst(opPeriodBlock, 'EndDate');
  const lineBlock = extractFirst(serviceBlock, 'Line') ?? '';
  const lineName = extractFirst(lineBlock, 'LineName') ?? 'unknown';

  const serviceOpProfile = extractFirst(serviceBlock, 'OperatingProfile');
  const serviceDaysOfWeek = serviceOpProfile
    ? (() => {
        const daysBlock = extractFirst(serviceOpProfile, 'DaysOfWeek');
        return daysBlock ? extractSelfClosingTags(daysBlock) : null;
      })()
    : null;

  const jpsBlocks = new Map<string, TimingLink[]>();
  const jpsRe = /<(?:\w+:)?JourneyPatternSection\b[^>]*\bid="([^"]*)"[^>]*>([\s\S]*?)<\/(?:\w+:)?JourneyPatternSection>/g;
  let jpsMatch: RegExpExecArray | null;
  while ((jpsMatch = jpsRe.exec(xml))) {
    const [, sectionId, body] = jpsMatch;
    const linkRe = /<(?:\w+:)?JourneyPatternTimingLink\b[^>]*\bid="([^"]*)"[^>]*>([\s\S]*?)<\/(?:\w+:)?JourneyPatternTimingLink>/g;
    const links: TimingLink[] = [];
    let linkMatch: RegExpExecArray | null;
    while ((linkMatch = linkRe.exec(body))) {
      const [, linkId, link] = linkMatch;
      const fromBlock = extractFirst(link, 'From') ?? '';
      const toBlock = extractFirst(link, 'To') ?? '';
      links.push({
        id: linkId,
        from: extractFirst(fromBlock, 'StopPointRef') ?? '',
        to: extractFirst(toBlock, 'StopPointRef') ?? '',
        runTimeSeconds: parseDuration(extractFirst(link, 'RunTime')),
        waitTimeSeconds: parseDuration(extractFirst(toBlock, 'WaitTime')),
      });
    }
    jpsBlocks.set(sectionId, links);
  }

  const journeyPatterns = new Map<string, ResolvedJourneyPattern>();
  const jpRe = /<(?:\w+:)?JourneyPattern\b[^>]*\bid="([^"]*)"[^>]*>([\s\S]*?)<\/(?:\w+:)?JourneyPattern>/g;
  let jpMatch: RegExpExecArray | null;
  while ((jpMatch = jpRe.exec(xml))) {
    const [, id, body] = jpMatch;
    const direction = extractFirst(body, 'Direction') ?? 'unknown';
    const destinationDisplay = extractFirst(body, 'DestinationDisplay');
    const sectionRefsText = extractFirst(body, 'JourneyPatternSectionRefs') ?? '';
    const sectionIds = sectionRefsText.split(/\s+/).filter(Boolean);

    const links: TimingLink[] = [];
    for (const sectionId of sectionIds) links.push(...(jpsBlocks.get(sectionId) ?? []));

    const stopSequence: string[] = [];
    for (const link of links) {
      if (stopSequence.length === 0 || stopSequence[stopSequence.length - 1] !== link.from) {
        stopSequence.push(link.from);
      }
      stopSequence.push(link.to);
    }
    journeyPatterns.set(id, { id, direction, destinationDisplay, stopSequence, links });
  }

  const vehicleJourneys: ParsedVehicleJourney[] = [];
  for (const vjBlock of extractAll(xml, 'VehicleJourney')) {
    const journeyCode = extractFirst(vjBlock, 'JourneyCode');
    if (!journeyCode) continue; // a VehicleJourney without a JourneyCode cannot be SIRI-correlated by this module's method
    const vehicleJourneyCode = extractFirst(vjBlock, 'VehicleJourneyCode') ?? journeyCode;
    const journeyPatternRef = extractFirst(vjBlock, 'JourneyPatternRef') ?? '';
    const departureTime = extractFirst(vjBlock, 'DepartureTime') ?? '';
    const opProfile = extractFirst(vjBlock, 'OperatingProfile');
    const daysOfWeek = opProfile
      ? (() => {
          const daysBlock = extractFirst(opProfile, 'DaysOfWeek');
          return daysBlock ? extractSelfClosingTags(daysBlock) : null;
        })()
      : null;
    const servicedOrganisationRef = opProfile ? extractFirst(opProfile, 'ServicedOrganisationRef') : null;

    // VehicleJourneyTimingLink overrides — the override references the ORIGINAL link via
    // <JourneyPatternTimingLinkRef>JPTL1</JourneyPatternTimingLinkRef>, not by repeating
    // StopPointRef. RunTime/WaitTime are each independently optional: a real override may
    // replace only one of the two, leaving the other to fall back to the pattern baseline.
    const timingOverrides = new Map<string, { runTimeSeconds: number | null; waitTimeSeconds: number | null }>();
    for (const overrideBlock of extractAll(vjBlock, 'VehicleJourneyTimingLink')) {
      const linkRef = extractFirst(overrideBlock, 'JourneyPatternTimingLinkRef');
      if (!linkRef) continue;
      const toBlock = extractFirst(overrideBlock, 'To') ?? '';
      const runTimeText = extractFirst(overrideBlock, 'RunTime');
      const waitTimeText = extractFirst(toBlock, 'WaitTime');
      timingOverrides.set(linkRef, {
        runTimeSeconds: runTimeText !== null ? parseDuration(runTimeText) : null,
        waitTimeSeconds: waitTimeText !== null ? parseDuration(waitTimeText) : null,
      });
    }

    vehicleJourneys.push({ journeyCode, vehicleJourneyCode, journeyPatternRef, departureTime, daysOfWeek, servicedOrganisationRef, timingOverrides });
  }

  return { serviceCode, lineName, operatingPeriod: { startDate, endDate }, revisionNumber, serviceDaysOfWeek, journeyPatterns, vehicleJourneys };
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Whether a parsed file's OperatingPeriod covers the given date — an expired file and a
 * current file can genuinely coexist in the same dataset, and only the currently-valid one may
 * compete for a match. */
export function isRevisionCurrentForDate(file: ParsedTxcFile, operatingDate: string): boolean {
  if (operatingDate < file.operatingPeriod.startDate) return false;
  if (file.operatingPeriod.endDate && operatingDate > file.operatingPeriod.endDate) return false;
  return true;
}

function operatesOnDate(daysOfWeek: string[] | null, operatingDate: string): boolean {
  if (!daysOfWeek) return false;
  const dayName = DAY_NAMES[new Date(`${operatingDate}T12:00:00Z`).getUTCDay()];
  return daysOfWeek.includes(dayName);
}

/**
 * Real, honestly small empirical sample: two real predicted-vs-scheduled offset pairs (~12 and
 * ~21 minutes), gathered from two different operators' real data. Too small to derive a precise
 * percentile tolerance, so this is used only as a SOFT ranking signal (nearest-in-time wins
 * among structurally-valid candidates), never a hard cutoff that could silently discard the
 * correct candidate. Recalibrate against your own real sample if you have one.
 */
const MATERIAL_TEMPORAL_MARGIN_SECONDS = 10 * 60;

function effectiveCumulativeSecondsToStop(pattern: ResolvedJourneyPattern, vj: ParsedVehicleJourney, targetStopRef: string): number | null {
  if (pattern.links.length > 0 && pattern.links[0].from === targetStopRef) return 0;
  let cumulative = 0;
  for (const link of pattern.links) {
    const override = vj.timingOverrides.get(link.id);
    const runTimeSeconds = override?.runTimeSeconds ?? link.runTimeSeconds;
    const waitTimeSeconds = override?.waitTimeSeconds ?? link.waitTimeSeconds;
    cumulative += runTimeSeconds + waitTimeSeconds;
    if (link.to === targetStopRef) return cumulative;
  }
  return null;
}

function addSecondsToTime(hhmmss: string, seconds: number): string {
  const [h, m, s] = hhmmss.split(':').map(Number);
  const total = (h * 3600 + m * 60 + s + seconds) % 86400;
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = Math.floor(total % 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function timeToSeconds(hhmmss: string): number {
  const [h, m, s] = hhmmss.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

/**
 * Resolves the strongest-supported scheduled VehicleJourney for a boarding/alighting ATCO pair
 * on a given operating date, across possibly-multiple TXC files (only currently-valid ones
 * considered). Never line-number-only, never nearest-time-only as the SOLE criterion — temporal
 * proximity narrows among already-structurally-valid candidates, it never promotes a result past
 * `CORRELATED` on its own.
 *
 * `predictedBoardingLocalTime` (HH:MM:SS, local time, e.g. from a routing provider's own
 * predicted-departure evidence — never treated as SCHEDULED truth) is optional supporting
 * evidence only: it narrows which structurally-valid candidate is chosen; it never changes
 * whether the result is structurally unique, and it never overwrites the real
 * TXC-derived `scheduledBoardingDeparture` in the result.
 */
export function resolveScheduledJourney(
  files: ParsedTxcFile[],
  boardingAtco: string,
  alightingAtco: string,
  operatingDate: string,
  operatorRef: string,
  predictedBoardingLocalTime?: string,
): ScheduledJourneyResolution | { evidenceLevel: 'UNAVAILABLE'; evidence: string } {
  const currentFiles = files.filter((f) => isRevisionCurrentForDate(f, operatingDate));
  if (currentFiles.length === 0) {
    return { evidenceLevel: 'UNAVAILABLE', evidence: 'No currently-valid TXC revision for this operating date' };
  }

  type Candidate = { file: ParsedTxcFile; pattern: ResolvedJourneyPattern; vj: ParsedVehicleJourney; boardingSeconds: number; alightingSeconds: number | null };
  const candidates: Candidate[] = [];

  for (const file of currentFiles) {
    for (const pattern of file.journeyPatterns.values()) {
      const boardIdx = pattern.stopSequence.indexOf(boardingAtco);
      const alightIdx = pattern.stopSequence.lastIndexOf(alightingAtco);
      if (boardIdx === -1 || alightIdx === -1 || boardIdx >= alightIdx) continue;
      for (const vj of file.vehicleJourneys) {
        if (vj.journeyPatternRef !== pattern.id) continue;
        // A VehicleJourney with no OperatingProfile of its own inherits the Service's — it does
        // not mean "never operates". Some operators carry it only at Service level, others
        // carry it per-VehicleJourney directly — both are real, both must be supported.
        if (!operatesOnDate(vj.daysOfWeek ?? file.serviceDaysOfWeek, operatingDate)) continue;
        const boardingOffset = effectiveCumulativeSecondsToStop(pattern, vj, boardingAtco);
        if (boardingOffset === null) continue;
        const alightingOffset = effectiveCumulativeSecondsToStop(pattern, vj, alightingAtco);
        candidates.push({ file, pattern, vj, boardingSeconds: boardingOffset, alightingSeconds: alightingOffset });
      }
    }
  }

  if (candidates.length === 0) {
    return { evidenceLevel: 'UNAVAILABLE', evidence: 'No TXC VehicleJourney found serving both stops, in order, on this operating date' };
  }

  let evidenceLevel: ScheduledJourneyEvidenceLevel = candidates.length === 1 ? 'EXACT' : 'AMBIGUOUS';
  let chosen = candidates[0];
  let temporalEvidenceNote = '';

  if (candidates.length > 1) {
    evidenceLevel = 'CORRELATED'; // multiple real structural candidates remain — never silently pick one and call it EXACT
    if (predictedBoardingLocalTime) {
      const predictedSeconds = timeToSeconds(predictedBoardingLocalTime);
      const scored = candidates
        .map((c) => {
          const scheduledSeconds = timeToSeconds(addSecondsToTime(c.vj.departureTime, c.boardingSeconds));
          const rawDiff = Math.abs(scheduledSeconds - predictedSeconds);
          return { candidate: c, diffSeconds: Math.min(rawDiff, 86400 - rawDiff) };
        })
        .sort((a, b) => a.diffSeconds - b.diffSeconds);
      chosen = scored[0].candidate;
      const runnerUpDiff = scored.length > 1 ? scored[1].diffSeconds : Infinity;
      const materiallyCloser = runnerUpDiff - scored[0].diffSeconds >= MATERIAL_TEMPORAL_MARGIN_SECONDS;
      temporalEvidenceNote = materiallyCloser
        ? `; temporally narrowed to the nearest candidate (${Math.round(scored[0].diffSeconds / 60)}min from predicted time, next-nearest ${Math.round(runnerUpDiff / 60)}min) — still CORRELATED, not EXACT, since structural ambiguity remains`
        : `; predicted time evidence considered but did not materially favour one candidate over another (nearest ${Math.round(scored[0].diffSeconds / 60)}min, next-nearest ${Math.round(runnerUpDiff / 60)}min) — real ambiguity retained honestly`;
    }
  }

  const scheduledBoardingDeparture = addSecondsToTime(chosen.vj.departureTime, chosen.boardingSeconds);
  const scheduledAlightingArrival = chosen.alightingSeconds !== null ? addSecondsToTime(chosen.vj.departureTime, chosen.alightingSeconds) : null;

  return {
    operatorRef,
    lineRef: chosen.file.lineName,
    serviceCode: chosen.file.serviceCode,
    journeyPatternRef: chosen.pattern.id,
    journeyCode: chosen.vj.journeyCode,
    datedVehicleJourneyRef: chosen.vj.journeyCode,
    boardingStopRef: boardingAtco,
    alightingStopRef: alightingAtco,
    scheduledBoardingDeparture,
    scheduledAlightingArrival,
    direction: chosen.pattern.direction,
    timetableRevision: { revisionNumber: chosen.file.revisionNumber, startDate: chosen.file.operatingPeriod.startDate, endDate: chosen.file.operatingPeriod.endDate },
    evidenceLevel,
    evidence:
      candidates.length === 1
        ? `Unique match: JourneyCode ${chosen.vj.journeyCode}, line ${chosen.file.lineName}, ${candidates.length} candidate found`
        : `${candidates.length} plausible candidates found${temporalEvidenceNote}`,
  };
}

/**
 * Route-context stop disambiguation. A genuinely ambiguous NaPTAN match (e.g. two or three real,
 * active stops within a few metres of each other) can still be legitimately narrowed AFTER a
 * scheduled journey's real line/direction is known, by checking real TXC `JourneyPattern`
 * membership — NOT by weakening the underlying distance-based ambiguity threshold itself.
 * Returns true only if this exact ATCO code is actually referenced, by the given line and
 * direction, in some currently-valid pattern — never a fuzzy/partial match.
 */
export function isStopServedByLineDirection(files: ParsedTxcFile[], atcoCode: string, lineName: string, direction: string, operatingDate: string): boolean {
  const currentFiles = files.filter((f) => f.lineName === lineName && isRevisionCurrentForDate(f, operatingDate));
  for (const file of currentFiles) {
    for (const pattern of file.journeyPatterns.values()) {
      if (pattern.direction === direction && pattern.stopSequence.includes(atcoCode)) return true;
    }
  }
  return false;
}
