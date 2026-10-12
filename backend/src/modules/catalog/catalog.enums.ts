/** Decides a project's path after harvest; mirrors ProjectLedger.ProduceCategory. */
export enum ProduceCategory {
  StorableCrop = 'storable_crop',
  Spice = 'spice',
  Perishable = 'perishable',
}

/** ProjectLedger.ProduceCategory enum index for each category. */
export const CHAIN_PRODUCE_CATEGORY: Readonly<Record<ProduceCategory, number>> =
  {
    [ProduceCategory.StorableCrop]: 0,
    [ProduceCategory.Spice]: 1,
    [ProduceCategory.Perishable]: 2,
  };

export enum UnitKind {
  Mass = 'mass',
  Volume = 'volume',
  Count = 'count',
}

export enum InputKind {
  Seed = 'seed',
  Fertilizer = 'fertilizer',
  Pesticide = 'pesticide',
  Other = 'other',
}

/** Catalog codes are stored on-chain as bytes32 strings: same rule as codeToBytes32. */
export const CODE_PATTERN = /^[A-Z0-9_-]{1,31}$/;
