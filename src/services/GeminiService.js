/**
 * AIService - Singleton OOP Pattern
 * Manages AI connection using OpenAI GPT-4o for question generation
 * Falls back to Gemini if OpenAI fails
 */
class AIService {
  constructor() {
    if (AIService._instance) {
      return AIService._instance;
    }
    this.openaiKey = import.meta.env.VITE_OPENAI_API_KEY || '';
    this.openaiModel = 'gpt-4o';
    this.openaiIeltsModel = 'gpt-4.1';
    this.openaiVisionModel = 'gpt-4.1';
    AIService._instance = this;
  }

  cleanExtractedEssayArtifacts(rawEssay) {
    const text = String(rawEssay || '').replace(/\r/g, '').trim();
    if (!text) return '';

    const lines = text.split('\n').map((line) => line.trim());
    let skipUntil = 0;
    for (let i = 0; i < Math.min(lines.length, 15); i += 1) {
      const line = lines[i];
      if (!line) { skipUntil = i + 1; continue; }
      // Markdown table rows/separators
      if (/^\|.+\|$/.test(line) || /^\|[\s\-|]+\|$/.test(line)) { skipUntil = i + 1; continue; }
      // Vocab hint lines: "Label: word, word, word"
      if (/^[A-Za-z][A-Za-z0-9\s''\-()]{2,60}:\s*.{6,}$/.test(line) && line.includes(',')) { skipUntil = i + 1; continue; }
      // Short bare section header (≤6 words, no period)
      if (!line.includes('.') && line.split(/\s+/).length <= 6 && /^[A-Z]/.test(line)) { skipUntil = i + 1; continue; }
      // Looks like the start of a real essay sentence
      if (line.split(/\s+/).filter(Boolean).length >= 8) break;
      skipUntil = i + 1;
    }

    const cleaned = lines.slice(skipUntil).join('\n').trim();
    return cleaned || text;
  }

  // Returns true for lines that are hints/metadata between task instructions and the real essay.
  _isNonEssayLine(line) {
    if (!line) return true;
    if (/^\|.+\|$/.test(line) || /^\|[\s\-|]+\|$/.test(line)) return true; // markdown table
    if (/^[A-Za-z][A-Za-z0-9\s''\-()]{2,60}:\s*.{6,}$/.test(line) && line.includes(',')) return true; // vocab hint
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length <= 5 && !line.includes('.')) return true; // short label/header
    return false;
  }

  _isVocabHintLine(line) {
    const value = String(line || '').trim();
    if (!value) return false;
    return /^[A-Za-z][A-Za-z0-9\s''\-()]{2,60}:\s*.{6,}$/.test(value) && value.includes(',');
  }

  /** Câu mô tả đề Task 1 (không phải bài làm): "The table below shows ..." */
  _isLikelyTaskStemLine(line) {
    const value = String(line || '').trim();
    if (!value) return false;
    return /^the\s+(?:table|chart|graph|diagram|map|line graph|bar chart)\s+below\b/i.test(value);
  }

  _looksLikeEssayStart(line) {
    const value = String(line || '').trim();
    if (!value) return false;
    if (/^\|.+\|$/.test(value) || /^\|[\s\-|]+\|$/.test(value) || this._isVocabHintLine(value)) return false;
    if (this._isLikelyTaskStemLine(value)) return false;

    const words = value.split(/\s+/).filter(Boolean);
    if (words.length < 5 || !/^[A-Z]/.test(value)) return false;

    const essayStartIndicators = [
      /^the (chart|table|graph|diagram|map|line graph|bar chart)\b/i,
      /^the given (chart|table|graph|diagram|map)\b/i,
      /^the data\b/i,
      /^overall\b/i,
      /^in (contrast|recent years|conclusion|general|summary)\b/i,
      /^nowadays\b/i,
      /^it is (clear|obvious|evident) that\b/i,
      /^according to\b/i,
      /^as (can be seen|shown|illustrated)\b/i,
      /^this (essay|report|letter)\b/i,
      /^i (am writing|think|believe|would like)\b/i,
      /^there (is|are|has been|have been)\b/i,
      /^people (often|in many|around)\b/i,
      /^in (today|modern|recent)\b/i
    ];
    if (essayStartIndicators.some((p) => p.test(value))) return true;
    // 6+ words ending in punctuation, or 8+ words (any sentence-like line)
    if (words.length >= 6 && /[.!?,]$/.test(value)) return true;
    return words.length >= 10;
  }

  _recordPromptEssayExtractionLog(payload) {
    try {
      const key = 'ielts_prompt_essay_extraction_logs_v1';
      const prev = JSON.parse(localStorage.getItem(key) || '[]');
      const next = Array.isArray(prev) ? prev : [];
      next.unshift({
        ts: new Date().toISOString(),
        ...payload
      });
      localStorage.setItem(key, JSON.stringify(next.slice(0, 30)));
    } catch {
      // Ignore logging failures to keep extraction flow stable.
    }
  }

  /**
   * DOCX often exports multiple paragraphs as one line. Insert breaks before likely essay openers
   * so line-based heuristics still work.
   */
  normalizeExtractedTextForSplitting(rawText) {
    let text = String(rawText || '').replace(/\r/g, '').trim();
    if (!text) return '';
    text = text
      .replace(
        /([.!?])\s+(?=(?:The\s+(?:table|chart|graph|diagram|map|line graph|bar chart)\s+illustrates\b|Overall\b|In\s+contrast\b|Looking\s+at\s+the\b|According\s+to\b|It\s+is\s+(?:clear|obvious|evident)\b|Dear\s+[A-Za-z]))/gi,
        '$1\n\n'
      )
      .replace(/\n{3,}/g, '\n\n');
    return text.trim();
  }

  /** Last index after instruction phrase (prefer last match — đề thường 1 lần, tránh nhầm với câu trong bài). */
  _findLastInstructionBoundaryEnd(text) {
    const patterns = [
      /write at least\s+\d+\s+words\.?/gi,
      /minimum\s+(?:of\s+)?\d+\s+words\.?/gi,
      /you should spend about\s+\d+\s+minutes(?:\s+on this task)?\.?/gi
    ];
    let best = -1;
    for (const re of patterns) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        best = Math.max(best, m.index + m[0].length);
      }
    }
    return best;
  }

  /**
   * Bắt đầu bài làm (không nhầm với "The table below shows" trong đề).
   * Trả về offset trong chuỗi `segment` hoặc -1.
   */
  _findEssayStartOffsetInSegment(segment) {
    const s = String(segment || '');
    if (!s.trim()) return -1;

    const essayPatterns = [
      /\bThe\s+table\s+illustrates\b/i,
      /\bThe\s+(?:chart|graph|line graph|bar chart)\s+illustrates\b/i,
      /\bLooking\s+at\s+the\s+(?:table|chart|graph|diagram|figure)\b/i,
      /\bAccording\s+to\s+the\s+(?:table|chart|graph|diagram|figure)\b/i,
      /\bOverall\b/i,
      /\bIn\s+contrast\b/i,
      /\bIn\s+conclusion\b/i,
      /\bAs\s+(?:can be|is)\s+seen\b/i,
      /\bIt\s+is\s+(?:clear|obvious|evident)\s+that\b/i,
      /\bDear\s+(?:Sir|Madam|Mister|Ms\.|Mr\.)\b/i,
      /\bI\s+am\s+writing\b/i,
      /\bIn\s+my\s+opinion\b/i,
      /\bI\s+(?:strongly\s+)?(?:agree|disagree)\b/i
    ];

    let best = -1;
    for (const re of essayPatterns) {
      const m = s.search(re);
      if (m >= 0 && (best === -1 || m < best)) best = m;
    }
    return best;
  }

  splitPromptEssayByBoundary(rawText) {
    const text = this.normalizeExtractedTextForSplitting(rawText);
    if (!text) return { prompt: '', essay: '' };

    let boundaryEnd = this._findLastInstructionBoundaryEnd(text);

    if (boundaryEnd > 0) {
      const afterRaw = text.slice(boundaryEnd);
      const after = afterRaw.trim();
      const trimShift = afterRaw.length - afterRaw.trimStart().length;
      let essayOffsetInAfter = this._findEssayStartOffsetInSegment(after);

      if (essayOffsetInAfter < 0) {
        const afterLines = after.split('\n').map((l) => l.trim());
        let essayStartIdx = -1;
        for (let i = 0; i < afterLines.length; i++) {
          const line = afterLines[i];
          if (this._isNonEssayLine(line)) continue;
          if (this._looksLikeEssayStart(line)) {
            essayStartIdx = i;
            break;
          }
        }
        if (essayStartIdx >= 0 && afterLines[essayStartIdx]) {
          essayOffsetInAfter = after.indexOf(afterLines[essayStartIdx]);
        }
      }

      if (essayOffsetInAfter >= 0) {
        const absoluteEssayStart = boundaryEnd + trimShift + essayOffsetInAfter;
        const prompt = text.slice(0, absoluteEssayStart).trim();
        const essay = text.slice(absoluteEssayStart).trim();
        if (prompt && essay) return { prompt, essay };
      }
    }

    const instructionMarkers = [
      /write at least\s+\d+\s+words\.?/i,
      /you should spend about\s+\d+\s+minutes on this task\.?/i
    ];

    let legacyBoundaryEnd = -1;
    for (const marker of instructionMarkers) {
      const match = marker.exec(text);
      if (match) legacyBoundaryEnd = Math.max(legacyBoundaryEnd, match.index + match[0].length);
    }

    if (legacyBoundaryEnd > 0) {
      const promptRaw = text.slice(0, legacyBoundaryEnd).trim();
      const afterLines = text.slice(legacyBoundaryEnd).trim().split('\n').map((l) => l.trim());

      let essayStartIdx = -1;
      for (let i = 0; i < afterLines.length; i++) {
        const line = afterLines[i];
        if (this._isNonEssayLine(line)) continue;
        if (this._looksLikeEssayStart(line)) {
          essayStartIdx = i;
          break;
        }
      }

      if (essayStartIdx >= 0) {
        const promptTail = afterLines
          .slice(0, essayStartIdx)
          .filter((line) => !this._isVocabHintLine(line))
          .join('\n')
          .trim();
        const prompt = [promptRaw, promptTail].filter(Boolean).join('\n').trim();
        const essay = afterLines.slice(essayStartIdx).join('\n').trim();
        if (prompt && essay) return { prompt, essay };
      }
    }

    // Fallback: scan all lines for last instruction line, then skip hints to find essay.
    const nonEmptyLines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (nonEmptyLines.length >= 6) {
      const instructionLikePatterns = [
        /writing task\s*[12]/i,
        /you should spend about\s+\d+\s+minutes/i,
        /summarise the information/i,
        /summarize the information/i,
        /make comparisons where relevant/i,
        /to what extent do you agree or disagree/i,
        /discuss both views/i,
        /give reasons for your answer/i,
        /include any relevant examples/i
      ];
      const essayStartIndicators = [
        /^in conclusion\b/i,
        /^overall\b/i,
        /^it is clear that\b/i,
        /^the (chart|table|graph|diagram|map|line graph|bar chart)\b/i,
        /^the given (chart|table|graph|diagram|map)\b/i,
        /^according to\b/i,
        /^nowadays\b/i,
        /^in recent years\b/i
      ];

      let lastInstructionLine = -1;
      for (let i = 0; i < nonEmptyLines.length; i += 1) {
        if (instructionLikePatterns.some((p) => p.test(nonEmptyLines[i]))) lastInstructionLine = i;
      }

      if (lastInstructionLine >= 0 && lastInstructionLine + 1 < nonEmptyLines.length) {
        let essayStartLine = -1;
        for (let i = lastInstructionLine + 1; i < nonEmptyLines.length; i += 1) {
          const line = nonEmptyLines[i];
          if (this._isNonEssayLine(line)) continue;
          if (this._isLikelyTaskStemLine(line)) continue;
          const wordCount = line.split(/\s+/).filter(Boolean).length;
          const looksLikeEssay =
            essayStartIndicators.some((p) => p.test(line))
            || this._looksLikeEssayStart(line)
            || (wordCount >= 8 && /^[A-Z]/.test(line));
          if (looksLikeEssay) { essayStartLine = i; break; }
        }

        if (essayStartLine > lastInstructionLine) {
          const prompt = nonEmptyLines
            .slice(0, essayStartLine)
            .filter((line) => !this._isVocabHintLine(line))
            .join('\n')
            .trim();
          const essay = nonEmptyLines.slice(essayStartLine).join('\n').trim();
          if (prompt && essay) return { prompt, essay };
        }
      }
    }

    const lower = text.toLowerCase();
    const hasTaskSignals =
      lower.includes('writing task') || lower.includes('task 1') || lower.includes('task 2')
      || lower.includes('discuss both views') || lower.includes('to what extent')
      || lower.includes('the chart') || lower.includes('the table') || lower.includes('the graph');

    if (!hasTaskSignals) return { prompt: '', essay: text };

    const lastResortIdx = this._findEssayStartOffsetInSegment(text);
    if (lastResortIdx >= 40 && lastResortIdx < text.length - 40) {
      const maybePrompt = text.slice(0, lastResortIdx).trim();
      const maybeEssay = text.slice(lastResortIdx).trim();
      const pl = maybePrompt.toLowerCase();
      if (
        pl.includes('summarise') || pl.includes('summarize') || pl.includes('write at least')
        || pl.includes('writing task') || pl.includes('task 1') || pl.includes('task 2')
        || pl.includes('letter') || pl.includes('diagram')
      ) {
        return { prompt: maybePrompt, essay: maybeEssay };
      }
    }
    return { prompt: '', essay: text };
  }

  normalizePromptEssaySplit({ prompt, essay, originalText }) {
    const original = this.normalizeExtractedTextForSplitting(String(originalText || '').replace(/\r/g, '').trim());
    const normalizedPrompt = String(prompt || '').trim();
    let normalizedEssay = this.cleanExtractedEssayArtifacts(String(essay || '').trim());

    // If essay starts with the prompt text, strip the duplicated prompt from essay.
    if (normalizedPrompt && normalizedEssay) {
      const promptLower = normalizedPrompt.toLowerCase();
      const essayLower = normalizedEssay.toLowerCase();
      if (essayLower.startsWith(promptLower)) {
        normalizedEssay = this.cleanExtractedEssayArtifacts(normalizedEssay.slice(normalizedPrompt.length).trim());
      }
    }

    // If we have a valid prompt but essay is empty, try rule-based split for essay only.
    if (normalizedPrompt && !normalizedEssay && original) {
      const ruleSplit = this.splitPromptEssayByBoundary(original);
      if (ruleSplit.essay) {
        normalizedEssay = this.cleanExtractedEssayArtifacts(ruleSplit.essay);
      }
    }

    // If no prompt found yet, try rule-based split.
    if (!normalizedPrompt && original) {
      const ruleSplit = this.splitPromptEssayByBoundary(original);
      if (ruleSplit.prompt) {
        return {
          prompt: ruleSplit.prompt.trim(),
          essay: this.cleanExtractedEssayArtifacts(normalizedEssay || ruleSplit.essay || '')
        };
      }
    }

    // If we have a prompt, never let essay fall back to the full original text
    // (which would include the prompt again).
    if (normalizedPrompt) {
      return { prompt: normalizedPrompt, essay: normalizedEssay };
    }

    return {
      prompt: normalizedPrompt,
      essay: normalizedEssay || this.cleanExtractedEssayArtifacts(original)
    };
  }

  _stripJsonMarkdownFence(rawText) {
    let text = String(rawText || '').trim();
    if (!text) return '';
    if (!text.startsWith('```')) return text;
    text = text.replace(/^```(?:json)?\s*\r?\n?/i, '');
    const end = text.lastIndexOf('```');
    if (end >= 0) text = text.slice(0, end);
    return text.trim();
  }

  _tryParseJsonLenient(slice) {
    const tryParse = (s) => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    };
    let parsed = tryParse(slice);
    if (parsed) return parsed;
    const noTrailComma = String(slice).replace(/,(\s*[}\]])/g, '$1');
    parsed = tryParse(noTrailComma);
    if (parsed) return parsed;
    const sanitized = Array.from(noTrailComma)
      .map((char) => {
        const code = char.charCodeAt(0);
        if (code < 32 && char !== '\n' && char !== '\r' && char !== '\t') return ' ';
        return char;
      })
      .join('')
      .replace(/\s{2,}/g, ' ');
    return tryParse(sanitized);
  }

  safeParseJson(rawText) {
    const text = this._stripJsonMarkdownFence(rawText);
    if (!text) return {};

    const direct = this._tryParseJsonLenient(text);
    if (direct) return direct;

    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const sliced = text.slice(firstBrace, lastBrace + 1);
      const fromSlice = this._tryParseJsonLenient(sliced);
      if (fromSlice) return fromSlice;
    }

    throw new Error('AI trả về JSON không hợp lệ. Vui lòng thử chấm lại.');
  }

  /**
   * Generate a response using OpenAI GPT-4o
   */
  async generateResponse(messages, inputMsg) {
    try {
      const systemPrompt = `Bạn là trợ lý AI giúp giáo viên tiểu học tạo bộ câu hỏi tiếng Anh cho học sinh.
Hãy trả lời bằng tiếng Việt, rõ ràng và thân thiện.
Khi tạo câu hỏi, format đẹp với số thứ tự, câu hỏi, đáp án A/B/C/D và đáp án đúng.
Khi được yêu cầu tạo bộ câu hỏi cho game, hãy trả về dạng JSON array như sau:
[{"question": "câu hỏi", "optionA": "đáp án A", "optionB": "đáp án B", "answer": "A hoặc B"}]`;

      const apiMessages = [
        { role: 'system', content: systemPrompt }
      ];

      // Add recent chat history (last 10 messages)
      const recentMessages = messages.slice(-10);
      for (const msg of recentMessages) {
        apiMessages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      }
      apiMessages.push({ role: 'user', content: inputMsg });

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.openaiKey}`
        },
        body: JSON.stringify({
          model: this.openaiModel,
          messages: apiMessages,
          max_tokens: 2000,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || `HTTP ${response.status}`;
        throw new Error(`OpenAI Error: ${errorMsg}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('AI Service Error:', error);
      throw new Error(`Lỗi kết nối AI: ${error.message}`);
    }
  }

  /**
   * Transcribe speaking audio to text with OpenAI
   */
  async transcribeAudio(audioBlob) {
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'speaking.webm');
      formData.append('model', 'whisper-1');
      formData.append('language', 'en');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.openaiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || `HTTP ${response.status}`;
        throw new Error(`OpenAI Transcription Error: ${errorMsg}`);
      }

      const data = await response.json();
      return data.text || '';
    } catch (error) {
      console.error('Transcribe Error:', error);
      throw new Error(`Không thể chuyển giọng nói thành văn bản: ${error.message}`);
    }
  }

  /**
   * Transcribe uploaded audio or video (Whisper extracts audio from supported containers).
   * @param {File} file
   */
  async transcribeMediaFile(file) {
    if (!this.openaiKey) {
      throw new Error('Thieu VITE_OPENAI_API_KEY (.env).');
    }
    if (!file || typeof file.size !== 'number') {
      throw new Error('Chua co file hop le de nhan dang.');
    }
    // OpenAI Whisper: toi da 25MB / request — video lon: tach + nen audio (ffmpeg.wasm) truoc.
    const maxBytes = 25 * 1024 * 1024;
    let fileToSend = file;
    if (file.size > maxBytes) {
      const { ensureWhisperSizedMedia } = await import('../utils/whisperMediaPrep.js');
      fileToSend = await ensureWhisperSizedMedia(file, maxBytes);
    }
    if (fileToSend.size > maxBytes) {
      throw new Error(
        'File vuot qua 25MB (gioi han Whisper API). Hay nen video, giam chat luong, hoac cat ngan file roi thu lai.'
      );
    }
    try {
      const formData = new FormData();
      const safeName = String(fileToSend.name || 'recording.webm')
        .replace(/[^\w.\-()+ ]+/g, '_')
        .slice(0, 120) || 'recording.webm';
      formData.append('file', fileToSend, safeName);
      formData.append('model', 'whisper-1');
      formData.append('language', 'en');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.openaiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || `HTTP ${response.status}`;
        throw new Error(`OpenAI Transcription Error: ${errorMsg}`);
      }

      const data = await response.json();
      return String(data.text || '').trim();
    } catch (error) {
      console.error('Transcribe Media Error:', error);
      throw new Error(`Không thể speech-to-text: ${error.message}`);
    }
  }

  /**
   * OCR text from an embedded image (data URL)
   */
  async ocrImageForWriting(imageDataUrl) {
    if (!this.openaiKey || !imageDataUrl) return '';
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.openaiKey}`
        },
        body: JSON.stringify({
          model: this.openaiVisionModel,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Extract visible text from this IELTS writing-related image (chart/table/diagram). Return plain text only, concise and accurate.'
                },
                {
                  type: 'image_url',
                  image_url: { url: imageDataUrl }
                }
              ]
            }
          ],
          temperature: 0,
          max_tokens: 300
        })
      });
      if (!response.ok) return '';
      const data = await response.json();
      return String(data?.choices?.[0]?.message?.content || '').trim();
    } catch (error) {
      console.warn('OCR Image Error:', error);
      return '';
    }
  }

  /**
   * Score speaking quality based on IELTS-style rubric
   */
  async scoreSpeakingIelts(referenceScript, transcript) {
    try {
      const scoringPrompt = `You are an IELTS speaking examiner.
Return ONLY valid JSON with this schema:
{
  "overallBand": number,
  "fluencyCoherence": number,
  "lexicalResource": number,
  "grammarRangeAccuracy": number,
  "pronunciation": number,
  "feedback": "short actionable feedback in Vietnamese",
  "improvedSample": "a concise improved English sample (80-120 words)"
}

Reference script:
${referenceScript}

Learner transcript:
${transcript}

Scoring rules:
- Band scale: 0.0 to 9.0 (step 0.5)
- Evaluate similarity to reference meaning, grammatical quality, lexical level, and pronunciation approximation inferred from transcript quality.
- Keep feedback practical for a Vietnamese grade 6-9 learner.
`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.openaiKey}`
        },
        body: JSON.stringify({
          model: this.openaiIeltsModel,
          messages: [{ role: 'user', content: scoringPrompt }],
          temperature: 0.2,
          max_tokens: 700,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || `HTTP ${response.status}`;
        throw new Error(`OpenAI Scoring Error: ${errorMsg}`);
      }

      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content || '{}';
      return JSON.parse(raw);
    } catch (error) {
      console.error('Speaking Score Error:', error);
      throw new Error(`Không thể chấm điểm speaking: ${error.message}`);
    }
  }

  /**
   * IELTS Speaking band score from transcript only (upload / no reference script).
   * Uses official four criteria; transcript may contain minor ASR errors.
   */
  async scoreSpeakingIeltsFreeform({ transcript, taskPrompt }) {
    try {
      if (!this.openaiKey) {
        throw new Error('Thieu VITE_OPENAI_API_KEY (.env).');
      }
      const cue = String(taskPrompt || '').trim();
      const text = String(transcript || '').trim();
      if (!text) {
        throw new Error('Chưa có bản transcript để chấm.');
      }

      const scoringPrompt = `You are a certified IELTS Speaking examiner.
The candidate answer below was produced by automatic speech-to-text. Minor word errors or homophones may appear — infer the intended English charitably, but do not invent content that is not suggested by the transcript.

Return ONLY valid JSON with this schema (no markdown fences):
{
  "overallBand": number,
  "fluencyCoherence": number,
  "lexicalResource": number,
  "grammarRangeAccuracy": number,
  "pronunciation": number,
  "feedback": "clear actionable feedback in Vietnamese",
  "strengths": "2-4 bullet-style sentences in Vietnamese",
  "improvements": "2-4 bullet-style sentences in Vietnamese",
  "improvedSample": "a natural improved English answer of similar length and intent",
  "pronunciationIssues": [
    {
      "spoken": "word/phrase in transcript",
      "likelyTarget": "likely intended form",
      "issueType": "mispronounced | unclear | stress | ending_sound",
      "why": "short Vietnamese explanation",
      "practiceTip": "short drill tip in Vietnamese"
    }
  ],
  "languageIssues": [
    {
      "original": "wrong phrase from transcript",
      "improved": "better phrase",
      "issueType": "grammar | collocation | word_choice | coherence",
      "why": "short Vietnamese explanation"
    }
  ]
}

Scoring rules:
- Use IELTS Speaking band descriptors (Fluency and Coherence, Lexical Resource, Grammatical Range and Accuracy, Pronunciation).
- Bands from 0.0 to 9.0 in steps of 0.5.
- overallBand = average of the four criteria, rounded to nearest 0.5.
- If the transcript is too short to assess (< 20 words), lower bands and explain in feedback.
- If no task is given, assess as a general speaking sample (still use all four criteria).
- pronunciationIssues: return 3-8 items where possible. If confidence is low, still provide best-effort + mark issueType as "unclear".
- languageIssues: return 3-8 concrete phrase-level fixes from transcript text.
- Do not leave arrays null; return [] when none.
${cue ? `\nTask / cue card / question the candidate was answering:\n${cue}\n` : '\n(No specific task text — assess as a general speaking sample.)\n'}

Transcript:
${text}
`;

      const callScoreApi = async (promptText, maxTokens = 900) => {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.openaiKey}`
          },
          body: JSON.stringify({
            model: this.openaiIeltsModel,
            messages: [{ role: 'user', content: promptText }],
            temperature: 0.2,
            max_tokens: maxTokens,
            response_format: { type: 'json_object' }
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMsg = errorData.error?.message || `HTTP ${response.status}`;
          throw new Error(`OpenAI Speaking Score Error: ${errorMsg}`);
        }

        const data = await response.json();
        const choice = data.choices?.[0];
        return {
          raw: choice?.message?.content || '{}',
          finishReason: choice?.finish_reason || ''
        };
      };

      const compactJsonHint = `

CRITICAL JSON OUTPUT RULE:
- Return ONLY 1 JSON object with the same keys.
- Keep strings concise:
  feedback<=400 chars, strengths<=300, improvements<=300, improvedSample<=650.
- pronunciationIssues max 6 items, languageIssues max 6 items.
- No markdown, no explanation outside JSON.
`;

      const first = await callScoreApi(scoringPrompt, 1200);
      let parsed;
      try {
        parsed = this.safeParseJson(first.raw);
      } catch (firstErr) {
        // Retry with stricter compact instruction to avoid broken/truncated JSON.
        const retry = await callScoreApi(`${scoringPrompt}${compactJsonHint}`, 1400);
        try {
          parsed = this.safeParseJson(retry.raw);
        } catch {
          throw firstErr;
        }
      }

      parsed.pronunciationIssues = Array.isArray(parsed.pronunciationIssues) ? parsed.pronunciationIssues : [];
      parsed.languageIssues = Array.isArray(parsed.languageIssues) ? parsed.languageIssues : [];
      return parsed;
    } catch (error) {
      console.error('Speaking Freeform Score Error:', error);
      throw new Error(`Không thể chấm IELTS Speaking: ${error.message}`);
    }
  }

  /**
   * Generate IELTS Writing prompt (Task 1/Task 2) based on seed + optional document.
   * Returns: { prompt: string }
   */
  async generateIeltsWritingPrompt({ taskType, seed, sourceDocumentText, images = [] }) {
    try {
      const typeLabelMap = {
        task1: 'IELTS Writing Task 1 (auto Academic/General)',
        task1_academic: 'IELTS Academic Writing Task 1',
        task1_general: 'IELTS General Training Writing Task 1',
        task2: 'IELTS Writing Task 2'
      };
      const typeLabel = typeLabelMap[taskType] || typeLabelMap.task2;
      const hasImages = images.length > 0;
      const generationPrompt = `You are an IELTS Writing examiner and question writer.
Return ONLY valid JSON with this schema:
{
  "prompt": "string"
}

Constraints:
- The prompt must be written in ENGLISH, exactly like an IELTS writing question sheet.
- No markdown. No extra keys. No commentary outside JSON.
- If Task 2: include ONE clear question and requirements (e.g., discuss both views/opinion/problem-solution), and mention minimum 250 words.
- If Task 1 Academic: clearly indicate chart/table/graph/map/process style and mention minimum 150 words.
- If Task 1 General: provide a realistic letter situation with 3 bullet points and mention minimum 150 words.
- If Task 1 auto mode: choose either Academic or General format naturally from seed/document context.
- Keep the prompt self-contained and realistic.
${hasImages ? '- Images are attached. Perform OCR on tables/charts/diagrams, convert them to markdown/LaTeX, and incorporate the visual data into the generated prompt.' : ''}

Target: ${typeLabel}

Teacher seed (Vietnamese allowed):
${seed || '(empty)'}

Optional source document (use it as topic grounding, do not copy long passages):
${sourceDocumentText ? sourceDocumentText.slice(0, 4000) : '(none)'}
`;

      const userContent = hasImages
        ? [
            { type: 'text', text: generationPrompt },
            ...images.map((imgDataUri) => ({
              type: 'image_url',
              image_url: { url: imgDataUri, detail: 'high' }
            }))
          ]
        : generationPrompt;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.openaiKey}`
        },
        body: JSON.stringify({
          model: hasImages ? this.openaiVisionModel : this.openaiModel,
          messages: [{ role: 'user', content: userContent }],
          temperature: 0.6,
          max_tokens: 700,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || `HTTP ${response.status}`;
        throw new Error(`OpenAI Prompt Error: ${errorMsg}`);
      }

      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content || '{}';
      const parsed = this.safeParseJson(raw);
      if (!parsed?.prompt || typeof parsed.prompt !== 'string') {
        throw new Error('AI trả về dữ liệu không hợp lệ (thiếu prompt).');
      }
      return { prompt: parsed.prompt };
    } catch (error) {
      console.error('Writing Prompt Error:', error);
      throw new Error(`Không thể tạo đề IELTS Writing: ${error.message}`);
    }
  }

  /**
   * Score IELTS Writing essay using task-aware rubric.
   * gradingMode:
   * - auto: model detects task from prompt + essay
   * - force_task1: always score as Task 1 (Task Achievement)
   * - force_task2: always score as Task 2 (Task Response)
   */
  async scoreWritingIelts({ taskType, gradingMode = 'auto', prompt, essay, images = [] }) {
    try {
      const requestedMode = gradingMode || (taskType === 'task1' ? 'force_task1' : 'force_task2');
      const cleanedEssay = this.cleanExtractedEssayArtifacts(essay);
      const localWordCount = String(cleanedEssay || '').trim().split(/\s+/).filter(Boolean).length;
      const normalizedPrompt = String(prompt || '').trim();
      const hasImages = images.length > 0;
      const scoringPrompt = `You are an official IELTS Writing examiner.
Score strictly using IELTS Writing band descriptors.
Do not hallucinate missing prompt details. If task data is incomplete, state that clearly.
${hasImages ? `
IMAGE HANDLING RULES (CRITICAL):
- Carefully OCR all attached images.
- For tables: convert to markdown table AND note key data.
- For charts/graphs/maps/diagrams: describe data trends, key figures, and units.
- The images may contain the TASK QUESTION (e.g., a table to describe) and/or the CANDIDATE'S HANDWRITTEN ESSAY.
- SEPARATE THEM: identify which image is the task prompt and which is the candidate writing.
- Use the task prompt image to grade Task Achievement accurately.
- Use the candidate writing image to extract the full essay text for grading.
` : ''}

Return ONLY valid JSON with this schema:
{
  "detectedTaskType": "IELTS Academic Writing Task 1 | IELTS General Training Task 1 | IELTS Writing Task 2 | Unclear",
  "confidence": number,
  "reconstructedPrompt": "string",
  "missingOrUnclearDetails": "string",
  "overallBand": number,
  "taskResponse": number,
  "taskAchievement": number,
  "coherenceCohesion": number,
  "lexicalResource": number,
  "grammarRangeAccuracy": number,
  "wordCount": number,
  "wordCountWarning": "string",
  "taskWeightingNote": "string",
  "feedback": "strict and specific feedback in Vietnamese",
  "bandDescriptors": "criterion-by-criterion explanation in Vietnamese",
  "grammarIssues": "top grammar errors with short evidence quotes from essay in Vietnamese",
  "sentenceCorrections": "3-6 short before->after sentence corrections based on essay",
  "improvementPlan": "a practical 7-day improvement plan in Vietnamese",
  "improvedSample": "an improved English sample (Task 2: 180-230 words; Task 1: 150-190 words), aligned with the prompt"
}

Rules:
- Band scale: 0.0 to 9.0 (step 0.5).
- Return one complete JSON object (all keys). Prefer concise Vietnamese strings so nothing is cut off mid-JSON.
- Detect task type first from prompt text.
- If essay contains copied prompt fragments, OCR labels, metadata bullets or extraction artifacts, ignore those lines and score only the candidate's actual response.
- If mode is force_task1: score with Task 1 criteria only (Task Achievement + CC + LR + GRA), set taskResponse to null.
- If mode is force_task1_academic: force IELTS Academic Writing Task 1 scoring, set taskResponse to null.
- If mode is force_task1_general: force IELTS General Training Writing Task 1 scoring, set taskResponse to null.
- If mode is force_task2: score with Task 2 criteria only (Task Response + CC + LR + GRA), set taskAchievement to null.
- If mode is auto:
  - If detected as Task 2: set taskAchievement to null.
  - If detected as Task 1: set taskResponse to null.
  - If unclear: grade provisionally and explain uncertainty in missingOrUnclearDetails.
- overallBand should be the average of the four criteria, rounded to nearest 0.5.
- wordCount must be computed from the essay text (split on whitespace).
- Add wordCountWarning when under minimum words (Task 1: <150, Task 2: <250).
- taskWeightingNote must always remind: "Task 1 = 1/3, Task 2 = 2/3 trong bài thi Writing đầy đủ".
- Be conservative. Penalize missing overview (Task 1), off-task response, missing comparisons, weak development, repeated grammar errors.
- feedback and bandDescriptors must quote short evidence phrases from the essay.

Requested grading mode: ${requestedMode}

Writing prompt:
${normalizedPrompt || '(No prompt provided. Detect task only from essay cues and grade provisionally.)'}

Candidate essay:
${cleanedEssay || '(No typed text. Extract from image if provided.)'}
`;

      const userContent = hasImages
        ? [
            { type: 'text', text: scoringPrompt },
            ...images.map((imgDataUri) => ({
              type: 'image_url',
              image_url: { url: imgDataUri, detail: 'high' }
            }))
          ]
        : scoringPrompt;

      const callScoreApi = async (content, maxTokens) => {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.openaiKey}`
          },
          body: JSON.stringify({
            model: hasImages ? this.openaiVisionModel : this.openaiIeltsModel,
            messages: [{ role: 'user', content }],
            temperature: 0.2,
            max_tokens: maxTokens,
            response_format: { type: 'json_object' }
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMsg = errorData.error?.message || `HTTP ${response.status}`;
          throw new Error(`OpenAI Writing Scoring Error: ${errorMsg}`);
        }

        const data = await response.json();
        const choice = data.choices?.[0];
        const raw = choice?.message?.content || '{}';
        return { raw, finishReason: choice?.finish_reason || '' };
      };

      const compactHint =
        '\n\nCRITICAL: Return ONLY valid JSON with the SAME keys. Keep strings concise so output fits: '
        + 'feedback<=520 chars, bandDescriptors<=720, grammarIssues<=320, sentenceCorrections<=380, '
        + 'improvementPlan<=380, improvedSample<=980, reconstructedPrompt<=380, missingOrUnclearDetails<=320. '
        + 'No markdown fences.';

      let { raw, finishReason } = await callScoreApi(userContent, 8192);
      let parsed;
      try {
        parsed = this.safeParseJson(raw);
      } catch (firstErr) {
        const retryContent = hasImages
          ? [
              { type: 'text', text: `${scoringPrompt}${compactHint}` },
              ...images.map((imgDataUri) => ({
                type: 'image_url',
                image_url: { url: imgDataUri, detail: 'high' }
              }))
            ]
          : `${scoringPrompt}${compactHint}`;
        try {
          const second = await callScoreApi(
            retryContent,
            finishReason === 'length' ? 8192 : 6144
          );
          parsed = this.safeParseJson(second.raw);
        } catch {
          throw firstErr;
        }
      }

      const normalizeDetectedTaskType = (value) => {
        const text = String(value || '').trim().toLowerCase();
        if (!text) return 'Unclear';
        if (
          text.includes('general training task 1')
          || (text.includes('task 1') && text.includes('general'))
        ) {
          return 'IELTS General Training Task 1';
        }
        if (
          text.includes('academic writing task 1')
          || (text.includes('task 1') && text.includes('academic'))
        ) {
          return 'IELTS Academic Writing Task 1';
        }
        if (text.includes('task 2')) return 'IELTS Writing Task 2';
        if (text.includes('task 1')) return 'IELTS Academic Writing Task 1';
        return 'Unclear';
      };
      parsed.detectedTaskType = normalizeDetectedTaskType(parsed.detectedTaskType);

      // Small normalization to keep UI stable
      if (requestedMode === 'force_task1' || requestedMode === 'force_task1_academic' || requestedMode === 'force_task1_general') {
        parsed.taskResponse = null;
      } else if (requestedMode === 'force_task2') {
        parsed.taskAchievement = null;
      } else {
        const detected = String(parsed.detectedTaskType || '').toLowerCase();
        if (detected.includes('task 2')) {
          parsed.taskAchievement = null;
        } else if (detected.includes('task 1')) {
          parsed.taskResponse = null;
        }
      }
      if (!Number.isFinite(parsed.wordCount)) {
        parsed.wordCount = localWordCount;
      }

      if (!parsed.wordCountWarning || typeof parsed.wordCountWarning !== 'string') {
        const effectiveMode = requestedMode === 'auto'
          ? String(parsed.detectedTaskType || '').toLowerCase()
          : requestedMode;
        const minWords = (effectiveMode.includes('task 2') || effectiveMode === 'force_task2') ? 250 : 150;
        if (parsed.wordCount < minWords) {
          parsed.wordCountWarning = `Bài viết đang dưới mức tối thiểu ${minWords} từ.`;
        }
      }

      if (!parsed.taskWeightingNote || typeof parsed.taskWeightingNote !== 'string') {
        parsed.taskWeightingNote = 'Task 1 = 1/3, Task 2 = 2/3 trong bài thi Writing đầy đủ.';
      }
      if (!normalizedPrompt) {
        const existingNote = String(parsed.missingOrUnclearDetails || '').trim();
        const promptMissingNote = 'Không có đề đầu vào, hệ thống chấm theo nhận diện từ bài viết nên độ chính xác task có thể thấp hơn.';
        parsed.missingOrUnclearDetails = existingNote
          ? `${existingNote}\n${promptMissingNote}`
          : promptMissingNote;
      }
      return parsed;
    } catch (error) {
      console.error('Writing Score Error:', error);
      throw new Error(`Không thể chấm điểm writing: ${error.message}`);
    }
  }

  /**
   * Try to split uploaded content into IELTS prompt and candidate essay.
   * Returns: { prompt: string, essay: string }
   */
  async extractPromptAndEssayFromUpload({ taskType, rawText }) {
    const text = this.normalizeExtractedTextForSplitting(String(rawText || '').trim());
    if (!text) return { prompt: '', essay: '' };

    const directSplit = this.splitPromptEssayByBoundary(text);
    if (directSplit.prompt && directSplit.essay) {
      const normalized = {
        prompt: directSplit.prompt,
        essay: this.cleanExtractedEssayArtifacts(directSplit.essay)
      };
      this._recordPromptEssayExtractionLog({
        source: 'rule_based',
        taskType,
        promptPreview: normalized.prompt.slice(0, 240),
        essayPreview: normalized.essay.slice(0, 240),
        promptLength: normalized.prompt.length,
        essayLength: normalized.essay.length
      });
      return {
        prompt: normalized.prompt,
        essay: normalized.essay
      };
    }

    try {
      const mode = taskType === 'task1'
        ? 'task1_auto'
        : (taskType || 'task2');

      const splitPrompt = `You are an IELTS document parser. A student uploaded a Word document (converted to text) that contains BOTH an IELTS question prompt AND the student's own essay answer.
Your job: split them into two fields exactly.

Return ONLY valid JSON — no extra text, no markdown fences:
{
  "prompt": "string",
  "essay": "string"
}

SEPARATION RULES (apply in order):
1. The PROMPT section typically comes FIRST and contains:
   - IELTS task header: "WRITING TASK 1" or "WRITING TASK 2"
   - Time/word instructions: "You should spend about X minutes", "Write at least X words"
   - The question/task description (may include a markdown table)
   - Any chart/graph description or letter-writing scenario
2. VOCABULARY HINT sections (lines like "Topic label: word, word, word") appear between the task instructions and the student essay. They are NOT part of the student's essay — exclude them from "essay".
3. The ESSAY section comes AFTER all hints/tables and contains only the student's own paragraphs.
4. If the document has a markdown table (lines starting with |), it belongs to the PROMPT, NOT the essay.
5. VERBATIM (critical): Copy characters from the upload only. For "essay", do NOT fix spelling/grammar, do NOT paraphrase, do NOT replace with a "better" IELTS sample, do NOT normalize punctuation. Keep student typos exactly.
6. Preserve line breaks within each section.
7. If no IELTS prompt is found, return "prompt": "" and put everything in "essay".
8. Strip any duplicate header lines that appear in both sections only if they are byte-identical repeats.

Preferred task mode: ${mode}

Uploaded text (verbatim):
${text.slice(0, 12000)}
`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.openaiKey}`
        },
        body: JSON.stringify({
          model: this.openaiIeltsModel,
          messages: [
            {
              role: 'system',
              content:
                'You only split text into prompt vs essay. Essay must use the student\'s original wording from the upload — no paraphrase, no "better" sample essay. Remove vocab-hint lines from the essay only.'
            },
            { role: 'user', content: splitPrompt }
          ],
          temperature: 0,
          max_tokens: 4500,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || `HTTP ${response.status}`;
        throw new Error(`OpenAI Split Error: ${errorMsg}`);
      }

      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content || '{}';
      const parsed = this.safeParseJson(raw);
      const normalized = this.normalizePromptEssaySplit({
        prompt: parsed?.prompt,
        essay: parsed?.essay,
        originalText: text
      });
      this._recordPromptEssayExtractionLog({
        source: 'ai_split',
        taskType,
        promptPreview: normalized.prompt.slice(0, 240),
        essayPreview: normalized.essay.slice(0, 240),
        promptLength: normalized.prompt.length,
        essayLength: normalized.essay.length
      });
      return normalized;
    } catch (error) {
      console.warn('Extract Prompt/Essay Error:', error);
      const normalized = this.normalizePromptEssaySplit({
        prompt: '',
        essay: '',
        originalText: text
      });
      this._recordPromptEssayExtractionLog({
        source: 'fallback',
        taskType,
        error: String(error?.message || error || 'unknown'),
        promptPreview: normalized.prompt.slice(0, 240),
        essayPreview: normalized.essay.slice(0, 240),
        promptLength: normalized.prompt.length,
        essayLength: normalized.essay.length
      });
      return normalized;
    }
  }

  /** OCR candidate essay from uploaded image(s) (handwriting or screenshot). */
  async extractIeltsEssayFromImages(images = []) {
    if (!images.length) return '';
    try {
      const ocrPrompt = `Return ONLY valid JSON: { "essay": "string" }

You are a mechanical OCR for exam images. Transcribe ONLY visible candidate prose (paragraphs the student wrote).

Hard rules:
- Copy visible English (or other visible script) character-by-character. Do NOT correct spelling or grammar. Do NOT paraphrase. Do NOT replace words with synonyms.
- Do NOT output a generic or memorized IELTS model answer. If text is unclear, use [illegible] — never guess a plausible sentence.
- If the image shows a data table, chart, or task rubric ABOVE or BESIDE the essay: do NOT transcribe table cells, numbers, or axis labels unless they appear inside the student's paragraph lines.
- Do NOT include task instructions ("Write at least...", "Summarise the information...") unless they are visibly part of the student's handwritten answer.
- Preserve paragraph breaks as blank lines.
`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.openaiKey}`
        },
        body: JSON.stringify({
          model: this.openaiVisionModel,
          messages: [
            {
              role: 'system',
              content:
                'You only transcribe pixels to text. Refuse to polish, improve, or substitute sample essays. When uncertain, [illegible].'
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: ocrPrompt },
                ...images.map((imgDataUri) => ({
                  type: 'image_url',
                  image_url: { url: imgDataUri, detail: 'high' }
                }))
              ]
            }
          ],
          temperature: 0,
          max_tokens: 6000,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || `HTTP ${response.status}`;
        throw new Error(`OpenAI OCR Essay Error: ${errorMsg}`);
      }

      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content || '{}';
      const parsed = this.safeParseJson(raw);
      return String(parsed?.essay || '').trim();
    } catch (error) {
      console.warn('Extract IELTS Essay From Images Error:', error);
      return '';
    }
  }

  /** OCR IELTS task prompt from image(s); preserve tables as markdown/LaTeX, verbatim. */
  async extractIeltsPromptFromImages(images = []) {
    if (!images.length) return '';
    try {
      const ocrPrompt = `You are an OCR engine for IELTS Writing question sheets.
Return ONLY valid JSON:
{
  "prompt": "string"
}

Strict extraction requirements:
- Transcribe verbatim (exact words) from the image. Do NOT summarize or rewrite.
- Preserve original section order and line breaks for the question statement/instructions.
- If there is a table, include:
  1) a markdown table using exact headers/cells
  2) a LaTeX tabular block using exact headers/cells
- Keep all key task instructions like:
  - WRITING TASK ...
  - You should spend about ...
  - Write at least ... words.
- If one word is unclear, keep best-effort OCR token and do not fabricate meaning.
`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.openaiKey}`
        },
        body: JSON.stringify({
          model: this.openaiVisionModel,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: ocrPrompt },
              ...images.map((imgDataUri) => ({
                type: 'image_url',
                image_url: { url: imgDataUri, detail: 'high' }
              }))
            ]
          }],
          temperature: 0,
          max_tokens: 1400,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || `HTTP ${response.status}`;
        throw new Error(`OpenAI OCR Prompt Error: ${errorMsg}`);
      }

      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content || '{}';
      const parsed = this.safeParseJson(raw);
      return String(parsed?.prompt || '').trim();
    } catch (error) {
      console.warn('Extract IELTS Prompt From Images Error:', error);
      return '';
    }
  }
}

const aiService = new AIService();
export default aiService;
