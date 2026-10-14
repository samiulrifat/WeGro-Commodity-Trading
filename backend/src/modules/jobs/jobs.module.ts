import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectsModule } from '../projects/projects.module';
import { JobRun } from './entities/job-run.entity';
import { IndexerWatchdogJob } from './indexer-watchdog.job';
import { JobScheduler } from './job-scheduler';
import { JobsController } from './jobs.controller';

/**
 * Runs every @ScheduledJob in the app (found at startup) and shows their
 * status. Also home to the indexer watchdog.
 */
@Module({
  imports: [
    DiscoveryModule,
    TypeOrmModule.forFeature([JobRun]),
    ProjectsModule,
    NotificationsModule,
  ],
  controllers: [JobsController],
  providers: [JobScheduler, IndexerWatchdogJob],
})
export class JobsModule {}
