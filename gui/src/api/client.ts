import axios from "axios";

const TOKEN_KEY = "mcrbot_token";

const client = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor: attach Bearer token from localStorage
client.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handle 401 by clearing token and returning to login
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      // Dispatch a logout event so the app store can react
      window.dispatchEvent(new Event("auth:logout"));
    }
    return Promise.reject(error);
  },
);

/**
 * Extracts a human-readable message from an Axios error response.
 * The backend returns `{ error: string }` on 400/403/503 and `{ error }` on 401.
 */
export function extractApiError(err: unknown, fallback = "Request failed"): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined;
    if (data?.error) return data.error;
    if (err.response?.status) return `${fallback} (${err.response.status})`;
    return "Unable to connect to the server";
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export { TOKEN_KEY };
export default client;
