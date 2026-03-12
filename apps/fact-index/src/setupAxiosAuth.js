import axios from "axios";

/**
 * Setup global Axios interceptor for cookie-based authentication.
 * 
 * Auth tokens are now stored in secure HttpOnly cookies set by the server.
 * No manual token management needed - the browser automatically includes cookies
 * in cross-origin requests when credentials: 'include' is used.
 * 
 * This interceptor configures Axios to send credentials with all requests.
 */

// Request interceptor: Enable credentials for cookie-based auth
axios.interceptors.request.use(
  (config) => {
    // Enable sending cookies with requests
    config.withCredentials = true;
    return config;
  },
  (error) => {
    console.error("[setupAxiosAuth] Request interceptor error:", error);
    return Promise.reject(error);
  }
);

// Response interceptor: Handle 401 Unauthorized responses
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    // Log 401 errors for debugging, but don't expose sensitive info
    if (error.response?.status === 401) {
      console.warn("[setupAxiosAuth] Received 401 Unauthorized. User may need to login.");
      // Error will propagate to the component level for user feedback
    }
    return Promise.reject(error);
  }
);
