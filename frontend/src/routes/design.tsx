import { createFileRoute, notFound } from '@tanstack/react-router';
import { DesignPreview } from '@/app/design-preview';

/**
 * The design system on one page, for development only: production builds
 * answer "not found" here and leave the page out entirely.
 */
export const Route = createFileRoute('/design')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: import.meta.env.DEV ? DesignPreview : () => null,
});
