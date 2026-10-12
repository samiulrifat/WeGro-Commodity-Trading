import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

export interface ListEntry {
  code: string;
  name: string;
  active: boolean;
  sortOrder: number;
}

/**
 * One catalog list held in memory. Lookups by code are a map access; the
 * sorted lists for dropdowns are built once and reused until the next write.
 * Entries are frozen: callers share them and cannot change the cache.
 */
export class CodeList<T extends ListEntry> {
  private readonly byCode = new Map<string, Readonly<T>>();
  private sortedAll: readonly Readonly<T>[] | null = null;
  private sortedActive: readonly Readonly<T>[] | null = null;

  constructor(readonly label: string) {}

  load(entries: T[]): void {
    this.byCode.clear();
    for (const e of entries) this.byCode.set(e.code, Object.freeze(e));
    this.invalidate();
  }

  put(entry: T): void {
    this.byCode.set(entry.code, Object.freeze(entry));
    this.invalidate();
  }

  get(code: string): Readonly<T> | undefined {
    return this.byCode.get(code);
  }

  has(code: string): boolean {
    return this.byCode.has(code);
  }

  /** 404: for routes addressing the entry itself. */
  find(code: string): Readonly<T> {
    const entry = this.byCode.get(code);
    if (!entry) throw new NotFoundException(`No ${this.label} ${code}`);
    return entry;
  }

  /** 422: for a code given as part of another record, which must exist and be active. */
  requireActive(code: string): Readonly<T> {
    const entry = this.byCode.get(code);
    if (!entry)
      throw new UnprocessableEntityException(`Unknown ${this.label} ${code}`);
    if (!entry.active) {
      throw new UnprocessableEntityException(
        `The ${this.label} ${code} is no longer in use`,
      );
    }
    return entry;
  }

  list(includeInactive = false): readonly Readonly<T>[] {
    if (!this.sortedAll) {
      this.sortedAll = [...this.byCode.values()].sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'en'),
      );
      this.sortedActive = this.sortedAll.filter((e) => e.active);
    }
    return includeInactive ? this.sortedAll : this.sortedActive!;
  }

  private invalidate(): void {
    this.sortedAll = null;
    this.sortedActive = null;
  }
}
