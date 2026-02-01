import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import './setupAxiosAuth';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MantineProvider } from '@mantine/core';
import { AppColorSchemeProvider } from './lib/appColorScheme';
import mantineTheme from './lib/mantineTheme';
import { Notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';
import { nprogress, NavigationProgress } from '@mantine/nprogress';

// Start progress on app load
nprogress.start();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: 0,
    },
  },
});
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Root element not found");
}
const root = ReactDOM.createRoot(rootElement);

function Root() {
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('mantine-color-scheme');
      return (saved as 'light' | 'dark') || 'dark';
    } catch (e) {
      return 'dark';
    }
  });

  const toggleColorScheme = (value?: 'light' | 'dark') => {
    const next = value || (colorScheme === 'dark' ? 'light' : 'dark');
    setColorScheme(next);
    try {
      localStorage.setItem('mantine-color-scheme', next);
    } catch (e) {
      // ignore
    }
  };

  return (
    <AppColorSchemeProvider value={{ colorScheme, toggleColorScheme }}>
      <MantineProvider theme={mantineTheme} forceColorScheme={colorScheme}>
        <React.StrictMode>
          <QueryClientProvider client={queryClient}>
            <NavigationProgress />
            <ModalsProvider>
              <Notifications position="top-right" autoClose={4000} />
              <App />
            </ModalsProvider>
          </QueryClientProvider>
        </React.StrictMode>
      </MantineProvider>
    </AppColorSchemeProvider>
  );
}

root.render(<Root />);

reportWebVitals();

// Complete progress on load
if (document.readyState === 'complete') {
  nprogress.complete();
} else {
  window.addEventListener('load', () => nprogress.complete());
}
