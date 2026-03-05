const GeofenceMath = require('../utils/geofenceMath');
const nexusSwitchgear = require('../services/nexusSwitchgear');
const TaxNexus = require('../models/TaxNexus');

jest.mock('../models/TaxNexus');

describe('Nexus Switchgear - Policy Swapping Accuracy', () => {

    describe('GeofenceMath', () => {
        test('point-in-polygon: correctly identifies point inside Germany bounding box', () => {
            const germanyPoly = [[
                [5.87, 47.27], [15.04, 47.27], [15.04, 55.05], [5.87, 55.05], [5.87, 47.27]
            ]];
            const berlinCoord = [13.40, 52.52]; // Berlin [lng, lat]
            const londonCoord = [-0.12, 51.50]; // London

            expect(GeofenceMath.pointInPolygon(berlinCoord, germanyPoly)).toBe(true);
            expect(GeofenceMath.pointInPolygon(londonCoord, germanyPoly)).toBe(false);
        });

        test('ipInCidr: correctly matches IP to known CIDR range', () => {
            expect(GeofenceMath.ipInCidr('192.168.1.42', '192.168.1.0/24')).toBe(true);
            expect(GeofenceMath.ipInCidr('10.0.0.1', '192.168.1.0/24')).toBe(false);
        });
    });

    describe('NexusSwitchgear', () => {
        beforeEach(() => {
            // Seed mock nexus with a Germany VAT rule
            TaxNexus.find.mockResolvedValue([{
                jurisdictionCode: 'DE',
                jurisdictionName: 'Germany',
                taxType: 'VAT',
                rate: 0.19,
                ipCidrRanges: ['195.74.144.0/21'],
                nexusTriggers: [{ type: 'CURRENCY', currencyCode: 'EUR' }],
                geoBoundary: { coordinates: [[[5.87, 47.27], [15.04, 47.27], [15.04, 55.05], [5.87, 55.05], [5.87, 47.27]]] }
            }]);
            nexusSwitchgear.invalidateCache(); // Ensure fresh data per test
        });

        test('resolves Germany VAT nexus from merchant IP', async () => {
            TaxNexus.findOne.mockResolvedValue({
                jurisdictionCode: 'DE', taxType: 'VAT', rate: 0.19, policyNodeId: null
            });

            const result = await nexusSwitchgear.resolve({
                amount: 500,
                merchantIp: '195.74.146.10',
                currency: 'USD'
            });

            expect(result.jurisdictionCode).toBe('DE');
            expect(result.taxRate).toBe(0.19);
        });

        test('resolves Germany VAT nexus from merchant coordinate', async () => {
            TaxNexus.findOne.mockResolvedValue({
                jurisdictionCode: 'DE', taxType: 'VAT', rate: 0.19, policyNodeId: null
            });

            const result = await nexusSwitchgear.resolve({
                amount: 300,
                merchantCoord: [13.40, 52.52], // Berlin
                currency: 'USD'
            });

            expect(result.jurisdictionCode).toBe('DE');
        });

        test('returns null when no nexus is detected', async () => {
            TaxNexus.find.mockResolvedValue([]); // No nexus rules
            nexusSwitchgear.invalidateCache();

            const result = await nexusSwitchgear.resolve({ amount: 100, currency: 'JPY' });
            expect(result.applied).toBe(false);
            expect(result.jurisdictionCode).toBeNull();
        });
    });
});
