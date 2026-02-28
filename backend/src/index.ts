import express from 'express'
import cors from 'cors';
import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import "dotenv/config";

import { GoogleGenerativeAI } from "@google/generative-ai";



const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001




const AI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = AI.getGenerativeModel({ model: "gemini-2.5-flash" });
/*
app.get('/', (_req, res) => {
  res.send('Hello Express!')
})

app.get('/api/users/:id', (_req, res) => {
  res.json({ id: _req.params.id })
})

app.get('/api/posts/:postId/comments/:commentId', (_req, res) => {
  res.json({ postId: _req.params.postId, commentId: _req.params.commentId })
})
   */


app.post('/api/images', async (req, res) => {
  const url = req.body.url;



  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });


    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');


    //was trying to get content too soon so (could make it lower (probably))
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    const html = await page.content();
    const cheerioTime = cheerio.load(html);

    const images: string[] = [];

    cheerioTime('img').each((_i, element) => {


      const src = cheerioTime(element).attr('src');

      if (src && !images.includes(src)) {
        images.push(src);
      }
    });


    res.json({ images });

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


app.post('/api/triggersFromImmage/', async (_req, res) => {
  const images = _req.body.images;


  const prompt = "Analyze ts";
  const parts: any[] = [
    {
      text: prompt
    }
  ];

  try {


    // NOTHING IS LIMITING IMAGES RN, MAY NOT BE AN ISSUE OF LIKE AN IMAGE AMOUNT BUT
    // MAY BE A TIME THING (maybe idk if it will be but might be cause vercel )
    for (let i = 0; i < images.length; i++) {
      const imageRes = await fetch(images[i]);
      if (!imageRes.ok) continue;


      const arrayBuffer = await imageRes.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString("base64");
      const mimeType = imageRes.headers.get("content-type") || "image/jpeg";

      parts.push({
        inlineData: { data: base64Data, mimeType }
      });

    }




  }

  catch (err) {
    console.log("Error w/ gemini", err);
    res.status(500).json({ error: "Gemini failed" })
  }


  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts }]
    })

    const response = result.response.text();

    res.json({ analysis: response })
  }

  catch (err) {
    console.log("aslk;djfasdkjga", err)
  }





})


app.listen(PORT, () => {
  console.log("muving")
})

export default app
