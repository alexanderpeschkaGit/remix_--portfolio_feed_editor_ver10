import https from 'https';

https.get('https://pub-85bb68a84f3b4ba6b512b3d165c96497.r2.dev/index.html', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    const match = data.match(/<script id="portfolio-data" type="application\/json">([\s\S]*?)<\/script>/);
    if (match) {
      console.log("FOUND JSON LENGTH:", match[1].length);
      console.log("START OF JSON:", match[1].substring(0, 100));
    } else {
      console.log("NO SCRIPT TAG FOUND");
    }
  });
}).on('error', (err) => {
  console.log("Error: " + err.message);
});
