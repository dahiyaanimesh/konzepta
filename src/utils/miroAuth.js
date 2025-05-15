// This file contains server-compatible Miro authentication utilities
// It does NOT use client-side code

import { MiroApi } from '@mirohq/miro-api';

export function getMiroAuthClient() {
  const clientId = process.env.MIRO_CLIENT_ID || '';
  const clientSecret = process.env.MIRO_CLIENT_SECRET || '';
  const redirectUrl = process.env.MIRO_REDIRECT_URL || 'http://localhost:3000/api/redirect';
  
  // Create a server-side instance of the Miro API client
  const miro = new MiroApi(clientId, clientSecret, redirectUrl);
  
  return { 
    miro, 
    userId: 'default-user-id' // You can implement proper user ID management here
  };
} 