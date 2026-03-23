import React, { useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Upload, FileText, PenLine, Sparkles, Play, Trash2 } from 'lucide-react';
import mammoth from 'mammoth';
import aiService from '../services/GeminiService';
import '../styles/GameSetSelector.css';

/**
 * QuestionParser (same as ImportQuestions)
 */
class QuestionParser {
  static parseText(text, gameType = 'headtilt') {
    const questions = [];
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    if (gameType === 'vocabmatch') {
      for (let i = 0; i < lines.length; i++) {
        const parts = lines[i].split('-');
        if (parts.length >= 2) {
          questions.push({
            left: parts[0].trim(),
            right: parts.slice(1).join('-').trim(),
            emoji: '✨' // default emoji
          });
        }
      }
      return questions;
    }

    let currentQ = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Pipe format
      const pipeMatch = line.match(/^(.+)\|(.+)\|(.+)\|([ABab])$/);
      if (pipeMatch) {
        questions.push({
          question: pipeMatch[1].trim(),
          optionA: pipeMatch[2].trim(),
          optionB: pipeMatch[3].trim(),
          answer: pipeMatch[4].toUpperCase()
        });
        continue;
      }

      // Numbered question with inline options
      const numberedMatch = line.match(/^\d+[\.\)]\s*(.+)/);
      if (numberedMatch) {
        if (currentQ?.question && currentQ?.optionA && currentQ?.optionB) {
          questions.push(currentQ);
        }
        currentQ = { question: numberedMatch[1], optionA: '', optionB: '', answer: 'A' };

        const optMatch = currentQ.question.match(/(.+?)\s*[aA][\.\)]\s*(.+?)\s*[bB][\.\)]\s*(.+?)(?:\s*(?:Answer|Đáp án|ĐA)[:\s]*([ABab]))?$/i);
        if (optMatch) {
          currentQ.question = optMatch[1].trim();
          currentQ.optionA = optMatch[2].trim();
          currentQ.optionB = optMatch[3].trim();
          currentQ.answer = (optMatch[4] || 'A').toUpperCase();
          questions.push(currentQ);
          currentQ = null;
        }
        continue;
      }

      if (currentQ) {
        const optAMatch = line.match(/^[aA][\.\)]\s*(.+)/);
        const optBMatch = line.match(/^[bB][\.\)]\s*(.+)/);
        const answerMatch = line.match(/^(?:Answer|Đáp án|ĐA|Correct)[:\s]*([ABab])/i);
        if (optAMatch) currentQ.optionA = optAMatch[1].trim();
        else if (optBMatch) currentQ.optionB = optBMatch[1].trim();
        else if (answerMatch) currentQ.answer = answerMatch[1].toUpperCase();
      }
    }
    if (currentQ?.question && currentQ?.optionA && currentQ?.optionB) {
      questions.push(currentQ);
    }
    return questions;
  }
}

const GameSetSelector = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const gameType = searchParams.get('game') || 'headtilt';
  const isVocab = gameType === 'vocabmatch';
  const isMario = gameType === 'mario';
  const isFlappy = gameType === 'flappybird';
  const isTreasure = gameType === 'treasurequest';

  const [tab, setTab] = useState('saved'); // 'saved' | 'ai' | 'manual' | 'upload'
  const [savedSets, setSavedSets] = useState(() => {
    return JSON.parse(localStorage.getItem('question_sets') || '[]');
  });
  const [aiTopic, setAiTopic] = useState('');
  const [aiCount, setAiCount] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [manualText, setManualText] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [preview, setPreview] = useState(null); // parsed questions to preview
  const fileRef = useRef(null);

  const launchGame = (questions) => {
    if (!questions || questions.length === 0) return alert('Bộ đề trống!');
    if (isVocab) {
      localStorage.setItem('active_vocab_pairs', JSON.stringify(questions));
      navigate('/game/vocabmatch');
    } else if (isMario) {
      localStorage.setItem('active_mario_questions', JSON.stringify(questions));
      navigate('/game/mario');
    } else if (isFlappy) {
      localStorage.setItem('active_flappy_questions', JSON.stringify(questions));
      navigate('/game/flappybird');
    } else if (isTreasure) {
      localStorage.setItem('active_treasure_questions', JSON.stringify(questions));
      navigate('/game/treasure');
    } else {
      localStorage.setItem('active_game_questions', JSON.stringify(questions));
      navigate('/game/headtilt');
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    try {
      if (file.name.endsWith('.docx')) {
        const ab = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: ab });
        setFileContent(result.value);
      } else {
        setFileContent(await file.text());
      }
    } catch {
      alert('Không đọc được file!');
    }
  };

  const parseAndPreview = (text) => {
    const qs = QuestionParser.parseText(text, gameType);
    if (qs.length === 0) return alert('Không tìm thấy câu hỏi. Kiểm tra định dạng!');
    setPreview(qs);
  };

  const generateWithAI = async () => {
    if (!aiTopic.trim()) return alert('Nhập chủ đề!');
    setIsGenerating(true);
    try {
      const prompt = isVocab 
        ? `Tạo ${aiCount} từ vựng tiếng Anh về chủ đề: "${aiTopic}". Trả về đúng JSON array: [{"left": "English word", "right": "Nghĩa tiếng Việt", "emoji": "icon"}]`
        : isMario
        ? `Tạo ${aiCount} câu hỏi trắc nghiệm tiếng Anh sôi động cho Mario về chủ đề: "${aiTopic}". Mỗi câu có 4 đáp án A, B, C, D. Có thể dùng "___" để làm câu hỏi điền từ. Trả về đúng JSON array: [{"question": "...", "optionA": "...", "optionB": "...", "optionC": "...", "optionD": "...", "answer": "A hoặc B hoặc C hoặc D", "hint": "Gợi ý ngắn"}]`
        : isFlappy
        ? `Tạo ${aiCount} câu hỏi trắc nghiệm tiếng Anh cho game Flappy Bird về chủ đề: "${aiTopic}". Mỗi câu có 4 đáp án A, B, C, D. Dùng "___" ở vị trí cần điền. Trả về đúng JSON array: [{"question": "...", "optionA": "...", "optionB": "...", "optionC": "...", "optionD": "...", "answer": "A hoặc B hoặc C hoặc D", "hint": "Gợi ý ngắn"}]`
        : isTreasure
        ? `Tạo ${aiCount} câu hỏi trắc nghiệm tiếng Anh cho game thám hiểm rừng xanh (Jungle Maze) về chủ đề: "${aiTopic}". Mỗi câu có 4 đáp án A, B, C, D. Khuyến khích dùng "___" cho câu hỏi điền từ. Trả về đúng JSON array: [{"question": "...", "optionA": "...", "optionB": "...", "optionC": "...", "optionD": "...", "answer": "A hoặc B hoặc C hoặc D", "hint": "Gợi ý ngắn"}]`
        : `Tạo ${aiCount} câu hỏi trắc nghiệm tiếng Anh về chủ đề: "${aiTopic}". Mỗi câu có 2 đáp án A và B. Trả về đúng JSON array: [{"question": "...", "optionA": "...", "optionB": "...", "answer": "A hoặc B"}]`;
      const response = await aiService.generateResponse([], prompt);
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('AI không trả về JSON hợp lệ');
      const qs = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(qs) || qs.length === 0) throw new Error('Bộ câu rỗng');
      
      if (isVocab) {
        setPreview(qs.map(q => ({
          left: q.left || q.word || q.tiếng_Anh || '',
          right: q.right || q.meaning || q.tiếng_Việt || '',
          emoji: q.emoji || '✨'
        })));
      } else {
        setPreview(qs.map(q => ({
          question: q.question || '',
          optionA: q.optionA || q.a || '',
          optionB: q.optionB || q.b || '',
          optionC: q.optionC || q.c || '',
          optionD: q.optionD || q.d || '',
          answer: (q.answer || 'A').toUpperCase(),
          hint: q.hint || ''
        })));
      }
    } catch (err) {
      alert(`Lỗi tạo AI: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const savePreview = () => {
    const name = aiTopic || fileName || 'Bộ đề ' + new Date().toLocaleDateString('vi-VN');
    const set = { id: Date.now(), name, questions: preview };
    const sets = [...savedSets, set];
    localStorage.setItem('question_sets', JSON.stringify(sets));
    setSavedSets(sets);
    alert('Đã lưu!');
    setPreview(null);
    setTab('saved');
  };

  const deleteSet = (id) => {
    const sets = savedSets.filter(s => s.id !== id);
    localStorage.setItem('question_sets', JSON.stringify(sets));
    setSavedSets(sets);
  };

  return (
    <div className="gss-container">
      <div className="gss-header glass-panel">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={20} /> Quay lại
        </button>
        <h2>🎯 Chọn Bộ {isVocab ? 'Từ Vựng' : isFlappy ? 'Câu Hỏi Flappy Bird' : isMario ? 'Câu Hỏi Mario' : isTreasure ? 'Câu Hỏi Kho Báu' : 'Câu Hỏi'} Để Chơi</h2>
        <div style={{ width: 100 }} />
      </div>

      {/* Tabs */}
      <div className="gss-tabs">
        {[
          { key: 'saved', label: '📚 Đã lưu', icon: null },
          { key: 'ai', label: '🤖 Tạo bằng AI', icon: null },
          { key: 'manual', label: '✏️ Nhập tay', icon: null },
          { key: 'upload', label: '📄 Upload file', icon: null },
        ].map(t => (
          <button
            key={t.key}
            className={`gss-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => { setTab(t.key); setPreview(null); }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="gss-content">
        {/* ===== Preview panel (if parsed) ===== */}
        {preview && (
          <motion.div className="gss-preview glass-panel" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="gss-preview-header">
              <h3>✅ {preview.length} câu hỏi sẵn sàng!</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <motion.button className="play-set-btn" onClick={() => launchGame(preview)} whileTap={{ scale: 0.95 }}>
                  <Play size={18} /> Chơi ngay!
                </motion.button>
                <button className="save-preview-btn" onClick={savePreview}>💾 Lưu</button>
                <button className="discard-btn" onClick={() => setPreview(null)}>✕</button>
              </div>
            </div>
            <div className="gss-preview-list">
              {preview.slice(0, 5).map((q, i) => (
                <div key={i} className="preview-q">
                  {isVocab ? (
                    <>{q.emoji} <b>{q.left}</b> - {q.right}</>
                  ) : (
                    <><b>{i + 1}.</b> {q.question} → <span className="ans-tag">✓ {q.answer === 'A' ? q.optionA : q.optionB}</span></>
                  )}
                </div>
              ))}
              {preview.length > 5 && <div className="more-qs">+ {preview.length - 5} câu nữa...</div>}
            </div>
          </motion.div>
        )}

        {/* ===== Saved sets ===== */}
        {tab === 'saved' && (
          <div className="gss-panel glass-panel">
            <h3>Bộ đề đã lưu</h3>
            {savedSets.length === 0 ? (
              <p className="empty-msg">Chưa có bộ đề nào. Tạo từ AI hoặc nhập tay!</p>
            ) : (
              <div className="saved-grid">
                {savedSets.map(s => (
                  <motion.div key={s.id} className="saved-card" whileHover={{ scale: 1.02, y: -3 }}>
                    <div className="saved-card-info">
                      <strong>{s.name}</strong>
                      <span>{s.questions.length} câu</span>
                    </div>
                    <div className="saved-card-actions">
                      <button className="play-card-btn" onClick={() => launchGame(s.questions)}>
                        <Play size={16} /> Chơi
                      </button>
                      <button className="del-card-btn" onClick={() => deleteSet(s.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== AI Generate ===== */}
        {tab === 'ai' && (
          <div className="gss-panel glass-panel">
            <h3>🤖 Để AI tạo bộ câu hỏi</h3>
            <div className="ai-form">
              <label>Chủ đề / yêu cầu:</label>
              <input
                type="text"
                value={aiTopic}
                onChange={e => setAiTopic(e.target.value)}
                placeholder='VD: "Phân biệt This/That/These/Those lớp 3"'
                className="gss-input"
              />
              <label>Số câu hỏi:</label>
              <div className="count-row">
                {[5, 10, 15, 20].map(n => (
                  <button key={n} className={`count-btn ${aiCount === n ? 'active' : ''}`} onClick={() => setAiCount(n)}>{n}</button>
                ))}
              </div>
              <motion.button
                className="generate-btn"
                onClick={generateWithAI}
                disabled={isGenerating}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                {isGenerating ? '⏳ Đang tạo...' : <><Sparkles size={18} /> Tạo Ngay!</>}
              </motion.button>
            </div>
          </div>
        )}

        {/* ===== Manual Input ===== */}
        {tab === 'manual' && (
          <div className="gss-panel glass-panel">
            <h3>✏️ Nhập câu hỏi thủ công</h3>
            <div className="format-hint">
              <b>Định dạng:</b><br/>
              {isVocab ? (
                <code>Apple - Quả táo<br/>Dog - Con chó</code>
              ) : (
                <><code>1. Câu hỏi a) Đáp A b) Đáp B Đáp án: A</code><br/><code>câu hỏi|Đáp A|Đáp B|A</code></>
              )}
            </div>
            <textarea
              className="manual-textarea"
              value={manualText}
              onChange={e => setManualText(e.target.value)}
              placeholder={isVocab ? "Nhập từ vựng theo định dạng 'Từ tiếng Anh - Từ tiếng Việt'..." : "Nhập câu hỏi theo định dạng trên..."}
              rows={12}
            />
            <motion.button
              className="parse-manual-btn"
              onClick={() => parseAndPreview(manualText)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <FileText size={18} /> Phân tích & Xem trước
            </motion.button>
          </div>
        )}

        {/* ===== File Upload ===== */}
        {tab === 'upload' && (
          <div className="gss-panel glass-panel">
            <h3>📄 Upload file DOCX / TXT</h3>
            <div className="upload-drop" onClick={() => fileRef.current?.click()}>
              <Upload size={48} color="#9C27B0" />
              <p>{fileName || 'Nhấn để chọn file .docx hoặc .txt'}</p>
              <input ref={fileRef} type="file" accept=".docx,.txt" style={{ display: 'none' }} onChange={handleFileUpload} />
            </div>
            {fileContent && (
              <motion.button
                className="parse-manual-btn"
                onClick={() => parseAndPreview(fileContent)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                whileHover={{ scale: 1.03 }}
              >
                <FileText size={18} /> Đọc & Xem trước
              </motion.button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default GameSetSelector;
