const CONFIG_KEY = 'qc_cfg';
const STATE_KEY  = 'qc_state';

// Default config
const cfgDefault = { dailyQuota: 9 };

// Helpers
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2,'0');

function todayLocalDateStr(d=new Date()){
  // YYYY-MM-DD in local time
  const y = d.getFullYear();
  const m = pad(d.getMonth()+1);
  const day = pad(d.getDate());
  return `${y}-${m}-${day}`;
}

// ISO week calc (Monday-based)
function isoWeekId(date){
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // 0..6 Mon..Sun
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(),0,4));
  const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay()+6)%7)) / 7);
  const weekYear = d.getUTCFullYear();
  return `${weekYear}-W${String(week).padStart(2,'0')}`;
}

// Load/save
function loadCfg(){ try{return JSON.parse(localStorage.getItem(CONFIG_KEY))||cfgDefault;}catch{return cfgDefault;} }
function saveCfg(c){ localStorage.setItem(CONFIG_KEY, JSON.stringify(c)); }
function loadState(){ try{return JSON.parse(localStorage.getItem(STATE_KEY))||null;}catch{return null;} }
function saveState(s){ localStorage.setItem(STATE_KEY, JSON.stringify(s)); }

function initState(){
  const cfg = loadCfg();
  const now = new Date();
  return {
    lastDate: todayLocalDateStr(now),
    todayCount: 0,
    weekBank: 0,
    weekId: isoWeekId(now),
    history: {} // optional future use
  };
}


function rolloverIfNeeded(){
  const cfg = loadCfg();
  let st = loadState() || initState();
  const now = new Date();
  const todayStr = todayLocalDateStr(now);

  if (st.lastDate === todayStr) return st;

  // Iterate day by day from the day recorded in st.lastDate up to yesterday
  let cursor = new Date(st.lastDate + 'T00:00:00'); // local midnight of lastDate
  const end = new Date(todayStr + 'T00:00:00');     // local midnight of today

  while (cursor < end){
    // Compute leftover for this 'cursor' day
    const isFirstDay = todayLocalDateStr(cursor) === st.lastDate;
    const consumed = isFirstDay ? st.todayCount : 0; // days no registrados -> consumo 0
    const leftover = Math.max(0, cfg.dailyQuota - consumed);

    // Add leftover to current week's bank
    st.weekBank += leftover;

    // If next day is Monday, reset bank AFTER adding Sunday's leftover
    const next = new Date(cursor); next.setDate(cursor.getDate() + 1);
    if (next.getDay() === 1){ // Monday (0=Sun,1=Mon,...)
      st.weekBank = 0;
      // update weekId to new ISO week
      st.weekId = isoWeekId(next);
    }

    // Advance one day
    cursor = next;
  }

  // After rolling days, reset today's counter to 0 and stamp lastDate
  st.todayCount = 0;
  st.lastDate = todayStr;

  saveState(st);
  return st;
}

  // Carry leftover from the last recorded day only (conservador para no inflar hucha)
  const leftover = Math.max(0, loadCfg().dailyQuota - st.todayCount);
  st.weekBank += leftover;

  // Reset today counter
  st.todayCount = 0;
  st.lastDate = todayStr;

  saveState(st);
  return st;
}

function updateUI(){
  const cfg = loadCfg();
  const st = rolloverIfNeeded();

  $('#quota').textContent = cfg.dailyQuota;
  $('#count').textContent = st.todayCount;
  $('#remaining').textContent = Math.max(0, cfg.dailyQuota - st.todayCount);
  $('#bank').textContent = st.weekBank;

  const p = Math.min(1, st.todayCount / cfg.dailyQuota);
  $('#bar').value = Math.round(p*100);
  $('#bar').max = 100;

  // Next reset timers
  renderTimers();
}

function addOne(){
  const cfg = loadCfg();
  const st = rolloverIfNeeded();
  if (st.todayCount >= cfg.dailyQuota) { shake('#count'); return; }
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
  // Manually force rollover as if midnight passed
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
  const v = Number($('#quotaInput').value || 9);
  const cfg = loadCfg();
  cfg.dailyQuota = Math.max(1, Math.min(99, v));
  saveCfg(cfg);
  updateUI();
}

// Timers
let timerInterval = null;
function msToHMS(ms){
  const total = Math.max(0, Math.floor(ms/1000));
  const h = Math.floor(total/3600);
  const m = Math.floor((total%3600)/60);
  const s = total%60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
function nextMidnight(){
  const n = new Date();
  const t = new Date(n);
  t.setHours(24,0,0,0);
  return t;
}
function nextMonday00(){
  const n = new Date();
  const day = n.getDay(); // 0=Sun..6=Sat (local)
  const add = (8 - (day===0 ? 7 : day)) % 7; // days to Monday
  const d = new Date(n);
  d.setDate(n.getDate() + add);
  d.setHours(0,0,0,0);
  return d;
}
function renderTimers(){
  if (timerInterval) clearInterval(timerInterval);
  function tick(){
    const msDay = nextMidnight() - new Date();
    $('#dayTimer').textContent = msToHMS(msDay);

    const msWeek = nextMonday00() - new Date();
    $('#weekTimer').textContent = msToHMS(msWeek);

    // Auto-rollover at midnight detection
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

// UX nicety
function shake(sel){
  const el = $(sel);
  el.style.transform = 'scale(1.05)';
  setTimeout(()=>el.style.transform='scale(1)', 120);
}

// SW registration + A2HS
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
  // Bind
  $('#plus').addEventListener('click', addOne);
  $('#minus').addEventListener('click', removeOne);
  $('#closeDay').addEventListener('click', closeDayNow);
  $('#resetWeek').addEventListener('click', resetWeek);
  $('#saveCfg').addEventListener('click', saveSettings);
  const b = $('#install'); if (b) b.addEventListener('click', doInstall);

  // Init inputs
  $('#quotaInput').value = loadCfg().dailyQuota;

  updateUI();
});
