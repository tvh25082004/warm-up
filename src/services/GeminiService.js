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
}

const aiService = new AIService();
export default aiService;
