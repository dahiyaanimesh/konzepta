'use client';

import React, { useState, useEffect } from 'react';
import { generateImageIdeas, generateImagesFromSelection, getCurrentBoardId } from '../utils/miroUtils';
import config from '../config';

export default function GenerateIdeasButton() {
  const [allStickyNotes, setAllStickyNotes] = useState([]);
  const [selectedStickyIds, setSelectedStickyIds] = useState([]);
  const [showAllChips, setShowAllChips] = useState(false);

  const [stickyNoteText, setStickyNoteText] = useState('');
  const [prompt, setPrompt] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [warningMessage, setWarningMessage] = useState('');

  useEffect(() => {
    if (warningMessage) {
      const timeout = setTimeout(() => setWarningMessage(''), 4000);
      return () => clearTimeout(timeout);
    }
  }, [warningMessage]);

  // Remove all the drag and drop code and use a button-only approach
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
      document.head.removeChild(styleElement);
    };
  }, []);

  // Just initialize Miro API
  useEffect(() => {
    async function initializeMiroAPI() {
      try {
        await miro.board.getInfo();
        console.log('Miro API initialized successfully');
      } catch (error) {
        console.error('Failed to initialize Miro API:', error);
      }
    }
    
    initializeMiroAPI();
  }, []);

  const stripHtml = (html) => {
    const temp = document.createElement("div");
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
  };

  const extractContent = (note) => {
    const raw = note.fields?.plainText || note.content || note.data?.content || note.title || '';
    return stripHtml(raw);
  };

  const highlightStickiesInMiro = async (ids) => {
    try {
      const items = await miro.board.get({ type: 'sticky_note' });
      const selectedItems = items.filter(item => ids.includes(item.id));
      console.log('Highlighting stickies:', selectedItems);
      await miro.board.select(selectedItems);
    } catch (error) {
      console.error('Failed to highlight stickies:', error);
    }
  };

  const handleLoadStickyNotes = async () => {
    await miro.board.getInfo();
    const stickies = await miro.board.get({ type: 'sticky_note' });
    console.log('All stickies:', stickies);

    const recentStickies = stickies
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10);

    console.log('Recent 10 stickies:', recentStickies);

    setAllStickyNotes(recentStickies);

    const allIds = recentStickies.map(note => note.id);
    setSelectedStickyIds(allIds);

    const combinedText = recentStickies.map(n => extractContent(n)).join('\n\n');
    setStickyNoteText(combinedText);

    await highlightStickiesInMiro(allIds);
  };

  const handleLoadSelectedStickyNotes = async () => {
    await miro.board.getInfo();
    const selection = await miro.board.getSelection();
    const selectedStickies = selection.filter(item => item.type === 'sticky_note');
    console.log('Selected stickies:', selectedStickies);

    if (selectedStickies.length === 0) {
      setWarningMessage("Please select at least one sticky note on the board!");
      return;
    }

    setAllStickyNotes(selectedStickies);
    setSelectedStickyIds(selectedStickies.map(note => note.id));

    const combinedText = selectedStickies.map(n => extractContent(n)).join('\n\n');
    setStickyNoteText(combinedText);

    highlightStickiesInMiro(selectedStickies.map(note => note.id));
  };

  const updateCombinedText = (updatedIds) => {
    const combinedText = allStickyNotes
      .filter(n => updatedIds.includes(n.id))
      .map(n => extractContent(n))
      .join('\n\n');
    setStickyNoteText(combinedText);
  };

  const handleStickySelect = async (note) => {
    const isAlreadySelected = selectedStickyIds.includes(note.id);
    let updatedIds;
    if (isAlreadySelected) {
      updatedIds = selectedStickyIds.filter(id => id !== note.id);
    } else {
      updatedIds = [...selectedStickyIds, note.id];
    }
    console.log('Updated selected IDs:', updatedIds);
    setSelectedStickyIds(updatedIds);
    updateCombinedText(updatedIds);
    await highlightStickiesInMiro(updatedIds);
  };

  const handleRemoveSticky = async (id) => {
    const updatedIds = selectedStickyIds.filter(stickyId => stickyId !== id);
    console.log('Removing sticky ID:', id);
    setSelectedStickyIds(updatedIds);
    updateCombinedText(updatedIds);
    await highlightStickiesInMiro(updatedIds);
  };

  const handleGenerateIdeas = async () => {
    if (!stickyNoteText.trim()) {
      setWarningMessage('Please select or input some sticky note content.');
      return;
    }
    setLoading(true);
    setSuggestions([]);
    try {
      // Get the current board ID
      const boardId = await getCurrentBoardId();
      console.log('Using board ID for text generation:', boardId);
      
      console.log('Sending content to API:', stickyNoteText);
      const res = await fetch(`${config.apiBaseUrl}/generate-ideas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          content: stickyNoteText, 
          prompt: prompt,
          boardId: boardId // Send the board ID to the backend
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      console.log('AI response received:', data);
      if (data.suggestions) {
        const raw = data.suggestions;
        const ideas = raw
          .split(/(?=^Concept\s*\d+[:：])/gmi)
          .map(chunk => chunk.trim())
          .filter(chunk => chunk.length > 0);

        setSuggestions(ideas);
      } else {
        setSuggestions(["No suggestions received."]);
      }
    } catch (err) {
      console.error("Failed to fetch suggestions:", err);
      setWarningMessage(err.message || "Failed to generate ideas. Please try again.");
      setSuggestions([]);
    }
    setLoading(false);
  };

  const handleGenerateImages = () => {
    if (!stickyNoteText.trim()) {
      // If no text is available, try to generate from current Miro selection
      generateImagesFromSelection(setImageLoading);
    } else {
      // Use text from selected sticky notes
      generateImageIdeas(setImageLoading, stickyNoteText);
    }
  };

  const addToMiroBoard = async (text) => {
    console.log('⏳ Starting to add sticky with content:', text);
  
    // Extract both the concept title and description
    let contentToAdd = text;
    
    // Try to extract the concept based on different patterns
    const conceptTitlePattern = /Idea\s*\d+[:：]\s*(.+?)(?:\n|$)/i;
    const titleMatch = text.match(conceptTitlePattern);
    
    // Look for the description that typically follows after "- Concept:" 
    const conceptDescPattern = /-\s*Idea[:：]?\s*(.+?)(?:\n|$)/i;
    const descMatch = text.match(conceptDescPattern);
    
    if (descMatch && descMatch[1]) {
      // Use the description if found
      contentToAdd = descMatch[1].trim();
      console.log('✅ Using concept description:', contentToAdd);
    } else if (titleMatch && titleMatch[1]) {
      // Fall back to title if no description
      contentToAdd = titleMatch[1].trim();
      console.log('ℹ️ Using concept title as fallback:', contentToAdd);
    } else {
      // If no concept found, use first line as fallback
      const firstLine = text.split('\n')[0].trim();
      if (firstLine) {
        contentToAdd = firstLine;
        console.log('ℹ️ Using first line as concept:', contentToAdd);
      }
    }
  
    // Default position - will be updated if selection exists
    let x = 0;
    let y = 0; 
    let style = { shape: 'square', fillColor: 'yellow' };
    let geometry = null;
    
    try {
      // First get viewport as fallback
      const viewport = await miro.board.viewport.get();
      x = viewport.x + viewport.width / 2;
      y = viewport.y + viewport.height / 2;
      
      // Get selection directly from Miro
      const selection = await miro.board.getSelection();
      console.log('📋 Selection:', selection);
      
      // Filter for sticky notes
      const stickies = selection.filter(item => item.type === 'sticky_note');
      
      if (stickies.length > 0) {
        // Get the first sticky with valid coordinates
        const validSticky = stickies.find(s => 
          typeof s.x === 'number' && isFinite(s.x) && 
          typeof s.y === 'number' && isFinite(s.y)
        );
        
        if (validSticky) {
          // Directly use its position with explicit offset to the right
          console.log('📍 Using sticky position:', { x: validSticky.x, y: validSticky.y });
          
          // Get full sticky details to handle frames and copy style/geometry
          try {
            const refSticky = await miro.board.getById(validSticky.id);
            console.log('Full sticky details:', refSticky);
            
            // Check if sticky is on a frame by examining parentId
            if (refSticky.parentId) {
              console.log('Sticky has parent (frame/table):', refSticky.parentId);
              
              try {
                // Get the parent frame/table
                const parent = await miro.board.getById(refSticky.parentId);
                console.log('Parent element:', parent);
                
                if (parent && typeof parent.x === 'number' && isFinite(parent.x)) {
                  // Add sticky to the board next to the frame/table instead of inside it
                  // Reduced offset to 20px for very close positioning
                  x = parent.x + 20; // Place very close to the frame
                  y = parent.y; // Same vertical position as frame
                  console.log('📐 Positioning next to parent frame/table:', { x, y });
                } else {
                  // If we can't get parent info, fall back to viewport
                  x = validSticky.x + 30; // Very small offset
                  y = validSticky.y;
                }
              } catch (frameErr) {
                console.warn('Could not get parent frame info:', frameErr);
                // Fallback to direct position + offset
                x = validSticky.x + 30; // Very small offset
                y = validSticky.y;
              }
            } else {
              // Normal case - sticky is directly on board
              // Very small offset for close positioning
              x = validSticky.x + 30;
              y = validSticky.y; // Keep the same Y coordinate
            }
            
            // Copy style and geometry regardless of parent
            if (refSticky && refSticky.style) {
              style = { ...refSticky.style, fillColor: 'yellow' };
            }
            if (refSticky && refSticky.geometry) {
              geometry = { ...refSticky.geometry };
            }
          } catch (err) {
            console.warn('⚠️ Could not get reference sticky details:', err);
            // Fallback to direct coordinates if we can't get full details
            x = validSticky.x + 30; // Very small offset
            y = validSticky.y;
          }
        } else {
          console.log('⚠️ No valid sticky coordinates found in selection');
        }
      } else {
        console.log('ℹ️ No sticky notes in selection, using viewport center');
      }
    } catch (err) {
      console.error('❌ Error getting selection or viewport:', err);
    }
  
    // Final validation to ensure we never have invalid coordinates
    if (!isFinite(x) || !isFinite(y)) {
      console.warn('⚠️ Invalid coordinates detected, resetting to (0,0)');
      x = 0;
      y = 0;
    }
    
    try {
      const payload = {
        content: contentToAdd,
        x: x,
        y: y,
        style: style
      };
      
      // Only add geometry if it exists and is valid
      if (geometry && typeof geometry.width === 'number' && isFinite(geometry.width)) {
        payload.geometry = geometry;
      }

      console.log('📤 Creating sticky with payload:', payload);
      const newSticky = await miro.board.createStickyNote(payload);
      console.log('✅ Created sticky note:', newSticky);
      
      // Make the new sticky visible by selecting it (but don't zoom)
      await miro.board.select({id: newSticky.id});
    } catch (err) {
      console.error('❌ Failed to create sticky note:', err);
    }
  };
      

  const toggleAccordion = (index) => {
    console.log('Toggling accordion index:', index);
    setExpanded(expanded === index ? null : index);
  };

  const handlePromptChange = (e) => {
    const value = e.target.value;
    if (value.length <= 200) { // Limit to 200 characters
      setPrompt(value);
    }
  };

  // Helper function to extract concept title from idea text
  const extractConceptTitle = (idea, index) => {
    // Just return "Idea X" format
    return `Idea ${index + 1}`;
  };

  return (
    <div style={{ 
      padding: '24px', 
      fontFamily: 'Segoe UI, Roboto, sans-serif', 
      maxWidth: '480px', 
      backgroundColor: '#fff',
      height: 'auto',
      overflow: 'hidden',
      boxSizing: 'border-box'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: '600', color: '#1f1f1f', margin: '0', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <span role="img" aria-label="lightbulb">💡</span> AI Ideation Assistant
        </h2>
        <hr style={{ margin: '12px auto 0', width: '60%', border: '0', borderTop: '1px solid #eee' }} />
      </div>

      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        gap: '16px', 
        marginBottom: '24px',
        padding: '0'
      }}>
        <button onClick={handleLoadStickyNotes} className="button button-secondary" style={{ 
          flex: '1', 
          padding: '12px 8px', 
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: '500',
          whiteSpace: 'nowrap',
          border: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb',
          color: '#374151',
          transition: 'all 0.2s ease',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          ':hover': {
            backgroundColor: '#f3f4f6',
            borderColor: '#d1d5db'
          }
        }}>
          Load All Stickies
        </button>
        <button onClick={handleLoadSelectedStickyNotes} className="button button-secondary" style={{ 
          flex: '1',
          padding: '12px 8px', 
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: '500',
          whiteSpace: 'nowrap',
          border: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb',
          color: '#374151',
          transition: 'all 0.2s ease',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          ':hover': {
            backgroundColor: '#f3f4f6',
            borderColor: '#d1d5db'
          }
        }}>
          Load Selected Sticky
        </button>
      </div>

      {warningMessage && (
        <div style={{ color: '#b91c1c', backgroundColor: '#fee2e2', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px', fontSize: '14px' }}>
          {warningMessage}
        </div>
      )}

      <div style={{ 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: '6px', 
        marginBottom: '16px',
        alignItems: 'center'
      }}>
        {(showAllChips ? selectedStickyIds : selectedStickyIds.slice(0, 3)).map(id => {
          const note = allStickyNotes.find(n => n.id === id);
          const content = extractContent(note);
          const truncatedContent = content.length > 20 ? content.slice(0, 20) + '...' : content;
          return (
            <div
              key={id}
              style={{
                backgroundColor: '#e0f2fe',
                color: '#0369a1',
                padding: '4px 8px',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                fontSize: '12px',
                fontWeight: '500',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
            >

              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {truncatedContent}
              </span>
              <button
                onClick={() => handleRemoveSticky(id)}
                style={{
                  marginLeft: '4px',
                  background: '#c7e6fd',
                  border: 'none',
                  borderRadius: '50%',
                  width: '16px',
                  height: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontSize: '12px',
                  color: '#0369a1',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                ×
              </button>
            </div>
          );
        })}

        {selectedStickyIds.length > 3 && (
          <button
            onClick={() => setShowAllChips(!showAllChips)}
            style={{
              backgroundColor: '#f3f4f6',
              color: '#374151',
              padding: '4px 8px',
              borderRadius: '16px',
              fontSize: '12px',
              fontWeight: '500',
              border: '1px solid #d1d5db',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
          >
            {showAllChips ? (
              <>Show less <span style={{ marginLeft: '2px' }}>↑</span></>
            ) : (
              <>+{selectedStickyIds.length - 3} more <span style={{ marginLeft: '2px' }}>↓</span></>
            )}
          </button>
        )}
      </div>

      <input
        placeholder="Custom prompt (optional)"
        value={prompt}
        onChange={handlePromptChange}
        maxLength={200}
        style={{ 
          width: '100%', 
          padding: '10px 12px', 
          fontSize: '14px', 
          borderRadius: '8px', 
          border: '1px solid #d1d5db', 
          marginBottom: '12px', 
          backgroundColor: '#f9fafb',
          outline: 'none'
        }}
      />
      {prompt.length > 0 && (
        <div style={{ 
          fontSize: '12px', 
          color: '#6b7280', 
          marginTop: '-12px', 
          marginBottom: '12px',
          textAlign: 'right' 
        }}>
          {prompt.length}/200 characters
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        <button onClick={handleGenerateIdeas} className="button button-primary" style={{ 
          flex: 1, 
          padding: '12px', 
          fontSize: '15px', 
          backgroundColor: '#3b82f6', 
          color: '#fff', 
          fontWeight: '600', 
          border: 'none', 
          borderRadius: '8px', 
          cursor: loading ? 'not-allowed' : 'pointer',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          opacity: loading ? 0.7 : 1
        }}>
          {loading ? 'Generating...' : 'Generate Text'}
        </button>
        <button onClick={handleGenerateImages} className="button button-primary" style={{ 
          flex: 1, 
          padding: '12px', 
          fontSize: '15px', 
          backgroundColor: '#3b82f6', 
          color: '#fff', 
          fontWeight: '600', 
          border: 'none', 
          borderRadius: '8px', 
          cursor: imageLoading ? 'not-allowed' : 'pointer',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          opacity: imageLoading ? 0.7 : 1
        }}>
          {imageLoading ? 'Generating...' : 'Generate Images'}
        </button>
      </div>

      {(loading || imageLoading) && (
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
          <p style={{ margin: 0 }}>🧠 {loading ? 'Thinking of ideas...' : 'Generating images...'}</p>
        </div>
      )}

      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '16px', 
        marginTop: '20px',
        maxHeight: 'calc(100% - 240px)',
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '4px'
      }}>
        {suggestions.length > 0 && suggestions.map((idea, index) => (
          <div
            key={index}
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              backgroundColor: '#fff',
              padding: '0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              overflow: 'hidden'
            }}
          >
            <div
              onClick={() => toggleAccordion(index)}
              style={{
                fontWeight: 'bold',
                fontSize: '15px',
                padding: '12px 16px',
                cursor: 'pointer',
                backgroundColor: '#f9fafb',
                borderBottom: expanded === index ? '1px solid #e5e7eb' : 'none',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div style={{ color: '#1f2937' }}>
                {extractConceptTitle(idea, index)}
              </div>
              <span style={{ color: '#6b7280', fontSize: '16px' }}>
                {expanded === index ? '−' : '+'}
              </span>
            </div>

            {expanded === index && (
              <div style={{ padding: '16px' }}>
                <div
                  style={{ 
                    fontSize: '14px', 
                    lineHeight: '1.6', 
                    marginBottom: '16px', 
                    whiteSpace: 'pre-wrap',
                    color: '#4b5563'
                  }}
                  dangerouslySetInnerHTML={{
                    __html: idea
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/(?:\r\n|\r|\n)/g, '<br/>')
                  }}
                />
                <button
                  onClick={() => addToMiroBoard(idea)}
                  className="button button-primary"
                  style={{
                    fontSize: '13px',
                    padding: '8px 12px',
                    backgroundColor: '#3b82f6',
                    color: '#fff',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Add to Miro Board
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
