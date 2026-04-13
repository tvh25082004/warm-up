import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, FileUp, Mic, Save, Play, Square, Sparkles, Trash2, Camera, Download } from 'lucide-react';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import aiService from '../services/GeminiService';
import audioManager from '../services/AudioManager';
import '../styles/AISpeakingBuilder.css';

const STORAGE_KEY = 'speaking_scripts';

const splitWords = (text) =>
  text
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

const buildWordSegments = (text) => {
  const segments = [];
  const regex = /\S+/g;
  let match = regex.exec(text);
  while (match) {
    segments.push({
      word: match[0],
      start: match.index,
      end: match.index + match[0].length
    });
    match = regex.exec(text);
  }
  return segments;
};

const getPreferredVoice = (voices) =>
  voices.find((v) => /en-GB|en-US|en-AU/i.test(v.lang) && /female|samantha|aria|google us english/i.test(v.name)) ||
  voices.find((v) => /en-GB|en-US|en-AU/i.test(v.lang)) ||
  voices[0];

const AISpeakingBuilder = () => {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const utteranceRef = useRef(null);
  const cameraRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);

  const [activeTab, setActiveTab] = useState('create');
  const [prompt, setPrompt] = useState('');
  const [documentText, setDocumentText] = useState('');
  const [fileName, setFileName] = useState('');
  const [script, setScript] = useState('');
  const [scriptTitle, setScriptTitle] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSpeechPaused, setIsSpeechPaused] = useState(false);
  const [speechRate, setSpeechRate] = useState(1);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [practiceMode, setPracticeMode] = useState('tts');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingBlob, setRecordingBlob] = useState(null);
  const [recordingUrl, setRecordingUrl] = useState('');
  const [transcript, setTranscript] = useState('');
  const [scoreResult, setScoreResult] = useState(null);
  const [isScoring, setIsScoring] = useState(false);
  const [savedScripts, setSavedScripts] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  });

  const words = useMemo(() => splitWords(script), [script]);
  const wordSegments = useMemo(() => buildWordSegments(script), [script]);

  useEffect(() => {
    audioManager.stopBackgroundMusic();
    return () => {
      window.speechSynthesis.cancel();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (recordingUrl) {
        URL.revokeObjectURL(recordingUrl);
      }
    };
  }, [recordingUrl]);

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    setFileName(file.name);

    try {
      if (lowerName.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        setDocumentText(result.value.trim());
        return;
      }

      if (lowerName.endsWith('.txt')) {
        const text = await file.text();
        setDocumentText(text.trim());
        return;
      }

      if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const collected = workbook.SheetNames.map((sheetName) =>
          XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName])
        ).join('\n\n');
        setDocumentText(collected.trim());
        return;
      }

      alert('Chỉ hỗ trợ .docx, .txt, .xlsx, .xls');
    } catch (error) {
      console.error(error);
      alert('Không thể đọc file. Vui lòng kiểm tra lại định dạng.');
    }
  };

  const handleGenerateScript = async () => {
    if (!prompt.trim()) {
      alert('Vui lòng nhập prompt để AI tạo đoạn speaking.');
      return;
    }

    setIsGenerating(true);
    try {
      const request = [
        'Bạn là trợ lý tạo đoạn luyện speaking tiếng Anh cho học sinh THCS.',
        'Yêu cầu bắt buộc:',
        '- Viết hoàn toàn bằng tiếng Anh.',
        '- Phát âm dễ nghe, từ vựng phù hợp trình độ THCS, mạch lạc theo phong cách IELTS speaking.',
        '- Độ dài khoảng 120-180 từ.',
        '- Không thêm markdown, không thêm tiêu đề phụ, chỉ trả về đoạn text cuối cùng để đọc.',
        '',
        `Prompt của giáo viên: ${prompt.trim()}`,
        documentText.trim() ? `Nội dung tài liệu đính kèm (ưu tiên bám sát):\n${documentText.trim()}` : ''
      ].filter(Boolean).join('\n');

      const response = await aiService.generateResponse([], request);
      setScript(response.trim());
      setCurrentWordIndex(-1);
      setActiveTab('create');
    } catch (error) {
      console.error(error);
      alert(`Không thể tạo script: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const stopSpeaking = () => {
    if (!isSpeaking) return;
    window.speechSynthesis.pause();
    setIsSpeechPaused(true);
  };

  const resumeSpeaking = () => {
    if (!isSpeaking || !isSpeechPaused) return;
    audioManager.stopBackgroundMusic();
    window.speechSynthesis.resume();
    setIsSpeechPaused(false);
  };

  const cancelSpeaking = () => {
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setIsSpeaking(false);
    setIsSpeechPaused(false);
    setCurrentWordIndex(-1);
  };

  const cleanupMediaStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (cameraRef.current) {
      cameraRef.current.srcObject = null;
    }
  };

  const startPracticeRecording = async () => {
    if (!script.trim()) {
      alert('Chưa có script để luyện nói.');
      return;
    }

    try {
      audioManager.stopBackgroundMusic();
      cancelSpeaking();
      if (recordingUrl) {
        URL.revokeObjectURL(recordingUrl);
      }
      setRecordingUrl('');
      setRecordingBlob(null);
      setTranscript('');
      setScoreResult(null);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      streamRef.current = stream;
      if (cameraRef.current) {
        cameraRef.current.srcObject = stream;
        await cameraRef.current.play().catch(() => {});
      }

      const chunks = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setRecordingBlob(blob);
        setRecordingUrl(url);
        cleanupMediaStream();
      };

      recorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error(error);
      alert('Không thể mở mic/camera. Hãy cấp quyền rồi thử lại.');
    }
  };

  const stopPracticeRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      cleanupMediaStream();
    }
    setIsRecording(false);
  };

  const saveRecordingFile = () => {
    if (!recordingUrl) return;
    const link = document.createElement('a');
    link.href = recordingUrl;
    link.download = `speaking-practice-${Date.now()}.webm`;
    link.click();
  };

  const handleScoreRecording = async () => {
    if (!recordingBlob) {
      alert('Bạn cần ghi âm trước khi chấm điểm.');
      return;
    }
    if (!script.trim()) {
      alert('Chưa có script gốc để đối chiếu chấm điểm.');
      return;
    }

    setIsScoring(true);
    try {
      const text = await aiService.transcribeAudio(recordingBlob);
      setTranscript(text);
      const score = await aiService.scoreSpeakingIelts(script, text);
      setScoreResult(score);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Không thể chấm điểm speaking.');
    } finally {
      setIsScoring(false);
    }
  };

  const startSpeaking = () => {
    if (!script.trim()) {
      alert('Chưa có nội dung để đọc. Hãy tạo script trước.');
      return;
    }

    audioManager.stopBackgroundMusic();
    cancelSpeaking();
    const utterance = new SpeechSynthesisUtterance(script);
    const voices = window.speechSynthesis.getVoices();
    const selectedVoice = getPreferredVoice(voices);

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    } else {
      utterance.lang = 'en-US';
    }

    utterance.rate = speechRate;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onstart = () => {
      setIsSpeaking(true);
      setIsSpeechPaused(false);
      setCurrentWordIndex(0);
    };

    utterance.onboundary = (event) => {
      if (event.name !== 'word') return;
      const idx = wordSegments.findIndex(
        (segment) => event.charIndex >= segment.start && event.charIndex < segment.end
      );
      if (idx >= 0) {
        setCurrentWordIndex(idx);
      }
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      setIsSpeechPaused(false);
      setCurrentWordIndex(-1);
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
      setIsSpeechPaused(false);
      setCurrentWordIndex(-1);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const saveScript = () => {
    if (!script.trim()) return;
    const name = scriptTitle.trim() || `Speaking ${new Date().toLocaleDateString('vi-VN')}`;
    const item = {
      id: Date.now(),
      name,
      prompt,
      script,
      createdAt: new Date().toISOString()
    };
    const updated = [item, ...savedScripts];
    setSavedScripts(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setScriptTitle('');
    alert(`Đã lưu "${name}"`);
  };

  const playSavedScript = (item) => {
    setPrompt(item.prompt || '');
    setScript(item.script || '');
    setActiveTab('create');
    setCurrentWordIndex(-1);
    setPracticeMode('tts');
  };

  const deleteSavedScript = (id) => {
    const updated = savedScripts.filter((item) => item.id !== id);
    setSavedScripts(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  return (
    <div className="speaking-page dashboard-container">
      <main className="dashboard-main speaking-main">
        <div className="import-header glass-panel">
          <button className="back-btn" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={18} /> Quay lại
          </button>
          <h2>🎤 Luyện Speaking</h2>
          <div style={{ width: 120 }} />
        </div>

        <div className="speaking-tabs">
          <button className={activeTab === 'saved' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('saved')}>
            Đã lưu
          </button>
          <button className={activeTab === 'create' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('create')}>
            Tạo File nói bằng AI
          </button>
        </div>

        {activeTab === 'saved' && (
          <div className="glass-panel speaking-block">
            <h3>📚 Danh sách script đã lưu</h3>
            {savedScripts.length === 0 && <p>Chưa có script nào được lưu.</p>}
            {savedScripts.map((item) => (
              <div key={item.id} className="saved-script-item">
                <div>
                  <strong>{item.name}</strong>
                  <p>{new Date(item.createdAt).toLocaleString('vi-VN')}</p>
                </div>
                <div className="saved-actions">
                  <button className="logout-button" onClick={() => playSavedScript(item)}>
                    <Play size={16} /> Mở
                  </button>
                  <button className="logout-button danger-btn" onClick={() => deleteSavedScript(item.id)}>
                    <Trash2 size={16} /> Xóa
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'create' && (
          <motion.div className="glass-panel speaking-block" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h3>✨ Tạo đoạn nói bằng AI</h3>
            <textarea
              className="text-input"
              rows={4}
              placeholder="Ví dụ: Hãy tạo cho tôi một đoạn nói chủ đề protecting the environment, văn phong tự nhiên cho học sinh THCS..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />

            <div className="upload-row">
              <button className="logout-button" onClick={() => fileRef.current?.click()}>
                <FileUp size={18} /> Upload document / excel
              </button>
              <span>{fileName || 'Hỗ trợ: .docx, .txt, .xlsx, .xls'}</span>
              <input ref={fileRef} type="file" accept=".docx,.txt,.xlsx,.xls" onChange={handleUpload} style={{ display: 'none' }} />
            </div>

            {documentText && (
              <div className="doc-preview">
                <h4>Nội dung tài liệu đã nạp</h4>
                <p>{documentText.slice(0, 500)}{documentText.length > 500 ? '...' : ''}</p>
              </div>
            )}

            <button className="parse-btn" onClick={handleGenerateScript} disabled={isGenerating}>
              <Sparkles size={18} /> {isGenerating ? 'AI đang xử lý...' : 'Tạo Script Speaking'}
            </button>

            <div className="mode-switch-row">
              <button
                className={practiceMode === 'tts' ? 'tab-btn active' : 'tab-btn'}
                onClick={() => setPracticeMode('tts')}
              >
                Mode 1: Text to Speech
              </button>
              <button
                className={practiceMode === 'practice' ? 'tab-btn active' : 'tab-btn'}
                onClick={() => setPracticeMode('practice')}
              >
                Mode 2: Luyện nói & Ghi âm
              </button>
            </div>

            {practiceMode === 'tts' && (
              <div className="tts-panel">
                <h4>Text to Speech + Subtitle realtime</h4>
                <div className="speed-control-row">
                  <label htmlFor="speech-rate">Tốc độ nói</label>
                  <input
                    id="speech-rate"
                    type="range"
                    min={0.5}
                    max={1.5}
                    step={0.25}
                    value={speechRate}
                    onChange={(e) => setSpeechRate(Number(e.target.value))}
                  />
                  <span className="speed-value">{speechRate.toFixed(2)}x</span>
                </div>
                <div className="subtitle-box">
                  {words.length === 0 && <p>Script sẽ hiển thị ở đây sau khi AI tạo.</p>}
                  {words.length > 0 && words.map((word, index) => (
                    <span key={`${word}-${index}`} className={index === currentWordIndex ? 'subtitle-word active' : 'subtitle-word'}>
                      {word}{' '}
                    </span>
                  ))}
                </div>

                <div className="tts-actions">
                  <button className="logout-button" onClick={startSpeaking}>
                    <Mic size={16} /> Nghe & Luyện nói
                  </button>
                  <button className="logout-button" onClick={stopSpeaking} disabled={!isSpeaking || isSpeechPaused}>
                    <Square size={16} /> Tạm dừng
                  </button>
                  <button className="logout-button" onClick={resumeSpeaking} disabled={!isSpeaking || !isSpeechPaused}>
                    <Play size={16} /> Tiếp tục
                  </button>
                  <button className="logout-button" onClick={cancelSpeaking} disabled={!isSpeaking}>
                    <Square size={16} /> Dừng hẳn
                  </button>
                </div>
              </div>
            )}

            {practiceMode === 'practice' && (
              <div className="practice-layout">
                <div className="camera-panel">
                  <h4><Camera size={17} /> Camera</h4>
                  <video ref={cameraRef} className="camera-frame" autoPlay muted playsInline />
                  {!isRecording && <p className="camera-hint">Nhấn "Start Speaking" để mở mic + camera và bắt đầu ghi âm.</p>}
                </div>

                <div className="practice-panel">
                  <h4>Script luyện nói</h4>
                  <div className="subtitle-box">
                    {words.length === 0 && <p>Script sẽ hiển thị ở đây sau khi AI tạo.</p>}
                    {words.length > 0 && words.map((word, index) => (
                      <span key={`${word}-${index}`} className="subtitle-word">
                        {word}{' '}
                      </span>
                    ))}
                  </div>

                  <div className="tts-actions">
                    {!isRecording ? (
                      <button className="logout-button" onClick={startPracticeRecording}>
                        <Mic size={16} /> Start Speaking
                      </button>
                    ) : (
                      <button className="logout-button" onClick={stopPracticeRecording}>
                        <Square size={16} /> Dừng ghi âm
                      </button>
                    )}
                    <button className="logout-button" onClick={saveRecordingFile} disabled={!recordingUrl}>
                      <Download size={16} /> Lưu file ghi âm
                    </button>
                    <button className="logout-button" onClick={handleScoreRecording} disabled={!recordingBlob || isScoring}>
                      <Sparkles size={16} /> {isScoring ? 'Đang chấm IELTS...' : 'Chấm điểm IELTS'}
                    </button>
                  </div>

                  {recordingUrl && (
                    <div className="audio-preview">
                      <h4>Nghe lại bản ghi âm</h4>
                      <audio controls src={recordingUrl} />
                    </div>
                  )}

                  {transcript && (
                    <div className="result-box">
                      <h4>Transcript từ bản ghi âm</h4>
                      <p>{transcript}</p>
                    </div>
                  )}

                  {scoreResult && (
                    <div className="result-box score-box">
                      <h4>Kết quả chấm IELTS (AI)</h4>
                      <div className="score-grid">
                        <span>Overall: {scoreResult.overallBand}</span>
                        <span>Fluency: {scoreResult.fluencyCoherence}</span>
                        <span>Lexical: {scoreResult.lexicalResource}</span>
                        <span>Grammar: {scoreResult.grammarRangeAccuracy}</span>
                        <span>Pronunciation: {scoreResult.pronunciation}</span>
                      </div>
                      <p><strong>Nhận xét:</strong> {scoreResult.feedback}</p>
                      <p><strong>Mẫu cải thiện:</strong> {scoreResult.improvedSample}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="save-row">
              <input
                type="text"
                placeholder="Tên bài luyện speaking..."
                value={scriptTitle}
                onChange={(e) => setScriptTitle(e.target.value)}
              />
              <button className="logout-button" onClick={saveScript}>
                <Save size={16} /> Lưu
              </button>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
};

export default AISpeakingBuilder;
