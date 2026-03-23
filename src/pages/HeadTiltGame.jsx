import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Star, Music } from 'lucide-react';
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
  { question: "___ is a beautiful flower.", optionA: "It", optionB: "There", answer: "A" },
  { question: "Look! ___ is a rainbow!", optionA: "There", optionB: "These", answer: "A" },
  { question: "___ my new shoes.", optionA: "These are", optionB: "There is", answer: "A" },
  { question: "___ three birds in the tree.", optionA: "There is", optionB: "There are", answer: "B" },
  { question: "___ is my favorite book.", optionA: "This", optionB: "These", answer: "A" },
  { question: "___ your pencils on the desk.", optionA: "There are", optionB: "This is", answer: "A" },
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
  const [musicOn, setMusicOn] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const tiltTimerRef = useRef(null);
  const processingRef = useRef(false);

  // Load questions from localStorage (from Import) or use defaults
  useEffect(() => {
    const imported = localStorage.getItem('active_game_questions');
    if (imported) {
      try {
        const parsed = JSON.parse(imported);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setQuestions(parsed);
          localStorage.removeItem('active_game_questions'); // Clear after loading
          return;
        }
      } catch (e) { /* fall through to defaults */ }
    }
    setQuestions(DEFAULT_QUESTIONS);
  }, []);

  const question = questions[currentQIndex];

  const toggleMusic = () => {
    if (musicOn) { audioManager.stopBackgroundMusic(); }
    else { audioManager.startBackgroundMusic(); }
    setMusicOn(!musicOn);
  };

  useEffect(() => {
    return () => {
      audioManager.stopBackgroundMusic();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (tiltTimerRef.current) clearTimeout(tiltTimerRef.current);
    };
  }, []);

  // Simple face detection via skin color on canvas
  const detectFace = useCallback(() => {
    if (!webcamRef.current?.video || feedback || gameOver) {
      animationRef.current = requestAnimationFrame(detectFace);
      return;
    }
    const video = webcamRef.current.video;
    const canvas = canvasRef.current;
    if (!canvas || video.readyState !== 4) {
      animationRef.current = requestAnimationFrame(detectFace);
      return;
    }

    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();

    // Analyze face pixels
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const midX = canvas.width / 2;
    let leftCount = 0, rightCount = 0;
    const step = 10;
    const faceBottom = Math.floor(canvas.height * 0.65);

    for (let y = 0; y < faceBottom; y += step) {
      for (let x = 0; x < canvas.width; x += step) {
        const idx = (y * canvas.width + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        if (r > 95 && g > 40 && b > 20 && r > g && r > b && (r - g) > 15) {
          if (x < midX) leftCount++; else rightCount++;
        }
      }
    }

    const total = leftCount + rightCount;
    if (total > 40) {
      const leftRatio = leftCount / total;
      if (leftRatio > 0.62) setTiltDirection('left');
      else if (leftRatio < 0.38) setTiltDirection('right');
      else setTiltDirection(null);
    }

    animationRef.current = requestAnimationFrame(detectFace);
  }, [feedback, gameOver]);

  useEffect(() => {
    if (questions.length > 0) {
      animationRef.current = requestAnimationFrame(detectFace);
    }
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [questions, detectFace]);

  // Auto-answer on sustained tilt
  useEffect(() => {
    if (tiltDirection && !feedback && !processingRef.current && !gameOver) {
      tiltTimerRef.current = setTimeout(() => {
        handleAnswer(tiltDirection === 'left' ? 'A' : 'B');
      }, 1200);
    }
    return () => { if (tiltTimerRef.current) clearTimeout(tiltTimerRef.current); };
  }, [tiltDirection, feedback, gameOver]);

  // Keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (feedback || processingRef.current || gameOver) return;
      if (e.key === 'ArrowLeft') handleAnswer('A');
      if (e.key === 'ArrowRight') handleAnswer('B');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentQIndex, feedback, gameOver]);

  const handleAnswer = (chosen) => {
    if (processingRef.current || !question) return;
    processingRef.current = true;

    const isCorrect = chosen === question.answer;
    if (isCorrect) {
      setFeedback('correct');
      setScore(s => s + 1);
      audioManager.playCorrectSound();
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.5 }, colors: ['#00A699', '#F4C03B', '#FF5A5F', '#9C27B0'] });
    } else {
      setFeedback('wrong');
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
          confetti({ particleCount: 80, spread: 100, origin: { x: Math.random(), y: Math.random() * 0.6 } });
        }, 250);
      }
    }, 1800);
  };

  if (questions.length === 0 || !question) return null;

  const progress = ((currentQIndex + 1) / questions.length) * 100;

  return (
    <div className="tilt-game-page">
      {/* Header */}
      <div className="tilt-header">
        <button className="tilt-back-btn" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={18} /> Quay lại
        </button>
        <h1 className="tilt-title">Camera Tilt Quiz</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="music-btn" onClick={toggleMusic}>
            <Music size={18} color={musicOn ? '#00A699' : '#aaa'} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="tilt-progress-wrapper">
        <div className="tilt-progress-bar" style={{ width: `${progress}%` }} />
      </div>
      <div className="tilt-meta">
        Câu hỏi: {currentQIndex + 1}/{questions.length} | Điểm: {score}
      </div>

      {gameOver ? (
        <motion.div 
          className="tilt-game-over"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
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
          {/* Main Question Area */}
          <div className="tilt-question-area">
            {/* Left option */}
            <motion.button
              className={`tilt-option tilt-option-left ${tiltDirection === 'left' ? 'tilt-active' : ''} ${feedback && question.answer === 'A' ? 'tilt-correct-highlight' : ''} ${feedback === 'wrong' && tiltDirection === 'left' ? 'tilt-wrong-highlight' : ''}`}
              onClick={() => handleAnswer('A')}
              disabled={!!feedback}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {question.optionA}
            </motion.button>

            {/* Center: Question Card */}
            <AnimatePresence mode="wait">
              <motion.div
                key={currentQIndex}
                className="tilt-question-card"
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -30, opacity: 0 }}
              >
                <p className="tilt-question-text">{question.question}</p>
              </motion.div>
            </AnimatePresence>

            {/* Right option */}
            <motion.button
              className={`tilt-option tilt-option-right ${tiltDirection === 'right' ? 'tilt-active' : ''} ${feedback && question.answer === 'B' ? 'tilt-correct-highlight' : ''} ${feedback === 'wrong' && tiltDirection === 'right' ? 'tilt-wrong-highlight' : ''}`}
              onClick={() => handleAnswer('B')}
              disabled={!!feedback}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {question.optionB}
            </motion.button>
          </div>

          {/* Feedback overlay */}
          <AnimatePresence>
            {feedback && (
              <motion.div
                className="tilt-feedback"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0, opacity: 0 }}
              >
                {feedback === 'correct' ? '✅ Chính xác!' : '❌ Sai rồi!'}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Camera preview - small bottom right corner */}
          <div className="tilt-camera-preview">
            <Webcam
              audio={false}
              ref={webcamRef}
              width={160}
              height={120}
              videoConstraints={{ facingMode: "user" }}
              mirrored={true}
              style={{ borderRadius: 12, display: 'block' }}
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            {tiltDirection && (
              <div className={`tilt-cam-indicator ${tiltDirection}`}>
                {tiltDirection === 'left' ? '◀' : '▶'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HeadTiltGame;
