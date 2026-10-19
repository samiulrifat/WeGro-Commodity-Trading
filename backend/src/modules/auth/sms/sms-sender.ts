import { Injectable, Logger } from '@nestjs/common';

/**
 * Sends text messages (codes for a password reset or a new number). One
 * small interface, so a Bangladeshi SMS provider can be plugged in with its
 * credentials in .env.
 * Chosen by SMS_PROVIDER; production refuses the two below.
 */
export abstract class SmsSender {
  /** `phone` is normalised (+8801XXXXXXXXX). */
  abstract send(phone: string, text: string): Promise<void>;
}

/** Local work: writes the message to the log instead of sending it. */
@Injectable()
export class LogSmsSender extends SmsSender {
  private readonly logger = new Logger('SMS');

  send(phone: string, text: string): Promise<void> {
    this.logger.log(`To ${phone.slice(0, 6)}•••••${phone.slice(-3)}: ${text}`);
    return Promise.resolve();
  }
}

/** Tests: keeps every message, newest last. */
@Injectable()
export class MemorySmsSender extends SmsSender {
  readonly outbox: Array<{ phone: string; text: string }> = [];

  send(phone: string, text: string): Promise<void> {
    this.outbox.push({ phone, text });
    return Promise.resolve();
  }
}
