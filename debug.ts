async function run() {
  const res = await fetch("https://flickr-html.pages.dev/flickr_1024/001_Born Naked-Tuntenball-For_54746493210.jpg");
  console.log(res.status);
}
run();
