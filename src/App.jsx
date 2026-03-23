import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import HeadTiltGame from './pages/HeadTiltGame';
import VocabMatchGame from './pages/VocabMatchGame';
import QuestionBuilder from './pages/QuestionBuilder';
import ImportQuestions from './pages/ImportQuestions';
import GameSetSelector from './pages/GameSetSelector';
import './App.css';

function App() {
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
