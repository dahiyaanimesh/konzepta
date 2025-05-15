import React from 'react';
import '../assets/style.css';
import GenerateIdeasButton from '../components/GenerateIdeasButton';
import MiroAuth from '../components/MiroAuth';

export default function Page() {
  return (
    <div style={{ display: 'inline', justifyContent: 'center', padding: '2rem' }}>
      {/* This component handles the Miro authentication silently */}
      <MiroAuth />
      <GenerateIdeasButton /> 
    </div>
  );
}

