import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The starting catalog's English names and measurement labels in Title
 * Case, as every label in the app is. Only names still as they were loaded
 * change: one an editor has since renamed is left alone. Bengali names are
 * unchanged.
 */
const NAMES: Record<string, [string, string, string][]> = {
  input_types: [
    ['SEED_PADDY', 'Paddy seed', 'Paddy Seed'],
    ['SEED_MAIZE', 'Maize seed', 'Maize Seed'],
    ['SEED_WHEAT', 'Wheat seed', 'Wheat Seed'],
    ['SEED_POTATO', 'Seed potato', 'Seed Potato'],
    ['SEED_LENTIL', 'Lentil seed', 'Lentil Seed'],
    ['SEED_MUSTARD', 'Mustard seed', 'Mustard Seed'],
    ['SEED_ONION', 'Onion seed', 'Onion Seed'],
    ['SEED_GARLIC', 'Garlic cloves', 'Garlic Cloves'],
    ['SEED_GINGER', 'Ginger rhizome', 'Ginger Rhizome'],
    ['SEED_TURMERIC', 'Turmeric rhizome', 'Turmeric Rhizome'],
    ['SEED_CHILLI', 'Chilli seed', 'Chilli Seed'],
    ['SEED_TOMATO', 'Tomato seed', 'Tomato Seed'],
    ['SEED_BRINJAL', 'Brinjal seed', 'Brinjal Seed'],
    ['SEED_CABBAGE', 'Cabbage seed', 'Cabbage Seed'],
    ['SEED_CAULIFLOWER', 'Cauliflower seed', 'Cauliflower Seed'],
    ['SEED_CUCUMBER', 'Cucumber seed', 'Cucumber Seed'],
    ['SEED_PUMPKIN', 'Pumpkin seed', 'Pumpkin Seed'],
    ['ZINC_SULPHATE', 'Zinc sulphate', 'Zinc Sulphate'],
    ['COMPOST', 'Organic compost', 'Organic Compost'],
  ],
  field_record_types: [
    ['LAND_PREPARATION', 'Land preparation', 'Land Preparation'],
    ['SOWING', 'Sowing or planting', 'Sowing or Planting'],
    [
      'INPUT_APPLICATION',
      'Fertilizer or pesticide applied',
      'Fertilizer or Pesticide Applied',
    ],
    ['GROWTH_CHECK', 'Growth check', 'Growth Check'],
    ['PEST_DISEASE', 'Pest or disease', 'Pest or Disease'],
    ['WEATHER_DAMAGE', 'Weather damage', 'Weather Damage'],
  ],
  weather_event_types: [
    ['FLASH_FLOOD', 'Flash flood', 'Flash Flood'],
    ['HEAVY_RAIN', 'Heavy rain', 'Heavy Rain'],
    ['COLD_WAVE', 'Cold wave', 'Cold Wave'],
  ],
};

/** Measurement labels, by key, wherever they still read as loaded. */
const LABELS: [string, string, string][] = [
  ['area', 'Area planted', 'Area Planted'],
  ['plant_height', 'Plant height', 'Plant Height'],
  ['crop_cover', 'Crop cover', 'Crop Cover'],
  ['affected_area', 'Area affected', 'Area Affected'],
  ['damaged_area', 'Area damaged', 'Area Damaged'],
  [
    'quantity',
    'Quantity harvested, in the produce unit',
    'Quantity Harvested (Produce Unit)',
  ],
];

interface Measurement {
  key: string;
  label: string;
}

export class CatalogTitleCase1792480000000 implements MigrationInterface {
  name = 'CatalogTitleCase1792480000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.rename(queryRunner, 1, 2);
    await this.relabel(queryRunner, 1, 2);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.rename(queryRunner, 2, 1);
    await this.relabel(queryRunner, 2, 1);
  }

  private async rename(q: QueryRunner, from: 1 | 2, to: 1 | 2) {
    for (const [table, rows] of Object.entries(NAMES)) {
      for (const row of rows) {
        await q.query(
          `UPDATE "${table}" SET "name" = $1 WHERE "code" = $2 AND "name" = $3`,
          [row[to], row[0], row[from]],
        );
      }
    }
  }

  private async relabel(q: QueryRunner, from: 1 | 2, to: 1 | 2) {
    const types: { code: string; measurements: Measurement[] }[] =
      await q.query(`SELECT "code", "measurements" FROM "field_record_types"`);
    const byKey = new Map(LABELS.map((l) => [l[0], l]));
    for (const type of types) {
      let changed = false;
      const next = type.measurements.map((m) => {
        const l = byKey.get(m.key);
        if (!l || m.label !== l[from]) return m;
        changed = true;
        return { ...m, label: l[to] };
      });
      if (changed) {
        await q.query(
          `UPDATE "field_record_types" SET "measurements" = $1 WHERE "code" = $2`,
          [JSON.stringify(next), type.code],
        );
      }
    }
  }
}
