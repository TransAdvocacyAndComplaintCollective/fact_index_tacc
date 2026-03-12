import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('*/auth/available', () => {
    return HttpResponse.json({
      available: true,
      providers: [
        {
          name: 'discord',
          displayName: 'Discord',
          available: true,
          url: '/auth/discord',
        },
        {
          name: 'dev',
          displayName: 'Dev',
          available: true,
          url: '/auth/dev',
        },
      ],
    });
  }),
];
