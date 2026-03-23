import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mic, MicOff, RotateCcw } from 'lucide-react';
import confetti from 'canvas-confetti';
import '../styles/MarioRiver.css';

const DEFAULT_QUESTIONS = [
  { question: "Which sentence is correct?", optionA: "She is a teacher", optionB: "She are a teacher", optionC: "She am a teacher", optionD: "She be a teacher", answer: "A" },
  { question: "Complete: 'There ___ two cats.'", optionA: "is", optionB: "are", optionC: "am", optionD: "was", answer: "B" },
  { question: "How do you say 'Con chó' in English?", optionA: "Cat", optionB: "Bird", optionC: "Dog", optionD: "Fish", answer: "C" },
  { question: "Which is plural of 'child'?", optionA: "Childs", optionB: "Childes", optionC: "Childrens", optionD: "Children", answer: "D" },
  { question: "Choose: 'She is good ___ English'", optionA: "in", optionB: "at", optionC: "on", optionD: "for", answer: "B" },
];

const MARIO_SCREEN_X = 220;
const OBSTACLE_TRIGGER_X = 390;
const OBSTACLE_SPACING = 850;
const MARIO_SPEED = 2.5;

// ---- Drawing functions ----
function drawCloud(ctx, x, y, w) {
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  [{ ox: w * 0.5, oy: 0.5, rx: w * 0.5, ry: w * 0.22 },
   { ox: w * 0.28, oy: 0.75, rx: w * 0.32, ry: w * 0.28 },
   { ox: w * 0.72, oy: 0.7, rx: w * 0.28, ry: w * 0.24 }].forEach(e => {
    ctx.beginPath();
    ctx.ellipse(x + e.ox, y + e.oy * w * 0.4, e.rx, e.ry, 0, 0, 2 * Math.PI);
    ctx.fill();
  });
}

function drawBird(ctx, x, y) {
  ctx.strokeStyle = '#333'; ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(x - 8, y); ctx.quadraticCurveTo(x - 4, y - 5, x, y);
  ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 4, y - 5, x + 8, y);
  ctx.stroke();
}

function drawWater(ctx, W, groundY, H, offset) {
  ctx.beginPath(); ctx.moveTo(0, groundY - 10);
  for (let x = 0; x <= W; x += 4) ctx.lineTo(x, groundY - 10 + Math.sin((x + offset) * 0.05) * 5);
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
  const g = ctx.createLinearGradient(0, groundY - 10, 0, groundY + 40);
  g.addColorStop(0, 'rgba(30,144,255,0.7)'); g.addColorStop(1, 'rgba(0,80,160,0.4)');
  ctx.fillStyle = g; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  for (let i = 0; i < 8; i++) {
    const sx = ((offset * 0.8 + i * 140) % W);
    ctx.beginPath(); ctx.arc(sx, groundY - 10 + Math.sin((sx + offset) * 0.05) * 5 - 2, 2, 0, 2 * Math.PI); ctx.fill();
  }
}

function drawGround(ctx, W, groundY) {
  ctx.fillStyle = '#4CAF50'; ctx.fillRect(0, groundY - 22, W, 22);
  ctx.fillStyle = '#388E3C';
  for (let x = 0; x < W; x += 14) ctx.fillRect(x, groundY - 22, 4, 9);
  const dg = ctx.createLinearGradient(0, groundY, 0, groundY + 200);
  dg.addColorStop(0, '#795548'); dg.addColorStop(1, '#4E342E');
  ctx.fillStyle = dg; ctx.fillRect(0, groundY, W, 200);
}

function drawPipe(ctx, x, groundY, h = 130) {
  const pw = 54, cw = 64, ch = 20;
  const bg = ctx.createLinearGradient(x - pw / 2, 0, x + pw / 2, 0);
  bg.addColorStop(0, '#1B5E20'); bg.addColorStop(0.4, '#4CAF50'); bg.addColorStop(0.7, '#66BB6A'); bg.addColorStop(1, '#1B5E20');
  ctx.fillStyle = bg; ctx.fillRect(x - pw / 2, groundY - h, pw, h);
  const cg = ctx.createLinearGradient(x - cw / 2, 0, x + cw / 2, 0);
  cg.addColorStop(0, '#1B5E20'); cg.addColorStop(0.35, '#4CAF50'); cg.addColorStop(0.65, '#81C784'); cg.addColorStop(1, '#1B5E20');
  ctx.fillStyle = cg; ctx.fillRect(x - cw / 2, groundY - h - ch, cw, ch + 6);
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x - pw / 2 + 7, groundY - h + 4, 8, h - 8);
}

function drawMario(ctx, x, baseY, leg, jumpY = 0) {
  const px = Math.floor(x), py = Math.floor(baseY - jumpY);
  const r = (col, bx, by, bw, bh) => { ctx.fillStyle = col; ctx.fillRect(px + bx, py + by, bw, bh); };
  r('#CC2200', -12, 0, 26, 7);  r('#CC2200', -8, -5, 18, 6);
  r('#8B4513', -12, 7, 26, 3);
  r('#FFCC99', -10, 10, 22, 14);
  r('#333', -5, 12, 4, 4); r('#333', 3, 12, 4, 4);
  r('white', -5, 12, 3, 2); r('white', 3, 12, 3, 2);
  r('#5C2E00', -8, 18, 18, 4);
  r('#1565C0', -11, 24, 24, 16);
  r('#FFD700', -3, 26, 3, 3); r('#FFD700', 3, 26, 3, 3);
  r('#CC2200', -16, 24, 7, 10); r('#CC2200', 11, 24, 7, 10);
  r('#FFCC99', -16, 34, 7, 5); r('#FFCC99', 11, 34, 7, 5);
  if (leg === 0) {
    r('#1565C0', -9, 40, 10, 14); r('#1565C0', 1, 40, 10, 10);
    r('#4E2600', -11, 54, 14, 6); r('#4E2600', 1, 50, 13, 6);
  } else {
    r('#1565C0', -9, 40, 10, 10); r('#1565C0', 1, 40, 10, 14);
    r('#4E2600', -11, 50, 13, 6); r('#4E2600', 1, 54, 14, 6);
  }
}

function spawnBirds(W) {
  return Array.from({ length: 7 }, (_, i) => ({
    worldX: Math.random() * W * 5 + i * 600,
    y: 35 + Math.random() * 130,
    speed: 0.4 + Math.random() * 1.2,
  }));
}

function spawnClouds(W) {
  return Array.from({ length: 12 }, (_, i) => ({
    worldX: i * 480 + Math.random() * 180,
    y: 20 + Math.random() * 90,
    width: 90 + Math.random() * 110,
    speed: 0.15 + Math.random() * 0.25,
  }));
}

// ---- Component ----
const MarioRiverGame = () => {
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
    const stored = localStorage.getItem('active_mario_questions');
    if (stored) {
      try {
        const p = JSON.parse(stored);
        if (Array.isArray(p) && p.length > 0) { setQuestions(p); localStorage.removeItem('active_mario_questions'); return; }
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
    const groundY = canvas.height * 0.72;
    gsRef.current = {
      cameraX: 0,
      marioWorldX: MARIO_SCREEN_X,
      jumpY: 0, jumpVy: 0,
      legPhase: 0, legTimer: 0,
      waveOffset: 0,
      birds: spawnBirds(canvas.width),
      clouds: spawnClouds(canvas.width),
      obstacles: questions.map((_, i) => ({ worldX: OBSTACLE_SPACING * (i + 1), cleared: false })),
      questions,
      score: 0,
      currentQIdx: 0,
      groundY,
      phase: 'running',
    };
    setUiPhase('running');
  }, [questions]);

  useEffect(() => {
    const onResize = () => { const c = canvasRef.current; if (c) { c.width = innerWidth; c.height = innerHeight; if (gsRef.current) gsRef.current.groundY = innerHeight * 0.72; } };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const launchFireworks = () => {
    const end = Date.now() + 4500;
    const iv = setInterval(() => {
      if (Date.now() > end) return clearInterval(iv);
      confetti({ particleCount: 55, spread: 110, origin: { x: Math.random(), y: Math.random() * 0.5 }, colors: ['#FF5A5F', '#FFD600', '#00A699', '#9C27B0', '#2196F3'] });
    }, 220);
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
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.65 } });
      setTimeout(() => {
        gs.obstacles[gs.currentQIdx].cleared = true;
        gs.jumpVy = 14; gs.jumpY = 0; gs.phase = 'jumping';
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

  // Game loop via stable ref to avoid stale closures
  gameLoopFnRef.current = () => {
    const canvas = canvasRef.current;
    const gs = gsRef.current;
    if (!canvas || !gs) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const { groundY } = gs;

    gs.waveOffset += 1.5;
    const W5 = W * 5;
    gs.birds.forEach(b => { b.worldX -= b.speed; if (b.worldX < gs.cameraX - 100) { b.worldX = gs.cameraX + W + 80; b.y = 35 + Math.random() * 130; } });
    gs.clouds.forEach(c => { c.worldX -= c.speed; if (c.worldX < gs.cameraX - 200) { c.worldX = gs.cameraX + W + 100; c.y = 20 + Math.random() * 90; } });

    if (gs.phase === 'running') {
      gs.legTimer++; if (gs.legTimer > 10) { gs.legPhase ^= 1; gs.legTimer = 0; }
      gs.marioWorldX += MARIO_SPEED;
      gs.cameraX = gs.marioWorldX - MARIO_SCREEN_X;
      for (let i = 0; i < gs.obstacles.length; i++) {
        const obs = gs.obstacles[i];
        if (obs.cleared) continue;
        if (obs.worldX - gs.cameraX <= OBSTACLE_TRIGGER_X) {
          gs.phase = 'question'; gs.currentQIdx = i;
          setUiQIdx(i); setUiPhase('question'); break;
        }
      }
      if (gs.obstacles.every(o => o.cleared) && gs.marioWorldX > gs.obstacles.at(-1)?.worldX + 300) {
        gs.phase = 'victory'; setUiPhase('victory'); launchFireworks();
      }
    } else if (gs.phase === 'jumping') {
      gs.jumpY += gs.jumpVy; gs.jumpVy -= 0.7;
      gs.legTimer++; if (gs.legTimer > 8) { gs.legPhase ^= 1; gs.legTimer = 0; }
      gs.marioWorldX += MARIO_SPEED * 1.6;
      gs.cameraX = gs.marioWorldX - MARIO_SCREEN_X;
      if (gs.jumpY <= 0) { gs.jumpY = 0; gs.jumpVy = 0; gs.phase = 'running'; }
    }

    // Sky
    const skyG = ctx.createLinearGradient(0, 0, 0, groundY);
    skyG.addColorStop(0, '#1976D2'); skyG.addColorStop(1, '#90CAF9');
    ctx.fillStyle = skyG; ctx.fillRect(0, 0, W, groundY);

    // Sun
    const sg = ctx.createRadialGradient(W - 100, 65, 10, W - 100, 65, 52);
    sg.addColorStop(0, '#FFF176'); sg.addColorStop(0.5, '#FFD600'); sg.addColorStop(1, 'rgba(255,214,0,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(W - 100, 65, 52, 0, 2 * Math.PI); ctx.fill();

    gs.clouds.forEach(c => drawCloud(ctx, c.worldX - gs.cameraX * 0.28, c.y, c.width));
    gs.birds.forEach(b => drawBird(ctx, b.worldX - gs.cameraX * 0.55, b.y));
    drawWater(ctx, W, groundY, H, gs.waveOffset);
    drawGround(ctx, W, groundY);
    gs.obstacles.forEach(obs => { if (obs.cleared) return; const sx = obs.worldX - gs.cameraX; if (sx > -80 && sx < W + 80) drawPipe(ctx, sx, groundY); });

    if (gs.phase !== 'victory') drawMario(ctx, MARIO_SCREEN_X, groundY - 62, gs.legPhase, gs.jumpY);

    // HUD
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(10, 10, 180, 38);
    ctx.fillStyle = 'white'; ctx.font = 'bold 15px "Courier New",monospace'; ctx.textAlign = 'left';
    ctx.fillText(`⭐ ${gs.score}   📍 ${gs.currentQIdx + 1}/${gs.questions.length}`, 18, 34);
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
    <div className="mario-wrapper">
      <canvas ref={canvasRef} className="mario-canvas" />
      <button className="mario-back-btn" onClick={() => navigate('/dashboard')}><ArrowLeft size={17} /> Quay lại</button>

      {uiPhase === 'question' && q && (
        <div className="mario-overlay">
          <div className={`mario-modal ${feedback === 'wrong' ? 'shake' : ''}`}>
            {feedback && <div className={`mario-feedback ${feedback}`}>{feedback === 'correct' ? '✨ Chính xác!' : '❌ Sai rồi! Thử lại!'}</div>}
            <div className="mario-q-meta">
              <span className="mario-badge">Câu {uiQIdx + 1}/{questions.length}</span>
              <span className="mario-pipe-label">🪛 Vượt chướng ngại vật!</span>
            </div>
            <p className="mario-q-text">{q.question}</p>
            <div className="mario-opts">
              {opts.map(o => (
                <button key={o.k} className={`mario-opt opt-${o.k.toLowerCase()}`} onClick={() => !feedback && !processingRef.current && handleAnswer(o.k)} disabled={!!feedback}>
                  <span className="opt-key">{o.k}</span> {o.t}
                </button>
              ))}
            </div>
            <div className="mario-voice-row">
              <button className={`mario-mic-btn ${isListening ? 'listening' : ''}`} onClick={isListening ? stopListening : startListening} disabled={!!feedback}>
                {isListening ? <><MicOff size={18} /> Đang nghe... nói A/B/C/D</> : <><Mic size={18} /> Nói đáp án (A / B / C / D)</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {uiPhase === 'victory' && (
        <div className="mario-victory">
          <div className="mario-victory-card">
            <div style={{ fontSize: '4.5rem' }}>🏆</div>
            <h1>Hoàn thành!</h1>
            <p>Vượt qua tất cả chướng ngại vật!</p>
            <p className="v-score">⭐ {score} / {questions.length * 10} điểm</p>
            <div className="v-actions">
              <button className="v-replay" onClick={() => window.location.reload()}><RotateCcw size={16} /> Chơi lại</button>
              <button className="v-home" onClick={() => navigate('/dashboard')}>🏠 Về trang chủ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarioRiverGame;
