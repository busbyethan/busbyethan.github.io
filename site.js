import { paintings } from './gallery-data.js';
// Optional browser behavior; each page and its bibliography are ordinary HTML.
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const palette = $('#palette');
try {
  const saved = localStorage.getItem('busby-palette');
  if (['charcoal','ink','stone'].includes(saved)) {
    document.documentElement.dataset.palette = saved;
    palette.value = saved;
  }
} catch { /* Storage may be unavailable. */ }
palette?.addEventListener('change', () => {
  document.documentElement.dataset.palette = palette.value;
  try { localStorage.setItem('busby-palette', palette.value); } catch { /* Optional preference. */ }
});

// Tabs support mouse, touch, and the standard arrow/Home/End keyboard commands.
const tabs = $$('[role="tab"]');
function selectTab(tab) {
  tabs.forEach(item => {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
  });
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', event => {
    let next;
    if (['ArrowRight','ArrowDown'].includes(event.key)) next = (index + 1) % tabs.length;
    if (['ArrowLeft','ArrowUp'].includes(event.key)) next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) { event.preventDefault(); selectTab(tabs[next]); tabs[next].focus(); }
  });
});
const filters = $('#publication-filters');
function filterPapers() {
  const query = $('#publication-search').value.trim().toLowerCase();
  const topic = $('#publication-topic').value;
  const kind = $('#publication-kind').value;
  const year = $('#publication-year').value;
  let count = 0;
  $$('.paper').forEach(paper => {
    const show = paper.dataset.title.includes(query)
      && (topic === 'all' || paper.dataset.topics.split(' ').includes(topic))
      && (kind === 'all' || paper.dataset.kind === kind)
      && (year === 'all' || paper.dataset.year === year);
    paper.hidden = !show;
    if (show) count++;
  });
  $('#results-summary').textContent = `${count} ${count === 1 ? 'publication' : 'publications'}`;
  $('#empty-state').hidden = count > 0;
}
filters?.addEventListener('submit', event => event.preventDefault());
filters?.addEventListener('input', filterPapers);
filters?.addEventListener('change', filterPapers);
filters?.addEventListener('reset', () => setTimeout(filterPapers, 0));

// Render external text safely, including AI output and visitor questions.
function addMessage(text, role = 'assistant', citations = []) {
  const message = document.createElement('div');
  message.className = `message ${role}`;
  const body = document.createElement('p');
  body.textContent = text;
  message.append(body);
  citations.forEach(citation => {
    try {
      const url = new URL(citation.url);
      if (!['https:','http:'].includes(url.protocol)) return;
      const link = document.createElement('a');
      link.className = 'citation';
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = `${citation.title} ↗`;
      message.append(link);
    } catch { /* Skip invalid citation URLs. */ }
  });
  $('#chat-messages').append(message);
  $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight;
}
let registryPromise;
async function localFinder(question) {
  registryPromise ||= fetch('/publications.json').then(response => {
    if (!response.ok) throw new Error('Bibliography unavailable');
    return response.json();
  });
  const papers = (await registryPromise).filter(p => p.status === 'approved');
  const ignored = new Set(['which','what','does','about','research','papers','using','with','this','that','have','from','help','ethan','busby','the','and','for','are','how','his','can']);
  const terms = question.toLowerCase().match(/[a-z]+/g)?.filter(t => t.length > 2 && !ignored.has(t)) || [];
  if (/\bai\b|language model/i.test(question)) terms.push('language','ai');
  const ranked = papers.map(p => {
    const title = p.title.toLowerCase();
    const text = [p.summary,...p.topics,...p.methods].join(' ').toLowerCase();
    return {paper:p, score:terms.reduce((n,t) => n+(title.includes(t)?3:0)+(text.includes(t)?1:0),0)};
  }).filter(p => p.score > 0).sort((a,b) => b.score-a.score).slice(0,3);
  if (!ranked.length) return {answer:'I couldn’t find a clear match in the reviewed bibliography. Try a topic such as simulated samples, persuasion, listening, or extremism. The publications page has the full reviewed list.',citations:[]};
  return {answer:`Here are papers matching your question. These are saved bibliography summaries, not an AI-generated answer.\n\n${ranked.map(({paper:p})=>`${p.title} (${p.yearLabel || p.year})\n${p.summary}`).join('\n\n')}`,citations:ranked.map(({paper:p})=>({title:p.title,url:p.doi||p.url||`${location.origin}/publications/#${p.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}`}))};
}
let pending = false;
async function ask(question) {
  if (pending || !question.trim()) return;
  pending = true;
  addMessage(question.trim(),'user');
  $('#chat-status').textContent = 'Finding relevant papers…';
  const buttons = $$('#chat-form button, .prompts button');
  buttons.forEach(button => button.disabled = true);
  try {
    let result;
    // Live AI is opt-in. Otherwise the UI explicitly labels this as a local paper finder.
    if (window.RESEARCH_CONCIERGE_ENDPOINT) {
      const response = await fetch(window.RESEARCH_CONCIERGE_ENDPOINT, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({messages:[{role:'user',content:question.trim()}]}),
        signal:AbortSignal.timeout(30000)
      });
      if (!response.ok) throw new Error('Research guide unavailable');
      result = await response.json();
      $('#chat-mode').textContent = 'AI research guide';
    } else result = await localFinder(question);
    addMessage(result.answer || result.output_text || 'No answer was returned.','assistant',result.citations || []);
    $('#chat-status').textContent = '';
  } catch {
    $('#chat-status').textContent = 'The research guide is unavailable. Please try again or browse Publications.';
  } finally { pending = false; buttons.forEach(button => button.disabled = false); }
}
$('#chat-form')?.addEventListener('submit', event => {
  event.preventDefault();
  const input = $('#chat-input');
  if (!pending && input.value.trim()) { const question = input.value; input.value = ''; ask(question); }
});
$$('[data-prompt]').forEach(button => button.addEventListener('click', () => ask(button.dataset.prompt)));

// A finite collection of generated parodies, shuffled locally. No visitor-side API calls.
const galleryImage = $('#parody-image');
if (galleryImage) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0;
  let bag = [];
  let timer;
  let playing = false;
  const stage = $('.parody-gallery');
  function show(index, announce = false) {
    current = (index + paintings.length) % paintings.length;
    const painting = paintings[current];
    galleryImage.src = `/assets/parodies/${painting.file}`;
    galleryImage.alt = painting.alt;
    $('#parody-title').textContent = painting.title;
    $('#parody-caption').textContent = painting.caption;
    $('#parody-count').textContent = `${current+1} of ${paintings.length}`;
    if (announce) $('#gallery-status').textContent = painting.title + ' AI-generated parody.';
  }
  function randomNext(announce = false) {
    if (!bag.length) {
      bag = paintings.map((_, index) => index).filter(index => index !== current);
      for (let i = bag.length-1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i+1));
        [bag[i],bag[j]] = [bag[j],bag[i]];
      }
    }
    show(bag.pop(), announce);
  }
  function setPlaying(value) {
    clearInterval(timer);
    playing = value;
    $('#gallery-play').textContent = value ? 'Pause rotation' : 'Start rotation';
    $('#gallery-play').setAttribute('aria-pressed', String(value));
    $('#gallery-status').textContent = value ? 'Shuffled rotation every 14 seconds. Pause to linger on a painting.' : 'Rotation paused. Choose a painting or start again.';
    if (value) timer = setInterval(() => {
      // Do not change an image while the visitor is interacting with the gallery.
      if (!document.hidden && !stage.matches(':hover') && !stage.contains(document.activeElement)) randomNext();
    }, 14000);
  }
  function manual(index) { setPlaying(false); bag = []; show(index, true); }
  $('#gallery-prev').addEventListener('click', () => manual(current-1));
  $('#gallery-next').addEventListener('click', () => manual(current+1));
  $('#gallery-random').addEventListener('click', () => { setPlaying(false); randomNext(true); });
  $('#gallery-play').addEventListener('click', () => setPlaying(!playing));
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) setPlaying(false); });
  show(Math.floor(Math.random() * paintings.length));
  setPlaying(!reducedMotion.matches);
}
