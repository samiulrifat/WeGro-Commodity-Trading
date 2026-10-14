import { toCsv } from '../../common/csv';

/** Projects the seeder takes through the platform after the import. */
export type Story =
  | 'draft'
  | 'open'
  | 'funded'
  | 'inputs-and-claim'
  | 'stored-and-paid-out'
  | 'fresh-deals'
  | 'buy-back'
  | 'staged-payout'
  | 'cancelled';

export interface DatasetProject {
  id: string;
  story: Story;
  farmerId: string;
  produceCode: string;
  districtCode: string;
}

export interface Dataset {
  /** CSV text by file name, in the import's format. */
  files: Record<string, string>;
  projects: DatasetProject[];
  /** WeGro ids by role, in order. */
  people: Record<string, string[]>;
  /** Field officer of each farmer. */
  officerOf: Map<string, string>;
}

const FIRST = [
  'Rahim',
  'Karim',
  'Abdul',
  'Shafiq',
  'Nasrin',
  'Fatema',
  'Jamal',
  'Rafiq',
  'Shirin',
  'Mokbul',
  'Hasina',
  'Anwar',
  'Rokeya',
  'Selim',
  'Monir',
  'Rina',
  'Babul',
  'Shahana',
  'Kamal',
  'Laila',
  'Habib',
  'Sufia',
  'Mizan',
  'Parvin',
];
const LAST = [
  'Uddin',
  'Mia',
  'Hossain',
  'Begum',
  'Akter',
  'Rahman',
  'Islam',
  'Sarkar',
  'Mondal',
  'Sheikh',
  'Khatun',
  'Alam',
  'Chowdhury',
  'Pramanik',
  'Bepari',
];
const DISTRICTS = ['BOGURA', 'RANGPUR', 'DINAJPUR', 'RAJSHAHI', 'NAOGAON'];

/** Small deterministic generator (mulberry32): the same data every run. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The sample world: staff, farmers with their officers, investors,
 * suppliers, buyers, a warehouse operator, an insurer and a bank officer;
 * projects for every story, the investments that fund them, and finished
 * history for some farmers. `scale` multiplies farmers, investors and
 * stories (1 = showcase, 5 = large). `tag` goes into payment references,
 * which the ledger never accepts twice.
 */
export function buildDataset(scale: number, tag = 'SAMPLE'): Dataset {
  const next = random(20261013);
  const pick = <T>(list: readonly T[]) =>
    list[Math.floor(next() * list.length)];
  const people: string[][] = [];
  const byRole: Record<string, string[]> = {};
  const officerOf = new Map<string, string>();
  let serial = 0;
  const person = (role: string, officer?: string) => {
    serial++;
    const id = `S-${role.toUpperCase().replace('_', '-')}-${String((byRole[role]?.length ?? 0) + 1).padStart(3, '0')}`;
    (byRole[role] ??= []).push(id);
    if (officer) officerOf.set(id, officer);
    const year = 1965 + Math.floor(next() * 35);
    const month = String(1 + Math.floor(next() * 12)).padStart(2, '0');
    const day = String(1 + Math.floor(next() * 28)).padStart(2, '0');
    const district = pick(DISTRICTS);
    people.push([
      id,
      role,
      `${pick(FIRST)} ${pick(LAST)}`,
      `0181${String(serial).padStart(7, '0')}`,
      // A 10-digit smart-card number: first digit 1-9, the rest varied.
      `${1 + Math.floor(next() * 9)}${String(Math.floor(next() * 1e9)).padStart(9, '0')}`,
      `${year}-${month}-${day}`,
      district,
      `Village ${serial}, ${district.charAt(0)}${district.slice(1).toLowerCase()}`,
      officer ?? '',
      '',
    ]);
    return id;
  };

  for (const role of [
    'admin',
    'admin',
    'accounts',
    'accounts',
    'operations',
    'auditor',
  ]) {
    person(role);
  }
  const officers = [person('field_officer'), person('field_officer')];
  const farmers = Array.from({ length: 10 * scale }, (_, i) =>
    person('farmer', officers[i % officers.length]),
  );
  const investors = Array.from({ length: 20 * scale }, () =>
    person('investor'),
  );
  for (const role of [
    'supplier',
    'supplier',
    'buyer',
    'buyer',
    'buyer',
    'warehouse',
    'insurer',
    'bank',
  ]) {
    person(role);
  }

  // Projects: every story `scale` times, each on its own farmer.
  const stories: Array<[Story, string, string]> = [
    ['draft', 'PADDY', 'short_term'],
    ['open', 'WHEAT', 'short_term'],
    ['funded', 'LENTIL', 'short_term'],
    ['inputs-and-claim', 'MAIZE', 'short_term'],
    ['stored-and-paid-out', 'MAIZE', 'short_term'],
    ['fresh-deals', 'TOMATO', 'short_term'],
    ['buy-back', 'POTATO', 'short_term'],
    ['staged-payout', 'POTATO', 'long_term'],
    ['cancelled', 'MUSTARD', 'short_term'],
  ];
  const projects: DatasetProject[] = [];
  const projectRows: string[][] = [];
  const investmentRows: string[][] = [];
  let investor = 0;
  let farmer = 0;
  for (let round = 0; round < scale; round++) {
    for (const [story, produce, durationType] of stories) {
      const farmerId = farmers[farmer++ % farmers.length];
      const id = `S-PROJECT-${String(projects.length + 1).padStart(3, '0')}`;
      const district = people.find((p) => p[0] === farmerId)![6];
      projects.push({
        id,
        story,
        farmerId,
        produceCode: produce,
        districtCode: district,
      });
      const longTerm = durationType === 'long_term';
      const stage =
        story === 'draft'
          ? 'draft'
          : ['open', 'funded', 'cancelled'].includes(story)
            ? 'open_for_funding'
            : 'active';
      projectRows.push([
        id,
        `${produce.charAt(0)}${produce.slice(1).toLowerCase()} in ${district.charAt(0)}${district.slice(1).toLowerCase()} #${projects.length}`,
        `Sample project (${story})`,
        produce,
        district,
        `Mouza ${projects.length}`,
        farmerId,
        durationType,
        longTerm ? '12' : '5',
        longTerm ? '3' : '0',
        '50000',
        '10000',
        '',
        '',
        '',
        story === 'inputs-and-claim' ? 'true' : 'false',
        '500',
        '1500',
        '',
        stage,
      ]);
      // Funding: 5 slots of Tk 10,000; 'open' gets 2, a draft none.
      const slots = story === 'draft' ? 0 : story === 'open' ? 2 : 5;
      for (let s = 0; s < slots;) {
        const take = Math.min(slots - s, 1 + Math.floor(next() * 3));
        investmentRows.push([
          `S-INV-${String(investmentRows.length + 1).padStart(4, '0')}`,
          id,
          investors[investor++ % investors.length],
          String(take),
          `SEED-PAY-${tag}-${String(investmentRows.length + 1).padStart(4, '0')}`,
        ]);
        s += take;
      }
    }
  }

  // Finished history for the first few farmers.
  const historyRows = farmers.slice(0, 4 * scale).flatMap((f, i) =>
    [2023, 2024].map((year, j) => {
      const income = 60000 + Math.floor(next() * 40000);
      const costs = 15000 + Math.floor(next() * 10000);
      return [
        `S-HIST-${String(i * 2 + j + 1).padStart(3, '0')}`,
        f,
        `${year} season`,
        j === 0 ? 'PADDY' : 'MAIZE',
        people.find((p) => p[0] === f)![6],
        `${year}-01-10`,
        `${year}-06-20`,
        '50000',
        String(income),
        String(costs),
        String(Math.floor((income - costs) * 0.4)),
        String(2000 + Math.floor(next() * 1500)),
        String(1800 + Math.floor(next() * 1000)),
        'Imported sample history',
      ];
    }),
  );

  return {
    files: {
      'people.csv': toCsv(
        [
          'id',
          'role',
          'full_name',
          'phone',
          'nid',
          'date_of_birth',
          'district',
          'address',
          'field_officer_id',
          'acknowledge_flags',
        ],
        people,
      ),
      'projects.csv': toCsv(
        [
          'id',
          'title',
          'description',
          'produce_code',
          'district',
          'location',
          'farmer_id',
          'duration_type',
          'duration_months',
          'payout_interval_months',
          'funding_target',
          'slot_price',
          'farmer_bps',
          'investor_bps',
          'wegro_bps',
          'insured',
          'estimated_return_min_bps',
          'estimated_return_max_bps',
          'planned_start_date',
          'stage',
        ],
        projectRows,
      ),
      'investments.csv': toCsv(
        ['id', 'project_id', 'investor_id', 'slots', 'payment_reference'],
        investmentRows,
      ),
      'history.csv': toCsv(
        [
          'id',
          'farmer_id',
          'title',
          'produce_code',
          'district',
          'started_on',
          'finished_on',
          'funding_raised',
          'income',
          'costs',
          'farmer_received',
          'harvested',
          'sold',
          'notes',
        ],
        historyRows,
      ),
    },
    projects,
    people: byRole,
    officerOf,
  };
}
