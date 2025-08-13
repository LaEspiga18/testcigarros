'use strict';

const CONFIG_KEY = 'qc_cfg';
const STATE_KEY  = 'qc_state';

const cfgDefault = { dailyQuota: 9 };

const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2,'0');

function todayLocalDateStr(d=new Date()){
  const y = d.getFullYear();
  const m = pad(d.getMonth()+1);
  const day = pad(d.getDate());
  return `${y}-${m}-${day}`;
}

// ISO week id (Monday-based)
function isoWeekId(date){
  const copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (copy.getUTCDay() + 6) % 7; // 0..6 Mon..Sun
  copy.setUTCDate(copy.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(copy.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((copy - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay()+6)%7)) / 7);
  const weekYear = copy.getUTCFullYear();
  return `${weekYear}-W${String(week).padStart(2,'0')}`;
}

function loadCfg(){ try{return JSON.parse(localStorage.getItem(CONFIG_KEY))||cfgDefault;}catch(e){return cfgDefault;} }
function saveCfg(c){ localStorage.setItem(CONFIG_KEY, JSON.stringify(c)); }
function loadState(){ try{return JSON.parse(localStorage.getItem(STATE_KEY))||null;}catch(e){return null;} }
function saveState(s){ localStorage.setItem(STATE_KEY, JSON.stringify(s)); }

function initState(){
  const now = new Date();
  return {
    lastDate: todayLocalDateStr(now),
    todayCount: 0,
    weekBank: 0,
    weekId: isoWeekId(now)
  };
}

// Accumulate for each missed day (unlogged days = consumed 0)
function rolloverIfNeeded(){
  const cfg = loadCfg();
  let st = loadState() || initState();
  const now = new Date();
  const todayStr = todayLocalDateStr(now);

  if (st.lastDate === todayStr) return st;

  let cursor = new Date(st.lastDate + 'T00:00:00');
  const end = new Date(todayStr + 'T00:00:00');

  while (cursor < end){
    const isFirstDay = (todayLocalDateStr(cursor) === st.lastDate);
    const consumed = isFirstDay ? st.todayCount : 0;
    const leftover = Math.max(0, cfg.dailyQuota - consumed);
    st.weekBank += leftover;

    const next = new Date(cursor); next.setDate(cursor.getDate() + 1);
    // if crossing to Monday, reset bank AFTER adding Sunday's leftover
    if (next.getDay() === 1){
      st.weekBank = 0;
      st.weekId = isoWeekId(next);
    }
    cursor = next;
  }

  st.todayCount = 0;
  st.lastDate = todayStr;
  saveState(st);
  return st;
}

function updateUI(){
  const cfg = loadCfg();
  const st = rolloverIfNeeded();

  const q = $('#quota'), c = $('#count'), r = $('#remaining'), b = $('#bank');
  if (!q || !c || !r || !b) return;

  q.textContent = cfg.dailyQuota;
  c.textContent = st.todayCount;
  r.textContent = Math.max(0, cfg.dailyQuota - st.todayCount);
  b.textContent = st.weekBank;

  const p = Math.min(1, st.todayCount / cfg.dailyQuota);
  const bar = $('#bar'); if (bar){ bar.value = Math.round(p*100); bar.max = 100; }

  renderTimers();
}

function addOne(){
  const cfg = loadCfg();
  const st = rolloverIfNeeded();
  if (st.todayCount >= cfg.dailyQuota){ shake('#count'); return; }
  st.todayCount += 1;
  saveState(st);
  updateUI();
}

function removeOne(){
  const st = rolloverIfNeeded();
  if (st.todayCount <= 0) return;
  st.todayCount -= 1;
  saveState(st);
  updateUI();
}

function closeDayNow(){
  let st = loadState() || initState();
  const cfg = loadCfg();
  const leftover = Math.max(0, cfg.dailyQuota - st.todayCount);
  st.weekBank += leftover;
  st.todayCount = 0;
  st.lastDate = todayLocalDateStr(new Date());
  saveState(st);
  updateUI();
}

function resetWeek(){
  let st = loadState() || initState();
  st.weekBank = 0;
  st.weekId = isoWeekId(new Date());
  saveState(st);
  updateUI();
}

function saveSettings(){
  const el = $('#quotaInput');
  const v = Number(el && el.value ? el.value : 9);
  const cfg = loadCfg();
  cfg.dailyQuota = Math.max(1, Math.min(99, v));
  saveCfg(cfg);
  updateUI();
}

// Timers
let timerInterval = null;
function pad2(n){ return String(n).padStart(2,'0'); }
function msToHMS(ms){
  const total = Math.max(0, Math.floor(ms/1000));
  const h = Math.floor(total/3600);
  const m = Math.floor((total%3600)/60);
  const s = total%60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}
function nextMidnight(){
  const n = new Date();
  const t = new Date(n);
  t.setHours(24,0,0,0);
  return t;
}
function nextMonday00(){
  const n = new Date();
  const day = n.getDay(); // 0=Sun..6=Sat
  const add = (8 - (day === 0 ? 7 : day)) % 7; // days to Monday
  const d = new Date(n);
  d.setDate(n.getDate() + add);
  d.setHours(0,0,0,0);
  return d;
}
function renderTimers(){
  if (timerInterval) clearInterval(timerInterval);
  function tick(){
    const msDay = nextMidnight() - new Date();
    const dayT = $('#dayTimer'); if (dayT) dayT.textContent = msToHMS(msDay);
    const msWeek = nextMonday00() - new Date();
    const weekT = $('#weekTimer'); if (weekT) weekT.textContent = msToHMS(msWeek);
    const st = loadState();
    const todayStr = todayLocalDateStr(new Date());
    if (st && st.lastDate !== todayStr){
      rolloverIfNeeded();
      updateUI();
    }
  }
  tick();
  timerInterval = setInterval(tick, 1000);
}

function shake(sel){
  const el = $(sel); if (!el) return;
  el.style.transform = 'scale(1.05)';
  setTimeout(()=>{ el.style.transform='scale(1)'; }, 120);
}

// SW + install
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault(); deferredPrompt=e;
  const b = $('#install'); if (b) b.style.display='inline-flex';
});
async function doInstall(){
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt=null;
  const b = $('#install'); if (b) b.style.display='none';
}

window.addEventListener('load', ()=>{
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js'); }
});

window.addEventListener('DOMContentLoaded', ()=>{
  const bindings = [
    ['#plus', addOne], ['#minus', removeOne],
    ['#closeDay', closeDayNow], ['#resetWeek', resetWeek],
    ['#saveCfg', saveSettings], ['#install', doInstall]
  ];
  for (const [sel, fn] of bindings){
    const el = $(sel);
    if (el) el.addEventListener('click', fn);
  }
  const qi = $('#quotaInput'); if (qi) qi.value = loadCfg().dailyQuota;
  updateUI();
});
