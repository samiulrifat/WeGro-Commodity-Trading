import { TrackRecordBuilder } from './track-record-summary';

/**
 * A farmer's record from rows as the database returns them: claims counted
 * per project (approved and rejected), imported history named from the
 * catalog. The SQL runs against Postgres in the chain suite.
 */
describe('TrackRecordBuilder', () => {
  const PROJECT = 'p1';
  const rows: Array<[RegExp, object[]]> = [
    [
      /FROM projects\s+WHERE farmer_id/,
      [
        {
          id: PROJECT,
          title: 'Maize in Bogura',
          produce_code: 'MAIZE',
          district_code: 'BOGURA',
          duration_type: 'short_term',
          duration_months: 5,
          issued_slots: 5,
          slot_price: '1000000',
          activated_at: new Date('2026-01-01T00:00:00Z'),
          finished_at: new Date('2026-05-15T00:00:00Z'),
        },
      ],
    ],
    [
      /FROM settlement_rounds\s+WHERE/,
      [
        {
          project_id: PROJECT,
          income: '7000000',
          costs: '1000000',
          investor_total: '5500000',
        },
      ],
    ],
    [
      /FROM insurance_claims/,
      [
        {
          project_id: PROJECT,
          status: 'paid',
          amount: '500000',
          event_type_code: 'FLOOD',
          occurred_on: '2026-03-01',
          severity: 'severe',
        },
        {
          project_id: PROJECT,
          status: 'rejected',
          amount: null,
          event_type_code: 'DROUGHT',
          occurred_on: '2026-04-01',
          severity: 'low',
        },
      ],
    ],
    [
      /FROM legacy_projects/,
      [
        {
          title: 'Potato, 2024',
          produce_code: 'POTATO',
          district_code: 'RANGPUR',
          started_on: '2024-01-01',
          finished_on: '2024-05-01',
          funding_raised: '1000000',
          income: '1200000',
          costs: '100000',
          farmer_received: '400000',
          harvested: '2000',
          sold: '1900',
        },
      ],
    ],
  ];
  const builder = new TrackRecordBuilder(
    {
      query: (sql: string) =>
        Promise.resolve(rows.find(([re]) => re.test(sql))?.[1] ?? []),
    } as never,
    {
      produceTypes: {
        get: (code: string) =>
          ({
            MAIZE: { name: 'Maize', unitCode: 'KG' },
            POTATO: { name: 'Potato', unitCode: 'KG' },
          })[code],
      },
      units: { get: () => ({ symbol: 'kg' }) },
    } as never,
  );

  it('counts approved and rejected claims per project, and the insurance in the income', async () => {
    const { summary } = await builder.build({
      recordId: 'r1',
      farmer: { id: 'f1', name: 'Rahim', districtCode: 'BOGURA' },
      now: new Date('2026-10-14T00:00:00Z'),
    });
    expect(summary.projects[0].risk).toEqual({
      claimsApproved: 1,
      claimsRejected: 1,
      approvedAmount: '5000.00',
      events: [
        { type: 'FLOOD', occurredOn: '2026-03-01', severity: 'severe' },
        { type: 'DROUGHT', occurredOn: '2026-04-01', severity: 'low' },
      ],
    });
    expect(summary.projects[0].money).toMatchObject({
      income: '70000.00',
      insurance: '5000.00',
      sales: '65000.00',
      investorReturnPercent: '10.00',
    });
    expect(summary.totals).toMatchObject({
      projects: 1,
      finishedOnTime: 1,
      claimsApproved: 1,
      claimsApprovedAmount: '5000.00',
    });
  });

  it('names imported projects and their unit from the catalog', async () => {
    const [imported] = await builder.importedHistory('f1');
    expect(imported).toMatchObject({
      title: 'Potato, 2024',
      produce: { code: 'POTATO', name: 'Potato', unit: 'kg' },
    });
  });
});
