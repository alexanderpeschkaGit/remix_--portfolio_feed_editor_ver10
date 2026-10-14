import assert from 'node:assert/strict';
import test from 'node:test';
import { generateHTML } from '../src/utils/generatePortfolioHtml.ts';
import { PROJECT_STATES } from '../src/constants.ts';

const mockPosts = [
  {
    id: 'post-1',
    title: 'Selected Artwork',
    description: 'A test piece in the selected category.',
    states: ['selected'],
    type: 'image',
    hidden: false,
    url: '/media/test1.jpg',
    image: '/media/test1.jpg',
    mergedMedia: [
      {
        type: 'image',
        url: '/media/test1.jpg',
        image: '/media/test1.jpg',
      },
    ],
  },
  {
    id: 'post-2',
    title: 'Business Clip',
    description: 'Video showcase',
    states: ['business'],
    type: 'video',
    hidden: false,
    url: '/media/test2.mp4',
    image: '/media/test2-thumb.jpg',
    mergedMedia: [],
  },
  {
    id: 'post-3',
    title: 'Excluded from All',
    description: 'Hidden from main feed by -all state tag',
    states: ['-all'],
    type: 'image',
    hidden: false,
    url: '/media/test3.jpg',
    image: '/media/test3.jpg',
    mergedMedia: [],
  },
];

test('generateHTML produces valid HTML with filter bar and all project state buttons', () => {
  const html = generateHTML(
    mockPosts,
    'Portfolio Test',
    'Subtitle',
    'Artist bio text',
    false,
    'https://cdn.example.com'
  );

  assert.ok(html.includes('<div class="filter-bar">'), 'HTML must contain filter bar container');
  assert.ok(html.includes('data-filter="all"'), 'Filter bar must include "all" button');
  assert.ok(html.includes('data-filter="selected"'), 'Filter bar must include "selected" button');

  for (const state of PROJECT_STATES) {
    assert.ok(
      html.includes(`data-filter="${state.id}"`),
      `Filter bar must include button for state "${state.id}" (${state.label})`
    );
  }
});

test('generateHTML runtime script is syntactically valid JavaScript without hyphenated identifier errors', () => {
  const html = generateHTML(
    mockPosts,
    'Portfolio Test',
    'Subtitle',
    'Artist bio text',
    false,
    'https://cdn.example.com'
  );

  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch, 'Generated HTML must contain a runtime <script> tag');

  const scriptContent = scriptMatch[1];
  assert.ok(!scriptContent.includes('your-r2-bucketEl'), 'Script must not contain invalid your-r2-bucketEl identifier');
  assert.ok(!scriptContent.includes('window.your-r2-bucket'), 'Script must not contain invalid window.your-r2-bucket expression');
  assert.ok(scriptContent.includes('window.portfolioData'), 'Script must use window.portfolioData');

  // Verify that JavaScript engine can parse the script without syntax errors
  assert.doesNotThrow(() => {
    new Function(scriptContent);
  }, 'Runtime script must be syntactically valid JavaScript');
});

test('generateHTML in preview mode produces valid script syntax', () => {
  const html = generateHTML(
    mockPosts,
    'Preview Portfolio',
    'Subtitle',
    'Bio',
    true,
    ''
  );

  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch, 'Preview HTML must contain a runtime <script> tag');

  assert.doesNotThrow(() => {
    new Function(scriptMatch[1]);
  }, 'Preview runtime script must be syntactically valid JavaScript');
});
