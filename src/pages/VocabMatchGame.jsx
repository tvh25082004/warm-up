import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, RotateCcw } from 'lucide-react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import '../styles/Game.css';

const VOCAB_PAIRS = [
  { id: 1, left: "Cat", right: "Con mèo" },
  { id: 2, left: "Dog", right: "Con chó" },
  { id: 3, left: "Apple", right: "Quả táo" },
  { id: 4, left: "Book", right: "Quyển sách" },
  { id: 5, left: "School", right: "Trường học" }
];

const shuffleArray = (array) => [...array].sort(() => Math.random() - 0.5);

const VocabMatchGame = () => {
  const navigate = useNavigate();
  const [leftCards, setLeftCards] = useState([]);
  const [rightCards, setRightCards] = useState([]);
  
  const [selectedLeft, setSelectedLeft] = useState(null);
  const [selectedRight, setSelectedRight] = useState(null);
  const [matchedIds, setMatchedIds] = useState([]);
  
  const [score, setScore] = useState(0);

  useEffect(() => {
    initGame();
  }, []);

  const initGame = () => {
    setLeftCards(shuffleArray(VOCAB_PAIRS.map(p => ({ id: p.id, text: p.left }))));
    setRightCards(shuffleArray(VOCAB_PAIRS.map(p => ({ id: p.id, text: p.right }))));
    setMatchedIds([]);
    setSelectedLeft(null);
    setSelectedRight(null);
    setScore(0);
  };

  useEffect(() => {
    // Check for match
    if (selectedLeft !== null && selectedRight !== null) {
      if (selectedLeft === selectedRight) {
        // Match!
        setTimeout(() => {
          setMatchedIds(prev => [...prev, selectedLeft]);
          setSelectedLeft(null);
          setSelectedRight(null);
          setScore(s => s + 20);
          confetti({
            particleCount: 50,
            spread: 40,
            origin: { y: 0.8 },
            colors: ['#00A699', '#F4C03B']
          });
        }, 500);
      } else {
        // No match
        setTimeout(() => {
          setSelectedLeft(null);
          setSelectedRight(null);
          setScore(s => Math.max(0, s - 5)); // Penalty
        }, 800);
      }
    }
  }, [selectedLeft, selectedRight]);

  const allMatched = matchedIds.length === VOCAB_PAIRS.length && VOCAB_PAIRS.length > 0;
  
  useEffect(() => {
    if (allMatched) {
      setTimeout(() => {
        confetti({ particleCount: 400, spread: 120 });
      }, 500);
    }
  }, [allMatched]);

  return (
    <div className="game-container" style={{ background: 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)' }}>
      <div className="game-header glass-panel">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={20} /> Quay lại
        </button>
        <h2>Ghép Từ Vựng</h2>
        <div className="score-badge" style={{ background: '#9C27B0' }}>
          <Star size={20} fill="white" /> {score} Điểm
        </div>
      </div>

      <div className="game-content">
        {allMatched ? (
          <motion.div 
            className="welcome-banner glass-panel"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', bounce: 0.5 }}
          >
            <h1>Giỏi quá!</h1>
            <p>Bạn đã ghép đúng tất cả các từ vựng và đạt {score} điểm.</p>
            <button className="login-button" onClick={initGame} style={{ display: 'inline-flex', marginTop: 20 }}>
              <RotateCcw size={20} /> Chơi Lại
            </button>
          </motion.div>
        ) : (
          <div className="vocab-grid">
            {/* Left Column (English words usually) */}
            <div className="vocab-column">
              {leftCards.map(item => (
                <motion.div
                  key={`left-${item.id}`}
                  className={`vocab-card ${selectedLeft === item.id ? 'selected' : ''} ${matchedIds.includes(item.id) ? 'matched' : ''}`}
                  onClick={() => !matchedIds.includes(item.id) && setSelectedLeft(item.id)}
                  whileHover={!matchedIds.includes(item.id) ? { scale: 1.05 } : {}}
                  whileTap={!matchedIds.includes(item.id) ? { scale: 0.95 } : {}}
                >
                  {item.text}
                </motion.div>
              ))}
            </div>

            {/* Right Column (Vietnamese meaning) */}
            <div className="vocab-column">
              {rightCards.map(item => (
                <motion.div
                  key={`right-${item.id}`}
                  className={`vocab-card ${selectedRight === item.id ? 'selected' : ''} ${matchedIds.includes(item.id) ? 'matched' : ''}`}
                  onClick={() => !matchedIds.includes(item.id) && setSelectedRight(item.id)}
                  whileHover={!matchedIds.includes(item.id) ? { scale: 1.05 } : {}}
                  whileTap={!matchedIds.includes(item.id) ? { scale: 0.95 } : {}}
                >
                  {item.text}
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VocabMatchGame;
