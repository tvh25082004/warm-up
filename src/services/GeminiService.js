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
    AIService._instance = this;
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
          model: this.openaiModel,
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
   * Generate IELTS Writing prompt (Task 1/Task 2) based on seed + optional document.
   * Returns: { prompt: string }
   */
  async generateIeltsWritingPrompt({ taskType, seed, sourceDocumentText }) {
    try {
      const typeLabelMap = {
        task1: 'IELTS Writing Task 1 (auto Academic/General)',
        task1_academic: 'IELTS Academic Writing Task 1',
        task1_general: 'IELTS General Training Writing Task 1',
        task2: 'IELTS Writing Task 2'
      };
      const typeLabel = typeLabelMap[taskType] || typeLabelMap.task2;
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

Target: ${typeLabel}

Teacher seed (Vietnamese allowed):
${seed || '(empty)'}

Optional source document (use it as topic grounding, do not copy long passages):
${sourceDocumentText ? sourceDocumentText.slice(0, 4000) : '(none)'}
`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.openaiKey}`
        },
        body: JSON.stringify({
          model: this.openaiModel,
          messages: [{ role: 'user', content: generationPrompt }],
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
      const parsed = JSON.parse(raw);
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
  async scoreWritingIelts({ taskType, gradingMode = 'auto', prompt, essay }) {
    try {
      const requestedMode = gradingMode || (taskType === 'task1' ? 'force_task1' : 'force_task2');
      const localWordCount = String(essay || '').trim().split(/\s+/).filter(Boolean).length;
      const normalizedPrompt = String(prompt || '').trim();
      const scoringPrompt = `You are an official IELTS Writing examiner.
Score strictly using IELTS Writing band descriptors.
Do not hallucinate missing prompt details. If task data is incomplete, state that clearly.

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
- Detect task type first from prompt text.
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
${essay}
`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.openaiKey}`
        },
        body: JSON.stringify({
          model: this.openaiModel,
          messages: [{ role: 'user', content: scoringPrompt }],
          temperature: 0.2,
          max_tokens: 1200,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || `HTTP ${response.status}`;
        throw new Error(`OpenAI Writing Scoring Error: ${errorMsg}`);
      }

      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content || '{}';
      const parsed = JSON.parse(raw);

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
}

const aiService = new AIService();
export default aiService;
