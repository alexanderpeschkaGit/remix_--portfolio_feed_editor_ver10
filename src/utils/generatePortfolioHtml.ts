import { PROJECT_STATES } from '../constants';
import {
  buildPortfolioHead,
  buildPortfolioStyles,
  buildPortfolioDataScript,
  buildPortfolioBody,
  buildPostCards
} from './portfolioHtmlParts';
import { buildPortfolioRuntimeCore } from './portfolioHtmlRuntimeCore';
import { buildPortfolioRuntimeLightbox } from './portfolioHtmlRuntimeLightbox';
export { EDITOR_FAVICON_SVG, EDITOR_FAVICON_DATA_URI } from './portfolioHtmlParts';

// Pure HTML template generator extracted from App.tsx (deep-refactor batch 2).
// Section templates live in portfolioHtmlParts.ts + portfolioHtmlRuntimeCore.ts +
// portfolioHtmlRuntimeLightbox.ts (batch 15b). Published output is byte-identical.

export const generateHTML = (posts: any[], title: string, subtitle: string, bio: string = '', forPreview = false, publicDomain: string) => {
    console.log('Generating HTML, posts:', posts);
    const domainFromState = publicDomain;
    const baseUrl = domainFromState.startsWith('http') ? domainFromState : `https://${domainFromState}`;

    const cards = buildPostCards(posts, { baseUrl, forPreview });

    const filterBar = `<div class="filter-bar">
      <button class="filter-btn active" data-filter="all">Alle</button>
      ${PROJECT_STATES.map(s => `<button class="filter-btn" data-filter="${s.id}" style="--active-bg: ${s.bright}; --active-muted: ${s.muted}">${s.label}</button>`).join('')}
    </div>`;

    return (
      buildPortfolioHead(title) +
      buildPortfolioStyles() +
      buildPortfolioDataScript(title, subtitle, bio, posts, baseUrl) +
      buildPortfolioRuntimeCore() +
      buildPortfolioRuntimeLightbox() +
      buildPortfolioBody(title, subtitle, bio, filterBar, cards)
    );
  };
