'use client';

import React, { useState, useEffect } from 'react';
import { getOrCreateAITag } from './miroUtils';

export default function GenerateIdeasButton() {
  const [allStickyNotes, setAllStickyNotes] = useState([]);
  const [selectedStickyId, setSelectedStickyId] = useState(null);
  const [stickyNoteText, setStickyNoteText] = useState('');
  const [prompt, setPrompt] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const extractContent = (note) => {
    return (
      note.fields?.plainText ||
      note.data?.content ||
      note.text ||
      note.title ||
      ''
    );
  };

  const handleLoadStickyNotes = async () => {
    await miro.board.getInfo(); // Ensures SDK is ready
    const stickies = await miro.board.get({ type: 'sticky_note' });

    console.log("✅ Total stickies loaded:", stickies.length);
    if (stickies.length > 0) {
      console.log("🔍 First Sticky Note (Full):", JSON.stringify(stickies[0], null, 2));
    }

    setAllStickyNotes(stickies);
  };

  const handleStickySelect = (note) => {
    const text = extractContent(note);
    console.log("➡️ Selected Sticky Note Content:", text);
    setStickyNoteText(text);
    setSelectedStickyId(note.id);
  };

  const handleGenerateIdeas = async () => {
    setLoading(true);
    setSuggestions([]);
    try {
      const res = await fetch("http://localhost:5000/generate-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: stickyNoteText,
          prompt: prompt
        })
      });

      const data = await res.json();
      if (data.suggestions) {
        const ideas = data.suggestions
          .split(/(?=###?\s*\d+[\.:])/)
          .map((idea, index) =>
            idea.trim().startsWith('###')
              ? idea.trim()
              : `### Idea ${index + 1}\n${idea.trim()}`
          )
          .filter(Boolean);
        setSuggestions(ideas);
      } else {
        setSuggestions(["No suggestions received."]);
      }
    } catch (err) {
      console.error("❌ Failed to fetch suggestions:", err);
      setSuggestions(["Something went wrong. Check the console."]);
    }
    setLoading(false);
  };

  const addToMiroBoard = async (text) => {
    try {
      // Get or create the "AI" tag
      const aiTag = await getOrCreateAITag();

      // Create the sticky note with the AI tag
      const stickyNote = await miro.board.createStickyNote({
        content: text,
        style: {
          shape: 'square',
          fillColor: 'light_yellow'
        },
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

  const toggleAccordion = (index) => {
    setExpanded(expanded === index ? null : index);
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', maxWidth: '400px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '15px' }}>AI Ideation Assistant</h2>

      <button onClick={handleLoadStickyNotes} className="button button-secondary" style={{ marginBottom: '10px' }}>
        Load Sticky Notes
      </button>

      {allStickyNotes.length > 0 ? (
        <div style={{ marginBottom: '15px', maxHeight: '120px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '6px', padding: '10px' }}>
          {allStickyNotes.map((note) => {
            const content = extractContent(note);

            console.log("➡️ Note object:", note);
            console.log("  fields.plainText:", note.fields?.plainText);
            console.log("  data.content:", note.data?.content);
            console.log("  text:", note.text);
            console.log("  title:", note.title);

            return (
              <div
                key={note.id}
                onClick={() => handleStickySelect(note)}
                style={{
                  padding: '6px',
                  borderRadius: '5px',
                  marginBottom: '5px',
                  backgroundColor: note.id === selectedStickyId ? '#cce5ff' : '#f9f9f9',
                  cursor: 'pointer',
                  border: '1px solid #ccc'
                }}
              >
                {content ? content.slice(0, 100) : '(Empty Sticky Note)'}
              </div>
            );
          })}
        </div>
      ) : (
        <p style={{ color: '#888', fontStyle: 'italic', marginBottom: '15px' }}>
          No sticky notes found on this board.
        </p>
      )}

      <textarea
        placeholder="Or manually paste sticky note text..."
        rows={3}
        value={stickyNoteText}
        onChange={(e) => setStickyNoteText(e.target.value)}
        style={{
          width: '100%',
          padding: '10px',
          border: '1px solid #ccc',
          borderRadius: '8px',
          marginBottom: '10px',
          resize: 'vertical',
        }}
      />

      <input
        placeholder="Custom prompt (optional)"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        style={{
          width: '100%',
          padding: '8px',
          border: '1px solid #ccc',
          borderRadius: '8px',
          marginBottom: '15px',
        }}
      />

      <button onClick={handleGenerateIdeas} className="button button-primary" style={{ width: '100%', marginBottom: '20px' }}>
        {loading ? 'Generating...' : 'Generate AI Ideas'}
      </button>

      {loading && <p style={{ textAlign: 'center' }}>🧠 Thinking of ideas...</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {suggestions.map((idea, index) => (
          <div key={index} style={{ border: '1px solid #ddd', borderRadius: '10px', overflow: 'hidden' }}>
            <button
              onClick={() => toggleAccordion(index)}
              style={{
                backgroundColor: '#f0f0f0',
                padding: '10px',
                width: '100%',
                textAlign: 'left',
                fontWeight: 'bold',
                cursor: 'pointer',
                border: 'none',
                outline: 'none'
              }}
            >
              {`Idea ${index + 1}`}
            </button>
            {expanded === index && (
              <div style={{ padding: '15px', backgroundColor: '#fff' }}>
                <div
                  style={{ fontSize: '14px', lineHeight: '1.6', marginBottom: '10px', whiteSpace: 'pre-wrap' }}
                  dangerouslySetInnerHTML={{
                    __html: idea
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/---/g, '')
                      .replace(/(?:\r\n|\r|\n)/g, '<br/>')
                  }}
                />
                <button
                  onClick={() => addToMiroBoard(idea)}
                  className="button button-primary"
                  style={{ fontSize: '12px', padding: '5px 10px' }}
                >
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

export async function generateImageIdeas() {
  try {
    // Get selected item IDs (shapes and sticky notes) from the Miro board
    const selection = await miro.board.getSelection();
    const itemIds = selection
      .filter(item => item.type === 'shape' || item.type === 'sticky_note')
      .map(item => item.id);

    if (itemIds.length === 0) {
      alert("Please select one or more shapes or sticky notes.");
      return;
    }

    // Make the POST request to your backend
    const response = await fetch("http://localhost:5050/generate-image-ideas", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ selectedShapeIds: itemIds }), // Keep key name aligned with backend
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Image generation failed:", response.status, errorText);
      alert("Something went wrong while generating image ideas.");
      return;
    }

    const result = await response.json();
    console.log(`${result.images_added} images added to Miro board`);
    alert(`${result.images_added} creative image(s) added to your board.`);

  } catch (error) {
    console.error("Network error:", error);
    alert("Could not connect to backend.");
  }
}