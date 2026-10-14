import { SetMetadata } from '@nestjs/common';
import type { EnvironmentVariables } from '../../config/env.validation';

export const SCHEDULED_JOB = 'jobs:scheduled';

export interface ScheduledJobMeta {
  /** Stable name, used in URLs and history: e.g. reservation-expiry. */
  name: string;
  description: string;
  /** The setting that holds the interval in milliseconds. */
  every: keyof EnvironmentVariables & `${string}_MS`;
}

/** Work the scheduler runs on a timer. Returns how many items it handled. */
export interface ScheduledJobRunner {
  run(): Promise<number>;
}

/**
 * Marks a provider as a scheduled job. The scheduler finds it at startup, so
 * jobs depend on nothing but their own work.
 */
export const ScheduledJob = (meta: ScheduledJobMeta) =>
  SetMetadata(SCHEDULED_JOB, meta);

/** Some items failed while others were handled: the run counts as failed. */
export class PartialJobFailure extends Error {
  constructor(
    readonly handled: number,
    readonly failed: number,
    firstError: string,
  ) {
    super(`${failed} item(s) failed; first: ${firstError}`);
  }
}
