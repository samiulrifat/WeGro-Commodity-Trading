import { Provider } from 'react-redux';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { store } from '@/store/store';
import { DesignPreview } from './design-preview';

export function App() {
  return (
    <Provider store={store}>
      <TooltipProvider>
        <DesignPreview />
        <Toaster position="top-center" />
      </TooltipProvider>
    </Provider>
  );
}
