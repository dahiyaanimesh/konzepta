'use client';

const config = {
  // API base URL - use environment variable or fallback to default values
  apiBaseUrl: process.env.NEXT_PUBLIC_BACKEND_URL
    ? process.env.NEXT_PUBLIC_BACKEND_URL
    : process.env.NODE_ENV === 'production'
      ? 'https://konzepta.onrender.com'  // Production Render URL
      : 'http://localhost:5050', // Default local URL
};

export default config; 