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

// Face landmark indices for MediaPipe Face Mesh
// Left ear tip: 234, Right ear tip: 454
// Nose tip: 1, used for optional vertical reference
const FACE_LEFT_EAR = 234;
const FACE_RIGHT_EAR = 454;

// Tilt threshold: normalized [0..1] range, 0.5 = center
const TILT_THRESHOLD_LEFT = 0.42;
const TILT_THRESHOLD_RIGHT = 0.58;

// Smoothing factor (0 = no lag, 1 = full lag). Higher = smoother but slower.
const SMOOTH_ALPHA = 0.35;

class FaceTracker {
  constructor() {
    this.faceLandmarker = null;
    this.ready = false;
  }

  async init() {
    const { FaceLandmarker, FilesetResolver } = await import(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm'
    );
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );
    this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    this.ready = true;
  }

  detect(videoEl) {
    if (!this.ready || !this.faceLandmarker) return null;
    try {
      return this.faceLandmarker.detectForVideo(videoEl, performance.now());
    } catch (e) {
      return null;
    }
  }
}

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
  const [trackerReady, setTrackerReady] = useState(false);

  const videoRef = useRef(null);
  const displayCanvasRef = useRef(null);
  const animationRef = useRef(null);
  const tiltTimerRef = useRef(null);
  const processingRef = useRef(false);
  const streamRef = useRef(null);
  // Smoothed normalized head X position (0=left edge, 1=right edge of mirrored frame)
  const smoothedXRef = useRef(0.5);
  const faceTrackerRef = useRef(new FaceTracker());

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

  // Start camera — always on regardless of UI interaction (Safari-safe)
  useEffect(() => {
    let stream = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        });
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.setAttribute('playsinline', '');
          video.muted = true;
          const onReady = () => {
            video.play().catch(() => {});
            setCameraReady(true);
          };
          if (video.readyState >= 2) {
            onReady();
          } else {
            video.onloadedmetadata = onReady;
          }
        }
      } catch (err) {
        console.error('Camera error:', err);
        setCameraError(true);
      }
    };

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Init MediaPipe FaceLandmarker
  useEffect(() => {
    faceTrackerRef.current
      .init()
      .then(() => setTrackerReady(true))
      .catch((err) => {
        console.error('FaceLandmarker init error:', err);
        // Fall back gracefully — camera still shows, head tracking unavailable
        setCameraError(true);
      });
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
    const displayCanvas = displayCanvasRef.current;

    if (!video || video.readyState < 2 || !displayCanvas) {
      animationRef.current = requestAnimationFrame(renderLoop);
      return;
    }

    const W = video.videoWidth || 640;
    const H = video.videoHeight || 480;

    if (displayCanvas.width !== W) displayCanvas.width = W;
    if (displayCanvas.height !== H) displayCanvas.height = H;

    const dCtx = displayCanvas.getContext('2d');

    // Draw mirrored live frame
    dCtx.save();
    dCtx.scale(-1, 1);
    dCtx.drawImage(video, -W, 0, W, H);
    dCtx.restore();

    // Semi-transparent overlay for contrast
    dCtx.fillStyle = 'rgba(0,0,0,0.12)';
    dCtx.fillRect(0, 0, W, H);

    // --- Run MediaPipe FaceLandmarker ---
    let detectedTilt = null;
    let headX = smoothedXRef.current; // use last known if no detection this frame

    if (trackerReady) {
      const results = faceTrackerRef.current.detect(video);
      if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
        const lm = results.faceLandmarks[0];
        // Note: MediaPipe gives normalized coords for the unmirrored frame.
        // We mirror our display (scaleX -1), so leftEar in unmirrored = appears on right in display.
        // To make dot match: headCenterX_mirrored = 1 - headCenterX_raw
        const leftEar = lm[FACE_LEFT_EAR];   // x near 0 = left side of raw frame = right of mirrored
        const rightEar = lm[FACE_RIGHT_EAR]; // x near 1 = right side of raw frame = left of mirrored

        // Head center in raw (unmirrored) space
        const rawCenterX = (leftEar.x + rightEar.x) / 2;
        // Mirror flip for display-space
        const mirroredCenterX = 1 - rawCenterX;

        // Smooth with exponential moving average
        smoothedXRef.current = smoothedXRef.current * (1 - SMOOTH_ALPHA) + mirroredCenterX * SMOOTH_ALPHA;
        headX = smoothedXRef.current;

        // Tilt detection on mirrored space:
        // headX < TILT_THRESHOLD_LEFT → user's head moved to LEFT of the screen → answer A
        // headX > TILT_THRESHOLD_RIGHT → user's head moved to RIGHT → answer B
        if (headX < TILT_THRESHOLD_LEFT) {
          detectedTilt = 'left';
        } else if (headX > TILT_THRESHOLD_RIGHT) {
          detectedTilt = 'right';
        }
      } else {
        // No face detected — drift back to center gently
        smoothedXRef.current = smoothedXRef.current * 0.97 + 0.5 * 0.03;
        headX = smoothedXRef.current;
      }
    }

    if (!feedback && !gameOver) {
      setTiltDirection(detectedTilt);
    }

    // --- Draw safe-zone box ---
    const boxWidth = W * 0.24;
    const boxX = (W - boxWidth) / 2;
    dCtx.strokeStyle = 'rgba(255,255,255,0.5)';
    dCtx.lineWidth = 2;
    dCtx.setLineDash([6, 4]);
    dCtx.strokeRect(boxX, 0, boxWidth, H);
    dCtx.setLineDash([]);

    // Tilt zone highlight
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

    // --- Draw head-tracking dot ---
    const dotX = headX * W;
    const dotY = H * 0.45;
    const dotR = 16;

    // Glow ring
    const gradient = dCtx.createRadialGradient(dotX, dotY, dotR * 0.3, dotX, dotY, dotR * 2.8);
    gradient.addColorStop(0, 'rgba(255, 234, 0, 0.6)');
    gradient.addColorStop(1, 'rgba(255, 234, 0, 0)');
    dCtx.beginPath();
    dCtx.arc(dotX, dotY, dotR * 2.8, 0, 2 * Math.PI);
    dCtx.fillStyle = gradient;
    dCtx.fill();

    // Outer ring (pulsing color based on direction)
    const ringColor = detectedTilt === 'left' ? '#53d8fb' : detectedTilt === 'right' ? '#FF5A5F' : '#FFEA00';
    dCtx.beginPath();
    dCtx.arc(dotX, dotY, dotR + 5, 0, 2 * Math.PI);
    dCtx.strokeStyle = ringColor;
    dCtx.lineWidth = 3;
    dCtx.stroke();

    // Inner dot
    dCtx.beginPath();
    dCtx.arc(dotX, dotY, dotR, 0, 2 * Math.PI);
    dCtx.fillStyle = '#FFEA00';
    dCtx.fill();
    dCtx.lineWidth = 2.5;
    dCtx.strokeStyle = 'white';
    dCtx.stroke();

    // Label
    dCtx.font = 'bold 11px sans-serif';
    dCtx.fillStyle = 'white';
    dCtx.textAlign = 'center';
    dCtx.shadowColor = 'rgba(0,0,0,0.8)';
    dCtx.shadowBlur = 4;
    dCtx.fillText('HEAD', dotX, dotY + dotR + 16);
    dCtx.shadowBlur = 0;

    // "Loading tracker" notice if MediaPipe not ready
    if (!trackerReady && !cameraError) {
      dCtx.fillStyle = 'rgba(0,0,0,0.5)';
      dCtx.fillRect(0, 0, W, 28);
      dCtx.font = '13px sans-serif';
      dCtx.fillStyle = '#FFEA00';
      dCtx.textAlign = 'center';
      dCtx.fillText('⏳ Đang tải bộ nhận diện khuôn mặt...', W / 2, 19);
    }

    animationRef.current = requestAnimationFrame(renderLoop);
  }, [feedback, gameOver, trackerReady, cameraError]);

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
    return () => {
      if (tiltTimerRef.current) clearTimeout(tiltTimerRef.current);
    };
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
      setScore((s) => s + 1);
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
        setCurrentQIndex((q) => q + 1);
      } else {
        setGameOver(true);
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
      {/* Hidden video — MediaPipe reads from this */}
      <video
        ref={videoRef}
        style={{ display: 'none' }}
        muted
        playsInline
        autoPlay
      />

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
