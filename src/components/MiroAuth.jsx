'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function MiroAuth() {
  const searchParams = useSearchParams();
  
  useEffect(() => {
    const handleMiroAuth = async () => {
      const code = searchParams.get('code');
      
      if (code) {
        console.log('Authentication code detected:', code);
        
        try {
          // Handle the authentication on the client side
          // This requires the Miro SDK to be initialized first
          if (typeof miro !== 'undefined' && miro.board) {
            // You can use your own function to handle the token exchange
            // For now, we'll just log the success
            console.log('Miro SDK detected, exchanging code for token');
            // Here you would typically call a function to exchange the code for a token
            
            // Clear the code from the URL to prevent repeated auth attempts
            const newUrl = window.location.pathname;
            window.history.pushState({}, '', newUrl);
          }
        } catch (error) {
          console.error('Error handling Miro authentication:', error);
        }
      }
    };
    
    handleMiroAuth();
  }, [searchParams]);
  
  // This component doesn't render anything visible
  return null;
} 