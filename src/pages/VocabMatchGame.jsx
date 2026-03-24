import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, RotateCcw, Music } from 'lucide-react';
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
  { id: 6, left: "Sun", right: "Mặt trời", emoji: "☀️" }
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

  // Hand tracking refs
  const videoRef = useRef(null);
  const cursorDomRef = useRef(null);
  const cursorRingRef = useRef(null);
  const animationRef = useRef(null);
  const hoverStateRef = useRef({ id: null, side: null, startTime: 0, triggeredTime: 0 });
  const [handLandmarker, setHandLandmarker] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    initGame();
    initHandTracking();
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  const initHandTracking = async () => {
    try {
      const { HandLandmarker, FilesetResolver } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm');
      
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      const landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 1
      });
      setHandLandmarker(landmarker);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 320, height: 240 }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', '');
        videoRef.current.setAttribute('muted', '');
        videoRef.current.muted = true;
        const onReady = () => {
          videoRef.current.play().catch(() => {});
          setCameraReady(true);
        };
        if (videoRef.current.readyState >= 2) {
          onReady();
        } else {
          videoRef.current.onloadeddata = onReady;
        }
      }
    } catch (e) {
      console.error("Camera/Mediapipe Error:", e);
    }
  };

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

  const handleCardSelect = useCallback((id, side) => {
    if (side === 'left') {
      setSelectedLeft(prev => prev === id ? null : id);
    } else {
      setSelectedRight(prev => prev === id ? null : id);
    }
  }, []);

  const renderLoop = useCallback(() => {
    if (videoRef.current && handLandmarker && videoRef.current.readyState >= 2) {
      const results = handLandmarker.detectForVideo(videoRef.current, performance.now());
      if (results.landmarks && results.landmarks.length > 0) {
        const indexFinger = results.landmarks[0][8];
        const screenX = (1 - indexFinger.x) * window.innerWidth;
        const screenY = indexFinger.y * window.innerHeight;
        
        if (cursorDomRef.current) {
          cursorDomRef.current.style.transform = `translate(${screenX}px, ${screenY}px)`;
          cursorDomRef.current.style.opacity = '1';
        }

        const el = document.elementFromPoint(screenX, screenY);
        const cardEl = el?.closest('.vocab-card');
        
        if (cardEl && !cardEl.classList.contains('matched')) {
          const id = parseInt(cardEl.getAttribute('data-id'));
          const side = cardEl.getAttribute('data-side');
          
          if (hoverStateRef.current.id === id && hoverStateRef.current.side === side) {
             const elapsed = Date.now() - hoverStateRef.current.startTime;
             let progress = (elapsed / 1000) * 100;
             if (progress > 100) progress = 100;
             
             if (cursorRingRef.current) cursorRingRef.current.style.strokeDashoffset = 100 - progress;
             
             if (progress >= 100 && Date.now() - hoverStateRef.current.triggeredTime > 1500) {
               hoverStateRef.current.triggeredTime = Date.now();
               handleCardSelect(id, side);
             }
          } else {
             hoverStateRef.current = { id, side, startTime: Date.now(), triggeredTime: hoverStateRef.current.triggeredTime };
             if (cursorRingRef.current) cursorRingRef.current.style.strokeDashoffset = 100;
          }
        } else {
          hoverStateRef.current.id = null;
          hoverStateRef.current.side = null;
          if (cursorRingRef.current) cursorRingRef.current.style.strokeDashoffset = 100;
        }
      } else {
         if (cursorDomRef.current) cursorDomRef.current.style.opacity = '0';
      }
    }
    animationRef.current = requestAnimationFrame(renderLoop);
  }, [handLandmarker, handleCardSelect]);

  useEffect(() => {
    if (cameraReady && handLandmarker) {
      animationRef.current = requestAnimationFrame(renderLoop);
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [cameraReady, handLandmarker, renderLoop]);

  useEffect(() => {
    if (selectedLeft !== null && selectedRight !== null) {
      if (selectedLeft === selectedRight) {
        audioManager.playCorrectSound();
        const newStreak = streak + 1;
        setStreak(newStreak);
        const bonus = newStreak >= 3 ? 10 : 0;
        
        setTimeout(() => {
          setMatchedIds(prev => [...prev, selectedLeft]);
          setSelectedLeft(null);
          setSelectedRight(null);
          setScore(s => s + 20 + bonus);
          confetti({ particleCount: 60 + newStreak * 20, spread: 60, origin: { y: 0.7 }, colors: ['#00A699', '#F4C03B', '#FF5A5F'] });
        }, 400);
      } else {
        audioManager.playWrongSound();
        setWrongPair(true);
        setStreak(0);
        setTimeout(() => {
          setSelectedLeft(null);
          setSelectedRight(null);
          setWrongPair(false);
          setScore(s => Math.max(0, s - 5));
        }, 800);
      }
    }
  }, [selectedLeft, selectedRight]);

  const allMatched = matchedIds.length === currentPairs.length && currentPairs.length > 0;
  
  return (
    <div className="game-container vocab-tracking-bg" style={{ background: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 50%, #8ec5fc 100%)' }}>
      {/* Hand Cursor */}
      <div ref={cursorDomRef} className="hand-cursor" style={{ opacity: 0 }}>
         <svg viewBox="0 0 36 36">
           <circle cx="18" cy="18" r="15" stroke="rgba(0,0,0,0.2)" strokeWidth="4" fill="rgba(255,255,255,0.7)" />
           <circle ref={cursorRingRef} className="progress" cx="18" cy="18" r="15" />
         </svg>
      </div>

      <div className="game-header glass-panel" style={{ zIndex: 100 }}>
        <button className="back-btn" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={20} /> Quay lại
        </button>
        <h2>✨ Chỉ tay để Ghép Từ</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="music-btn" onClick={toggleMusic}>
            <Music size={20} color={musicOn ? '#9C27B0' : '#999'} />
          </button>
          <div className="score-badge" style={{ background: 'linear-gradient(135deg, #9C27B0, #E91E63)' }}>
            <Star size={20} fill="white" /> {score}
          </div>
          {streak >= 2 && (
            <motion.div className="streak-badge" initial={{ scale: 0 }} animate={{ scale: 1 }} key={streak}>
              🔥 x{streak}
            </motion.div>
          )}
        </div>
      </div>

      <div className="game-content" style={{ paddingTop: 20 }}>
        {allMatched ? (
          <motion.div className="victory-screen glass-panel" initial={{ scale: 0 }} animate={{ scale: 1 }}>
            <div style={{ fontSize: '4rem' }}>🏆</div>
            <h1 style={{ color: '#9C27B0', marginBottom: 10 }}>Giỏi quá!</h1>
            <p style={{ fontSize: '1.3rem', color: '#555' }}>Đạt <b style={{ color: '#FF5A5F' }}>{score}</b> điểm!</p>
            <motion.button className="start-game-btn" onClick={initGame} style={{ marginTop: 25, background: 'linear-gradient(135deg, #9C27B0, #E91E63)' }}>
              <RotateCcw size={20} /> Chơi Lại!
            </motion.button>
          </motion.div>
        ) : (
          <motion.div className="vocab-grid" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="vocab-column">
              <div className="column-label">🇬🇧 English</div>
              {leftCards.map((item, idx) => (
                <motion.div
                  key={`left-${item.id}`}
                  data-id={item.id}
                  data-side="left"
                  className={`vocab-card ${selectedLeft === item.id ? 'selected' : ''} ${matchedIds.includes(item.id) ? 'matched' : ''} ${wrongPair && selectedLeft === item.id ? 'wrong-shake' : ''}`}
                  onClick={() => !matchedIds.includes(item.id) && handleCardSelect(item.id, 'left')}
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
                  data-id={item.id}
                  data-side="right"
                  className={`vocab-card ${selectedRight === item.id ? 'selected' : ''} ${matchedIds.includes(item.id) ? 'matched' : ''} ${wrongPair && selectedRight === item.id ? 'wrong-shake' : ''}`}
                  onClick={() => !matchedIds.includes(item.id) && handleCardSelect(item.id, 'right')}
                >
                  {item.text}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {!allMatched && (
          <div className="match-progress">
            {currentPairs.map((_, i) => (
              <motion.div key={i} className={`progress-dot ${matchedIds.length > i ? 'filled' : ''}`} />
            ))}
          </div>
        )}
      </div>

      {/* Floating mini camera preview */}
      <div className="mini-cam-preview">
        <video ref={videoRef} playsInline muted autoPlay style={{ transform: 'scaleX(-1)' }} />
        {!cameraReady && <div className="cam-loader">Bật Camera...</div>}
      </div>
    </div>
  );
};

export default VocabMatchGame;
