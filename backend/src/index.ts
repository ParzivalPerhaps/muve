import express from 'express'
import cors from 'cors';
import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import "dotenv/config";
import { generalImageCall, imageinGroups } from './geminiCall.ts';
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
        }

        else {

          const text = cheerioTime(el).text().trim();
          if (text.includes('redfin.com')) {
            resultUrl = 'https://' + text;
          }

          else {
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
          }

          else {
            resultUrl = href;
          }
          return false;
        }
      });
    }
    console.log("++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++=\n" + resultUrl + "\n" + "++++++++++++++++++++++++++++");

    return resultUrl;
  }
  catch (err) {
    console.error("Error searching for address:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// NEW: Background Job Orchestrator
// ---------------------------------------------------------------------------
app.post('/api/analyzeProperty', async (req, res) => {
  const { address, userNeeds, url } = req.body;

  if (!userNeeds || (!address && !url)) {
    return res.status(400).json({ error: "Missing required fields: userNeeds and either address or url." });
  }

  try {
    // 1. Create a session in Supabase immediately
    const { data: sessionData, error: sessionError } = await supabase
      .from('sessions')
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
// NEW: Endpoint to check session status (Great for polling from frontend/test)
// ---------------------------------------------------------------------------
app.get('/api/session/:id', async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return res.status(404).json({ error: "Session not found" });
  res.json(data);
});

// ---------------------------------------------------------------------------
// NEW: The Core Background Processor
// ---------------------------------------------------------------------------
async function processPropertyBackground(sessionId: string, address: string, url: string, userNeeds: string) {
  let browser = null;
  let allImages: string[] = [];
  let accumulatedImageResults: any[] = []; 

  try {
    console.log(`[Session ${sessionId}] Starting analysis...`);
    
    // STEP 1: Generate Checklist
    const listPrompt = `Based on these accessibility needs: "${userNeeds}", generate a concise list of architectural or housing features that would be problematic or serve as triggers. Respond strictly with a comma-separated list of features to look out for.`;
    const listResult = await model.generateContent(listPrompt);
    const checklist = listResult.response.text();
    console.log(`[Session ${sessionId}] Checklist generated.`);

    await supabase.from('sessions').update({ accessibility_checklist: checklist }).eq('id', sessionId);

    // STEP 2: Scrape Images
    console.log(`[Session ${sessionId}] Launching browser...`);
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    let targetUrl = url;
    if (!targetUrl && address) {
      targetUrl = await searchUrlFromAddress(address, page) as string;
    }

    console.log(`[Session ${sessionId}] Scraping images from ${targetUrl}...`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    
    const html = await page.content();
    const cheerioTime = cheerio.load(html);
    const imagesSet = new Set<string>();

    cheerioTime('meta[property="og:image"]').each((_, el) => {
      const content = cheerioTime(el).attr('content');
      if (content) imagesSet.add(content);
    });

    cheerioTime('img').each((_i, element) => {
      const src = cheerioTime(element).attr('src');
      if (src && src.includes("redfin.com")) {
        if (src.includes("genMid") || src.includes("bigphoto") || src.includes("mbpaddedwide")) {
          imagesSet.add(src);
        }
      }
    });
    
    cheerioTime('script').each((_, el) => {
      const content = cheerioTime(el).html();
      if (content && content.includes('genBcs') && content.includes('ssl.cdn-redfin.com')) {
        const unicodeUrls = content.match(/https:\\u002F\\u002Fssl\.cdn-redfin\.com\\u002Fphoto\\u002F\d+\\u002Fbcsphoto\\u002F\d+\\u002F[a-zA-Z0-9_\.]+\.jpg/g) || [];
        unicodeUrls.forEach(u => imagesSet.add(u.replace(/\\u002F/g, '/')));
      }
    });

    allImages = Array.from(imagesSet).slice(0, 30); 
    console.log(`[Session ${sessionId}] Found ${allImages.length} images. Closing browser.`);
    await browser.close();

    // STEP 3: Process Images in Batches
    const groupSize = 5;
    const prompt = `Analyze these images. Look for the following accessibility triggers: ${checklist}. 
    Return a STRICT JSON array of objects. Format: [{"url": "<image_url>", "trigger": "<describe trigger found, or 'None'>"}]`;

    for (let i = 0; i < allImages.length; i += groupSize) {
      const batchNum = Math.floor(i / groupSize) + 1;
      const totalBatches = Math.ceil(allImages.length / groupSize);
      console.log(`[Session ${sessionId}] Processing batch ${batchNum} of ${totalBatches}...`);

      const batch = allImages.slice(i, i + groupSize);
      
      const aiResponseStr = await imageinGroups(batch, prompt);
      
      if (!aiResponseStr) {
        console.log(`[Session ${sessionId}] Batch ${batchNum} failed. Skipping.`);
        continue;
      }

      const aiResponseJSON = JSON.parse(aiResponseStr as string);
      let cleanedAnalysis = aiResponseJSON.analysis.replace(/```json/g, '').replace(/```/g, '').trim();
      
      try {
        const parsedResults = JSON.parse(cleanedAnalysis);
        const mappedBatch = parsedResults.map((result: any, index: number) => ({
          image_url: batch[index], 
          trigger_found: result.trigger !== 'None' ? result.trigger : null
        }));

        accumulatedImageResults = [...accumulatedImageResults, ...mappedBatch];

        await supabase
          .from('sessions')
          .update({ image_results: accumulatedImageResults })
          .eq('id', sessionId);
          
        console.log(`[Session ${sessionId}] Batch ${batchNum} saved to DB.`);
      } catch (parseError) {
        console.error(`[Session ${sessionId}] Failed to parse Gemini JSON for batch ${batchNum}:`, cleanedAnalysis);
      }

      // Add a 2-second delay between batches to prevent Gemini from hanging
      if (batchNum < totalBatches) {
        await new Promise(r => setTimeout(r, 2000)); 
      }
    }

    // STEP 4: Final Summary
    console.log(`[Session ${sessionId}] Generating final summary...`);
    const issuesOnly = accumulatedImageResults
        .map(img => img.trigger_found)
        .filter(trigger => trigger !== null);
        
    const foundIssues = issuesOnly.length > 0 ? issuesOnly.join(', ') : "No major issues found.";

    const summaryPrompt = `A house was analyzed for these user needs: ${userNeeds}. The following issues were found in the photos: ${foundIssues}. 
    Write a 2-3 sentence overall summary of the accessibility of this house. Rate it with a score from 0-100.
    Return strictly JSON: {"score": 85, "summary": "..."}`;

    const summaryResult = await model.generateContent(summaryPrompt);
    const rawSummaryText = summaryResult.response.text();
    
    let finalSummaryJSON;
    try {
        let cleanText = rawSummaryText;
        if (cleanText.startsWith('```json')) cleanText = cleanText.substring(7);
        if (cleanText.startsWith('```')) cleanText = cleanText.substring(3);
        if (cleanText.endsWith('```')) cleanText = cleanText.substring(0, cleanText.length - 3);
        
        finalSummaryJSON = JSON.parse(cleanText.trim());
    } 
    
    catch (e) {
        console.log(`[Session ${sessionId}] Summary parsing failed. Using fallback. Raw Output:`, rawSummaryText);
        finalSummaryJSON = { score: null, summary: rawSummaryText };
    }

    console.log(`\n[Session ${sessionId}] *** FINAL SUMMARY ***`);
    console.log(`Score: ${finalSummaryJSON.score}`);
    console.log(`Summary: ${finalSummaryJSON.summary}`);
    console.log(`***************************\n`);

    console.log(`[Session ${sessionId}] Summary complete. Marking as finished.`);
    await supabase.from('sessions').update({
      final_score: finalSummaryJSON.score,
      final_summary: finalSummaryJSON.summary,
      status: 'completed'
    }).eq('id', sessionId);

  } catch (err) {
    console.error(`[Session ${sessionId}] Background processing error:`, err);
    await supabase.from('sessions').update({ status: 'error', final_summary: 'An error occurred during processing.' }).eq('id', sessionId);
  } finally {
    if (browser) {
      try { await browser.close(); } catch(e) {}
    }
  }
}


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

    // initital lookthrough on main
    cheerioTime('img').each((_i, element) => {
      const src = cheerioTime(element).attr('src');

      if (src && src.includes("redfin.com")) {
        if (src.includes("genMid")) {
          images.add(src);
        }
        else if (src.includes("bigphoto")) {
          images.add(src);
        }
        else if (src.includes("mbpaddedwide")) {
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
    
    const imagesArray = Array.from(images);
    console.log(imagesArray.length);
    console.log(images)

    res.json({ imagesArray, targetUrl  });

  }
  catch (err) {
    console.log("Scraping error:", err);
    res.status(500).json({ error: 'Failed to scrape images' });
  }
  finally {
    if (browser) {
      await browser.close();
    }
  }
})


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
  }
  catch (err) {
    console.log("Error with generating list of things to look out for: ", err)
  }
})

app.post('/api/triggersFromImmage/', async (_req, res) => {
  const prompt = "asdf"; // Placeholder from original code
  const result = await generalImageCall(_req, prompt);
  res.json(JSON.parse(result as string));
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
})

export default app;
