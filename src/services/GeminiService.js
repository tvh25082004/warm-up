import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Singleton OOP Pattern for AI Service
 * Manages Gemini API connection and question generation
 */
class GeminiService {
  constructor() {
    if (GeminiService._instance) {
      return GeminiService._instance;
    }
    this.apiKey = 'AIzaSyD-m6ZlPoZibkhw57pvYtUGEBZvhjaPcCA';
    this.genAI = new GoogleGenerativeAI(this.apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    GeminiService._instance = this;
  }

  /**
   * Generate a response from Gemini using simple generateContent
   * @param {Array} messages - Chat history array [{role, content}]
   * @param {string} inputMsg - The new user message
   * @returns {string} AI response text
   */
  async generateResponse(messages, inputMsg) {
    try {
      // Build a simple prompt from history + new message
      const systemContext = `Bạn là trợ lý AI giúp giáo viên tiểu học tạo bộ câu hỏi tiếng Anh cho học sinh.
Hãy trả lời bằng tiếng Việt, rõ ràng và thân thiện.
Khi tạo câu hỏi, hãy format đẹp với số thứ tự, đáp án A/B/C/D và đáp án đúng.`;

      let conversationText = systemContext + '\n\n';
      
      // Only include the last 10 messages to avoid token overflow
      const recentMessages = messages.slice(-10);
      for (const msg of recentMessages) {
        const role = msg.role === 'user' ? 'Giáo viên' : 'Trợ lý AI';
        conversationText += `${role}: ${msg.content}\n\n`;
      }
      conversationText += `Giáo viên: ${inputMsg}\n\nTrợ lý AI:`;

      const result = await this.model.generateContent(conversationText);
      const response = result.response;
      return response.text();
    } catch (error) {
      console.error('Gemini API Error:', error);
      
      // Provide specific error info
      if (error.message?.includes('API_KEY')) {
        throw new Error('API Key không hợp lệ. Vui lòng kiểm tra lại.');
      }
      if (error.message?.includes('404')) {
        throw new Error('Model AI chưa sẵn sàng. Đang thử lại...');
      }
      throw new Error(`Lỗi kết nối AI: ${error.message || 'Không xác định'}`);
    }
  }
}

const geminiService = new GeminiService();
export default geminiService;
