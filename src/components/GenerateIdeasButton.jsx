'use client';

import React, { useState, useEffect } from 'react';
import { generateImageIdeas, generateImagesFromSelection, getCurrentBoardId, getOrCreateAITag } from '../utils/miroUtils';
import config from '../config';

export default function GenerateIdeasButton() {
  const [allStickyNotes, setAllStickyNotes] = useState([]);
  const [selectedStickyIds, setSelectedStickyIds] = useState([]);
  const [stickyNoteText, setStickyNoteText] = useState('');
  const [prompt, setPrompt] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');
  const [hasGenerated, setHasGenerated] = useState(false);


  useEffect(() => {
    if (warningMessage) {
      const timeout = setTimeout(() => setWarningMessage(''), 4000);
      return () => clearTimeout(timeout);
    }
  }, [warningMessage]);

  const [history, setHistory] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('promptHistory');
      return stored ? JSON.parse(stored) : [];
    }
    return [];
  });

  useEffect(() => {
    const clearHistoryIfNewBoard = async () => {
      try {
        const currentBoardId = await getCurrentBoardId(); // from your utils
        const lastBoardId = localStorage.getItem('lastBoardId');
  
        if (lastBoardId && lastBoardId !== currentBoardId) {
          localStorage.removeItem('promptHistory');
          setHistory([]);
        }
  
        localStorage.setItem('lastBoardId', currentBoardId);
      } catch (err) {
        console.error('Failed to get board ID or clear history:', err);
      }
    };
    
    clearHistoryIfNewBoard();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [history]);

  const extractContent = (note) => {
    const raw = note.fields?.plainText || note.content || note.data?.content || note.title || '';
    const temp = document.createElement('div');
    temp.innerHTML = raw;
    return temp.textContent || temp.innerText || '';
  };

  const highlightStickiesInMiro = async (ids) => {
    const items = await miro.board.get({ type: 'sticky_note' });
    const selectedItems = items.filter(item => ids.includes(item.id));
    await miro.board.select(selectedItems);
  };

  const handleLoadStickyNotes = async () => {
    const stickies = await miro.board.get({ type: 'sticky_note' });
    const recentStickies = stickies.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10);
    setAllStickyNotes(recentStickies);
    const ids = recentStickies.map(note => note.id);
    setSelectedStickyIds(ids);
    setStickyNoteText(recentStickies.map(n => extractContent(n)).join('\n\n'));
    highlightStickiesInMiro(ids);
  };

  const handleLoadSelectedStickyNotes = async () => {
    const selection = await miro.board.getSelection();
    const stickies = selection.filter(item => item.type === 'sticky_note');
    if (stickies.length === 0) {
      setWarningMessage('Please select sticky notes.');
      return;
    }
    setAllStickyNotes(stickies);
    const ids = stickies.map(note => note.id);
    setSelectedStickyIds(ids);
    setStickyNoteText(stickies.map(n => extractContent(n)).join('\n\n'));
    highlightStickiesInMiro(ids);
  };

  const handleAddStickyNotes = async () => {
    const selection = await miro.board.getSelection();
    const stickies = selection.filter(item => item.type === 'sticky_note');
    const newStickies = stickies.filter(note => !selectedStickyIds.includes(note.id));
    const updatedStickies = [...allStickyNotes, ...newStickies];
    const updatedIds = [...selectedStickyIds, ...newStickies.map(note => note.id)];
    setAllStickyNotes(updatedStickies);
    setSelectedStickyIds(updatedIds);
    setStickyNoteText(updatedStickies.map(n => extractContent(n)).join('\n\n'));
    highlightStickiesInMiro(updatedIds);
  };

  function Tooltip({ text, x, y, visible }) {
    const tooltipWidth = 160;
    const [left, setLeft] = useState(x);

    useEffect(() => {
      if (typeof window !== 'undefined') {
        const spaceRight = window.innerWidth - x;
        setLeft(spaceRight > tooltipWidth ? x : x - tooltipWidth);
      }
    }, [x]);

    const style = {
      position: 'fixed',
      top: y + 10,
      left: left,
      backgroundColor: '#FAFAFA',
      color: '#7A7A7A',
      padding: '6px 10px',
      borderRadius: '8px',
      fontSize: '12px',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
      zIndex: 1000,
      visibility: visible ? 'visible' : 'hidden',
      transition: 'opacity 0.2s ease-in-out',
      opacity: visible ? 1 : 0,
      border: '1px solid #2196F3',
    };

    return <div style={style}>{text}</div>;
  }


  const [tooltip, setTooltip] = useState({ text: '', x: 0, y: 0, visible: false });
  const showTooltip = (text) => {
    setTooltip(prev => ({ ...prev, text, visible: true }));
  };

  const hideTooltip = () => {
    setTooltip(prev => ({ ...prev, visible: false }));
  };

  const updateTooltipPosition = (e) => {
    setTooltip(prev => ({ ...prev, x: e.clientX, y: e.clientY }));
  };
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 1;

  const totalPages = Math.ceil(history.length / itemsPerPage);
  const startIdx = (currentPage - 1) * itemsPerPage;
  const currentHistoryPage = history.slice(startIdx, startIdx + itemsPerPage);

  const handleGenerateIdeas = async () => {
    if (!stickyNoteText.trim()) {
      return setWarningMessage('Please load Sticky Notes first');
    }
    setLoading(true);
    setSuggestions([]);
  
    const res = await fetch(`${config.apiBaseUrl}/generate-ideas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: stickyNoteText,
        prompt,
        boardId: await getCurrentBoardId(),
      }),
    });
  
    const data = await res.json();
  
    const suggestionsText = data.suggestions || "";
  
    const matches = suggestionsText.match(/Idea\s*\d[:\uff1a][^]*?(?=Idea\s*\d[:\uff1a]|$)/g);
  
    const ideas = matches
      ? matches.map(i => i.replace(/Idea\s*\d[:\uff1a]/, '').trim())
      : suggestionsText.trim()
        ? [suggestionsText.trim()]
        : [];
  
    setSuggestions(ideas); // always an array
  
    if (prompt.trim() !== "") {
      const timestamp = new Date().toISOString();
      const newGeneration = {
        ideas,
        timestamp,
        stickiesUsed: allStickyNotes.map(note => extractContent(note))
      };

  
      let updatedHistory;
      const existingGroup = history.find(h => h.prompt === prompt);
  
      if (existingGroup) {
        // Append to existing prompt group
        const newGroup = {
          ...existingGroup,
          generations: [newGeneration, ...existingGroup.generations],
        };
        updatedHistory = [
          newGroup,
          ...history.filter(h => h.prompt !== prompt),
        ];
      } else {
        // New prompt group
        updatedHistory = [{ prompt, generations: [newGeneration] }, ...history];
      }
  
      setHistory(updatedHistory);
      localStorage.setItem('promptHistory', JSON.stringify(updatedHistory));
    }
  
    setHasGenerated(true);
    setLoading(false);
  };


  const handleGenerateImages = () => {
    if (!stickyNoteText.trim()) {
      generateImagesFromSelection(setImageLoading);
    } else {
      generateImageIdeas(setImageLoading, stickyNoteText);
    }
  };

  const addToMiroBoard = async (text) => {
    const contentToAdd = `${text.split('\n')[0].trim()}`;
    const viewport = await miro.board.viewport.get();
    const x = viewport.x + viewport.width / 2;
    const y = viewport.y + viewport.height / 2;

    try {
      // Get or create the "AI" tag
      const aiTag = await getOrCreateAITag();

      // Create the sticky note with the AI tag
      const stickyNote = await miro.board.createStickyNote({
        content: contentToAdd,
        x,
        y,
        style: { shape: 'square', fillColor: getCommonStickyColor() },
        tagIds: aiTag ? [aiTag.id] : [], // Add the AI tag if it was created successfully
      });

      // Sync the sticky note to make the tag visible
      if (aiTag) {
        await stickyNote.sync();
      }
    } catch (err) {
      console.error('Error adding sticky to board:', err);
    }
  };

  const primaryStyle = {
    flex: 1, 
    padding: '10px',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    cursor: 'pointer',
    fontFamily: 'Segoe UI, sans-serif', 
    boxShadow: '1px 1px 2px rgba(0,0,0,0.2)',
    backgroundColor: '#007bff',
    textShadow: '2px 2px 4px rgba(255, 255, 255, 0.06)',
    fontWeight: 'bold'
  };

  const buttonStyle = {
    flex: 1, // Makes each button grow equally
    backgroundColor: '#F9E000',
    color: 'black',
    border: 'none',
    padding: '10px',
    borderRadius: '6px',
    cursor: 'pointer',
    boxShadow: '1px 1px 2px rgba(0,0,0,0.2)',
    fontWeight: 'bold'
  };

  const ideaButtonStyle = {
    ...primaryStyle,
    backgroundColor: '#4262FF', 
  };

  const imageButtonStyle = {
    ...primaryStyle,
    backgroundColor: '#4262FF',
  };

  const getCommonStickyColor = () => {
    if (allStickyNotes.length === 0) return 'yellow';
    const firstColor = allStickyNotes[0]?.style?.fillColor;
    const allSame = allStickyNotes.every(note => note.style?.fillColor === firstColor);
    return allSame ? firstColor : 'yellow'; // or any default
  };


  return (
    <div style={{ padding: '20px', fontFamily: 'Segoe UI, sans-serif', backgroundColor: '#fff', color: '#2a2a2a', width: '100%', height: '100%', minHeight: '100vh', boxSizing: 'border-box' }}>
      <h2 style={{ fontSize: '20px', marginBottom: '30px', textAlign: 'center' }}><span style={{ color: '#1A1A1A' }}>Welcome to <span style={{ fontWeight: 'bold' }}>Konzepta 💡</span></span><span style={{ backgroundColor: '#FFF176', padding: '0 6px', borderRadius: '4px', boxShadow: '1px 1px 2px rgba(0,0,0,0.2)', marginLeft: '8px' }}>Your AI Ideation Assistant</span></h2>

      <p style={{ fontSize: '14px', marginBottom: '6px', textAlign: 'center', textShadow: '1px 1px 2px rgba(0,0,0,0.05)', color: '#2a2a2a' }}>Load <strong><em>Sticky Notes</em></strong> from the board</p>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', justifyContent: 'center'}}>
        <button onClick={handleLoadStickyNotes} onMouseEnter={() => showTooltip('Load 10 latest edited notes')} onMouseLeave={hideTooltip} onMouseMove={updateTooltipPosition} style={buttonStyle}>Recent</button>
        <button onClick={handleLoadSelectedStickyNotes} onMouseEnter={() => showTooltip('Load selected notes on board')} onMouseLeave={hideTooltip} onMouseMove={updateTooltipPosition} style={buttonStyle}>Select</button>
        <button onClick={handleAddStickyNotes} onMouseEnter={() => showTooltip('Add selected notes to loaded ones')} onMouseLeave={hideTooltip} onMouseMove={updateTooltipPosition} style={buttonStyle}>Add</button>
      </div>

      <div style={{
        backgroundColor: '#FAFAFA',
        padding: '12px',
        borderRadius: '6px',
        marginBottom: '14px',
        maxHeight: '140px',
        overflowY: 'auto',
        fontSize: '11px',
        color: '#4b5563',
        boxShadow: '1px 1px 2px rgba(0,0,0,0.1)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '6px',
        scrollbarWidth: 'thin',              
        scrollbarColor: '#e4e4e7 transparent',
        position: 'relative'
      }}>

        {selectedStickyIds.length === 0 ? (
          <span style={{ color: '#C4C4C4' }}>Loaded Sticky Notes will appear here...</span>
        ) : (
          selectedStickyIds.map(id => {
            const note = allStickyNotes.find(n => n.id === id);
            const content = extractContent(note);
            const shortText = content.split(' ').slice(0, 5).join(' ') + (content.split(' ').length > 5 ? '...' : '');

            return (
              <span key={id} style={{
                backgroundColor: '#ffffff',
                border: '1px solid #59C3FF',
                borderRadius: '10px',
                padding: '4px 10px 4px 10px',
                display: 'flex',
                alignItems: 'center',
                maxWidth: '300px',
                wordBreak: 'break-word',
                fontSize: '12.5px',
                color: '#4F4F4F'
              }}>
                {shortText}
                <button onClick={() => {
                  const newIds = selectedStickyIds.filter(sid => sid !== id);
                  const newStickies = allStickyNotes.filter(n => n.id !== id);
                  setSelectedStickyIds(newIds);
                  setAllStickyNotes(newStickies);
                  setStickyNoteText(newStickies.map(n => extractContent(n)).join('\n\n'));
                }} style={{
                  marginLeft: '8px',
                  border: 'none',
                  background: 'transparent',
                  color: '#59C3FF',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '12px',
                  lineHeight: '1'
                }} title="Remove">×</button>
              </span>
            );
          })
        )}

        {/* Clear All Button - placed here below the sticky notes */}
        {allStickyNotes.length > 0 && (
          <button
            onClick={() => {
              setAllStickyNotes([]);
              setSelectedStickyIds([]);
              setStickyNoteText('');
            }}
            style={{
              marginTop: '8px',
              border: 'none',
              background: 'transparent',
              color: '#59C3FF',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600',
              userSelect: 'none',
              padding: '0',
              alignSelf: 'flex-start'
            }}
            aria-label="Clear all sticky notes"
            title="Clear All"
          >
            Clear All
          </button>
        )}
      </div>

      <div style={{ position: 'relative', marginBottom: '16px', scrollbarWidth: 'thin', scrollbarColor: '#e4e4e7 transparent' }}>
        <textarea
          placeholder="(Optional) Specify a detailed prompt..."
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          style={{
            width: '100%',
            height: '80px',
            padding: '12px',
            paddingBottom: '32px', // reserve space for hint
            fontSize: '14px',
            borderRadius: '6px',
            border: '0px solid #d1d5db',
            resize: 'none',
            fontFamily: 'Segoe UI, sans-serif',
            color: '#7A7A7A',
            backgroundColor: '#F5F6F8',
            boxShadow: '1px 1px 2px rgba(0,0,0,0.2)',
            boxSizing: 'border-box'
          }}
        />
        {prompt.trim() === '' && (
          <div style={{
            position: 'absolute',
            bottom: '8px',
            right: '10px',
            fontSize: '10px',
            fontStyle: 'italic',
            color: '#C4C4C4',
            pointerEvents: 'none',
            fontFamily: 'Segoe UI, sans-serif',
          }}>
            e.g. "Identify user needs from sticky note(s)"
          </div>
        )}
      </div>

      <p style={{ fontSize: '14px', marginBottom: '6px', textAlign: 'center', textShadow: '1px 1px 2px rgba(0,0,0,0.05)', color: '#2E2E2E' }}>Use <strong><em>Sticky Notes</em></strong> to ideate — with or without a custom prompt.</p>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '14px', marginBottom: '8px' }}>
          <button
            onClick={handleGenerateIdeas}
            disabled={loading}
            onMouseEnter={() => showTooltip('Click to generate ideas\n onto Sticky Notes')}
            onMouseLeave={hideTooltip}
            onMouseMove={updateTooltipPosition}
            style={{
              ...ideaButtonStyle,
              opacity: loading ? 0.5 : 1,
              cursor: loading ? 'wait' : 'pointer',
              letterSpacing: '0.6px',
              fontSize: '15px'
            }}
            aria-label="Generate AI ideas from sticky notes and custom prompt"
          >
            {loading ? 'Generating Ideas...' : 'Generate 📝'}
          </button>
          <button
            onClick={handleGenerateImages}
            disabled={imageLoading}
            onMouseEnter={() => showTooltip('Click to generate images\n onto board')}
            onMouseLeave={hideTooltip}
            onMouseMove={updateTooltipPosition}
            style={{
              ...imageButtonStyle,
              opacity: imageLoading ? 0.5 : 1,
              cursor: imageLoading ? 'wait' : 'pointer',
              letterSpacing: '0.6px',
              fontSize: '15px'
            }}
            aria-label="Generate AI images from sticky notes and custom prompt"
          >
            {imageLoading ? 'Generating Image...' : 'Generate 🖼️'}
          </button>
        </div>
        
        <Tooltip text={tooltip.text} x={tooltip.x} y={tooltip.y} visible={tooltip.visible} />

        {hasGenerated && (
          <p style={{ fontSize: '10px', color: '#7A7A7A', textAlign: 'center', maxWidth: '300px', fontStyle: 'italic', marginBottom: 0 }}>
            Click again to generate a fresh set of ideas or images.
          </p>
        )}
      </div>


      {warningMessage && (
        <div style={{
          marginBottom: '14px',
          color: '#FF4D4F',
          backgroundColor: '#FFE5E6',
          borderRadius: '8px',
          padding: '6px 10px',
          fontSize: '12px',
          textAlign: 'center',
          fontFamily: 'Segoe UI, sans-serif',
          boxShadow: '1px 1px 2px rgba(0,0,0,0.15)'
        }}>
          ⚠️ {warningMessage}
        </div>
      )}

      {Array.isArray(suggestions) && suggestions.length > 0 && (
        <div key={suggestions.length + Date.now()} style={{
          marginTop: '20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 2fr))',
          gap: '10px',
        }}>
          {suggestions.map((idea, idx) => (
            <div key={idx} style={{
              width: '130px',
              minHeight: '100px',
              backgroundColor: '#FFF68D',
              borderRadius: '8px',
              padding: '10px',
              position: 'relative',
              boxShadow: '2px 2px 6px rgba(0,0,0,0.1)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              fontFamily: 'Segoe UI, sans-serif',
              color: '#2E2E2E',
            }}>
              <div style={{ fontSize: '13px', marginBottom: '10px', whiteSpace: 'pre-wrap' }}>{idea}</div>
              <button
                onClick={() => addToMiroBoard(idea)}
                style={{
                  backgroundColor: '#4262FF',
                  border: 'none',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  color: '#EDF0FF',
                  cursor: 'pointer',
                  boxShadow: '1px 1px 2px rgba(0,0,0,0.1)',
                  alignSelf: 'flex-start'
                }}
              >
                + Add to board
              </button>
            </div>
          ))}
        </div>
      )}
      
      {Array.isArray(history) && history.length > 0 && (
        <div style={{ marginTop: '30px' }}>
          <h4 style={{  fontSize: '14px', marginBottom: '6px', textAlign: 'left', textShadow: '1px 1px 2px rgba(0,0,0,0.05)', color: '#2a2a2a'  }}>🕘 Prompt History</h4>
          {currentHistoryPage.map((group, groupIdx) => (
            <div
              key={startIdx + groupIdx}
              style={{
                marginBottom: '10px',
                padding: '10px',
                borderRadius: '8px',
                boxShadow: '1px 1px 2px rgba(0,0,0,0.1)', 
                backgroundColor: '#FAFAFA'
              }}
            >
              <div style={{ marginBottom: '6px' }}>
                <strong>Prompt:</strong> <em>{group.prompt}</em>
                <button
                  onClick={() => setPrompt(group.prompt)}
                  style={{
                    marginLeft: '10px',
                    fontSize: '11px',
                    border: 'none',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    flex: 1,
                    backgroundColor: '#F9E000',
                    color: 'black',
                    boxShadow: '1px 1px 2px rgba(0,0,0,0.2)',
                  }}
                >
                  ↩ Reuse Prompt
                </button>
              </div>
      
              {Array.isArray(group.generations) && group.generations.map((gen, genIdx) => (
                <div
                  key={genIdx}
                  style={{
                    marginTop: '10px',
                    paddingLeft: '10px',
                    borderLeft: '2px solid #ccc',
                  }}
                >
                  <div
                    style={{
                      fontSize: '11px',
                      color: '#888',
                      marginBottom: '4px',
                    }}
                  >
                    <div style={{  fontSize: '11px', color: '#7A7A7A', textAlign: 'left', maxWidth: '300px', marginBottom: '6px'  }}>
                      {new Date(gen.timestamp).toLocaleString()}
                    </div>
                    
                    <div style={{  fontSize: '11px', color: '#7A7A7A', textAlign: 'left', maxWidth: '300px', marginBottom: '6px', fontWeight: 'bold' }}>
                      Sticky Notes Used:
                    </div>
                    <ul style={{ listStyleType: 'none', paddingLeft: 0, marginLeft: 0 }}>
                      {(gen.stickiesUsed || []).map((text, idx) => (
                        <li key={idx} style={{ fontSize: '11px', marginBottom: '5px', backgroundColor: '#ffffff', border: '1px solid #59C3FF', borderRadius: '10px', padding: '4px 10px 4px 10px', display: 'flex', alignItems: 'center', maxWidth: '300px', color: '#4F4F4F' }}>
                          {text.length > 100 ? text.slice(0, 100) + '...' : text}
                        </li>
                      ))}
                    </ul>

                  </div>
                  <ul style={{ listStyleType: 'none', paddingLeft: 0, marginLeft: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 2fr))', gap: '5px' }}>
                    {Array.isArray(gen.ideas) && gen.ideas.map((idea, ideaIdx) => (
                      <li key={ideaIdx} style={{ fontSize: '11px', marginBottom: '4px', backgroundColor: '#FFF68D', border: '1px solid #FFF68D', borderRadius: '6px', padding: '4px 10px 4px 10px', alignItems: 'center', maxWidth: '300px', color: '#2E2E2E', listStyleType: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 2fr))', gap: '5px', flexDirection: 'column', justifyContent: 'space-between' }}>
                        {idea}
                        <button
                          onClick={() => addToMiroBoard(idea)}
                          style={{
                            backgroundColor: '#4262FF',
                            border: 'none',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '8px',
                            fontWeight: 'bold',
                            color: '#EDF0FF',
                            cursor: 'pointer',
                            boxShadow: '1px 1px 2px rgba(0,0,0,0.1)',
                            alignSelf: 'flex-end',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          + Add to board
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}

          <div style={{ fontSize: '12px', textAlign: 'center', display: 'inline-block', alignItems: 'center' }}>
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => prev - 1)}
              style={{ cursor: currentPage === 1 ? 'default' : 'pointer', color: '#7A7A7A', backgroundColor: '#F5F6F8', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer', boxShadow: '1px 1px 2px rgba(0,0,0,0.1)' }}
            >
              ◀
            </button>
            <span style={{ fontSize: '11px', color: '#7A7A7A', marginLeft: '10px', marginRight: '10px' }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => prev + 1)}
              style={{ cursor: currentPage === totalPages ? 'default' : 'pointer', color: '#7A7A7A', backgroundColor: '#F5F6F8', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer', boxShadow: '1px 1px 2px rgba(0,0,0,0.1)' }}
            >
              ▶
            </button>
          </div>
      
          <button
            onClick={() => {
              setHistory([]);
              localStorage.removeItem('promptHistory');
            }}
            style={{
              marginTop: '10px',
              border: 'none',
              color: '#59C3FF',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600',
              userSelect: 'none',
              alignSelf: 'flex-start',
              marginBottom: '30px'
            }}
          >
            Clear History
          </button>
        </div>
      )}
      
    </div>
  );
}
