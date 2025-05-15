'use client';

import config from '../config';

/**
 * Generates images based on content from sticky notes and adds them to the Miro board
 * @param {Function} setImageLoading Loading state setter function
 * @param {String} stickyNoteText Text content to generate image from
 * @returns {Promise<void>}
 */
export async function generateImageIdeas(setImageLoading, stickyNoteText) {
  try {
    // Set loading state to true
    if (setImageLoading) setImageLoading(true);
    
    if (!stickyNoteText || !stickyNoteText.trim()) {
      console.error("Empty sticky note content");
      if (setImageLoading) setImageLoading(false);
      return;
    }
    
    console.log("Generating image for content:", stickyNoteText.substring(0, 50) + (stickyNoteText.length > 50 ? "..." : ""));
    
    // Get the current board ID
    const boardId = await getCurrentBoardId();
    console.log("Using current board ID:", boardId);
    
    // Make the POST request to the backend
    const response = await fetch(`${config.apiBaseUrl}/generate-image-ideas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ 
        content: stickyNoteText,
        boardId: boardId  // Send the board ID to the backend
      }), 
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Image generation failed:", response.status, errorText);
      if (setImageLoading) setImageLoading(false);
      return;
    }

    const result = await response.json();
    
    if (result.status === "success") {
      console.log(`${result.images_added} image(s) added to Miro board in ${result.processing_time_seconds || 0}s`);
    } else if (result.status === "no_valid_shapes_found") {
      console.warn("No valid text found to generate images from.");
    } else if (result.error) {
      console.error("API Error:", result.error);
    } else {
      console.warn("Could not generate images. Please try again.");
    }

  } catch (error) {
    console.error("Network error:", error);
  } finally {
    // Reset loading state
    if (setImageLoading) setImageLoading(false);
  }
}

/**
 * Selects sticky notes on the Miro board and generates images based on their content
 * @param {Function} setImageLoading Loading state setter function
 * @returns {Promise<void>}
 */
export async function generateImagesFromSelection(setImageLoading) {
  try {
    // Set loading state to true
    if (setImageLoading) setImageLoading(true);
    
    // Get selection from Miro board
    const selection = await miro.board.getSelection();
    const validItems = selection.filter(item => 
      item.type === 'sticky_note' || 
      item.type === 'shape' || 
      item.type === 'text'
    );
    
    if (validItems.length === 0) {
      console.warn("No sticky notes, shapes, or text selected on the board.");
      if (setImageLoading) setImageLoading(false);
      return;
    }
    
    const itemIds = validItems.map(item => item.id);
    console.log(`Selected ${itemIds.length} items for image generation`);
    
    // Get the current board ID
    const boardId = await getCurrentBoardId();
    console.log("Using current board ID:", boardId);
    
    // Make request to backend
    const response = await fetch(`${config.apiBaseUrl}/generate-image-ideas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ 
        selectedShapeIds: itemIds,
        boardId: boardId  // Send the board ID to the backend
      }),
      credentials: 'include',
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Image generation failed:", response.status, errorText);
      if (setImageLoading) setImageLoading(false);
      return;
    }
    
    const result = await response.json();
    
    if (result.status === "success") {
      console.log(`${result.images_added} image(s) added to Miro board`);
    } else if (result.status === "no_valid_shapes_found") {
      console.warn("No valid text found in the selected items.");
    } else if (result.error) {
      console.error("API Error:", result.error);
    } else {
      console.warn("Could not generate images. Please try again.");
    }
    
  } catch (error) {
    console.error("Error generating images from selection:", error);
  } finally {
    if (setImageLoading) setImageLoading(false);
  }
}

// Add a function to get the current board ID
export async function getCurrentBoardId() {
  try {
    const boardInfo = await miro.board.getInfo();
    return boardInfo.id;
  } catch (error) {
    console.error('Error getting board ID:', error);
    throw error;
  }
} 