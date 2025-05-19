'use client';

import config from '../config';

//* -----------------  internal helpers  ----------------- */

function calculatePlacement(items) {
  if (!items || items.length === 0) return null;

  const avgX = items.reduce((sum, i) => sum + (i.x ?? 0), 0) / items.length;
  const avgY = items.reduce((sum, i) => sum + (i.y ?? 0), 0) / items.length;

  const positionData = {
    x: avgX + 400,
    y: avgY,
    origin: 'center'
  };

  let width = 600;
  if (items[0]?.geometry?.width) {
    width = items[0].geometry.width;
  }
  const geometryData = { width, height: width };

  return { positionData, geometryData };
}

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

export async function getCurrentBoardId() {
  const boardInfo = await miro.board.getInfo();
  return boardInfo.id;
}

export async function generateImageIdeas(setImageLoading, stickyNoteText) {
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
      placement = calculatePlacement(valid);
    } catch (err) {
      console.debug('Selection fallback:', err);
    }

    if (!placement) placement = await defaultPlacement();

    const boardId = await getCurrentBoardId();

    const payload = {
      content: stickyNoteText,
      boardId,
      positionData: placement.positionData,
      geometryData: placement.geometryData
    };

    const res = await fetch(`${config.apiBaseUrl}/generate-image-ideas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include'
    });

    const result = await res.json();
    if (!res.ok || result.status !== 'success') {
      console.warn(result.error || 'Image generation failed');
    } else {
      console.info('Image generation triggered; backend will place images directly');
    }
  } catch (err) {
    console.error('Image-gen error:', err);
  } finally {
    setImageLoading?.(false);
  }
}

export async function generateImagesFromSelection(setImageLoading) {
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
    const { positionData, geometryData } = calculatePlacement(validItems);
    const boardId = await getCurrentBoardId();

    const payload = {
      selectedShapeIds: itemIds,
      boardId,
      positionData,
      geometryData
    };

    const res = await fetch(`${config.apiBaseUrl}/generate-image-ideas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include'
    });

    const result = await res.json();
    if (!res.ok || result.status !== 'success') {
      console.warn(result.error || 'Image generation failed');
    } else {
      console.info('Image generation triggered for selection');
    }
  } catch (err) {
    console.error('Image-gen selection error:', err);
  } finally {
    setImageLoading?.(false);
  }
}

export async function createImageOnBoard(url, positionData, geometryData) {
  await miro.board.createImage({
    url,
    x: positionData.x,
    y: positionData.y,
    origin: positionData.origin ?? 'center',
    width: geometryData.width,
    height: geometryData.height
  });
}