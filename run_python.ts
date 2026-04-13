import { execSync } from 'child_process';
try {
  const output = execSync('python3 scrape_flickr_html.py', { encoding: 'utf-8' });
  console.log(output);
} catch (e) {
  console.error(e.stdout);
  console.error(e.stderr);
}
