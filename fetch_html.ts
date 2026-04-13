import https from 'https';
https.get('https://flickr-html.pages.dev/', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('Length:', data.length);
    const cards = data.split('<div class="card">').length - 1;
    console.log('Cards:', cards);
    const h3s = (data.match(/<h3/gi) || []).length;
    console.log('H3s:', h3s);
    const imgs = (data.match(/<img/gi) || []).length;
    console.log('Imgs:', imgs);
  });
});