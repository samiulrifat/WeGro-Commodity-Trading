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
  uniqueViolation,
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
  const admin = actor(Role.ADMIN);
  const officer = actor(Role.FIELD_OFFICER);
  const buyer = actor(Role.BUYER);
  const operator = actor(Role.WAREHOUSE);
  const accounts = actor(Role.ACCOUNTS);

  const build = (
    opts: {
      project?: Partial<Project>;
      receipt?: Record<string, unknown> | null;
      listing?: Partial<Listing>;
      offer?: Partial<Offer>;
      officerOf?: boolean;
      operatorSite?: string | null;
      saveAffected?: number;
      saveError?: Error;
    } = {},
  ) => {
    const project = {
      id: PROJECT,
      farmerId: FARMER,
      stage: ProjectStage.ACTIVE,
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
            status: ReceiptStatus.ISSUED,
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
      status: ListingStatus.OPEN,
      ...opts.listing,
    } as Listing;
    const offer = {
      id: 9,
      listingId: 3,
      buyerId: buyer.id,
      quantity: 200,
      unitPrice: 2400n,
      status: OfferStatus.PENDING,
      paymentDueAt: null,
      paymentRefEnc: null,
      ...opts.offer,
    } as Offer;
    const deliveries: Delivery[] = [];
    const update = fakeQueryBuilder({
      execute: opts.saveError ?? { affected: opts.saveAffected ?? 1 },
    });
    const reads: ReturnType<typeof fakeQueryBuilder>[] = [];
    const offers = fakeRepo({
      findOneBy: jest.fn(() => Promise.resolve(offer)),
      // No alias: the update that saves a payment reference; 'o': a scoped read.
      createQueryBuilder: jest.fn((alias?: string) => {
        if (!alias) return update.qb;
        reads.push(fakeQueryBuilder({ getOne: offer }));
        return reads[reads.length - 1].qb;
      }),
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
        id === 'missing'
          ? Promise.reject(new Error('Photo not found'))
          : Promise.resolve({
              id,
              sha256: 'cd'.repeat(32),
              uploadedById: id === 'buyer-photo' ? buyer.id : 'x',
            }),
      ),
    };
    const crypto = fakeCrypto();
    const details = fakeRepo({ findBy: jest.fn(() => Promise.resolve([])) });
    const service = new TradeService(
      config({ PAYMENT_REF_SECRET: SECRET }),
      fakeRepo({
        findOneBy: jest.fn(() => Promise.resolve(listing)),
        findOneByOrFail: jest.fn(() => Promise.resolve(listing)),
        find: jest.fn(() => Promise.resolve([listing])),
      }) as never,
      details as never,
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
      { get: () => ({}) } as never,
      fakeClock(NOW) as never,
      { condition: () => null } as never,
    );
    return {
      service,
      chain,
      update,
      reads,
      details,
      offers,
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
        list({ receipt: { status: ReceiptStatus.LISTED } }),
      ).rejects.toThrow(
        'Only an issued receipt can be listed; this one is listed',
      );
      await expect(
        list({ receipt: { expiresOn: '2026-10-13' } }),
      ).rejects.toThrow('This receipt has expired');
      await expect(
        list({ project: { stage: ProjectStage.READY_FOR_SALE } }),
      ).rejects.toThrow('Produce is sold only while the project is active');
      await expect(
        list({ receipt: { status: ReceiptStatus.SUBMITTED } }),
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
        build().service.withdrawOffer(actor(Role.BUYER), 9),
      ).rejects.toThrow(NotFoundException);
      const { service, chain } = build();
      await service.withdrawOffer(buyer, 9);
      expect(chain.methods()).toEqual(['withdrawOffer']);
    });

    it('refuses actions on an offer in the wrong state', async () => {
      await expect(
        build({ offer: { status: OfferStatus.PAID } }).service.cancelDeal(
          admin,
          9,
        ),
      ).rejects.toThrow('This offer is paid');
    });
  });

  describe('buyer payment', () => {
    const approved = {
      offer: {
        status: OfferStatus.APPROVED,
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
        offer: { status: OfferStatus.APPROVED, paymentDueAt: NOW },
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
          status: OfferStatus.PAID,
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
    const paid = { offer: { status: OfferStatus.PAID } };

    it('refuses a delivery photo that does not exist', async () => {
      await expect(
        build(paid).service.confirmDelivery(buyer, 9, {
          quantity: 190,
          photoId: 'missing',
        } as never),
      ).rejects.toMatchObject({ response: { code: 'PHOTO_NOT_YOURS' } });
    });

    it('records the buyer’s side with a fingerprint of what they confirmed', async () => {
      const { service, deliveries, chain } = build(paid);
      await service.confirmDelivery(buyer, 9, {
        quantity: 190,
        notes: 'Ten short',
        photoId: 'buyer-photo',
      } as never);
      const d = deliveries[0];
      expect(d).toMatchObject({
        side: DeliverySide.BUYER,
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
      expect(deliveries[0].side).toBe(DeliverySide.HANDLER);
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
      expect(fresh.deliveries[0].side).toBe(DeliverySide.HANDLER);
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
  describe('edges', () => {
    const seller = actor(Role.SELLER, { id: buyer.id });
    const external = { projectId: null, farmerId: null, sellerId: seller.id };

    it('lets a seller cancel their own listing, not another seller’s', async () => {
      const { service, chain } = build({ listing: external });
      await service.cancelListing(seller, 3);
      expect(chain.sent[0].method).toBe('cancelListing');
      await expect(
        build({ listing: external }).service.cancelListing(
          actor(Role.SELLER),
          3,
        ),
      ).rejects.toMatchObject({
        response: { code: 'LISTING_CANCEL_NOT_ALLOWED' },
      });
    });

    it('lists only photos the seller uploaded', async () => {
      const { service } = build();
      await expect(
        service.listExternal(seller, {
          produceCode: 'POTATO',
          quantity: 100,
          askingUnitPrice: '25',
          districtCode: 'BOGURA',
          photoIds: ['someone-elses'],
        } as never),
      ).rejects.toMatchObject({ response: { code: 'PHOTO_NOT_YOURS' } });
      await expect(
        service.listExternal(seller, {
          produceCode: 'POTATO',
          quantity: 100,
          askingUnitPrice: '25',
          districtCode: 'BOGURA',
          photoIds: ['missing'],
        } as never),
      ).rejects.toMatchObject({ response: { code: 'PHOTO_NOT_YOURS' } });
    });

    it('drops the saved details when the ledger refuses the listing', async () => {
      const { service, chain, details } = build();
      chain.fail(revert('ZeroValue'));
      await expect(
        service.listExternal(seller, {
          produceCode: 'POTATO',
          quantity: 100,
          askingUnitPrice: '25',
          districtCode: 'BOGURA',
          photoIds: ['buyer-photo'],
        } as never),
      ).rejects.toThrow();
      expect(details.insert).toHaveBeenCalledTimes(1);
      expect(details.delete).toHaveBeenCalledTimes(1);
    });

    it('keeps the details when the failure is not a refusal', async () => {
      const { service, chain, details } = build();
      chain.fail(new Error('node unreachable'));
      await expect(
        service.listExternal(seller, {
          produceCode: 'POTATO',
          quantity: 100,
          askingUnitPrice: '25',
          districtCode: 'BOGURA',
          photoIds: [],
        } as never),
      ).rejects.toThrow('node unreachable');
      expect(details.delete).not.toHaveBeenCalled();
    });

    it('clears the saved payment reference when the ledger refuses it', async () => {
      const { service, chain, offers } = build({
        offer: { status: OfferStatus.APPROVED },
      });
      chain.fail(revert('PaymentRefAlreadyUsed'));
      await expect(
        service.confirmPayment(accounts, 9, 'BANK-1'),
      ).rejects.toThrow();
      expect(offers.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 9, status: OfferStatus.APPROVED }),
        { paymentRefEnc: null, paymentRefHash: null, paidConfirmedById: null },
      );
    });

    describe('seller payout', () => {
      const delivered = (o: Parameters<typeof build>[0] = {}) =>
        build({
          listing: external,
          offer: { status: OfferStatus.DELIVERED },
          ...o,
        });

      it('refuses a blank reference before anything else', async () => {
        await expect(
          delivered().service.recordSellerPayout(accounts, 9, '  '),
        ).rejects.toMatchObject({ response: { code: 'PAYMENT_REF_INVALID' } });
      });

      it('refuses a reference another payout already used', async () => {
        await expect(
          delivered({
            saveError: uniqueViolation(),
          }).service.recordSellerPayout(accounts, 9, 'BANK-2'),
        ).rejects.toMatchObject({
          response: { code: 'PAYMENT_REF_ALREADY_USED' },
        });
      });

      it('passes other database failures on unchanged', async () => {
        await expect(
          delivered({
            saveError: new Error('disk full'),
          }).service.recordSellerPayout(accounts, 9, 'BANK-2'),
        ).rejects.toThrow('disk full');
      });

      it('refuses while another payout of the deal is being recorded', async () => {
        await expect(
          delivered({ saveAffected: 0 }).service.recordSellerPayout(
            accounts,
            9,
            'BANK-2',
          ),
        ).rejects.toMatchObject({ response: { code: 'DEAL_CONFIRMING' } });
      });

      it('clears the saved reference when the ledger refuses it', async () => {
        const { service, chain, offers } = delivered();
        chain.fail(revert('PaymentRefAlreadyUsed'));
        await expect(
          service.recordSellerPayout(accounts, 9, 'BANK-2'),
        ).rejects.toThrow();
        expect(offers.update).toHaveBeenCalledWith(
          expect.objectContaining({ id: 9, status: OfferStatus.DELIVERED }),
          {
            sellerPayoutRefEnc: null,
            sellerPayoutRefHash: null,
            sellerPaidById: null,
          },
        );
      });

      it('keeps it when the failure is not a refusal', async () => {
        const { service, chain, offers } = delivered();
        chain.fail(new Error('node unreachable'));
        await expect(
          service.recordSellerPayout(accounts, 9, 'BANK-2'),
        ).rejects.toThrow('node unreachable');
        expect(offers.update).not.toHaveBeenCalled();
      });
    });

    it('shows no deals to a role with no side in them', async () => {
      const { service, reads } = build();
      await service.listOffers(actor(Role.INVESTOR), {
        skip: 0,
        limit: 20,
      } as never);
      expect(reads[0].wheres()).toContain('FALSE');
    });
  });
});
