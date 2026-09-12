import { describe, it, expect, vi } from 'vitest';
import { SiriVmOperationalProvider, parseVehicleActivities } from './busOperationalProvider';

// Synthetic SIRI-VM payload — fictional operator/line/vehicle refs, not a captured real feed.
function siriVmXml(datedVehicleJourneyRef: string, recordedAt: string) {
  return `<?xml version="1.0"?>
<Siri>
  <ServiceDelivery>
    <VehicleMonitoringDelivery>
      <VehicleActivity>
        <RecordedAtTime>${recordedAt}</RecordedAtTime>
        <MonitoredVehicleJourney>
          <OperatorRef>TEST_OPERATOR</OperatorRef>
          <LineRef>X1</LineRef>
          <DirectionRef>outbound</DirectionRef>
          <FramedVehicleJourneyRef><DatedVehicleJourneyRef>${datedVehicleJourneyRef}</DatedVehicleJourneyRef></FramedVehicleJourneyRef>
          <VehicleRef>TEST_VEHICLE_1</VehicleRef>
          <VehicleLocation><Latitude>51.0</Latitude><Longitude>1.0</Longitude></VehicleLocation>
          <OriginName>Fenbridge Bus Station</OriginName>
          <DestinationName>Fenbridge Market Square</DestinationName>
        </MonitoredVehicleJourney>
      </VehicleActivity>
    </VehicleMonitoringDelivery>
  </ServiceDelivery>
</Siri>`;
}

describe('parseVehicleActivities', () => {
  it('parses a VehicleActivity block into its constituent fields', () => {
    const activities = parseVehicleActivities(siriVmXml('J100', '2026-06-06T09:00:00Z'));
    expect(activities).toHaveLength(1);
    expect(activities[0].datedVehicleJourneyRef).toBe('J100');
    expect(activities[0].latitude).toBe(51.0);
  });
});

describe('SiriVmOperationalProvider.queryLiveVehicles', () => {
  it('classifies an exact DatedVehicleJourneyRef match as CORRELATED_HIGH, never EXACT', async () => {
    const provider = new SiriVmOperationalProvider(async () => siriVmXml('J100', new Date().toISOString()));
    const results = await provider.queryLiveVehicles({ operatorRef: 'TEST_OPERATOR', lineRef: 'X1', direction: 'outbound', datedVehicleJourneyRef: 'J100' });
    expect(results).toHaveLength(1);
    expect(results[0].evidenceLevel).toBe('CORRELATED_HIGH');
    expect(results[0].freshness).toBe('FRESH');
  });

  it('classifies a non-matching ref as CORRELATED, not CORRELATED_HIGH', async () => {
    const provider = new SiriVmOperationalProvider(async () => siriVmXml('J999', new Date().toISOString()));
    const results = await provider.queryLiveVehicles({ operatorRef: 'TEST_OPERATOR', lineRef: 'X1', direction: 'outbound', datedVehicleJourneyRef: 'J100' });
    expect(results[0].evidenceLevel).toBe('CORRELATED');
  });

  it('fails open to an empty array when the fetcher throws', async () => {
    const provider = new SiriVmOperationalProvider(async () => {
      throw new Error('endpoint unreachable');
    });
    const results = await provider.queryLiveVehicles({ operatorRef: 'TEST_OPERATOR', lineRef: 'X1', direction: 'outbound' });
    expect(results).toEqual([]);
  });

  it('classifies old evidence as STALE freshness, never silently trusted as fresh', async () => {
    const staleTime = new Date(Date.now() - 400_000).toISOString(); // >300s old
    const provider = new SiriVmOperationalProvider(async () => siriVmXml('J100', staleTime));
    const results = await provider.queryLiveVehicles({ operatorRef: 'TEST_OPERATOR', lineRef: 'X1', direction: 'outbound', datedVehicleJourneyRef: 'J100' });
    expect(results[0].freshness).toBe('STALE');
  });
});
