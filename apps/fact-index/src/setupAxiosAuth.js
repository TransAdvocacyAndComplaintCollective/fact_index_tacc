import axios from "axios";

/**
 * Setup global Axios interceptor to automatically include JWT token from localStorage.
 * 
 * This runs on app startup to ensure all Axios requests include authentication.
 * Token is read from localStorage key "auth_jwt_token".
 * 
 * @see src/context/AuthContext.tsx - Where auth tokens are stored and managed
 */

// Request interceptor: Add JWT token to Authorization header
axios.interceptors.request.use(
  (config) => {
    let token = null;
    try {
      token = localStorage.getItem("auth_jwt_token");
    } catch (error) {
      // localStorage may be unavailable in some environments
      console.warn("[setupAxiosAuth] Unable to read from localStorage:", error);
    }

    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
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
