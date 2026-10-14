import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationRules } from './notification-rules';
import { NotificationWriter } from './notification-writer';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { ReminderJob } from './reminder.job';

/** In-app notifications: event rules, time-based reminders and the inbox. */
@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationWriter,
    NotificationRules,
    ReminderJob,
  ],
  exports: [NotificationWriter],
})
export class NotificationsModule {}
