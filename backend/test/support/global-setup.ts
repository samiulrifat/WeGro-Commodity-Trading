import { watchForOverlap } from './pg-overlap';

export default function globalSetup(): void {
  watchForOverlap();
}
