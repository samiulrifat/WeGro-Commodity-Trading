// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, render, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyLanguage, i18n, initI18n, setUnitWords } from '@/i18n';
import { UnitWords } from '@/i18n/units';
import { useFormat } from '@/i18n/use-format';
import { sessionEnded } from '@/store/session-slice';
import { store } from '@/store/store';
import { fakeServer, signedInAs } from '@/test/render';
import { deviceCache } from './device-cache';
import { drafts } from './drafts';
import {
  formatCompact,
  formatDate,
  formatMonth,
  formatRelative,
  formatTaka,
  formatTime,
} from './format';
import { useDrafts } from './use-drafts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <Provider store={store}>{children}</Provider>
);

describe('formats of what cannot be read', () => {
  it('shows a dash, or the text as it came', () => {
    expect(formatTaka('about ten', 'en')).toBe('about ten');
    expect(formatCompact(Number.POSITIVE_INFINITY, 'en')).toBe('—');
    expect(formatDate('not a day', 'en')).toBe('—');
    expect(formatMonth('not a month', 'en')).toBe('—');
    expect(formatTime('not a time', 'en')).toBe('—');
    expect(formatRelative('never', 'en')).toBe('—');
  });

  it('gives the time of day from the reader’s formats', async () => {
    await initI18n('en');
    const { result } = renderHook(() => useFormat());
    expect(result.current.time('2026-10-17T15:30:00Z')).toBe('9:30 PM');
  });
});

describe('what the device keeps', () => {
  it('takes a garbled entry for none, and forgets only the app’s own at sign-out', () => {
    localStorage.setItem('wegro.cache.list.me', '{broken');
    expect(deviceCache.get('list', 'me')).toBeNull();
    deviceCache.set('list', 'me', [1]);
    localStorage.setItem('other.app', 'keep');
    deviceCache.clearAll();
    expect(deviceCache.get('list', 'me')).toBeNull();
    expect(localStorage.getItem('other.app')).toBe('keep');
  });

  it('hears when another tab changes the drafts, and asks the browser to keep them', async () => {
    const persist = vi.fn(() => Promise.reject(new Error('no')));
    Object.defineProperty(navigator, 'storage', {
      value: { persist },
      configurable: true,
    });
    const heard = vi.fn();
    const stop = drafts.subscribe(heard);
    const saved = await drafts.save({
      id: crypto.randomUUID(),
      ownerId: 'me',
      kind: 'farm-update',
      data: {},
      photos: [],
      rejection: null,
    });
    expect(persist).toHaveBeenCalled();
    heard.mockClear();
    const other = new BroadcastChannel('wegro-drafts');
    other.postMessage('changed');
    await waitFor(() => expect(heard).toHaveBeenCalled());
    other.close();
    stop();
    await drafts.remove(saved.id);
    Reflect.deleteProperty(navigator, 'storage');
  });

  it('lists nobody’s drafts when nobody is signed in', async () => {
    await signedInAs('field_officer');
    store.dispatch(sessionEnded());
    const { result } = renderHook(() => useDrafts('farm-update'), { wrapper });
    expect(result.current).toEqual({ drafts: [], loading: false });
  });
});

describe('the words of units and districts', () => {
  it('words units again only when the catalog’s change', async () => {
    await initI18n('en');
    const emit = vi.spyOn(i18n, 'emit');
    setUnitWords([{ symbol: 'kg', symbolBn: 'কেজি' }]);
    setUnitWords([{ symbol: 'kg', symbolBn: 'কেজি' }]);
    expect(emit).toHaveBeenCalledTimes(1);
    setUnitWords([{ symbol: 'kg', symbolBn: 'কে.জি.' }]);
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('takes the units from the catalog once it is in', async () => {
    await signedInAs('admin');
    fakeServer(({ url }) =>
      url.pathname === '/api/catalog'
        ? {
            body: {
              data: {
                version: '1',
                units: [{ code: 'L', symbol: 'L', symbolBn: 'লি' }],
                produceTypes: [],
                inputTypes: [],
                fieldRecordTypes: [],
                weatherEventTypes: [],
                districts: [],
              },
            },
          }
        : undefined,
    );
    const emit = vi.spyOn(i18n, 'emit');
    render(
      <Provider store={store}>
        <UnitWords />
      </Provider>,
    );
    await waitFor(() =>
      expect(emit).toHaveBeenCalledWith('languageChanged', 'en'),
    );
  });

  it('names a district in a sentence', async () => {
    await initI18n('en');
    expect(i18n.t('{{d, district}}' as never, { d: 'BOGURA' })).toBe('Bogura');
  });

  it('keeps the last language chosen while the first still loads', async () => {
    await initI18n('en');
    i18n.removeResourceBundle('bn', 'translation');
    const first = applyLanguage('bn');
    await applyLanguage('en');
    await first;
    expect(i18n.language).toBe('en');
  });
});
