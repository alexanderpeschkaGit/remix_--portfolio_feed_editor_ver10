export const escapeHtml = (unsafe: string) => {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// Convert plain text URLs into clickable HTML links. Keeps text escaped to avoid XSS.
export const linkifyToHtml = (text: string) => {
  if (!text) return '';
  const escaped = escapeHtml(text);

  // Match URLs like http(s)://..., www... and simple domain/paths
  const urlRegex = /(https?:\/\/[\w\-@:%._\+~#=]{2,}|www\.[\w\-@:%._\+~#=]{2,}|[\w\-]+\.[a-z]{2,}\/[^\s<]*)/gi;

  return escaped.replace(urlRegex, (match) => {
    let href = match;
    if (!/^https?:\/\//i.test(href)) {
      href = 'https://' + href;
    }
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${match}</a>`;
  });
};

export default linkifyToHtml;
