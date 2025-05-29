'use client'; 

import { getOrCreateAITag } from '../utils/miroUtils';

async function addSticky() {
    try {
        // Get or create the "AI" tag
        const aiTag = await getOrCreateAITag();

        // Create the sticky note with the AI tag
        const stickyNote = await miro.board.createStickyNote({
            content: 'Hello, World!',
            tagIds: aiTag ? [aiTag.id] : [], // Add the AI tag if it was created successfully
        }); 

        // Sync the sticky note to make the tag visible
        if (aiTag) {
            await stickyNote.sync();
        }

        await miro.board.viewport.zoomTo(stickyNote); 
    } catch (err) {
        console.error('Error adding sticky to board:', err);
    }
} 

export const SDKUsageDemo = () => {
    return ( <div> 
      <h3>SDK Usage Demo</h3> 
      <p className="p-small">SDK doesnt need to be authenticated.</p> 
      <p> 
        Apps that use the SDK should run inside a Miro board. During
        development, you can open this app inside a{' '} 
        <a href="https://developers.miro.com/docs/build-your-first-hello-world-app#step-2-try-out-your-app-in-miro"> 
          Miro board
        </a> 
        .
      </p> 
      <button  type="button"  onClick={addSticky}  className="button button-primary" > 
        Add a sticky
      </button> 
    </div> ); 
}; 
