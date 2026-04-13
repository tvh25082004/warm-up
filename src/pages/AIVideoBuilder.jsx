import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Chrome, Video } from 'lucide-react';

const HEYGEN_URL = 'https://app.heygen.com/home';

const AIVideoBuilder = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      navigate('/login');
      return;
    }
    setUser(JSON.parse(storedUser));
  }, [navigate]);

  if (!user) return null;

  return (
    <div className="dashboard-container">
      <main className="dashboard-main" style={{ maxWidth: 900, margin: '0 auto' }}>
        <motion.div
          className="welcome-banner glass-panel"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          <h1 style={{ fontSize: '2.1rem' }}>Tạo Video Giảng Dạy Bằng AI</h1>
          <p>
            Luồng tạo video sẽ chuyển sang HeyGen để đăng nhập Google, nhập prompt
            và xuất video như giao diện gốc.
          </p>
        </motion.div>

        <motion.div
          className="option-card builder-card glass-panel"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ maxWidth: 700, margin: '0 auto', cursor: 'default' }}
        >
          <div className="icon-wrapper" style={{ background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)' }}>
            <Video size={40} color="white" />
          </div>
          <h3>Kết nối HeyGen</h3>
          <p>
            Nhấn nút bên dưới để mở HeyGen. Tại đó cô đăng nhập Google và tạo video theo prompt bình thường.
          </p>

          <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              className="logout-button"
              onClick={() => navigate('/dashboard')}
              style={{ borderColor: '#d1d5db' }}
            >
              <ArrowLeft size={18} /> Quay lại Dashboard
            </button>
            <button
              className="logout-button"
              onClick={() => window.location.assign(HEYGEN_URL)}
              style={{ borderColor: '#60a5fa', color: '#1d4ed8' }}
            >
              <Chrome size={18} /> Tiếp tục với Google trên HeyGen
            </button>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default AIVideoBuilder;
