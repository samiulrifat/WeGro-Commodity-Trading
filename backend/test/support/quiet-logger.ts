import { Logger } from '@nestjs/common';

// Unit tests provoke failures on purpose; their log lines are noise. Tests
// that check a message spy on the logger instead.
Logger.overrideLogger(false);
