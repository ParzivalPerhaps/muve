import express from 'express'

const app = express()

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
      }});

    
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



app.get('/api/triggersFromImmage/', (_req, res) => {



})


app.listen(PORT, () => {
  console.log("muving")
})

export default app
