import express from 'express'
import cors from 'cors';
import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import "dotenv/config";
import { generalImageCall, imageinGroups } from './geminiCall.ts';
import { runSpecialtyChecks, parseSpecialtyFlags, type SpecialtyResult } from './specialtyfunctions.ts';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

const AI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
const model = AI.getGenerativeModel({ model: "gemini-2.5-flash" });

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_ANON_KEY as string
);

// ---------------------------------------------------------------------------
// Helper: Search for Redfin URL from Address
// ---------------------------------------------------------------------------
async function searchUrlFromAddress(address: string, page: puppeteer.Page): Promise<string | null> {
  try {
    //duckduckgo
    const searchUrl = `https://html.duckduckgo.com/html/?q=site:redfin.com+${encodeURIComponent(address)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const html = await page.content();
    const cheerioTime = cheerio.load(html);

    let resultUrl: string | null = null;
    cheerioTime('a.result__url').each((_i, el) => {
      const href = cheerioTime(el).attr('href');
      if (href && href.includes('redfin.com')) {
        const urlMatch = href.match(/uddg=([^&]+)/);

        if (urlMatch) {
          resultUrl = decodeURIComponent(urlMatch[1]);
        } else {
          const text = cheerioTime(el).text().trim();
          if (text.includes('redfin.com')) {
            resultUrl = 'https://' + text;
          } else {
            resultUrl = href;
          }
        }
        return false;
      }
    });

    if (!resultUrl) {
      cheerioTime('a').each((_i, el) => {
        const href = cheerioTime(el).attr('href');
        if (href && href.includes('redfin.com')) {
          const urlMatch = href.match(/uddg=([^&]+)/);

          if (urlMatch) {
            resultUrl = decodeURIComponent(urlMatch[1]);
          } else {
            resultUrl = href;
          }
          return false;
        }
      });
    }
    console.log("++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++=\n" + resultUrl + "\n" + "+++++++++++++++++++++++++");

    return resultUrl;
  } catch (err) {
    console.error("Error searching for address:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// API: Start Property Analysis (Background Job)
// ---------------------------------------------------------------------------
app.post('/api/analyzeProperty', async (req, res) => {
  const { address, userNeeds, url } = req.body;

  if (!userNeeds || (!address && !url)) {
    return res.status(400).json({ error: "Missing required fields: userNeeds and either address or url." });
  }

  try {
    // 1. Create a session in Supabase immediately
    const { data: sessionData, error: sessionError } = await supabase
      .from('evaluations')
      .insert([{ address: address || url, user_needs: userNeeds, status: 'processing' }])
      .select('id')
      .single();

    if (sessionError) throw sessionError;

    const sessionId = sessionData.id;

    // 2. Return the session ID to the frontend
    res.json({ message: "Analysis started", sessionId: sessionId });

    // 3. Kick off the background processing (Fire and Forget)
    processPropertyBackground(sessionId, address, url, userNeeds).catch(console.error);

  } catch (err) {
    console.error("Failed to start analysis:", err);
    res.status(500).json({ error: 'Failed to start analysis' });
  }
});

// ---------------------------------------------------------------------------
// API: Check Session Status
// ---------------------------------------------------------------------------
app.get('/api/evaluationUpdate/:id', async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('evaluations')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return res.status(404).json({ error: "Evaluation not found" });
  res.json(data);
});

// ---------------------------------------------------------------------------
// Background Processing: Main Orchestrator
// ---------------------------------------------------------------------------
async function processPropertyBackground(
  sessionId: string,
  address: string,
  url: string,
  userNeeds: string
) {
  let browser = null;

  try {
    console.log(`[Session ${sessionId}] Starting property analysis...`);

    // Step 1: Generate accessibility checklist
    const checklist = await generateAccessibilityChecklist(sessionId, userNeeds);

    // Step 2: Scrape property images
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const propertyImages = await scrapePropertyImages(sessionId, browser, address, url);
    await browser.close();
    browser = null;

    // Step 3: Analyze images for accessibility issues
    const imageAnalysisResults = await analyzeImagesInBatches(
      sessionId,
      propertyImages,
      checklist
    );

    // Step 3.5: Run specialty checks if the checklist flagged any
    const specialtyFlags = parseSpecialtyFlags(checklist);
    let specialtyResults: SpecialtyResult[] = [];
    if (specialtyFlags.elevation || specialtyFlags.proximity || specialtyFlags.pollution) {
      console.log(`[Session ${sessionId}] Running specialty checks:`, specialtyFlags);
      specialtyResults = await runSpecialtyChecks(
        address || url,
        model,
        specialtyFlags
      );
      console.log(`[Session ${sessionId}] Specialty checks completed: ${specialtyResults.length} results`);

      await supabase
        .from('evaluations')
        .update({ specialty_results: specialtyResults })
        .eq('id', sessionId);
    }

    // Step 4: Generate final accessibility summary
    await generateFinalSummary(sessionId, imageAnalysisResults, userNeeds, specialtyResults);

    console.log(`[Session ${sessionId}] Analysis completed successfully!`);

  } catch (err) {
    console.error(`[Session ${sessionId}] Processing error:`, err);
    await updateSessionStatus(sessionId, 'error', 'An error occurred during processing.');
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error('Error closing browser:', e);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Step 1: Generate Accessibility Checklist
// ---------------------------------------------------------------------------
async function generateAccessibilityChecklist(
  sessionId: string,
  userNeeds: string
): Promise<string> {
  console.log(`[Session ${sessionId}] Generating accessibility checklist...`);

  const prompt = `Based on these accessibility needs: "${userNeeds}", generate a concise list of architectural or housing features that would be problematic or serve as triggers. Respond strictly with a comma-separated list of features to look out for.
  At the end of it, generate a list of triggers that could cause the score to go down. Make this section named "TRIGGERS: ", make sure that they are common triggers.
  Make sure the triggers are simple.

  Finally, on a new line at the very end, output EXACTLY this format (include only the relevant ones, omit those that are not relevant):
  SPECIALTY_CHECKS: elevation, proximity, pollution

  - Include "elevation" if the user has mobility challenges (wheelchair, walker, difficulty with stairs/hills).
  - Include "proximity" if the user needs nearby services due to limited mobility or transportation dependence.
  - Include "pollution" if the user is sensitive to noise, light, or busy/overstimulating environments.
  `;

  const result = await model.generateContent(prompt);
  const checklist = result.response.text();

  // Save checklist to database
  await supabase
    .from('evaluations')
    .update({ accessibility_checklist: checklist })
    .eq('id', sessionId);

  console.log(`[Session ${sessionId}] Checklist: ${checklist}`);
  return checklist;
}

// ---------------------------------------------------------------------------
// Step 2: Scrape Property Images
// ---------------------------------------------------------------------------
async function scrapePropertyImages(
  sessionId: string,
  browser: puppeteer.Browser,
  address: string,
  url: string
): Promise<string[]> {
  console.log(`[Session ${sessionId}] Scraping property images...`);

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // Determine target URL (either provided or search for it)
  let targetUrl = url;
  if (!targetUrl && address) {
    targetUrl = await searchUrlFromAddress(address, page) as string;
    if (!targetUrl) {
      throw new Error('Could not find property URL from address');
    }
  }

  // Navigate to property page
  console.log(`[Session ${sessionId}] Loading: ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000)); // Wait for dynamic content

  // Extract images from page
  const html = await page.content();
  const $ = cheerio.load(html);
  const imagesSet = new Set<string>();

  // Extract Open Graph images
  $('meta[property="og:image"]').each((_, el) => {
    const content = $(el).attr('content');
    if (content) imagesSet.add(content);
  });

  // Extract Redfin-specific image URLs
  $('img').each((_, element) => {
    const src = $(element).attr('src');
    if (src && src.includes('redfin.com')) {
      const isPropertyImage =
        src.includes('genMid') ||
        src.includes('bigphoto') ||
        src.includes('mbpaddedwide');

      if (isPropertyImage) {
        imagesSet.add(src);
      }
    }
  });

  // Extract images from JavaScript content
  $('script').each((_, el) => {
    const content = $(el).html();
    if (content && content.includes('genBcs') && content.includes('ssl.cdn-redfin.com')) {
      const unicodeUrls =
        content.match(
          /https:\\u002F\\u002Fssl\.cdn-redfin\.com\\u002Fphoto\\u002F\d+\\u002Fbcsphoto\\u002F\d+\\u002F[a-zA-Z0-9_\.]+\.jpg/g
        ) || [];
      unicodeUrls.forEach(u => imagesSet.add(u.replace(/\\u002F/g, '/')));
    }
  });

  const allImages = Array.from(imagesSet).slice(0, 30); // Limit to 30 images
  console.log(`[Session ${sessionId}] Found ${allImages.length} images`);

  return allImages;
}

// ---------------------------------------------------------------------------
// Step 3: Analyze Images in Batches
// ---------------------------------------------------------------------------
async function analyzeImagesInBatches(
  sessionId: string,
  images: string[],
  checklist: string
): Promise<Array<{ image_url: string; trigger_found: string[] | null }>> {
  const BATCH_SIZE = 1;
  const BATCH_DELAY_MS = 1000;
  const accumulatedResults: Array<{ image_url: string; trigger_found: string[] | null }> = [];

  const totalBatches = Math.ceil(images.length / BATCH_SIZE);
  console.log(`[Session ${sessionId}] Processing ${images.length} images in ${totalBatches} batches...`);

  const analysisPrompt = `Analyze these images. Look for the following accessibility triggers: ${checklist}. 
  Return a STRICT JSON array of objects. Format: [{"url": "<image_url>", "trigger": "<describe trigger found, or 'None'>", "pixel_coordinates": <pixel coordinates if possible, if not put null>}]
  I want you to also make sure the identifiers are in groups. There is a list called TRIGGERS: above, I want you to use just those triggers and make the identifiers those. For the coordinates, make sure its an array of 2 numbers with it being number 1 x number 2.
  Can you also make it so there can be multiple triggers per image, with it being separated by a comma, only do this if needed
  `;

  for (let i = 0; i < images.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = images.slice(i, i + BATCH_SIZE);

    console.log(`[Session ${sessionId}] Processing batch ${batchNum}/${totalBatches}...`);

    try {
      const batchResults = await analyzeSingleBatch(batch, analysisPrompt);
      accumulatedResults.push(...batchResults);

      // Update database with accumulated results
      await supabase
        .from('evaluations')
        .update({ image_results: accumulatedResults })
        .eq('id', sessionId);

      console.log(`[Session ${sessionId}] Batch ${batchNum} completed and saved`);
    } catch (error) {
      console.error(`[Session ${sessionId}] Batch ${batchNum} failed:`, error);
      // Continue with next batch even if this one fails
    }

    // Delay between batches to prevent API rate limiting
    if (batchNum < totalBatches) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  return accumulatedResults;
}

// ---------------------------------------------------------------------------
// Helper: Analyze Single Batch of Images
// ---------------------------------------------------------------------------
async function analyzeSingleBatch(
  imageUrls: string[],
  prompt: string
): Promise<Array<{ image_url: string; trigger_found: string[] | null, pixel_coordinates: string | null }>> {
  const aiResponseStr = await imageinGroups(imageUrls, prompt);

  if (!aiResponseStr) {
    throw new Error('No response from AI');
  }

  const aiResponseJSON = JSON.parse(aiResponseStr as string);
  const cleanedAnalysis = aiResponseJSON.analysis
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim();

  const parsedResults = JSON.parse(cleanedAnalysis);

  // Map AI results to our format
  return parsedResults.map((result: any, index: number) => ({
    image_url: imageUrls[index],
    trigger_found: result.trigger !== 'None'
      ? result.trigger.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0)
      : null,
    pixel_coordinates: result.pixel_coordinates ? result.pixel_coordinates : null
  }));
}

// ---------------------------------------------------------------------------
// Step 4: Generate Final Summary
// ---------------------------------------------------------------------------
async function generateFinalSummary(
  sessionId: string,
  imageResults: Array<{ image_url: string; trigger_found: string[] | null }>,
  userNeeds: string,
  specialtyResults: SpecialtyResult[] = []
): Promise<void> {
  console.log(`[Session ${sessionId}] Generating final summary...`);

  // Extract all issues found (flatten arrays)
  const issuesFound = imageResults
    .map(img => img.trigger_found)
    .filter((trigger): trigger is string[] => trigger !== null)
    .flat();

  const issuesSummary = issuesFound.length > 0
    ? issuesFound.join(', ')
    : 'No major issues found.';

  // Build specialty findings section
  const specialtySection = specialtyResults.length > 0
    ? `\n\nAdditionally, the following surrounding-area assessments were performed:\n${specialtyResults.map(r => `**${r.category}**: ${r.findings}`).join('\n\n')}`
    : '';

  // Generate summary with AI
  const summaryPrompt = `A house was analyzed for these user needs: ${userNeeds}. 
  The following issues were found in the photos: ${issuesSummary}.${specialtySection}
  Write a 2-3 sentence overall summary of the accessibility of this house, incorporating both the property issues and any surrounding-area findings. Rate it with a score from 0-100.
  Return strictly JSON: {"score": 85, "summary": "..."}`;

  const summaryResult = await model.generateContent(summaryPrompt);
  const rawSummaryText = summaryResult.response.text();

  // Parse AI response
  const finalSummary = parseSummaryResponse(rawSummaryText);

  console.log(`\n[Session ${sessionId}] *** FINAL SUMMARY ***`);
  console.log(`Score: ${finalSummary.score}`);
  console.log(`Summary: ${finalSummary.summary}`);
  console.log(`***************************\n`);

  // Update database with final results
  await supabase
    .from('evaluations')
    .update({
      final_score: finalSummary.score,
      final_summary: finalSummary.summary,
      status: 'completed'
    })
    .eq('id', sessionId);
}

// ---------------------------------------------------------------------------
// Helper: Parse Summary Response
// ---------------------------------------------------------------------------
function parseSummaryResponse(rawText: string): { score: number | null; summary: string } {
  try {
    // Clean up markdown formatting
    let cleanText = rawText;
    if (cleanText.startsWith('```json')) cleanText = cleanText.substring(7);
    if (cleanText.startsWith('```')) cleanText = cleanText.substring(3);
    if (cleanText.endsWith('```')) cleanText = cleanText.substring(0, cleanText.length - 3);

    return JSON.parse(cleanText.trim());
  } catch (error) {
    console.warn('Failed to parse summary JSON, using fallback. Raw:', rawText);
    return {
      score: null,
      summary: rawText
    };
  }
}

// ---------------------------------------------------------------------------
// Helper: Update Session Status
// ---------------------------------------------------------------------------
async function updateSessionStatus(
  sessionId: string,
  status: string,
  summary?: string
): Promise<void> {
  const updates: any = { status };
  if (summary) {
    updates.final_summary = summary;
  }

  await supabase
    .from('evaluations')
    .update(updates)
    .eq('id', sessionId);
}

// ---------------------------------------------------------------------------
// API: Get Images from Property URL or Address
// ---------------------------------------------------------------------------
app.post('/api/images', async (req, res) => {
  const url = req.body.url;
  const address = req.body.address;

  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    let targetUrl = url;

    if (!targetUrl && address) {
      targetUrl = await searchUrlFromAddress(address, page);

      if (!targetUrl) {
        return res.status(404).json({ error: "Cant get url from address" });
      }
    }

    await page.goto(targetUrl as string, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    const html = await page.content();
    const cheerioTime = cheerio.load(html);

    const images = new Set();

    cheerioTime('meta[property="og:image"]').each((_, el) => {
      const content = cheerioTime(el).attr('content');
      if (content) images.add(content);
    });

    // initial lookthrough on main
    cheerioTime('img').each((_i, element) => {
      const src = cheerioTime(element).attr('src');

      if (src && src.includes("redfin.com")) {
        if (src.includes("genMid")) {
          images.add(src);
        } else if (src.includes("bigphoto")) {
          images.add(src);
        } else if (src.includes("mbpaddedwide")) {
          images.add(src);
        }
      }
    });

    cheerioTime('script').each((_, el) => {
      const content = cheerioTime(el).html();

      if (content && content.includes('genBcs') && content.includes('ssl.cdn-redfin.com')) {
        const unicodeUrls = content.match(/https:\\u002F\\u002Fssl\.cdn-redfin\.com\\u002Fphoto\\u002F\d+\\u002Fbcsphoto\\u002F\d+\\u002F[a-zA-Z0-9_\.]+\.jpg/g) || [];
        unicodeUrls.forEach(u => images.add(u.replace(/\\u002F/g, '/')));
      }
    });

    const targetId = Array.from(images)[0].split("/")[6];

    const imagesArray = Array.from(images).filter((v) => v.split("/")[6] == targetId);
    console.log(imagesArray.length);
    console.log(images)

    res.json({ imagesArray, targetUrl });

  } catch (err) {
    console.log("Scraping error:", err);
    res.status(500).json({ error: 'Failed to scrape images' });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})

// ---------------------------------------------------------------------------
// API: Generate List from User Needs
// ---------------------------------------------------------------------------
app.post('/api/listfromlist/', async (_req, res) => {
  const userNeeds: string = _req.body.userNeeds;

  const prompt = `You are an accessibility expert analyzing house listing photos.
  The resident has the following accessibility needs: ${userNeeds} Taking in the list of disabilities, accesibility requirements, or other, make a new list of things to look for in a house that would not accomadate to these.
  In other words, you are finding list features in a house that either are ideal or not ideal for someone with the list disability or accessibility needs/requirements

  Analyze all provided images and return these details from this JSON object:
  {
  "score": <number 0-100, where 100 is fully accessible>,
  "risks": [
      { "issue": "<what the problem is>", "severity": "<low|medium|high>" }
  ],
  "summary": "<2-3 sentence overall description of accessibility for this person, simple english since our user target is likely older.>"
  }

  Only return only info that aligns with the topics in the JSON object above. Keep responses short please.`;

  const parts: any[] = [
    {
      text: prompt
    }
  ];

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts }]
    })

    const response = result.response.text();

    res.json({ analysis: response })
  } catch (err) {
    console.log("Error with generating list of things to look out for: ", err)
  }
})

// ---------------------------------------------------------------------------
// API: Get Triggers from Image
// ---------------------------------------------------------------------------
app.post('/api/triggersFromImmage/', async (_req, res) => {
  const prompt = "asdf"; // Placeholder from original code
  const result = await generalImageCall(_req, prompt);
  res.json(JSON.parse(result as string));
})

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
})

export default app;




