import { GoogleGenerativeAI } from '@google/generative-ai';

// Singleton OOP Pattern for AI Service
class GeminiService {
  constructor() {
    if (!GeminiService.instance) {
      // Hardcoded for Vercel deployment ease as requested by user
      this.apiKey = 'AIzaSyD-m6ZlPoZibkhw57pvYtUGEBZvhjaPcCA';
      this.genAI = new GoogleGenerativeAI(this.apiKey);
      GeminiService.instance = this;
    }
    return GeminiService.instance;
  }

  async generateResponse(messages, inputMsg) {
    try {
      // Using gemini-1.5-flash as requested, providing a reliable prompt structure
      const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      const chat = model.startChat({
        history: messages.slice(0, -1).map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          maxOutputTokens: 1000,
        },
      });

      const result = await chat.sendMessage(inputMsg);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Error generating AI response:', error);
      // Fallback or more descriptive error
      throw new Error('Hệ thống AI đang bận hoặc model chưa sẵn sàng. Cô vui lòng thử lại sau nhé!');
    }
  }
}

const instance = new GeminiService();
export default instance;
