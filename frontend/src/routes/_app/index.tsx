import { createFileRoute, redirect } from '@tanstack/react-router';
import { homeOf } from '@/app/navigation';

/** "/" is each person's home: the first entry of their menu. */
export const Route = createFileRoute('/_app/')({
  beforeLoad: ({ context: { store } }) => {
    const { user } = store.getState().session;
    if (user) throw redirect({ to: homeOf(user), replace: true });
  },
});
