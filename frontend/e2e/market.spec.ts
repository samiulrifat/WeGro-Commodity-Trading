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
  // A buyer lands on the listings: their first load may already be the one.
  const listed = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/listings' && r.ok(),
  );
  await signInAs(page, 'buyer');
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

/**
 * The buyer's side of paying: once WeGro approves the offer, the buyer
 * transfers the money and sends proof, naming the bank branch paid from
 * (its routing number filled in from the bank list). Accounts accepts it
 * with the statement reference, and the deal is paid.
 */
test('a buyer pays WeGro by bank deposit, sends proof and Accounts accepts it', async ({
  page,
  errors,
}) => {
  void errors;
  const listed = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/listings' && r.ok(),
  );
  await signInAs(page, 'buyer');
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

  // Buyer: the time left, then the proof with the branch paid from.
  await signInAs(page, 'buyer');
  await go(page, `/marketplace/deals/${offer}`);
  await expect(page.getByText(/^Pay within/)).toBeVisible();
  await page.getByRole('button', { name: 'Upload Payment Proof' }).click();
  const proof = page.getByRole('dialog');
  await expect(proof.getByText('FULL')).toBeVisible();
  const choose = async (label: string, typed: string, option: string) => {
    const box = proof.getByRole('combobox', { name: label });
    await expect(box).toBeEnabled();
    await box.fill(typed);
    await page.getByRole('option', { name: option, exact: true }).click();
  };
  await choose('Bank Name', 'sonali', 'SONALI BANK LTD.');
  await choose('District', 'bagerhat', 'BAGERHAT');
  await choose('Branch', 'bagerhat', 'BAGERHAT');
  await expect(proof.getByLabel('Routing Number')).toHaveValue('200010074');
  await proof.getByLabel('Transaction or Cheque Number').fill(`DEP-${RUN}`);
  await proof.locator('#proof-files').setInputFiles({
    name: 'slip.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
    ),
  });
  await proof.getByRole('button', { name: 'Submit for Review' }).click();
  await expect(proof).toBeHidden();
  await expect(page.getByText('Payment Under Review').first()).toBeVisible();
  await expect(page.getByText('File 1')).toBeVisible();
  await signOut(page);

  // Accounts: finds it on the buyer payments page and accepts it.
  await signInAs(page, 'accounts');
  await go(page, '/marketplace/payments');
  const card = page.locator('article').filter({ hasText: `Offer #${offer}` });
  await expect(card.getByText('200010074')).toBeVisible();
  await card.getByRole('button', { name: 'Accept' }).click();
  const accept = page.getByRole('dialog');
  await accept.getByLabel('Statement Reference').fill(`STMT-DEAL-${RUN}`);
  await accept.getByRole('button', { name: 'Accept' }).click();
  await expect(accept).toBeHidden();
  await signOut(page);

  // Buyer: paid, and waiting for the goods.
  await signInAs(page, 'buyer');
  await go(page, `/marketplace/deals/${offer}`);
  await expect(page.getByText('Waiting for Delivery').first()).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Upload Payment Proof' }),
  ).toBeHidden();
});
