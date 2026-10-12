import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Starting catalog. Admins and Operations can rename, reorder or deactivate
 * any of it afterwards. Units are chosen so quantities are whole numbers.
 */
const UNITS: [string, string, string, string, string, number][] = [
  ['KG', 'Kilogram', 'কিলোগ্রাম', 'mass', 'kg', 1],
  ['GRAM', 'Gram', 'গ্রাম', 'mass', 'g', 2],
  ['LITRE', 'Litre', 'লিটার', 'volume', 'L', 3],
  ['ML', 'Millilitre', 'মিলিলিটার', 'volume', 'ml', 4],
  ['PIECE', 'Piece', 'পিস', 'count', 'pc', 5],
];

/** code, name, Bengali name, category, typical months */
const PRODUCE: [string, string, string, string, number][] = [
  ['PADDY', 'Paddy', 'ধান', 'storable_crop', 4],
  ['MAIZE', 'Maize', 'ভুট্টা', 'storable_crop', 5],
  ['WHEAT', 'Wheat', 'গম', 'storable_crop', 4],
  ['POTATO', 'Potato', 'আলু', 'storable_crop', 3],
  ['LENTIL', 'Lentil', 'মসুর', 'storable_crop', 4],
  ['MUSTARD', 'Mustard', 'সরিষা', 'storable_crop', 3],
  ['ONION', 'Onion', 'পেঁয়াজ', 'spice', 4],
  ['GARLIC', 'Garlic', 'রসুন', 'spice', 5],
  ['GINGER', 'Ginger', 'আদা', 'spice', 9],
  ['TURMERIC', 'Turmeric', 'হলুদ', 'spice', 9],
  ['CHILLI', 'Chilli', 'মরিচ', 'spice', 5],
  ['TOMATO', 'Tomato', 'টমেটো', 'perishable', 4],
  ['BRINJAL', 'Brinjal', 'বেগুন', 'perishable', 5],
  ['CABBAGE', 'Cabbage', 'বাঁধাকপি', 'perishable', 3],
  ['CAULIFLOWER', 'Cauliflower', 'ফুলকপি', 'perishable', 3],
  ['CUCUMBER', 'Cucumber', 'শসা', 'perishable', 3],
  ['PUMPKIN', 'Pumpkin', 'মিষ্টি কুমড়া', 'perishable', 4],
];

/** code, name, Bengali name, kind, unit, produce */
const INPUTS: [string, string, string, string, string, string | null][] = [
  ['SEED_PADDY', 'Paddy seed', 'ধানের বীজ', 'seed', 'KG', 'PADDY'],
  ['SEED_MAIZE', 'Maize seed', 'ভুট্টার বীজ', 'seed', 'KG', 'MAIZE'],
  ['SEED_WHEAT', 'Wheat seed', 'গমের বীজ', 'seed', 'KG', 'WHEAT'],
  ['SEED_POTATO', 'Seed potato', 'বীজ আলু', 'seed', 'KG', 'POTATO'],
  ['SEED_LENTIL', 'Lentil seed', 'মসুরের বীজ', 'seed', 'KG', 'LENTIL'],
  ['SEED_MUSTARD', 'Mustard seed', 'সরিষার বীজ', 'seed', 'GRAM', 'MUSTARD'],
  ['SEED_ONION', 'Onion seed', 'পেঁয়াজের বীজ', 'seed', 'GRAM', 'ONION'],
  ['SEED_GARLIC', 'Garlic cloves', 'রসুনের কোয়া', 'seed', 'KG', 'GARLIC'],
  ['SEED_GINGER', 'Ginger rhizome', 'আদার বীজ', 'seed', 'KG', 'GINGER'],
  ['SEED_TURMERIC', 'Turmeric rhizome', 'হলুদের বীজ', 'seed', 'KG', 'TURMERIC'],
  ['SEED_CHILLI', 'Chilli seed', 'মরিচের বীজ', 'seed', 'GRAM', 'CHILLI'],
  ['SEED_TOMATO', 'Tomato seed', 'টমেটোর বীজ', 'seed', 'GRAM', 'TOMATO'],
  ['SEED_BRINJAL', 'Brinjal seed', 'বেগুনের বীজ', 'seed', 'GRAM', 'BRINJAL'],
  ['SEED_CABBAGE', 'Cabbage seed', 'বাঁধাকপির বীজ', 'seed', 'GRAM', 'CABBAGE'],
  [
    'SEED_CAULIFLOWER',
    'Cauliflower seed',
    'ফুলকপির বীজ',
    'seed',
    'GRAM',
    'CAULIFLOWER',
  ],
  ['SEED_CUCUMBER', 'Cucumber seed', 'শসার বীজ', 'seed', 'GRAM', 'CUCUMBER'],
  [
    'SEED_PUMPKIN',
    'Pumpkin seed',
    'মিষ্টি কুমড়ার বীজ',
    'seed',
    'GRAM',
    'PUMPKIN',
  ],
  ['UREA', 'Urea', 'ইউরিয়া', 'fertilizer', 'KG', null],
  ['TSP', 'TSP', 'টিএসপি', 'fertilizer', 'KG', null],
  ['MOP', 'MOP', 'এমওপি', 'fertilizer', 'KG', null],
  ['DAP', 'DAP', 'ডিএপি', 'fertilizer', 'KG', null],
  ['GYPSUM', 'Gypsum', 'জিপসাম', 'fertilizer', 'KG', null],
  ['ZINC_SULPHATE', 'Zinc sulphate', 'জিংক সালফেট', 'fertilizer', 'KG', null],
  ['BORON', 'Boron', 'বোরন', 'fertilizer', 'KG', null],
  ['COMPOST', 'Organic compost', 'জৈব সার', 'fertilizer', 'KG', null],
  ['INSECTICIDE', 'Insecticide', 'কীটনাশক', 'pesticide', 'ML', null],
  ['FUNGICIDE', 'Fungicide', 'ছত্রাকনাশক', 'pesticide', 'ML', null],
  ['HERBICIDE', 'Herbicide', 'আগাছানাশক', 'pesticide', 'ML', null],
];

const m = (
  key: string,
  label: string,
  labelBn: string,
  unit: string | null,
  min: number,
  max: number | null,
  decimals: number,
  required: boolean,
) => ({ key, label, labelBn, unit, min, max, decimals, required });

/** code, name, Bengali name, photo, location, measurements */
const RECORD_TYPES: [string, string, string, boolean, boolean, object[]][] = [
  ['LAND_PREPARATION', 'Land preparation', 'জমি প্রস্তুতি', false, true, []],
  [
    'SOWING',
    'Sowing or planting',
    'বপন ও রোপণ',
    true,
    true,
    [m('area', 'Area planted', 'রোপণের জমি', 'decimal', 0, 100000, 1, true)],
  ],
  [
    'INPUT_APPLICATION',
    'Fertilizer or pesticide applied',
    'সার ও কীটনাশক প্রয়োগ',
    false,
    true,
    [],
  ],
  [
    'IRRIGATION',
    'Irrigation',
    'সেচ',
    false,
    true,
    [m('duration', 'Duration', 'সময়কাল', 'hours', 0, 48, 1, true)],
  ],
  [
    'GROWTH_CHECK',
    'Growth check',
    'বৃদ্ধি পর্যবেক্ষণ',
    true,
    true,
    [
      m(
        'plant_height',
        'Plant height',
        'গাছের উচ্চতা',
        'cm',
        0,
        1000,
        0,
        false,
      ),
      m('crop_cover', 'Crop cover', 'ফসলের আচ্ছাদন', '%', 0, 100, 0, false),
    ],
  ],
  [
    'PEST_DISEASE',
    'Pest or disease',
    'রোগ ও পোকামাকড়',
    true,
    true,
    [m('affected_area', 'Area affected', 'আক্রান্ত জমি', '%', 0, 100, 0, true)],
  ],
  [
    'WEATHER_DAMAGE',
    'Weather damage',
    'আবহাওয়াজনিত ক্ষতি',
    true,
    true,
    [
      m(
        'damaged_area',
        'Area damaged',
        'ক্ষতিগ্রস্ত জমি',
        '%',
        0,
        100,
        0,
        true,
      ),
    ],
  ],
  [
    'HARVEST',
    'Harvest',
    'ফসল সংগ্রহ',
    true,
    true,
    [
      m(
        'quantity',
        'Quantity harvested, in the produce unit',
        'সংগৃহীত পরিমাণ',
        null,
        0,
        null,
        0,
        true,
      ),
    ],
  ],
];

const WEATHER: [string, string, string][] = [
  ['FLOOD', 'Flood', 'বন্যা'],
  ['FLASH_FLOOD', 'Flash flood', 'আকস্মিক বন্যা'],
  ['DROUGHT', 'Drought', 'খরা'],
  ['CYCLONE', 'Cyclone', 'ঘূর্ণিঝড়'],
  ['HAILSTORM', 'Hailstorm', 'শিলাবৃষ্টি'],
  ['HEAVY_RAIN', 'Heavy rain', 'অতিবৃষ্টি'],
  ['COLD_WAVE', 'Cold wave', 'শৈত্যপ্রবাহ'],
];

export class CatalogDefaults1791781400000 implements MigrationInterface {
  name = 'CatalogDefaults1791781400000';

  public async up(q: QueryRunner): Promise<void> {
    for (const [code, name, nameBn, kind, symbol, sort] of UNITS) {
      await q.query(
        `INSERT INTO "units" ("code", "name", "name_bn", "kind", "symbol", "sort_order") VALUES ($1, $2, $3, $4, $5, $6)`,
        [code, name, nameBn, kind, symbol, sort],
      );
    }
    for (const [
      i,
      [code, name, nameBn, category, months],
    ] of PRODUCE.entries()) {
      await q.query(
        `INSERT INTO "produce_types" ("code", "name", "name_bn", "category", "unit_code", "typical_duration_months", "sort_order") VALUES ($1, $2, $3, $4, 'KG', $5, $6)`,
        [code, name, nameBn, category, months, i + 1],
      );
    }
    for (const [
      i,
      [code, name, nameBn, kind, unit, produce],
    ] of INPUTS.entries()) {
      await q.query(
        `INSERT INTO "input_types" ("code", "name", "name_bn", "kind", "unit_code", "produce_code", "sort_order") VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [code, name, nameBn, kind, unit, produce, i + 1],
      );
    }
    for (const [
      i,
      [code, name, nameBn, photo, location, measurements],
    ] of RECORD_TYPES.entries()) {
      await q.query(
        `INSERT INTO "field_record_types" ("code", "name", "name_bn", "requires_photo", "requires_location", "measurements", "sort_order") VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          code,
          name,
          nameBn,
          photo,
          location,
          JSON.stringify(measurements),
          i + 1,
        ],
      );
    }
    for (const [i, [code, name, nameBn]] of WEATHER.entries()) {
      await q.query(
        `INSERT INTO "weather_event_types" ("code", "name", "name_bn", "sort_order") VALUES ($1, $2, $3, $4)`,
        [code, name, nameBn, i + 1],
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    const codes = (rows: { 0: string }[]) => rows.map((r) => r[0]);
    await q.query(`DELETE FROM "weather_event_types" WHERE "code" = ANY($1)`, [
      codes(WEATHER),
    ]);
    await q.query(`DELETE FROM "field_record_types" WHERE "code" = ANY($1)`, [
      codes(RECORD_TYPES),
    ]);
    await q.query(`DELETE FROM "input_types" WHERE "code" = ANY($1)`, [
      codes(INPUTS),
    ]);
    await q.query(`DELETE FROM "produce_types" WHERE "code" = ANY($1)`, [
      codes(PRODUCE),
    ]);
    await q.query(`DELETE FROM "units" WHERE "code" = ANY($1)`, [codes(UNITS)]);
  }
}
