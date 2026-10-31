// Public service address only. Authentication stays in Cloudflare's server secrets.
// Local previews use the clearly labelled paper finder; the live domain uses AI.
if (['ethanbusby.com','www.ethanbusby.com'].includes(location.hostname)) {
  window.RESEARCH_CONCIERGE_ENDPOINT = 'https://ethan-research-guide.ethan-busby.workers.dev/chat';
}
