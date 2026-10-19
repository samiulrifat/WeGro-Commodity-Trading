import { Injectable, Logger } from '@nestjs/common';

/**
 * Sends email (codes confirming an address). One small interface, so a mail
 * provider can be plugged in with its credentials in .env. Chosen by
 * EMAIL_PROVIDER; production refuses the two below.
 */
export abstract class EmailSender {
  /** `to` is normalised (trimmed, lower case). */
  abstract send(to: string, subject: string, text: string): Promise<void>;
}

/** Local work: writes the email to the log instead of sending it. */
@Injectable()
export class LogEmailSender extends EmailSender {
  private readonly logger = new Logger('Email');

  send(to: string, subject: string, text: string): Promise<void> {
    const [name, domain] = to.split('@');
    this.logger.log(
      `To ${name!.slice(0, 2)}•••@${domain}: ${subject}: ${text}`,
    );
    return Promise.resolve();
  }
}

/** Tests: keeps every email, newest last. */
@Injectable()
export class MemoryEmailSender extends EmailSender {
  readonly outbox: Array<{ to: string; subject: string; text: string }> = [];

  send(to: string, subject: string, text: string): Promise<void> {
    this.outbox.push({ to, subject, text });
    return Promise.resolve();
  }
}
