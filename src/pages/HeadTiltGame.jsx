import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Star, ArrowLeftCircle, ArrowRightCircle } from 'lucide-react';
import confetti from 'canvas-confetti';
import '../styles/Game.css';

// Sample questions
const QUESTIONS = [
  { text: "Có một con chó ở đằng kia. Dùng từ gì?", left: "There", right: "These", answer: "left" },
  { text: "___ are your books.", left: "There", right: "These", answer: "right" },
  { text: "Quả táo này màu đỏ.", left: "This", right: "That", answer: "left" },
  { text: "___ is a pen on the table.", left: "There", right: "These", answer: "left" },
  { text: "Những chiếc xe kia rất đẹp.", left: "These", right: "Those", answer: "right" }
];

const HeadTiltGame = () => {
  const navigate = useNavigate();
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState(null); // 'correct' or 'wrong'
  const webcamRef = useRef(null);

  const question = QUESTIONS[currentQIndex];

  // Handle keyboard arrow keys for fake head tilt
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (feedback) return; // Prevent multiple answers while animating
      if (e.key === 'ArrowLeft') handleAnswer('left');
      if (e.key === 'ArrowRight') handleAnswer('right');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentQIndex, feedback]);

  const handleAnswer = (chosenSide) => {
    if (chosenSide === question.answer) {
      setFeedback('correct');
      setScore(s => s + 10);
      confetti({
        particleCount: 100,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#00A699', '#F4C03B']
      });
    } else {
      setFeedback('wrong');
    }

    setTimeout(() => {
      setFeedback(null);
      if (currentQIndex < QUESTIONS.length - 1) {
        setCurrentQIndex(q => q + 1);
      } else {
        // Game Over!
        confetti({ particleCount: 300, spread: 100 });
        alert(`Chúc mừng! Bạn đạt được ${score + (chosenSide === question.answer ? 10 : 0)} điểm!`);
        navigate('/dashboard');
      }
    }, 1500);
  };

  return (
    <div className="game-container">
      <div className="game-header glass-panel">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={20} /> Quay lại
        </button>
        <h2>Nghiêng Đầu Chọn Đáp Án</h2>
        <div className="score-badge">
          <Star size={20} fill="white" /> {score} Điểm
        </div>
      </div>

      <div className="game-content">
        <motion.div 
          className="webcam-wrapper"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            width={640}
            height={480}
            videoConstraints={{ facingMode: "user" }}
            mirrored={true}
          />
          
          <AnimatePresence>
            {feedback && (
              <motion.div 
                className="feedback-overlay"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1.2, opacity: 1 }}
                exit={{ scale: 2, opacity: 0 }}
              >
                <div className="feedback-text" style={{ color: feedback === 'correct' ? '#4CAF50' : '#F44336' }}>
                  {feedback === 'correct' ? 'CHÍNH XÁC! 🎉' : 'SAI RỒI! 😢'}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.div 
          className="question-card"
          key={currentQIndex} // Trigger animation on question change
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          <div className="question-text">{question.text}</div>
          <p style={{ color: 'var(--quaternary)', marginBottom: 20 }}>
            (Nhấn mũi tên Trái/Phải hoặc Click để chọn đáp án)
          </p>
        </motion.div>

        <div className="options-row">
          <button className="option-btn left" onClick={() => handleAnswer('left')} disabled={!!feedback}>
            <ArrowLeftCircle size={40} />
            {question.left}
          </button>
          <button className="option-btn right" onClick={() => handleAnswer('right')} disabled={!!feedback}>
            <ArrowRightCircle size={40} />
            {question.right}
          </button>
        </div>
      </div>
    </div>
  );
};

export default HeadTiltGame;
