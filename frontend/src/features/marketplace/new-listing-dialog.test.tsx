// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@/app/navigation';
import { project } from '@/test/fixtures';
import {
  fakeServer,
  recordForms,
  type Reply,
  renderPage,
  signedInAs,
  type Sent,
} from '@/test/render';
import { NewListingDialog, SellerListingDialog } from './new-listing-dialog';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const catalog: Reply = {
  body: {
    data: {
      produceTypes: [
        {
          code: 'POTATO',
          name: 'Potato',
          nameBn: 'আলু',
          unitCode: 'KG',
          active: true,
        },
        {
          code: 'OLD',
          name: 'Old Crop',
          nameBn: 'পুরনো',
          unitCode: 'KG',
          active: false,
        },
      ],
      units: [{ code: 'KG', symbol: 'kg', symbolBn: 'কেজি' }],
      inputTypes: [],
      fieldRecordTypes: [],
      weatherEventTypes: [],
    },
  },
};
const POTATO = {
  code: 'POTATO',
  name: 'Potato',
  nameBn: 'আলু',
  unit: 'kg',
  unitBn: 'কেজি',
};
const receipt = (over: Record<string, unknown> = {}) => ({
  id: `0x${'ab'.repeat(32)}`,
  owner: { kind: 'wegro', name: 'WeGro' },
  expired: false,
  produce: POTATO,
  quantity: 600,
  site: { name: 'Bogura Cold Store' },
  project: { name: 'Potato 4' },
  ...over,
});
const page = (data: unknown[]): Reply => ({
  body: {
    data,
    meta: { total: data.length, page: 1, limit: 100, totalPages: 1 },
  },
});

async function open(
  role: Role,
  dialog: 'seller' | 'wegro',
  write: (s: Sent) => Reply = () => ({
    status: 201,
    body: { data: { id: 41 } },
  }),
) {
  await signedInAs(role);
  const onClose = vi.fn();
  const sent = fakeServer((s) => {
    if (s.method === 'POST' && s.url.pathname === '/api/photos')
      return {
        status: 201,
        body: {
          data: { id: `photo-${s.url.search}1`, mimeType: 'image/jpeg' },
        },
      };
    if (s.method === 'POST') return write(s);
    switch (s.url.pathname) {
      case '/api/catalog':
        return catalog;
      case '/api/warehouse-receipts':
        return page([
          receipt(),
          receipt({
            id: `0x${'cd'.repeat(32)}`,
            owner: { kind: 'farmer', name: 'Karim Mia' },
          }),
          receipt({ id: `0x${'ef'.repeat(32)}`, expired: true }),
        ]);
      case '/api/projects':
        return page([
          project({
            id: 'p5',
            title: 'Tomato 2',
            category: 'perishable',
            produce: POTATO,
          }),
          project({
            id: 'p6',
            title: 'Maize Store',
            category: 'storable_crop',
          }),
        ]);
      default:
        return undefined;
    }
  });
  const view = await renderPage(
    dialog === 'seller' ? (
      <SellerListingDialog onClose={onClose} />
    ) : (
      <NewListingDialog onClose={onClose} />
    ),
    '/marketplace',
  );
  return { sent, onClose, dialog: await screen.findByRole('dialog'), ...view };
}

const choose = async (label: string, typed: string, option: string) => {
  const box = screen.getByLabelText(label, { selector: 'input' });
  await userEvent.type(box, typed);
  await userEvent.click(await screen.findByRole('option', { name: option }));
};

describe('an outside seller’s listing', () => {
  it('names what is missing, then sends the produce with its photos for approval', async () => {
    const forms = recordForms();
    const { sent, dialog, router, onClose } = await open('seller', 'seller');
    const send = within(dialog).getByRole('button', {
      name: 'Send for Approval',
    });
    await userEvent.click(send);
    for (const m of [
      'Choose the produce.',
      'Enter a whole number, at least 1.',
      'Enter a price in taka, more than 0.',
      'Choose the district.',
      'Add at least one photo.',
    ])
      expect(within(dialog).getByText(m)).toBeTruthy();

    await choose('Produce', 'pot', 'Potato');
    // Retired crops are not offered.
    expect(screen.queryByRole('option', { name: 'Old Crop' })).toBeNull();
    expect(within(dialog).getByText('Quantity (kg)')).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText(/^Quantity/), '500');
    await userEvent.type(
      within(dialog).getByLabelText('Asking Price Per Unit'),
      '25',
    );
    await userEvent.click(
      within(dialog).getByRole('combobox', { name: 'District' }),
    );
    await userEvent.click(
      await screen.findByRole('option', { name: 'Bogura' }),
    );
    await userEvent.type(
      within(dialog).getByLabelText('Description'),
      '  Washed, graded.  ',
    );
    await userEvent.upload(
      dialog.querySelector('input[type=file]') as HTMLInputElement,
      new File(['jpg'], 'sack.jpg', { type: 'image/jpeg' }),
    );
    await waitFor(() => expect(forms.at(-1)).toEqual([['file', 'sack.jpg']]));
    await waitFor(() =>
      expect(within(dialog).queryByText('Add at least one photo.')).toBeNull(),
    );

    await userEvent.click(send);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/marketplace/listings/41'),
    );
    expect(onClose).toHaveBeenCalled();
    const posted = sent.find(
      (s) => s.url.pathname === '/api/listings/external',
    )!;
    expect(posted.body).toMatchObject({
      produceCode: 'POTATO',
      quantity: 500,
      askingUnitPrice: '25',
      districtCode: 'BOGURA',
      description: 'Washed, graded.',
    });
    expect((posted.body as { photoIds: string[] }).photoIds).toHaveLength(1);
  });

  it('keeps the form with the reason when refused, and closes on Cancel', async () => {
    recordForms();
    const { dialog, onClose } = await open('seller', 'seller', (s) =>
      s.url.pathname === '/api/listings/external'
        ? {
            status: 422,
            body: {
              statusCode: 422,
              code: 'PHOTO_NOT_YOURS',
              message: 'photoId must be a photo you uploaded',
            },
          }
        : { status: 201, body: { data: { id: 41 } } },
    );
    await choose('Produce', 'pot', 'Potato');
    await userEvent.type(within(dialog).getByLabelText(/^Quantity/), '5');
    await userEvent.type(
      within(dialog).getByLabelText('Asking Price Per Unit'),
      '2',
    );
    await userEvent.click(
      within(dialog).getByRole('combobox', { name: 'District' }),
    );
    await userEvent.click(
      await screen.findByRole('option', { name: 'Bogura' }),
    );
    await userEvent.upload(
      dialog.querySelector('input[type=file]') as HTMLInputElement,
      new File(['jpg'], 'sack.jpg', { type: 'image/jpeg' }),
    );
    await waitFor(() =>
      expect(
        within(dialog)
          .getByRole('button', { name: 'Send for Approval' })
          .hasAttribute('disabled'),
      ).toBe(false),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Send for Approval' }),
    );
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    );
    expect(onClose).toHaveBeenCalled();
  });
});

describe('WeGro’s listing', () => {
  it('lists a receipt WeGro holds at a price per unit, offering only its own live receipts', async () => {
    const { sent, dialog, router } = await open('admin', 'wegro');
    expect(
      within(dialog)
        .getByRole('button', { name: 'Warehouse Receipt' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'List for Sale' }),
    );
    expect(within(dialog).getByText('Choose a receipt.')).toBeTruthy();
    expect(
      within(dialog).getByText('Enter a price in taka, more than 0.'),
    ).toBeTruthy();

    await userEvent.click(
      within(dialog).getByLabelText('Warehouse Receipt', { selector: 'input' }),
    );
    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(1); // not the farmer's, not the expired one
    await userEvent.click(options[0]!);
    expect(
      within(dialog).getByText('Bogura Cold Store · Potato 4'),
    ).toBeTruthy();
    expect(
      within(dialog).getByText('Asking Price Per Unit (per kg)'),
    ).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText(/^Asking Price/), '30');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'List for Sale' }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/marketplace/listings/41'),
    );
    expect(
      sent.find((s) => s.url.pathname === '/api/listings/receipt')!.body,
    ).toEqual({
      receiptId: `0x${'ab'.repeat(32)}`,
      askingUnitPrice: '30',
    });
  });

  it('lets an officer list a farmer’s receipt, or fresh produce from an active project', async () => {
    const { sent, dialog } = await open('field_officer', 'wegro');
    await userEvent.click(
      within(dialog).getByLabelText('Warehouse Receipt', { selector: 'input' }),
    );
    expect((await screen.findAllByRole('option'))[0]!.textContent).toContain(
      'Karim Mia',
    );
    await userEvent.keyboard('{Escape}');

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Fresh Produce' }),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'List for Sale' }),
    );
    expect(within(dialog).getByText('Choose a project.')).toBeTruthy();
    expect(
      within(dialog).getByText('Enter a whole number, at least 1.'),
    ).toBeTruthy();
    await choose('Project', 'tom', 'Tomato 2 · Rahim Uddin');
    // Only perishable produce is sold fresh.
    expect(within(dialog).getByText('Quantity (kg)')).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText(/^Quantity/), '200');
    await userEvent.type(
      within(dialog).getByLabelText(/^Asking Price/),
      '18.5',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'List for Sale' }),
    );
    await waitFor(() =>
      expect(
        sent.find((s) => s.url.pathname === '/api/listings/produce')?.body,
      ).toEqual({
        projectId: 'p5',
        quantity: 200,
        askingUnitPrice: '18.5',
      }),
    );
  });

  it('keeps the form with the reason when the ledger refuses the listing', async () => {
    const { dialog } = await open('admin', 'wegro', () => ({
      status: 409,
      body: {
        statusCode: 409,
        code: 'RECEIPT_ALREADY_LISTED',
        message: 'Already listed',
      },
    }));
    await userEvent.click(
      within(dialog).getByLabelText('Warehouse Receipt', { selector: 'input' }),
    );
    await userEvent.click((await screen.findAllByRole('option'))[0]!);
    await userEvent.type(within(dialog).getByLabelText(/^Asking Price/), '30');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'List for Sale' }),
    );
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
  });

  it('closes on Escape', async () => {
    const { onClose } = await open('admin', 'wegro');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
