import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen, Camera, Gamepad2, LogOut, FileUp } from 'lucide-react';
import '../styles/Dashboard.css';

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    } else {
      navigate('/login');
    }
  }, [navigate]);

  if (!user) return null;

  return (
    <div className="dashboard-container">
      {/* Decorative shapes */}
      <div className="bg-shape shape-circle"></div>
      <div className="bg-shape shape-triangle"></div>

      <nav className="dashboard-nav glass-panel">
        <div className="nav-profile">
          <div className="avatar">{user.name.charAt(0)}</div>
          <h2>Giáo viên: <span>{user.name}</span></h2>
        </div>
        <button className="logout-button" onClick={() => {
          localStorage.removeItem('user');
          navigate('/login');
        }}>
          <LogOut size={18} /> Đăng xuất
        </button>
      </nav>

      <main className="dashboard-main">
        <motion.div 
          className="welcome-banner glass-panel"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          <h1>Chào mừng bạn tới trò chơi Warm-up!</h1>
          <p>Hôm nay chúng ta sẽ tổ chức hoạt động nào cho các bé đây?</p>
        </motion.div>

        {/* Section: Games */}
        <h2 className="section-title">🎮 Chọn Trò Chơi</h2>
        <div className="options-grid">
          <motion.div 
            className="option-card game-card glass-panel"
            whileHover={{ scale: 1.03, y: -5 }}
            onClick={() => navigate('/game/headtilt')}
          >
            <div className="icon-wrapper bg-pink">
              <Camera size={40} color="white" />
            </div>
            <h3>Game Nghiêng Đầu</h3>
            <p>Sử dụng camera để trả lời câu hỏi bằng cách nghiêng đầu sang trái hoặc phải.</p>
          </motion.div>

          <motion.div 
            className="option-card game-card glass-panel"
            whileHover={{ scale: 1.03, y: -5 }}
            onClick={() => navigate('/game/vocabmatch')}
          >
            <div className="icon-wrapper bg-teal">
              <Gamepad2 size={40} color="white" />
            </div>
            <h3>Ghép Từ Vựng</h3>
            <p>Trò chơi kéo thả hoặc chạm để ghép nối các cặp từ vựng chính xác.</p>
          </motion.div>
        </div>

        {/* Section: Build Questions */}
        <h2 className="section-title">📝 Xây Dựng Bộ Câu Hỏi</h2>
        <div className="options-grid">
          <motion.div 
            className="option-card builder-card glass-panel"
            whileHover={{ scale: 1.03, y: -5 }}
            onClick={() => navigate('/builder')}
          >
            <div className="icon-wrapper bg-orange">
              <BookOpen size={40} color="white" />
            </div>
            <h3>Tạo Đề Bằng AI</h3>
            <p>Chat với AI để tự động tạo bộ câu hỏi trắc nghiệm cho bài học.</p>
          </motion.div>

          <motion.div 
            className="option-card builder-card glass-panel"
            whileHover={{ scale: 1.03, y: -5 }}
            onClick={() => navigate('/import')}
          >
            <div className="icon-wrapper bg-purple">
              <FileUp size={40} color="white" />
            </div>
            <h3>Nhập Đề Từ File / Text</h3>
            <p>Tải file DOCX, TXT hoặc nhập trực tiếp nội dung để tạo bộ câu hỏi (không cần AI).</p>
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
