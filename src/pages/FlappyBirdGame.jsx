import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mic, MicOff, RotateCcw } from 'lucide-react';
import confetti from 'canvas-confetti';
import '../styles/FlappyBird.css';

const DEFAULT_QUESTIONS = [
  { question: "Which is the correct spelling?", optionA: "Beautiful", optionB: "Beutiful", optionC: "Beuatiful", optionD: "Beatiful", answer: "A" },
  { question: "What is the past tense of 'Go'?", optionA: "Goes", optionB: "Goed", optionC: "Went", optionD: "Gone", answer: "C" },
  { question: "Choose the correct preposition: 'I live ___ Vietnam.'", optionA: "at", optionB: "on", optionC: "in", optionD: "for", answer: "C" },
  { question: "How do you say 'Con mèo' in English?", optionA: "Dog", optionB: "Cat", optionC: "Bird", optionD: "Mouse", answer: "B" },
  { question: "Choose the plural form of 'Mouse'.", optionA: "Mouses", optionB: "Mice", optionC: "Moose", optionD: "Moucies", answer: "B" },
];

const BIRD_START_X = 180;
const OBSTACLE_TRIGGER_X = 350; // Distance to the pipe gap
const OBSTACLE_SPACING = 900;
const FLY_SPEED = 2.8;

// ---- Drawing functions ----
function drawCloud(ctx, x, y, w) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  const o = [
    { ox: w * 0.5, oy: 0.5, rx: w * 0.45, ry: w * 0.25 },
    { ox: w * 0.25, oy: 0.7, rx: w * 0.3, ry: w * 0.25 },
    { ox: w * 0.75, oy: 0.7, rx: w * 0.3, ry: w * 0.25 }
  ];
  o.forEach(e => {
    ctx.beginPath();
    ctx.ellipse(x + e.ox, y + e.oy * w * 0.4, e.rx, e.ry, 0, 0, 2 * Math.PI);
    ctx.fill();
  });
}

function drawFlower(ctx, x, y, rotation, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);

  // Petals
  ctx.fillStyle = '#FFB6C1'; // Light pink
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.ellipse(0, -8, 6, 10, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.rotate((2 * Math.PI) / 5);
  }
  
  // Center
  ctx.fillStyle = '#FFD700'; // Gold
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, 2 * Math.PI);
  ctx.fill();

  ctx.restore();
}

function drawGround(ctx, W, groundY, offset) {
  // Ground dirt
  const dg = ctx.createLinearGradient(0, groundY, 0, groundY + 150);
  dg.addColorStop(0, '#DED895');
  dg.addColorStop(1, '#C2B280');
  ctx.fillStyle = dg;
  ctx.fillRect(0, groundY, W, 150);
  
  // Grass top border
  ctx.fillStyle = '#73BF2E';
  ctx.fillRect(0, groundY - 18, W, 18);
  
  // Grass dashes for scrolling effect
  ctx.fillStyle = '#5A9620';
  for (let i = 0; i < W + 100; i += 30) {
    const stripeX = ((i - offset) % W + W) % W;
    ctx.beginPath();
    ctx.moveTo(stripeX, groundY - 18);
    ctx.lineTo(stripeX + 15, groundY - 18);
    ctx.lineTo(stripeX + 10, groundY);
    ctx.lineTo(stripeX - 5, groundY);
    ctx.fill();
  }
}

// Draw top and bottom pipes with a gap
function drawPipes(ctx, x, groundY, gapY, gapSize) {
  const pw = 60, cw = 70, ch = 28;
  const hTop = gapY - gapSize / 2;
  const hBotStart = gapY + gapSize / 2;
  const hBot = groundY - hBotStart;

  const bg = ctx.createLinearGradient(x - pw / 2, 0, x + pw / 2, 0);
  bg.addColorStop(0, '#54C029'); bg.addColorStop(0.3, '#94E456'); bg.addColorStop(0.8, '#54C029'); bg.addColorStop(1, '#3B8B1A');
  ctx.fillStyle = bg;

  // Top pipe body
  ctx.fillRect(x - pw / 2, 0, pw, hTop - ch);
  // Bottom pipe body
  ctx.fillRect(x - pw / 2, hBotStart + ch, pw, hBot - ch);

  const cg = ctx.createLinearGradient(x - cw / 2, 0, x + cw / 2, 0);
  cg.addColorStop(0, '#54C029'); cg.addColorStop(0.3, '#94E456'); cg.addColorStop(0.8, '#54C029'); cg.addColorStop(1, '#3B8B1A');
  ctx.fillStyle = cg;

  // Top pipe cap
  ctx.fillRect(x - cw / 2, hTop - ch, cw, ch);
  // Bottom pipe cap
  ctx.fillRect(x - cw / 2, hBotStart, cw, ch);

  // Borders for pipes (classic flappy style)
  ctx.strokeStyle = '#2A6611';
  ctx.lineWidth = 3;
  ctx.strokeRect(x - cw / 2, hTop - ch, cw, ch);
  ctx.strokeRect(x - cw / 2, hBotStart, cw, ch);
  ctx.strokeRect(x - pw / 2, 0, pw, hTop - ch);
  ctx.strokeRect(x - pw / 2, hBotStart + ch, pw, hBot - ch);
}

function drawBird(ctx, x, y, flapPhase, flyAngle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(flyAngle);

  // Body
  ctx.fillStyle = '#F4C03B'; // yellow
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 14, 0, 0, 2 * Math.PI);
  ctx.fill();
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Eye
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(8, -4, 5, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'black';
  ctx.beginPath();
  ctx.arc(10, -4, 2, 0, 2 * Math.PI);
  ctx.fill();

  // Beak/Lips (Red)
  ctx.fillStyle = '#E53935';
  ctx.beginPath();
  ctx.ellipse(18, 2, 8, 5, 0, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(10, 2);
  ctx.lineTo(26, 2);
  ctx.stroke();

  // Wing (Flapping)
  ctx.fillStyle = 'white';
  ctx.beginPath();
  if (flapPhase === 0) {
    // Wing up
    ctx.ellipse(-4, -6, 10, 6, -Math.PI / 6, 0, 2 * Math.PI);
  } else if (flapPhase === 1) {
    // Wing middle
    ctx.ellipse(-4, 0, 10, 5, 0, 0, 2 * Math.PI);
  } else {
    // Wing down
    ctx.ellipse(-4, 6, 10, 6, Math.PI / 6, 0, 2 * Math.PI);
  }
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function spawnFlowers(W, H) {
  return Array.from({ length: 15 }, (_, i) => ({
    worldX: Math.random() * W * 4 + i * 200,
    y: 50 + Math.random() * (H - 200),
    speed: 0.8 + Math.random() * 1.5,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.1,
    scale: 0.6 + Math.random() * 0.8
  }));
}

function spawnClouds(W) {
  return Array.from({ length: 9 }, (_, i) => ({
    worldX: i * 400 + Math.random() * 200,
    y: 30 + Math.random() * 140,
    width: 80 + Math.random() * 120,
    speed: 0.2 + Math.random() * 0.4,
  }));
}

// ---- Component ----
const FlappyBirdGame = () => {
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const gsRef = useRef(null);
  const processingRef = useRef(false);
  const recognitionRef = useRef(null);
  const gameLoopFnRef = useRef(null);

  const [uiPhase, setUiPhase] = useState('loading');
  const [uiQIdx, setUiQIdx] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [score, setScore] = useState(0);
  const [questions, setQuestions] = useState([]);

  useEffect(() => {
    const stored = localStorage.getItem('active_flappy_questions');
    if (stored) {
      try {
        const p = JSON.parse(stored);
        if (Array.isArray(p) && p.length > 0) { setQuestions(p); localStorage.removeItem('active_flappy_questions'); return; }
      } catch (e) {}
    }
    setQuestions(DEFAULT_QUESTIONS);
  }, []);

  useEffect(() => {
    if (!questions.length) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const groundY = canvas.height * 0.8;
    const gapSize = 160;

    gsRef.current = {
      cameraX: 0,
      birdWorldX: BIRD_START_X,
      birdY: canvas.height * 0.4,
      targetBirdY: canvas.height * 0.4,
      flapTimer: 0, flapPhase: 0,
      floatTimer: 0,
      flowers: spawnFlowers(canvas.width, groundY),
      clouds: spawnClouds(canvas.width),
      obstacles: questions.map((_, i) => ({
        worldX: OBSTACLE_SPACING * (i + 1),
        gapY: Math.max(120, Math.min(groundY - 140, groundY * 0.4 + (Math.random() - 0.5) * 200)),
        cleared: false
      })),
      gapSize,
      questions,
      score: 0,
      currentQIdx: 0,
      groundY,
      phase: 'running',
    };
    setUiPhase('running');
  }, [questions]);

  useEffect(() => {
    const onResize = () => {
      const c = canvasRef.current;
      if (c) {
        c.width = innerWidth;
        c.height = innerHeight;
        if (gsRef.current) gsRef.current.groundY = innerHeight * 0.8;
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const launchFireworks = () => {
    const end = Date.now() + 5000;
    const iv = setInterval(() => {
      if (Date.now() > end) return clearInterval(iv);
      confetti({ particleCount: 65, spread: 100, origin: { x: Math.random(), y: Math.random() * 0.6 }, colors: ['#4CAF50', '#FFD600', '#2196F3', '#FF5A5F'] });
    }, 250);
  };

  const handleAnswer = (chosen) => {
    const gs = gsRef.current;
    if (processingRef.current || !gs) return;
    const q = gs.questions[gs.currentQIdx];
    if (!q) return;
    processingRef.current = true;
    const correct = chosen.toUpperCase() === q.answer.toUpperCase();
    if (correct) {
      setFeedback('correct');
      const newScore = gs.score + 10; gs.score = newScore; setScore(newScore);
      confetti({ particleCount: 100, spread: 80, origin: { y: 0.6 } });
      setTimeout(() => {
        gs.obstacles[gs.currentQIdx].cleared = true;
        gs.phase = 'running'; // resume flying
        setFeedback(null); setUiPhase('running'); processingRef.current = false;
      }, 1000);
    } else {
      setFeedback('wrong');
      setTimeout(() => { setFeedback(null); processingRef.current = false; }, 1300);
    }
  };

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Trình duyệt không hỗ trợ Speech Recognition!'); return; }
    const r = new SR();
    r.lang = 'en-US'; r.continuous = false; r.interimResults = false;
    recognitionRef.current = r;
    r.onstart = () => setIsListening(true);
    r.onend = () => setIsListening(false);
    r.onerror = () => setIsListening(false);
    r.onresult = (e) => {
      setIsListening(false);
      const t = e.results[0][0].transcript.trim().toUpperCase();
      const m = t.match(/\b([ABCD])\b/) || t.match(/\b(AY|BEE|SEE|CEE|DEE)\b/);
      if (m) {
        const map = { AY: 'A', BEE: 'B', SEE: 'C', CEE: 'C', DEE: 'D' };
        handleAnswer(map[m[1]] || m[1]);
      }
    };
    r.start();
  };

  const stopListening = () => { recognitionRef.current?.stop(); setIsListening(false); };

  gameLoopFnRef.current = () => {
    const canvas = canvasRef.current;
    const gs = gsRef.current;
    if (!canvas || !gs) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const { groundY, gapSize } = gs;

    // Background dynamics (parallax)
    gs.clouds.forEach(c => {
      c.worldX -= c.speed;
      if (c.worldX < gs.cameraX - 200) { c.worldX = gs.cameraX + W + 100; c.y = 20 + Math.random() * 100; }
    });
    // Floating flowers
    gs.flowers.forEach(f => {
      f.worldX -= f.speed;
      f.rotation += f.rotSpeed;
      if (f.worldX < gs.cameraX - 50) {
        f.worldX = gs.cameraX + W + 100;
        f.y = 50 + Math.random() * (groundY - 100);
      }
    });

    // Bird animation timers
    gs.flapTimer++;
    if (gs.flapTimer > 6) {
      gs.flapPhase = (gs.flapPhase + 1) % 3;
      gs.flapTimer = 0;
    }
    gs.floatTimer += 0.05;

    let flyAngle = 0;

    if (gs.phase === 'running') {
      gs.birdWorldX += FLY_SPEED;
      gs.cameraX = gs.birdWorldX - BIRD_START_X;

      // Find the next uncleared obstacle to follow its Y
      let nextObs = null;
      for (let i = 0; i < gs.obstacles.length; i++) {
        if (!gs.obstacles[i].cleared) {
          nextObs = gs.obstacles[i];
          break;
        }
      }

      if (nextObs) {
        // Smoothly adjust bird Y to line up with the pipe gap
        gs.targetBirdY = nextObs.gapY;
      }
      
      // Interpolate birdY to targetBirdY
      gs.birdY += (gs.targetBirdY - gs.birdY) * 0.02;
      flyAngle = (gs.targetBirdY - gs.birdY) * 0.005; // angle slightly up/down

      // Check for question trigger
      if (nextObs && (nextObs.worldX - gs.cameraX <= OBSTACLE_TRIGGER_X)) {
        gs.phase = 'question';
        const obsIdx = gs.obstacles.indexOf(nextObs);
        gs.currentQIdx = obsIdx;
        setUiQIdx(obsIdx);
        setUiPhase('question');
      }

      // Check win condition
      if (gs.obstacles.every(o => o.cleared) && gs.birdWorldX > gs.obstacles.at(-1)?.worldX + 400) {
        gs.phase = 'victory'; setUiPhase('victory'); launchFireworks();
      }
    } else if (gs.phase === 'question') {
      // Hover in place, slight floating effect up and down
      gs.birdY += Math.sin(gs.floatTimer) * 0.5;
      flyAngle = 0;
    }

    // Sky
    const skyG = ctx.createLinearGradient(0, 0, 0, groundY);
    skyG.addColorStop(0, '#71C5CF'); // classic Flappy Bird blue
    skyG.addColorStop(1, '#A9E3E8');
    ctx.fillStyle = skyG; ctx.fillRect(0, 0, W, groundY);

    // Cityscape/Buildings background (scrolling slower)
    ctx.fillStyle = '#D2E3C4'; // light greenish for distant trees/buildings
    for (let x = -gs.cameraX * 0.2 % 200 - 200; x < W; x += 150) {
      ctx.fillRect(x, groundY - 60, 40, 60);
      ctx.fillRect(x + 50, groundY - 90, 60, 90);
      ctx.fillRect(x + 120, groundY - 45, 30, 45);
    }
    ctx.fillStyle = '#B4D796'; // closer foliage
    ctx.beginPath();
    for (let bx = -gs.cameraX * 0.3 % 100 - 100; bx < W + 200; bx += 100) {
      ctx.arc(bx, groundY, 40, 0, 2 * Math.PI);
    }
    ctx.fill();

    // Draw Clouds and Flowers
    gs.clouds.forEach(c => drawCloud(ctx, c.worldX - gs.cameraX * 0.4, c.y, c.width));
    gs.flowers.forEach(f => drawFlower(ctx, f.worldX - gs.cameraX * 0.7, f.y, f.rotation, f.scale));

    // Draw Pipes
    gs.obstacles.forEach(obs => {
      const sx = obs.worldX - gs.cameraX;
      if (sx > -100 && sx < W + 100) {
        drawPipes(ctx, sx, groundY, obs.gapY, gapSize);
      }
    });

    // Draw Ground
    drawGround(ctx, W, groundY, gs.cameraX);

    // Draw Bird
    if (gs.phase !== 'victory') {
      drawBird(ctx, gs.birdWorldX - gs.cameraX, gs.birdY, gs.flapPhase, flyAngle);
    }

    // HUD
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(10, 10, 180, 40);
    ctx.fillStyle = 'white'; ctx.font = 'bold 16px "Arial",sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`⭐ ${gs.score}   📍 ${gs.currentQIdx + 1}/${gs.questions.length}`, 20, 36);
  };

  useEffect(() => {
    if (uiPhase === 'loading') return;
    const loop = () => { gameLoopFnRef.current?.(); animRef.current = requestAnimationFrame(loop); };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [uiPhase === 'loading' ? 'loading' : 'started']);

  const q = questions[uiQIdx];
  const opts = q ? [
    { k: 'A', t: q.optionA }, { k: 'B', t: q.optionB },
    ...(q.optionC ? [{ k: 'C', t: q.optionC }] : []),
    ...(q.optionD ? [{ k: 'D', t: q.optionD }] : []),
  ] : [];

  return (
    <div className="fb-wrapper">
      <canvas ref={canvasRef} className="fb-canvas" />
      <button className="fb-back-btn" onClick={() => navigate('/dashboard')}><ArrowLeft size={18} /> Quay lại</button>

      {uiPhase === 'question' && q && (
        <div className="fb-overlay">
          <div className={`fb-modal ${feedback === 'wrong' ? 'shake' : ''}`}>
            {feedback && <div className={`fb-feedback ${feedback}`}>{feedback === 'correct' ? '✨ Tuyệt vời!' : '❌ Không đúng! Thử lại!'}</div>}
            <div className="fb-q-meta">
              <span className="fb-badge">Câu {uiQIdx + 1}/{questions.length}</span>
              <span className="fb-pipe-label">🦜 Bay qua nào!</span>
            </div>
            <p className="fb-q-text">{q.question}</p>
            <div className="fb-opts">
              {opts.map(o => (
                <button key={o.k} className={`fb-opt opt-${o.k.toLowerCase()}`} onClick={() => !feedback && !processingRef.current && handleAnswer(o.k)} disabled={!!feedback}>
                  <span className="opt-key">{o.k}</span> {o.t}
                </button>
              ))}
            </div>
            <div className="fb-voice-row">
              <button className={`fb-mic-btn ${isListening ? 'listening' : ''}`} onClick={isListening ? stopListening : startListening} disabled={!!feedback}>
                {isListening ? <><MicOff size={18} /> Đang nghe... (Nói A/B/C/D)</> : <><Mic size={18} /> Đọc đáp án</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {uiPhase === 'victory' && (
        <div className="fb-victory">
          <div className="fb-victory-card">
            <div style={{ fontSize: '5rem' }}>🏆</div>
            <h1 className="fb-v-title">Quá Đỉnh!</h1>
            <p className="fb-v-sub">Bạn đã bay qua tất cả chướng ngại vật!</p>
            <p className="fb-score">⭐ {score} / {questions.length * 10}</p>
            <div className="fb-actions">
              <button className="fb-replay" onClick={() => window.location.reload()}><RotateCcw size={16} /> Bay lại</button>
              <button className="fb-home" onClick={() => navigate('/dashboard')}>🏠 Về trang chủ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FlappyBirdGame;
