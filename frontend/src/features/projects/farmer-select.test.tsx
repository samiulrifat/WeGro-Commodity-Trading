// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeServer, renderPage, signedInAs } from '@/test/render';
import { FarmerSelect } from './farmer-select';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const farmer = (i: number) => ({
  id: `f${i}`,
  name: `Farmer Number${i}`,
  district: i === 1 ? null : 'BOGURA',
});

function Harness({ onPick }: { onPick: (v: unknown) => void }) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <>
      <label htmlFor="farmer">Farmer</label>
      <FarmerSelect
        id="farmer"
        value={value}
        onChange={(f) => {
          setValue(f?.id ?? null);
          onPick(f);
        }}
      />
    </>
  );
}

async function render(
  total: number,
  shown = total,
  order: (n: number) => number = (n) => n,
) {
  await signedInAs('operations');
  const sent = fakeServer(({ url }) =>
    url.pathname === '/api/projects/farmers'
      ? {
          body: {
            data: Array.from({ length: shown }, (_, i) => farmer(order(i + 1))),
            meta: { total, page: 1, limit: 100, totalPages: 1 },
          },
        }
      : undefined,
  );
  const onPick = vi.fn();
  await renderPage(<Harness onPick={onPick} />, '/projects/new');
  return { sent, onPick };
}

describe('choosing a project’s farmer', () => {
  it('lists every verified farmer with their district, and picks one', async () => {
    const { onPick } = await render(2, 2, (n) => 3 - n);
    await userEvent.click(screen.getByRole('combobox', { name: 'Farmer' }));
    expect(
      await screen.findByRole('option', { name: 'Farmer Number1' }),
    ).toBeTruthy();
    await userEvent.click(
      screen.getByRole('option', { name: 'Farmer Number2 · Bogura' }),
    );
    expect(onPick).toHaveBeenLastCalledWith({
      id: 'f2',
      name: 'Farmer Number2',
    });
    // In name order, whatever order they came in.
    await userEvent.click(screen.getByRole('combobox', { name: 'Farmer' }));
    expect(
      (await screen.findAllByRole('option')).map((o) => o.textContent),
    ).toEqual(['Farmer Number1', 'Farmer Number2 · Bogura']);
    // No search needed while every farmer fits in the list.
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('narrows as you type', async () => {
    await render(2);
    await userEvent.type(
      screen.getByRole('combobox', { name: 'Farmer' }),
      'Number2',
    );
    expect(
      await screen.findByRole('option', { name: 'Farmer Number2 · Bogura' }),
    ).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Farmer Number1' })).toBeNull();
  });

  it('says when none matches', async () => {
    await render(0);
    await userEvent.click(screen.getByRole('combobox', { name: 'Farmer' }));
    expect(await screen.findByText('No verified farmer matches.')).toBeTruthy();
  });

  it('searches the server when there are more farmers than one list holds', async () => {
    const { sent } = await render(250, 100);
    expect(
      await screen.findByText(
        'Showing the first 100 farmers. Search above to find others.',
      ),
    ).toBeTruthy();
    const box = screen.getByPlaceholderText(
      'Name or mobile number of the farmer',
    );
    await userEvent.type(box, 'Rahima{Enter}');
    await vi.waitFor(() =>
      expect(
        sent.some(
          (s) =>
            s.url.pathname === '/api/projects/farmers' &&
            s.url.searchParams.get('q') === 'Rahima',
        ),
      ).toBe(true),
    );
  });
});
