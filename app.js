const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const MEALS = ['breakfast','lunch','dinner'];

async function api(path, opts={}) {
  const res = await fetch('/api' + path, opts);
  return res.json();
}

/* ---------- Auth / Member ---------- */
function saveMember(m) { localStorage.setItem('member', JSON.stringify(m)); }
function getMember() { return JSON.parse(localStorage.getItem('member')||'null'); }
function clearMember(){ localStorage.removeItem('member'); }

document.getElementById('registerBtn').addEventListener('click', async ()=>{
  const name = document.getElementById('name').value.trim();
  const room = document.getElementById('room').value.trim();
  if(!name) return alert('Enter name');
  const resp = await api('/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name, room})});
  saveMember(resp);
  showMember();
});

document.getElementById('logoutBtn').addEventListener('click', ()=>{
  clearMember();
  showMember();
});

/* ---------- UI Rendering ---------- */
async function loadMenu() {
  const menu = await api('/menu');
  const container = document.getElementById('menuList');
  container.innerHTML = '';
  // group by day
  const byDay = {};
  menu.forEach(m => { byDay[m.day] = byDay[m.day] || {}; byDay[m.day][m.meal] = m.description; });
  DAYS.forEach(d => {
    const card = document.createElement('div'); card.className='card';
    const h = document.createElement('h4'); h.textContent = d; card.appendChild(h);
    MEALS.forEach(m => {
      const p = document.createElement('div');
      p.textContent = `${m}: ${ (byDay[d] && byDay[d][m]) || '-' }`;
      card.appendChild(p);
    });
    container.appendChild(card);
  });
  // build editor if admin open
  buildMenuEditor(menu);
}

function showMember(){
  const member = getMember();
  if(member) {
    document.getElementById('registerForm').style.display='none';
    document.getElementById('loginForm').style.display='block';
    document.getElementById('memberName').textContent = member.name;
    document.getElementById('memberId').textContent = member.id;
    document.getElementById('selectionSection').style.display = 'block';
    loadSelections(member.id);
  } else {
    document.getElementById('registerForm').style.display='block';
    document.getElementById('loginForm').style.display='none';
    document.getElementById('selectionSection').style.display = 'none';
  }
}

/* ---------- Selections UI ---------- */
async function loadSelections(member_id) {
  const existing = await api(`/selections/${member_id}`);
  const map = {};
  existing.forEach(r => { map[`${r.day}_${r.meal}`] = !!r.will_attend; });

  const container = document.getElementById('daysContainer');
  container.innerHTML = '';
  DAYS.forEach(d => {
    const card = document.createElement('div'); card.className='card';
    const h = document.createElement('h4'); h.textContent = d; card.appendChild(h);
    MEALS.forEach(m => {
      const btn = document.createElement('button');
      btn.textContent = m + (map[`${d}_${m}`] ? ' ✓' : '');
      if(map[`${d}_${m}`]) btn.classList.add('toggled');
      btn.addEventListener('click', async ()=>{
        const will = !map[`${d}_${m}`];
        await api('/selection', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ member_id, day: d, meal: m, will_attend: will })});
        map[`${d}_${m}`] = will;
        btn.textContent = m + (will ? ' ✓' : '');
        btn.classList.toggle('toggled', will);
      });
      card.appendChild(btn);
    });
    container.appendChild(card);
  });
}

/* ---------- Admin Panel ---------- */
document.getElementById('openAdmin').addEventListener('click', ()=> {
  document.getElementById('adminPanel').style.display='block';
});
document.getElementById('adminClose').addEventListener('click', ()=> {
  document.getElementById('adminPanel').style.display='none';
});

document.getElementById('loadSummary').addEventListener('click', async ()=>{
  const res = await api('/summary');
  const container = document.getElementById('counts');
  container.innerHTML = '';
  res.forEach(r => {
    const div = document.createElement('div'); div.className='card';
    div.textContent = `${r.day} - ${r.meal}: ${r.count || 0}`;
    container.appendChild(div);
  });
});

document.getElementById('clearSelections').addEventListener('click', async ()=>{
  if(!confirm('Clear all selections?')) return;
  await api('/clear-selections', { method:'POST' });
  alert('Cleared');
});

/* Menu Editor */
let currentMenu = [];
function buildMenuEditor(menu) {
  currentMenu = menu.slice();
  const container = document.getElementById('menuEditor');
  container.innerHTML = '';
  // Convert to map for easier editing
  const byKey = {};
  menu.forEach(m => { byKey[`${m.day}_${m.meal}`] = m.description; });
  DAYS.forEach(d => {
    const card = document.createElement('div'); card.className='card';
    const h = document.createElement('h4'); h.textContent = d; card.appendChild(h);
    MEALS.forEach(m => {
      const inp = document.createElement('input'); inp.placeholder = `${m} description`;
      const key = `${d}_${m}`;
      inp.value = byKey[key] || '';
      inp.dataset.key = key;
      card.appendChild(inp);
    });
    container.appendChild(card);
  });
}

document.getElementById('saveMenu').addEventListener('click', async ()=>{
  const inputs = Array.from(document.querySelectorAll('#menuEditor input'));
  const items = inputs.map(i => {
    const [day, meal] = i.dataset.key.split('_');
    return { day, meal, description: i.value || '' };
  });
  await api('/menu', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(items) });
  alert('Menu saved');
  loadMenu();
});

/* ---------- Init ---------- */
loadMenu();
showMember();
