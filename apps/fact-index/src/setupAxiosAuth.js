import axios from "axios";
import { getAuthHeaders } from "./context/AuthContext";

axios.interceptors.request.use((config) => {
  const existing = config?.headers ?? {};
  config.headers = getAuthHeaders({ ...existing });
  return config;
});
