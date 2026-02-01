/**
 * Centralized API client using Axios for authenticated requests.
 * 
 * This module provides convenience methods for making API calls with
 * automatic JWT authentication headers from localStorage.
 * 
 * Token handling:
 * - Reads token from localStorage key: "auth_jwt_token"
 * - Automatically injected into Authorization header
 * - See setupAxiosAuth.js for global Axios interceptors
 */

import axios, { AxiosError, AxiosResponse } from 'axios';
import { getAuthToken } from '../context/useAuth';

/**
 * Get authorization headers with JWT token
 * @returns Headers object with Authorization header if token exists
 */
function getAuthorizationHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

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
 * @param url - The endpoint URL
 * @returns Parsed JSON response
 */
export async function apiGet<T = unknown>(url: string): Promise<T> {
  try {
    const response = await axios.get<T>(url, {
      headers: getAuthorizationHeaders(),
    });
    return response.data;
  } catch (error) {
    handleApiError(error as AxiosError | Error);
  }
}

/**
 * Make a POST request with authentication
 * @param url - The endpoint URL
 * @param data - The request body
 * @returns Parsed JSON response
 */
async function apiPost<T = unknown, D = unknown>(url: string, data?: D): Promise<T> {
  try {
    const response = await axios.post<T>(url, data, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthorizationHeaders(),
      },
    });
    return response.data;
  } catch (error) {
    handleApiError(error as AxiosError | Error);
  }
}

/**
 * Make a PUT request with authentication
 * @param url - The endpoint URL
 * @param data - The request body
 * @returns Parsed JSON response
 */
async function apiPut<T = unknown, D = unknown>(url: string, data?: D): Promise<T> {
  try {
    const response = await axios.put<T>(url, data, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthorizationHeaders(),
      },
    });
    return response.data;
  } catch (error) {
    handleApiError(error as AxiosError | Error);
  }
}

/**
 * Make a DELETE request with authentication
 * @param url - The endpoint URL
 * @returns Parsed JSON response
 */
async function apiDelete<T = unknown>(url: string): Promise<T> {
  try {
    const response = await axios.delete<T>(url, {
      headers: getAuthorizationHeaders(),
    });
    return response.data;
  } catch (error) {
    handleApiError(error as AxiosError | Error);
  }
}

/**
 * Make a PATCH request with authentication
 * @param url - The endpoint URL
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
        ...getAuthorizationHeaders(),
      },
    });
    return response.data;
  } catch (error) {
    handleApiError(error as AxiosError | Error);
  }
}
