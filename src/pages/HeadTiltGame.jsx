import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Star, ArrowLeftCircle, ArrowRightCircle, Camera, Music } from 'lucide-react';
import confetti from 'canvas-confetti';
import audioManager from '../services/AudioManager';
import '../styles/Game.css';

// Sample questions
const QUESTIONS = [
  { text: "Có một con chó ở đằng kia. Dùng từ gì?", left: "There", right: "These", answer: "left" },
  { text: "___ are your books.", left: "There", right: "These", answer: "right" },
  { text: "Quả táo này màu đỏ. (This/That)", left: "This", right: "That", answer: "left" },
  { text: "___ is a pen on the table.", left: "There", right: "These", answer: "left" },
  { text: "Những chiếc xe kia rất đẹp. (These/Those)", left: "These", right: "Those", answer: "right" },
  { text: "___ children are playing outside.", left: "These", right: "There", answer: "left" },
  { text: "___ is a beautiful day today.", left: "It", right: "There", answer: "left" },
  { text: "Nhìn kìa! ___ is a rainbow!", left: "There", right: "These", answer: "left" },
];

const HeadTiltGame = () => {
  const navigate = useNavigate();
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [tiltDirection, setTiltDirection] = useState(null); // 'left', 'right', null
  const [gameStarted, setGameStarted] = useState(false);
  const [musicOn, setMusicOn] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const tiltTimerRef = useRef(null);
  const isProcessingRef = useRef(false);

  const question = QUESTIONS[currentQIndex];

  // Toggle music
  const toggleMusic = () => {
    if (musicOn) {
      audioManager.stopBackgroundMusic();
    } else {
      audioManager.startBackgroundMusic();
    }
    setMusicOn(!musicOn);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioManager.stopBackgroundMusic();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (tiltTimerRef.current) clearTimeout(tiltTimerRef.current);
    };
  }, []);

  // Head tilt detection using simple face position tracking
  const detectHeadTilt = useCallback(() => {
    if (!webcamRef.current || !webcamRef.current.video || !gameStarted || feedback) {
      animationFrameRef.current = requestAnimationFrame(detectHeadTilt);
      return;
    }

    const video = webcamRef.current.video;
    const canvas = canvasRef.current;
    if (!canvas || video.readyState !== 4) {
      animationFrameRef.current = requestAnimationFrame(detectHeadTilt);
      return;
    }

    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw mirrored video
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();

    // Get image data for simple face position tracking
    // We look at the brightness distribution to detect face position
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    const midX = canvas.width / 2;
    let leftBrightness = 0;
    let rightBrightness = 0;
    let leftCount = 0;
    let rightCount = 0;

    // Sample rows in the face area (top 60% of frame)
    const faceAreaBottom = Math.floor(canvas.height * 0.6);
    const step = 8; // Sample every 8th pixel for speed

    for (let y = 0; y < faceAreaBottom; y += step) {
      for (let x = 0; x < canvas.width; x += step) {
        const idx = (y * canvas.width + x) * 4;
        // Skin-like color detection (simple heuristic)
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        
        // Simple skin detection: R > 95, G > 40, B > 20, R > G, R > B
        if (r > 95 && g > 40 && b > 20 && r > g && r > b && (r - g) > 15) {
          if (x < midX) {
            leftBrightness += r + g + b;
            leftCount++;
          } else {
            rightBrightness += r + g + b;
            rightCount++;
          }
        }
      }
    }

    const leftAvg = leftCount > 0 ? leftBrightness / leftCount : 0;
    const rightAvg = rightCount > 0 ? rightBrightness / rightCount : 0;
    const leftDensity = leftCount;
    const rightDensity = rightCount;

    // Determine tilt based on where more face pixels are
    const total = leftDensity + rightDensity;
    const threshold = 0.15; // 15% difference needed
    
    if (total > 50) { // Enough face pixels detected
      const leftRatio = leftDensity / total;
      const rightRatio = rightDensity / total;

      if (leftRatio > 0.5 + threshold) {
        setTiltDirection('left');
      } else if (rightRatio > 0.5 + threshold) {
        setTiltDirection('right');
      } else {
        setTiltDirection(null);
      }
    }

    // Draw guide overlay on canvas
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(midX, 0);
    ctx.lineTo(midX, canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw tilt indicators
    if (tiltDirection === 'left') {
      ctx.fillStyle = 'rgba(255, 90, 95, 0.3)';
      ctx.fillRect(0, 0, midX, canvas.height);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 36px Nunito';
      ctx.textAlign = 'center';
      ctx.fillText('◀ TRÁI', midX / 2, canvas.height / 2);
    } else if (tiltDirection === 'right') {
      ctx.fillStyle = 'rgba(0, 166, 153, 0.3)';
      ctx.fillRect(midX, 0, midX, canvas.height);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 36px Nunito';
      ctx.textAlign = 'center';
      ctx.fillText('PHẢI ▶', midX + midX / 2, canvas.height / 2);
    }

    animationFrameRef.current = requestAnimationFrame(detectHeadTilt);
  }, [gameStarted, feedback, tiltDirection]);

  // Start detection loop when game starts
  useEffect(() => {
    if (gameStarted) {
      animationFrameRef.current = requestAnimationFrame(detectHeadTilt);
    }
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [gameStarted, detectHeadTilt]);

  // Auto-answer when tilt is held for 1.5 seconds
  useEffect(() => {
    if (tiltDirection && !feedback && gameStarted && !isProcessingRef.current) {
      tiltTimerRef.current = setTimeout(() => {
        handleAnswer(tiltDirection);
      }, 1200); // Hold for 1.2s to confirm
    }
    return () => {
      if (tiltTimerRef.current) clearTimeout(tiltTimerRef.current);
    };
  }, [tiltDirection, feedback, gameStarted]);

  // Keyboard fallback
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (feedback || !gameStarted || isProcessingRef.current) return;
      if (e.key === 'ArrowLeft') handleAnswer('left');
      if (e.key === 'ArrowRight') handleAnswer('right');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentQIndex, feedback, gameStarted]);

  const handleAnswer = (chosenSide) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    if (chosenSide === question.answer) {
      setFeedback('correct');
      setScore(s => s + 10);
      audioManager.playCorrectSound();
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.5 },
        colors: ['#00A699', '#F4C03B', '#FF5A5F', '#9C27B0']
      });
    } else {
      setFeedback('wrong');
      audioManager.playWrongSound();
    }

    setTimeout(() => {
      setFeedback(null);
      setTiltDirection(null);
      isProcessingRef.current = false;
      if (currentQIndex < QUESTIONS.length - 1) {
        setCurrentQIndex(q => q + 1);
      } else {
        // Game Over - big celebration!
        const finalScore = score + (chosenSide === question.answer ? 10 : 0);
        const end = Date.now() + 3000;
        const interval = setInterval(() => {
          if (Date.now() > end) return clearInterval(interval);
          confetti({ particleCount: 80, spread: 100, origin: { x: Math.random(), y: Math.random() * 0.6 } });
        }, 200);
        setTimeout(() => {
          alert(`🎉 Chúc mừng! Bạn đạt được ${finalScore} điểm trên tổng ${QUESTIONS.length * 10} điểm!`);
          navigate('/dashboard');
        }, 3500);
      }
    }, 2000);
  };

  const startGame = () => {
    setCountdown(3);
    let count = 3;
    const interval = setInterval(() => {
      count--;
      if (count === 0) {
        clearInterval(interval);
        setCountdown(null);
        setGameStarted(true);
      } else {
        setCountdown(count);
      }
    }, 1000);
  };

  return (
    <div className="game-container" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
      {/* Floating decorative particles */}
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          className="game-particle"
          style={{
            width: 10 + Math.random() * 20,
            height: 10 + Math.random() * 20,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
          animate={{
            y: [0, -30, 0],
            x: [0, (Math.random() - 0.5) * 40, 0],
            opacity: [0.3, 0.7, 0.3],
            scale: [1, 1.3, 1],
          }}
          transition={{ repeat: Infinity, duration: 3 + Math.random() * 3, delay: Math.random() * 2 }}
        />
      ))}

      <div className="game-header glass-panel">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={20} /> Quay lại
        </button>
        <h2>🎯 Nghiêng Đầu Chọn Đáp Án</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="music-btn" onClick={toggleMusic} title={musicOn ? 'Tắt nhạc' : 'Bật nhạc'}>
            <Music size={20} color={musicOn ? '#00A699' : '#999'} />
          </button>
          <div className="score-badge">
            <Star size={20} fill="white" /> {score} Điểm
          </div>
        </div>
      </div>

      <div className="game-content">
        {!gameStarted ? (
          <motion.div 
            className="start-screen glass-panel"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <Camera size={60} color="#FF5A5F" />
            <h2 style={{ fontSize: '2rem', color: 'var(--primary)', margin: '20px 0 10px' }}>Hướng Dẫn Chơi</h2>
            <p style={{ fontSize: '1.2rem', lineHeight: 1.8, maxWidth: 500, color: '#555' }}>
              📸 Cho phép camera để chơi<br/>
              ◀️ <b>Nghiêng đầu sang TRÁI</b> để chọn đáp án bên trái<br/>
              ▶️ <b>Nghiêng đầu sang PHẢI</b> để chọn đáp án bên phải<br/>
              ⏱️ Giữ nghiêng <b>1.2 giây</b> để xác nhận<br/>
              ⌨️ Hoặc dùng <b>phím mũi tên</b> / <b>nhấn nút</b>
            </p>
            
            {/* Preview webcam */}
            <div style={{ borderRadius: 15, overflow: 'hidden', margin: '20px 0', boxShadow: '0 5px 20px rgba(0,0,0,0.2)' }}>
              <Webcam
                audio={false}
                ref={webcamRef}
                width={320}
                height={240}
                videoConstraints={{ facingMode: "user" }}
                mirrored={true}
              />
            </div>

            {countdown !== null ? (
              <motion.div
                key={countdown}
                initial={{ scale: 2, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                style={{ fontSize: '5rem', fontWeight: 900, color: '#FF5A5F' }}
              >
                {countdown}
              </motion.div>
            ) : (
              <motion.button 
                className="start-game-btn"
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                onClick={startGame}
              >
                🚀 Bắt Đầu Chơi!
              </motion.button>
            )}
          </motion.div>
        ) : (
          <>
            {/* Live Camera with detection overlay */}
            <motion.div 
              className="webcam-wrapper"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              style={{ position: 'relative' }}
            >
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                width={560}
                height={420}
                videoConstraints={{ facingMode: "user" }}
                mirrored={true}
                style={{ display: 'none' }}
              />
              <canvas 
                ref={canvasRef} 
                width={560} 
                height={420} 
                style={{ borderRadius: 20, display: 'block' }}
              />

              {/* Tilt progress indicator */}
              {tiltDirection && !feedback && (
                <motion.div 
                  className="tilt-indicator"
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 1.2, ease: 'linear' }}
                  style={{
                    position: 'absolute',
                    bottom: 0, left: 0,
                    height: 6,
                    background: tiltDirection === 'left' ? '#FF5A5F' : '#00A699',
                    borderRadius: '0 0 20px 20px',
                  }}
                />
              )}

              <AnimatePresence>
                {feedback && (
                  <motion.div 
                    className="feedback-overlay"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1.2, opacity: 1 }}
                    exit={{ scale: 2, opacity: 0 }}
                  >
                    <div className="feedback-text" style={{ color: feedback === 'correct' ? '#4CAF50' : '#F44336' }}>
                      {feedback === 'correct' ? '✅ CHÍNH XÁC! 🎉' : '❌ SAI RỒI! 😢'}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Question progress */}
            <div className="progress-bar-wrapper">
              <div className="progress-bar" style={{ width: `${((currentQIndex + 1) / QUESTIONS.length) * 100}%` }} />
              <span>Câu {currentQIndex + 1}/{QUESTIONS.length}</span>
            </div>

            <motion.div 
              className="question-card"
              key={currentQIndex}
              initial={{ y: 50, opacity: 0, rotateX: 20 }}
              animate={{ y: 0, opacity: 1, rotateX: 0 }}
              transition={{ type: 'spring', bounce: 0.4 }}
            >
              <div className="question-text">{question.text}</div>
              <p style={{ color: '#999', fontSize: '0.9rem' }}>
                Nghiêng đầu sang hướng đáp án đúng (giữ 1.2s) hoặc nhấn nút bên dưới
              </p>
            </motion.div>

            <div className="options-row">
              <motion.button 
                className={`option-btn left ${tiltDirection === 'left' ? 'active-tilt' : ''}`} 
                onClick={() => handleAnswer('left')} 
                disabled={!!feedback}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <ArrowLeftCircle size={40} />
                {question.left}
              </motion.button>
              <motion.button 
                className={`option-btn right ${tiltDirection === 'right' ? 'active-tilt' : ''}`} 
                onClick={() => handleAnswer('right')} 
                disabled={!!feedback}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <ArrowRightCircle size={40} />
                {question.right}
              </motion.button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default HeadTiltGame;
