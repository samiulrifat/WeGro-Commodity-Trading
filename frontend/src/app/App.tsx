import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DesignPreview } from './design-preview';

export function App() {
  return (
    <TooltipProvider>
      <DesignPreview />
      <Toaster position="top-center" />
    </TooltipProvider>
  );
}
