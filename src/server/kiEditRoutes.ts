import type { Express } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs/promises';
import path from 'path';
import { DATA_DIR, DATA_V2_DIR, ORIGINALS_DIR } from './serverContext.ts';

export function registerKiEditRoutes(app: Express) {
  // API route for AI copy optimization (KI-Edit)
  app.post("/api/ki-edit", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({
          error: "GEMINI_API_KEY ist nicht in der .env-Datei konfiguriert. Bitte trage deinen Google Gemini API-Key in .env ein."
        });
      }

      const { title, description, images, imageUrls } = req.body || {};

      const inlineParts: Array<{ inlineData: { data: string; mimeType: string } }> = [];

      // Collect base64 images passed directly from client
      if (Array.isArray(images)) {
        for (const img of images) {
          if (!img) continue;
          if (typeof img === 'object' && img.data) {
            const cleanData = String(img.data).replace(/^data:[^;]+;base64,/, '');
            inlineParts.push({
              inlineData: {
                data: cleanData,
                mimeType: img.mimeType || 'image/jpeg',
              }
            });
          } else if (typeof img === 'string') {
            const match = img.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              inlineParts.push({
                inlineData: {
                  mimeType: match[1],
                  data: match[2],
                }
              });
            } else if (img.length > 50 && !img.startsWith('http') && !img.startsWith('/')) {
              inlineParts.push({
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: img,
                }
              });
            }
          }
          if (inlineParts.length >= 5) break;
        }
      }

      // If no base64 parts yet and imageUrls provided, resolve local thumbnail files
      if (inlineParts.length === 0 && Array.isArray(imageUrls)) {
        for (const imgUrl of imageUrls) {
          if (typeof imgUrl !== 'string') continue;
          try {
            let localFilePath: string | null = null;
            if (imgUrl.startsWith('/data/')) {
              localFilePath = path.join(DATA_DIR, imgUrl.replace('/data/', ''));
            } else if (imgUrl.startsWith('/data_v2/')) {
              localFilePath = path.join(DATA_V2_DIR, imgUrl.replace('/data_v2/', ''));
            } else if (imgUrl.startsWith('/originals/')) {
              localFilePath = path.join(ORIGINALS_DIR, imgUrl.replace('/originals/', ''));
            } else if (!imgUrl.startsWith('http')) {
              const check1 = path.join(DATA_DIR, imgUrl);
              const check2 = path.join(DATA_V2_DIR, imgUrl);
              if (await fs.stat(check1).then(() => true).catch(() => false)) localFilePath = check1;
              else if (await fs.stat(check2).then(() => true).catch(() => false)) localFilePath = check2;
            }

            if (localFilePath && await fs.stat(localFilePath).then(s => s.isFile()).catch(() => false)) {
              const fileBuf = await fs.readFile(localFilePath);
              const ext = path.extname(localFilePath).toLowerCase();
              const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
              inlineParts.push({
                inlineData: {
                  data: fileBuf.toString('base64'),
                  mimeType: mime,
                }
              });
            }
          } catch {
            // Ignore individual file resolution errors
          }
          if (inlineParts.length >= 5) break;
        }
      }

      const genAI = new GoogleGenerativeAI(apiKey);

      const systemPrompt = `You are an elite copywriter and SEO expert for Vijay Sikanda (a leading studio specializing in 3D projection mapping, stage design, and immersive audiovisual art, in the style of Lumine or United Motion Labs).

Task: Analyze the input (project title, existing description, and preview images) and transform it into an English, structured, concise, and SEO-optimized case study (2–3 short paragraphs, approx. 70 to 110 words total) followed by structured project metadata.

Collaborating Artists & Credits: If other artists, painters, musicians, DJs, performers, or co-creators are mentioned in the input (e.g. Amanda Sage, A. Andrew Gonzalez, DJ Gobayashi, etc.), seamlessly weave them into the narrative and credit them in the Collaborators line.

Structure & Output:
1. Narrative Description (strictly in English, 2 to 3 short, fluidly readable paragraphs, approx. 70 to 110 words total):
   - Paragraph 1: Occasion, context, artistic vision, and any featured/collaborating artists.
   - Paragraph 2: Immersive atmosphere, narrative, and visual experience.
   - Paragraph 3 (optional): Technical implementation and spatial impact.

2. Project Metadata Block (at the very end of the text, strictly in English, each item on its own line):
Type: [Event type, e.g. Festival, Corporate Event, Art Exhibition, Conscious Gathering, Club Night]
Theme: [Theme or concept - ONLY include this line if a specific artistic theme or motto exists, otherwise omit this line completely]
Client: [Client, brand, or organizer]
Agency: [Agency - ONLY include this line if an agency was involved or is known, otherwise omit this line completely]
Location: [Venue, City, Country]
Collaborators: [Collaborating artists, painters, musicians, performers, or co-creators - ONLY include this line if other artists/collaborators are mentioned in the input, otherwise omit this line completely]
Technical Solution: [Technologies used, e.g. 3D Architectural Video Mapping, Stage Design, Live VJing, Laser Projection, Slide Installation]

SEO Keywords (naturally integrate where fitting): "3D Video Mapping", "Architectural Projection", "Immersive Media Art", "Stage Design", "Slide Installation", "Audiovisual Art", "Conscious Events".

Tone & Language: Authoritative, technically sophisticated, artistically refined, direct, and impactful. Written in flawless English from the perspective of the studio/artist ("Vijay Sikanda"). Do not use clichés like "We are proud to present" – describe the installation factually and powerfully.
Rule: Output ONLY the final text in English (Narrative Description + Project Metadata Block). No introductions, no conversational filler, no markdown titles or headings like "Context:".`;

      const userPrompt = `Project Title: ${title || "Untitled Project"}

Existing Project Description:
${description ? String(description).trim() : "(No previous description provided. Please create the case study based on the title and images.)"}`;

      const requestedModel = process.env.GEMINI_MODEL || "gemini-3.8-flash";
      const modelCandidates = Array.from(new Set([
        requestedModel,
        "gemini-3.8-flash",
        "gemini-3.1-flash-lite",
        "gemini-flash-latest"
      ]));

      const thinkingConfig = {
        thinkingLevel: (process.env.GEMINI_THINKING_LEVEL || "MEDIUM").toUpperCase(),
      };

      let generatedText = "";
      let primaryError: any = null;
      let lastError: any = null;

      for (const candidateModelName of modelCandidates) {
        console.log(`[ki-edit] Trying model candidate: ${candidateModelName}`);

        // Variation 1: Search Grounding + Thinking
        try {
          const model = genAI.getGenerativeModel({
            model: candidateModelName,
            systemInstruction: systemPrompt,
            tools: [{ googleSearch: {} } as any],
            generationConfig: {
              thinkingConfig,
            } as any,
          });
          const result = await model.generateContent([...inlineParts, userPrompt]);
          generatedText = result.response.text();
          if (generatedText) {
            console.log(`[ki-edit] Success with ${candidateModelName} (Search + Thinking)`);
            break;
          }
        } catch (err: any) {
          console.warn(`[ki-edit] ${candidateModelName} (Search + Thinking) failed: ${err.message}`);
          if (!primaryError && candidateModelName === requestedModel) primaryError = err;
          lastError = err;
        }

        // Variation 2: Thinking without search tools (resolves quota limits on search grounding)
        try {
          const model = genAI.getGenerativeModel({
            model: candidateModelName,
            systemInstruction: systemPrompt,
            generationConfig: {
              thinkingConfig,
            } as any,
          });
          const result = await model.generateContent([...inlineParts, userPrompt]);
          generatedText = result.response.text();
          if (generatedText) {
            console.log(`[ki-edit] Success with ${candidateModelName} (Thinking only)`);
            break;
          }
        } catch (err: any) {
          console.warn(`[ki-edit] ${candidateModelName} (Thinking only) failed: ${err.message}`);
          if (!primaryError && candidateModelName === requestedModel) primaryError = err;
          lastError = err;
        }

        // Variation 3: Plain (no thinking, no search tools)
        try {
          const model = genAI.getGenerativeModel({
            model: candidateModelName,
            systemInstruction: systemPrompt,
          });
          const result = await model.generateContent([...inlineParts, userPrompt]);
          generatedText = result.response.text();
          if (generatedText) {
            console.log(`[ki-edit] Success with ${candidateModelName} (Plain)`);
            break;
          }
        } catch (err: any) {
          console.warn(`[ki-edit] ${candidateModelName} (Plain) failed: ${err.message}`);
          if (!primaryError && candidateModelName === requestedModel) primaryError = err;
          lastError = err;
        }
      }

      if (!generatedText) {
        throw primaryError || lastError || new Error("Generierung mit allen Modellen fehlgeschlagen.");
      }

      res.json({ success: true, text: generatedText.trim() });
    } catch (e: any) {
      console.error("[ki-edit] Error during AI generation:", e);
      res.status(500).json({ error: e.message || "Fehler beim Ausführen des KI-Edits." });
    }
  });


}
