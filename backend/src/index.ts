import express from 'express'
import cors from 'cors';
import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import "dotenv/config";
import generalImageCall from './geminiCall.ts';

import { GoogleGenerativeAI } from "@google/generative-ai";



const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;




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


// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// Right now, grabbing more images, need to chekc that they are right, but they for the most part are or should be
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!1
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

    //was trying to get content too soon so (could make it lower (probably))
    await page.goto(targetUrl as string, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    const html = await page.content();
    const cheerioTime = cheerio.load(html);

    const images = new Set();

    const isRedfin = (targetUrl as string).includes('redfin.com');



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
    res.json({ imagesArray  });

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
  "summary": "<2-3 sentence overall description of accessibility for this person>"
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
  
  const result = await generalImageCall(_req);
  res.json(JSON.parse(result));

})


app.listen(PORT, () => {
  console.log("muving")
})

export default app
