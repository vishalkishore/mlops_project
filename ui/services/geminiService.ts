
// import { GoogleGenAI } from "@google/genai";

// // Initialize the client with the API key from the environment
// const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// /**
//  * Analyzes an image using the Gemini Flash model.
//  * Used by Feature 1.
//  */
// export const analyzeImage = async (
//   base64Image: string,
//   mimeType: string,
//   prompt: string
// ): Promise<string> => {
//   try {
//     const response = await ai.models.generateContent({
//       model: 'gemini-2.5-flash',
//       contents: {
//         parts: [
//           {
//             inlineData: {
//               mimeType: mimeType,
//               data: base64Image,
//             },
//           },
//           {
//             text: prompt,
//           },
//         ],
//       },
//     });

//     return response.text || "No analysis generated.";
//   } catch (error) {
//     console.error("Gemini API Error:", error);
//     return "Error analyzing image. Please try again.";
//   }
// };

// /**
//  * Generates a caption for a reference image.
//  * Used by Feature 2 when no prompt is provided.
//  */
// export const generateCaption = async (
//   base64Image: string,
//   mimeType: string
// ): Promise<string> => {
//   try {
//     const response = await ai.models.generateContent({
//       model: 'gemini-2.5-flash',
//       contents: {
//         parts: [
//           {
//             inlineData: {
//               mimeType: mimeType,
//               data: base64Image,
//             },
//           },
//           {
//             text: "Provide a detailed visual description of this image to be used as a style or content reference.",
//           },
//         ],
//       },
//     });
//     return response.text || "A reference image.";
//   } catch (error) {
//     console.error("Caption Generation Error:", error);
//     return "Error generating caption.";
//   }
// };

// /**
//  * Analyzes content with potentially multiple images.
//  * Used by Feature 2.
//  */
// export const analyzeMixedContent = async (
//   mainImage: { data: string; mimeType: string },
//   refImage: { data: string; mimeType: string } | null,
//   prompt: string
// ): Promise<string> => {
//   try {
//     const parts: any[] = [
//       {
//         text: "You are an advanced AI assistant. Analyze the primary image based on the provided instructions and optional reference context.",
//       },
//       {
//         text: "PRIMARY IMAGE:",
//       },
//       {
//         inlineData: {
//           mimeType: mainImage.mimeType,
//           data: mainImage.data,
//         },
//       }
//     ];

//     if (refImage) {
//       parts.push({ text: "REFERENCE IMAGE:" });
//       parts.push({
//         inlineData: {
//           mimeType: refImage.mimeType,
//           data: refImage.data,
//         },
//       });
//     }

//     parts.push({ text: `INSTRUCTIONS: ${prompt}` });

//     const response = await ai.models.generateContent({
//       model: 'gemini-2.5-flash',
//       contents: { parts },
//     });

//     return response.text || "No result generated.";
//   } catch (error) {
//     console.error("Mixed Content Analysis Error:", error);
//     return "Error during analysis.";
//   }
// };