'use client';

import { useState, useEffect } from 'react';
import config from '../config';

const GenerateImageIdeasButton = () => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [generatedImages, setGeneratedImages] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [error, setError] = useState('');

  // Clear error message after 4 seconds
  useEffect(() => {
    if (error) {
      const timeout = setTimeout(() => setError(''), 4000);
      return () => clearTimeout(timeout);
    }
  }, [error]);

  // Add animation styles
  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(styleElement);
    
    return () => {
      if (document.head.contains(styleElement)) {
        document.head.removeChild(styleElement);
      }
    };
  }, []);

  const handleGenerateImageIdeas = async () => {
    setLoading(true);
    setMessage('');
    setError('');
    setGeneratedImages([]);

    try {
      // Initialize Miro API if needed
      const boardInfo = await miro.board.getInfo();
      const currentBoardId = boardInfo.id;
      console.log('Current board ID:', currentBoardId);
      
      const selection = await miro.board.getSelection();
      console.log('Selected items:', selection);
      
      const validItems = selection.filter(item => 
        item.type === 'shape' || 
        item.type === 'sticky_note' || 
        item.type === 'text'
      );
      
      if (validItems.length === 0) {
        setError('Please select shapes or sticky notes on the board.');
        setLoading(false);
        return;
      }
      
      // Calculate average position for placement
      let totalX = 0;
      let totalY = 0;
      let referenceItem = null;
      let validItemsWithPosition = 0;
      
      validItems.forEach(item => {
        console.log('Processing item for position:', item);
        if (item.x !== undefined && item.y !== undefined) {
          totalX += item.x;
          totalY += item.y;
          validItemsWithPosition++;
          
          // Use the first item as reference for geometry/style
          if (!referenceItem) {
            referenceItem = item;
          }
        }
      });
      
      if (validItemsWithPosition === 0) {
        setError('Could not determine position of selected items.');
        setLoading(false);
        return;
      }
      
      const avgX = totalX / validItemsWithPosition;
      const avgY = totalY / validItemsWithPosition;
      
      // Position to the right with an offset of 600px (like in addToMiroBoard)
      const targetX = avgX + 600;
      
      // Prepare the item IDs and positioning data
      const itemIds = validItems.map(item => item.id);
      const positionData = {
        x: targetX,
        y: avgY,
        origin: "center"
      };
      
      // Include size information if available
      const geometryData = {
        width: 600,
        height: 600
      };
      
      if (referenceItem && referenceItem.geometry) {
        if (referenceItem.geometry.width) {
          geometryData.width = referenceItem.geometry.width;
          geometryData.height = referenceItem.geometry.width; // Keep it square
        }
      }
      
      console.log('Target position for new image:', positionData);
      console.log('Using geometry for new image:', geometryData);
      
      // First, try to directly add images to the board
      try {
        const requestData = { 
          selectedShapeIds: itemIds,
          boardId: currentBoardId,
          positionData: positionData,
          geometryData: geometryData
        };
        
        console.log('Sending request to backend:', JSON.stringify(requestData));
        
        const directResponse = await fetch(`${config.apiBaseUrl}/generate-image-ideas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestData),
          credentials: 'include',
        });

        if (directResponse.ok) {
          const directData = await directResponse.json();
          if (directData.status === 'success' && directData.images_added > 0) {
            setMessage(`✅ ${directData.images_added} image(s) directly added to Miro board.`);
            
            // Zoom out to help user see the added images
            try {
              await miro.board.viewport.zoomOut();
            } catch (zoomError) {
              console.error('Error zooming out:', zoomError);
            }
            
            setLoading(false);
            return;
          }
        } else {
          const errorText = await directResponse.text();
          console.error('Direct image addition failed:', directResponse.status, errorText);
          throw new Error(`Backend error: ${directResponse.status}`);
        }
      } catch (directError) {
        console.warn('Direct image addition failed, falling back to preview mode:', directError);
      }

      // If direct addition didn't work, fallback to the preview mode
      const response = await fetch(`${config.apiBaseUrl}/generate-text2image-sketches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          selectedShapeIds: itemIds,
          boardId: currentBoardId,
          positionData: positionData,
          geometryData: geometryData
        }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Backend error:', response.status, errorText);
        throw new Error(`Backend error: ${response.status}`);
      }

      const data = await response.json();

      if (data.status === 'no_valid_shapes_found') {
        setMessage('⚠️ No valid text found in selected items.');
      } else if (data.images && data.images.length > 0) {
        setMessage(`✅ Generated ${data.images.length} image(s).`);
        setGeneratedImages(data.images);
        setSelectedIds(data.images.map(img => img.id)); // Auto-select all images
      } else {
        setMessage('No images were generated. Try with different content.');
      }
    } catch (error) {
      console.error('Image generation error:', error);
      setError(error.message || 'Error occurred during image generation.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleAddSelectedToMiro = async () => {
    if (selectedIds.length === 0) {
      setError('Please select at least one image to add to the board.');
      return;
    }
    
    setLoading(true);
    setMessage('Adding images to Miro board...');
    
    const selected = generatedImages.filter(img => selectedIds.includes(img.id));
    let addedCount = 0;
    let lastAddedImageId = null;
    
    try {
      // Get the viewport information for positioning
      const viewport = await miro.board.viewport.get();
      const centerX = viewport.x + viewport.width / 2;
      const centerY = viewport.y + viewport.height / 2;
      
      for (const image of selected) {
        const dataUri = `data:image/png;base64,${image.base64_image}`;
        
        try {
          // First try to find the original item
          let x = centerX;
          let y = centerY;
          
          try {
            const item = await miro.board.getById(image.id);
            if (item && item.x != null && item.y != null) {
              x = item.x + 400; // Position to the right
              y = item.y;
            }
          } catch (idError) {
            console.warn(`Could not find original item ${image.id}, using viewport center`);
          }
          
          // Create the image on the board
          const createdImage = await miro.board.createImage({
            url: dataUri,
            x,
            y,
            width: 300, // Set a reasonable default width
          });
          
          addedCount++;
          lastAddedImageId = createdImage.id;
          console.log('Added image to board with ID:', createdImage.id);
        } catch (imgError) {
          console.error('Error adding image to Miro board:', imgError);
        }
      }
      
      setMessage(`✅ ${addedCount} image(s) added to Miro board.`);
      
      // If at least one image was added, zoom to it
      if (lastAddedImageId) {
        try {
          // Get the added image from the board
          const addedImage = await miro.board.getById(lastAddedImageId);
          console.log('Found added image:', addedImage);
          
          // Zoom to the image
          await miro.board.viewport.zoomTo(addedImage);
          
          // Select the image
          await miro.board.select({id: lastAddedImageId});
        } catch (zoomError) {
          console.error('Error zooming to added image:', zoomError);
        }
      }
      
      // Clear selections after adding to board
      if (addedCount > 0) {
        setSelectedIds([]);
        setGeneratedImages([]);
      }
    } catch (error) {
      console.error('Failed to add images to board:', error);
      setError('Error adding images to board. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      padding: '24px', 
      fontFamily: 'Segoe UI, Roboto, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }}>
      {error && (
        <div style={{ 
          color: '#b91c1c', 
          backgroundColor: '#fee2e2', 
          padding: '8px 12px', 
          borderRadius: '6px', 
          fontSize: '14px'
        }}>
          {error}
        </div>
      )}
      
      <button
        onClick={handleGenerateImageIdeas}
        style={{ 
          padding: '12px', 
          fontSize: '15px', 
          backgroundColor: '#3b82f6', 
          color: '#fff', 
          fontWeight: '600', 
          border: 'none', 
          borderRadius: '8px', 
          cursor: loading ? 'not-allowed' : 'pointer',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          opacity: loading ? 0.7 : 1,
          transition: 'all 0.2s ease'
        }}
        disabled={loading}
      >
        {loading ? 'Generating...' : 'Generate Image Ideas'}
      </button>

      {loading && (
        <div style={{ 
          textAlign: 'center', 
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid #f3f3f3',
            borderTop: '4px solid #3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <p style={{ margin: 0 }}>🧠 Generating images...</p>
        </div>
      )}

      {message && !loading && (
        <div style={{ 
          padding: '8px 12px', 
          backgroundColor: message.includes('✅') ? '#ecfdf5' : '#f3f4f6',
          borderRadius: '6px', 
          fontSize: '14px',
          color: message.includes('✅') ? '#065f46' : '#374151'
        }}>
          {message}
        </div>
      )}

      {generatedImages.length > 0 && (
        <div style={{ 
          marginTop: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <h4 style={{ 
            margin: '0 0 8px 0', 
            fontSize: '16px', 
            color: '#1f2937'
          }}>
            Select images to add to board:
          </h4>
          
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: '12px',
            maxHeight: '400px',
            overflowY: 'auto',
            padding: '4px'
          }}>
            {generatedImages.map((img) => (
              <div
                key={img.id}
                style={{
                  border: selectedIds.includes(img.id)
                    ? '3px solid #3b82f6'
                    : '1px solid #d1d5db',
                  padding: '6px',
                  borderRadius: '8px',
                  backgroundColor: selectedIds.includes(img.id) ? '#eff6ff' : '#fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  transition: 'all 0.2s ease'
                }}
              >
                <img
                  src={`data:image/png;base64,${img.base64_image}`}
                  alt=""
                  width="180"
                  onClick={() => handleToggleSelect(img.id)}
                  style={{ 
                    cursor: 'pointer', 
                    borderRadius: '6px',
                    display: 'block'
                  }}
                />
              </div>
            ))}
          </div>

          <button
            onClick={handleAddSelectedToMiro}
            style={{ 
              padding: '12px', 
              fontSize: '15px', 
              backgroundColor: selectedIds.length ? '#3b82f6' : '#9ca3af',
              color: '#fff', 
              fontWeight: '600', 
              border: 'none', 
              borderRadius: '8px', 
              cursor: selectedIds.length ? 'pointer' : 'not-allowed',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              opacity: selectedIds.length ? 1 : 0.7,
              marginTop: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
            disabled={selectedIds.length === 0 || loading}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Add {selectedIds.length} image{selectedIds.length !== 1 ? 's' : ''} to Miro Board
          </button>
        </div>
      )}
    </div>
  );
};

export default GenerateImageIdeasButton;