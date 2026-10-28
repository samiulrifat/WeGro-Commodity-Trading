import { expect, go, photo, RUN, signInAs, signOut, test } from './support';

/**
 * A project's main story, through the screens: an admin drafts a project
 * for the demo farmer and publishes it, the investor books every unit and
 * sends proof of a cash payment, Accounts accepts it with the statement
 * reference, the investor sees it paid and the project funded; then the
 * farmer's officer sends the first farm update from the field, Operations
 * and Accounts give the farmer a seed voucher, Accounts records a cost
 * with its bill, and a flood is insured, claimed, approved by the insurer
 * and its payment recorded.
 */
test.describe.configure({ mode: 'serial' });
test.use({
  geolocation: { latitude: 24.85, longitude: 89.37 },
  permissions: ['geolocation'],
});

let title = '';
let projectPath = '';

test('an investor books units, pays and is confirmed', async ({
  page,
  errors,
}, info) => {
  void errors;
  title = `E2E Maize ${RUN} ${info.project.name}`;

  // Admin: a new draft, then publish.
  await signInAs(page, 'admin');
  await go(page, '/projects/new');
  await page.getByLabel('Title').fill(title);
  await page.locator('#project-crop').click();
  await page.getByRole('option', { name: 'Maize' }).click();
  await page.locator('#project-district').click();
  await page.getByRole('option', { name: 'Bogura' }).click();
  await page.getByLabel('Upazila and Village').fill('Shibganj, Mokamtola');
  await page
    .getByRole('searchbox', { name: 'Name or mobile number of the farmer' })
    .fill('Demo Farmer');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await page.getByRole('button', { name: /Demo Farmer/ }).click();
  await page.getByLabel('Funding Target').fill('20000');
  await page.getByLabel('Unit Price').fill('10000');
  await page.getByLabel('Expected Return, Low (%)').fill('8');
  await page.getByLabel('Expected Return, High (%)').fill('14');
  await page.locator('#project-duration-type').click();
  await page.getByRole('option', { name: 'Short Term' }).click();
  await page.getByLabel('Duration (Months)').fill('5');
  await page.getByRole('switch', { name: 'Insured' }).click();
  await page.getByRole('button', { name: 'Save Draft' }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  projectPath = new URL(page.url()).pathname;
  await page.getByRole('button', { name: 'Publish' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Publish' })
    .click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Publish' })).toBeHidden();
  await signOut(page);

  // Investor: book both units and send a cash proof.
  await signInAs(page, 'investor');
  await go(page, projectPath);
  await page.getByRole('button', { name: 'Invest Now' }).click();
  const book = page.getByRole('dialog');
  await book.getByRole('button', { name: 'One Unit More' }).click();
  await expect(book).toContainText(/৳\s?20,000/);
  await book.getByRole('button', { name: 'Book Units' }).click();
  await page.waitForURL(/\/holdings\/bookings\/\d+$/);
  const bookingPath = new URL(page.url()).pathname;
  await page.getByRole('button', { name: 'Upload Payment Proof' }).click();
  const proof = page.getByRole('dialog');
  await expect(proof.getByText('FULL')).toBeVisible();
  await proof.getByRole('button', { name: 'Cash' }).click();
  await proof.getByLabel('Transaction or Cheque Number').fill(`CASH-${RUN}`);
  await proof.locator('#proof-files').setInputFiles({
    name: 'receipt.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
    ),
  });
  await proof.getByRole('button', { name: 'Submit for Review' }).click();
  await expect(proof).toBeHidden();
  await expect(
    page.getByText('receipt.pdf').or(page.getByText('File 1')),
  ).toBeVisible();
  await signOut(page);

  // Accounts: accept it with the statement reference.
  await signInAs(page, 'accounts');
  await go(page, '/projects/payments');
  const card = page.locator('article').filter({ hasText: title });
  await card.getByRole('button', { name: 'Accept' }).click();
  const accept = page.getByRole('dialog');
  await accept.getByLabel('Statement Reference').fill(`STMT-${RUN}`);
  await accept.getByRole('button', { name: 'Accept' }).click();
  await expect(accept).toBeHidden();
  await signOut(page);

  // Investor: paid, and the project is fully funded.
  await signInAs(page, 'investor');
  await go(page, bookingPath);
  await expect(page.getByText('Payment Complete')).toBeVisible();
  await go(page, projectPath);
  await expect(page.getByText(/100(\.00)?% funded/).first()).toBeVisible();
});

test('the field officer sends the first farm update', async ({
  page,
  errors,
}) => {
  void errors;
  test.skip(!projectPath, 'Needs the project funded above');
  await signInAs(page, 'field_officer');
  await go(page, '/farm-updates');
  // The radios are drawn as cards: tap the card, as a person would.
  await page.locator('label').filter({ hasText: title }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.locator('label').filter({ hasText: 'Land Preparation' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Continue Without Photo' }).click();
  await page.getByLabel('Notes').fill('Ploughed twice, ready for sowing.');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Save and Send' }).click();
  await expect(page.getByText('Farm update sent.')).toBeVisible();
  await go(page, projectPath);
  // Shown once on the timeline: sent once, never twice.
  await expect(
    page
      .getByText('Ploughed twice, ready for sowing.')
      .filter({ visible: true }),
  ).toHaveCount(1);
});

test('Operations proposes a seed voucher and Accounts approves it', async ({
  page,
  errors,
}) => {
  void errors;
  test.skip(!projectPath, 'Needs the project funded above');
  await signInAs(page, 'operations');
  await go(page, projectPath);
  await page.getByRole('button', { name: 'Propose Voucher' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#voucher-input').fill('Maize');
  await page.getByRole('option', { name: /Maize Seed/i }).click();
  await dialog.getByLabel('Quantity').fill('25');
  await dialog.getByLabel('Unit Price (৳)').fill('120');
  await dialog
    .getByRole('searchbox', { name: 'Name, Mobile Number or NID' })
    .fill('Demo Supplier');
  await dialog.getByRole('button', { name: 'Find', exact: true }).click();
  await dialog.getByRole('checkbox', { name: 'Demo Supplier' }).check();
  await dialog.getByRole('button', { name: 'Submit Proposal' }).click();
  await expect(
    page.getByText('Voucher proposed. It now waits for Accounts.'),
  ).toBeVisible();
  await expect(dialog).toBeHidden();
  await signOut(page);

  await signInAs(page, 'accounts');
  await go(page, projectPath);
  await page.getByRole('link', { name: /Maize Seed · 25/i }).click();
  await page.waitForURL(/\/vouchers\//);
  await expect(page.getByText('Awaiting Approval').first()).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Approve' })
    .click();
  await expect(page.getByText('Active').first()).toBeVisible();
});

test('Accounts records a cost with its bill photo', async ({
  page,
  errors,
}) => {
  void errors;
  test.skip(!projectPath, 'Needs the project funded above');
  await signInAs(page, 'accounts');
  await go(page, projectPath.replace('/projects/', '/payouts/projects/'));
  await page.getByRole('button', { name: 'Add Cost' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Transport' }).click();
  await dialog.getByLabel('Amount (Taka)').fill('1250');
  await dialog.getByLabel('Note').fill(`Truck to the field, ${RUN}`);
  await dialog.locator('input[type=file]').setInputFiles(photo('bill.png'));
  await expect(
    dialog.getByRole('button', { name: 'Remove Photo' }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Add Cost' }).click();
  await expect(page.getByText('Cost added.')).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByText(`Truck to the field, ${RUN}`).filter({ visible: true }),
  ).toHaveCount(1);
});

test('a flood is claimed, approved by the insurer and paid', async ({
  page,
  errors,
}) => {
  void errors;
  test.skip(!projectPath, 'Needs the project funded above');
  const insured = projectPath.replace('/projects/', '/insurance/projects/');

  // Admin: give the project its insurer, and record the flood.
  await signInAs(page, 'admin');
  await go(page, insured);
  await page.getByRole('button', { name: 'Assign Insurer' }).click();
  let dialog = page.getByRole('dialog');
  await dialog
    .getByRole('searchbox', { name: 'Find an insurer by name or mobile' })
    .fill('Demo Insurer');
  await dialog.getByRole('button', { name: 'Find', exact: true }).click();
  await dialog.getByRole('button', { name: /Demo Insurer/ }).click();
  await dialog.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect(page.getByText('Insurer assigned.')).toBeVisible();
  await go(page, '/insurance/weather-events');
  await page.getByRole('button', { name: 'Record Event' }).click();
  dialog = page.getByRole('dialog');
  await dialog.locator('#event-type').click();
  await page.getByRole('option', { name: 'Flood', exact: true }).click();
  await dialog.locator('#event-district').click();
  await page.getByRole('option', { name: 'Bogura' }).click();
  await dialog.getByRole('button', { name: 'Severe' }).click();
  await dialog
    .getByLabel('About the Event')
    .fill('Karatoya above danger level for four days.');
  await dialog.getByRole('button', { name: 'Record Event' }).click();
  await expect(page.getByText('Weather event recorded.')).toBeVisible();
  await signOut(page);

  // Insurer: the cover, floods included.
  await signInAs(page, 'insurer');
  await go(page, insured);
  await page.getByRole('button', { name: 'Set Cover' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Maximum Cover').fill('15000');
  await dialog.getByRole('button', { name: 'Flood', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save Cover' }).click();
  await expect(dialog).toBeHidden();
  await signOut(page);

  // Field officer: the claim, from the field.
  await signInAs(page, 'field_officer');
  await go(page, insured);
  await page.getByRole('button', { name: 'Open Claim' }).click();
  dialog = page.getByRole('dialog');
  await dialog.locator('#claim-event').click();
  await page
    .getByRole('option', { name: /^Flood/ })
    .first()
    .click();
  await dialog.getByLabel('Damage Seen (%)').fill('30');
  await dialog
    .getByLabel('What Happened')
    .fill(
      'Water stood on the field for four days; a third of the plants lost.',
    );
  const opened = page.waitForResponse(
    (r) =>
      /\/api\/.*claims$/.test(new URL(r.url()).pathname) &&
      r.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Open Claim' }).click();
  const claim = ((await (await opened).json()) as { data: { id: string } }).data
    .id;
  await expect(
    page.getByText('Claim opened. The insurer is told.'),
  ).toBeVisible();
  await signOut(page);

  // Insurer: review, then approve.
  await signInAs(page, 'insurer');
  await go(page, `/insurance/claims/${claim}`);
  await page.getByRole('button', { name: 'Start Review' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Start Review' })
    .click();
  await page.getByRole('button', { name: 'Approve Claim' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Approved Amount').fill('5000');
  await dialog.getByLabel('Damage Found (%)').fill('30');
  await dialog
    .getByLabel('Findings')
    .fill('Seen on site: flood damage as reported.');
  await dialog.getByRole('button', { name: 'Approve Claim' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Payment Due').first()).toBeVisible();
  await signOut(page);

  // Accounts: the insurer's payment arrived.
  await signInAs(page, 'accounts');
  await go(page, `/insurance/claims/${claim}`);
  await page.getByRole('button', { name: 'Record Insurer’s Payment' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Payment Reference').fill(`INS-${RUN}`);
  await dialog
    .getByRole('button', { name: 'Record Insurer’s Payment' })
    .click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();
});
