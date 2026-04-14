import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, FileUp, Sparkles, ClipboardCheck, Image as ImageIcon } from 'lucide-react';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import aiService from '../services/GeminiService';
import audioManager from '../services/AudioManager';
import '../styles/AISpeakingBuilder.css';

const WRITING_LOCAL_STORAGE_KEY = 'ielts_writing_drafts_v1';

const readLocalDrafts = () => {
  try {
    const raw = localStorage.getItem(WRITING_LOCAL_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveLocalDrafts = (drafts) => {
  localStorage.setItem(WRITING_LOCAL_STORAGE_KEY, JSON.stringify(drafts));
};

const normalizeExtractedText = (text) =>
  String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const DOCX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream'
]);

const TEXT_MIME_TYPES = new Set([
  'text/plain'
]);

const EXCEL_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel'
]);

const isDocxFile = (file, lowerName) =>
  lowerName.endsWith('.docx') || DOCX_MIME_TYPES.has(String(file?.type || '').toLowerCase());

const isTxtFile = (file, lowerName) =>
  lowerName.endsWith('.txt') || TEXT_MIME_TYPES.has(String(file?.type || '').toLowerCase());

const isExcelFile = (file, lowerName) =>
  lowerName.endsWith('.xlsx')
  || lowerName.endsWith('.xls')
  || EXCEL_MIME_TYPES.has(String(file?.type || '').toLowerCase());


const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const fileToBase64 = (file) => blobToBase64(file);

const extractTextFromDocx = async (arrayBuffer) => {
  const extractedImages = [];

  const imageConverter = {
    convertImage: mammoth.images.imgElement(async (image) => {
      try {
        const blob = await image.read('blob');
        const dataUri = await blobToBase64(blob);
        extractedImages.push(dataUri);
        return { src: dataUri };
      } catch {
        return {};
      }
    })
  };

  const htmlResult = await mammoth.convertToHtml({ arrayBuffer }, { convertImage: imageConverter.convertImage });
  const html = htmlResult?.value || '';
  const raw = await mammoth.extractRawText({ arrayBuffer });

  if (!html) {
    return { text: normalizeExtractedText(raw?.value || ''), images: extractedImages };
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const segments = [];

  const nodes = Array.from(doc.body?.children || []);
  nodes.forEach((node) => {
    const tag = String(node.tagName || '').toLowerCase();
    if (tag === 'table') {
      const rows = Array.from(node.querySelectorAll('tr'));
      rows.forEach((row) => {
        const cols = Array.from(row.querySelectorAll('th,td'))
          .map((cell) => cell.textContent?.trim())
          .filter(Boolean);
        if (cols.length) segments.push(cols.join(' | '));
      });
      node.querySelectorAll('img').forEach((img) => {
        const src = img.getAttribute('src');
        if (src && src.startsWith('data:')) {
          segments.push(`[Image attached — see vision input]`);
        }
      });
      return;
    }
    const text = node.textContent?.trim();
    if (text) segments.push(text);
    node.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src');
      if (src && src.startsWith('data:')) {
        segments.push(`[Image attached — see vision input]`);
      }
    });
  });

  const fallbackRaw = normalizeExtractedText(raw?.value || '');
  const joined = normalizeExtractedText(segments.join('\n'));
  const bestText = (!joined || fallbackRaw.length > joined.length) ? fallbackRaw : joined;
  return { text: bestText, images: extractedImages };
};

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']);

const isImageFile = (file, lowerName) =>
  lowerName.match(/\.(png|jpg|jpeg|gif|webp)$/) || IMAGE_MIME_TYPES.has(String(file?.type || '').toLowerCase());

const extractTextFromFile = async (file, options = {}) => {
  const { allowExcel = false } = options;
  const lowerName = file.name.toLowerCase();

  if (isDocxFile(file, lowerName)) {
    const arrayBuffer = await file.arrayBuffer();
    return extractTextFromDocx(arrayBuffer);
  }

  if (isTxtFile(file, lowerName)) {
    const text = await file.text();
    return { text: normalizeExtractedText(text), images: [] };
  }

  if (allowExcel && isExcelFile(file, lowerName)) {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const collected = workbook.SheetNames.map((sheetName) =>
      XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName])
    ).join('\n\n');
    return { text: normalizeExtractedText(collected), images: [] };
  }

  if (isImageFile(file, lowerName)) {
    const dataUri = await fileToBase64(file);
    return { text: '[Image uploaded — see vision input]', images: [dataUri] };
  }

  return { text: '', images: [] };
};

const getTaskMeta = (taskType) => {
  if (taskType === 'task1_academic') return { label: 'Task 1 Academic', minWords: 150 };
  if (taskType === 'task1_general') return { label: 'Task 1 General Training', minWords: 150 };
  if (taskType === 'task1') return { label: 'Task 1', minWords: 150 };
  return { label: 'Task 2 Essay', minWords: 250 };
};

const AIWritingBuilder = () => {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const writeEssayFileRef = useRef(null);
  const scoreEssayFileRef = useRef(null);

  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('create');

  const [taskType, setTaskType] = useState('task2');
  const [promptSeed, setPromptSeed] = useState('');
  const [documentText, setDocumentText] = useState('');
  const [documentImages, setDocumentImages] = useState([]);
  const [fileName, setFileName] = useState('');
  const [essayFileName, setEssayFileName] = useState('');
  const [essayImages, setEssayImages] = useState([]);

  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [writingText, setWritingText] = useState('');
  const [scoringPrompt, setScoringPrompt] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [scoreResult, setScoreResult] = useState(null);
  const [gradingMode, setGradingMode] = useState('auto');

  const [savedDrafts, setSavedDrafts] = useState([]);

  useEffect(() => {
    audioManager.stopBackgroundMusic();
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      setUser(parsed);
    }
    setSavedDrafts(readLocalDrafts());
  }, []);

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';

    setFileName(file.name);

    try {
      const result = await extractTextFromFile(file, { allowExcel: true });
      if (result.text || result.images.length > 0) {
        setDocumentText(result.text);
        setDocumentImages(result.images);
        return;
      }
      alert('Chỉ hỗ trợ .docx, .txt, .xlsx, .xls, .png, .jpg, .jpeg');
    } catch (error) {
      console.error(error);
      alert('Không thể đọc file. Vui lòng kiểm tra lại định dạng.');
    }
  };

  const handleGenerateWritingPrompt = async () => {
    if (!promptSeed.trim() && !documentText.trim() && documentImages.length === 0) {
      alert('Vui lòng nhập mô tả/ý tưởng hoặc upload tài liệu/ảnh để AI tạo đề Writing.');
      return;
    }

    setIsGenerating(true);
    setScoreResult(null);
    try {
      const result = await aiService.generateIeltsWritingPrompt({
        taskType,
        seed: promptSeed.trim(),
        sourceDocumentText: documentText.trim(),
        images: documentImages
      });
      setGeneratedPrompt(result?.prompt ? String(result.prompt).trim() : '');
      setScoringPrompt(result?.prompt ? String(result.prompt).trim() : '');
      setWritingText('');
      setActiveTab('write');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Không thể tạo đề Writing.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUploadEssay = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    setEssayFileName(file.name);

    try {
      const result = await extractTextFromFile(file, { allowExcel: false });
      if (result.text || result.images.length > 0) {
        setWritingText(result.text);
        setEssayImages(result.images);
        return;
      }
      alert('Upload bài viết chỉ hỗ trợ .docx, .txt hoặc ảnh (.png, .jpg)');
    } catch (error) {
      console.error(error);
      alert('Không thể đọc file bài viết. Vui lòng kiểm tra lại.');
    }
  };

  const handleScoreWriting = async () => {
    const essay = writingText.trim();
    const promptForScore = scoringPrompt.trim() || generatedPrompt.trim();
    if (!essay && essayImages.length === 0) {
      alert('Bạn chưa viết bài để chấm.');
      return;
    }

    setIsScoring(true);
    try {
      const allImages = [...documentImages, ...essayImages];
      const score = await aiService.scoreWritingIelts({
        taskType,
        gradingMode,
        prompt: promptForScore,
        essay,
        images: allImages
      });
      setScoreResult(score);
      setActiveTab('score');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Không thể chấm bài Writing.');
    } finally {
      setIsScoring(false);
    }
  };

  const saveDraft = () => {
    if (!writingText.trim()) {
      alert('Chưa có bài viết để lưu.');
      return;
    }

    const item = {
      id: Date.now(),
      taskType,
      prompt: generatedPrompt.trim(),
      essay: writingText.trim(),
      createdAt: new Date().toISOString()
    };
    const next = [item, ...savedDrafts].slice(0, 50);
    setSavedDrafts(next);
    saveLocalDrafts(next);
    alert('Đã lưu bài viết.');
  };

  const openDraft = (item) => {
    setTaskType(item.taskType || 'task2');
    setGeneratedPrompt(item.prompt || '');
    setScoringPrompt(item.prompt || '');
    setWritingText(item.essay || '');
    setScoreResult(null);
    setActiveTab('write');
  };

  const deleteDraft = (id) => {
    const next = savedDrafts.filter((d) => d.id !== id);
    setSavedDrafts(next);
    saveLocalDrafts(next);
  };

  const isStudent = user?.role === 'student';
  const taskMeta = getTaskMeta(taskType);

  return (
    <div className="speaking-page dashboard-container">
      <main className="dashboard-main speaking-main">
        <div className="import-header glass-panel">
          <button className="back-btn" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={18} /> Quay lại
          </button>
          <h2>✍️ IELTS Writing</h2>
          <div style={{ width: 120 }} />
        </div>

        <div className="speaking-tabs">
          <button className={activeTab === 'create' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('create')}>
            Tạo đề
          </button>
          <button className={activeTab === 'write' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('write')}>
            Viết bài
          </button>
          <button className={activeTab === 'score' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('score')}>
            Chấm bài
          </button>
          <button className={activeTab === 'saved' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('saved')}>
            Đã lưu
          </button>
        </div>

        {activeTab === 'create' && (
          <motion.div className="glass-panel speaking-block" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h3>✨ Tạo đề IELTS Writing bằng AI</h3>

            <div className="speed-control-row">
              <label htmlFor="writing-task-type">Chọn Task</label>
              <select id="writing-task-type" value={taskType} onChange={(e) => setTaskType(e.target.value)}>
                <option value="task1_academic">Task 1 Academic (chart/table/map/process)</option>
                <option value="task1_general">Task 1 General Training (letter)</option>
                <option value="task1">Task 1 (Auto Academic/GT)</option>
                <option value="task2">Task 2 (Essay)</option>
              </select>
            </div>

            <textarea
              className="text-input"
              rows={4}
              placeholder="Ví dụ: Tạo đề Task 2 chủ đề môi trường, dạng opinion, khó vừa (band 5.5-6.5), có yêu cầu nêu ví dụ..."
              value={promptSeed}
              onChange={(e) => setPromptSeed(e.target.value)}
            />

            <div className="upload-row">
              <button className="logout-button" onClick={() => fileRef.current?.click()}>
                <FileUp size={18} /> Upload document / ảnh / excel
              </button>
              <span>{fileName || 'Hỗ trợ: .docx, .txt, .xlsx, .xls, .png, .jpg'}</span>
              <input ref={fileRef} type="file" accept=".docx,.txt,.xlsx,.xls,.png,.jpg,.jpeg,.gif,.webp" onChange={handleUpload} style={{ display: 'none' }} />
            </div>
            {documentImages.length > 0 && (
              <div className="doc-preview" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                <span style={{ color: '#6b7280', fontSize: 13 }}><ImageIcon size={13} style={{ marginRight: 4 }} />{documentImages.length} ảnh đã nhận</span>
              </div>
            )}

            {documentText && (
              <div className="doc-preview">
                <h4>Nội dung tài liệu đã nạp</h4>
                <p>{documentText.slice(0, 500)}{documentText.length > 500 ? '...' : ''}</p>
              </div>
            )}

            <button className="parse-btn" onClick={handleGenerateWritingPrompt} disabled={isGenerating}>
              <Sparkles size={18} /> {isGenerating ? 'AI đang tạo đề...' : 'Tạo đề Writing'}
            </button>

            {generatedPrompt && (
              <div className="result-box">
                <h4>Đề Writing (AI)</h4>
                <p style={{ whiteSpace: 'pre-wrap' }}>{generatedPrompt}</p>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'write' && (
          <motion.div className="glass-panel speaking-block" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h3>📝 Viết bài theo đề</h3>

            <div className="result-box">
              <h4>Đề hiện tại</h4>
              <textarea
                className="text-input"
                rows={5}
                placeholder='Dán/nhập đề Writing vào đây (hoặc tạo ở tab "Tạo đề")...'
                value={generatedPrompt}
                onChange={(e) => setGeneratedPrompt(e.target.value)}
              />
            </div>

            <div className="upload-row">
              <button className="logout-button" onClick={() => writeEssayFileRef.current?.click()}>
                <FileUp size={18} /> Upload bài viết
              </button>
              <span>{essayFileName || 'Hỗ trợ: .docx, .txt, .png, .jpg'}</span>
              <input
                ref={writeEssayFileRef}
                type="file"
                accept=".docx,.txt,.png,.jpg,.jpeg"
                onChange={handleUploadEssay}
                style={{ display: 'none' }}
              />
            </div>

            <div className="speed-control-row">
              <label htmlFor="writing-grading-mode">Chế độ chấm</label>
              <select
                id="writing-grading-mode"
                value={gradingMode}
                onChange={(e) => setGradingMode(e.target.value)}
              >
                <option value="auto">Tự nhận diện Task</option>
                <option value="force_task1">Ép chấm theo Task 1 (auto Academic/GT)</option>
                <option value="force_task1_academic">Ép chấm theo Task 1 Academic</option>
                <option value="force_task1_general">Ép chấm theo Task 1 General Training</option>
                <option value="force_task2">Ép chấm theo Task 2</option>
              </select>
            </div>

            <button
              className="logout-button"
              onClick={() => {
                setScoringPrompt(generatedPrompt.trim());
                setActiveTab('score');
              }}
              disabled={!generatedPrompt.trim()}
            >
              Dùng đề hiện tại để sang tab chấm
            </button>

            <textarea
              className="text-input"
              rows={14}
              placeholder={`Viết bài của bạn ở đây... (tối thiểu ${taskMeta.minWords} từ cho ${taskMeta.label})`}
              value={writingText}
              onChange={(e) => setWritingText(e.target.value)}
            />

            <div className="tts-actions">
              <button className="logout-button" onClick={saveDraft}>
                <ClipboardCheck size={16} /> Lưu bài
              </button>
              <button
                className="logout-button"
                onClick={() => {
                  if (!scoringPrompt.trim() && generatedPrompt.trim()) {
                    setScoringPrompt(generatedPrompt.trim());
                  }
                  setActiveTab('score');
                }}
                disabled={!writingText.trim()}
              >
                <Sparkles size={16} /> Sang tab chấm IELTS
              </button>
            </div>

            {!isStudent && (
              <p style={{ margin: 0, color: '#6b7280' }}>
                Gợi ý: bạn có thể upload tài liệu để AI bám sát nội dung khi tạo đề. Sau đó học sinh viết trực tiếp tại đây để chấm.
              </p>
            )}
          </motion.div>
        )}

        {activeTab === 'score' && (
          <motion.div className="glass-panel speaking-block" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h3>📌 Kết quả chấm IELTS Writing (AI)</h3>

            <div className="result-box" style={{ marginBottom: 12 }}>
              <h4>Bài viết cần chấm</h4>
              <div className="upload-row">
                <button className="logout-button" onClick={() => scoreEssayFileRef.current?.click()}>
                  <FileUp size={18} /> Upload bài viết
                </button>
                <span>{essayFileName ? `Đã nạp: ${essayFileName}` : 'Hỗ trợ: .docx, .txt, .png, .jpg'}</span>
                <input
                  ref={scoreEssayFileRef}
                  type="file"
                  accept=".docx,.txt,.png,.jpg,.jpeg"
                  onChange={handleUploadEssay}
                  style={{ display: 'none' }}
                />
              </div>
              {essayImages.length > 0 && (
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                  <ImageIcon size={13} style={{ marginRight: 4 }} />{essayImages.length} ảnh bài viết đã nhận
                </div>
              )}
              <textarea
                className="text-input"
                rows={10}
                placeholder="Dán bài viết của học sinh tại đây..."
                value={writingText}
                onChange={(e) => setWritingText(e.target.value)}
              />
              <div className="speed-control-row">
                <label htmlFor="writing-grading-mode-score">Chế độ chấm</label>
                <select
                  id="writing-grading-mode-score"
                  value={gradingMode}
                  onChange={(e) => setGradingMode(e.target.value)}
                >
                  <option value="auto">Tự nhận diện Task</option>
                  <option value="force_task1">Ép chấm theo Task 1 (auto Academic/GT)</option>
                  <option value="force_task1_academic">Ép chấm theo Task 1 Academic</option>
                  <option value="force_task1_general">Ép chấm theo Task 1 General Training</option>
                  <option value="force_task2">Ép chấm theo Task 2</option>
                </select>
              </div>
              <p style={{ margin: '8px 0 0', color: '#6b7280' }}>
                Bạn có thể ép mode chấm. Nếu để tự động, hệ thống tự nhận diện loại task rồi chấm.
              </p>
              <button className="logout-button" onClick={handleScoreWriting} disabled={isScoring || !writingText.trim()}>
                <Sparkles size={16} /> {isScoring ? 'Đang chấm IELTS...' : 'Chấm IELTS Writing'}
              </button>
            </div>

            {!scoreResult ? (
              <p>Chưa có kết quả. Hãy viết bài và bấm "Chấm IELTS Writing".</p>
            ) : (
              <div className="result-box score-box">
                <div className="score-grid">
                  <span>Overall: {scoreResult.overallBand}</span>
                  <span>Task: {scoreResult.taskResponse ?? scoreResult.taskAchievement}</span>
                  <span>Coherence: {scoreResult.coherenceCohesion}</span>
                  <span>Lexical: {scoreResult.lexicalResource}</span>
                  <span>Grammar: {scoreResult.grammarRangeAccuracy}</span>
                </div>
                {scoreResult.detectedTaskType && (
                  <p><strong>Task nhận diện:</strong> {scoreResult.detectedTaskType}</p>
                )}
                {typeof scoreResult.confidence === 'number' && (
                  <p><strong>Confidence:</strong> {scoreResult.confidence}</p>
                )}
                {scoreResult.reconstructedPrompt && (
                  <p style={{ whiteSpace: 'pre-wrap' }}>
                    <strong>Reconstructed prompt:</strong> {scoreResult.reconstructedPrompt}
                  </p>
                )}
                {scoreResult.missingOrUnclearDetails && (
                  <p style={{ whiteSpace: 'pre-wrap' }}>
                    <strong>Missing/unclear:</strong> {scoreResult.missingOrUnclearDetails}
                  </p>
                )}
                {scoreResult.wordCount != null && (
                  <p><strong>Số từ:</strong> {scoreResult.wordCount}</p>
                )}
                {scoreResult.wordCountWarning && (
                  <p><strong>Cảnh báo word count:</strong> {scoreResult.wordCountWarning}</p>
                )}
                {scoreResult.taskWeightingNote && (
                  <p><strong>Task weighting:</strong> {scoreResult.taskWeightingNote}</p>
                )}
                {scoreResult.feedback && (
                  <p><strong>Nhận xét:</strong> {scoreResult.feedback}</p>
                )}
                {scoreResult.grammarIssues && (
                  <div style={{ marginTop: 10 }}>
                    <h4 style={{ margin: '0 0 6px' }}>Lỗi ngữ pháp chính</h4>
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{scoreResult.grammarIssues}</p>
                  </div>
                )}
                {scoreResult.sentenceCorrections && (
                  <div style={{ marginTop: 10 }}>
                    <h4 style={{ margin: '0 0 6px' }}>Sửa câu gợi ý</h4>
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{scoreResult.sentenceCorrections}</p>
                  </div>
                )}
                {scoreResult.improvementPlan && (
                  <div style={{ marginTop: 10 }}>
                    <h4 style={{ margin: '0 0 6px' }}>Plan cải thiện</h4>
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{scoreResult.improvementPlan}</p>
                  </div>
                )}
                {scoreResult.bandDescriptors && (
                  <div style={{ marginTop: 10 }}>
                    <h4 style={{ margin: '0 0 6px' }}>Chi tiết theo 4 tiêu chí</h4>
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{scoreResult.bandDescriptors}</p>
                  </div>
                )}
                {scoreResult.improvedSample && (
                  <div style={{ marginTop: 10 }}>
                    <h4 style={{ margin: '0 0 6px' }}>Bài mẫu cải thiện (tham khảo)</h4>
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{scoreResult.improvedSample}</p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'saved' && (
          <motion.div className="glass-panel speaking-block" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h3>📚 Bài Writing đã lưu</h3>
            {savedDrafts.length === 0 && <p>Chưa có bài nào được lưu.</p>}
            {savedDrafts.map((item) => (
              <div key={item.id} className="saved-script-item">
                <div>
                  <strong>
                    {item.taskType === 'task1' ? 'Task 1' : 'Task 2'} - {new Date(item.createdAt).toLocaleString('vi-VN')}
                  </strong>
                  <p>{(item.prompt || '').slice(0, 90)}{(item.prompt || '').length > 90 ? '...' : ''}</p>
                </div>
                <div className="saved-actions">
                  <button className="logout-button" onClick={() => openDraft(item)}>
                    Mở
                  </button>
                  <button className="logout-button danger-btn" onClick={() => deleteDraft(item.id)}>
                    Xóa
                  </button>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </main>
    </div>
  );
};

export default AIWritingBuilder;

