import { describe, it, expect } from 'vitest';
import { parseTxcFile, resolveScheduledJourney, isStopServedByLineDirection, isRevisionCurrentForDate } from './txcJourneyResolver';

// All identifiers below are fictional (see fixtures/synthetic/README.md): route X1, operator
// TEST_OPERATOR, stop codes FEN000001/FEN000002/FEN000003 in the fictional town "Fenbridge".

function fenbridgeTxc(journeyCode: string, departureTime: string, day = 'Saturday') {
  return `<?xml version="1.0"?>
<TransXChange RevisionNumber="1">
  <Services>
    <Service>
      <ServiceCode>SVC:FEN1</ServiceCode>
      <Lines><Line id="L1"><LineName>X1</LineName></Line></Lines>
      <OperatingPeriod><StartDate>2026-01-01</StartDate></OperatingPeriod>
      <OperatingProfile><RegularDayType><DaysOfWeek><${day}/></DaysOfWeek></RegularDayType></OperatingProfile>
    </Service>
  </Services>
  <JourneyPatternSections>
    <JourneyPatternSection id="JPS1">
      <JourneyPatternTimingLink id="JPTL1">
        <From><StopPointRef>FEN000001</StopPointRef></From>
        <To><StopPointRef>FEN000002</StopPointRef><WaitTime>PT0S</WaitTime></To>
        <RunTime>PT10M</RunTime>
      </JourneyPatternTimingLink>
      <JourneyPatternTimingLink id="JPTL2">
        <From><StopPointRef>FEN000002</StopPointRef></From>
        <To><StopPointRef>FEN000003</StopPointRef><WaitTime>PT0S</WaitTime></To>
        <RunTime>PT15M</RunTime>
      </JourneyPatternTimingLink>
    </JourneyPatternSection>
  </JourneyPatternSections>
  <JourneyPatterns>
    <JourneyPattern id="JP1">
      <Direction>outbound</Direction>
      <DestinationDisplay>Fenbridge Market Square</DestinationDisplay>
      <JourneyPatternSectionRefs>JPS1</JourneyPatternSectionRefs>
    </JourneyPattern>
  </JourneyPatterns>
  <VehicleJourneys>
    <VehicleJourney>
      <Operational><TicketMachine><JourneyCode>${journeyCode}</JourneyCode></TicketMachine></Operational>
      <VehicleJourneyCode>VJ_${journeyCode}</VehicleJourneyCode>
      <JourneyPatternRef>JP1</JourneyPatternRef>
      <DepartureTime>${departureTime}</DepartureTime>
      <OperatingProfile><RegularDayType><DaysOfWeek><${day}/></DaysOfWeek></RegularDayType></OperatingProfile>
    </VehicleJourney>
  </VehicleJourneys>
</TransXChange>`;
}

describe('parseTxcFile', () => {
  it('parses service metadata, journey pattern, and vehicle journey correctly', () => {
    const file = parseTxcFile(fenbridgeTxc('J100', '09:00:00'));
    expect(file.lineName).toBe('X1');
    expect(file.serviceCode).toBe('SVC:FEN1');
    expect(file.vehicleJourneys).toHaveLength(1);
    expect(file.vehicleJourneys[0].journeyCode).toBe('J100');
    expect(file.journeyPatterns.get('JP1')?.stopSequence).toEqual(['FEN000001', 'FEN000002', 'FEN000003']);
  });
});

describe('isRevisionCurrentForDate', () => {
  it('is true for a date inside the operating period, false outside it', () => {
    const file = parseTxcFile(fenbridgeTxc('J100', '09:00:00'));
    expect(isRevisionCurrentForDate(file, '2026-06-01')).toBe(true);
    expect(isRevisionCurrentForDate(file, '2025-12-31')).toBe(false);
  });
});

describe('resolveScheduledJourney', () => {
  it('resolves a unique VehicleJourney as EXACT', () => {
    const file = parseTxcFile(fenbridgeTxc('J100', '09:00:00'));
    const result = resolveScheduledJourney([file], 'FEN000001', 'FEN000003', '2026-06-06', 'TEST_OPERATOR');
    expect('evidenceLevel' in result && result.evidenceLevel).toBe('EXACT');
    if ('scheduledBoardingDeparture' in result) {
      expect(result.scheduledBoardingDeparture).toBe('09:00:00');
      expect(result.scheduledAlightingArrival).toBe('09:25:00'); // +10min +15min
      expect(result.datedVehicleJourneyRef).toBe('J100');
    }
  });

  it('returns UNAVAILABLE when no journey serves both stops on that date', () => {
    const file = parseTxcFile(fenbridgeTxc('J100', '09:00:00', 'Sunday'));
    const result = resolveScheduledJourney([file], 'FEN000001', 'FEN000003', '2026-06-06', 'TEST_OPERATOR'); // 2026-06-06 is a Saturday
    expect(result.evidenceLevel).toBe('UNAVAILABLE');
  });

  it('narrows multiple structurally-valid candidates by predicted time without ever claiming EXACT', () => {
    const fileA = parseTxcFile(fenbridgeTxc('J100', '09:00:00'));
    const fileB = parseTxcFile(fenbridgeTxc('J200', '09:40:00'));
    // Merge both vehicle journeys under one pattern set by reusing fileA's patterns for fileB's VJ
    const merged = { ...fileA, vehicleJourneys: [...fileA.vehicleJourneys, ...fileB.vehicleJourneys] };
    const result = resolveScheduledJourney([merged], 'FEN000001', 'FEN000003', '2026-06-06', 'TEST_OPERATOR', '09:05:00');
    expect(result.evidenceLevel).toBe('CORRELATED'); // never EXACT with 2 structural candidates
    if ('datedVehicleJourneyRef' in result) {
      expect(result.datedVehicleJourneyRef).toBe('J100'); // nearest to predicted 09:05
    }
  });
});

describe('isStopServedByLineDirection', () => {
  it('returns true only for a stop genuinely on that line+direction pattern', () => {
    const file = parseTxcFile(fenbridgeTxc('J100', '09:00:00'));
    expect(isStopServedByLineDirection([file], 'FEN000002', 'X1', 'outbound', '2026-06-06')).toBe(true);
    expect(isStopServedByLineDirection([file], 'FEN000999', 'X1', 'outbound', '2026-06-06')).toBe(false);
    expect(isStopServedByLineDirection([file], 'FEN000002', 'X1', 'inbound', '2026-06-06')).toBe(false);
  });
});
