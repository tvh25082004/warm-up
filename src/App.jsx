import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import HeadTiltGame from './pages/HeadTiltGame';
import VocabMatchGame from './pages/VocabMatchGame';
import QuestionBuilder from './pages/QuestionBuilder';
import ImportQuestions from './pages/ImportQuestions';
import GameSetSelector from './pages/GameSetSelector';
import audioManager from './services/AudioManager';
import './App.css';

function App() {
  useEffect(() => {
    const startMusic = () => {
      audioManager.startBackgroundMusic();
      window.removeEventListener('click', startMusic);
      window.removeEventListener('keydown', startMusic);
      window.removeEventListener('touchstart', startMusic);
    };

    // Try to auto-play immediately (works if user has previously interacted)
    audioManager.startBackgroundMusic();

    // Fallback: play on first interaction to bypass browser autoplay block
    window.addEventListener('click', startMusic);
    window.addEventListener('keydown', startMusic);
    window.addEventListener('touchstart', startMusic);

    return () => {
      window.removeEventListener('click', startMusic);
      window.removeEventListener('keydown', startMusic);
      window.removeEventListener('touchstart', startMusic);
    };
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        {/* Game set selector is the pre-game screen */}
        <Route path="/game/select" element={<GameSetSelector />} />
        <Route path="/game/headtilt" element={<HeadTiltGame />} />
        <Route path="/game/vocabmatch" element={<VocabMatchGame />} />
        <Route path="/builder" element={<QuestionBuilder />} />
        <Route path="/import" element={<ImportQuestions />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
