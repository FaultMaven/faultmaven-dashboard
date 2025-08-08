// src/config.ts

interface Config {
  apiUrl: string;
}

const config: Config = {
  // Production API endpoint - HTTPS required for Chrome Web Store
  apiUrl: import.meta.env.VITE_API_URL || "https://api.faultmaven.ai",
  
  // For development, set VITE_API_URL in .env.local:
  // VITE_API_URL=http://api.faultmaven.local:8000
};

export default config;
