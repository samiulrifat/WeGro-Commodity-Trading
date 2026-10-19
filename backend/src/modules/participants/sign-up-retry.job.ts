import { Injectable } from '@nestjs/common';
import {
  ScheduledJob,
  type ScheduledJobRunner,
} from '../../common/jobs/scheduled-job';
import { ParticipantsService } from './participants.service';

/** Sign-ups settled per run. */
const BATCH = 20;

/**
 * Someone who signed up waits on the ledger only: if their registration was
 * lost on the way, it is sent again by the platform's key, so they can sign
 * in without anyone having to notice.
 */
@Injectable()
@ScheduledJob({
  name: 'sign-up-retry',
  description:
    'Sends again the sign-ups the ledger has not confirmed, so they can sign in',
  every: 'SIGN_UP_RETRY_MS',
})
export class SignUpRetryJob implements ScheduledJobRunner {
  constructor(private readonly participants: ParticipantsService) {}

  run(): Promise<number> {
    return this.participants.retrySignUps(BATCH);
  }
}
