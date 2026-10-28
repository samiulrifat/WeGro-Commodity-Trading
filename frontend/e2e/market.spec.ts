import { expect, go, RUN, signInAs, signOut, test } from './support';

interface Listing {
  id: number;
  source: 'warehouse' | 'fresh' | 'seller';
  status: string;
  available: number;
}

/**
 * The marketplace's main story: a buyer offers on one of WeGro's listings,
 * an admin approves the offer, Accounts confirms the buyer's payment and
 * the deal waits for delivery.
 */
test('a buyer offers, WeGro approves and Accounts confirms payment', async ({
  page,
  errors,
}) => {
  void errors;
  await signInAs(page, 'buyer');
  const listed = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/listings' && r.ok(),
  );
  await go(page, '/marketplace');
  const { data } = (await (await listed).json()) as { data: Listing[] };
  const listing = data.find(
    (l) => l.source !== 'seller' && l.status === 'open' && l.available >= 2,
  );
  test.skip(!listing, 'No open WeGro listing in the sample data');
  await go(page, `/marketplace/listings/${listing!.id}`);
  await page.getByRole('button', { name: 'Make an Offer' }).click();
  const form = page.getByRole('dialog');
  await form.locator('#offer-quantity').fill('1');
  const made = page.waitForResponse(
    (r) =>
      /\/api\/listings\/\d+\/offers$/.test(new URL(r.url()).pathname) &&
      r.request().method() === 'POST',
  );
  await form.getByRole('button', { name: 'Send Offer' }).click();
  const offer = ((await (await made).json()) as { data: { id: number } }).data
    .id;
  await expect(
    page.getByText('Offer sent. You are told when it is decided.'),
  ).toBeVisible();
  await signOut(page);

  await signInAs(page, 'admin');
  await go(page, `/marketplace/deals/${offer}`);
  await page.getByRole('button', { name: 'Approve Offer' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Approve Offer' })
    .click();
  await expect(page.getByText('Waiting for Payment').first()).toBeVisible();
  await signOut(page);

  await signInAs(page, 'accounts');
  await go(page, `/marketplace/deals/${offer}`);
  await page.getByRole('button', { name: 'Confirm Payment' }).click();
  const pay = page.getByRole('dialog');
  await pay.locator('#deal-reference').fill(`DEAL-${RUN}`);
  await pay.getByRole('button', { name: 'Confirm Payment' }).click();
  await expect(pay).toBeHidden();
  await expect(page.getByText('Waiting for Delivery').first()).toBeVisible();
});
