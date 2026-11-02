// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { project } from '@/test/fixtures';
import {
  fakeServer,
  recordForms,
  type Reply,
  renderPage,
  signedInAs,
  type Sent,
} from '@/test/render';
import { ProjectFormPage } from './project-form';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const catalog: Reply = {
  body: {
    data: {
      produceTypes: [
        { code: 'MAIZE', name: 'Maize', nameBn: 'ভুট্টা' },
        { code: 'JUTE', name: 'Jute', nameBn: 'পাট' },
      ],
      units: [],
      inputTypes: [],
      fieldRecordTypes: [],
      weatherEventTypes: [],
    },
  },
};
const farmers: Reply = {
  body: {
    data: [{ id: 'f2', fullName: 'Karim Mia', district: 'BOGURA' }],
    meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
  },
};

async function form(
  id?: string,
  over: { write?: (s: Sent) => Reply; project?: () => Reply } = {},
) {
  await signedInAs('admin');
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:cover'),
      revokeObjectURL: vi.fn(),
    }),
  );
  const sent = fakeServer((s) => {
    if (s.method !== 'GET')
      return (
        over.write?.(s) ?? {
          status: s.method === 'POST' ? 201 : 200,
          body: { data: project({ id: 'p7' }) },
        }
      );
    if (s.url.pathname === '/api/catalog') return catalog;
    if (s.url.pathname === '/api/participants') return farmers;
    if (s.url.pathname === '/api/projects/p1')
      return (
        over.project?.() ?? {
          body: {
            data: project({
              stage: 'draft',
              chainState: 'local',
              plannedStartDate: '2026-12-01',
            }),
          },
        }
      );
    return undefined;
  });
  const view = await renderPage(
    <ProjectFormPage id={id} />,
    id ? `/projects/${id}/edit` : '/projects/new',
  );
  return { sent, ...view };
}

const pick = async (label: string, option: string) => {
  await userEvent.click(screen.getByRole('combobox', { name: label }));
  await userEvent.click(await screen.findByRole('option', { name: option }));
};
// Pasted, not typed: each key would re-render this long form, and typed
// key by key the first test takes over 7 s (more on a busy machine).
const fill = async (label: string, text: string) => {
  const box = screen.getByLabelText(label);
  await userEvent.clear(box);
  await userEvent.click(box);
  await userEvent.paste(text);
};

describe('the project form', () => {
  it('names everything missing, then creates the draft with its cover and opens it', async () => {
    const forms = recordForms();
    const { sent, router } = await form();
    expect(screen.getByRole('heading', { name: 'New Project' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    for (const message of [
      'Enter a title of at least 3 characters.',
      'Choose the crop.',
      'Choose the district.',
      'Enter the upazila and village.',
      'Choose the farmer.',
      'Choose the term.',
      'Enter the duration in whole months.',
      'Enter the funding target in taka.',
      'Enter the unit price in taka.',
      'Enter a percent, such as 8.',
      'Enter a percent, such as 12.',
    ])
      expect(screen.getByText(message)).toBeTruthy();
    expect(sent.some((s) => s.method === 'POST')).toBe(false);

    await fill('Title', ' Jute on the char ');
    await fill('Description', ' Grown by the river. ');
    await pick('Crop', 'Jute');
    await pick('District', 'Bogura');
    await fill('Upazila and Village', 'Sariakandi');
    await userEvent.click(
      await screen.findByRole('button', { name: /Karim Mia/ }),
    );
    await fill('Funding Target', '100000');
    await fill('Unit Price', '20000');
    expect(screen.getByText('5 units')).toBeTruthy();
    await fill('Expected Return, Low (%)', '8');
    await fill('Expected Return, High (%)', '12.5');
    await pick('Term', 'Short Term');
    await fill('Duration (Months)', '5');
    await fill('Payout Every (Months)', '0');
    await fill('Planned Start', '2026-12-01');
    await userEvent.click(screen.getByRole('switch', { name: /Insured/ }));
    await userEvent.upload(
      screen.getByLabelText('Cover Photo'),
      new File(['jpg'], 'field.jpg', { type: 'image/jpeg' }),
    );
    expect(document.querySelector('img[src="blob:cover"]')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/projects/p7'),
    );
    const created = sent.find(
      (s) => s.method === 'POST' && s.url.pathname === '/api/projects',
    )!;
    expect(created.body).toEqual({
      title: 'Jute on the char',
      description: 'Grown by the river.',
      produceCode: 'JUTE',
      districtCode: 'BOGURA',
      location: 'Sariakandi',
      farmerId: 'f2',
      durationType: 'short_term',
      durationMonths: 5,
      payoutIntervalMonths: 0,
      fundingTarget: '100000',
      slotPrice: '20000',
      farmerBps: 4000,
      investorBps: 4000,
      wegroBps: 2000,
      insured: true,
      estimatedReturnMinBps: 800,
      estimatedReturnMaxBps: 1250,
      plannedStartDate: '2026-12-01',
    });
    expect(sent.some((s) => s.url.pathname === '/api/projects/p7/cover')).toBe(
      true,
    );
    expect(forms.at(-1)).toEqual([['file', 'field.jpg']]);
  });

  it('refuses shares and months it cannot read', async () => {
    await form();
    await fill('Investors', '40.123');
    await fill('Payout Every (Months)', '1.5');
    await fill('Expected Return, High (%)', '101');
    await userEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    expect(
      screen.getByText('Enter each share as a percent, such as 40.'),
    ).toBeTruthy();
    expect(
      screen.getByText('Enter a whole number of months, or 0.'),
    ).toBeTruthy();
    expect(screen.getByText('Enter a percent, such as 12.')).toBeTruthy();
  });

  it('changes a draft, keeping its farmer unless changed, and goes back to it', async () => {
    const { sent, router } = await form('p1');
    expect(
      await screen.findByRole('heading', { name: 'Edit Draft' }),
    ).toBeTruthy();
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(
      project().title,
    );
    expect(
      (screen.getByLabelText('Funding Target') as HTMLInputElement).value,
    ).toBe('100000');
    expect(
      (screen.getByLabelText('Expected Return, Low (%)') as HTMLInputElement)
        .value,
    ).toBe('7.5');
    expect(screen.getByText('Rahim Uddin')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: project().title }).getAttribute('href'),
    ).toBe('/projects/p1');

    await userEvent.click(
      screen.getByRole('button', { name: 'Change Farmer' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Karim Mia/ }),
    );
    await fill('Title', 'Maize, second season');
    await userEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/projects/p7'),
    );
    const patched = sent.find((s) => s.method === 'PATCH')!;
    expect(patched.url.pathname).toBe('/api/projects/p1');
    expect(patched.body).toMatchObject({
      title: 'Maize, second season',
      farmerId: 'f2',
      fundingTarget: '100000',
      plannedStartDate: '2026-12-01',
    });
    expect(patched.body).not.toHaveProperty('description');
  });

  it('keeps the form with the reason when the server refuses it', async () => {
    await form('p1', {
      write: () => ({
        status: 422,
        body: {
          statusCode: 422,
          code: 'PROJECT_TERMS_INVALID',
          message: 'Funding target must be a whole number of slots',
        },
      }),
    });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Save Draft' }),
    );
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Edit Draft' })).toBeTruthy();
  });

  it('says why a draft cannot be opened, and tries again', async () => {
    let calls = 0;
    await form('p1', {
      project: () =>
        ++calls > 1
          ? { body: { data: project({ stage: 'draft', chainState: 'local' }) } }
          : { status: 500, body: { statusCode: 500, code: 'X', message: 'x' } },
    });
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Edit Draft' }),
    ).toBeTruthy();
  });

  it('takes the farmer’s and WeGro’s shares as typed', async () => {
    await form();
    await fill('Farmer', '45');
    await fill('WeGro', '15');
    expect((screen.getByLabelText('Farmer') as HTMLInputElement).value).toBe(
      '45',
    );
    expect((screen.getByLabelText('WeGro') as HTMLInputElement).value).toBe(
      '15',
    );
  });
});
