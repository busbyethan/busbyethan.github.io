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

// Render only paragraphs, lists, bold, and emphasis using DOM text nodes. Model text
// is never HTML, and generated Markdown links are not converted to live links.
function inlineText(container,text) {
  let end=0;
  for(const match of text.matchAll(/\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g)) {
    container.append(document.createTextNode(text.slice(end,match.index)));
    const formatted=document.createElement(match[1]?'strong':'em');formatted.textContent=match[1]||match[2];container.append(formatted);
    end=match.index+match[0].length;
  }
  container.append(document.createTextNode(text.slice(end)));
}
function answerBody(container,text) {
  let paragraph=[],list=null;
  function flush(){if(paragraph.length){const p=document.createElement('p');inlineText(p,paragraph.join('\n'));container.append(p);paragraph=[];}}
  for(const line of text.split('\n')) {
    if(!line.trim()){flush();list=null;continue;}
    const item=line.match(/^\s*([-*•]|\d+\.)\s+(.+)$/);
    if(item){flush();const tag=/\d/.test(item[1])?'OL':'UL';
      if(!list||list.tagName!==tag){list=document.createElement(tag.toLowerCase());container.append(list);}
      const li=document.createElement('li');inlineText(li,item[2]);list.append(li);
    }else{list=null;paragraph.push(line.replace(/^#{1,6}\s+/,''));}
  }
  flush();
}
function citationLabel(citation) {
  // This filename was confirmed in the owner's live test of the uploaded PDF.
  const name=String(citation.title||'').replace(/^Uploaded document:\s*/i,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  if(name==='argyleetal2025testingtheoriespdf')return {
    title:'Testing Theories of Political Persuasion Using Artificial Intelligence',
    url:'https://doi.org/10.1073/pnas.2412815122'
  };
  return citation;
}
// Render external text safely, including AI output and visitor questions.
function addMessage(text, role = 'assistant', citations = []) {
  const message = document.createElement('div');
  message.className = `message ${role}`;
  if(role==='assistant')answerBody(message,text);
  else{const body=document.createElement('p');body.textContent=text;message.append(body);}
  const seen=new Set();
  (Array.isArray(citations)?citations:[]).forEach(rawCitation => {
    try {
      const citation=citationLabel(rawCitation);
      const url = new URL(citation.url);
      if (!['https:','http:'].includes(url.protocol)||seen.has(url.href)) return;
      seen.add(url.href);
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
let chatHistory=[];
const liveGuide=!!window.RESEARCH_CONCIERGE_ENDPOINT;
const initialPrompts=[
  {label:'Simulated samples',question:'AI simulated human samples'},
  {label:'Persuasion',question:'political persuasion'},
  {label:'Democratic skills',question:'What democratic skills is SAIL studying?'}
];
function setPrompts(prompts) {
  const container=$('.prompts');if(!container)return;
  container.replaceChildren();
  prompts.slice(0,3).forEach(item=>{
    const label=typeof item==='string'?item:item.label;
    const question=typeof item==='string'?item:item.question;
    if(typeof question!=='string'||!question.trim()||question.length>1200)return;
    const button=document.createElement('button');button.type='button';button.dataset.prompt=question;button.textContent=label;container.append(button);
  });
}
function introduction() {
  return liveGuide?'Ask about the research, then follow up. I’ll use the approved source collection and link to the material behind my answers.':'This local preview finds papers in the reviewed bibliography. Try AI and human samples, persuasion, or listening. The AI guide is configured for ethanbusby.com.';
}
if($('#chat-form')) {
  $('#chat-mode').textContent=liveGuide?'AI research guide':'Local paper finder';
  $('#chat-messages').replaceChildren();addMessage(introduction());setPrompts(initialPrompts);
  if(!liveGuide)$('#chat-note').textContent='Local preview: questions are matched to saved publication summaries in your browser. On ethanbusby.com, the guide uses the connected AI service and approved research collection.';
}
async function ask(question) {
  if (pending || !question.trim()) return;
  pending = true;
  addMessage(question.trim(),'user');
  $('#chat-status').textContent = liveGuide?'Searching the approved research collection…':'Finding relevant papers…';
  $('.chat').setAttribute('aria-busy','true');
  const buttons = $$('#chat-form button, .prompts button, #chat-reset');
  buttons.forEach(button => button.disabled = true);
  $('#chat-input').disabled=true;
  try {
    let result;
    // Live AI is opt-in. Otherwise the UI explicitly labels this as a local paper finder.
    const outgoing=[...chatHistory.slice(-8),{role:'user',content:question.trim()}];
    if (liveGuide) {
      const response = await fetch(window.RESEARCH_CONCIERGE_ENDPOINT, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({messages:outgoing}),
        signal:AbortSignal.timeout(65000)
      });
      result = await response.json().catch(()=>{throw new Error('The research guide returned an unreadable response. Please try again or browse Publications.');});
      if (!response.ok) throw new Error(typeof result.error==='string'?result.error:'The research guide is unavailable. Please try again or browse Publications.');
    } else result = await localFinder(question);
    if(typeof result.answer!=='string'||!result.answer.trim())throw new Error('No answer was returned. Please try again or browse Publications.');
    addMessage(result.answer,'assistant',result.citations || []);
    chatHistory=[...outgoing,{role:'assistant',content:result.answer.slice(0,3500)}].slice(-8);
    if(liveGuide&&Array.isArray(result.suggested_questions))setPrompts(result.suggested_questions);
    $('#chat-status').textContent = '';
  } catch(error) {
    $('#chat-status').textContent = error.name==='TimeoutError'?'The research guide took too long to respond. Please try again or browse Publications.':error.message;
    $('#chat-input').value=question;
  } finally {
    pending = false;buttons.forEach(button => button.disabled = false);
    $('#chat-input').disabled=false;$('.chat').setAttribute('aria-busy','false');
  }
}
$('#chat-form')?.addEventListener('submit', event => {
  event.preventDefault();
  const input = $('#chat-input');
  if (!pending && input.value.trim()) { const question = input.value; input.value = ''; ask(question); }
});
$('.prompts')?.addEventListener('click',event=>{
  const button=event.target.closest('button[data-prompt]');if(button&&!pending)ask(button.dataset.prompt);
});
$('#chat-reset')?.addEventListener('click',()=>{
  if(pending)return;chatHistory=[];$('#chat-messages').replaceChildren();addMessage(introduction());
  setPrompts(initialPrompts);$('#chat-input').value='';$('#chat-status').textContent='New conversation started.';$('#chat-input').focus();
});

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
