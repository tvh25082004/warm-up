import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Heart, Shield, Mic, RefreshCw } from 'lucide-react';
import confetti from 'canvas-confetti';
import '../styles/ZombieDefense.css';

// Simple SVG SVGs
const ArcherSVG = ({ isShooting }) => (
  <svg width="150" height="200" viewBox="0 0 150 200" className={`arch-char ${isShooting ? 'shooting' : ''}`}>
    {/* Head - Glasses Boy */}
    <circle cx="75" cy="50" r="35" fill="#FFCC99" />
    {/* Hair */}
    <path d="M40 50 Q 75 0 110 50 Z" fill="#FFD700" />
    {/* Glasses */}
    <circle cx="60" cy="50" r="10" fill="none" stroke="#222" strokeWidth="3" />
    <circle cx="90" cy="50" r="10" fill="none" stroke="#222" strokeWidth="3" />
    <path d="M70 50 L 80 50" stroke="#222" strokeWidth="3" />
    <circle cx="60" cy="50" r="2" fill="#000" />
    <circle cx="90" cy="50" r="2" fill="#000" />
    {/* Smile */}
    <path d="M65 70 Q 75 80 85 70" fill="none" stroke="#222" strokeWidth="2" />
    
    {/* Body */}
    <rect x="55" y="85" width="40" height="60" fill="#3498DB" rx="5" />
    {/* Legs */}
    <rect x="60" y="145" width="12" height="40" fill="#2980B9" />
    <rect x="78" y="145" width="12" height="40" fill="#2980B9" />
    {/* Shoes */}
    <rect x="55" y="185" width="20" height="10" fill="#34495E" rx="3" />
    <rect x="75" y="185" width="20" height="10" fill="#34495E" rx="3" />
    
    {/* Bow and Arm */}
    <path d="M75 110 L 115 110" stroke="#FFCC99" strokeWidth="12" strokeLinecap="round" className="arm" />
    <path d="M110 60 Q 140 110 110 160" fill="none" stroke="#5D4037" strokeWidth="6" className="bow" />
    <path d="M110 60 L 110 160" stroke="#EEE" strokeWidth="2" className="bow-string" />
  </svg>
);

const ZombieSVG = ({ isDead }) => (
  <svg width="150" height="200" viewBox="0 0 150 200" className={`zomb-char ${isDead ? 'dead' : ''}`}>
    {/* Head - Masked */}
    <circle cx="75" cy="50" r="30" fill="#00BCD4" />
    {/* Mask details */}
    <circle cx="65" cy="45" r="5" fill="#000" />
    <circle cx="85" cy="45" r="5" fill="#000" />
    <path d="M65 65 L 85 65 M70 60 L 70 70 M80 60 L 80 70" stroke="#000" strokeWidth="2" />
    
    {/* Body with arrows already in it? Or just dirty shirt */}
    <path d="M60 80 L 90 80 L 100 150 L 50 150 Z" fill="#D7CCC8" />
    <path d="M 50 150 L 90 100" stroke="#A1887F" strokeWidth="2" />
    
    {/* Legs */}
    <rect x="60" y="150" width="12" height="40" fill="#455A64" />
    <rect x="78" y="150" width="12" height="40" fill="#455A64" />
    {/* Shoes */}
    <rect x="50" y="190" width="20" height="10" fill="#333" rx="3" />
    <rect x="80" y="190" width="20" height="10" fill="#333" rx="3" />
    
    {/* Arms reaching out */}
    <path d="M65 100 L 20 120" stroke="#A5D6A7" strokeWidth="10" strokeLinecap="round" className="z-arm" />
  </svg>
);

const ArrowProjectile = ({ active }) => {
  if (!active) return null;
  return (
    <motion.svg width="60" height="10" viewBox="0 0 60 10" className="arrow-proj"
      initial={{ x: 120, y: 110 }}
      animate={{ x: window.innerWidth > 800 ? 600 : 250, y: 110 }}
      transition={{ duration: 0.3, ease: 'linear' }}
    >
      <rect x="5" y="3" width="50" height="4" fill="#FFB74D" />
      <polygon points="55,0 60,5 55,10" fill="#E65100" />
      <polygon points="0,0 5,5 0,10" fill="#F44336" />
    </motion.svg>
  );
};

const DEFAULT_QUESTIONS = [
  { question: "This is ___ apple.", optionA: "a", optionB: "an", optionC: "the", optionD: "some", answer: "B", hint: "Vowel sound" },
  { question: "I like ___ dog over there.", optionA: "this", optionB: "that", optionC: "these", optionD: "those", answer: "B", hint: "Far away singular" }
];

const ZombieDefense = () => {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState(DEFAULT_QUESTIONS);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [hearts, setHearts] = useState(3);
  const [status, setStatus] = useState('playing'); // playing, shooting, dead, victory, gameover
  const [wrongAnswers, setWrongAnswers] = useState([]); 
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('active_zombie_questions');
    if (stored) {
      try {
        const p = JSON.parse(stored);
        if (Array.isArray(p) && p.length > 0) {
          setQuestions(p);
          localStorage.removeItem('active_zombie_questions');
        }
      } catch (e) { console.error(e); }
    }
  }, []);

  const handleAnswer = (choice) => {
    if (status !== 'playing' || wrongAnswers.includes(choice)) return;

    const q = questions[currentQIdx];
    if (choice === q.answer) {
      // Correct! Shoot arrow
      setStatus('shooting');
      setScore(s => s + 20);
      
      setTimeout(() => {
        // Arrow hits zombie
        setStatus('dead');
        confetti({ particleCount: 50, spread: 60, origin: { x: 0.8, y: 0.7 } });
        
        setTimeout(() => {
          // Next level or victory
          if (currentQIdx < questions.length - 1) {
            setCurrentQIdx(i => i + 1);
            setWrongAnswers([]);
            setStatus('playing');
          } else {
            setStatus('victory');
          }
        }, 1000);

      }, 300); // Time for arrow to fly

    } else {
      // Wrong! Add to wrong list, stay on screen
      setWrongAnswers(prev => [...prev, choice]);
      setHearts(h => Math.max(0, h - 1));
      
      // Flash screen red briefly
      document.querySelector('.zd-container').classList.add('shake-red');
      setTimeout(() => {
        const el = document.querySelector('.zd-container');
        if (el) el.classList.remove('shake-red');
      }, 400);

      if (hearts <= 1) {
        // Just let them keep playing for learning purposes, but maybe show a hint?
      }
    }
  };

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert('Speech recognition not supported');
    const r = new SR();
    r.lang = 'en-US';
    r.onstart = () => setIsListening(true);
    r.onend = () => setIsListening(false);
    r.onresult = (e) => {
      const t = e.results[0][0].transcript.toUpperCase();
      const m = t.match(/\b([ABCD])\b/);
      if (m) handleAnswer(m[1]);
    };
    r.start();
  };

  const currentQ = questions[currentQIdx];

  if (status === 'victory') {
    return (
      <div className="zd-container">
        <div className="zd-victory-modal">
          <h1>KHU VƯỜN AN TOÀN!</h1>
          <p>Bạn đã tiêu diệt tất cả zombie bằng kiến thức của mình.</p>
          <div className="zd-score-box">SCORE: {score}</div>
          <button className="zd-btn-primary" onClick={() => navigate('/dashboard')}>VỀ TRANG CHỦ</button>
        </div>
      </div>
    );
  }

  return (
    <div className="zd-container">
      {/* Header UI */}
      <header className="zd-header">
        <div className="zd-header-left">
          <button className="zd-icon-btn" onClick={() => navigate('/dashboard')}><ArrowLeft size={20}/></button>
          <div className="zd-hearts">
            {[...Array(3)].map((_, i) => (
              <Heart key={i} size={28} fill={i < hearts ? '#E91E63' : 'rgba(0,0,0,0.3)'} color={i < hearts ? '#E91E63' : 'transparent'} />
            ))}
          </div>
        </div>
        <div className="zd-level">
          ZOMBIE {currentQIdx + 1}/{questions.length}
        </div>
        <div className="zd-score">🪙 {score}</div>
      </header>

      {/* Main Game UI: Garden Background + Characters */}
      <div className="zd-battleground">
        <div className="zd-archer-wrapper">
          <ArcherSVG isShooting={status === 'shooting'} />
          <ArrowProjectile active={status === 'shooting'} />
        </div>
        
        <div className="zd-zombie-wrapper">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={currentQIdx} // Remount zombie for each new question
              initial={{ x: 200, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ opacity: 0 }}
              className="zombie-scaler"
            >
              <ZombieSVG isDead={status === 'dead'} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Floating Question UI in the sky */}
      <div className="zd-question-area">
        <div className="zd-q-box">
          <h2>{currentQ.question.replace('___', '______')}</h2>
        </div>
        
        <div className="zd-options-row">
          {['A', 'B', 'C', 'D'].map(k => {
            const isWrong = wrongAnswers.includes(k);
            return (
              <button 
                key={k} 
                className={`zd-opt-btn ${isWrong ? 'wrong-disabled' : ''}`}
                onClick={() => handleAnswer(k)}
                disabled={isWrong || status !== 'playing'}
              >
                <div className="zd-opt-key">{k}</div>
                <div className="zd-opt-text">{currentQ[`option${k}`]}</div>
              </button>
            );
          })}
        </div>

        <div className="zd-mic-row">
          <button className={`zd-mic-btn ${isListening ? 'listening' : ''}`} onClick={startListening}>
            {isListening ? <Mic size={24} className="mic-spin" /> : <Mic size={24} />}
            {isListening ? " ĐANG NGHE..." : " ĐỌC ĐÁP ÁN (A/B/C/D)"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ZombieDefense;
