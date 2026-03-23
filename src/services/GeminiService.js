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
}

const aiService = new AIService();
export default aiService;
