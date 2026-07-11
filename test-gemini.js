import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: "AIzaSyD9MzJr1x2DZdBy8vu5-TvB-uX2UwbheUg" });
async function test() {
  try {
    const res = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: "Hello" });
    console.log("Success:", res.text);
  } catch (e) {
    console.error("Failed:", e.message);
  }
}
test();
