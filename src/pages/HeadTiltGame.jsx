import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import confetti from 'canvas-confetti';
import audioManager from '../services/AudioManager';
import '../styles/Game.css';

// Default questions if no imported set
const DEFAULT_QUESTIONS = [
  { question: "There ___ a cat on the table.", optionA: "is", optionB: "are", answer: "A" },
  { question: "There ___ two pizzas on the plate.", optionA: "is", optionB: "are", answer: "B" },
  { question: "___ are your books.", optionA: "There", optionB: "These", answer: "B" },
  { question: "Quả táo này màu đỏ.", optionA: "This", optionB: "That", answer: "A" },
  { question: "___ is a pen on the table.", optionA: "There", optionB: "These", answer: "A" },
  { question: "Những chiếc xe kia rất đẹp.", optionA: "These", optionB: "Those", answer: "B" },
  { question: "___ children are playing outside.", optionA: "These", optionB: "There", answer: "A" },
  { question: "Look! ___ is a rainbow!", optionA: "There", optionB: "These", answer: "A" },
  { question: "___ my new shoes.", optionA: "These are", optionB: "There is", answer: "A" },
  { question: "___ three birds in the tree.", optionA: "There is", optionB: "There are", answer: "B" },
  { question: "___ is my favorite book.", optionA: "This", optionB: "These", answer: "A" },
  { question: "___ a dog behind the door.", optionA: "These is", optionB: "There is", answer: "B" },
  { question: "___ apples are very sweet.", optionA: "These", optionB: "There", answer: "A" },
];

const HeadTiltGame = () => {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [tiltDirection, setTiltDirection] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  // Use a native <video> element directly for more control
  const videoRef = useRef(null);
  const canvasRef = useRef(null);  // hidden analysis canvas
  const displayCanvasRef = useRef(null);  // visible display canvas
  const animationRef = useRef(null);
  const tiltTimerRef = useRef(null);
  const processingRef = useRef(false);
  const streamRef = useRef(null);
  const smoothedXRef = useRef(0.5);

  // Load questions
  useEffect(() => {
    const imported = localStorage.getItem('active_game_questions');
    if (imported) {
      try {
        const parsed = JSON.parse(imported);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setQuestions(parsed);
          localStorage.removeItem('active_game_questions');
          return;
        }
      } catch (e) {}
    }
    setQuestions(DEFAULT_QUESTIONS);
  }, []);

  // Start camera
  useEffect(() => {
    let stream = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
            setCameraReady(true);
          };
        }
      } catch (err) {
        console.error('Camera error:', err);
        setCameraError(true);
      }
    };

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);


  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (tiltTimerRef.current) clearTimeout(tiltTimerRef.current);
    };
  }, []);

  // Face detection + render loop
  const renderLoop = useCallback(() => {
    const video = videoRef.current;
    const analysisCanvas = canvasRef.current;
    const displayCanvas = displayCanvasRef.current;

    if (!video || video.readyState < 2 || !analysisCanvas || !displayCanvas) {
      animationRef.current = requestAnimationFrame(renderLoop);
      return;
    }

    const W = video.videoWidth || 640;
    const H = video.videoHeight || 480;

    analysisCanvas.width = W;
    analysisCanvas.height = H;
    displayCanvas.width = W;
    displayCanvas.height = H;

    // Draw mirrored frame onto analysis canvas
    const aCtx = analysisCanvas.getContext('2d');
    aCtx.save();
    aCtx.scale(-1, 1);
    aCtx.drawImage(video, -W, 0, W, H);
    aCtx.restore();

    // --- Skin detection for face position (long-range optimized) ---
    const imageData = aCtx.getImageData(0, 0, W, H);
    const data = imageData.data;
    // Scan full height so distant/small face still detected
    const step = 6; // smaller step = more pixels sampled

    let sumX = 0;
    let count = 0;

    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x += step) {
        const idx = (y * W + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        // Loosened skin heuristic — works from further away (dimmer, smaller face)
        const isSkin = (
          r > 60 && g > 25 && b > 10 &&
          r > g && r > b &&
          (r - g) > 10 &&
          r > 100 &&
          Math.abs(r - g) > 8
        );
        if (isSkin) {
          sumX += x;
          count++;
        }
      }
    }

    let detectedTilt = null;
    if (count > 20) {
      const avgX = sumX / count;
      const normalizedX = avgX / W; // 0.0 = left edge, 1.0 = right edge

      // Strong smoothing (0.85) — dot moves slowly and stably
      smoothedXRef.current = smoothedXRef.current * 0.85 + normalizedX * 0.15;
      const smoothedX = smoothedXRef.current;

      // 0.38–0.62 is safe center zone. Outside = left or right.
      if (smoothedX < 0.38) {
        detectedTilt = 'left';
      } else if (smoothedX > 0.62) {
        detectedTilt = 'right';
      }
    } else {
      // Drift gently back to center when no face visible
      smoothedXRef.current = smoothedXRef.current * 0.95 + 0.5 * 0.05;
    }

    if (!feedback && !gameOver) {
      setTiltDirection(detectedTilt);
    }

    // --- Render to display canvas (mirrored) ---
    const dCtx = displayCanvas.getContext('2d');
    dCtx.save();
    dCtx.scale(-1, 1);
    dCtx.drawImage(video, -W, 0, W, H);
    dCtx.restore();

    // Semi-transparent dark overlay for contrast
    dCtx.fillStyle = 'rgba(0,0,0,0.15)';
    dCtx.fillRect(0, 0, W, H);

    // Draw center safe zone
    const boxWidth = W * 0.24; // narrower safe zone
    const boxX = (W - boxWidth) / 2;
    dCtx.strokeStyle = 'rgba(255,255,255,0.5)';
    dCtx.lineWidth = 2;
    dCtx.setLineDash([6, 4]);
    dCtx.strokeRect(boxX, 0, boxWidth, H);
    dCtx.setLineDash([]);

    // Tilt highlight
    if (detectedTilt === 'left') {
      dCtx.fillStyle = 'rgba(83, 216, 251, 0.25)';
      dCtx.fillRect(0, 0, boxX, H);
      dCtx.font = `bold ${Math.floor(H * 0.1)}px Nunito, sans-serif`;
      dCtx.fillStyle = '#53d8fb';
      dCtx.textAlign = 'center';
      dCtx.fillText('◀', boxX * 0.5, H * 0.5);
    } else if (detectedTilt === 'right') {
      const rightX = boxX + boxWidth;
      dCtx.fillStyle = 'rgba(255, 90, 95, 0.25)';
      dCtx.fillRect(rightX, 0, W - rightX, H);
      dCtx.font = `bold ${Math.floor(H * 0.1)}px Nunito, sans-serif`;
      dCtx.fillStyle = '#FF5A5F';
      dCtx.textAlign = 'center';
      dCtx.fillText('▶', rightX + (W - rightX) / 2, H * 0.5);
    }

    // Draw "follow me" tracking dot — user just needs to keep head on it
    const dotX = smoothedXRef.current * W;
    const dotY = H * 0.5;
    const dotR = 14;

    // Outer glow ring
    const gradient = dCtx.createRadialGradient(dotX, dotY, dotR * 0.5, dotX, dotY, dotR * 2.5);
    gradient.addColorStop(0, 'rgba(255, 234, 0, 0.5)');
    gradient.addColorStop(1, 'rgba(255, 234, 0, 0)');
    dCtx.beginPath();
    dCtx.arc(dotX, dotY, dotR * 2.5, 0, 2 * Math.PI);
    dCtx.fillStyle = gradient;
    dCtx.fill();

    // Inner dot
    dCtx.beginPath();
    dCtx.arc(dotX, dotY, dotR, 0, 2 * Math.PI);
    dCtx.fillStyle = '#FFEA00';
    dCtx.fill();
    dCtx.lineWidth = 2.5;
    dCtx.strokeStyle = 'white';
    dCtx.stroke();

    // Label
    dCtx.font = 'bold 12px sans-serif';
    dCtx.fillStyle = 'white';
    dCtx.textAlign = 'center';
    dCtx.fillText('HEAD', dotX, dotY + dotR + 16);


    animationRef.current = requestAnimationFrame(renderLoop);
  }, [feedback, gameOver]);

  useEffect(() => {
    if (cameraReady) {
      animationRef.current = requestAnimationFrame(renderLoop);
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [cameraReady, renderLoop]);

  // Auto-confirm tilt after holding 1.2s
  useEffect(() => {
    if (tiltDirection && !feedback && !processingRef.current && !gameOver) {
      tiltTimerRef.current = setTimeout(() => {
        handleAnswer(tiltDirection === 'left' ? 'A' : 'B');
      }, 1200);
    }
    return () => { if (tiltTimerRef.current) clearTimeout(tiltTimerRef.current); };
  }, [tiltDirection, feedback, gameOver]);

  // Keyboard fallback
  useEffect(() => {
    const onKey = (e) => {
      if (feedback || processingRef.current || gameOver || questions.length === 0) return;
      if (e.key === 'ArrowLeft') handleAnswer('A');
      if (e.key === 'ArrowRight') handleAnswer('B');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentQIndex, feedback, gameOver, questions]);

  const question = questions[currentQIndex];

  const handleAnswer = (chosen) => {
    if (processingRef.current || !question) return;
    processingRef.current = true;

    const isCorrect = chosen === question.answer;
    setFeedback(isCorrect ? 'correct' : 'wrong');
    if (isCorrect) {
      setScore(s => s + 1);
      audioManager.playCorrectSound();
      confetti({ particleCount: 150, spread: 80, origin: { x: 0, y: 0.8 }, colors: ['#00A699', '#F4C03B', '#FF5A5F', '#9C27B0'], angle: 60, velocity: 50 });
      confetti({ particleCount: 150, spread: 80, origin: { x: 1, y: 0.8 }, colors: ['#00A699', '#F4C03B', '#FF5A5F', '#9C27B0'], angle: 120, velocity: 50 });
    } else {
      audioManager.playWrongSound();
    }

    setTimeout(() => {
      setFeedback(null);
      setTiltDirection(null);
      processingRef.current = false;
      if (currentQIndex < questions.length - 1) {
        setCurrentQIndex(q => q + 1);
      } else {
        setGameOver(true);
        const finalScore = score + (isCorrect ? 1 : 0);
        const end = Date.now() + 3000;
        const iv = setInterval(() => {
          if (Date.now() > end) return clearInterval(iv);
          confetti({ particleCount: 60, spread: 100, origin: { x: Math.random(), y: Math.random() * 0.6 } });
        }, 250);
      }
    }, 1800);
  };

  if (questions.length === 0) return (
    <div className="tilt-game-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'white', fontSize: '1.5rem' }}>Đang tải câu hỏi...</div>
    </div>
  );

  const progress = ((currentQIndex + 1) / questions.length) * 100;

  return (
    <div className="tilt-game-page">
      {/* Hidden analysis canvas */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Header */}
      <div className="tilt-header">
        <button className="tilt-back-btn" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={18} /> Quay lại
        </button>
        <h1 className="tilt-title">Camera Tilt Quiz</h1>
        <div />
      </div>

      {/* Progress */}
      <div className="tilt-progress-wrapper">
        <div className="tilt-progress-bar" style={{ width: `${progress}%` }} />
      </div>
      <div className="tilt-meta">
        Câu hỏi: {currentQIndex + 1}/{questions.length} | Điểm: {score}
      </div>

      {gameOver ? (
        <motion.div className="tilt-game-over" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <div style={{ fontSize: '5rem' }}>🏆</div>
          <h2>Hoàn thành!</h2>
          <p>Bạn đạt <b>{score}/{questions.length}</b> điểm</p>
          <div className="tilt-go-actions">
            <button className="tilt-replay-btn" onClick={() => { setCurrentQIndex(0); setScore(0); setGameOver(false); }}>
              🔄 Chơi lại
            </button>
            <button className="tilt-home-btn" onClick={() => navigate('/dashboard')}>
              🏠 Về trang chủ
            </button>
          </div>
        </motion.div>
      ) : (
        <div className="tilt-body">
          {/* Question on top */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentQIndex}
              className="tilt-question-card-top"
              initial={{ y: -30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -30, opacity: 0 }}
            >
              <p className="tilt-question-text">{question.question}</p>
              {cameraError && (
                <p style={{ fontSize: '0.8rem', color: '#888', marginTop: 10 }}>
                  ⚠️ Camera không khả dụng. Dùng phím ← →
                </p>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Main Interaction Area */}
          <div className="tilt-main-interaction">
            {/* Left option */}
            <motion.button
              className={`tilt-option tilt-option-left 
                ${tiltDirection === 'left' ? 'tilt-active' : ''} 
                ${feedback && question.answer === 'A' ? 'tilt-correct-highlight' : ''} 
                ${feedback === 'wrong' && tiltDirection === 'left' ? 'tilt-wrong-highlight' : ''}`}
              onClick={() => handleAnswer('A')}
              disabled={!!feedback}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <div className="opt-label">A</div>
              {question.optionA}
            </motion.button>

            {/* Camera preview - CENTERED */}
            {!cameraError ? (
              <div className="tilt-camera-center">
                <video
                  ref={videoRef}
                  style={{ display: 'none' }}
                  muted
                  playsInline
                  autoPlay
                />
                <canvas
                  ref={displayCanvasRef}
                  style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
                />
                {tiltDirection && !feedback && (
                  <div className={`tilt-cam-indicator-center ${tiltDirection}`}>
                    {tiltDirection === 'left' ? '◀' : '▶'}
                  </div>
                )}
                {tiltDirection && !feedback && (
                  <motion.div
                    className="tilt-hold-bar"
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 1.2, ease: 'linear' }}
                    key={tiltDirection}
                  />
                )}
              </div>
            ) : (
              <div className="tilt-camera-center error-placeholder">
                <span>Camera Offline</span>
              </div>
            )}

            {/* Right option */}
            <motion.button
              className={`tilt-option tilt-option-right 
                ${tiltDirection === 'right' ? 'tilt-active' : ''} 
                ${feedback && question.answer === 'B' ? 'tilt-correct-highlight' : ''} 
                ${feedback === 'wrong' && tiltDirection === 'right' ? 'tilt-wrong-highlight' : ''}`}
              onClick={() => handleAnswer('B')}
              disabled={!!feedback}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <div className="opt-label">B</div>
              {question.optionB}
            </motion.button>
          </div>

          {/* Feedback overlay */}
          <AnimatePresence>
            {feedback && (
              <motion.div className="tilt-feedback" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0, opacity: 0 }}>
                {feedback === 'correct' ? '✨ Correct!' : '❌ Incorrect!'}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default HeadTiltGame;
