import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Send, Trash2, Bot, User, Loader2 } from 'lucide-react';
import GeminiService from '../services/GeminiService';
import '../styles/QuestionBuilder.css';

const QuestionBuilder = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  // Load chat history from localStorage
  useEffect(() => {
    const history = localStorage.getItem('chat_history');
    if (history) {
      setMessages(JSON.parse(history));
    } else {
      setMessages([
        {
          role: 'assistant',
          content: 'Chào cô Yến Nhi! Cô muốn tạo bộ câu hỏi gì hôm nay ạ? Ví dụ: "Tạo cho tôi 1 bộ câu hỏi phân biệt there và these khoảng 15 câu"'
        }
      ]);
    }
  }, []);

  // Save to localStorage when messages change
  useEffect(() => {
    localStorage.setItem('chat_history', JSON.stringify(messages));
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputMsg.trim()) return;

    const userMessage = { role: 'user', content: inputMsg };
    setMessages((prev) => [...prev, userMessage]);
    setInputMsg('');
    setIsTyping(true);

    try {
      const text = await GeminiService.generateResponse(messages, inputMsg);
      setMessages((prev) => [...prev, { role: 'assistant', content: text }]);
    } catch (error) {
      console.error('Error generating AI response:', error);
      setMessages((prev) => [...prev, { 
        role: 'assistant', 
        content: `⚠️ ${error.message || 'Lỗi không xác định. Vui lòng thử lại!'}` 
      }]);
    }

    setIsTyping(false);
  };

  const clearHistory = () => {
    if (window.confirm('Cô có chắc muốn xóa lịch sử trò chuyện không?')) {
      const initial = [{
        role: 'assistant',
        content: 'Chào cô Yến Nhi! Cô muốn tạo bộ câu hỏi gì hôm nay ạ?'
      }];
      setMessages(initial);
      localStorage.setItem('chat_history', JSON.stringify(initial));
    }
  };

  return (
    <div className="qb-container">
      <div className="qb-header glass-panel">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={20} /> Quay lại
        </button>
        <div className="qb-title">
          <Bot size={28} color="var(--primary)" />
          <h2>Trợ lý AI Tạo Câu Hỏi</h2>
        </div>
        <button className="clear-btn" onClick={clearHistory}>
          <Trash2 size={18} /> Xóa chat
        </button>
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
                {/* Parse newlines simply */}
                {msg.content.split('\n').map((line, i) => (
                  <React.Fragment key={i}>
                    {line}
                    <br />
                  </React.Fragment>
                ))}
              </div>
            </motion.div>
          ))}
          {isTyping && (
            <div className="chat-bubble-wrapper assistant typing">
              <div className="chat-avatar"><Bot size={20} color="white" /></div>
              <div className="chat-bubble"><Loader2 className="spinner" size={18} /> Đang suy nghĩ...</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form className="chat-input-area" onSubmit={handleSend}>
          <input 
            type="text" 
            placeholder="Nhập yêu cầu tạo câu hỏi..." 
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
          />
          <button type="submit" disabled={!inputMsg.trim() || isTyping}>
            <Send size={20} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default QuestionBuilder;
