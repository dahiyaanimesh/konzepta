import { redirect } from 'next/navigation'; 

// Simplified redirect handler that doesn't rely on Miro API client
export async function GET(request) {
    // Just grab the code and store it in a URL parameter
    const code = request.nextUrl.searchParams.get('code'); 
    
    if (typeof code !== 'string') { 
        redirect('/?error=missing-code'); 
        return; 
    } 
    
    // Just redirect to the home page with the code as a parameter
    // The client-side code can handle the actual token exchange
    redirect(`/?code=${code}`); 
} 
