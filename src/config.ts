// src/config.ts

interface Config {
  apiUrl: string;
}

const config: Config = {
  // Development default; override via VITE_API_URL for other environments
  apiUrl: import.meta.env.VITE_API_URL || "http://127.0.0.1:8000",
};

export default config;
