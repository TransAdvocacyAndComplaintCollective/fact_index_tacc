import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('*/auth/available', () => {
    return HttpResponse.json({
      providers: [
        {
          name: 'federation-test',
          displayName: 'Federation Test Provider',
          entityId: 'https://federation.test/entity',
          available: true,
          url: 'https://federation.test/login',
          type: 'federation',
        },
      ],
    });
  }),
];
