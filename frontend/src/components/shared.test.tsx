// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toApiError } from '@/api/errors';
import {
  measurementProblems,
  newMeasurement,
} from '@/features/catalog/measurements';
import { store } from '@/store/store';
import { signedInAs } from '@/test/render';
import { LanguageSwitch } from './language-switch';
import { Pager } from './pager';
import { SearchBox } from './search-box';

afterEach(cleanup);

describe('the search box', () => {
  it('inside a form, searches on Enter and with its button, and clears', async () => {
    await signedInAs('admin');
    const onSearch = vi.fn();
    render(
      <SearchBox
        value="old"
        onSearch={onSearch}
        placeholder="Find people"
        inForm
      />,
    );
    const box = screen.getByRole('searchbox', { name: 'Find people' });
    await userEvent.clear(box);
    await userEvent.type(box, ' rahima {Enter}');
    expect(onSearch).toHaveBeenLastCalledWith('rahima');
    await userEvent.type(box, 'x');
    // Other keys do not search.
    expect(onSearch).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(onSearch).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole('button', { name: 'Clear Search' }));
    expect(onSearch).toHaveBeenLastCalledWith(undefined);
    expect((box as HTMLInputElement).value).toBe('');
  });
});

describe('the pager', () => {
  it('goes back a page', async () => {
    await signedInAs('admin');
    const onPage = vi.fn();
    render(<Pager page={3} pages={4} total={80} onPage={onPage} />);
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPage).toHaveBeenCalledWith(2);
  });
});

describe('the language switch', () => {
  it('changes the language only when another is chosen', async () => {
    await signedInAs('admin');
    render(
      <Provider store={store}>
        <LanguageSwitch />
      </Provider>,
    );
    const [english, bangla] = screen.getAllByRole('button');
    await userEvent.click(english!);
    expect(store.getState().language.current).toBe('en');
    await userEvent.click(bangla!);
    expect(store.getState().language.current).toBe('bn');
    const { applyLanguage } = await import('@/i18n');
    store.dispatch({ type: 'language/languageChosen', payload: 'en' });
    await applyLanguage('en');
  });
});

describe('reading failures', () => {
  it('reads a thrown error without a message as a server problem', () => {
    expect(toApiError({ name: 'Error' })).toEqual({
      kind: 'server',
      status: null,
      messages: [''],
    });
  });

  it('flags a maximum it cannot read', () => {
    const m = {
      ...newMeasurement(),
      key: 'h',
      label: 'H',
      labelBn: 'H',
      max: 'x',
    };
    expect([...measurementProblems([m]).get(m.id)!]).toEqual(['max']);
  });
});
