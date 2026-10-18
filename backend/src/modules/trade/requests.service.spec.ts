import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { codeToBytes32 } from '../../blockchain/utils/ids';
import { bdDayEnd } from '../../common/time/bd-dates';
import {
  actor,
  fakeCatalog,
  fakeClock,
  fakeQueryBuilder,
  fakeRepo,
  fakeTx,
  Role,
} from '../../../test/support/unit';
import type { BuyerRequest } from './entities/buyer-request.entity';
import type { Listing } from './entities/listing.entity';
import { RequestsService } from './requests.service';
import { ListingStatus, RequestStatus } from './trade.enums';

const NOW = new Date('2026-10-14T06:00:00Z');
const LATER = new Date('2026-11-30T17:59:59Z');

const request = (over: Partial<BuyerRequest> = {}) =>
  ({
    id: 7,
    buyerId: 'b1',
    produceCode: 'MAIZE',
    quantity: 500,
    maxUnitPrice: 3000n,
    validUntil: LATER,
    status: RequestStatus.OPEN,
    postedAt: NOW,
    ...over,
  }) as BuyerRequest;

const listing = (id: number, price: bigint, over: Partial<Listing> = {}) =>
  ({
    id,
    projectId: 'p1',
    produceCode: 'MAIZE',
    available: 100,
    askingUnitPrice: price,
    status: ListingStatus.OPEN,
    ...over,
  }) as Listing;

describe('RequestsService', () => {
  const buyer = actor(Role.BUYER, { id: 'b1' });

  const build = (
    opts: { row?: BuyerRequest | null; open?: Listing[] } = {},
  ) => {
    const requests = fakeRepo({
      findOneBy: jest.fn(() =>
        Promise.resolve(opts.row === undefined ? request() : opts.row),
      ),
    });
    const listings = fakeRepo({
      createQueryBuilder: jest.fn(
        () => fakeQueryBuilder({ getMany: opts.open ?? [] }).qb,
      ),
    });
    const projects = fakeRepo({
      find: jest.fn(() =>
        Promise.resolve([{ id: 'p1', districtCode: 'BOGURA' }]),
      ),
    });
    const trade = {
      produceRef: jest.fn((code: string) => ({ code, name: code })),
    };
    const views = {
      names: jest.fn(() => Promise.resolve(new Map([['b1', 'Buyer One']]))),
    };
    const chain = fakeTx((call) =>
      call.method === 'postRequest'
        ? [
            {
              contract: 'TradeLedger',
              name: 'RequestPosted',
              args: { requestId: 7n },
              logIndex: 0,
            },
          ]
        : [],
    );
    const applier = { apply: jest.fn(() => Promise.resolve()) };
    const service = new RequestsService(
      requests as never,
      listings as never,
      projects as never,
      fakeCatalog() as never,
      trade as never,
      views as never,
      chain.tx as never,
      applier as never,
      fakeClock(NOW) as never,
    );
    return { service, chain, applier };
  };

  it('posts a request on the ledger with the price in poisha and the day’s end as deadline', async () => {
    const { service, chain, applier } = build();
    const dto = await service.post(buyer, {
      produceCode: 'MAIZE',
      quantity: 500,
      maxUnitPrice: '30.00',
      validUntil: '2026-11-30',
    } as never);
    expect(chain.sent[0]).toMatchObject({
      contract: 'TradeLedger',
      method: 'postRequest',
      args: [codeToBytes32('MAIZE'), 500, 3000n, bdDayEnd('2026-11-30')],
    });
    expect(applier.apply).toHaveBeenCalledTimes(1);
    expect(dto).toMatchObject({ id: 7, status: 'open', maxUnitPrice: '30.00' });
  });

  it('refuses a past deadline or a retired crop before the ledger', async () => {
    const { service, chain } = build();
    await expect(
      service.post(buyer, {
        produceCode: 'MAIZE',
        quantity: 1,
        maxUnitPrice: '1',
        validUntil: '2026-10-13',
      } as never),
    ).rejects.toThrow(UnprocessableEntityException);
    await expect(
      service.post(buyer, {
        produceCode: 'OLDCROP',
        quantity: 1,
        maxUnitPrice: '1',
        validUntil: '2026-11-30',
      } as never),
    ).rejects.toThrow('no longer in use');
    expect(chain.sent).toEqual([]);
  });

  it('shows matching open listings within the price, cheapest first, at most five', async () => {
    const open = [
      listing(1, 2000n),
      listing(2, 2500n),
      listing(3, 2600n),
      listing(4, 2700n),
      listing(5, 2800n),
      listing(6, 2900n),
      listing(7, 3100n), // over the buyer's price
    ];
    const dto = await build({ open }).service.one(7);
    expect(dto.matchingListings.map((m) => m.id)).toEqual([1, 2, 3, 4, 5]);
    expect(dto.matchingListings[0]).toEqual({
      id: 1,
      available: 100,
      askingUnitPrice: '20.00',
      district: 'Bogura',
    });
  });

  it('calls a request past its deadline expired, with no matches', async () => {
    const dto = await build({
      row: request({ validUntil: new Date(NOW.getTime() - 1000) }),
      open: [listing(1, 1000n)],
    }).service.one(7);
    expect(dto).toMatchObject({ status: 'expired', matchingListings: [] });
  });

  describe('cancelling', () => {
    it('cancels the buyer’s own open request on the ledger', async () => {
      const { service, chain } = build();
      await service.cancel(buyer, 7);
      expect(chain.methods()).toEqual(['cancelRequest']);
    });

    it('hides other buyers’ requests and unconfirmed ones', async () => {
      await expect(
        build().service.cancel(actor(Role.BUYER), 7),
      ).rejects.toThrow(NotFoundException);
      await expect(
        build({ row: request({ status: null }) }).service.cancel(buyer, 7),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses a request already cancelled', async () => {
      const { service, chain } = build({
        row: request({ status: RequestStatus.CANCELLED }),
      });
      await expect(service.cancel(buyer, 7)).rejects.toThrow(ConflictException);
      expect(chain.sent).toEqual([]);
    });
  });
});
