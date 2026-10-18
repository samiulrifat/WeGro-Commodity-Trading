import { useEffect, useState } from 'react';
import { useAppSelector } from '@/store/hooks';
import { type Draft, type DraftKind, drafts } from './drafts';

/** The signed-in person's drafts of one kind, kept current. */
export function useDrafts<T>(kind: DraftKind): {
  drafts: Draft<T>[];
  loading: boolean;
} {
  const ownerId = useAppSelector((s) => s.session.user?.id);
  const [state, setState] = useState<{ drafts: Draft<T>[]; loading: boolean }>({
    drafts: [],
    loading: true,
  });
  useEffect(() => {
    if (!ownerId) return;
    let live = true;
    const load = () =>
      void drafts
        .list<T>(ownerId, kind)
        .then((list) => live && setState({ drafts: list, loading: false }));
    load();
    const stop = drafts.subscribe(load);
    return () => {
      live = false;
      stop();
    };
  }, [ownerId, kind]);
  return ownerId ? state : { drafts: [], loading: false };
}
