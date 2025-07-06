// src/lib/utils/config.ts

interface Config {
  apiUrl: string;
}

const config: Config = {
  // Production API endpoint - HTTPS required for Chrome Web Store
  apiUrl: import.meta.env.VITE_API_URL || "https://api.faultmaven.ai",

  // Development override (only for local development)
  // apiUrl: "http://127.0.0.1:8000"
};

export default config;
