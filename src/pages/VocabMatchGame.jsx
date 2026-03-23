import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, RotateCcw, Music, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import audioManager from '../services/AudioManager';
import '../styles/Game.css';

const VOCAB_PAIRS = [
  { id: 1, left: "Cat", right: "Con mèo", emoji: "🐱" },
  { id: 2, left: "Dog", right: "Con chó", emoji: "🐶" },
  { id: 3, left: "Apple", right: "Quả táo", emoji: "🍎" },
  { id: 4, left: "Book", right: "Quyển sách", emoji: "📚" },
  { id: 5, left: "School", right: "Trường học", emoji: "🏫" },
  { id: 6, left: "Sun", right: "Mặt trời", emoji: "☀️" },
  { id: 7, left: "Star", right: "Ngôi sao", emoji: "⭐" },
  { id: 8, left: "Fish", right: "Con cá", emoji: "🐟" },
];

const shuffleArray = (array) => [...array].sort(() => Math.random() - 0.5);

const VocabMatchGame = () => {
  const navigate = useNavigate();
  const [currentPairs, setCurrentPairs] = useState(VOCAB_PAIRS);
  const [leftCards, setLeftCards] = useState([]);
  const [rightCards, setRightCards] = useState([]);
  const [selectedLeft, setSelectedLeft] = useState(null);
  const [selectedRight, setSelectedRight] = useState(null);
  const [matchedIds, setMatchedIds] = useState([]);
  const [wrongPair, setWrongPair] = useState(false);
  const [score, setScore] = useState(0);
  const [musicOn, setMusicOn] = useState(false);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    initGame();
    return () => audioManager.stopBackgroundMusic();
  }, []);

  const toggleMusic = () => {
    if (musicOn) {
      audioManager.stopBackgroundMusic();
    } else {
      audioManager.startBackgroundMusic();
    }
    setMusicOn(!musicOn);
  };

  const initGame = () => {
    let pairs = VOCAB_PAIRS;
    try {
      const stored = localStorage.getItem('active_vocab_pairs');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          pairs = parsed.map((p, i) => ({
            id: i + 1,
            left: p.left,
            right: p.right,
            emoji: p.emoji || '✨'
          }));
        }
      }
    } catch (e) {}

    setCurrentPairs(pairs);
    setLeftCards(shuffleArray(pairs.map(p => ({ id: p.id, text: p.left, emoji: p.emoji }))));
    setRightCards(shuffleArray(pairs.map(p => ({ id: p.id, text: p.right, emoji: p.emoji }))));
    setMatchedIds([]);
    setSelectedLeft(null);
    setSelectedRight(null);
    setScore(0);
    setStreak(0);
    setWrongPair(false);
  };

  useEffect(() => {
    if (selectedLeft !== null && selectedRight !== null) {
      if (selectedLeft === selectedRight) {
        // Match!
        audioManager.playCorrectSound();
        const newStreak = streak + 1;
        setStreak(newStreak);
        const bonus = newStreak >= 3 ? 10 : 0; // Streak bonus!
        
        setTimeout(() => {
          setMatchedIds(prev => [...prev, selectedLeft]);
          setSelectedLeft(null);
          setSelectedRight(null);
          setScore(s => s + 20 + bonus);
          confetti({
            particleCount: 60 + newStreak * 20,
            spread: 50 + newStreak * 10,
            origin: { y: 0.7 },
            colors: ['#00A699', '#F4C03B', '#FF5A5F', '#9C27B0', '#2196F3']
          });
        }, 400);
      } else {
        // No match
        audioManager.playWrongSound();
        setWrongPair(true);
        setStreak(0);
        setTimeout(() => {
          setSelectedLeft(null);
          setSelectedRight(null);
          setWrongPair(false);
          setScore(s => Math.max(0, s - 5));
        }, 700);
      }
    }
  }, [selectedLeft, selectedRight]);

  const allMatched = matchedIds.length === currentPairs.length && currentPairs.length > 0;
  
  useEffect(() => {
    if (allMatched) {
      const end = Date.now() + 4000;
      const interval = setInterval(() => {
        if (Date.now() > end) return clearInterval(interval);
        confetti({
          particleCount: 100,
          spread: 120,
          origin: { x: Math.random(), y: Math.random() * 0.5 },
          colors: ['#FF5A5F', '#00A699', '#FFC107', '#9C27B0', '#2196F3', '#FF9800']
        });
      }, 300);
    }
  }, [allMatched]);

  return (
    <div className="game-container" style={{ background: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 50%, #8ec5fc 100%)' }}>
      {/* Floating bubbles */}
      {[...Array(10)].map((_, i) => (
        <motion.div
          key={i}
          className="game-particle"
          style={{
            width: 15 + Math.random() * 25,
            height: 15 + Math.random() * 25,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            background: ['#FF5A5F', '#00A699', '#FFC107', '#9C27B0', '#2196F3'][i % 5],
          }}
          animate={{
            y: [0, -40 - Math.random() * 30, 0],
            x: [0, (Math.random() - 0.5) * 50, 0],
            opacity: [0.2, 0.5, 0.2],
            scale: [1, 1.4, 1],
          }}
          transition={{ repeat: Infinity, duration: 4 + Math.random() * 3, delay: Math.random() * 2 }}
        />
      ))}

      <div className="game-header glass-panel">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={20} /> Quay lại
        </button>
        <h2>🧩 Ghép Từ Vựng</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="music-btn" onClick={toggleMusic}>
            <Music size={20} color={musicOn ? '#9C27B0' : '#999'} />
          </button>
          <div className="score-badge" style={{ background: 'linear-gradient(135deg, #9C27B0, #E91E63)' }}>
            <Star size={20} fill="white" /> {score}
          </div>
          {streak >= 2 && (
            <motion.div 
              className="streak-badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              key={streak}
            >
              🔥 x{streak}
            </motion.div>
          )}
        </div>
      </div>

      <div className="game-content" style={{ paddingTop: 20 }}>
        <AnimatePresence mode="wait">
          {allMatched ? (
            <motion.div 
              className="victory-screen glass-panel"
              initial={{ scale: 0, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', bounce: 0.5 }}
            >
              <motion.div
                animate={{ rotate: [0, 5, -5, 5, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
                style={{ fontSize: '4rem' }}
              >
                🏆
              </motion.div>
              <h1 style={{ color: '#9C27B0', marginBottom: 10 }}>Giỏi quá!</h1>
              <p style={{ fontSize: '1.3rem', color: '#555' }}>
                Bạn đã ghép đúng tất cả và đạt <b style={{ color: '#FF5A5F' }}>{score}</b> điểm!
              </p>
              <motion.button 
                className="start-game-btn"
                onClick={initGame} 
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                style={{ marginTop: 25, background: 'linear-gradient(135deg, #9C27B0, #E91E63)' }}
              >
                <RotateCcw size={20} /> Chơi Lại!
              </motion.button>
            </motion.div>
          ) : (
            <motion.div 
              className="vocab-grid"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="vocab-column">
                <div className="column-label">🇬🇧 English</div>
                {leftCards.map((item, idx) => (
                  <motion.div
                    key={`left-${item.id}`}
                    className={`vocab-card ${selectedLeft === item.id ? 'selected' : ''} ${matchedIds.includes(item.id) ? 'matched' : ''} ${wrongPair && selectedLeft === item.id ? 'wrong-shake' : ''}`}
                    onClick={() => !matchedIds.includes(item.id) && setSelectedLeft(item.id)}
                    initial={{ x: -50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: idx * 0.08 }}
                    whileHover={!matchedIds.includes(item.id) ? { scale: 1.05, y: -3 } : {}}
                    whileTap={!matchedIds.includes(item.id) ? { scale: 0.95 } : {}}
                  >
                    <span className="card-emoji">{item.emoji}</span>
                    {item.text}
                  </motion.div>
                ))}
              </div>

              <div className="vocab-column">
                <div className="column-label">🇻🇳 Tiếng Việt</div>
                {rightCards.map((item, idx) => (
                  <motion.div
                    key={`right-${item.id}`}
                    className={`vocab-card ${selectedRight === item.id ? 'selected' : ''} ${matchedIds.includes(item.id) ? 'matched' : ''} ${wrongPair && selectedRight === item.id ? 'wrong-shake' : ''}`}
                    onClick={() => !matchedIds.includes(item.id) && setSelectedRight(item.id)}
                    initial={{ x: 50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: idx * 0.08 }}
                    whileHover={!matchedIds.includes(item.id) ? { scale: 1.05, y: -3 } : {}}
                    whileTap={!matchedIds.includes(item.id) ? { scale: 0.95 } : {}}
                  >
                    {item.text}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Progress indicator */}
        {!allMatched && (
          <div className="match-progress">
            {currentPairs.map((_, i) => (
              <motion.div 
                key={i}
                className={`progress-dot ${matchedIds.length > i ? 'filled' : ''}`}
                animate={matchedIds.length > i ? { scale: [1, 1.5, 1] } : {}}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default VocabMatchGame;
