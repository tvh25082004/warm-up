import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Heart, Zap, Compass, Eye, Shield, 
  Map as MapIcon, Key, Star, Trophy, Radio, Mic, MicOff, RefreshCw
} from 'lucide-react';
import confetti from 'canvas-confetti';
import '../styles/TreasureQuest.css';

const REGIONS = [
  { 
    id: 1, name: 'Jungle of Origins', 
    color: '#4CAF50', secondary: '#81C784', 
    icon: '🌿', bg: 'linear-gradient(135deg, #1B5E20, #4CAF50)',
    desc: 'Bắt đầu hành trình tại khu rừng xanh mướt. Tìm từ vựng cơ bản!'
  },
  { 
    id: 2, name: 'Mysterious Cave', 
    color: '#673AB7', secondary: '#9575CD', 
    icon: '💎', bg: 'linear-gradient(135deg, #311B92, #673AB7)',
    desc: 'Hang động tím huyền bí với những viên đá quý phát sáng.'
  },
  { 
    id: 3, name: 'Desert Temple', 
    color: '#FF9800', secondary: '#FFB74D', 
    icon: '🏺', bg: 'linear-gradient(135deg, #E65100, #FF9800)',
    desc: 'Đền cổ sa mạc đầy cát vàng. Thử thách ngữ pháp và cấu trúc!'
  },
  { 
    id: 4, name: 'Treasure Bay', 
    color: '#0288D1', secondary: '#4FC3F7', 
    icon: '🏴‍☠️', bg: 'linear-gradient(135deg, #01579B, #0288D1)',
    desc: 'Vịnh kho báu dưới ánh trăng. Trận chiến cuối cùng!'
  }
];

const DEFAULT_QUESTIONS = [
  { question: "What is the synonym of 'Ancient'?", optionA: "Modern", optionB: "Old", optionC: "New", optionD: "Fresh", answer: "B", hint: "It means existing for a long time." },
  { question: "Choose the correct spelling:", optionA: "Treasure", optionB: "Treausre", optionC: "Tresure", optionD: "Treashure", answer: "A", hint: "A collection of precious things." },
  { question: "Which word means 'a person who travels to find new things'?", optionA: "Teacher", optionB: "Explorer", optionC: "Doctor", optionD: "Cook", answer: "B", hint: "Like Indiana Jones." },
  { question: "The ___ is the king of the jungle.", optionA: "Cat", optionB: "Tiger", optionC: "Lion", optionD: "Monkey", answer: "C", hint: "It has a large mane." },
  { question: "Opposite of 'Difficult' is?", optionA: "Hard", optionB: "Easy", optionC: "Heavy", optionD: "Strong", answer: "B", hint: "Not taking much effort." }
];

const TreasureQuest = () => {
  const navigate = useNavigate();
  const [screen, setScreen] = useState('home'); // home, map, playing, reward, victory
  const [currentRegion, setCurrentRegion] = useState(REGIONS[0]);
  const [questions, setQuestions] = useState([]);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [hearts, setHearts] = useState(3);
  const [score, setScore] = useState(0);
  const [mapPieces, setMapPieces] = useState(0);
  const [keys, setKeys] = useState(0);
  const [items, setItems] = useState({ compass: 2, eye: 2 });
  const [feedback, setFeedback] = useState(null); // correct, wrong
  const [isListening, setIsListening] = useState(false);
  const [disabledOptions, setDisabledOptions] = useState([]);
  const [showHint, setShowHint] = useState(false);

  // Load questions
  useEffect(() => {
    const stored = localStorage.getItem('active_treasure_questions');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setQuestions(parsed);
          localStorage.removeItem('active_treasure_questions');
          return;
        }
      } catch (e) { console.error(e); }
    }
    setQuestions(DEFAULT_QUESTIONS);
  }, []);

  const handleStart = () => setScreen('map');

  const selectRegion = (region) => {
    if (region.id > mapPieces + 1) return; // Locked
    setCurrentRegion(region);
    setCurrentQIdx(0);
    setFeedback(null);
    setDisabledOptions([]);
    setShowHint(false);
    setScreen('playing');
  };

  const handleAnswer = (choice) => {
    if (feedback || hearts <= 0) return;
    const correct = choice === questions[currentQIdx].answer;
    if (correct) {
      setFeedback('correct');
      setScore(s => s + 20);
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: [currentRegion.color, '#FFD700', '#FFFFFF']
      });
      setTimeout(() => {
        if (currentQIdx < questions.length - 1) {
          setCurrentQIdx(i => i + 1);
          setFeedback(null);
          setDisabledOptions([]);
          setShowHint(false);
        } else {
          setScreen('reward');
        }
      }, 1500);
    } else {
      setFeedback('wrong');
      setHearts(h => Math.max(0, h - 1));
      setTimeout(() => {
        setFeedback(null);
        if (hearts <= 1) {
          // Game Over logic could go here, but let's just let them retry for now
        }
      }, 1200);
    }
  };

  const useCompass = () => {
    if (items.compass <= 0 || feedback) return;
    setItems(prev => ({ ...prev, compass: prev.compass - 1 }));
    const currentQ = questions[currentQIdx];
    const wrong = ['A', 'B', 'C', 'D'].filter(opt => opt !== currentQ.answer);
    const shuffled = wrong.sort(() => 0.5 - Math.random());
    setDisabledOptions(shuffled.slice(0, 2));
  };

  const useEye = () => {
    if (items.eye <= 0 || feedback) return;
    setItems(prev => ({ ...prev, eye: prev.eye - 1 }));
    setShowHint(true);
  };

  const claimReward = () => {
    setMapPieces(p => p + 1);
    setKeys(k => k + 1);
    if (currentRegion.id === 4) setScreen('victory');
    else setScreen('map');
  };

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert('Trình duyệt không hỗ trợ nhận diện giọng nói.');
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.toUpperCase();
      const match = transcript.match(/\b([ABCD])\b/);
      if (match) handleAnswer(match[1]);
    };
    recognition.start();
  };

  const renderHome = () => (
    <motion.div className="tq-screen tq-home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="tq-logo-container">
        <motion.div className="tq-chest-glow" animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }} transition={{ duration: 3, repeat: Infinity }} />
        <span className="tq-main-icon">💎</span>
        <h1>Lost Island</h1>
        <p>Vocabulary Hunt</p>
      </div>
      <div className="tq-home-actions">
        <button className="tq-btn tq-btn-primary" onClick={handleStart}>
          <Zap size={20} /> START ADVENTURE
        </button>
        <div className="tq-home-row">
          <button className="tq-btn tq-btn-secondary" disabled><Star size={18} /> COLLECTION</button>
          <button className="tq-btn tq-btn-secondary" disabled><Trophy size={18} /> RANKING</button>
        </div>
      </div>
    </motion.div>
  );

  const renderMap = () => (
    <motion.div className="tq-screen tq-map-screen" initial={{ x: 300 }} animate={{ x: 0 }} exit={{ x: -300 }}>
      <header className="tq-header">
        <button className="tq-back-btn" onClick={() => setScreen('home')}><ArrowLeft size={18} /> Back</button>
        <h2>Select Region</h2>
        <div className="tq-stats-mini">
          <span>🗝️ {keys}</span>
          <span>🗺️ {mapPieces}/4</span>
        </div>
      </header>
      <div className="tq-map-container">
        <svg className="tq-map-path" viewBox="0 0 400 600">
          <path d="M200,500 Q250,400 150,300 T200,100" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="4" strokeDasharray="10,10" />
        </svg>
        {REGIONS.map((region, idx) => {
          const isLocked = region.id > mapPieces + 1;
          const isCompleted = region.id <= mapPieces;
          return (
            <motion.div 
              key={region.id} 
              className={`tq-region-node node-${region.id} ${isLocked ? 'locked' : ''} ${isCompleted ? 'completed' : ''}`}
              whileHover={!isLocked ? { scale: 1.15 } : {}}
              onClick={() => selectRegion(region)}
            >
              <div className="node-icon" style={{ background: region.bg }}>
                {isLocked ? <Shield size={24} /> : region.icon}
              </div>
              <span className="node-name">{region.name}</span>
              {isCompleted && <Star className="node-star" size={16} fill="#FFD700" color="#FFD700" />}
            </motion.div>
          );
        })}
      </div>
      <div className="tq-map-footer">
        <p>Thu thập mảnh bản đồ để mở khóa kho báu cuối cùng!</p>
      </div>
    </motion.div>
  );

  const renderPlaying = () => {
    const q = questions[currentQIdx];
    return (
      <motion.div className="tq-screen tq-play-screen" style={{ '--region-color': currentRegion.color }}>
        <header className="tq-play-header">
          <div className="tq-header-left">
            <button className="tq-icon-btn" onClick={() => setScreen('map')}><MapIcon size={20} /></button>
            <div className="tq-progress">
              <span className="tq-label">{currentRegion.name}</span>
              <div className="tq-bar-bg"><div className="tq-bar-fill" style={{ width: `${(currentQIdx / questions.length) * 100}%` }} /></div>
              <span className="tq-count">{currentQIdx + 1}/{questions.length}</span>
            </div>
          </div>
          <div className="tq-header-right">
            <div className="tq-hearts">
              {[...Array(3)].map((_, i) => (
                <Heart key={i} size={22} fill={i < hearts ? '#E91E63' : 'rgba(255,255,255,0.2)'} color={i < hearts ? '#E91E63' : 'rgba(255,255,255,0.3)'} className={i < hearts ? 'pulsing' : ''} />
              ))}
            </div>
            <div className="tq-score">✨ {score}</div>
          </div>
        </header>

        <main className="tq-question-area">
          <AnimatePresence mode="wait">
            <motion.div 
              key={currentQIdx} 
              className={`tq-q-card glass-panel ${feedback === 'wrong' ? 'shake' : ''}`}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
            >
              {feedback && <div className={`tq-feedback-toast ${feedback}`}>{feedback === 'correct' ? '🌟 AWESOME!' : '💀 OOPS!'}</div>}
              <p className="tq-q-text">{q.question}</p>
              {showHint && <motion.div className="tq-hint-box" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>💡 {q.hint}</motion.div>}
            </motion.div>
          </AnimatePresence>

          <div className="tq-options-grid">
            {['A', 'B', 'C', 'D'].map(key => {
              const text = q[`option${key}`];
              const isDisabled = disabledOptions.includes(key);
              const isCorrect = feedback === 'correct' && q.answer === key;
              const isWrong = feedback === 'wrong' && key !== q.answer; // simplify
              return (
                <motion.button
                  key={key}
                  className={`tq-opt-card ${isDisabled ? 'disabled' : ''} ${isCorrect ? 'correct' : ''} ${isWrong ? 'wrong' : ''}`}
                  whileHover={!isDisabled && !feedback ? { scale: 1.02, y: -2 } : {}}
                  whileTap={!isDisabled && !feedback ? { scale: 0.98 } : {}}
                  onClick={() => handleAnswer(key)}
                  disabled={isDisabled || !!feedback}
                >
                  <span className="opt-label">{key}</span>
                  <span className="opt-text">{text}</span>
                </motion.button>
              );
            })}
          </div>
        </main>

        <footer className="tq-play-footer">
          <div className="tq-powers">
            <button className={`tq-power-btn ${items.compass <= 0 ? 'empty' : ''}`} onClick={useCompass}>
              <Compass size={24} /> <span className="p-count">{items.compass}</span>
              <span className="p-label">Compass</span>
            </button>
            <button className={`tq-power-btn ${items.eye <= 0 ? 'empty' : ''}`} onClick={useEye}>
              <Eye size={24} /> <span className="p-count">{items.eye}</span>
              <span className="p-label">Insight</span>
            </button>
          </div>
          <button className={`tq-mic-btn ${isListening ? 'listening' : ''}`} onClick={isListening ? () => {} : startListening}>
            {isListening ? <Mic size={24} /> : <Radio size={24} />}
            <span>{isListening ? "Listening..." : "Voice Answer"}</span>
          </button>
        </footer>
      </motion.div>
    );
  };

  const renderReward = () => (
    <motion.div className="tq-screen tq-reward" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
      <div className="reward-content glass-panel">
        <div className="reward-icon-container">
          <motion.div className="reward-chest" animate={{ rotate: [0, -5, 5, -5, 5, 0] }} transition={{ duration: 0.5, repeat: 3 }}>🎁</motion.div>
          <div className="reward-stars">⭐⭐⭐</div>
        </div>
        <h2>Region Cleared!</h2>
        <p>Bạn đã chinh phục được {currentRegion.name}</p>
        <div className="reward-items">
          <div className="reward-item">
            <Key size={30} color="#FFD700" />
            <span>Golden Key</span>
          </div>
          <div className="reward-item">
            <MapIcon size={30} color="#4CAF50" />
            <span>Map Piece</span>
          </div>
        </div>
        <button className="tq-btn tq-btn-primary" onClick={claimReward}>CONTINUE JOURNEY</button>
      </div>
    </motion.div>
  );

  const renderVictory = () => (
    <motion.div className="tq-screen tq-victory" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="victory-card glass-panel">
        <div className="victory-crown">👑</div>
        <h1>TREASURE FOUND!</h1>
        <p>Chúc mừng nhà thám hiểm tài ba! Bạn đã tìm thấy kho báu vĩ đại nhất của đảo hoang.</p>
        <div className="victory-stats">
          <div className="stat-box"><span>SCORE</span><strong>{score}</strong></div>
          <div className="stat-box"><span>LEVELS</span><strong>4/4</strong></div>
        </div>
        <div className="victory-actions">
          <button className="tq-btn tq-btn-primary" onClick={() => window.location.reload()}><RefreshCw size={20} /> REPLAY</button>
          <button className="tq-btn tq-btn-secondary" onClick={() => navigate('/dashboard')}>EXIT TO DASHBOARD</button>
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className={`treasure-quest-wrapper region-${currentRegion.id}`}>
      <AnimatePresence mode="wait">
        {screen === 'home' && renderHome()}
        {screen === 'map' && renderMap()}
        {screen === 'playing' && renderPlaying()}
        {screen === 'reward' && renderReward()}
        {screen === 'victory' && renderVictory()}
      </AnimatePresence>
    </div>
  );
};

export default TreasureQuest;
