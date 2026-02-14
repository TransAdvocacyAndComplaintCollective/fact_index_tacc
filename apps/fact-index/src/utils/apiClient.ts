/**
 * Centralized API client using Axios for authenticated requests.
 * 
 * This module provides convenience methods for making API calls with
 * cookie-based authentication. Auth tokens are stored in secure HttpOnly
 * cookies set by the server and automatically included in requests.
 * 
 * See setupAxiosAuth.js for global Axios interceptors that enable credentials.
 * 
 * Note: All API calls use relative URLs. The Express backend handles both:
 * - Development: Vite dev server files via middleware
 * - Production: Static built files + API routes
 * Both serve from the same origin (localhost:5332 or production domain).
 */

import axios, { AxiosError } from 'axios';

/**
 * Handle API response errors consistently
 * @param error - The Axios error
 * @throws Enhanced error with status and message
 */
function handleApiError(error: AxiosError | Error): never {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 0;
    const message = error.response?.data?.message || error.message || 'API request failed';
    throw new Error(`API Error [${status}]: ${message}`);
  }
  throw error;
}

/**
 * Make a GET request with authentication
 * @param url - The endpoint URL (relative, e.g., '/api/users')
 * @returns Parsed JSON response
 */
export async function apiGet<T = unknown>(url: string): Promise<T> {
  try {
    const response = await axios.get<T>(url);
    return response.data;
  } catch (error) {
    handleApiError(error as AxiosError | Error);
  }
}

/**
 * Make a POST request with authentication
 * @param url - The endpoint URL (relative, e.g., '/auth/login')
 * @param data - The request body
 * @returns Parsed JSON response
 */
async function apiPost<T = unknown, D = unknown>(url: string, data?: D): Promise<T> {
  try {
    const response = await axios.post<T>(url, data, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  } catch (error) {
    handleApiError(error as AxiosError | Error);
  }
}

/**
 * Make a PUT request with authentication
 * @param url - The endpoint URL (relative)
 * @param data - The request body
 * @returns Parsed JSON response
 */
async function apiPut<T = unknown, D = unknown>(url: string, data?: D): Promise<T> {
  try {
    const response = await axios.put<T>(url, data, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  } catch (error) {
    handleApiError(error as AxiosError | Error);
  }
}

/**
 * Make a DELETE request with authentication
 * @param url - The endpoint URL (relative)
 * @returns Parsed JSON response
 */
async function apiDelete<T = unknown>(url: string): Promise<T> {
  try {
    const response = await axios.delete<T>(url);
    return response.data;
  } catch (error) {
    handleApiError(error as AxiosError | Error);
  }
}

/**
 * Make a PATCH request with authentication
 * @param url - The endpoint URL (relative)
 * @param data - The request body
 * @returns Parsed JSON response
 */
async function apiPatch<T = unknown, D = unknown>(
  url: string,
  data?: D
): Promise<T> {
  try {
    const response = await axios.patch<T>(url, data, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  } catch (error) {
    handleApiError(error as AxiosError | Error);
  }
}
