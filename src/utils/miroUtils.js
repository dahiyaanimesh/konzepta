'use client';

import config from '../config';

/* -----------------  internal helpers  ----------------- */

/**
 * Given an array of Miro items, return a good placement and geometry
 *   – position 400 px to the right of the items' centre
 *   – geometry copied from the first item (square)
 */
async function calculatePlacement(items) {
  if (!items || items.length === 0) return null;

  if (items.length === 1) {
    const baseItem = items[0];
    let x = baseItem.x + 400;
    let y = baseItem.y;
    let width = baseItem?.geometry?.width || 600;
    let height = width;

    // If the sticky is inside a frame, keep the image inside the same frame
    if (baseItem.parentId) {
      const parent = await miro.board.getById(baseItem.parentId);
      if (parent && parent.type === 'frame') {
        const frameRight = parent.x + parent.width / 2;
        const imageHalfWidth = width / 2;
        // The image's center x must be <= frameRight - imageHalfWidth
        x = Math.min(x, frameRight - imageHalfWidth);
        // The image's center x must be >= frameLeft + imageHalfWidth
        const frameLeft = parent.x - parent.width / 2;
        x = Math.max(x, frameLeft + imageHalfWidth);
        // Clamp y to stay within the frame vertically
        const frameTop = parent.y - parent.height / 2;
        const frameBottom = parent.y + parent.height / 2;
        y = Math.max(y, frameTop + imageHalfWidth);
        y = Math.min(y, frameBottom - imageHalfWidth);
      } // else: parent is table or something else, do not clamp
    }

    return {
      positionData: { x, y, origin: 'center' },
      geometryData: { width, height }
    };
  } else {
    // Multiple selection: use average
    const avgX = items.reduce((sum, i) => sum + (i.x ?? 0), 0) / items.length;
    const avgY = items.reduce((sum, i) => sum + (i.y ?? 0), 0) / items.length;
    let width = 600;
    if (items[0]?.geometry?.width) {
      width = items[0].geometry.width;
    }
    return {
      positionData: {
        x: avgX + 400,
        y: avgY,
        origin: 'center'
      },
      geometryData: { width, height: width }
    };
  }
}

/**
 * Fallback placement – centre of the current viewport
 */
async function defaultPlacement() {
  const viewport = await miro.board.viewport.get();
  return {
    positionData: {
      x: viewport.x + viewport.width / 2,
      y: viewport.y + viewport.height / 2,
      origin: 'center'
    },
    geometryData: { width: 600, height: 600 }
  };
}

/* -----------------  public helpers  ----------------- */

/**
 * Helper function to create or get the "AI" tag
 */
export async function getOrCreateAITag() {
  try {
    // First, try to find if an "AI" tag already exists on the board
    const existingTags = await miro.board.get({ type: 'tag' });
    let aiTag = existingTags.find(tag => tag.title === 'AI');
    
    // If no "AI" tag exists, create one
    if (!aiTag) {
      aiTag = await miro.board.createTag({
        title: 'AI',
        color: 'blue', // You can change this color to any supported color
      });
    }
    
    return aiTag;
  } catch (error) {
    console.error('Error creating/finding AI tag:', error);
    return null;
  }
}

export async function getCurrentBoardId() {
  const boardInfo = await miro.board.getInfo();
  return boardInfo.id;
}

/**
 * 1⃣  Generate an image from free‑form text (`stickyNoteText`)
 *      – If the user *also* has a selection we honour that placement.
 *      – Otherwise we centre in the viewport.
 */
export async function generateImageIdeas(setImageLoading, stickyNoteText, prompt) {
  if (!stickyNoteText?.trim()) {
    console.error('Empty sticky‑note content');
    return;
  }

  try {
    setImageLoading?.(true);

    let placement = null;
    try {
      const selection = await miro.board.getSelection();
      const valid = selection.filter(i =>
        ['sticky_note', 'shape', 'text'].includes(i.type)
      );
      placement = await calculatePlacement(valid);
    } catch (_) {}

    if (!placement) placement = await defaultPlacement();

    const boardId = await getCurrentBoardId();

    const payload = {
      content: stickyNoteText,
      boardId,
      positionData: placement.positionData,
      geometryData: placement.geometryData,
      prompt: prompt
    };

    const res = await fetch(`${config.apiBaseUrl}/generate-image-ideas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include'
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Unknown error');

    // 🔁 UPDATED: Now explicitly place the image using our frontend logic
    if (result.status === 'success' && Array.isArray(result.image_urls)) {
      for (const imageUrl of result.image_urls) {
        await createImageOnBoard(imageUrl, placement.positionData, placement.geometryData);
      }
    } else {
      console.log(`${result.images_added} image(s) added to Miro board in ${result.processing_time_seconds || 0}s`);
    }
  } catch (err) {
    console.error('Image‑gen error:', err);
  } finally {
    setImageLoading?.(false);
  }
}

/**
 * 2⃣  Generate images **from a current selection** (sticky / shape / text).
 *     – We compute placement relative to that selection.
 */
export async function generateImagesFromSelection(setImageLoading, prompt) {
  try {
    setImageLoading?.(true);

    const selection = await miro.board.getSelection();
    const validItems = selection.filter(i =>
      ['sticky_note', 'shape', 'text'].includes(i.type)
    );
    if (validItems.length === 0) {
      console.warn('No valid items selected');
      return;
    }

    const itemIds = validItems.map(i => i.id);
    const placement = await calculatePlacement(validItems);
    const boardId = await getCurrentBoardId();

    const payload = {
      selectedShapeIds: itemIds,
      boardId,
      positionData: placement.positionData,
      geometryData: placement.geometryData,
      prompt: prompt
    };

    const res = await fetch(`${config.apiBaseUrl}/generate-image-ideas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include'
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Unknown error');

    // 🔁 UPDATED: use frontend positioning for placing images
    if (result.status === 'success' && Array.isArray(result.image_urls)) {
      for (const imageUrl of result.image_urls) {
        await createImageOnBoard(imageUrl, placement.positionData, placement.geometryData);
      }
    } else {
      console.log(`${result.images_added} image(s) added to Miro board`);
    }
  } catch (err) {
    console.error('Image‑gen selection error:', err);
  } finally {
    setImageLoading?.(false);
  }
}

export async function createImageOnBoard(url, positionData, geometryData) {
  const userInfo = await miro.board.getUserInfo();
  const image = await miro.board.createImage({
    url,
    x: positionData.x,
    y: positionData.y,
    origin: positionData.origin ?? 'center',
    height: geometryData.height,
    title: `Generated by ${userInfo.name}`
  });

  // Add metadata to indicate this image was AI-generated
  try {
    await image.setMetadata('aiGenerated', {
      source: 'AI Ideation Assistant',
      generatedAt: new Date().toISOString(),
      generatedBy: userInfo.name
    });
  } catch (metadataError) {
    console.error('Error setting AI metadata on image:', metadataError);
  }

  return image;
}