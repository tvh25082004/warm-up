import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Send, Trash2, Bot, User, Loader2,
  PlusCircle, MessageSquare, Play, ChevronLeft, ChevronRight
} from 'lucide-react';
import aiService from '../services/GeminiService';
import '../styles/QuestionBuilder.css';

const WELCOME_MSG = {
  role: 'assistant',
  content: `Xin chào cô Yến Nhi! 👋\n\nTôi là trợ lý AI giúp cô tạo bộ câu hỏi cho các bé.\n\nCô có thể:\n• Nhập chủ đề & số câu: "Tạo 10 câu phân biệt This/That"\n• Yêu cầu format JSON: "Tạo JSON 5 câu về động vật"\n• Chat hỏi đáp bình thường\n\nSau khi tạo xong, nhấn nút ▶ CHƠI NGAY để vào game!`
};

/**
 * SessionManager - Manages chat sessions using localStorage
 * OOP pattern: each session has id, name, messages
 */
class SessionManager {
  static STORAGE_KEY = 'chat_sessions';
  static ACTIVE_KEY = 'active_session_id';

  static loadSessions() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  }

  static saveSessions(sessions) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessions));
  }

  static createSession(name = null) {
    const session = {
      id: Date.now().toString(),
      name: name || `Buổi ${new Date().toLocaleDateString('vi-VN')} ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`,
      messages: [WELCOME_MSG],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const sessions = this.loadSessions();
    sessions.unshift(session);
    this.saveSessions(sessions);
    return session;
  }

  static updateSession(sessionId, messages) {
    const sessions = this.loadSessions();
    const idx = sessions.findIndex(s => s.id === sessionId);
    if (idx >= 0) {
      sessions[idx].messages = messages;
      sessions[idx].updatedAt = new Date().toISOString();
      // Auto-name from first user message
      const firstUserMsg = messages.find(m => m.role === 'user');
      if (firstUserMsg && sessions[idx].name.startsWith('Buổi')) {
        sessions[idx].name = firstUserMsg.content.substring(0, 40) + (firstUserMsg.content.length > 40 ? '...' : '');
      }
      this.saveSessions(sessions);
    }
  }

  static deleteSession(sessionId) {
    const sessions = this.loadSessions().filter(s => s.id !== sessionId);
    this.saveSessions(sessions);
  }
}

/**
 * Try to extract a JSON question array from AI response text
 */
const extractQuestions = (text) => {
  try {
    // Try to find JSON array in the response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Normalize fields
        return parsed.map(q => ({
          question: q.question || q.câu_hỏi || q.text || '',
          optionA: q.optionA || q.a || q.A || q.option_a || '',
          optionB: q.optionB || q.b || q.B || q.option_b || '',
          answer: (q.answer || q.đáp_án || q.correct || 'A').toString().toUpperCase()
        })).filter(q => q.question && q.optionA && q.optionB);
      }
    }
  } catch (e) {}
  return null;
};

const QuestionBuilder = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [messages, setMessages] = useState([WELCOME_MSG]);
  const [inputMsg, setInputMsg] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [extractedQuestions, setExtractedQuestions] = useState(null);
  const messagesEndRef = useRef(null);

  // Load sessions on mount
  useEffect(() => {
    let loaded = SessionManager.loadSessions();
    if (loaded.length === 0) {
      const first = SessionManager.createSession();
      loaded = [first];
    }
    setSessions(loaded);
    setActiveSession(loaded[0]);
    setMessages(loaded[0].messages);
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Check last AI message for JSON questions
  useEffect(() => {
    const lastAI = [...messages].reverse().find(m => m.role === 'assistant');
    if (lastAI) {
      const qs = extractQuestions(lastAI.content);
      setExtractedQuestions(qs && qs.length > 0 ? qs : null);
    }
  }, [messages]);

  const switchSession = (session) => {
    if (activeSession) {
      SessionManager.updateSession(activeSession.id, messages);
    }
    setActiveSession(session);
    setMessages(session.messages);
    setExtractedQuestions(null);
  };

  const newSession = () => {
    if (activeSession) {
      SessionManager.updateSession(activeSession.id, messages);
    }
    const session = SessionManager.createSession();
    const updated = SessionManager.loadSessions();
    setSessions(updated);
    setActiveSession(session);
    setMessages(session.messages);
    setExtractedQuestions(null);
  };

  const deleteSession = (e, sessionId) => {
    e.stopPropagation();
    SessionManager.deleteSession(sessionId);
    const updated = SessionManager.loadSessions();
    setSessions(updated);
    if (updated.length === 0) {
      const fresh = SessionManager.createSession();
      setSessions([fresh]);
      setActiveSession(fresh);
      setMessages(fresh.messages);
    } else if (activeSession?.id === sessionId) {
      setActiveSession(updated[0]);
      setMessages(updated[0].messages);
    }
    setExtractedQuestions(null);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputMsg.trim() || isTyping) return;

    const userMessage = { role: 'user', content: inputMsg };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputMsg('');
    setIsTyping(true);

    try {
      const text = await aiService.generateResponse(messages, inputMsg);
      const finalMessages = [...newMessages, { role: 'assistant', content: text }];
      setMessages(finalMessages);
      if (activeSession) {
        SessionManager.updateSession(activeSession.id, finalMessages);
        setSessions(SessionManager.loadSessions());
      }
    } catch (error) {
      const errMsg = { role: 'assistant', content: `⚠️ ${error.message}` };
      const finalMessages = [...newMessages, errMsg];
      setMessages(finalMessages);
    } finally {
      setIsTyping(false);
    }
  };

  const clearSession = () => {
    const fresh = [WELCOME_MSG];
    setMessages(fresh);
    setExtractedQuestions(null);
    if (activeSession) {
      SessionManager.updateSession(activeSession.id, fresh);
      setSessions(SessionManager.loadSessions());
    }
  };

  const playExtractedQuestions = () => {
    if (extractedQuestions?.length > 0) {
      localStorage.setItem('active_game_questions', JSON.stringify(extractedQuestions));
      navigate('/game/headtilt');
    }
  };

  return (
    <div className="qb-layout">
      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            className="qb-sidebar"
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <div className="qb-sidebar-header">
              <Bot size={22} color="var(--primary)" />
              <h3>Lịch sử chat</h3>
            </div>

            <button className="new-chat-btn" onClick={newSession}>
              <PlusCircle size={18} /> New Chat
            </button>

            <div className="session-list">
              {sessions.map(s => (
                <div
                  key={s.id}
                  className={`session-item ${activeSession?.id === s.id ? 'active' : ''}`}
                  onClick={() => switchSession(s)}
                >
                  <MessageSquare size={16} />
                  <span className="session-name">{s.name}</span>
                  <button className="del-session" onClick={(e) => deleteSession(e, s.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle sidebar button */}
      <button
        className="sidebar-toggle"
        onClick={() => setSidebarOpen(o => !o)}
        style={{ left: sidebarOpen ? 285 : 10 }}
      >
        {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
      </button>

      {/* Main chat area */}
      <div className="qb-main" style={{ marginLeft: sidebarOpen ? 280 : 0 }}>
        <div className="qb-header glass-panel">
          <button className="back-btn" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={20} /> Quay lại
          </button>
          <div className="qb-title">
            <Bot size={28} color="var(--primary)" />
            <h2>Trợ lý AI Tạo Câu Hỏi</h2>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {extractedQuestions && (
              <motion.button
                className="play-now-btn"
                onClick={playExtractedQuestions}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Play size={18} /> CHƠI NGAY ({extractedQuestions.length} câu)
              </motion.button>
            )}
            <button className="clear-btn" onClick={clearSession}>
              <Trash2 size={18} /> Xóa chat
            </button>
          </div>
        </div>

        <div className="chat-window glass-panel">
          <div className="chat-messages">
            {messages.map((msg, idx) => (
              <motion.div
                key={idx}
                className={`chat-bubble-wrapper ${msg.role}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="chat-avatar">
                  {msg.role === 'user' ? <User size={20} color="white" /> : <Bot size={20} color="white" />}
                </div>
                <div className="chat-bubble">
                  {msg.content.split('\n').map((line, i) => (
                    <React.Fragment key={i}>
                      {line}
                      {i < msg.content.split('\n').length - 1 && <br />}
                    </React.Fragment>
                  ))}
                </div>
              </motion.div>
            ))}

            {isTyping && (
              <div className="chat-bubble-wrapper assistant">
                <div className="chat-avatar"><Bot size={20} color="white" /></div>
                <div className="chat-bubble typing-indicator">
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Extracted question banner */}
          <AnimatePresence>
            {extractedQuestions && (
              <motion.div
                className="extracted-banner"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
              >
                <div className="extracted-info">
                  ✅ Phát hiện <b>{extractedQuestions.length}</b> câu hỏi!
                  <button onClick={playExtractedQuestions} className="banner-play-btn">
                    <Play size={14} /> Chơi ngay
                  </button>
                  <button
                    onClick={() => {
                      const set = {
                        id: Date.now(), name: `AI: ${extractedQuestions[0].question.substring(0, 30)}...`,
                        questions: extractedQuestions
                      };
                      const sets = JSON.parse(localStorage.getItem('question_sets') || '[]');
                      localStorage.setItem('question_sets', JSON.stringify([...sets, set]));
                      alert('Đã lưu bộ đề!');
                    }}
                    className="banner-save-btn"
                  >
                    💾 Lưu bộ đề
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <form className="chat-input-area" onSubmit={handleSend}>
            <input
              type="text"
              placeholder='Ví dụ: "Tạo JSON 10 câu phân biệt is/are cho lớp 3"'
              value={inputMsg}
              onChange={(e) => setInputMsg(e.target.value)}
              disabled={isTyping}
            />
            <button type="submit" disabled={!inputMsg.trim() || isTyping}>
              {isTyping ? <Loader2 size={20} className="spinner" /> : <Send size={20} />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default QuestionBuilder;
