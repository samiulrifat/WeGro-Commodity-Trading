import { createFileRoute } from '@tanstack/react-router';
import { InboxPage } from '@/features/notifications/inbox-page';

/** Open to everyone signed in: each sees their own. */
export const Route = createFileRoute('/_app/notifications')({
  component: InboxPage,
});
