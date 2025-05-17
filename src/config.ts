// src/lib/utils/config.ts

interface Config {
  apiUrl: string;
}

const config: Config = {
  // Default to localhost for development
  apiUrl: import.meta.env.VITE_API_URL || "http://127.0.0.1:8000",

  // Use this line instead when deploying to production
  // apiUrl: "https://www.faultmaven.ai"
};

export default config;
