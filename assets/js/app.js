/* NDesktopPet · 交互逻辑 v3 */
(function () {
  'use strict';

  const { CATS, PETS, renderPet } = window.PET_DATA;
  const STORE = 'desktoppet.v3';
  const CUSTOM_KEY = 'desktoppet.custom.v1';
  const LIMIT = { min: 0.1, max: 3 };
  const MAX_CUSTOM = 24;

  const $ = id => document.getElementById(id);
  const el = {
    stage: $('stage'), pet: $('pet'), petInner: $('petInner'), bubble: $('bubble'),
    catList: $('catList'), brandSub: $('brandSub'), petList: $('petList'),
    sizeRange: $('sizeRange'), sizeOut: $('sizeOut'), dock: $('dock'),
    fab: $('fab'), toast: $('toast'), hint: $('stageHint'),
    btnRandom: $('btnRandom'), btnCenter: $('btnCenter'), btnManager: $('btnManager'),
    btnHideDock: $('btnHideDock'), btnHide: $('btnHide'), btnReset: $('btnReset'), btnQuit: $('btnQuit'),
    btnAutoLaunch: $('btnAutoLaunch'),
    manager: $('manager'), mgrTabs: $('mgrTabs'), mgrGrid: $('mgrGrid'), mgrCount: $('mgrCount'),
    mgrClose: $('mgrClose'), btnCreate: $('btnCreate'), cDrop: $('cDrop'),
    creator: $('creator'), cName: $('cName'), cCat: $('cCat'), cCatNew: $('cCatNew'), cCatNewWrap: $('cCatNewWrap'),
    cFile: $('cFile'), cPick: $('cPick'), cImgPreview: $('cImgPreview'), cSpecMsg: $('cSpecMsg'),
    cCancel: $('cCancel'), cSave: $('cSave'),
    dzTitle: document.querySelector('.dz-title')
  };

  const LINES = [
    '今天也要元气满满呀',
    '摸摸头，好运会来的',
    '要一起摸个鱼吗？',
    '我一直在这里陪着你',
    '工作辛苦了，歇一会儿吧',
    '桌面这么好看，是给我准备的吗',
    '再点我就要融化啦',
    '我刚刚打了个小小的哈欠',
    '被你发现的第 1 秒就喜欢你了'
  ];

  const DEFAULTS = {
    petId: 'gothic', scale: 1, x: null, y: null, hidden: false, dockOpen: true, cat: 'all'
  };
  let S = Object.assign({}, DEFAULTS, load(STORE));
  let customs = load(CUSTOM_KEY) || [];
  if (!Array.isArray(customs)) customs = [];

  const isDesktop = !!(window.desktopPet && window.desktopPet.isDesktop);

  /* ---------------- 存取 ---------------- */
  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }
  function persist() { save(STORE, S); }
  function persistCustom() {
    /* 动图的 image 是运行时 objectURL（blob:...），重启就失效，
       落盘时必须抹掉，只留 imgKey，启动时再从 IndexedDB 取回 */
    const payload = customs.map(p => (p.imgKey && p.image && p.image.indexOf('blob:') === 0)
      ? Object.assign({}, p, { image: '' })
      : p);
    const ok = save(CUSTOM_KEY, payload);
    if (!ok) toast('本机存储空间不足，请先删掉一些自定义桌宠');
    return ok;
  }

  /* ---------------- 动图立绘：原始字节存 IndexedDB ----------------
   * localStorage 只有 5MB 左右，一张 GIF 转成 base64 就吃掉大半；更要命的是
   * 走 canvas 压缩会把动图压成静态的第一帧，动画就没了。所以动图原样存进
   * IndexedDB（配额是几百 MB 级别），localStorage 里只留一个 imgKey。
   */
  const IMG_DB = 'desktoppet.img.v1';
  let idbPromise = null;

  function openImgDB() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise(resolve => {
      try {
        const req = indexedDB.open(IMG_DB, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('img')) db.createObjectStore('img');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return idbPromise;
  }

  /* 统一的事务包装：拿不到库（隐私模式等）就返回 undefined，调用方自己兜底。
     work 里用 done(v) 交出结果 —— 只有事务真的 complete 才算成功，
     否则 request.onsuccess 也可能因为后续 abort 而白高兴一场。 */
  function imgStore(mode, work) {
    return openImgDB().then(db => new Promise(resolve => {
      if (!db) return resolve(undefined);
      let tx;
      try { tx = db.transaction('img', mode); } catch (e) { return resolve(undefined); }
      let out;
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => resolve(undefined);
      tx.onabort = () => resolve(undefined);
      try { work(tx.objectStore('img'), v => { out = v; }); } catch (e) { resolve(undefined); }
    }));
  }

  function idbPut(key, blob) {
    return imgStore('readwrite', (st, done) => { st.put(blob, key); done(true); })
      .then(v => v === true);
  }
  function idbGet(key) {
    return imgStore('readonly', (st, done) => {
      const req = st.get(key);
      req.onsuccess = () => done(req.result || null);
    }).then(v => v || null);
  }
  function idbDel(key) {
    return imgStore('readwrite', (st, done) => { st.delete(key); done(true); })
      .then(v => v === true);
  }

  /* 启动时把动图从 IndexedDB 取回来，换成 objectURL 挂到桌宠上 */
  async function hydrateCustomImages() {
    const pending = customs.filter(p => p.imgKey && !p.image);
    for (const p of pending) {
      let blob = null;
      try { blob = await idbGet(p.imgKey); } catch (e) { blob = null; }
      if (blob) p.image = URL.createObjectURL(blob);
    }
  }

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------------- 数据 ---------------- */
  function allPets() { return PETS.concat(customs); }
  function petOf(id) { return allPets().filter(p => p.id === id)[0] || PETS[0]; }

  /* 分类 = 全部 / 默认 / 我的 + 用户自建分类（从「我的」桌宠里动态汇总） */
  function catsList() {
    const list = [{ id: 'all', name: '全部' }].concat(CATS);
    customs.forEach(p => {
      const c = p.cat;
      if (!c || c === 'mine' || c === 'default') return;
      if (!list.some(x => x.id === c)) list.push({ id: c, name: c });
    });
    return list;
  }

  function countOf(id) {
    if (id === 'all') return allPets().length;
    if (id === 'default') return PETS.length;
    if (id === 'mine') return customs.length;
    return customs.filter(p => p.cat === id).length;
  }

  function petsIn(cat) {
    if (cat === 'all') return allPets();
    if (cat === 'default') return PETS.slice();
    if (cat === 'mine') return customs.slice();
    return customs.filter(p => p.cat === cat);
  }

  function visiblePets() { return petsIn(S.cat); }

  /* ---------------- 渲染 ---------------- */
  function renderPetSVG() {
    el.petInner.innerHTML = renderPet(petOf(S.petId));
  }

  function theme() {
    const c = petOf(S.petId).colors || { accent: '#8b7cff' };
    const a = c.accent || '#8b7cff';
    document.documentElement.style.setProperty('--accent', a);
    document.documentElement.style.setProperty('--accent-soft', hexA(a, .18));
  }

  function hexA(hex, a) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(x => x + x).join('');
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }

  function buildCats() {
    el.catList.innerHTML = catsList().map(c => {
      const n = countOf(c.id);
      return `<button class="chip${S.cat === c.id ? ' is-active' : ''}" data-cat="${c.id}">${c.name}<em>${n}</em></button>`;
    }).join('');
  }

  function buildPets() {
    const list = visiblePets();
    const p = petOf(S.petId);
    if (!list.length) {
      el.petList.innerHTML = `<button class="pet-pick pet-empty" data-open="create">
        <span style="font-size:22px;line-height:40px">＋</span><span class="pick-name">新建</span></button>`;
      return;
    }
    el.petList.innerHTML = list.map(item => `
      <button class="pet-pick${item.id === p.id ? ' is-active' : ''}" data-pet="${item.id}" title="${item.name}">
        ${renderPet(item)}
        <span class="pick-name">${item.name}</span>
      </button>`).join('');
  }

  function syncScale() {
    const pct = Math.round(S.scale * 100);
    const lo = LIMIT.min * 100, hi = LIMIT.max * 100;
    el.sizeRange.value = pct;
    el.sizeOut.textContent = pct + '%';
    el.sizeRange.style.setProperty('--pct', ((pct - lo) / (hi - lo) * 100) + '%');
    el.pet.style.setProperty('--s', S.scale);
  }

  function halfSize() { return 110 * S.scale; }

  function applyPlace() {
    const w = window.innerWidth, h = window.innerHeight;
    if (S.x == null || S.y == null) {
      S.x = Math.round(w / 2);
      S.y = Math.round(h * 0.46);
    }
    const half = halfSize();
    S.x = clamp(S.x, Math.min(half, w - half), Math.max(half, w - half));
    S.y = clamp(S.y, Math.min(half, h - half), Math.max(half, h - half));
    el.pet.style.left = S.x + 'px';
    el.pet.style.top = S.y + 'px';
    el.pet.style.setProperty('--s', S.scale);
  }

  function refreshAll() {
    theme();
    renderPetSVG();
    buildCats();
    buildPets();
    syncScale();
  }

  /* ---------------- 领养 ---------------- */
  function adopt(id) {
    const p = petOf(id);
    S.petId = p.id;
    theme(); renderPetSVG(); buildCats(); buildPets();
    if (el.manager.hidden === false) buildManager();
    persist();
  }

  function setScale(v, silent) {
    S.scale = clamp(v, LIMIT.min, LIMIT.max);
    syncScale(); applyPlace(); persist();
    if (!silent) say('大小 ' + Math.round(S.scale * 100) + '%', 1100);
  }

  /* ---------------- 气泡 / 提示 ---------------- */
  let bubbleTimer = null;
  function say(text, ms) {
    el.bubble.textContent = text;
    el.bubble.classList.add('is-on');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => el.bubble.classList.remove('is-on'), ms || 2600);
  }

  let toastTimer = null;
  function toast(text) {
    el.toast.textContent = text;
    el.toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('is-on'), 2000);
  }

  /* ---------------- 互动 ---------------- */
  function react() {
    el.pet.classList.remove('is-react');
    void el.pet.offsetWidth;
    el.pet.classList.add('is-react');
    setTimeout(() => el.pet.classList.remove('is-react'), 700);
    say(LINES[Math.floor(Math.random() * LINES.length)]);
    burst();
  }

  function dance() {
    el.pet.classList.remove('is-dance');
    void el.pet.offsetWidth;
    el.pet.classList.add('is-dance');
    say('看我转圈圈～', 1600);
    setTimeout(() => el.pet.classList.remove('is-dance'), 2300);
  }

  function burst() {
    const rect = el.pet.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    for (let i = 0; i < 8; i++) {
      const s = document.createElement('span');
      s.className = 'spark';
      const ang = (Math.PI * 2 * i) / 8 + Math.random() * 0.4;
      const dist = 46 + Math.random() * 42;
      s.style.left = cx + 'px';
      s.style.top = cy + 'px';
      s.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      s.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
      s.style.animationDelay = (i * 12) + 'ms';
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 900);
    }
  }

  /* ---------------- 拖动 ---------------- */
  let drag = null;

  el.pet.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    drag = { sx: e.clientX, sy: e.clientY, ox: S.x, oy: S.y, moved: false };
    el.pet.classList.add('is-dragging');
    try { el.pet.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    e.preventDefault();
  });

  el.pet.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
    const half = halfSize();
    const w = window.innerWidth, h = window.innerHeight;
    S.x = clamp(drag.ox + dx, Math.min(half, w - half), Math.max(half, w - half));
    S.y = clamp(drag.oy + dy, Math.min(half, h - half), Math.max(half, h - half));
    el.pet.style.left = S.x + 'px';
    el.pet.style.top = S.y + 'px';
  });

  function endDrag() {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    el.pet.classList.remove('is-dragging');
    if (moved) persist(); else react();
  }
  el.pet.addEventListener('pointerup', endDrag);
  el.pet.addEventListener('pointercancel', endDrag);

  el.pet.addEventListener('dblclick', dance);

  /* ---------------- 真实键鼠 → 桌宠键鼠 ---------------- */
  const PAW_BASE = { '.paw-l': 70, '.paw-r': 126 };

  function tapPaw(sel, hold) {
    const paw = el.petInner.querySelector(sel);
    if (!paw) return false;
    paw.classList.add('is-tap');
    clearTimeout(paw._t);
    paw._t = setTimeout(() => paw.classList.remove('is-tap'), hold || 120);
    return true;
  }

  /* 图片桌宠没有可动的手：用整张立绘的轻微下沉代替 */
  function tapPhoto() {
    const photo = el.petInner.querySelector('.pet-photo');
    if (!photo) return false;
    photo.classList.add('is-tap');
    clearTimeout(photo._t);
    photo._t = setTimeout(() => photo.classList.remove('is-tap'), 110);
    return true;
  }

  function pressKey(code, down) {
    leaveMouseMode();
    const k = el.petInner.querySelector('.key[data-key="' + code + '"]');
    if (!k) return;
    k.classList.toggle('is-down', down);
    if (!down) return;

    const x = Number(k.getAttribute('x')) || 0;
    const sel = x < 92 ? '.paw-l' : '.paw-r';
    const paw = el.petInner.querySelector(sel);
    if (!paw) { tapPhoto(); return; }

    const shift = Math.max(-15, Math.min(15, (x + 5 - PAW_BASE[sel]) * 0.55));
    paw.style.setProperty('--px', shift.toFixed(1) + 'px');
    paw.classList.add('is-tap');
    clearTimeout(paw._t);
    paw._t = setTimeout(() => {
      paw.classList.remove('is-tap');
      clearTimeout(paw._r);
      paw._r = setTimeout(() => paw.style.setProperty('--px', '0px'), 280);
    }, 120);
  }

  document.addEventListener('keydown', e => {
    if (e.repeat) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (!el.manager.hidden) return;
    pressKey(e.code, true);
  });
  document.addEventListener('keyup', e => {
    if (!el.manager.hidden) return;
    pressKey(e.code, false);
  });

  /* ---------------- 真实鼠标（左键 / 右键 / 滚轮）→ 桌宠 ---------------- */
  /* 用鼠标时右手会离开键盘、搭到鼠标上；停手 1.8 秒后自动回到键盘 */
  let mouseIdle = 0;
  let pokeTimer = 0;

  const rigEl = () => el.petInner.querySelector('.pt-rig');
  const mouseEl = () => el.petInner.querySelector('.pt-mouse');

  function enterMouseMode() {
    const rig = rigEl();
    if (!rig) return;
    rig.classList.add('is-mouse');
    clearTimeout(mouseIdle);
    mouseIdle = setTimeout(() => rig.classList.remove('is-mouse'), 1800);
  }

  function leaveMouseMode() {
    const rig = rigEl();
    if (rig) rig.classList.remove('is-mouse');
    clearTimeout(mouseIdle);
  }

  function flashMouseBtn(side) {
    const m = mouseEl();
    if (!m) return;
    const cls = 'is-' + side + '-down';
    m.classList.add(cls);
    const key = '_t' + side;
    clearTimeout(m[key]);
    m[key] = setTimeout(() => m.classList.remove(cls), 200);
  }

  /* 左键：轻轻点头；右键：歪头 */
  function pokePet(kind) {
    el.pet.classList.remove('is-poke-l', 'is-poke-r');
    void el.pet.offsetWidth;
    el.pet.classList.add(kind === 'r' ? 'is-poke-r' : 'is-poke-l');
    clearTimeout(pokeTimer);
    pokeTimer = setTimeout(() => el.pet.classList.remove('is-poke-l', 'is-poke-r'), 480);
  }

  let lastLocalInput = 0;

  function onMouseBtn(side, onPet) {
    if (!el.manager.hidden) return;
    enterMouseMode();
    flashMouseBtn(side);
    if (!tapPaw('.paw-r')) tapPhoto();
    /* 点桌宠本身已有自己的反馈（拖动 / 跳一下），不重复叠加 */
    if (!onPet) pokePet(side);
  }

  window.addEventListener('mousedown', e => {
    if (e.button !== 0 && e.button !== 2) return;
    lastLocalInput = performance.now();
    onMouseBtn(e.button === 2 ? 'r' : 'l', !!(e.target.closest && e.target.closest('.pet')));
  });

  /* 舞台（桌宠 + 背景）上的右键留给桌宠，不再弹系统菜单；面板里照旧 */
  el.stage.addEventListener('contextmenu', e => e.preventDefault());

  let wheelAt = 0, wheelEnd = 0, zoomSave = 0;

  function zoomBy(k) {
    S.scale = clamp(S.scale * k, LIMIT.min, LIMIT.max);
    syncScale(); applyPlace();
    clearTimeout(zoomSave);
    zoomSave = setTimeout(persist, 240);
  }

  /* 滚轮 = 放大缩小；顺便让它的小滚轮跟着转、右手搭到鼠标上 */
  function onWheelDelta(dy) {
    if (!el.manager.hidden || !dy) return;

    const dir = dy > 0 ? 'down' : 'up';
    zoomBy(dir === 'down' ? 0.94 : 1.06);
    enterMouseMode();

    const now = performance.now();
    if (now - wheelAt > 90) {
      wheelAt = now;
      const w = el.petInner.querySelector('.m-wheel');
      if (w) {
        w.classList.remove('is-up', 'is-down');
        void w.getBoundingClientRect();
        w.classList.add(dir === 'down' ? 'is-down' : 'is-up');
      }
    }
    clearTimeout(wheelEnd);
    wheelEnd = setTimeout(() => {
      const w = el.petInner.querySelector('.m-wheel');
      if (w) w.classList.remove('is-up', 'is-down');
    }, 260);
  }

  /* 滚轮只在桌宠身上才缩放；Ctrl / ⌘ + 滚轮留作任意位置的兜底（桌宠太小或挡不住时用） */
  let onPet = false;

  window.addEventListener('wheel', e => {
    if (!el.manager.hidden || !e.deltaY) return;
    const hit = !!(e.target.closest && e.target.closest('.pet'));
    if (!hit && !(e.ctrlKey || e.metaKey)) return;   /* 面板 / 空白处滚轮不缩放 */
    e.preventDefault();
    lastLocalInput = performance.now();
    onWheelDelta(e.deltaY);
  }, { passive: false });

  /* ---------------- 桌面版：全系统键鼠 ----------------
   * 主进程用 libuiohook 旁听全局键鼠（不拦截输入），这里只负责画到桌宠身上。
   * 本窗口有焦点时 DOM 事件已经处理过了，跳过以免同一动作做两遍。
   */
  if (isDesktop && window.desktopPet && typeof window.desktopPet.onInput === 'function') {
    window.desktopPet.onInput(p => {
      if (!p) return;
      if (document.hasFocus()) return;
      if (performance.now() - lastLocalInput < 120) return;
      if (p.t === 'key') pressKey(p.code, !!p.down);
      else if (p.t === 'btn') onMouseBtn(p.side === 'r' ? 'r' : 'l', false);
      else if (p.t === 'wheel') { if (onPet) onWheelDelta(p.dy); }   /* 只在光标停在桌宠身上时才缩放 */
    });
  }

  /* ---------------- 隐藏桌宠 / 隐藏面板 ---------------- */
  function setHidden(v) {
    S.hidden = v;
    el.pet.classList.toggle('is-hidden', v);
    el.btnHide.textContent = v ? '显示桌宠' : '隐藏桌宠';
    if (!v) react();
    persist();
  }

  function setDockOpen(open) {
    S.dockOpen = !!open;
    el.dock.classList.toggle('is-gone', !open);
    el.fab.hidden = !!open;
    if (open) el.fab.blur();
    persist();
  }

  el.btnHide.addEventListener('click', () => setHidden(!S.hidden));

  el.btnCenter.addEventListener('click', () => {
    S.x = Math.round(window.innerWidth / 2);
    S.y = Math.round(window.innerHeight * 0.46);
    applyPlace(); persist();
    say('回到中间啦');
  });

  el.btnReset.addEventListener('click', () => {
    Object.assign(S, DEFAULTS);
    refreshAll(); applyPlace(); setHidden(false); setDockOpen(true);
    persist();
    toast('已恢复默认设置');
  });

  el.btnRandom.addEventListener('click', () => {
    const pool = allPets();
    const p = pool[Math.floor(Math.random() * pool.length)];
    adopt(p.id);
    setHidden(false);
    say('随机领养：' + p.name);
    burst();
  });

  el.btnHideDock.addEventListener('click', () => {
    setDockOpen(false);
    toast('面板已隐藏 · 点右下角小爪子召回');
  });
  el.fab.addEventListener('click', () => setDockOpen(true));

  el.btnQuit.addEventListener('click', () => {
    if (isDesktop) window.desktopPet.quit();
  });

  /* ---------------- 开机启动（只有桌面版能做） ---------------- */
  function paintAutoLaunch(on) {
    el.btnAutoLaunch.setAttribute('aria-pressed', on ? 'true' : 'false');
    el.btnAutoLaunch.title = on ? '已设为开机启动，点一下取消' : '开机时自动打开桌宠';
  }

  async function syncAutoLaunch() {
    if (!isDesktop) return;
    try {
      paintAutoLaunch(await window.desktopPet.getAutoLaunch());
    } catch (err) {
      console.warn('[ndesktoppet] 读取开机启动状态失败：', err && err.message);
    }
  }

  el.btnAutoLaunch.addEventListener('click', async () => {
    if (!isDesktop) return;
    const next = el.btnAutoLaunch.getAttribute('aria-pressed') !== 'true';
    el.btnAutoLaunch.setAttribute('aria-busy', 'true');
    try {
      const real = await window.desktopPet.setAutoLaunch(next);
      paintAutoLaunch(!!real);
      toast(real ? '已设为开机启动，下次开机会自己出现' : '已取消开机启动');
    } catch (err) {
      toast('设置失败：' + ((err && err.message) || '未知错误'));
      syncAutoLaunch();
    } finally {
      el.btnAutoLaunch.removeAttribute('aria-busy');
    }
  });

  /* ---------------- 列表交互 ---------------- */
  el.catList.addEventListener('click', e => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    /* 只切换列表显示范围：当前桌宠保持不变，
       想换桌宠要明确点下面的某一只 */
    S.cat = b.dataset.cat;
    buildCats();
    buildPets();
    persist();
  });

  el.petList.addEventListener('click', e => {
    const create = e.target.closest('[data-open="create"]');
    if (create) { openCreator(); return; }
    const b = e.target.closest('[data-pet]');
    if (!b) return;
    adopt(b.dataset.pet);
    say(petOf(b.dataset.pet).name + ' 已被你领养');
  });

  el.sizeRange.addEventListener('input', e => setScale(Number(e.target.value) / 100, true));

  /* ---------------- 桌宠管理 ---------------- */
  let mgrCat = 'all';
  let mgrCatBefore = 'all';

  const card = el.manager.querySelector('.modal-card');

  function openManager() {
    el.manager.hidden = false;
    el.creator.hidden = true;
    card.classList.remove('is-creating');
    buildManager();
  }
  function closeManager() {
    el.manager.hidden = true;
    el.creator.hidden = true;
    card.classList.remove('is-creating');
  }

  function buildManager() {
    const tabs = catsList();
    el.mgrTabs.innerHTML = tabs.map(c =>
      `<button class="chip${mgrCat === c.id ? ' is-active' : ''}" data-mcat="${c.id}">${c.name}</button>`).join('');

    const list = petsIn(mgrCat);

    el.mgrCount.textContent = `共 ${list.length} 只 · 全部免费，随意领养`;
    card.classList.toggle('is-empty', !list.length);

    if (!list.length) {
      el.mgrGrid.innerHTML = `<div class="mgr-empty">
        <svg class="mgr-empty-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 9.5v5M9.5 12h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        <b>这个分类还没有桌宠</b>
        <span>点下面的「＋ 新建自定义桌宠」，或者换个分类看看</span>
      </div>`;
      return;
    }
    el.mgrGrid.innerHTML = list.map(p => `
      <button class="mgr-card${p.id === S.petId ? ' is-active' : ''}" data-mpet="${p.id}">
        ${p.custom ? '<span class="mgr-del" data-del="' + p.id + '" title="删除">×</span>' : ''}
        ${renderPet(p)}
        <span class="name">${p.name}</span>
        <span class="cat">${p.custom ? (p.cat === 'mine' ? '我的' : p.cat) : '默认'}</span>
      </button>`).join('');
  }

  el.btnManager.addEventListener('click', openManager);
  el.btnCreate.addEventListener('click', openCreator);
  el.mgrClose.addEventListener('click', closeManager);
  el.manager.addEventListener('click', e => { if (e.target === el.manager) closeManager(); });

  el.mgrTabs.addEventListener('click', e => {
    const b = e.target.closest('[data-mcat]');
    if (!b) return;
    mgrCat = b.dataset.mcat;
    buildManager();
  });

  el.mgrGrid.addEventListener('click', e => {
    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      removeCustom(del.dataset.del);
      return;
    }
    const b = e.target.closest('[data-mpet]');
    if (!b) return;
    adopt(b.dataset.mpet);
    const p = petOf(b.dataset.mpet);
    toast('已领养 ' + p.name);
  });

  function removeCustom(id) {
    const p = petOf(id);
    if (!p || !p.custom) return;
    if (!confirm('删除「' + p.name + '」？')) return;
    if (p.imgKey) {
      idbDel(p.imgKey);
      if (p.image && p.image.indexOf('blob:') === 0) {
        try { URL.revokeObjectURL(p.image); } catch (e) {}
      }
    }
    customs = customs.filter(x => x.id !== id);
    persistCustom();
    if (S.petId === id) S.petId = PETS[0].id;
    if (S.cat !== 'all' && S.cat !== 'default' && !petsIn(S.cat).length) S.cat = 'all';
    if (mgrCat !== 'all' && mgrCat !== 'default' && !petsIn(mgrCat).length) mgrCat = 'all';
    refreshAll(); buildManager(); persist();
    toast('已删除');
  }

  /* ---------------- 新建自定义桌宠（只支持导入图片） ---------------- */
  const PLACEHOLDER = `<span class="dz-empty">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 16.5V5.2M7.6 9.4 12 5l4.4 4.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M4.5 15.2v2.6A2.2 2.2 0 0 0 6.7 20h10.6a2.2 2.2 0 0 0 2.2-2.2v-2.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
        </svg></span>`;
  let cImage = null;
  let cImageAlpha = false;
  let cAnimated = null;   /* { blob } 动图原始文件，保存时写进 IndexedDB */
  let cTempUrl = null;    /* 预览用的 objectURL（动图本身），换图或保存后回收 */

  function revokeCTemp() {
    if (!cTempUrl) return;
    try { URL.revokeObjectURL(cTempUrl); } catch (e) {}
    cTempUrl = null;
  }
  const isGif = f => f.type === 'image/gif' || /\.gif$/i.test(f.name || '');
  const sizeText = b => b >= 1048576
    ? (b / 1048576).toFixed(1) + 'MB'
    : Math.max(1, Math.round(b / 1024)) + 'KB';

  function readDataUrl(blob) {
    return new Promise(resolve => {
      const r = new FileReader();
      r.onload = () => resolve(r.result || '');
      r.onerror = () => resolve('');
      r.readAsDataURL(blob);
    });
  }

  /* 分类下拉：我的 + 已有自定义分类 + ＋新建分类 */
  function fillCatOptions() {
    const list = catsList().filter(c => c.id !== 'all' && c.id !== 'default');
    el.cCat.innerHTML = list.map(c => `<option value="${c.id}">${c.name}</option>`).join('')
      + '<option value="__new__">＋ 新建分类…</option>';
    /* 正停在哪一页，就把新桌宠默认放进那一页 */
    const want = (S.cat !== 'all' && S.cat !== 'default' && list.some(c => c.id === S.cat)) ? S.cat : 'mine';
    el.cCat.value = want;
    el.cCatNew.value = '';
    syncCatNew();
  }

  function syncCatNew() {
    const isNew = el.cCat.value === '__new__';
    el.cCatNewWrap.hidden = !isNew;
    if (isNew) setTimeout(() => el.cCatNew.focus(), 30);
  }
  el.cCat.addEventListener('change', syncCatNew);

  function openCreator() {
    el.manager.hidden = false;
    el.creator.hidden = false;
    card.classList.add('is-creating');
    mgrCatBefore = mgrCat;
    mgrCat = S.cat === 'all' || S.cat === 'default' ? 'mine' : S.cat;
    buildManager();

    el.mgrCount.textContent = '上传一张立绘即可领养';
    el.cName.value = '';
    fillCatOptions();
    cImage = null;
    cImageAlpha = false;
    cAnimated = null;
    revokeCTemp();
    showSpec('');
    el.cImgPreview.classList.remove('has-img');
    el.cImgPreview.innerHTML = PLACEHOLDER;
    el.dzTitle.textContent = '点这里上传立绘';
    el.cDrop.classList.remove('is-over');
    setTimeout(() => el.cName.focus(), 120);
  }

  function showSpec(msg, ok) {
    el.cSpecMsg.textContent = msg || '';
    el.cSpecMsg.classList.toggle('ok', !!ok);
  }

  /* 设计规范校验 */
  function checkSpec(img) {
    const errs = [];
    const long = Math.max(img.width, img.height);
    const short = Math.min(img.width, img.height);
    const ar = img.width / img.height;
    if (long < 240) errs.push('长边至少 240px（当前 ' + long + 'px）');
    if (short < 160) errs.push('短边至少 160px（当前 ' + short + 'px）');
    if (ar < 0.5 || ar > 2) errs.push('宽高比需在 0.5–2.0 之间（当前 ' + ar.toFixed(2) + '）');
    return errs;
  }

  /* 检测是否带透明通道：决定「站立抠图」还是「立绘卡面」 */
  function detectAlpha(img) {
    try {
      const cv = document.createElement('canvas');
      cv.width = 32; cv.height = 32;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, 32, 32);
      const d = ctx.getImageData(0, 0, 32, 32).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] < 240) return true;
      return false;
    } catch (e) { return false; }
  }

  function isSvg(f) {
    return f.type === 'image/svg+xml' || /\.svg$/i.test(f.name || '');
  }

  function handleImageFile(f) {
    /* 有些平台的 file input 给不出 MIME（type 为空字符串），只能靠扩展名兜底 */
    const IMG_EXT = /\.(png|jpe?g|webp|gif|avif|bmp|svg)$/i;
    if (!/^image\//.test(f.type) && !IMG_EXT.test(f.name || '')) { toast('请选择图片文件'); return; }
    const maxMb = isGif(f) ? 12 : 6;   /* 动图存 IndexedDB，不吃 localStorage 配额 */
    if (f.size > maxMb * 1024 * 1024) {
      showSpec('文件超过 ' + maxMb + 'MB，请先压缩再试');
      toast('图片太大了');
      return;
    }
    if (isSvg(f)) { handleSvgFile(f); return; }

    revokeCTemp();
    const previewUrl = URL.createObjectURL(f);
    el.cImgPreview.classList.add('has-img');
    el.cImgPreview.innerHTML = `<img src="${previewUrl}" alt="预览">`;
    el.dzTitle.textContent = '点击可更换图片';
    cImage = null;
    cImageAlpha = false;
    cAnimated = null;

    const probe = new Image();
    probe.onload = () => {
      const errs = checkSpec(probe);
      if (errs.length) {
        URL.revokeObjectURL(previewUrl);
        el.cImgPreview.classList.remove('has-img');
        el.cImgPreview.innerHTML = PLACEHOLDER;
        el.dzTitle.textContent = '点这里上传立绘';
        showSpec('不符合规范，请调整后再试：' + errs.join('；'));
        toast('这张图不符合设计规范');
        return;
      }
      const alpha = detectAlpha(probe);
      showSpec(alpha ? '✓ 检测到透明背景：将以「站立抠图」显示' : '✓ 这张图不是透明背景，会有白色底框（建议换透明 PNG 或 SVG）', alpha);

      /* 动图（GIF）：原样保留，一张都不压 —— compress() 走 canvas，只会留下第一帧，
         动画就没了。预览也直接挂 objectURL，编辑器里就能看到它动。 */
      if (isGif(f)) {
        cImage = previewUrl;
        cTempUrl = previewUrl;
        cImageAlpha = alpha;
        cAnimated = { blob: f };
        paintImage();
        showSpec('✓ 动图：保留原始动画（' + sizeText(f.size) + '）', true);
        return;
      }
      compress(f, (url, a, cut) => {
        URL.revokeObjectURL(previewUrl);
        if (!url) {
          el.cImgPreview.classList.remove('has-img');
          el.cImgPreview.innerHTML = PLACEHOLDER;
          el.dzTitle.textContent = '点这里上传立绘';
          showSpec('图片处理失败，换一张试试');
          return;
        }
        cImage = url;
        cImageAlpha = a;
        paintImage();
        if (cut) showSpec('✓ 已自动抠掉白色背景，按透明抠图显示', true);
      });
    };
    probe.onerror = () => {
      URL.revokeObjectURL(previewUrl);
      showSpec('图片无法解析，请换一张');
    };
    probe.src = previewUrl;
  }

  /* SVG：矢量图不压缩、不栅格化，原样存成 data URL */
  function handleSvgFile(f) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      if (!/<svg[\s>]/i.test(text)) {
        showSpec('这个文件不是有效的 SVG');
        toast('SVG 解析失败');
        return;
      }
      if (/<script|<foreignObject|onload=/i.test(text)) {
        showSpec('SVG 里含有脚本，出于安全考虑请导出纯图形 SVG 再试');
        toast('SVG 含有脚本，已拒绝');
        return;
      }
      let url = '';
      try {
        url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(text)));
      } catch (e) {
        url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);
      }
      cImage = url;
      cImageAlpha = true;   /* 矢量图默认按透明抠图呈现 */
      paintImage();
      showSpec('✓ 透明矢量图：任意缩放都清晰', true);
    };
    reader.onerror = () => { showSpec('文件读取失败'); toast('文件读取失败'); };
    reader.readAsText(f);
  }

  /* 白底自动抠除：从四边泛洪，遇到非白即停；顺带做一圈半透明羽化 */
  function stripWhiteBg(ctx, w, h) {
    let img;
    try { img = ctx.getImageData(0, 0, w, h); } catch (e) { return false; }
    const d = img.data;

    const nearWhite = i => d[i] > 234 && d[i + 1] > 234 && d[i + 2] > 234;

    /* 判断是不是白底：四边绝大多数像素接近纯白 */
    let border = 0, white = 0;
    for (let x = 0; x < w; x += 2) {
      for (let k = 0; k < 2; k++) {
        border++; if (nearWhite(((k ? h - 1 : 0) * w + x) * 4)) white++;
      }
    }
    for (let y = 0; y < h; y += 2) {
      for (let k = 0; k < 2; k++) {
        border++; if (nearWhite((y * w + (k ? w - 1 : 0)) * 4)) white++;
      }
    }
    if (white / border < 0.82) return false;

    const total = w * h;
    const seen = new Uint8Array(total);
    const stack = [];
    const push = (x, y) => {
      const p = y * w + x;
      if (seen[p]) return;
      if (!nearWhite(p * 4)) return;
      seen[p] = 1;
      stack.push(p);
    };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }

    while (stack.length) {
      const p = stack.pop();
      const x = p % w, y = (p - x) / w;
      d[p * 4 + 3] = 0;
      if (x > 0) push(x - 1, y);
      if (x < w - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < h - 1) push(x, y + 1);
    }

    /* 羽化：紧贴透明区的亮像素给半透明，去掉白边 */
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (seen[p]) continue;
        const i = p * 4;
        if (d[i] < 198 || d[i + 1] < 198 || d[i + 2] < 198) continue;
        const nb = (x > 0 && seen[p - 1]) || (x < w - 1 && seen[p + 1]) ||
                   (y > 0 && seen[p - w]) || (y < h - 1 && seen[p + w]);
        if (nb) d[i + 3] = 120;
      }
    }

    ctx.putImageData(img, 0, 0);
    return true;
  }

  function compress(file, cb) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 512;
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.width * k));
        cv.height = Math.max(1, Math.round(img.height * k));
        const ctx = cv.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        let cut = false;
        try { cut = stripWhiteBg(ctx, cv.width, cv.height); } catch (e) { cut = false; }
        let out = '';
        try { out = cv.toDataURL('image/webp', 0.9); } catch (e) { out = ''; }
        if (!out || out.indexOf('data:image/webp') !== 0) out = cv.toDataURL('image/png');
        cb(out, cut || detectAlpha(img), cut);
      };
      img.onerror = () => cb(null);
      img.src = reader.result;
    };
    reader.onerror = () => cb(null);
    reader.readAsDataURL(file);
  }

  function paintImage() {
    if (!cImage) {
      el.cImgPreview.classList.remove('has-img');
      el.cImgPreview.innerHTML = PLACEHOLDER;
      return;
    }
    el.cImgPreview.classList.add('has-img');
    el.cImgPreview.innerHTML = `<img src="${cImage}" alt="预览">`;
    el.dzTitle.textContent = '点击可更换图片';
  }

  el.cPick.addEventListener('click', e => { e.stopPropagation(); el.cFile.click(); });

  el.cFile.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    el.cFile.value = '';
    if (f) handleImageFile(f);
  });

  el.cDrop.addEventListener('click', () => el.cFile.click());
  el.cDrop.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.cFile.click(); }
  });
  ['dragenter', 'dragover'].forEach(t => el.cDrop.addEventListener(t, e => {
    e.preventDefault(); el.cDrop.classList.add('is-over');
  }));
  ['dragleave', 'dragend'].forEach(t => el.cDrop.addEventListener(t, () => el.cDrop.classList.remove('is-over')));
  el.cDrop.addEventListener('drop', e => {
    e.preventDefault();
    el.cDrop.classList.remove('is-over');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleImageFile(f);
  });

  el.cCancel.addEventListener('click', () => {
    revokeCTemp();
    cImage = null;
    cAnimated = null;
    el.creator.hidden = true;
    card.classList.remove('is-creating');
    mgrCat = mgrCatBefore;
    buildManager();
  });

  el.cSave.addEventListener('click', async () => {
    if (customs.length >= MAX_CUSTOM) { toast('最多 ' + MAX_CUSTOM + ' 个自定义桌宠'); return; }
    if (!cImage) { toast('先选一张图片吧'); return; }

    /* 分类：下拉选已有的，或现场新建一个（最多 3 个汉字） */
    let cat = el.cCat.value;
    if (cat === '__new__') {
      const n = (el.cCatNew.value || '').replace(/\s+/g, '');
      if (!n) { toast('先给新分类起个名字'); el.cCatNew.focus(); return; }
      if (Array.from(n).length > 3) { toast('分类名最多 3 个汉字'); el.cCatNew.focus(); return; }
      if (n === '全部' || n === '默认' || n === '我的') { toast('「' + n + '」是保留分类，换个名字吧'); el.cCatNew.focus(); return; }
      cat = n;
    }
    if (!cat) cat = 'mine';

    const name = (el.cName.value || '').trim() || '我的桌宠';
    const id = 'u' + Date.now().toString(36);
    const pet = {
      id,
      name,
      cat,
      image: cImage,
      alpha: cImageAlpha,
      custom: true
    };

    /* 动图：原始字节塞进 IndexedDB，localStorage 里只留 imgKey（避免超配额） */
    if (cAnimated) {
      const stored = await idbPut(id, cAnimated.blob);
      if (stored) {
        pet.imgKey = id;
        pet.animated = true;
        pet.image = URL.createObjectURL(cAnimated.blob);
      } else {
        /* IndexedDB 用不了（隐私模式等）：退回 data URL，大图会提示空间不足 */
        const dataUrl = await readDataUrl(cAnimated.blob);
        if (!dataUrl) { toast('动图读取失败，换一张试试'); return; }
        pet.image = dataUrl;
        pet.animated = true;
      }
    }

    customs.push(pet);
    if (!persistCustom()) {
      customs.pop();
      if (pet.imgKey) idbDel(pet.imgKey);
      return;
    }
    revokeCTemp();
    cAnimated = null;

    el.creator.hidden = true;
    card.classList.remove('is-creating');
    S.cat = cat;
    mgrCat = cat;
    adopt(pet.id);
    buildManager();
    toast('已保存到「' + (cat === 'mine' ? '我的' : cat) + '」· ' + name);
    burst();
  });

  /* ---------------- 弹窗关闭（仅 Esc，无其它全局快捷键） ---------------- */
  document.addEventListener('keydown', e => {
    if (el.manager.hidden) return;
    if (e.key !== 'Escape') return;
    if (!el.creator.hidden) {
      el.creator.hidden = true;
      card.classList.remove('is-creating');
      mgrCat = mgrCatBefore;
      buildManager();
    } else {
      closeManager();
    }
  });

  window.addEventListener('resize', applyPlace);

  /* ---------------- 桌面模式：鼠标穿透 ---------------- */
  if (isDesktop) {
    document.body.classList.add('is-desktop');
    el.btnQuit.hidden = false;

    /* 开机启动开关：只有桌面版才有系统权限去改 */
    if (el.btnAutoLaunch) {
      el.btnAutoLaunch.hidden = false;
      syncAutoLaunch();
    }

    /* 桌面版是全系统监听，文案说清楚一点 */
    const tips = document.querySelector('.tips');
    if (tips) tips.textContent = '拖动移动 · 指着桌宠滚轮缩放 · 单击互动 · 双击跳舞 · 全系统键盘 / 鼠标动作都会同步到它身上 · 右上角按钮可隐藏桌宠与面板';

    let ignoring = null;
    window.addEventListener('mousemove', e => {
      if (drag) return;
      const node = document.elementFromPoint(e.clientX, e.clientY);
      const hitPet = !!(node && node.closest('.pet'));
      onPet = hitPet;                        /* 全局滚轮缩放只认「指着桌宠」这个位置 */
      const hit = !!(node && node.closest('.pet, .dock, .fab, .toast, .modal'));
      if (hit !== ignoring) {
        ignoring = hit;
        window.desktopPet.setIgnore(!hit);
      }
    });
    window.desktopPet.setIgnore(true);
  }

  /* ---------------- 启动 ----------------
   * 动图立绘的字节存在 IndexedDB 里，先把 objectURL 取回来再渲染，
   * 否则首屏会出现「有卡片、没图」的空档。
   */
  (async function boot() {
    try { await hydrateCustomImages(); } catch (e) {}

    if (!allPets().some(p => p.id === S.petId)) S.petId = PETS[0].id;
    if (!catsList().some(c => c.id === S.cat)) S.cat = 'all';
    el.brandSub.textContent = '无需登录 · ' + allPets().length + ' 只桌宠 · 全部免费 · 支持自定义';
    refreshAll();
    applyPlace();
    setDockOpen(S.dockOpen !== false);
    if (S.hidden) {
      el.pet.classList.add('is-hidden');
      el.btnHide.textContent = '显示桌宠';
    } else {
      setTimeout(() => say('我来啦，把鼠标放到我身上滚滚轮～', 3200), 700);
    }
    setTimeout(() => el.hint.classList.add('is-gone'), 6500);
  })();
})();
