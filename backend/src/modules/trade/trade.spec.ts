import { DeliverySide } from './trade.enums';
import { deliveryFingerprint } from './trade.service';

describe('deliveryFingerprint', () => {
  const d = {
    offerId: 7,
    side: DeliverySide.BUYER,
    quantity: 2000,
    notes: 'Dry, no damage',
    photoHash: `0x${'ab'.repeat(32)}`,
  };

  it('is stable and binds the deal, the side and every detail', () => {
    const h = deliveryFingerprint(d);
    expect(deliveryFingerprint({ ...d })).toBe(h);
    for (const change of [
      { offerId: 8 },
      { side: DeliverySide.HANDLER },
      { quantity: 1999 },
      { notes: null },
      { photoHash: null },
    ]) {
      expect(deliveryFingerprint({ ...d, ...change })).not.toBe(h);
    }
  });
});
