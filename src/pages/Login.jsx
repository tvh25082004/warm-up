import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, Gamepad2, Lock } from 'lucide-react';
import confetti from 'canvas-confetti';
import '../styles/Login.css';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    if (username === 'tranyennhi' && password === 'tranyennhi' && otp === '1997') {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#FF5A5F', '#00A699', '#FC642D', '#F4C03B']
      });
      // Store user identity
      localStorage.setItem('user', JSON.stringify({ name: 'Trần Yến Nhi', username }));
      setTimeout(() => navigate('/dashboard'), 1500);
    } else {
      setError('Tài khoản, mật khẩu hoặc mã OTP chưa chính xác!');
    }
  };

  return (
    <div className="login-container">
      <motion.div 
        className="login-card glass-panel"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.5, duration: 0.8 }}
      >
        <motion.div 
          className="login-header"
          initial={{ y: -50 }}
          animate={{ y: 0 }}
          transition={{ delay: 0.2, type: 'spring' }}
        >
          <Gamepad2 size={48} color="#FF5A5F" className="bouncing-icon" />
          <h1 className="title-text">Warm-up!</h1>
          <p>Sân chơi trí tuệ học đường</p>
        </motion.div>

        <form onSubmit={handleLogin} className="login-form">
          <div className="input-group">
            <label>Tên đăng nhập</label>
            <input 
              type="text" 
              placeholder="Ví dụ: tranyennhi" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required 
            />
          </div>
          
          <div className="input-group">
            <label>Mật khẩu</label>
            <input 
              type="password" 
              placeholder="Nhập mật khẩu" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
            />
          </div>

          <div className="input-group">
            <label>Mã trường (OTP)</label>
            <div className="otp-input-wrapper">
              <Lock size={20} className="input-icon" />
              <input 
                type="text" 
                placeholder="Ví dụ: 1997" 
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                required 
              />
            </div>
          </div>

          {error && (
            <motion.p 
              className="error-message"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
            >
              {error}
            </motion.p>
          )}

          <motion.button 
            type="submit" 
            className="login-button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Sparkles size={20} />
            <span>Vào Lớp Học Nhé!</span>
            <Sparkles size={20} />
          </motion.button>
        </form>
      </motion.div>

      {/* Floating decorative elements */}
      <motion.div className="floating-shape shape-1" animate={{ y: [0, -20, 0], rotate: [0, 10, 0] }} transition={{ repeat: Infinity, duration: 4 }} />
      <motion.div className="floating-shape shape-2" animate={{ y: [0, 30, 0], rotate: [0, -15, 0] }} transition={{ repeat: Infinity, duration: 5 }} />
      <motion.div className="floating-shape shape-3" animate={{ y: [0, -25, 0], rotate: [0, 20, 0] }} transition={{ repeat: Infinity, duration: 4.5 }} />
    </div>
  );
};

export default Login;
