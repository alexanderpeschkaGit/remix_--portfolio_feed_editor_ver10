import { GoogleGenAI } from "@google/genai";
import { PortfolioItem } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export const getGeminiResponse = async (
  message: string,
  portfolioData: PortfolioItem[],
  history: { role: 'user' | 'model'; text: string }[] = []
) => {
  const model = "gemini-3-flash-preview";
  
  // Create a context string from the portfolio data
  const portfolioContext = portfolioData.map(item => 
    `Project: ${item.title}\nDescription: ${item.text}\nSource: ${item.source}`
  ).join('\n\n');

  const systemInstruction = `
    You are a helpful and professional AI assistant for the portfolio of Vijay Sikanda.
    Your goal is to answer questions about the projects, style, and work of Vijay based on the provided portfolio data.
    
    Here is the portfolio data:
    ${portfolioContext}
    
    Keep your answers concise, elegant, and professional. If you don't know the answer, say you're not sure but offer to show them a relevant project.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        ...history.map(h => ({ role: h.role, parts: [{ text: h.text }] })),
        { role: 'user', parts: [{ text: message }] }
      ],
      config: {
        systemInstruction,
        temperature: 0.7,
        topP: 0.95,
        topK: 64,
      }
    });

    return response.text || "I'm sorry, I couldn't generate a response.";
  } catch (error) {
    console.error('Gemini API Error:', error);
    return "There was an error connecting to the AI assistant. Please try again later.";
  }
};
