import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Upload, FileText, Trash2, Play, PlusCircle, Save } from 'lucide-react';
import mammoth from 'mammoth';
import '../styles/ImportQuestions.css';

/**
 * QuestionParser - Utility class to parse questions from text content
 * No API key needed - pure client-side parsing
 */
class QuestionParser {
  /**
   * Parse raw text into structured questions
   * Supports formats:
   * 1. "Question? A) opt1 B) opt2 Answer: A"
   * 2. "1. Question ___ answer. a) opt1 b) opt2"
   * 3. Simple line-by-line with question|optionA|optionB|answer
   */
  static parseText(text) {
    const questions = [];
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    let currentQ = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Pattern 1: Numbered question "1. Question text"
      const numberedMatch = line.match(/^\d+[\.\)]\s*(.+)/);
      // Pattern 2: Pipe-separated "question|optA|optB|answer"
      const pipeMatch = line.match(/^(.+)\|(.+)\|(.+)\|(.+)$/);
      
      if (pipeMatch) {
        questions.push({
          question: pipeMatch[1].trim(),
          optionA: pipeMatch[2].trim(),
          optionB: pipeMatch[3].trim(),
          answer: pipeMatch[4].trim().toUpperCase() === 'B' ? 'B' : 'A'
        });
        continue;
      }

      if (numberedMatch) {
        // Save previous question if exists
        if (currentQ && currentQ.question && currentQ.optionA && currentQ.optionB) {
          questions.push(currentQ);
        }
        currentQ = { question: numberedMatch[1], optionA: '', optionB: '', answer: 'A' };
        
        // Check if options are on the same line
        const optMatch = numberedMatch[1].match(/(.+?)\s*[aA][\.\)]\s*(.+?)\s*[bB][\.\)]\s*(.+?)(?:\s*(?:Answer|Đáp án|ĐA)[:\s]*([ABab]))?$/i);
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

      // Check for option lines
      if (currentQ) {
        const optAMatch = line.match(/^[aA][\.\)]\s*(.+)/);
        const optBMatch = line.match(/^[bB][\.\)]\s*(.+)/);
        const answerMatch = line.match(/^(?:Answer|Đáp án|ĐA|Correct)[:\s]*([ABab])/i);
        
        if (optAMatch) currentQ.optionA = optAMatch[1].trim();
        else if (optBMatch) currentQ.optionB = optBMatch[1].trim();
        else if (answerMatch) currentQ.answer = answerMatch[1].toUpperCase();
      }
    }

    // Push last question
    if (currentQ && currentQ.question && currentQ.optionA && currentQ.optionB) {
      questions.push(currentQ);
    }

    return questions;
  }
}

const ImportQuestions = () => {
  const navigate = useNavigate();
  const [textContent, setTextContent] = useState('');
  const [parsedQuestions, setParsedQuestions] = useState([]);
  const [fileName, setFileName] = useState('');
  const [savedSets, setSavedSets] = useState(() => {
    const stored = localStorage.getItem('question_sets');
    return stored ? JSON.parse(stored) : [];
  });
  const [setName, setSetName] = useState('');
  const fileInputRef = useRef(null);

  // Handle DOCX file upload
  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setFileName(file.name);

    if (file.name.endsWith('.docx')) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        setTextContent(result.value);
      } catch (err) {
        alert('Không thể đọc file DOCX. Vui lòng thử lại!');
        console.error(err);
      }
    } else if (file.name.endsWith('.txt')) {
      const text = await file.text();
      setTextContent(text);
    } else {
      alert('Chỉ hỗ trợ file .docx và .txt');
    }
  }, []);

  // Parse the text content
  const handleParse = () => {
    if (!textContent.trim()) {
      alert('Vui lòng nhập nội dung hoặc tải file trước!');
      return;
    }
    const questions = QuestionParser.parseText(textContent);
    if (questions.length === 0) {
      alert('Không tìm thấy câu hỏi nào. Hãy kiểm tra lại định dạng!\n\nĐịnh dạng hỗ trợ:\n- 1. Câu hỏi a) Đáp án A b) Đáp án B Đáp án: A\n- câu hỏi|đáp án A|đáp án B|A');
      return;
    }
    setParsedQuestions(questions);
  };

  // Save question set to localStorage
  const handleSave = () => {
    if (parsedQuestions.length === 0) return;
    const name = setName.trim() || `Bộ đề ${new Date().toLocaleDateString('vi-VN')}`;
    const newSet = {
      id: Date.now(),
      name,
      questions: parsedQuestions,
      createdAt: new Date().toISOString()
    };
    const updated = [...savedSets, newSet];
    setSavedSets(updated);
    localStorage.setItem('question_sets', JSON.stringify(updated));
    alert(`Đã lưu "${name}" với ${parsedQuestions.length} câu hỏi!`);
    setSetName('');
  };

  // Delete a saved question set
  const handleDeleteSet = (id) => {
    const updated = savedSets.filter(s => s.id !== id);
    setSavedSets(updated);
    localStorage.setItem('question_sets', JSON.stringify(updated));
  };

  // Play a saved set
  const handlePlaySet = (set) => {
    localStorage.setItem('active_game_questions', JSON.stringify(set.questions));
    navigate('/game/headtilt');
  };

  // Edit a question inline
  const updateQuestion = (index, field, value) => {
    setParsedQuestions(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Add a manual question
  const addBlankQuestion = () => {
    setParsedQuestions(prev => [...prev, { question: '', optionA: '', optionB: '', answer: 'A' }]);
  };

  return (
    <div className="import-container">
      <div className="import-header glass-panel">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={20} /> Quay lại
        </button>
        <h2>📄 Nhập Bộ Câu Hỏi</h2>
        <div style={{ width: 120 }} />
      </div>

      <div className="import-body">
        {/* Left: Input Area */}
        <div className="import-input-section glass-panel">
          <h3>Nhập nội dung hoặc tải file</h3>
          
          <div className="upload-area" onClick={() => fileInputRef.current?.click()}>
            <Upload size={40} color="#9C27B0" />
            <p>{fileName || 'Nhấn để tải file .docx hoặc .txt'}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.txt"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
          </div>

          <div className="divider-or">hoặc nhập trực tiếp</div>

          <textarea
            className="text-input"
            placeholder={`Nhập câu hỏi theo định dạng:\n\n1. There ___ a cat on the table. a) is b) are Đáp án: A\n2. ___ are my books. a) This b) These Đáp án: B\n\nHoặc dạng đơn giản:\ncâu hỏi|đáp án A|đáp án B|A`}
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            rows={12}
          />

          <motion.button 
            className="parse-btn"
            onClick={handleParse}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            <FileText size={20} /> Phân Tích & Tạo Đề
          </motion.button>
        </div>

        {/* Right: Parsed Questions & Saved Sets */}
        <div className="import-result-section">
          {/* Parsed questions */}
          {parsedQuestions.length > 0 && (
            <motion.div 
              className="parsed-card glass-panel"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <div className="parsed-header">
                <h3>📝 {parsedQuestions.length} câu hỏi đã phân tích</h3>
                <div className="save-area">
                  <input
                    type="text"
                    placeholder="Tên bộ đề..."
                    value={setName}
                    onChange={(e) => setSetName(e.target.value)}
                    className="set-name-input"
                  />
                  <motion.button className="save-btn" onClick={handleSave} whileTap={{ scale: 0.95 }}>
                    <Save size={18} /> Lưu
                  </motion.button>
                </div>
              </div>
              
              <div className="questions-list">
                {parsedQuestions.map((q, idx) => (
                  <div key={idx} className="question-item">
                    <span className="q-number">{idx + 1}</span>
                    <div className="q-fields">
                      <input
                        className="q-input"
                        value={q.question}
                        onChange={(e) => updateQuestion(idx, 'question', e.target.value)}
                        placeholder="Câu hỏi..."
                      />
                      <div className="q-options">
                        <div className={`q-opt ${q.answer === 'A' ? 'correct' : ''}`}>
                          <span>A.</span>
                          <input 
                            value={q.optionA} 
                            onChange={(e) => updateQuestion(idx, 'optionA', e.target.value)} 
                          />
                          <button onClick={() => updateQuestion(idx, 'answer', 'A')} className="ans-btn">✓</button>
                        </div>
                        <div className={`q-opt ${q.answer === 'B' ? 'correct' : ''}`}>
                          <span>B.</span>
                          <input 
                            value={q.optionB} 
                            onChange={(e) => updateQuestion(idx, 'optionB', e.target.value)} 
                          />
                          <button onClick={() => updateQuestion(idx, 'answer', 'B')} className="ans-btn">✓</button>
                        </div>
                      </div>
                    </div>
                    <button className="delete-q" onClick={() => setParsedQuestions(prev => prev.filter((_, i) => i !== idx))}>✕</button>
                  </div>
                ))}
              </div>

              <button className="add-q-btn" onClick={addBlankQuestion}>
                <PlusCircle size={18} /> Thêm câu hỏi
              </button>
            </motion.div>
          )}

          {/* Saved Sets */}
          {savedSets.length > 0 && (
            <div className="saved-sets glass-panel">
              <h3>📚 Bộ đề đã lưu</h3>
              {savedSets.map(set => (
                <div key={set.id} className="saved-set-item">
                  <div>
                    <strong>{set.name}</strong>
                    <span>{set.questions.length} câu hỏi</span>
                  </div>
                  <div className="set-actions">
                    <motion.button className="play-set-btn" onClick={() => handlePlaySet(set)} whileTap={{ scale: 0.95 }}>
                      <Play size={16} /> Chơi
                    </motion.button>
                    <button className="del-set-btn" onClick={() => handleDeleteSet(set.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportQuestions;
