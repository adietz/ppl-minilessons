/* Pilot Minis: a swipe feed of private pilot mini-lessons with spaced quiz cards. */
(function(){
'use strict';
const D = window.PPL_DATA;
const CARDS = D.cards;
const CARD = {}; CARDS.forEach((c,i)=>{ CARD[c.id] = Object.assign({idx:i}, c); });
const QUIZ = {}; const QBYCARD = {};
D.quiz.forEach(q=>{ QUIZ[q.id]=q; (QBYCARD[q.card] = QBYCARD[q.card] || []).push(q); });

/* ---------- spacing settings ----------
   Time is measured in lesson cards viewed ("steps"), not clock time, so the feed
   itself is the spacing schedule. A missed question comes back after MISS_GAP
   steps; each correct answer moves it up a box and pushes it further out. */
const MISS_GAP = 3;
const INTERVALS = [3, 10, 25, 50, 100, 200];   // steps until due again, by box
const QUIZ_EVERY = [3, 4];                    // a quiz after every 3-4 lesson cards
const KEY = 'pplmini.v1';

/* ---------- state ---------- */
function freshState(){
  return { v:1, seen:{}, seenOrder:[], step:0, q:{}, answered:0, correct:0,
           streak:{last:null,count:0,best:0}, days:{}, theme:'auto', created:Date.now() };
}
let S;
try { S = JSON.parse(localStorage.getItem(KEY)) || freshState(); } catch(e){ S = freshState(); }
S = Object.assign(freshState(), S);
// drop any ids that no longer exist (content updates)
S.seenOrder = S.seenOrder.filter(id=>CARD[id]);
function save(){ try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e){} }

/* ---------- helpers ---------- */
const $ = s=>document.querySelector(s);
const feedEl = $('#feed');
const rnd = (a,b)=>a + Math.floor(Math.random()*(b-a+1));
const today = (d=new Date())=> d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
function yesterday(){ const d=new Date(); d.setDate(d.getDate()-1); return today(d); }
function esc(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function minutes(words){ const m = words/200; return m < 1.25 ? '1 min read' : '2 min read'; }
function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }

/* ---------- theme ---------- */
function applyTheme(){ if (S.theme==='auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', S.theme); }
applyTheme();

/* ---------- feed planning ---------- */
const items = [];            // planned feed items, in order
const inFeed = new Set();    // lesson ids already planned (seen OR queued ahead of the reader)
const queuedQ = new Set();   // quiz ids planned but not yet answered
let lessonsSinceQuiz = 0, gap = rnd(...QUIZ_EVERY), lessonsPlanned = 0;
const recentQ = [];
let pendingReview = null;
let newInARow = 0;
let newFromRecent = false;

function plannedClock(){ // the step count the reader will be at when they reach the next planned item
  let ahead = 0; for (let i = activeIdx+1; i < items.length; i++) if (items[i].type==='lesson' && !S.seen[items[i].id]) ahead++;
  return S.step + ahead;
}
function nextNewLesson(){ return CARDS.find(c=>!inFeed.has(c.id)); }

/* Quiz selection. Only questions whose source card is already seen, or is
   planned earlier in the feed (so the reader must pass it first), are eligible. */
function pickQuiz(opts={}){
  const clock = plannedClock();
  const lastLesson = [...items].reverse().find(it=>it.type==='lesson');
  const eligible = D.quiz.filter(q=> inFeed.has(q.card) && !queuedQ.has(q.id) && !recentQ.includes(q.id));
  if (!eligible.length) return null;
  // 1) missed questions that are due come back first
  const due = eligible.filter(q=>S.q[q.id] && S.q[q.id].due <= clock)
                      .sort((a,b)=> (S.q[a.id].box - S.q[b.id].box) || (S.q[a.id].due - S.q[b.id].due));
  const dueMissed = due.filter(q=>S.q[q.id].box === 0);
  if (dueMissed.length) return {q:dueMissed[0], review:true};
  // 2) new questions, never asked; prefer cards read a little while ago (not the one just read)
  let fresh = eligible.filter(q=>!S.q[q.id]);
  const notJustRead = fresh.filter(q=>!lastLesson || q.card !== lastLesson.id);
  if (notJustRead.length) fresh = notJustRead;
  // after two new questions in a row, a due (previously correct) review gets the next slot
  if (due.length && (!fresh.length || newInARow >= 2)) return {q:due[0], review:true};
  if (fresh.length){
    // one question per card at a time: favor cards with no asked question yet
    const askedCards = new Set(Object.keys(S.q).map(id=>QUIZ[id] && QUIZ[id].card));
    const pool0 = fresh.filter(q=>!askedCards.has(q.card));
    // alternate between the most recently read cards (excluding the one just read)
    // and the oldest unquizzed ones, so new reading and older reading both get checked
    newFromRecent = !newFromRecent;
    const dir = newFromRecent ? -1 : 1;
    const pool = (pool0.length ? pool0 : fresh).sort((a,b)=> dir*(order(a.card) - order(b.card))).slice(0,3);
    return {q: pool[Math.floor(Math.random()*pool.length)], review:false};
  }
  // 3) nothing due or new: only when forced (end of course), take the soonest due
  if (opts.force){
    const any = eligible.filter(q=>S.q[q.id]).sort((a,b)=>(S.q[a.id].due - S.q[b.id].due));
    if (any.length) return {q:any[0], review:true};
  }
  return null;
}
function order(cardId){ const i = S.seenOrder.indexOf(cardId); return i < 0 ? 1e6 + CARD[cardId].idx : i; }

function planNext(){
  if (lessonsSinceQuiz >= gap){
    const p = pickQuiz();
    if (p){ lessonsSinceQuiz = 0; gap = rnd(...QUIZ_EVERY); return addQuiz(p); }
  }
  const c = nextNewLesson();
  if (c){ inFeed.add(c.id); lessonsSinceQuiz++; lessonsPlanned++; return items.push({type:'lesson', id:c.id}) - 1; }
  // Course finished: review mode. Re-show a weak card, then quiz it.
  if (pendingReview){ const p = pendingReview; pendingReview = null; return addQuiz(p); }
  const p = pickQuiz({force:true});
  if (p){ pendingReview = p; queuedQ.add(p.q.id); return items.push({type:'lesson', id:p.q.card, revisit:true}) - 1; }
  if (!items.length || items[items.length-1].type!=='done') return items.push({type:'done'}) - 1;
  return -1;
}
function addQuiz(p){
  newInARow = p.review ? 0 : newInARow + 1;
  queuedQ.add(p.q.id); recentQ.push(p.q.id); if (recentQ.length>1) recentQ.shift();
  return items.push({type:'quiz', qid:p.q.id, review:p.review, opts:shuffle([0,1,2])}) - 1;
}

/* ---------- rendering ---------- */
function render(i){
  const it = items[i]; const el = document.createElement('section');
  el.className = 'item'; el.dataset.i = i;
  if (it.type==='intro') el.innerHTML = introHTML();
  else if (it.type==='done') { el.classList.add('short'); el.innerHTML = doneHTML(); }
  else if (it.type==='lesson') el.innerHTML = lessonHTML(CARD[it.id], it.revisit);
  else if (it.type==='quiz') { el.classList.add('short'); el.innerHTML = quizHTML(it); wireQuiz(el, it); }
  el.addEventListener('click', e=>{
    const b = e.target.closest('[data-next]'); if (b){ e.preventDefault(); go(+1); }
    const s = e.target.closest('[data-src]'); if (s){ e.preventDefault(); openCard(s.dataset.src); }
    const z = e.target.closest('[data-zoom]'); if (z){ e.preventDefault(); openZoom(z.dataset.zoom); }
  });
  feedEl.appendChild(el); observer.observe(el);
  it.el = el;
}
/* Lesson body with the course figures placed after the section they belong to. */
function bodyWithFigs(c){
  if (!c.figs || !c.figs.length) return c.body;
  const parts = c.body.split('<h3>');
  const secs = parts[0] === '' && parts.length > 1 ? parts.slice(1).map(p=>'<h3>'+p) : [c.body];
  return secs.map((sec,i)=> sec + c.figs.filter(f=>f.pos===i || (i===secs.length-1 && f.pos>=secs.length)).map(figHTML).join('')).join('');
}
function figHTML(f){
  return `<figure class="fig"><button class="fig-panel" data-zoom="${f.src}" aria-label="Enlarge Figure ${f.num}">
    <img src="${f.src}" width="${f.w}" height="${f.h}" alt="Figure ${f.num}" loading="lazy" decoding="async"></button>
    <figcaption><b>Figure ${f.num}.</b> ${f.caption} <span class="zoom-hint">Tap to enlarge</span></figcaption></figure>`;
}
function lessonHTML(c, revisit){
  const n = c.idx+1;
  return `<article class="card lesson">
    <div class="kicker"><span class="chip">Day ${c.day}</span><span>${esc(c.dayTitle)}</span></div>
    ${revisit?'<div class="kicker"><span class="chip">↺ Review</span></div>':''}
    <h2>${esc(c.title)}</h2>
    <div class="read">${bodyWithFigs(c)}</div>
    <div class="card-foot"><span>${minutes(c.words)} · ${n}/${CARDS.length}</span><button class="next-link" data-next>Next ↓</button></div>
  </article>`;
}
function quizHTML(it){
  const q = QUIZ[it.qid], c = CARD[q.card];
  const letters = 'ABC';
  return `<article class="card quiz">
    <div class="kicker"><span class="chip">${it.review ? '↺ Review' : 'Quick check'}</span><span>From Day ${c.day}: ${esc(c.title)}</span></div>
    <div class="qstem">${esc(q.q)}</div>
    <div class="opts">${it.opts.map((o,k)=>`<button class="opt" data-o="${o}"><span class="letter">${letters[k]}</span><span>${esc(q.opts[o])}</span></button>`).join('')}</div>
    <div class="vslot"></div>
  </article>`;
}
function wireQuiz(el, it){
  el.querySelectorAll('.opt').forEach(b=> b.addEventListener('click', ()=> answer(el, it, +b.dataset.o)));
}
function answer(el, it, o){
  if (it.answered) return;
  it.answered = true; queuedQ.delete(it.qid);
  const q = QUIZ[it.qid], ok = o === q.ans;
  el.querySelector('.opts').classList.add('done');
  el.querySelectorAll('.opt').forEach(b=>{
    const v = +b.dataset.o; b.disabled = true;
    if (v === q.ans) b.classList.add('correct'); else if (v === o) b.classList.add('wrong');
  });
  // schedule
  const r = S.q[q.id] || {box:0, n:0, right:0, hist:[]};
  r.n++; if (ok) r.right++;
  r.box = ok ? Math.min((S.q[q.id] ? r.box+1 : 1), INTERVALS.length-1) : 0;
  const wait = ok ? INTERVALS[r.box] : MISS_GAP;
  r.due = S.step + wait; r.last = Date.now();
  r.hist = (r.hist||[]).concat([[Date.now(), ok?1:0]]).slice(-10);
  S.q[q.id] = r; S.answered++; if (ok) S.correct++;
  touchStreak(); save(); hud();
  const c = CARD[q.card];
  const v = document.createElement('div');
  v.className = 'verdict ' + (ok?'ok':'bad');
  v.innerHTML = `<div class="v">${ok ? '✓ Correct' : '✗ Not quite'}</div>
    <div>${ok ? '' : `Answer: <b>${esc(q.opts[q.ans])}</b>. `}${esc(q.why)}</div>
    <button class="src" data-src="${c.id}">📖 Reread: ${esc(c.title)} <span style="opacity:.7">(Day ${c.day})</span></button>
    <div class="sched">${ok ? `You'll see this again in about ${wait} cards.` : `This will come back in a few cards.`}</div>
    <div class="card-foot"><span></span><button class="next-link" data-next>Next ↓</button></div>`;
  el.querySelector('.vslot').appendChild(v);
  if (navigator.vibrate) navigator.vibrate(ok ? 15 : [30,40,30]);
}
function statsHTML(){
  const acc = S.answered ? Math.round(100*S.correct/S.answered) + '%' : '–';
  return `<div class="stats"><div class="stat"><b>${S.seenOrder.length}/${CARDS.length}</b><span>lessons</span></div>
    <div class="stat"><b>${S.streak.count}</b><span>day streak</span></div>
    <div class="stat"><b>${acc}</b><span>quiz accuracy</span></div></div>`;
}
function introHTML(){
  const first = !S.seenOrder.length;
  return `<article class="card hero">
    <div class="big">✈️</div>
    <h2>${first ? 'Swap the scroll for a skill' : 'Welcome back'}</h2>
    <p>${first ? 'Each card is a one or two minute private pilot lesson. Every few cards, a one-question check on something you have already read.' : 'Pick up where you left off. Missed questions come back first.'}</p>
    ${first ? '' : statsHTML()}
    <div class="swipe-hint">Swipe up to start ↑</div>
  </article>`;
}
function doneHTML(){
  return `<article class="card hero"><div class="big">🎉</div><h2>You've read every card</h2>
    <p>Keep swiping later for review. Questions come back on their schedule.</p>${statsHTML()}</article>`;
}

/* ---------- reader position ---------- */
let activeIdx = 0;
const observer = new IntersectionObserver(entries=>{
  entries.forEach(e=>{ if (e.isIntersecting) setActive(+e.target.dataset.i); });
}, {root: feedEl, rootMargin: '-45% 0px -45% 0px', threshold: 0});

function setActive(i){
  if (i === activeIdx && items[i].activated) return;
  activeIdx = i; items[i].activated = true;
  // Mark this card and anything scrolled past on the way here as seen.
  let changed = false;
  for (let k = 0; k <= i; k++){
    const it = items[k];
    if (it.type==='lesson' && !S.seen[it.id]){ S.seen[it.id] = Date.now(); S.seenOrder.push(it.id); S.step++; changed = true; }
  }
  if (changed){ touchStreak(); save(); hud(); }
  ensureAhead();
}
function ensureAhead(){
  while (items.length - 1 < activeIdx + 3){
    const n = planNext(); if (n < 0) break; render(n);
    if (items[n].type==='done') break;
  }
}
function go(dir){
  const target = items[Math.max(0, Math.min(items.length-1, activeIdx + dir))];
  if (!target || !target.el) return;
  // tall card: if the bottom of the current card is still below the fold, page down first
  const cur = items[activeIdx].el;
  if (dir > 0 && cur){
    const r = cur.getBoundingClientRect(), vh = feedEl.clientHeight;
    if (r.bottom > vh + 40){ feedEl.scrollBy({top: vh*0.8}); return; }
  }
  feedEl.scrollTo({top: target.el.offsetTop});
}

/* ---------- streak and HUD ---------- */
function touchStreak(){
  const t = today();
  S.days[t] = (S.days[t]||0) + 0; // mark active day
  if (S.streak.last === t) return;
  S.streak.count = (S.streak.last === yesterday()) ? S.streak.count + 1 : 1;
  S.streak.last = t; S.streak.best = Math.max(S.streak.best, S.streak.count);
}
function hud(){
  $('#hudSeen').textContent = S.seenOrder.length; $('#hudTotal').textContent = CARDS.length;
  $('#hudBar').style.width = (100*S.seenOrder.length/CARDS.length) + '%';
  const live = S.streak.last === today() || S.streak.last === yesterday();
  $('#hudStreak').textContent = live ? S.streak.count : 0;
}

/* ---------- sheets: source card and menu ---------- */
function openSheet(html){
  $('#sheetBody').innerHTML = html; $('#sheet').hidden = false; $('#backdrop').hidden = false; $('#sheet').scrollTop = 0;
}
function closeSheet(){ $('#sheet').hidden = true; $('#backdrop').hidden = true; }
function openCard(id){
  const c = CARD[id];
  openSheet(`<div class="kicker"><span class="chip">Day ${c.day}</span><span>${esc(c.dayTitle)}</span></div>
    <h2>${esc(c.title)}</h2><div class="read">${bodyWithFigs(c)}</div>`);
}
function openMenu(){
  const acc = S.answered ? Math.round(100*S.correct/S.answered) + '%' : '–';
  const dueNow = Object.values(S.q).filter(r=>r.due <= S.step).length;
  const missed = Object.values(S.q).filter(r=>r.box===0).length;
  const th = S.theme;
  openSheet(`<h2>Pilot Minis</h2>
    <div class="menu-row"><span>Lessons read</span><b>${S.seenOrder.length} / ${CARDS.length}</b></div>
    <div class="menu-row"><span>Quiz answers</span><b>${S.answered} (${acc} right)</b></div>
    <div class="menu-row"><span>Due for review</span><b>${dueNow}</b></div>
    <div class="menu-row"><span>Currently missed</span><b>${missed}</b></div>
    <div class="menu-row"><span>Streak (best)</span><b>${S.streak.count} (${S.streak.best})</b></div>
    <div class="menu-row"><span>Theme</span><div class="seg" id="themeSeg">
      ${['auto','light','dark'].map(t=>`<button data-t="${t}" class="${th===t?'on':''}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('')}</div></div>
    <div class="menu-row"><span>Start over</span><button class="btn danger" id="resetBtn">Reset progress</button></div>
    <p class="small">Content: ${CARDS.length} mini-lessons and ${D.quiz.length} quiz questions drawn from a 45-day private pilot ground school. Study aid only; your instructor, the POH, and current FAA publications are the authority. Progress is stored only on this device.</p>`);
  $('#themeSeg').addEventListener('click', e=>{ const b=e.target.closest('[data-t]'); if(!b) return; S.theme=b.dataset.t; save(); applyTheme(); openMenu(); });
  $('#resetBtn').addEventListener('click', ()=>{ if (confirm('Erase all progress on this device?')){ localStorage.removeItem(KEY); location.reload(); } });
}
function openZoom(src){
  const box = $('#zoom'); box.querySelector('img').src = src; box.classList.remove('big'); box.hidden = false;
}
$('#zoom').addEventListener('click', e=>{
  const box = $('#zoom');
  if (e.target.closest('.zoom-close')) { box.hidden = true; return; }
  if (e.target.tagName === 'IMG') box.classList.toggle('big');
});
$('#sheetBody').addEventListener('click', e=>{ const z = e.target.closest('[data-zoom]'); if (z){ e.preventDefault(); openZoom(z.dataset.zoom); } });
$('#menuBtn').addEventListener('click', openMenu);
$('#sheetClose').addEventListener('click', closeSheet);
$('#backdrop').addEventListener('click', closeSheet);
$('#nextBtn').addEventListener('click', ()=>go(+1));
document.addEventListener('keydown', e=>{
  if (!$('#zoom').hidden){ if (e.key==='Escape') $('#zoom').hidden = true; return; }
  if (!$('#sheet').hidden){ if (e.key==='Escape') closeSheet(); return; }
  if (['ArrowDown','PageDown','j',' '].includes(e.key)){ e.preventDefault(); go(+1); }
  else if (['ArrowUp','PageUp','k'].includes(e.key)){ e.preventDefault(); go(-1); }
  else if (/^[1-3abc]$/i.test(e.key)){ const it=items[activeIdx]; if (it && it.type==='quiz' && it.el){ const k='123abc'.indexOf(e.key.toLowerCase())%3; const b=it.el.querySelectorAll('.opt')[k]; b && b.click(); } }
});

/* ---------- start ---------- */
// Already-read cards count as in the feed (eligible for quizzes).
S.seenOrder.forEach(id=>inFeed.add(id));
items.push({type:'intro'}); render(0); items[0].activated = true;
// A returning reader with reviews due starts with one right away.
if (S.seenOrder.length){ const p = pickQuiz(); if (p && p.review){ render(addQuiz(p)); } }
lessonsSinceQuiz = 0;
ensureAhead(); hud();

// test hook (used by the screenshot script)
window.__ppl = { S, items, go, answer:(k)=>{ const it=items[activeIdx]; it.el.querySelectorAll('.opt')[k].click(); } };

if ('serviceWorker' in navigator && location.protocol !== 'file:'){
  window.addEventListener('load', ()=> navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
})();
