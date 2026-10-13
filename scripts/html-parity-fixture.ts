/**
 * html-parity-fixture.ts — deterministic HTML-parity fixture for generatePortfolioHtml refactor.
 * Usage: npx tsx scripts/html-parity-fixture.ts <outputDir>
 * Mocks Date.toISOString so output is byte-stable between runs.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { generateHTML } from '../src/utils/generatePortfolioHtml';

const realIso = Date.prototype.toISOString;
Date.prototype.toISOString = function () {
  return '2026-10-13T00:00:00.000Z';
};

const posts = [
  {
    id: 'post-1',
    title: 'Sunset & Äther – Ölfarben',
    description: 'Ein Bild mit Umlauten: für über Größe – mehr Text.',
    states: ['state-1'],
    type: 'image',
    hidden: false,
    url: '/media/sunset-large.jpg',
    link: '/media/sunset-large.jpg',
    image: '/media/sunset-large.jpg',
    image_thumb: '/media/sunset-thumb.jpg',
    mergedMedia: [
      {
        type: 'image',
        url: '/media/sunset-large.jpg',
        image: '/media/sunset-large.jpg',
        image_thumb: '/media/sunset-thumb.jpg',
        image_1k: '/media/sunset-1k.jpg',
      },
      {
        type: 'video',
        url: '/media/clip.mp4',
        image: '/media/clip-poster.jpg',
      },
    ],
  },
  {
    id: 'post-2',
    title: 'YouTube Testvideo',
    description: '',
    states: [],
    type: 'youtube',
    hidden: false,
    youtubeId: 'dQw4w9WgXcQ',
    youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
    url: 'https://youtu.be/dQw4w9WgXcQ',
    mergedMedia: [],
  },
  {
    id: 'post-3',
    title: 'Bunny Video',
    description: 'Bunny-Einbettung',
    states: ['state-2'],
    type: 'bunny',
    hidden: false,
    videoId: 'abc123',
    libraryId: '123456',
    url: 'https://iframe.mediadelivery.net/embed/123456/abc123',
    image: '/media/bunny-thumb.jpg',
    mergedMedia: [
      {
        type: 'bunny',
        videoId: 'abc123',
        libraryId: '123456',
        url: 'https://iframe.mediadelivery.net/embed/123456/abc123',
        image: '/media/bunny-thumb.jpg',
        image_thumb: '/media/bunny-thumb.jpg',
      },
    ],
  },
  {
    id: 'post-4',
    title: 'Versteckt',
    description: '',
    states: [],
    type: 'image',
    hidden: true,
    url: '',
    image: '',
    mergedMedia: [],
  },
];

const outDir = process.argv[2] || 'tmp/parity';
mkdirSync(outDir, { recursive: true });

const write = (name: string, content: string) => writeFileSync(join(outDir, name), content, { encoding: 'utf8' });

write('html-preview.html', generateHTML(posts, 'Test Title – Ü', 'Test Subtitle', 'Bio mit <b>HTML</b> & Umlauten', true, ''));
write('html-publish.html', generateHTML(posts, 'Test Title – Ü', 'Test Subtitle', 'Bio mit <b>HTML</b> & Umlauten', false, 'https://cdn.example.com'));
write('html-empty.html', generateHTML([], 'Empty', '', '', false, 'https://cdn.example.com'));

Date.prototype.toISOString = realIso;
console.log('parity fixtures written to', outDir);
