import { RouterProvider } from '@tanstack/react-router';
import { Provider } from 'react-redux';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { store } from '@/store/store';
import { UpdatePrompt } from './pwa/update-prompt';
import { router } from './router';

export function App() {
  return (
    <Provider store={store}>
      <TooltipProvider>
        <RouterProvider router={router} />
        <Toaster position="top-center" />
        <UpdatePrompt />
      </TooltipProvider>
    </Provider>
  );
}
