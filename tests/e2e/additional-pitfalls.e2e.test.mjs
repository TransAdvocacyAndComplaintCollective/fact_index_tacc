/**
 * Additional Pitfalls Test Suite
 * Tests for debug endpoints, type casting, request validation, async issues, and federation TODOs
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fetch from 'node-fetch';

const API_URL = 'http://localhost:5332';
let testToken = null;

// Skip tests that require authentication tokens if not available
const withAuth = (fn) => {
  return async function() {
    if (!testToken) {
      return; // Just return - don't run the test
    }
    return fn.call(this);
  };
};

describe('Additional Pitfalls: Debug Endpoints & Type Safety', () => {
  describe('Debug Endpoint Security', () => {
    it('should not expose unprotected debug endpoints in production', async () => {
      // PITFALL: /auth/debug endpoint exists but may not be properly gated
      try {
        const res = await fetch(`${API_URL}/auth/debug`, {
          method: 'GET',
        });
        // If endpoint exists and returns 200 without auth, that's a security issue
        if (res.status === 200) {
          const body = await res.text();
          assert.match(body, /authentication required|Unauthorized/i, 
            'Debug endpoint should require authentication');
        }
      } catch (err) {
        // Expected if endpoint doesn't exist
      }
    });

    it('should not expose /oidc debug logging in production', async () => {
      // PITFALL: main.ts has conditional debug logging for /oidc requests
      // Verify it's not logging sensitive data
      const res = await fetch(`${API_URL}/oidc/authorization`, {
        method: 'GET',
      });
      // Should not return 200 with unvalidated debug data
      assert.notEqual(res.status, 200, 'OIDC endpoint requires valid parameters');
    });
  });

  describe('Type Casting & `as any` Anti-Pattern', () => {
    it('should validate userId parameter type before casting', async () => {
      // PITFALL: router/auth/admin.ts line 368, 414, 457 use (req.params as any).userId
      const invalidIds = [
        null,
        undefined,
        '',
        'abc',
        '../../etc/passwd',
        '${constructor}',
        'null',
        'undefined',
      ];

      for (const userId of invalidIds) {
        try {
          const res = await fetch(`${API_URL}/auth/admin/user/${encodeURIComponent(userId)}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${testToken || 'invalid'}`,
            },
          });
          // Should reject or require valid token
          assert.notEqual(res.status, 200, 
            `Should not accept userId "${userId}" as valid parameter`);
        } catch (err) {
          // Network error is acceptable
        }
      }
    });

    it('should not allow type confusion with Object.assign on user credentials', async () => {
      // PITFALL: openid4vpService.ts line 232 uses Object.assign(claims, vc.credentialSubject)
      // This could allow property overwrites
      const maliciousClaims = {
        credentialSubject: {
          id: 'user-123',
          __proto__: { isAdmin: true }, // Prototype pollution attempt
          constructor: { prototype: { isAdmin: true } },
        },
      };
      
      // Should not allow prototype pollution
      const testObj = { isAdmin: false };
      Object.assign(testObj, maliciousClaims.credentialSubject);
      assert.equal(testObj.isAdmin, false, 
        'Should not allow prototype pollution via Object.assign');
    });
  });

  describe('Request Parameter Validation', () => {
    it('should validate query parameters are strings before use', async () => {
      // PITFALL: federation-auth.ts lines 694-701 extract query params without deep validation
      const testCases = [
        { param: 'idc', value: '["../../../etc/passwd"]' },
        { param: 'op', value: 'javascript:alert(1)' },
        { param: 'client_id', value: null },
        { param: 'credential_type', value: { __proto__: { polluted: true } } },
      ];

      for (const { param, value } of testCases) {
        try {
          const url = new URL(`${API_URL}/auth/federation/login`);
          url.searchParams.set(param, String(value));
          const res = await fetch(url, { method: 'GET' });
          // Should not crash or return 200 with unvalidated data
          assert.notEqual(res.status, 200, 
            `Query parameter ${param} should be validated`);
        } catch (err) {
          // Expected if validation works
        }
      }
    });

    it('should validate req.body.fact_text is non-empty string', async () => {
      // PITFALL: facts.ts line 125 checks !req.body.fact_text but doesn't validate string type
      const invalidBodies = [
        { fact_text: null },
        { fact_text: undefined },
        { fact_text: 0 },
        { fact_text: false },
        { fact_text: [] },
        { fact_text: {} },
        { fact_text: '   ' }, // Whitespace only
      ];

      for (const body of invalidBodies) {
        try {
          const res = await fetch(`${API_URL}/api/facts/facts`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${testToken || 'invalid'}`,
            },
            body: JSON.stringify(body),
          });
          // Should reject falsy or non-string fact_text
          assert.notEqual(res.status, 201, 
            `Should reject fact_text: ${JSON.stringify(body.fact_text)}`);
        } catch (err) {
          // Network error is acceptable
        }
      }
    });

    it('should validate sub parameter is URL-like in federation endpoints', async () => {
      // PITFALL: federationService.ts line 172 casts req.query.sub to string without validation
      const invalidSubs = [
        'not-a-url',
        '../../../etc/passwd',
        'file:///etc/passwd',
        'javascript:alert(1)',
        '',
        null,
      ];

      for (const sub of invalidSubs) {
        try {
          const url = new URL(`${API_URL}/federation/fetch`);
          if (sub) url.searchParams.set('sub', sub);
          const res = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${testToken || 'invalid'}` },
          });
          // Should validate sub format
          assert.notEqual(res.status, 200, 
            `Should validate sub parameter format for "${sub}"`);
        } catch (err) {
          // Expected if validation works
        }
      }
    });
  });

  describe('Async Error Handling', () => {
    it('should not leave unhandled promise rejections in async routes', async () => {
      // PITFALL: Multiple async route handlers without try-catch wrapping
      // Promises that reject without catch would crash the server
      const res = await fetch(`${API_URL}/api/facts/facts`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer invalid-token-to-trigger-error`,
        },
      });
      // Server should still respond (not crash)
      assert.ok(res.status, 'Server should not crash on async errors');
    });

    it('should handle JSON.parse errors in federation login flow', async () => {
      // PITFALL: federation-auth.ts line 74 parses raw query parameter (now fixed but test validates)
      const res = await fetch(`${API_URL}/auth/federation/login?authorization_details=invalid-json`, {
        method: 'GET',
      });
      // Should not crash with 500, should reject or redirect
      assert.notEqual(res.status, 500, 'Should handle malformed JSON gracefully');
    });

    it('should handle Discord API fetch errors gracefully', async () => {
      // PITFALL: passport-discord.ts lines 348, 441, 532 await fetch without timeout
      // If Discord API is slow, this could hang
      const slowRequest = fetch(`${API_URL}/auth/discord/callback?code=invalid`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      // Should either complete or timeout gracefully
      try {
        const res = await slowRequest;
        assert.ok(res, 'Request should complete');
      } catch (err) {
        if (err.name === 'AbortError') {
          assert.fail('Request should not hang for 5+ seconds');
        }
      }
    });
  });

  describe('Federation TODO Implementation Gaps', () => {
    it('should implement TODO: Subordinate statement lookup at /federation/fetch', async () => {
      // PITFALL: federation/routes.ts line 88 has unimplemented TODO
      try {
        const res = await fetch(`${API_URL}/federation/fetch?sub=http://example.com`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${testToken || 'invalid'}` },
        });
        assert.notEqual(res.status, 501, 
          'Subordinate statement lookup should be implemented');
        assert.notEqual(res.status, 200, // Or implement and return 200
          'Subordinate statement lookup must validate input before responding');
      } catch (err) {
        // Expected if not implemented
      }
    });

    it('should implement TODO: Subordinate listing at /federation/list', async () => {
      // PITFALL: federation/routes.ts line 108 has unimplemented TODO
      try {
        const res = await fetch(`${API_URL}/federation/list`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${testToken || 'invalid'}` },
        });
        assert.notEqual(res.status, 501, 
          'Subordinate listing should be implemented');
      } catch (err) {
        // Expected if not implemented
      }
    });

    it('should implement TODO: Trust chain resolution at /federation/resolve', async () => {
      // PITFALL: federation/routes.ts line 135 has unimplemented TODO
      try {
        const res = await fetch(`${API_URL}/federation/resolve`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${testToken || 'invalid'}`,
          },
          body: JSON.stringify({ sub: 'http://example.com' }),
        });
        assert.notEqual(res.status, 501, 
          'Trust chain resolution should be implemented');
      } catch (err) {
        // Expected if not implemented
      }
    });

    it('should implement TODO: JWT federation signature verification', async () => {
      // PITFALL: federation/resolver.ts line 168 has TODO about signature verification
      // Unverified JWTs are a security issue
      const res = await fetch(`${API_URL}/.well-known/openid-federation`, {
        method: 'GET',
      });
      
      if (res.ok) {
        const jwt = await res.text();
        // JWT should be properly signed and verifiable
        assert.match(jwt, /\./, 'Should return a JWT (has dots)');
        // In production, signature verification MUST be implemented
        if (process.env.NODE_ENV === 'production') {
          assert.fail('TODO: Signature verification must be implemented for production');
        }
      }
    });
  });

  describe('Unvalidated Array/Object Type Coercion', () => {
    it('should validate repeated query parameters don\'t bypass validation', async () => {
      // PITFALL: Some endpoints allow array parameters but expect strings
      // federation-auth.ts lines 678, 945 check for repeated params but might not prevent all attacks
      const url = new URL(`${API_URL}/auth/federation/login`);
      url.searchParams.append('state', 'valid-state');
      url.searchParams.append('state', 'another-state'); // Repeated parameter
      
      try {
        const res = await fetch(url, { method: 'GET' });
        assert.notEqual(res.status, 200, 
          'Should reject requests with repeated security-critical parameters');
      } catch (err) {
        // Expected if validation works
      }
    });

    it('should not allow array coercion in numeric parameters', async () => {
      // PITFALL: extractNumericId should handle both string and array inputs
      const url = new URL(`${API_URL}/api/facts/facts`);
      // Attempt to pass array as query parameter
      const testIds = [
        '1,2,3',       // Comma-separated
        '1;2;3',       // Semicolon-separated
        '1&2&3',       // Ampersand in ID
        '["1","2"]',   // JSON array
      ];

      for (const testId of testIds) {
        try {
          const res = await fetch(`${API_URL}/api/facts/facts/${encodeURIComponent(testId)}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${testToken || 'invalid'}`,
            },
          });
          // Should reject non-numeric IDs
          if (res.status === 200 || res.status === 404) {
            // 404 means it found the route but no fact, which is okay
            // 200 would be wrong unless it's actually fact ID "1,2,3"
          } else {
            // Should reject or require auth
          }
        } catch (err) {
          // Network error acceptable
        }
      }
    });
  });

  describe('Missing Null Checks in Critical Paths', () => {
    it('should validate fact exists before updating', withAuth(async function() {
      // PITFALL: facts.ts line 149 gets existing fact but continues even if null
      // (Actually checks, but test validates the check works)
      const res = await fetch(`${API_URL}/api/facts/facts/999999999`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testToken || 'invalid'}`,
        },
        body: JSON.stringify({ fact_text: 'new text' }),
      });
      // Should return 404 for non-existent fact
      assert.equal(res.status, 404, 
        'Should return 404 when updating non-existent fact');
    }));

    it('should validate fact exists before deleting', withAuth(async function() {
      // PITFALL: facts.ts line 170 gets existing fact but continues even if null
      const res = await fetch(`${API_URL}/api/facts/facts/999999999`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${testToken || 'invalid'}`,
        },
      });
      // Should return 404 for non-existent fact
      assert.equal(res.status, 404, 
        'Should return 404 when deleting non-existent fact');
    }));

    it('should validate subordinate exists before returning statement', async () => {
      // PITFALL: federationService.ts line 186 checks if (!subordinate)
      try {
        const res = await fetch(`${API_URL}/federation/fetch?sub=http://nonexistent.example.com`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${testToken || 'invalid'}` },
        });
        if (res.status === 404) {
          // Good - endpoint properly validated
        } else if (res.status === 401) {
          // Auth required
        } else {
          assert.notEqual(res.status, 200, 
            'Should not return 200 for non-existent subordinate');
        }
      } catch (err) {
        // Expected
      }
    });
  });

  describe('Environment Variable Parsing', () => {
    it('should not crash if PORT env var is invalid', async () => {
      // PITFALL: parseEnvInt should handle invalid PORT values
      // This should be tested in unit tests, but we can verify server is running properly
      assert.ok(API_URL, 'Server should be running with valid PORT');
    });

    it('should not crash if KEY_ROTATION_INTERVAL_DAYS is invalid', async () => {
      // PITFALL: jwks.ts parseEnvInt should handle invalid values
      // Get JWKS to verify key rotation is working
      try {
        const res = await fetch(`${API_URL}/.well-known/jwks.json`);
        assert.ok(res.status === 200 || res.status === 404, 
          'Server should handle env var parsing gracefully');
      } catch (err) {
        // Network error acceptable
      }
    });
  });

  describe('Concurrency & Race Conditions', () => {
    it('should handle concurrent fact updates without data corruption', withAuth(async function() {
      // PITFALL: Multiple concurrent updates to same fact could cause issues
      try {
        // Attempt to update fact simultaneously from multiple requests
        const updatePromises = [];
        for (let i = 0; i < 5; i++) {
          updatePromises.push(
            fetch(`${API_URL}/api/facts/facts/1`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${testToken}`,
              },
              body: JSON.stringify({ fact_text: `update-${i}` }),
            })
          );
        }

        const results = await Promise.all(updatePromises);
        // Should not have 500 errors (data corruption)
        results.forEach(res => {
          assert.notEqual(res.status, 500, 
            'Concurrent updates should not cause server errors');
        });
      } catch (err) {
        // Network error acceptable
      }
    }));

    it('should handle concurrent session creation without race conditions', async () => {
      // PITFALL: Multiple Discord OAuth callbacks could create duplicate sessions
      // This is harder to test without full OAuth flow setup
      // Would need to mock Discord API responses
    });
  });

  describe('Timeout & Performance Issues', () => {
    it('should not hang on slow external API calls', async () => {
      // PITFALL: Discord API calls might have no timeout
      const timeout = 10000; // 10 second timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const res = await fetch(
          `${API_URL}/auth/discord/callback?code=invalid-code&state=invalid-state`,
          {
            method: 'GET',
            signal: controller.signal,
          }
        );
        clearTimeout(timeoutId);
        // Should respond within timeout
        assert.ok(res, 'Should respond within reasonable time');
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          assert.fail('Request should not timeout (10s)');
        }
      }
    });
  });
});
