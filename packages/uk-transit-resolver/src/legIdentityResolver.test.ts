import { describe, it, expect } from 'vitest';
import { resolveTransitLegEvidence, TransitLegQuery } from './legIdentityResolver';
import { NaptanStopIndex, NaptanRow } from './naptanStopResolver';
import { SiriVmOperationalProvider } from './busOperationalProvider';
import { parseTxcFile, ParsedTxcFile } from './txcJourneyResolver';

// All identifiers are fictional — see fixtures/synthetic/README.md.
function fenbridgeTxc(journeyCode: string, departureTime: string): ParsedTxcFile {
  return parseTxcFile(`<?xml version="1.0"?>
<TransXChange RevisionNumber="1">
  <Services>
    <Service>
      <ServiceCode>SVC:FEN1</ServiceCode>
      <Lines><Line id="L1"><LineName>X1</LineName></Line></Lines>
      <OperatingPeriod><StartDate>2026-01-01</StartDate></OperatingPeriod>
      <OperatingProfile><RegularDayType><DaysOfWeek><Saturday/></DaysOfWeek></RegularDayType></OperatingProfile>
    </Service>
  </Services>
  <JourneyPatternSections>
    <JourneyPatternSection id="JPS1">
      <JourneyPatternTimingLink id="JPTL1">
        <From><StopPointRef>FEN000001</StopPointRef></From>
        <To><StopPointRef>FEN000002</StopPointRef><WaitTime>PT0S</WaitTime></To>
        <RunTime>PT10M</RunTime>
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
      <OperatingProfile><RegularDayType><DaysOfWeek><Saturday/></DaysOfWeek></RegularDayType></OperatingProfile>
    </VehicleJourney>
  </VehicleJourneys>
</TransXChange>`);
}

function fenbridgeRow(atco: string, name: string, lat: number, lon: number): NaptanRow {
  return { atco, naptan: null, name, indicator: null, locality: 'Fenbridge', lat, lon, stopType: 'BCT', adminAreaCode: '9999', status: 'active' };
}

function leg(overrides: Partial<TransitLegQuery> = {}): TransitLegQuery {
  return {
    id: 'leg1',
    mode: 'bus',
    origin: { name: 'Fenbridge Bus Station', coordinate: { latitude: 51.0, longitude: 1.0 } },
    destination: { name: 'Fenbridge Market Square', coordinate: { latitude: 51.001, longitude: 1.001 } },
    ...overrides,
  };
}

const fixedNow = () => new Date('2026-06-06T08:55:00Z'); // a Saturday

describe('resolveTransitLegEvidence', () => {
  it('returns null for a non-bus leg — this module never claims coverage it does not have', async () => {
    const stopIndex = new NaptanStopIndex({}, async () => []);
    const provider = new SiriVmOperationalProvider(async () => '<Siri/>');
    const result = await resolveTransitLegEvidence(leg({ mode: 'rail' }), { provider, stopIndex, txcFiles: [], operatorRef: 'TEST_OPERATOR', now: fixedNow });
    expect(result).toBeNull();
  });

  it('reaches SCHEDULE_ONLY, not a failure, when no live vehicle exists for a real scheduled journey', async () => {
    const rows = [fenbridgeRow('FEN000001', 'Fenbridge Bus Station', 51.0, 1.0), fenbridgeRow('FEN000002', 'Fenbridge Market Square', 51.001, 1.001)];
    const stopIndex = new NaptanStopIndex({ '9999': 'Fenbridge' }, async () => rows);
    const provider = new SiriVmOperationalProvider(async () => '<Siri/>'); // no vehicles at all
    const txcFiles = [fenbridgeTxc('J100', '08:50:00')];
    const result = await resolveTransitLegEvidence(leg(), { provider, stopIndex, txcFiles, operatorRef: 'TEST_OPERATOR', now: fixedNow });
    expect(result?.resultEvidenceLevel).toBe('SCHEDULE_ONLY');
    expect(result?.operationalState).toBe('SCHEDULE_ONLY');
  });

  it('reaches LIVE_EXACT when stop, schedule, and a fresh exact live match all agree', async () => {
    const rows = [fenbridgeRow('FEN000001', 'Fenbridge Bus Station', 51.0, 1.0), fenbridgeRow('FEN000002', 'Fenbridge Market Square', 51.001, 1.001)];
    const stopIndex = new NaptanStopIndex({ '9999': 'Fenbridge' }, async () => rows);
    // RecordedAtTime must be close to the REAL current time: the operational provider's
    // freshness clock reads real Date.now(), independent of the resolver's own injectable
    // `now` (which only governs date-dependent schedule logic like operating day) — this
    // mirrors how a real system's live-vehicle feed is always judged against real wall-clock
    // time, not a test's simulated date.
    const siriXml = `<Siri><ServiceDelivery><VehicleMonitoringDelivery><VehicleActivity>
      <RecordedAtTime>${new Date().toISOString()}</RecordedAtTime>
      <MonitoredVehicleJourney>
        <OperatorRef>TEST_OPERATOR</OperatorRef><LineRef>X1</LineRef><DirectionRef>outbound</DirectionRef>
        <FramedVehicleJourneyRef><DatedVehicleJourneyRef>J100</DatedVehicleJourneyRef></FramedVehicleJourneyRef>
        <VehicleRef>TEST_VEHICLE_1</VehicleRef>
        <VehicleLocation><Latitude>51.0</Latitude><Longitude>1.0</Longitude></VehicleLocation>
      </MonitoredVehicleJourney>
    </VehicleActivity></VehicleMonitoringDelivery></ServiceDelivery></Siri>`;
    const provider = new SiriVmOperationalProvider(async () => siriXml);
    const txcFiles = [fenbridgeTxc('J100', '08:50:00')];
    const result = await resolveTransitLegEvidence(leg(), { provider, stopIndex, txcFiles, operatorRef: 'TEST_OPERATOR', now: fixedNow });
    // Composite exact match is CORRELATED_HIGH at the live tier by this package's own doctrine
    // (never a provider-attested EXACT) — so the fresh composite result is LIVE_CORRELATED_HIGH,
    // not LIVE_EXACT, since no live tier ever reports EXACT in this module.
    expect(result?.resultEvidenceLevel).toBe('LIVE_CORRELATED_HIGH');
  });

  it('never breaks the caller when NaPTAN lookup throws — degrades to UNAVAILABLE evidence, not an exception', async () => {
    const stopIndex = new NaptanStopIndex({ '9999': 'Fenbridge' }, async () => {
      throw new Error('network down');
    });
    const provider = new SiriVmOperationalProvider(async () => '<Siri/>');
    const result = await resolveTransitLegEvidence(leg(), { provider, stopIndex, txcFiles: [], operatorRef: 'TEST_OPERATOR', now: fixedNow });
    expect(result?.resultEvidenceLevel).toBe('UNAVAILABLE');
  });

  it('route-context upgrade: an ambiguous stop match narrows to CORRELATED_HIGH once exactly one near-miss candidate serves the resolved line+direction', async () => {
    // Two stops within 40m — genuinely ambiguous by distance alone.
    const rows = [
      fenbridgeRow('FEN000001', 'Fenbridge Bus Station Bay A', 51.0, 1.0),
      fenbridgeRow('FEN000002', 'Fenbridge Bus Station Bay B', 51.00015, 1.0),
      fenbridgeRow('FEN000003', 'Fenbridge Market Square', 51.001, 1.001),
    ];
    const stopIndex = new NaptanStopIndex({ '9999': 'Fenbridge' }, async () => rows);
    const provider = new SiriVmOperationalProvider(async () => '<Siri/>');
    // The pattern actually served by line X1 outbound runs FEN000001 -> FEN000003 directly —
    // FEN000002 (Bay B, the other near-miss competitor) is deliberately NOT on this pattern,
    // which is exactly the real-world shape the route-context upgrade needs to prove itself
    // against (only one of the two near-miss candidates is actually served by the resolved
    // line+direction).
    const txcFiles = [
      parseTxcFile(`<?xml version="1.0"?>
<TransXChange RevisionNumber="1">
  <Services>
    <Service>
      <ServiceCode>SVC:FEN1</ServiceCode>
      <Lines><Line id="L1"><LineName>X1</LineName></Line></Lines>
      <OperatingPeriod><StartDate>2026-01-01</StartDate></OperatingPeriod>
      <OperatingProfile><RegularDayType><DaysOfWeek><Saturday/></DaysOfWeek></RegularDayType></OperatingProfile>
    </Service>
  </Services>
  <JourneyPatternSections>
    <JourneyPatternSection id="JPS1">
      <JourneyPatternTimingLink id="JPTL1">
        <From><StopPointRef>FEN000001</StopPointRef></From>
        <To><StopPointRef>FEN000003</StopPointRef><WaitTime>PT0S</WaitTime></To>
        <RunTime>PT12M</RunTime>
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
      <Operational><TicketMachine><JourneyCode>J100</JourneyCode></TicketMachine></Operational>
      <VehicleJourneyCode>VJ_J100</VehicleJourneyCode>
      <JourneyPatternRef>JP1</JourneyPatternRef>
      <DepartureTime>08:50:00</DepartureTime>
      <OperatingProfile><RegularDayType><DaysOfWeek><Saturday/></DaysOfWeek></RegularDayType></OperatingProfile>
    </VehicleJourney>
  </VehicleJourneys>
</TransXChange>`),
    ];
    const result = await resolveTransitLegEvidence(
      leg({ origin: { name: 'Fenbridge Bus Station', coordinate: { latitude: 51.0, longitude: 1.0 } } }),
      { provider, stopIndex, txcFiles, operatorRef: 'TEST_OPERATOR', now: fixedNow },
    );
    expect(result?.stopIdentity.evidenceLevel).toBe('CORRELATED_HIGH');
    expect(result?.stopIdentity.evidence).toContain('route-context upgrade');
  });
});
