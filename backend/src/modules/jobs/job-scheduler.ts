import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Paginated } from '../../common/dto/pagination.dto';
import type { EnvironmentVariables } from '../../config/env.validation';
import type { AuthUser } from '../auth/auth-user';
import { ProjectViews } from '../projects/project-views';
import type {
  JobHistoryQueryDto,
  JobRunDto,
  JobStatusDto,
} from './dto/job.dto';
import { JobRun } from './entities/job-run.entity';
import {
  PartialJobFailure,
  SCHEDULED_JOB,
  type ScheduledJobMeta,
  type ScheduledJobRunner,
} from '../../common/jobs/scheduled-job';

/** Gap between first runs at startup, so jobs do not all start at once. */
const STAGGER_MS = 5_000;

interface Entry {
  meta: ScheduledJobMeta;
  job: ScheduledJobRunner;
  everyMs: number;
  timer?: NodeJS.Timeout;
  running?: Promise<Omit<JobRunDto, 'triggeredBy'>>;
  lastRun: Omit<JobRunDto, 'triggeredBy'> | null;
  lastRunBy: string | null;
  nextRunAt: Date | null;
}

/**
 * Runs every @ScheduledJob on its own timer. Each run is scheduled when the
 * previous one ends (setTimeout, not setInterval), so a job never overlaps
 * itself however long a run takes; a manual run while one is going is
 * refused. Runs that did something, failed, or were started by hand are
 * recorded; quiet runs only update the in-memory status.
 */
@Injectable()
export class JobScheduler
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(JobScheduler.name);
  private readonly jobs = new Map<string, Entry>();
  private readonly enabled: boolean;
  private stopping = false;

  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
    private readonly discovery: DiscoveryService,
    private readonly reflector: Reflector,
    @InjectRepository(JobRun) private readonly runs: Repository<JobRun>,
    private readonly views: ProjectViews,
  ) {
    this.enabled = config.get('JOBS_ENABLED', { infer: true });
  }

  onApplicationBootstrap(): void {
    for (const wrapper of this.discovery.getProviders()) {
      const instance = wrapper.instance as ScheduledJobRunner | undefined;
      if (!instance || !wrapper.metatype) continue;
      const meta = this.reflector.get<ScheduledJobMeta | undefined>(
        SCHEDULED_JOB,
        wrapper.metatype,
      );
      if (!meta) continue;
      this.jobs.set(meta.name, {
        meta,
        job: instance,
        everyMs: Number(this.config.get(meta.every, { infer: true })),
        lastRun: null,
        lastRunBy: null,
        nextRunAt: null,
      });
    }
    if (!this.enabled) return;
    [...this.jobs.values()].forEach((e, i) =>
      this.schedule(e, Math.min(e.everyMs, STAGGER_MS * (i + 1))),
    );
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    for (const e of this.jobs.values()) clearTimeout(e.timer);
    await Promise.allSettled(
      [...this.jobs.values()].map((e) => e.running ?? Promise.resolve()),
    );
  }

  async status(): Promise<JobStatusDto[]> {
    const entries = [...this.jobs.values()].sort((a, b) =>
      a.meta.name.localeCompare(b.meta.name),
    );
    const names = await this.views.names(
      entries.flatMap((e) => (e.lastRunBy ? [e.lastRunBy] : [])),
    );
    return entries.map((e) => ({
      name: e.meta.name,
      description: e.meta.description,
      everyMs: e.everyMs,
      enabled: this.enabled,
      running: !!e.running,
      lastRun: e.lastRun
        ? {
            ...e.lastRun,
            triggeredBy: e.lastRunBy
              ? { id: e.lastRunBy, name: names.get(e.lastRunBy) ?? '' }
              : null,
          }
        : null,
      nextRunAt: e.nextRunAt,
    }));
  }

  /** Runs a job now and waits for it; refused while it is already running. */
  async runNow(name: string, actor: AuthUser): Promise<JobRunDto> {
    const e = this.entry(name);
    if (e.running) {
      throw new ConflictException({
        message: `${name} is running; try again when it finishes`,
        code: 'JOB_RUNNING',
      });
    }
    const run = await this.execute(e, 'manual', actor.id);
    const names = await this.views.names([actor.id]);
    return {
      ...run,
      triggeredBy: { id: actor.id, name: names.get(actor.id) ?? '' },
    };
  }

  async history(
    name: string,
    q: JobHistoryQueryDto,
  ): Promise<Paginated<JobRunDto>> {
    this.entry(name);
    const [rows, total] = await this.runs.findAndCount({
      where: { job: name },
      order: { id: 'DESC' },
      skip: q.skip,
      take: q.limit,
    });
    const names = await this.views.names(
      rows.flatMap((r) => (r.triggeredById ? [r.triggeredById] : [])),
    );
    return new Paginated(
      rows.map((r) => ({
        trigger: r.trigger,
        triggeredBy: r.triggeredById
          ? { id: r.triggeredById, name: names.get(r.triggeredById) ?? '' }
          : null,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        outcome: r.outcome,
        items: r.items,
        error: r.error,
      })),
      total,
      q,
    );
  }

  private entry(name: string): Entry {
    const e = this.jobs.get(name);
    if (!e) throw new NotFoundException(`No job named ${name}`);
    return e;
  }

  private schedule(e: Entry, delayMs: number): void {
    if (this.stopping) return;
    e.nextRunAt = new Date(Date.now() + delayMs);
    e.timer = setTimeout(() => {
      e.nextRunAt = null;
      // A manual run in progress: this tick is skipped, not stacked.
      const done = e.running
        ? e.running.catch(() => undefined)
        : this.execute(e, 'schedule', null);
      void done.finally(() => this.schedule(e, e.everyMs));
    }, delayMs);
    e.timer.unref();
  }

  private execute(
    e: Entry,
    trigger: 'schedule' | 'manual',
    triggeredById: string | null,
  ): Promise<Omit<JobRunDto, 'triggeredBy'>> {
    const run = (async () => {
      const startedAt = new Date();
      let items = 0;
      let error: string | null = null;
      try {
        items = await e.job.run();
      } catch (err) {
        if (err instanceof PartialJobFailure) items = err.handled;
        error = (err instanceof Error ? err.message : String(err)).slice(
          0,
          500,
        );
        this.logger.error(`${e.meta.name} failed: ${error}`);
      }
      const result = {
        trigger,
        startedAt,
        finishedAt: new Date(),
        outcome: error ? ('failed' as const) : ('ok' as const),
        items,
        error,
      };
      e.lastRun = result;
      e.lastRunBy = triggeredById;
      if (items > 0 || error || trigger === 'manual') {
        await this.runs
          .insert({ job: e.meta.name, triggeredById, ...result })
          .catch((err: unknown) =>
            this.logger.error(
              `Could not record a ${e.meta.name} run: ${String(err)}`,
            ),
          );
      }
      return result;
    })();
    e.running = run.finally(() => {
      e.running = undefined;
    });
    return e.running;
  }
}
