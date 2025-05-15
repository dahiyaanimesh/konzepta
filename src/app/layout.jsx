import React from 'react'; 
import Script from 'next/script'; 
import { MiroSDKInit } from '../components/SDKInit'; 


export default function RootLayout({ children }) {
  return (
    <html> 
      <body> 
        <Script 
          src="https://miro.com/app/static/sdk/v2/miro.js" 
          strategy="beforeInteractive" 
        /> 
        <MiroSDKInit /> 
        <div id="root" style={{ padding: '20px' }}>
          {children}
        </div> 
      </body> 
    </html>
  ); 
}
