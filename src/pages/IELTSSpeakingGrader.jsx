import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileUp, Sparkles, ClipboardCheck, Video, Mic, Trash2 } from 'lucide-react';
import aiService from '../services/GeminiService';
import audioManager from '../services/AudioManager';
import '../styles/AISpeakingBuilder.css';

const GRADES_STORAGE_PREFIX = 'ielts_speaking_upload_grades';
const DRAFT_CACHE_PREFIX = 'ielts_speaking_upload_draft';

const getGradesKey = (username) => `${GRADES_STORAGE_PREFIX}_${username || 'guest'}`;
const getDraftKey = (username) => `${DRAFT_CACHE_PREFIX}_${username || 'guest'}`;

const readSavedGrades = (username) => {
  try {
    const raw = localStorage.getItem(getGradesKey(username));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeSavedGrades = (username, items) => {
  localStorage.setItem(getGradesKey(username), JSON.stringify(items));
};

const isVideoFile = (file) => {
  if (!file) return false;
  const t = String(file.type || '').toLowerCase();
  const n = String(file.name || '').toLowerCase();
  return t.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi|mpeg|m4v)$/i.test(n);
};

const IELTSSpeakingGrader = () => {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const previewUrlRef = useRef(null);

  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('grade');
  const [mediaFile, setMediaFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [taskPrompt, setTaskPrompt] = useState('');
  const [transcript, setTranscript] = useState('');
  const [scoreResult, setScoreResult] = useState(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [savedGrades, setSavedGrades] = useState([]);

  useEffect(() => {
    audioManager.stopBackgroundMusic();
    const raw = localStorage.getItem('user');
    if (!raw) {
      navigate('/login');
      return;
    }
    const parsed = JSON.parse(raw);
    setUser(parsed);
    setSavedGrades(readSavedGrades(parsed.username));

    try {
      const draftRaw = localStorage.getItem(getDraftKey(parsed.username));
      if (draftRaw) {
        const d = JSON.parse(draftRaw);
        if (d && typeof d.transcript === 'string' && d.transcript.trim()) {
          setTranscript(d.transcript);
          if (typeof d.taskPrompt === 'string') setTaskPrompt(d.taskPrompt);
        }
      }
    } catch {
      // ignore
    }
  }, [navigate]);

  useEffect(() => () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  const persistDraftCache = (nextTranscript, nextPrompt) => {
    if (!user?.username) return;
    try {
      const payload = {
        fileName: mediaFile?.name || '',
        transcript: nextTranscript,
        taskPrompt: nextPrompt,
        ts: new Date().toISOString()
      };
      localStorage.setItem(getDraftKey(user.username), JSON.stringify(payload));
    } catch {
      // ignore quota
    }
  };

  const handlePickFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    setPreviewUrl(url);
    setMediaFile(file);
    setTranscript('');
    setScoreResult(null);
  };

  const clearMedia = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl('');
    setMediaFile(null);
    setTranscript('');
    setScoreResult(null);
  };

  const handleTranscribe = async () => {
    if (!mediaFile) {
      alert('Vui lòng chọn file audio hoặc video.');
      return;
    }
    setIsTranscribing(true);
    setScoreResult(null);
    try {
      const text = await aiService.transcribeMediaFile(mediaFile);
      setTranscript(text);
      persistDraftCache(text, taskPrompt);
    } catch (e) {
      console.error(e);
      alert(e.message || 'Không thể chuyển thành văn bản.');
    } finally {
      setIsTranscribing(false);
    }
  };

  /**
   * Mot lan nhan: neu co file va chua co transcript -> Whisper roi cham GPT.
   * Neu da co transcript (sua tay hoac mo tu da cham) -> chi cham GPT.
   */
  const handleScore = async () => {
    let text = transcript.trim();
    if (!mediaFile && !text) {
      alert('Vui long chon file video/audio, hoac nhap transcript.');
      return;
    }

    setScoreResult(null);
    try {
      if (mediaFile && !text) {
        setIsTranscribing(true);
        try {
          text = await aiService.transcribeMediaFile(mediaFile);
          setTranscript(text);
          persistDraftCache(text, taskPrompt);
        } finally {
          setIsTranscribing(false);
        }
      }

      if (!text.trim()) {
        alert('Khong co noi dung de cham.');
        return;
      }

      setIsScoring(true);
      const score = await aiService.scoreSpeakingIeltsFreeform({
        transcript: text,
        taskPrompt: taskPrompt.trim()
      });
      setScoreResult(score);

      const item = {
        id: Date.now(),
        username: user?.username,
        createdAt: new Date().toISOString(),
        fileName: mediaFile?.name || '(không có file)',
        isVideo: mediaFile ? isVideoFile(mediaFile) : false,
        taskPrompt: taskPrompt.trim(),
        transcript: text,
        score
      };
      const next = [item, ...savedGrades].slice(0, 50);
      setSavedGrades(next);
      writeSavedGrades(user.username, next);
    } catch (e) {
      console.error(e);
      alert(e.message || 'Không thể chấm IELTS Speaking.');
    } finally {
      setIsScoring(false);
    }
  };

  const deleteSaved = (id) => {
    const next = savedGrades.filter((x) => x.id !== id);
    setSavedGrades(next);
    writeSavedGrades(user.username, next);
  };

  const openSaved = (item) => {
    setTaskPrompt(item.taskPrompt || '');
    setTranscript(item.transcript || '');
    setScoreResult(item.score || null);
    setMediaFile(null);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl('');
    setActiveTab('grade');
  };

  if (!user) return null;

  return (
    <div className="speaking-page dashboard-container">
      <main className="dashboard-main speaking-main">
        <div className="import-header glass-panel">
          <button type="button" className="back-btn" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={18} /> Quay lại
          </button>
          <h2>Chấm IELTS Speaking (upload)</h2>
          <div style={{ width: 120 }} />
        </div>

        <div className="speaking-tabs">
          <button type="button" className={activeTab === 'grade' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('grade')}>
            Chấm bài
          </button>
          <button type="button" className={activeTab === 'saved' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('saved')}>
            Đã chấm
          </button>
        </div>

        {activeTab === 'grade' && (
          <div className="glass-panel speaking-block">
            <h3>Upload video hoặc audio</h3>
            <p style={{ margin: 0, color: '#6b7280', fontSize: 15 }}>
              Chon file roi nhan <strong>Chấm IELTS Speaking</strong> mot lan: Whisper (tieng Anh) roi cham GPT.
              Video lon hon ~25MB: tu dong tach audio + nen (ffmpeg trong trinh duyet, can mang lan dau).
              Goi y dinh dang: mp3, wav, m4a, webm, mp4...
            </p>

            <div className="upload-row">
              <button type="button" className="logout-button" onClick={() => fileRef.current?.click()}>
                <FileUp size={18} /> Chọn file
              </button>
              <span>{mediaFile ? mediaFile.name : 'Chưa chọn file'}</span>
              <input
                ref={fileRef}
                type="file"
                accept="audio/*,video/*,.mp3,.wav,.m4a,.webm,.mp4,.mpeg,.mpga,.ogg"
                onChange={handlePickFile}
                style={{ display: 'none' }}
              />
              {mediaFile && (
                <button type="button" className="logout-button" onClick={clearMedia}>
                  <Trash2 size={16} /> Xóa file
                </button>
              )}
            </div>

            {previewUrl && mediaFile && (
              <div className="audio-preview">
                <h4>Xem truoc</h4>
                {isVideoFile(mediaFile) ? (
                  <video className="camera-frame" style={{ maxHeight: 280, width: '100%' }} controls src={previewUrl} playsInline />
                ) : (
                  <audio controls src={previewUrl} style={{ width: '100%' }} />
                )}
              </div>
            )}

            <div className="result-box">
              <h4>Đề / cue card (tùy chọn)</h4>
              <textarea
                className="text-input"
                rows={4}
                placeholder="Dán đề Part 1–3 hoặc cue card (tùy chọn)..."
                value={taskPrompt}
                onChange={(e) => {
                  const v = e.target.value;
                  setTaskPrompt(v);
                  if (transcript.trim()) persistDraftCache(transcript, v);
                }}
              />
            </div>

            <div className="tts-actions" style={{ flexWrap: 'wrap' }}>
              <button
                type="button"
                className="parse-btn"
                onClick={handleScore}
                disabled={(!mediaFile && !transcript.trim()) || isTranscribing || isScoring}
              >
                <Sparkles size={16} />
                {isTranscribing
                  ? 'Dang chuyen giong noi (Whisper)...'
                  : isScoring
                    ? 'Dang cham IELTS...'
                    : 'Cham IELTS Speaking (Whisper + GPT)'}
              </button>
              <button
                type="button"
                className="logout-button"
                onClick={handleTranscribe}
                disabled={!mediaFile || isTranscribing || isScoring}
                title="Chi lay transcript, khong cham diem"
              >
                {isVideoFile(mediaFile) ? <Video size={16} /> : <Mic size={16} />}
                {isTranscribing ? 'Dang speech-to-text...' : 'Chi lay transcript'}
              </button>
            </div>

            <div className="result-box">
              <h4>Transcript (tu dien sau khi cham, hoac sua tay)</h4>
              <textarea
                className="text-input"
                rows={10}
                placeholder="De trong: bam Cham se tu Whisper tu file. Hoac dan chu san neu khong upload."
                value={transcript}
                onChange={(e) => {
                  const v = e.target.value;
                  setTranscript(v);
                  persistDraftCache(v, taskPrompt);
                }}
              />
            </div>

            {scoreResult && (
              <div className="result-box score-box">
                <h4>Kết quả chấm (lần gần nhất)</h4>
                <div className="score-grid">
                  <span>Overall: {scoreResult.overallBand}</span>
                  <span>Fluency: {scoreResult.fluencyCoherence}</span>
                  <span>Lexical: {scoreResult.lexicalResource}</span>
                  <span>Grammar: {scoreResult.grammarRangeAccuracy}</span>
                  <span>Pronunciation: {scoreResult.pronunciation}</span>
                </div>
                <p><strong>Nhận xét:</strong> {scoreResult.feedback}</p>
                {scoreResult.strengths && (
                  <p><strong>Điểm mạnh:</strong> {scoreResult.strengths}</p>
                )}
                {scoreResult.improvements && (
                  <p><strong>Cần cải thiện:</strong> {scoreResult.improvements}</p>
                )}
                <p><strong>Mau cai thien:</strong> {scoreResult.improvedSample}</p>
                {Array.isArray(scoreResult.pronunciationIssues) && scoreResult.pronunciationIssues.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <h4 style={{ marginBottom: 8 }}>Chi tiet phat am can sua</h4>
                    {scoreResult.pronunciationIssues.slice(0, 8).map((item, idx) => (
                      <p key={`pro-${idx}`} style={{ margin: '6px 0' }}>
                        <strong>{idx + 1}.</strong>{' '}
                        <code>{item.spoken || '-'}</code>
                        {' -> '}
                        <code>{item.likelyTarget || '-'}</code>
                        {item.issueType ? ` (${item.issueType})` : ''}. {item.why || ''}
                        {item.practiceTip ? ` Tip: ${item.practiceTip}` : ''}
                      </p>
                    ))}
                  </div>
                )}
                {Array.isArray(scoreResult.languageIssues) && scoreResult.languageIssues.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <h4 style={{ marginBottom: 8 }}>Cum tu/cau dung chua chuan</h4>
                    {scoreResult.languageIssues.slice(0, 8).map((item, idx) => (
                      <p key={`lang-${idx}`} style={{ margin: '6px 0' }}>
                        <strong>{idx + 1}.</strong>{' '}
                        <code>{item.original || '-'}</code>
                        {' -> '}
                        <code>{item.improved || '-'}</code>
                        {item.issueType ? ` (${item.issueType})` : ''}. {item.why || ''}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'saved' && (
          <div className="glass-panel speaking-block">
            <h3><ClipboardCheck size={20} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} /> Bài đã chấm</h3>
            {savedGrades.length === 0 && <p>Chưa có bài nào được lưu.</p>}
            {savedGrades.map((item) => (
              <div key={item.id} className="saved-script-item">
                <div>
                  <strong>{item.fileName}</strong>
                  <span style={{ color: '#6b7280', marginLeft: 8 }}>
                    {item.isVideo ? 'Video' : 'Audio'} · Band {item.score?.overallBand ?? '—'}
                  </span>
                  <p style={{ margin: '6px 0 0', fontSize: 14, color: '#4b5563' }}>
                    {new Date(item.createdAt).toLocaleString('vi-VN')}
                  </p>
                </div>
                <div className="saved-actions">
                  <button type="button" className="logout-button" onClick={() => openSaved(item)}>Mo lai</button>
                  <button type="button" className="logout-button" onClick={() => deleteSaved(item.id)}>Xóa</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default IELTSSpeakingGrader;
