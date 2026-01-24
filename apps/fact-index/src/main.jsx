import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.scss';
import './setupAxiosAuth';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';
import { nprogress, NavigationProgress } from '@mantine/nprogress';

// Start progress on app load
nprogress.start();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      cacheTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: 0,
      dedupingInterval: 5000,
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <MantineProvider defaultColorScheme="auto">
        <NavigationProgress />
        <ModalsProvider>
          <Notifications position="top-right" autoClose={4000} />
          <App />
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>
  </React.StrictMode>
);

reportWebVitals();

// Complete progress on load
if (document.readyState === 'complete') {
  nprogress.complete();
} else {
  window.addEventListener('load', () => nprogress.complete());
}
