import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { hashPaymentRef } from '../../blockchain/utils/payment-ref';
import { uuidToBytes32 } from '../../blockchain/utils/ids';
import {
  actor,
  config,
  fakeCatalog,
  fakeClock,
  fakeCrypto,
  fakeQueryBuilder,
  fakeRepo,
  fakeTx,
  matchesWhere,
  revert,
  Role,
} from '../../../test/support/unit';
import { photoHash } from '../field-records/photos.service';
import type { Project } from '../projects/entities/project.entity';
import { ProjectStage } from '../projects/project.enums';
import { ReceiptStatus } from '../warehouse/warehouse.enums';
import type { Delivery } from './entities/delivery.entity';
import type { Listing } from './entities/listing.entity';
import type { Offer } from './entities/offer.entity';
import { deliveryFingerprint, TradeService } from './trade.service';
import { DeliverySide, ListingStatus, OfferStatus } from './trade.enums';

const SECRET = 'payment-secret-for-tests-only-32b';
const NOW = new Date('2026-10-14T06:00:00Z');
const PROJECT = randomUUID();
const FARMER = randomUUID();
const RECEIPT = '0x' + 'ab'.repeat(32);

describe('TradeService', () => {
  const admin = actor(Role.Admin);
  const officer = actor(Role.FieldOfficer);
  const buyer = actor(Role.Buyer);
  const operator = actor(Role.Warehouse);
  const accounts = actor(Role.Accounts);

  const build = (
    opts: {
      project?: Partial<Project>;
      receipt?: Record<string, unknown> | null;
      listing?: Partial<Listing>;
      offer?: Partial<Offer>;
      officerOf?: boolean;
      operatorSite?: string | null;
      saveAffected?: number;
    } = {},
  ) => {
    const project = {
      id: PROJECT,
      farmerId: FARMER,
      stage: ProjectStage.Active,
      category: 'perishable',
      title: 'Tomato',
      districtCode: 'BOGURA',
      ...opts.project,
    } as Project;
    const receipt =
      opts.receipt === null
        ? null
        : {
            id: RECEIPT,
            projectId: PROJECT,
            ownerIsWegro: false,
            ownerId: FARMER,
            status: ReceiptStatus.Issued,
            expiresOn: '2026-12-31',
            siteId: 'site-1',
            ...opts.receipt,
          };
    const listing = {
      id: 3,
      projectId: PROJECT,
      farmerId: FARMER,
      receiptId: null,
      produceCode: 'POTATO',
      sellerIsWegro: false,
      sellerId: FARMER,
      quantity: 1000,
      available: 600,
      askingUnitPrice: 2500n,
      unpaidDeals: 0,
      status: ListingStatus.Open,
      ...opts.listing,
    } as Listing;
    const offer = {
      id: 9,
      listingId: 3,
      buyerId: buyer.id,
      quantity: 200,
      unitPrice: 2400n,
      status: OfferStatus.Pending,
      paymentDueAt: null,
      paymentRefEnc: null,
      ...opts.offer,
    } as Offer;
    const deliveries: Delivery[] = [];
    const update = fakeQueryBuilder({
      execute: { affected: opts.saveAffected ?? 1 },
    });
    const offers = fakeRepo({
      findOneBy: jest.fn(() => Promise.resolve(offer)),
      // No alias: the update that saves a payment reference; 'o': a scoped read.
      createQueryBuilder: jest.fn((alias?: string) =>
        alias ? fakeQueryBuilder({ getOne: offer }).qb : update.qb,
      ),
    });
    const deliveriesRepo = fakeRepo({
      create: jest.fn((d: Delivery) => ({ ...d })),
      insert: jest.fn(
        (d: Delivery) => (deliveries.push(d), Promise.resolve({})),
      ),
      delete: jest.fn((where: Record<string, unknown>) => {
        for (let i = deliveries.length - 1; i >= 0; i--) {
          if (matchesWhere(deliveries[i] as never, where))
            deliveries.splice(i, 1);
        }
        return Promise.resolve({ affected: 1 });
      }),
      exists: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          deliveries.some((d) => matchesWhere(d as never, where)),
        ),
      ),
      findBy: jest.fn(() => Promise.resolve(deliveries)),
    });
    const chain = fakeTx((call) =>
      call.method === 'listReceipt' || call.method === 'listProduce'
        ? [
            {
              contract: 'TradeLedger',
              name: 'ListingCreated',
              args: { listingId: 3n },
              logIndex: 0,
            },
          ]
        : call.method === 'makeOffer'
          ? [
              {
                contract: 'TradeLedger',
                name: 'OfferMade',
                args: { offerId: 9n },
                logIndex: 0,
              },
            ]
          : [],
    );
    const photos = {
      find: jest.fn((id: string) =>
        Promise.resolve({
          id,
          sha256: 'cd'.repeat(32),
          uploadedById: id === 'buyer-photo' ? buyer.id : 'x',
        }),
      ),
    };
    const crypto = fakeCrypto();
    const service = new TradeService(
      config({ PAYMENT_REF_SECRET: SECRET }),
      fakeRepo({
        findOneBy: jest.fn(() => Promise.resolve(listing)),
        findOneByOrFail: jest.fn(() => Promise.resolve(listing)),
        find: jest.fn(() => Promise.resolve([listing])),
      }) as never,
      offers as never,
      deliveriesRepo as never,
      fakeRepo({
        findOneBy: jest.fn(() => Promise.resolve(project)),
        find: jest.fn(() => Promise.resolve([project])),
      }) as never,
      fakeRepo({
        exists: jest.fn(() => Promise.resolve(opts.officerOf ?? false)),
      }) as never,
      fakeRepo({
        findOneBy: jest.fn(() => Promise.resolve(receipt)),
        findOne: jest.fn(() => Promise.resolve(receipt)),
      }) as never,
      fakeRepo({
        findOne: jest.fn(() =>
          Promise.resolve(
            opts.operatorSite === null
              ? null
              : { siteId: opts.operatorSite ?? 'site-1' },
          ),
        ),
      }) as never,
      fakeCatalog() as never,
      { names: () => Promise.resolve(new Map()) } as never,
      photos as never,
      crypto as never,
      chain.tx as never,
      { apply: jest.fn(() => Promise.resolve()) } as never,
      fakeClock(NOW) as never,
    );
    return {
      service,
      chain,
      update,
      offer,
      listing,
      deliveries,
      deliveriesRepo,
    };
  };

  describe('listing', () => {
    it('lets the farmer’s officer list the farmer’s receipt, and an admin WeGro’s', async () => {
      const farmerReceipt = build({ officerOf: true });
      // Receipt ids are matched in lower case, however they were typed.
      await farmerReceipt.service.listReceipt(officer, {
        receiptId: `0x${RECEIPT.slice(2).toUpperCase()}`,
        askingUnitPrice: '25',
      } as never);
      expect(farmerReceipt.chain.sent[0]).toMatchObject({
        method: 'listReceipt',
        args: [RECEIPT, 2500n],
      });
      await expect(
        build({ officerOf: true }).service.listReceipt(admin, {
          receiptId: RECEIPT,
          askingUnitPrice: '25',
        } as never),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        build({
          receipt: { ownerIsWegro: true, ownerId: null },
        }).service.listReceipt(admin, {
          receiptId: RECEIPT,
          askingUnitPrice: '25',
        } as never),
      ).resolves.toBeDefined();
    });

    it('refuses a receipt that is not issued, has expired, or whose project is not active', async () => {
      const list = (opts: Parameters<typeof build>[0]) =>
        build({ officerOf: true, ...opts }).service.listReceipt(officer, {
          receiptId: RECEIPT,
          askingUnitPrice: '25',
        } as never);
      await expect(
        list({ receipt: { status: ReceiptStatus.Listed } }),
      ).rejects.toThrow(
        'Only an issued receipt can be listed; this one is listed',
      );
      await expect(
        list({ receipt: { expiresOn: '2026-10-13' } }),
      ).rejects.toThrow('This receipt has expired');
      await expect(
        list({ project: { stage: ProjectStage.ReadyForSale } }),
      ).rejects.toThrow('Produce is sold only while the project is active');
      await expect(
        list({ receipt: { status: ReceiptStatus.Submitted } }),
      ).rejects.toThrow(NotFoundException);
    });

    it('sells only perishable produce fresh, by an admin or the farmer’s officer', async () => {
      const err = await build({ project: { category: 'grain' } })
        .service.listProduce(admin, {
          projectId: PROJECT,
          quantity: 10,
          askingUnitPrice: '1',
        } as never)
        .catch((e: UnprocessableEntityException) => e.getResponse());
      expect(err).toMatchObject({ code: 'NOT_PERISHABLE' });
      await expect(
        build().service.listProduce(officer, {
          projectId: PROJECT,
          quantity: 10,
          askingUnitPrice: '1',
        } as never),
      ).rejects.toThrow(ForbiddenException);
      const { service, chain } = build({ officerOf: true });
      await service.listProduce(officer, {
        projectId: PROJECT,
        quantity: 10,
        askingUnitPrice: '12.5',
      } as never);
      expect(chain.sent[0].args).toEqual([uuidToBytes32(PROJECT), 10, 1250n]);
    });

    it('will not cancel a listing with deals waiting for payment', async () => {
      const err = await build({ listing: { unpaidDeals: 2 } })
        .service.cancelListing(admin, 3)
        .catch((e: ConflictException) => e.getResponse());
      expect(err).toMatchObject({
        code: 'DEALS_PENDING',
        details: { unpaidDeals: 2 },
      });
      await expect(build().service.cancelListing(officer, 3)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('offers and deals', () => {
    it('refuses an offer, or an approval, beyond what is still available', async () => {
      const err = await build()
        .service.makeOffer(buyer, 3, {
          quantity: 601,
          unitPrice: '24',
        } as never)
        .catch((e: ConflictException) => e.getResponse());
      expect(err).toMatchObject({
        code: 'EXCEEDS_AVAILABLE',
        details: { available: 600 },
      });
      await expect(
        build({ listing: { available: 150 } }).service.approveOffer(admin, 9),
      ).rejects.toThrow('Only 150 still available');
    });

    it('lets only the buyer withdraw their offer', async () => {
      await expect(
        build().service.withdrawOffer(actor(Role.Buyer), 9),
      ).rejects.toThrow(NotFoundException);
      const { service, chain } = build();
      await service.withdrawOffer(buyer, 9);
      expect(chain.methods()).toEqual(['withdrawOffer']);
    });

    it('refuses actions on an offer in the wrong state', async () => {
      await expect(
        build({ offer: { status: OfferStatus.Paid } }).service.cancelDeal(
          admin,
          9,
        ),
      ).rejects.toThrow('This offer is paid');
    });
  });

  describe('buyer payment', () => {
    const approved = {
      offer: {
        status: OfferStatus.Approved,
        paymentDueAt: new Date(NOW.getTime() + 3_600_000),
      },
    };

    it('saves the reference encrypted, then sends its keyed hash', async () => {
      const { service, update, chain } = build(approved);
      await service.confirmPayment(accounts, 9, 'bkash 55');
      const hash = hashPaymentRef('BKASH 55', SECRET);
      expect(update.calls.find(([m]) => m === 'set')![1]).toMatchObject({
        paymentRefEnc: 'enc[offers.payment_ref:9]BKASH 55',
        paymentRefHash: hash,
      });
      expect(chain.sent[0]).toMatchObject({
        method: 'confirmBuyerPayment',
        args: [9, hash],
      });
    });

    it('refuses after the deadline, and while another confirmation is in flight', async () => {
      const late = await build({
        offer: { status: OfferStatus.Approved, paymentDueAt: NOW },
      })
        .service.confirmPayment(accounts, 9, 'R')
        .catch((e: ConflictException) => e.getResponse());
      expect(late).toMatchObject({ code: 'PAYMENT_OVERDUE' });
      await expect(
        build({ ...approved, saveAffected: 0 }).service.confirmPayment(
          accounts,
          9,
          'R',
        ),
      ).rejects.toThrow('This deal is already being confirmed');
    });

    it('shows the reference only to roles that handle payments', async () => {
      const paid = {
        offer: {
          status: OfferStatus.Paid,
          paymentRefEnc: 'enc[offers.payment_ref:9]R-1',
        },
      };
      await expect(
        build(paid).service.offerOne(accounts, 9),
      ).resolves.toMatchObject({
        paymentReference: 'R-1',
      });
      const seen = await build(paid).service.offerOne(buyer, 9);
      expect(seen).not.toHaveProperty('paymentReference');
    });
  });

  describe('delivery', () => {
    const paid = { offer: { status: OfferStatus.Paid } };

    it('records the buyer’s side with a fingerprint of what they confirmed', async () => {
      const { service, deliveries, chain } = build(paid);
      await service.confirmDelivery(buyer, 9, {
        quantity: 190,
        notes: 'Ten short',
        photoId: 'buyer-photo',
      } as never);
      const d = deliveries[0];
      expect(d).toMatchObject({
        side: DeliverySide.Buyer,
        quantity: 190,
        photoHash: photoHash('cd'.repeat(32)),
      });
      expect(d.qualityHash).toBe(deliveryFingerprint(d));
      expect(chain.sent[0]).toMatchObject({
        method: 'confirmDelivery',
        args: [9, 190, d.qualityHash],
      });
    });

    it('takes the handler side from the receipt’s site operator, or the officer for fresh produce', async () => {
      const stored = { ...paid, listing: { receiptId: RECEIPT } };
      const { service, deliveries } = build(stored);
      await service.confirmDelivery(operator, 9, { quantity: 200 } as never);
      expect(deliveries[0].side).toBe(DeliverySide.Handler);
      await expect(
        build({ ...stored, operatorSite: 'site-2' }).service.confirmDelivery(
          operator,
          9,
          { quantity: 200 } as never,
        ),
      ).rejects.toThrow(ForbiddenException);
      const fresh = build({ ...paid, officerOf: true });
      await fresh.service.confirmDelivery(officer, 9, {
        quantity: 200,
      } as never);
      expect(fresh.deliveries[0].side).toBe(DeliverySide.Handler);
    });

    it('refuses a second confirmation from the same side, and someone else’s photo', async () => {
      const { service, deliveries } = build(paid);
      await service.confirmDelivery(buyer, 9, { quantity: 200 } as never);
      deliveries[0].status = 'recorded';
      await expect(
        service.confirmDelivery(buyer, 9, { quantity: 200 } as never),
      ).rejects.toThrow('The buyer has already confirmed this delivery');
      await expect(
        build(paid).service.confirmDelivery(buyer, 9, {
          quantity: 200,
          photoId: 'other',
        } as never),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('removes the confirmation when the ledger refuses it', async () => {
      const { service, deliveries, chain } = build(paid);
      chain.fail(revert('WrongOfferStatus'));
      await expect(
        service.confirmDelivery(buyer, 9, { quantity: 200 } as never),
      ).rejects.toThrow();
      expect(deliveries).toEqual([]);
    });

    it('flags a delivery whose quantity differs from the deal', async () => {
      const { service } = build(paid);
      await service.confirmDelivery(buyer, 9, { quantity: 190 } as never);
      await expect(service.offerOne(admin, 9)).resolves.toMatchObject({
        discrepancy: true,
      });
    });
  });
});
