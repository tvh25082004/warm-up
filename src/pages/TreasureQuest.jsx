import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Heart, Zap, Compass, Eye, 
  Key, Star, Trophy, Radio, Mic, RefreshCw,
  Trees, Bird, Dog, Cat, Fish
} from 'lucide-react';
import confetti from 'canvas-confetti';
import '../styles/TreasureQuest.css';

// Custom Animal Icons for Jungle theme
const DeerIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v4M12 2l-2 2M12 2l2 2M16 4l-2 2M8 4l2 2M9 10a3 3 0 1 0 6 0" />
    <path d="M12 13v6M9 22h6" />
    <rect x="8" y="10" width="8" height="8" rx="2" />
  </svg>
);

const ElephantIcon = () => (
  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 6c4 0 7 3 7 7v4h-2a2 2 0 0 1-4 0h-2a2 2 0 0 1-4 0H5v-4c0-4 3-7 7-7Z" />
    <path d="M3 13c0-3 2-5 4-5M21 13c0-3-2-5-4-5" />
    <path d="M12 17v4M8 17v2M16 17v2" />
    <path d="M12 6V4M10 4h4" />
  </svg>
);

const DEFAULT_QUESTIONS = [
  { question: "The elephant is the ___ animal on land.", optionA: "big", optionB: "bigger", optionC: "biggest", optionD: "small", answer: "C", hint: "It is the largest." },
  { question: "A ___ has long antlers and lives in the forest.", optionA: "Bird", optionB: "Deer", optionC: "Fish", optionD: "Lion", answer: "B", hint: "It is known for its antlers." },
  { question: "The bird can ___ high in the sky.", optionA: "swim", optionB: "run", optionC: "fly", optionD: "crawl", answer: "C", hint: "Using wings." },
  { question: "We found an ___ temple in the jungle.", optionA: "new", optionB: "modern", optionC: "ancient", optionD: "future", answer: "C", hint: "Very, very old." },
  { question: "Be careful! There are ___ in the river.", optionA: "monkeys", optionB: "crocodiles", optionC: "elephants", optionD: "birds", answer: "B", hint: "Green, sharp teeth." }
];

// Maze path coordinates (normalized 0-100)
const MAZE_PATH = "M 10,85 C 30,85 10,60 40,60 C 70,60 50,40 80,40 C 90,40 90,20 85,15";

const TreasureQuest = () => {
  const navigate = useNavigate();
  const [screen, setScreen] = useState('home'); // home, playing, victory
  const [questions, setQuestions] = useState([]);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [hearts, setHearts] = useState(3);
  const [score, setScore] = useState(0);
  const [items, setItems] = useState({ compass: 2, eye: 2 });
  const [feedback, setFeedback] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [disabledOptions, setDisabledOptions] = useState([]);
  const [showHint, setShowHint] = useState(false);
  const [progress, setProgress] = useState(0); // 0 to 1 along the path

  useEffect(() => {
    const stored = localStorage.getItem('active_treasure_questions');
    if (stored) {
      try {
        const p = JSON.parse(stored);
        if (Array.isArray(p) && p.length > 0) {
          setQuestions(p);
          localStorage.removeItem('active_treasure_questions');
          return;
        }
      } catch (e) { console.error(e); }
    }
    setQuestions(DEFAULT_QUESTIONS);
  }, []);

  const handleAnswer = (choice) => {
    if (feedback || hearts <= 0) return;
    const correct = choice === questions[currentQIdx].answer;
    if (correct) {
      setFeedback('correct');
      setScore(s => s + 25);
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 }, colors: ['#8B4513', '#FFD700', '#4CAF50'] });
      
      setTimeout(() => {
        const nextIdx = currentQIdx + 1;
        const nextProgress = (nextIdx / questions.length);
        setProgress(nextProgress);
        
        if (nextIdx < questions.length) {
          setCurrentQIdx(nextIdx);
          setFeedback(null);
          setDisabledOptions([]);
          setShowHint(false);
        } else {
          setScreen('victory');
        }
      }, 1500);
    } else {
      setFeedback('wrong');
      setHearts(h => Math.max(0, h - 1));
      setTimeout(() => setFeedback(null), 1200);
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

  const renderHome = () => (
    <motion.div className="tq-screen tq-home" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="tq-hero">
        <div className="tq-jungle-decor top-left"><ElephantIcon /></div>
        <div className="tq-jungle-decor top-right"><Bird size={48} /></div>
        <div className="tq-jungle-decor bottom-left"><DeerIcon /></div>
        
        <motion.div className="tq-main-chest" animate={{ y: [0, -10, 0] }} transition={{ duration: 2, repeat: Infinity }}>💰</motion.div>
        <h1 className="tq-title">JUNGLE MAZE</h1>
        <p className="tq-subtitle">Treasure Quest Adventure</p>
        
        <div className="tq-home-btns">
          <button className="tq-btn tq-btn-start" onClick={() => setScreen('playing')}>
            <Zap size={24} /> BẮT ĐẦU TÌM KHO BÁU
          </button>
          <button className="tq-btn tq-btn-back" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={18} /> QUAY LẠI
          </button>
        </div>
      </div>
    </motion.div>
  );

  const renderPlaying = () => {
    const q = questions[currentQIdx];
    // Calculate character position along the SVG path based on progress
    // In a real app we'd use getPointAtLength, but for React we can use pathLength and motion
    return (
      <motion.div className="tq-screen tq-maze-layout" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <header className="tq-maze-header">
          <div className="tq-hud-left">
            <div className="tq-hearts-row">
              {[...Array(3)].map((_, i) => (
                <Heart key={i} size={24} fill={i < hearts ? '#FF5252' : 'transparent'} color={i < hearts ? '#FF5252' : '#5D4037'} className={i < hearts ? 'h-active' : ''} />
              ))}
            </div>
          </div>
          <div className="tq-hud-center">
            <span className="tq-progress-text">Step {currentQIdx + 1} of {questions.length}</span>
          </div>
          <div className="tq-hud-right">
            <div className="tq-score-badge">🏆 {score}</div>
          </div>
        </header>

        <div className="tq-maze-visual">
          <svg className="tq-svg-maze" viewBox="0 0 100 100">
            <path d={MAZE_PATH} className="maze-bg-path" />
            <motion.path 
              d={MAZE_PATH} 
              className="maze-fill-path" 
              initial={{ pathLength: 0 }} 
              animate={{ pathLength: progress }} 
              transition={{ duration: 1.2 }}
            />
            {/* Chests along the way */}
            {questions.map((_, i) => {
              const p = (i / (questions.length - 1)) || 0;
              // Simple placement for demo
              return <text key={i} x={10 + p*75} y={85 - p*70} className="maze-chest">📦</text>;
            })}
            
            {/* The character following the path */}
            <motion.circle 
              r="2.5" 
              fill="#FFD700" 
              className="maze-character-dot"
              animate={{ cx: 10 + progress*75, cy: 85 - progress*70 }} // Simplified path following
              transition={{ duration: 1.2 }}
            />
          </svg>
          
          <div className="tq-decor deer"><DeerIcon /></div>
          <div className="tq-decor elephant"><ElephantIcon /></div>
          <div className="tq-decor bird"><Bird size={40} /></div>
        </div>

        <main className="tq-question-view">
          <AnimatePresence mode="wait">
            <motion.div 
              key={currentQIdx}
              className={`tq-question-card ${feedback === 'wrong' ? 'shake' : ''}`}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              {feedback && <div className={`tq-status ${feedback}`}>{feedback === 'correct' ? '🎉 TUYỆT VỜI!' : '⚠️ SAI MẤT RỒI!'}</div>}
              <div className="tq-q-box">
                <p className="tq-q-content">{q.question.replace('___', '______')}</p>
                {showHint && <p className="tq-q-hint">💡 {q.hint}</p>}
              </div>
              
              <div className="tq-ans-grid">
                {['A', 'B', 'C', 'D'].map(k => {
                  const isCorrect = feedback === 'correct' && q.answer === k;
                  const isWrong = feedback === 'wrong' && k === q.answer; // highlight correct one even on wrong?
                  return (
                    <button 
                      key={k} 
                      className={`tq-ans-btn ${isCorrect ? 'a-correct' : ''} ${disabledOptions.includes(k) ? 'a-disabled' : ''}`}
                      onClick={() => handleAnswer(k)}
                      disabled={!!feedback || disabledOptions.includes(k)}
                    >
                      <span className="a-key">{k}</span>
                      <span className="a-text">{q[`option${k}`]}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </AnimatePresence>
        </main>

        <footer className="tq-maze-footer">
          <div className="tq-items">
            <button className="tq-item-btn" onClick={() => { if (items.compass > 0) { setItems(it => ({...it, compass: it.compass-1})); setDisabledOptions(['A','B','C','D'].filter(k => k !== q.answer).sort(() => 0.5 - Math.random()).slice(0, 2)) }} } disabled={items.compass <= 0 || !!feedback}>
              <Compass size={20} /> <span>{items.compass}</span>
            </button>
            <button className="tq-item-btn" onClick={() => { if (items.eye > 0) { setItems(it => ({...it, eye: it.eye-1})); setShowHint(true) }} } disabled={items.eye <= 0 || !!feedback}>
              <Eye size={20} /> <span>{items.eye}</span>
            </button>
          </div>
          <button className={`tq-voice-btn ${isListening ? 'listening' : ''}`} onClick={startListening} disabled={!!feedback}>
            <Mic size={20} /> {isListening ? "ĐANG NGHE..." : "ĐỌC ĐÁP ÁN"}
          </button>
        </footer>
      </motion.div>
    );
  };

  const renderVictory = () => (
    <motion.div className="tq-screen tq-victory" initial={{ scale: 0.5 }} animate={{ scale: 1 }}>
      <div className="tq-victory-box">
        <div className="v-chest">👑💰👑</div>
        <h2>CHÚC MỪNG NHÀ THÁM HIỂM!</h2>
        <p>Bạn đã tìm thấy kho báu khổng lồ!</p>
        <div className="v-stats">
          <div className="v-stat"><span>SCORE</span> <strong>{score}</strong></div>
          <div className="v-stat"><span>ITEMS USED</span> <strong>{4 - (items.compass + items.eye)}</strong></div>
        </div>
        <div className="v-btns">
          <button className="v-btn-play" onClick={() => window.location.reload()}><RefreshCw size={20} /> CHƠI LẠI</button>
          <button className="v-btn-home" onClick={() => navigate('/dashboard')}>VỀ TRANG CHỦ</button>
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className="treasure-maze-container">
      <AnimatePresence mode="wait">
        {screen === 'home' && renderHome()}
        {screen === 'playing' && renderPlaying()}
        {screen === 'victory' && renderVictory()}
      </AnimatePresence>
    </div>
  );
};

export default TreasureQuest;
