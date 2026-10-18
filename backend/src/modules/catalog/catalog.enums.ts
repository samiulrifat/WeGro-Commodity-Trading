/** Decides a project's path after harvest; mirrors ProjectLedger.ProduceCategory. */
export enum ProduceCategory {
  STORABLE_CROP = 'storable_crop',
  SPICE = 'spice',
  PERISHABLE = 'perishable',
}

/** ProjectLedger.ProduceCategory enum index for each category. */
export const CHAIN_PRODUCE_CATEGORY: Readonly<Record<ProduceCategory, number>> =
  {
    [ProduceCategory.STORABLE_CROP]: 0,
    [ProduceCategory.SPICE]: 1,
    [ProduceCategory.PERISHABLE]: 2,
  };

export enum UnitKind {
  MASS = 'mass',
  VOLUME = 'volume',
  COUNT = 'count',
}

export enum InputKind {
  SEED = 'seed',
  FERTILIZER = 'fertilizer',
  PESTICIDE = 'pesticide',
  OTHER = 'other',
}

/** Catalog codes are stored on-chain as bytes32 strings: same rule as codeToBytes32. */
export const CODE_PATTERN = /^[A-Z0-9_-]{1,31}$/;
