import { expect, go, RUN, signInAs, signOut, test } from './support';

/**
 * A field officer registers a farmer in the field (details as on the NID,
 * checked before saving), then an admin verifies them from their page.
 */
test('a field officer registers a farmer and an admin verifies them', async ({
  page,
  errors,
}) => {
  void errors;
  // Names take letters only: the run's tag spelled in letters.
  const tag = RUN.replace(/\d/g, (d) => 'ABCDEFGHIJ'[Number(d)]!);
  const name = `Rokeya Begum ${tag[0]}${tag.slice(1).toLowerCase()}`;
  const digits = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

  await signInAs(page, 'field_officer');
  await go(page, '/people/new');
  await page.getByLabel('Full Name').fill(name);
  await page.getByLabel('Mobile Number').fill(`0197${digits(7)}`);
  await page
    .getByLabel('NID Number')
    .fill(`${2 + Math.floor(Math.random() * 7)}${digits(9)}`);
  await page.getByLabel('Date of Birth').fill('1988-04-12');
  await page.locator('#register-district').click();
  await page.getByRole('option', { name: 'Bogura' }).click();
  await page.getByLabel('Address').fill('Mokamtola, Shibganj, Bogura');
  await page.getByRole('button', { name: 'Check Details' }).click();
  await expect(
    page.getByText(/Ready to Register|Can Be Registered with Warnings/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Register Farmer' }).click();
  await expect(
    page.getByText(`${name} is registered as Farmer.`),
  ).toBeVisible();
  await expect(
    page.getByText(/assigned to you|completes on its own/),
  ).toBeVisible();
  await page.getByRole('link', { name: 'View Profile' }).click();
  await page.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  const personPath = new URL(page.url()).pathname;
  await signOut(page);

  await signInAs(page, 'admin');
  await go(page, personPath);
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const warnings = dialog.getByLabel('I have reviewed the warnings.');
  if (await warnings.count()) await warnings.check();
  await dialog.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(page.getByText(`${name} is verified.`)).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(
    page.locator('#main').getByRole('button', { name: 'Verify', exact: true }),
  ).toBeHidden();
});
