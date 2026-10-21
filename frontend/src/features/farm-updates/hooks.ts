import { useEffect, useMemo, useState } from 'react';
import {
  type OfficerProjectDto,
  useFieldRecordsMyProjectsQuery,
} from '@/api/generated/field-records';
import { useOnline } from '@/app/pwa/online';
import { deviceCache } from '@/lib/device-cache';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { sendDrafts, type SendSummary } from './sender';

const PROJECTS = 'officerProjects';
/** While drafts wait (the ledger busy), try again this often. */
const RETRY_MS = 120_000;

/**
 * The officer's farmers' projects that take updates: from the server when
 * online (and kept on the phone), else the list kept last time.
 */
export function useOfficerProjects(): {
  projects: OfficerProjectDto[];
  loading: boolean;
  /** When the list kept on the phone was saved; null when it is live. */
  savedAt: number | null;
} {
  const me = useAppSelector((s) => s.session.user?.id);
  const online = useOnline();
  const query = useFieldRecordsMyProjectsQuery(undefined, {
    skip: !online || !me,
  });
  const live = query.data?.data;
  useEffect(() => {
    if (live && me) deviceCache.set(PROJECTS, me, live);
  }, [live, me]);
  const kept = useMemo(
    () => (me ? deviceCache.get<OfficerProjectDto[]>(PROJECTS, me) : null),
    [me],
  );
  if (live) return { projects: live, loading: false, savedAt: null };
  return {
    projects: kept?.value ?? [],
    loading: online && query.isLoading && !kept,
    savedAt: kept?.savedAt ?? null,
  };
}

/** Sends the officer's drafts now; what happened, and whether it is going. */
export function useSendNow(): {
  send: () => Promise<SendSummary | null>;
  sending: boolean;
} {
  const me = useAppSelector((s) => s.session.user?.id);
  const dispatch = useAppDispatch();
  const [sending, setSending] = useState(false);
  return {
    sending,
    send: async () => {
      if (!me) return null;
      setSending(true);
      try {
        return await sendDrafts(me, dispatch);
      } finally {
        setSending(false);
      }
    },
  };
}

/**
 * A blob (a photo on the phone) as an address an <img> can show; each
 * mount makes its own and releases it when done.
 */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<{ blob: Blob; url: string } | null>(null);
  useEffect(() => {
    if (!blob) return;
    let made: string | null = null;
    let live = true;
    // Made after the commit, as useApiFile does, and released on cleanup.
    void Promise.resolve().then(() => {
      if (!live) return;
      made = URL.createObjectURL(blob);
      setUrl({ blob, url: made });
    });
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [blob]);
  return blob && url?.blob === blob ? url.url : null;
}

/**
 * Field officers only: sends waiting drafts whenever the app is open with
 * internet: on opening, on reconnecting, and every two minutes.
 */
export function useBackgroundSending(): void {
  const user = useAppSelector((s) => s.session.user);
  const online = useOnline();
  const dispatch = useAppDispatch();
  const officer = user?.role === 'field_officer' ? user.id : null;
  useEffect(() => {
    if (!officer || !online) return;
    const go = () => void sendDrafts(officer, dispatch).catch(() => undefined);
    go();
    const timer = setInterval(go, RETRY_MS);
    return () => clearInterval(timer);
  }, [officer, online, dispatch]);
}
