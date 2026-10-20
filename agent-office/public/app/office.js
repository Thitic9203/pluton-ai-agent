// Agent Office live page: the mock v62 module, its simulation removed (spec docs/sdd/agent-office-live/spec.md R0, R49).
// Built from the mock with the page; edit the mock first (R44).
// Live data only (spec docs/sdd/agent-office-live/spec.md R0, R49): the board reads GET /data/state.json through app/live.js.
import { start as startLive, viewOf, moneyRows, issuesOf, projectsOf, releaseText, workEvents, freshText, boardLines, fmtBangkok, baht, isFlavourSafe, NO_SOURCE, NO_SIZE, holderText, phaseKey } from './live.js';
// R49a: the mock's ambient life (walking, breaks at every object in turn, chatter); work facts stay the snapshot's.
import { AMBIENT, ambientStep, pickSpeaker, safeLine } from './ambient.js';
// three.js r170 as ES modules. Loaded with guarded dynamic imports so a blocked CDN still reaches the 2D fallback
// (init3D returns false when THREE is missing), exactly as the r128 classic scripts did.
let THREE = null, OrbitControls = null, RoomEnvironment = null, FX = null;
try {
  const [core, oc, re, ec, rp, gt, sm, op, ub, sp] = await Promise.all([
    import('three'), import('three/addons/controls/OrbitControls.js'), import('three/addons/environments/RoomEnvironment.js'),
    import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'),
    import('three/addons/postprocessing/GTAOPass.js'), import('three/addons/postprocessing/SMAAPass.js'), import('three/addons/postprocessing/OutputPass.js'),
    import('three/addons/postprocessing/UnrealBloomPass.js'), import('three/addons/postprocessing/ShaderPass.js')
  ]);
  THREE = core; OrbitControls = oc.OrbitControls; RoomEnvironment = re.RoomEnvironment;
  FX = { EffectComposer: ec.EffectComposer, RenderPass: rp.RenderPass, GTAOPass: gt.GTAOPass, SMAAPass: sm.SMAAPass, OutputPass: op.OutputPass, UnrealBloomPass: ub.UnrealBloomPass, ShaderPass: sp.ShaderPass };
  // Every hex colour in this file is written in sRGB and converted once by lin() (see materials), the r128 convention.
  // Turning colour management off keeps Color/setHex/setColorAt as raw values, so nothing is converted twice.
  THREE.ColorManagement.enabled = false;
} catch (e) { console.warn('three.js did not load, showing the 2D fallback', e); }
// v58 extras, loaded apart so a missing one only drops its feature, never the whole 3D view: geometry merging for the
// static batches, the glTF loader with its meshopt decoder for the Poly Haven furniture, and the HDR loader for the sky light.
let BGU = null, GLTFLoader = null, MeshoptDecoder = null, RGBELoader = null;
if (THREE) try {
  const [bg, gl, md, rg] = await Promise.all([import('three/addons/utils/BufferGeometryUtils.js'), import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/libs/meshopt_decoder.module.js'), import('three/addons/loaders/RGBELoader.js')]);
  BGU = bg; GLTFLoader = gl.GLTFLoader; MeshoptDecoder = md.MeshoptDecoder; RGBELoader = rg.RGBELoader;
} catch (e) { console.warn('three.js extras did not load; the scene draws unbatched, without models or the HDR sky light', e); }
// rigged people: SkeletonUtils clones one skinned source per person; without it the hand-built people stay
let SkeletonUtils = null;
if (THREE) try { SkeletonUtils = await import('three/addons/utils/SkeletonUtils.js'); } catch (e) { console.warn('SkeletonUtils did not load; the hand-built people stay', e); }
// v59: three's Sky (MIT, the Preetham daylight model), loaded on its own so a miss only leaves the flat sky colour
let SkyC = null;
if (THREE) try { SkyC = (await import('three/addons/objects/Sky.js')).Sky; } catch (e) { console.warn('Sky.js did not load; the sky stays a flat colour', e); }
(() => {
  // ---------- config: everything project specific lives here (V5 draft) ----------
  const ROLES = {
    head: { label: 'Head',      color: '#2f4858', duty: 'ดูภาพรวม ส่งเรื่องให้เจ้าของตัดสิน ชำระค่าใช้จ่ายด้าน AI', own: 'ตรวจเงินสนับสนุนทีมและค่าใช้จ่ายด้าน AI' },
    po:   { label: 'PO',        color: '#c76b29', duty: 'ตัดสินว่าทำอะไรก่อน: เป้าหมาย คุณค่า ลำดับ ขอบเขต และ AC ระดับผลลัพธ์', own: 'จัดลำดับ backlog ใหม่ตามคุณค่า' },
    ba:   { label: 'BA',        color: '#b5892f', duty: 'วิเคราะห์ว่าทำอย่างไรให้ตรงความต้องการ: flow กฎธุรกิจ edge case ข้อมูล และผูก AC ให้ตามรอยได้', own: 'ตรวจว่างานที่ขึ้น production แก้ปัญหาได้จริง' },
    dev:  { label: 'Dev',       color: '#2b7bb9', duty: 'หยิบงานที่ test plan ผ่าน เขียนโค้ด test-first', own: 'แก้ CI แดงบน branch agent' },
    qa:   { label: 'QA',        color: '#2a9d6f', duty: 'หยิบงานที่ขึ้น staging ทดสอบและแนบหลักฐาน', own: 'smoke staging รอบประจำ' },
    tl:   { label: 'Tech Lead', color: '#7b4bb3', duty: 'หยิบ PR ที่เปิดใหม่ รีวิวด้วยสกิล code-review ผ่านแล้ว merge เอง', own: 'ทบทวนความเสี่ยงเชิงสถาปัตย์' },
    qal:  { label: 'QA Lead',   color: '#c2417a', duty: 'หยิบ plan ที่อนุมัติแล้ว เขียน test plan ผูก AC', own: 'ตรวจว่า AC ทุกข้อมีเทสต์' }
  };
  const STATES = {
    working: { text: 'กำลังทำงาน', cls: 's-working', color: 'var(--accent)' },
    waiting: { text: 'รอเจ้าของในห้องประชุม', cls: 's-waiting', color: 'var(--wait)' },
    blocked: { text: 'ติดปัญหา รอเจ้าของ', cls: 's-blocked', color: 'var(--bad)' },
    sweeping: { text: 'กำลังทำงาน', cls: 's-working', color: 'var(--accent)' },
    idle:    { text: 'พักเบรก', cls: 's-idle', color: 'var(--muted)' }
  };
  // The labels an issue travels through, in order (plan "Tag / Filter convention"), with the role that
  // holds it and the room it puts them in (ticket V3 draft, waiting for the owner).
  const LANES = [
    { k: 'queued',        th: 'รอคิว',                role: null,  kind: 'idle', who: 'รอคิวเขียนโค้ด (พร้อมกันได้ 3 ใบ)' },
    { k: 'ready',         th: 'PO จัดลำดับ ตั้งขอบเขต + AC', role: 'po', kind: 'work' },
    { k: 'analysis',      th: 'BA วิเคราะห์ requirement เขียน plan', role: 'ba', kind: 'work' },
    { k: 'planning',      th: 'plan รอเจ้าของ',       role: 'ba',  kind: 'wait', gate: 'Gate 1' },
    { k: 'test-planning', th: 'test plan รอเจ้าของ',  role: 'qal', kind: 'wait', gate: 'Gate 2' },
    { k: 'building',      th: 'เขียนโค้ด + รีวิวแยก', role: 'dev', kind: 'work' },
    { k: 'in-review',     th: 'Tech Lead รีวิว PR',   role: 'tl',  kind: 'work' },
    { k: 'merging',       th: 'ผ่าน แล้ว merge เอง',  role: 'tl',  kind: 'work' },
    { k: 'release-queue', th: 'รอรวมรอบ release',     role: null,  kind: 'idle', who: 'รอครบ 10 ใบ' },
    { k: 'on-test-env',   th: 'อยู่ในรอบ release',     role: null,  kind: 'work', who: 'QA Lead และ QA' },
    { k: 'blocked',       th: 'ติดปัญหา',             role: null,  kind: 'block', who: 'คนของขั้นที่ติด' }
  ];
  const LANE = Object.fromEntries(LANES.map((l, i) => [l.k, { ...l, i }]));
  // Idle only when it truly has to be (owner, 14 Oct 2026: "ออกแบบให้ agent ไม่ว่าง หรือว่างเท่าที่จำเป็นจริง เช่น ถ้าไม่มีงานก็หา
  // จุดบอดในระบบนั้นๆ แล้วดำเนินการสร้างใบงานใน GitHub แล้วก็ทำตามขั้นตอนตามลำดับเพื่อให้ระบบดีขึ้น"). A person with no issue sweeps
  // their own area for a blind spot and files it as an [Improvement] (improvement.yml), which enters at agent:ready and
  // travels every step and gate in order like any other issue. A finding that contradicts a confirmed spec goes the bug
  // route instead (BUG_WORKFLOW). Caps keep the queue honest: one open self-filed item per role and five in all; past the
  // cap the person does their standing duty. The only idle time is a short break after every few findings.
  const BREAK_KITCHEN = ['เตาและเครื่องดูดควัน', 'เตาไฟฟ้าและฮู้ดดูดควัน', 'สถานีกาแฟและชา', 'เครื่องเอสเปรสโซ', 'เครื่องชงกาแฟ', 'ชุดชงมัทฉะ', 'ตู้เครื่องดื่มใหญ่', 'ชั้นขนมกรุบกรอบ', 'ตู้ไอศกรีม', 'เกาะครัว', 'โต๊ะอาหาร', 'เตาอบ'];
  const BREAK_REST = ['บีนแบ็ก', 'โซฟา', 'อาร์มแชร์', 'ทีวีและโฮมเธียเตอร์', 'เก้าอี้นวดไฟฟ้า', 'ชั้นหนังสือ', 'โต๊ะญี่ปุ่นมุมอ่านหนังสือ', 'เตียงคิงไซซ์', 'เตียงอาบแดด', 'สระว่ายน้ำ', 'สไลเดอร์', 'บึงบัว', 'สะพานไม้', 'เรือไม้', 'น้ำพุ', 'ม้านั่งริมทาง', 'จุดยืมจักรยาน', 'ต้นไม้ใหญ่'];
  const breakUse = {};
  // Projects, their key formats and the roster come from the config through the state endpoint (R1, R30); none is typed here.
  let PROJECTS_LIVE = [];
  const CONFIG = { project: 'Taskfolio' };
  const relBatch = pj => { const p = PROJECTS_LIVE.find(x => x.name === pj); return p && p.release ? p.release.batch : 0; };
  const live = { state: null, failed: false, forbidden: false };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };

  // ---------- state ----------
  let people = [], issues = [], uid = 1, hoverPid = null;
  let timeMode = store.get('ao3.time', 'real');
  let weather = store.get('ao3.weather', 'autumn');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGsap = typeof window.gsap !== 'undefined' && !reduce;

  // The roster of the config, in its order (R1, R20); a person keeps its id between reads so its figure stays put.
  function applyPeople(list) {
    const same = people.length === list.length && list.every((x, i) => people[i].role === x.role && people[i].slot === x.slot);
    if (!same) people = list.map((x, i) => ({ id: i + 1, slot: x.slot, look: i, role: x.role, duty: x.duty || ROLES[x.role].duty, state: 'idle', idleSpot: i % 3, gates: [] }));
    return !same;
  }

  // Called by role; a role held by more than one person gets " - A", " - B" in roster order (owner, 14 Oct 2026).
  function labelOf(p) {
    const same = people.filter(x => x.role === p.role);
    return same.length > 1 ? `${ROLES[p.role].label} - ${String.fromCharCode(65 + same.indexOf(p))}` : ROLES[p.role].label;
  }

  // each issue belongs to a project (owner, 14 Oct 2026: "มุมขวาของแต่ละงาน ต้องเป็นลาเบลชื่อโปรเจ็ค"); a project keys its own issues
  let PROJECT_KEY = {}; // project name -> true, for the projects of the state
  const projectOf = i => (i && i.project) || CONFIG.project;
  const issueKey = i => i.key || String(i.n);
  const laneOf = i => LANE[i.lane];
  const roleOf = i => i.lane === 'blocked' ? (i.from && LANE[i.from] ? LANE[i.from].role : null) : laneOf(i) ? laneOf(i).role : null; // R4
  // Who holds what is the function's derivation (R5 to R8); the page only places it.
  function applyLive() {
    people.forEach(p => { p.state = 'idle'; p.issue = null; p.release = null; p.gates = []; p.ownDuty = false; });
    issues.forEach(i => { i.holder = null; });
    const s = live.state; if (!s) return;
    const byKey = new Map(issues.map(i => [i.projectId + ':' + i.n, i]));
    (s.people || []).forEach(x => {
      const p = people.find(q => q.slot === x.slot); if (!p) return;
      p.state = STATES[x.state] ? x.state : 'idle';
      const ref = x.issue === null || x.issue === undefined ? null : typeof x.issue === 'object' ? x.issue.project + ':' + x.issue.n : (x.project || 'taskfolio') + ':' + x.issue;
      p.issue = ref ? byKey.get(ref) || null : null; if (p.issue) p.issue.holder = p;
      p.release = x.release || null;
    });
    const gates = issues.filter(i => laneOf(i) && laneOf(i).kind === 'wait');
    people.filter(p => p.role === 'head').forEach(p => { p.gates = p.state === 'waiting' ? gates : []; });
  }

  // =====================================================================================
  // 3D office (Three.js; owner 14 Oct 2026: real 3D, realistic people, props and weather)
  // Grid units: x runs 0..16 left to right, z runs 0..12 back to front; 1 unit is about 1 metre.
  // =====================================================================================
  const ROOMS = [
    // One cozy theme in brown, white and black (owner, 14 Oct 2026); each room takes its own mix of it.
    { name: 'ห้องประชุม', x: 0, z: 0, w: 6, d: 5, floor: 'carpetCharcoal' },
    { name: 'ห้องน้ำชาย', x: 6, z: 0, w: 2, d: 3.4, floor: 'tileWhite' },
    { name: '', x: 6, z: 3.4, w: 4, d: 1.6, floor: 'oak' },
    { name: 'ห้องสมาธิ', x: 10, z: 0, w: 6, d: 5, floor: 'walnut' },
    { name: 'ห้องพักผ่อน', x: 0, z: 5, w: 4, d: 7, floor: 'carpetCream' },
    { name: 'ห้องทีม · โต๊ะโดนัท', x: 4, z: 5, w: 8, d: 7, floor: 'oak' },
    { name: 'ห้องครัว', x: 12, z: 5, w: 7, d: 7, floor: 'tileBlack' },
    { name: 'ห้องงีบ', x: 16, z: 0, w: 3, d: 4.88, floor: 'oak' },
    { name: 'ห้องน้ำหญิง', x: 8, z: 0, w: 2, d: 3.4, floor: 'tileWhite' }
  ];
  const TIMES3D = {
    morning:   { sky: 0xf9dcbf, hemi: [0xfff1dc, 0x8a7a5a, .75], sun: [0xffc58a, 1.15, [-16, 12, 12]], lamps: 0, win: 0 },
    afternoon: { sky: 0xbfe0f4, hemi: [0xffffff, 0x8a8a6a, .8],  sun: [0xfff6e8, 1.25, [12, 24, 16]], lamps: 0, win: 0 },
    evening:   { sky: 0xe39a72, hemi: [0xffc9a6, 0x4a3a2e, .3], sun: [0xff7a3c, .75, [28, 7, 6]], lamps: .9, win: .7 },
    night:     { sky: 0x0b1430, hemi: [0x3b4a7a, 0x101414, .045], sun: [0x8fa6ff, .14, [-10, 20, -6]], lamps: 1.5, win: 1 }
  };
  // Light units since three r155 are physical: the old shaders multiplied hemisphere, directional and ambient light by
  // pi, so the table values above are scaled by LX. A point light used to fade as (1 - d / distance)^2 and now falls off
  // as 1 / d^2; PK matches the two at about a third of the light's reach, where the rooms and lamps light the floor.
  const LX = Math.PI, PK = l => Math.PI * .053 * l.distance * l.distance;
  // Render pipeline per time of day: ENV3D is how strongly the RoomEnvironment reflections and fill light the scene,
  // BLOOM3D the HDR luminance a pixel must pass to glow (high by day so only lamps and lit windows bloom at dusk and
  // night), EB how much brighter lit bulbs and windows burn so they rise above that threshold.
  // v59 (owner, 14 Oct 2026: night must read as night): the studio fill drops to a trace at dusk and night, the ambient
  // follows the slot, so lamps, lit windows and the pool lights carry the scene after dark
  const ENV3D = { morning: .57, afternoon: .6, evening: .26, night: .07 };
  const AMB3D = { morning: .12, afternoon: .12, evening: .045, night: .01 }, EXPO3D = { morning: 1.05, afternoon: 1.05, evening: 1.0, night: .98 };
  const BLOOM3D = { morning: 9, afternoon: 9, evening: 3.8, night: 3.2 }; // above chrome and gloss highlights, below lit bulbs
  const EB = { bulb: 6, win: 1.8 };
  // tuned against v57 screenshots: mean luminance of the 3D view at 1280, v57 vs v58 (afternoon 171.1 vs 170.5,
  // morning 157.7 vs 158.0 at 1.5)
  let ENV_SKY_K = 1.5;
  const WEATHER = { clear: 'ฟ้าใส', rain: 'ฝนตก', snow: 'หิมะตก', autumn: 'ใบไม้ร่วง' };
  const K = 1.4; // the building plan is stretched by K (see buildOffice)
  // the raised back deck of the focus room and the nap room, in building coordinates: deck to z1, then two treads of `run`
  const PLAT = { h: .45, rise: .15, run: .3, x0: 10 * K + .06, x1: 19 * K - .06, z1: 2.9, wall: 16 * K, stairs: [[17.3, 19.1], [23.7, 25.3]] };
  function floorY(x, z) {
    if (x < PLAT.x0 || x > PLAT.x1 || z < 0) return 0;
    if (z <= PLAT.z1) return PLAT.h;
    const k = Math.floor((z - PLAT.z1) / PLAT.run);
    if (k > 1 || !PLAT.stairs.some(([a, b]) => x >= a && x <= b)) return 0;
    return PLAT.h - (k + 1) * PLAT.rise;
  }
  const FOOT = { x0: -.4, x1: 19 * K + .4, z0: -.4, z1: 12 * K + .4 }; // the building; weather falls outside it
  // How far a point of the 16 x 12 plan moves when the building is stretched: a point within .9 of a room
  // wall stays on that wall, any other point keeps its place around the room's centre.
  function shiftOf(ax, az) {
    const cz = Math.min(Math.max(az, 0), 12), cx = Math.min(Math.max(ax, 0), 19);
    const r = ROOMS.find(q => cx >= q.x && cx <= q.x + q.w && cz >= q.z && cz <= q.z + q.d) || ROOMS[0];
    const sx = ax - r.x < .9 ? r.x : r.x + r.w - ax < .9 ? r.x + r.w : r.x + r.w / 2;
    const sz = az - r.z < .9 ? r.z : r.z + r.d - az < .9 ? r.z + r.d : r.z + r.d / 2;
    return [sx * (K - 1), sz * (K - 1)];
  }
  const three = { ok: false, anchors: [], figures: new Map(), canopies: [], lamps: [], wins: [], snowOnly: [], rainOnly: [], autumnOnly: [], waters: [], waterTex: [], conifers: [], hills: [], roomLights: [], bubbles: [], townWin: [], vacuums: [], idleSeats: [] };

  // ---------- seeded random, so every load draws the same office ----------
  let seed = 20261014;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  // ---------- procedural textures (no image files) ----------
  let MAX_ANISO = 4; // raised to the GPU's maximum in init3D, before any texture is made
  function ctex(w, h, draw, rx = 1, ry = 1) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = MAX_ANISO;
    return t;
  }
  const TEX = {};
  function wood(base, dark, plank = 32) {
    return (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += plank) {
        const shade = (rnd() - .5) * 18;
        g.fillStyle = `rgba(${shade > 0 ? '255,255,255' : '0,0,0'},${Math.abs(shade) / 255 * 3})`; g.fillRect(0, y, w, plank);
        g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, y, w, 1);
        const cut = rnd() * w; g.fillRect(cut, y, 1, plank);
        for (let k = 0; k < 7; k++) {
          g.strokeStyle = dark; g.globalAlpha = .06 + rnd() * .08; g.lineWidth = .6 + rnd();
          g.beginPath(); const yy = y + rnd() * plank; g.moveTo(0, yy);
          for (let x = 0; x <= w; x += 16) g.lineTo(x, yy + Math.sin(x / 30 + k) * 1.6);
          g.stroke(); g.globalAlpha = 1;
        }
      }
    };
  }
  function speckle(base, n, light, dark) {
    return (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (let i = 0; i < n; i++) { g.fillStyle = rnd() < .5 ? light : dark; g.fillRect(rnd() * w, rnd() * h, 1.4, 1.4); }
    };
  }
  function tiles(base, grout, size) {
    return (g, w, h) => {
      g.fillStyle = grout; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += size) for (let x = 0; x < w; x += size) {
        const v = (rnd() - .5) * 10; g.fillStyle = base; g.globalAlpha = 1; g.fillRect(x + 1.5, y + 1.5, size - 3, size - 3);
        g.fillStyle = v > 0 ? `rgba(255,255,255,${v / 60})` : `rgba(0,0,0,${-v / 60})`; g.fillRect(x + 1.5, y + 1.5, size - 3, size - 3);
      }
    };
  }
  function grass(g, w, h) {
    g.fillStyle = '#6b9a4f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const c = ['#5d8c44', '#7aa95b', '#88b566', '#527d3c'][Math.floor(rnd() * 4)];
      g.strokeStyle = c; g.lineWidth = 1; g.beginPath(); const x = rnd() * w, y = rnd() * h; g.moveTo(x, y); g.lineTo(x + (rnd() - .5) * 3, y - 2 - rnd() * 4); g.stroke();
    }
  }
  function codeScreen(variant) {
    return (g, w, h) => {
      g.fillStyle = '#1b2130'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#2a3244'; g.fillRect(0, 0, w, 18);
      ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(12 + i * 14, 9, 4, 0, 7); g.fill(); });
      if (variant === 'dash') {
        g.fillStyle = '#e6edf3'; g.font = '600 15px sans-serif'; g.fillText('CI · main', 14, 42);
        for (let i = 0; i < 9; i++) { const v = 30 + rnd() * 120; g.fillStyle = i === 6 ? '#e5534b' : '#3fb950'; g.fillRect(16 + i * 30, h - 20 - v, 20, v); }
        return;
      }
      g.fillStyle = '#20283a'; g.fillRect(0, 18, 42, h);
      const cols = ['#ff7b72', '#79c0ff', '#d2a8ff', '#a5d6ff', '#7ee787', '#ffa657', '#8b949e'];
      for (let y = 32, ind = 0; y < h - 6; y += 13) {
        g.fillStyle = '#56607a'; g.fillRect(14, y - 6, 14, 3);
        if (rnd() < .2) ind = Math.max(0, ind + (rnd() < .5 ? -1 : 1)); let x = 52 + ind * 18;
        const parts = 1 + Math.floor(rnd() * 4);
        for (let k = 0; k < parts && x < w - 20; k++) { const len = 18 + rnd() * 70; g.fillStyle = cols[Math.floor(rnd() * cols.length)]; g.fillRect(x, y - 7, len, 5); x += len + 7; }
      }
    };
  }
  function slide(g, w, h) {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#6b4fbb'; g.fillRect(0, 0, w, 10);
    g.fillStyle = '#17302b'; g.font = '700 30px sans-serif'; g.fillText('Gate 1 · Plan review', 26, 56);
    g.fillStyle = '#57706a'; g.font = '18px sans-serif'; g.fillText('#503 Approvals project filter', 26, 86);
    for (let i = 0; i < 4; i++) { g.fillStyle = '#c9d6d3'; g.fillRect(26, 112 + i * 26, 160 + rnd() * 220, 10); g.fillStyle = '#1f7a5c'; g.fillRect(26 - 14, 112 + i * 26, 8, 8); }
    g.fillStyle = '#1f7a5c'; g.fillRect(w - 170, h - 54, 140, 32); g.fillStyle = '#fff'; g.font = '600 16px sans-serif'; g.fillText('/approve-plan', w - 158, h - 32);
  }
  function whiteboard(g, w, h) {
    g.fillStyle = '#f7f8f8'; g.fillRect(0, 0, w, h);
    const notes = ['#ffe58a', '#ffb3c7', '#a6e3ff', '#b8f2b0'];
    for (let i = 0; i < 9; i++) { g.save(); g.translate(30 + (i % 5) * 92 + rnd() * 8, 30 + Math.floor(i / 5) * 92 + rnd() * 8); g.rotate((rnd() - .5) * .12); g.fillStyle = notes[i % 4]; g.fillRect(0, 0, 70, 66); g.fillStyle = 'rgba(0,0,0,.35)'; for (let l = 0; l < 3; l++) g.fillRect(8, 14 + l * 14, 30 + rnd() * 28, 3); g.restore(); }
    g.strokeStyle = '#2b7bb9'; g.lineWidth = 3; g.beginPath(); g.moveTo(40, h - 40); g.bezierCurveTo(140, h - 90, 260, h - 10, 420, h - 60); g.stroke();
  }
  function caustics(g, w, h) {
    g.fillStyle = '#2f9fc4'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(210,245,255,.55)'; g.lineWidth = 2;
    for (let i = 0; i < 70; i++) { g.beginPath(); const x = rnd() * w, y = rnd() * h, r = 8 + rnd() * 22; g.ellipse(x, y, r, r * (.5 + rnd() * .5), rnd() * 3, 0, Math.PI * 2); g.stroke(); }
  }
  function menuBoard(g, w, h) {
    g.fillStyle = '#23302b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e9f0dc'; g.font = '700 30px sans-serif'; g.fillText('DRINKS', 22, 44);
    g.font = '18px sans-serif';
    [['Matcha latte', '95'], ['Flat white', '85'], ['Thai milk tea', '70'], ['Cocoa', '75'], ['Orange juice', '80']].forEach(([n, p], i) => { g.fillStyle = '#e9f0dc'; g.fillText(n, 22, 84 + i * 28); g.fillStyle = '#9fd18b'; g.fillText(p, w - 64, 84 + i * 28); });
  }
  function fabric(base) {
    return (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); for (let i = 0; i < w; i += 3) { g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(i, 0, 1, h); g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(0, i, w, 1); } };
  }
  function makeTextures() {
    TEX.oak = ctex(256, 256, wood('#c4996a', '#6b4423'), 2, 2);
    TEX.walnut = ctex(256, 256, wood('#6e4a32', '#2a1a0e'), 2, 2);
    TEX.carpetCharcoal = ctex(128, 128, speckle('#3a3633', 2600, '#4a4541', '#2c2926'), 4, 4);
    TEX.carpetCream = ctex(128, 128, speckle('#e8dfd0', 2600, '#f2ebdf', '#d8cdbb'), 4, 4);
    TEX.tileWhite = ctex(256, 256, tiles('#f2efea', '#2b2826', 42), 2, 2);
    TEX.tileBlack = ctex(256, 256, tiles('#2a2725', '#4a4440', 64), 2, 2);
    TEX.grass = ctex(256, 256, grass, 12, 12);
    TEX.plaster = ctex(128, 128, speckle('#efe9df', 1800, '#f6f2ea', '#e3dccf'), 6, 2);
    TEX.code = [ctex(512, 320, codeScreen()), ctex(512, 320, codeScreen()), ctex(512, 320, codeScreen())];
    TEX.dash = ctex(320, 200, codeScreen('dash'));
    TEX.slide = ctex(512, 288, slide);
    TEX.board = ctex(512, 256, whiteboard);
    TEX.water = ctex(256, 256, caustics, 3, 3);
    TEX.natWater = ctex(256, 256, (g, w, h) => {
      g.fillStyle = '#3a5248'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(190,205,185,.16)'; g.lineWidth = 1.5;
      for (let i = 0; i < 60; i++) { g.beginPath(); const x = rnd() * w, y = rnd() * h, r = 10 + rnd() * 26; g.ellipse(x, y, r, r * .35, rnd() * .4, 0, Math.PI * 2); g.stroke(); }
    });
    TEX.art = [artTexture(0), artTexture(2), artTexture(4)];
    TEX.leafCanvas = leafTex(); TEX.pine = pineTex(); TEX.hedge = hedgeTex();
    // v59: leaf cards carry a twig cluster built from CC0 ambientCG leaf scans (LeafSet024); the drawn leaves stay as the fallback
    TEX.leaf = new THREE.TextureLoader(loadMgr()).load('assets/textures/foliage/leaf_cluster.webp', undefined, undefined, () => { TEX.leaf.image = TEX.leafCanvas.image; TEX.leaf.needsUpdate = true; });
    TEX.leaf.colorSpace = THREE.SRGBColorSpace; TEX.leaf.anisotropy = MAX_ANISO;
    TEX.maple = new THREE.TextureLoader(loadMgr()).load('assets/textures/foliage/leaf_maple.webp'); TEX.maple.colorSpace = THREE.SRGBColorSpace;
    TEX.movie = ctex(512, 288, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f2a77a'); gr.addColorStop(.6, '#6b4630'); gr.addColorStop(1, '#1f1d1c'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#000'; g.fillRect(0, 0, w, 30); g.fillRect(0, h - 30, w, 30); g.fillStyle = '#ffd9a0'; g.beginPath(); g.arc(w * .7, h * .45, 40, 0, 7); g.fill(); g.fillStyle = '#1f1d1c'; g.beginPath(); g.moveTo(0, h - 30); g.lineTo(w * .3, h * .55); g.lineTo(w * .55, h - 30); g.fill(); g.fillStyle = '#fff'; g.font = '16px sans-serif'; g.textAlign = 'center'; g.fillText('“แล้วเจอกันที่สะพานนะ”', w / 2, h - 40); });
    TEX.game = ctex(512, 288, (g, w, h) => { g.fillStyle = '#7fb6d8'; g.fillRect(0, 0, w, h * .5); g.fillStyle = '#4f7d3c'; g.fillRect(0, h * .5, w, h); g.fillStyle = '#3a3836'; g.beginPath(); g.moveTo(w * .45, h * .5); g.lineTo(w * .55, h * .5); g.lineTo(w * .9, h); g.lineTo(w * .1, h); g.fill(); g.strokeStyle = '#fff'; g.setLineDash([12, 14]); g.lineWidth = 4; g.beginPath(); g.moveTo(w / 2, h * .52); g.lineTo(w / 2, h); g.stroke(); g.fillStyle = '#b33d26'; g.fillRect(w * .44, h * .72, 60, 34); g.fillStyle = '#fff'; g.font = '700 22px sans-serif'; g.fillText('LAP 2/3', 16, 32); g.fillText('1st', w - 60, 32); });
    TEX.blob = ctex(64, 64, (g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(0,0,0,.55)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); });
    TEX.menu = ctex(400, 230, menuBoard);
    TEX.deck = ctex(256, 256, wood('#a9805a', '#5a3a22', 24), 4, 4);
    TEX.helipad = ctex(512, 512, (g, w) => {
      g.fillStyle = '#3a3836'; g.fillRect(0, 0, w, w);
      for (let i = 0; i < 3000; i++) { g.fillStyle = rnd() < .5 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.06)'; g.fillRect(rnd() * w, rnd() * w, 2, 2); }
      g.strokeStyle = '#f4f1ea'; g.lineWidth = 18; g.beginPath(); g.arc(w / 2, w / 2, w * .36, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#f4f1ea'; g.fillRect(w * .36, w * .3, w * .06, w * .4); g.fillRect(w * .58, w * .3, w * .06, w * .4); g.fillRect(w * .36, w * .47, w * .28, w * .06);
    });
    TEX.bikeSign = ctex(240, 320, (g, w, h) => {
      g.fillStyle = '#1f1d1c'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#f1ede6'; g.font = '700 34px sans-serif'; g.fillText('E-BIKE', 24, 62);
      g.font = '20px sans-serif'; g.fillStyle = '#b98a5e'; g.fillText('ยืมได้ · ชาร์จแล้ว', 24, 98);
      for (let i = 0; i < 5; i++) { g.fillStyle = '#3fb950'; g.fillRect(24 + i * 40, 140, 30, 60); g.fillStyle = '#1f1d1c'; g.fillRect(28 + i * 40, 144, 22, 10); }
      g.fillStyle = '#f1ede6'; g.font = '600 22px sans-serif'; g.fillText('5 / 5 คัน', 24, 250);
    });
    TEX.sofa = ctex(64, 64, fabric('#9a5f34'), 3, 3);
    TEX.chair = ctex(64, 64, fabric('#2b2f36'), 2, 2);
    TEX.mesh = ctex(64, 64, (g, w, h) => { g.fillStyle = '#20242a'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.08)'; for (let i = 0; i < w; i += 4) { g.fillRect(i, 0, 1, h); g.fillRect(0, i, w, 1); } }, 4, 4);
  }

  // ---------- materials ----------
  const M = {};
  // Hex colours are written in sRGB; the renderer works in linear light, so convert once here.
  const lin = h => new THREE.Color(h).convertSRGBToLinear();
  const std = (color, o) => { const m = new THREE.MeshStandardMaterial(Object.assign({ roughness: .8, metalness: 0 }, o || {})); m.color.copy(lin(color)); if (o && o.emissive !== undefined) m.emissive.copy(lin(o.emissive)); return m; };
  // clear-coated physical material for water and glass: a sharp wet highlight over the base, the Sims-style sheen
  const phys = (color, o) => { const m = new THREE.MeshPhysicalMaterial(Object.assign({ roughness: .8, metalness: 0, clearcoat: 1, clearcoatRoughness: .06 }, o || {})); m.color.copy(lin(color)); return m; };
  // ---------- PBR texture sets (v58) ----------
  // CC0 sets from Poly Haven and ambientCG (1K WebP, colour + OpenGL normal + roughness), served beside the page under
  // assets/textures. avg is each colour map's mean sRGB colour and rough its roughness map's mean, both measured from
  // the files (sharp stats, 14 Oct 2026). A material made from a set takes colour = palette colour / avg and roughness =
  // old roughness / rough, so every surface keeps the brown, white and black tone the owner chose for its room and
  // its old sheen on average, now with real grain, weave and relief. tile is the metres one repeat of the set covers.
  const PBR_SETS = {
    oak_floor: { avg: [162.2, 117.6, 83.5], rough: 112.9, tile: 1.6 }, walnut_dark: { avg: [186.3, 153.9, 125.6], rough: 180.2, tile: 1.2 },
    plaster_wall: { avg: [141.8, 135.5, 122.2], rough: 231.6, tile: 2 }, cream_tile: { avg: [169.9, 151.9, 132.2], rough: 177.6, tile: 1 },
    wool_rug: { avg: [121.0, 117.5, 112.7], rough: 219.7, tile: 1 }, sofa_fabric: { avg: [117.8, 109.0, 96.4], rough: 167.7, tile: .6 },
    brushed_metal: { avg: [156.2, 160.5, 165.4], rough: 136.8, tile: .5 }, grass: { avg: [151.1, 131.5, 89.0], rough: 174.9, tile: 2 },
    pebble_path: { avg: [127.3, 117.3, 105.0], rough: 206.2, tile: 1 }, tree_bark: { avg: [94.8, 86.0, 63.6], rough: 230.3, tile: 1 }
  };
  const PBR = {};
  // one loading manager for every v58 file (textures, the HDR sky, the furniture models); __ao.ready() reads it
  function loadMgr() {
    if (!three.loading) { three.loading = new THREE.LoadingManager(() => { three.assetsReady = true; }, undefined, url => console.warn('asset did not load: ' + url)); three.assetsReady = false; }
    return three.loading;
  }
  function pbrTex(set, kind) {
    const key = set + '_' + kind; if (PBR[key]) return PBR[key];
    const t = new THREE.TextureLoader(loadMgr()).load('assets/textures/' + set + '/' + key + '.webp');
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = MAX_ANISO; t.colorSpace = kind === 'diff' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return (PBR[key] = t);
  }
  // Box mapping in the vertex shader: each face takes the two axes across it, divided by the tile size, so a texture
  // keeps its real size on any box, on the stretched shell and inside a merged batch alike. BOX_WORLD maps in world
  // space (floors, walls, built-in furniture); without it, in the object's own space (a movable seat's fabric stays put).
  const BOX_UV = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      #ifdef BOX_TILE
      {
        #ifdef BOX_WORLD
          vec3 bp = (modelMatrix * vec4(position, 1.0)).xyz; vec3 bn = abs(mat3(modelMatrix) * normal);
        #else
          vec3 bp = position; vec3 bn = abs(normal);
        #endif
        vec2 bu = (bn.y >= max(bn.x, bn.z) ? bp.xz : (bn.x >= bn.z ? bp.zy : bp.xy)) / BOX_TILE;
        #ifdef USE_MAP
          vMapUv = bu;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = bu;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = bu;
        #endif
      }
      #endif`);
  };
  // o: r (old roughness), metal (metalness), tile (metres), uv: 'world' (default), 'object', or 'mesh' (the mesh's own uv)
  function pbrMat(set, hex, o = {}) {
    const S = PBR_SETS[set], m = new THREE.MeshStandardMaterial({ map: pbrTex(set, 'diff'), normalMap: pbrTex(set, 'nor'), roughnessMap: pbrTex(set, 'rough'), metalness: o.metal || 0 });
    const c = lin(hex), a = new THREE.Color(S.avg[0] / 255, S.avg[1] / 255, S.avg[2] / 255).convertSRGBToLinear();
    m.color.setRGB(c.r / a.r, c.g / a.g, c.b / a.b);
    m.roughness = (o.r === undefined ? .8 : o.r) / (S.rough / 255);
    if (o.uv !== 'mesh') { m.defines = Object.assign({}, m.defines, { BOX_TILE: (o.tile || S.tile).toFixed(3) }); if (o.uv !== 'object') m.defines.BOX_WORLD = ''; m.onBeforeCompile = BOX_UV; }
    return m;
  }
  function makeMaterials() {
    Object.assign(M, {
      alu: pbrMat('brushed_metal', 0xc9cbce, { metal: .85, r: .32 }), aluDark: pbrMat('brushed_metal', 0x9a9da1, { metal: .8, r: .4 }),
      black: std(0x1c1d20, { roughness: .45 }), glossy: std(0x101114, { roughness: .2, metalness: .3 }),
      ceramic: std(0xf6f4ef, { roughness: .25 }), coffee: std(0x3b2414, { roughness: .15 }),
      chrome: std(0xdfe3e6, { metalness: 1, roughness: .18 }), walnut: pbrMat('walnut_dark', 0x6e4a32, { r: .55 }),
      oak: pbrMat('oak_floor', 0xc4996a, { r: .6 }), plaster: pbrMat('plaster_wall', 0xefe9df, { r: .95 }),
      wall2: pbrMat('plaster_wall', 0xf1ebe2, { r: .95 }), partition: pbrMat('plaster_wall', 0xf3eee6, { r: .9 }), glass: phys(0xcfe9f5, { roughness: .05, metalness: .1, transparent: true, opacity: .32, ior: 1.5, clearcoatRoughness: .03 }),
      frame: std(0x3a3f45, { metalness: .6, roughness: .4 }), chairFabric: pbrMat('sofa_fabric', 0x2b2f36, { r: .95, uv: 'object' }),
      chairMesh: std(0xffffff, { map: TEX.mesh, roughness: .9, transparent: true, opacity: .92 }), sofa: pbrMat('sofa_fabric', 0x9a5f34, { r: .95, uv: 'object' }),
      soil: std(0x3b2a1e, { roughness: 1 }), leaf: std(0x3f7f45, { roughness: .7 }), leaf2: std(0x58a05c, { roughness: .7 }), pot: std(0x1f1d1c, { roughness: .6 }),
      bark: pbrMat('tree_bark', 0x6a4a30, { r: 1 }), steel: pbrMat('brushed_metal', 0xb8c0c6, { metal: .7, r: .35 }), white: std(0xf4f4f2, { roughness: .4 }),
      book: [std(0x8a5a36), std(0x1f1d1c), std(0xe9e4d8), std(0xb98a5e), std(0x5a3a24), std(0xf4f1ea)],
      snow: std(0xf4f8fb, { roughness: .9 }), paver: pbrMat('pebble_path', 0xe3d8c6, { r: .85 }), puddle: std(0x6d7c88, { roughness: .05, metalness: .5 })
    });
  }

  // ---------- geometry helpers ----------
  // Every box gets a small rounded edge that catches the light, like furniture in The Sims 4: the corner
  // vertices of a lightly subdivided box are pushed onto a sphere of radius r around the inner box.
  const boxCache = new Map();
  function B(w, h, d) {
    const key = w.toFixed(3) + '|' + h.toFixed(3) + '|' + d.toFixed(3); if (boxCache.has(key)) return boxCache.get(key);
    const r = Math.min(.03, Math.min(w, h, d) * .22), g = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
    if (r > .002) {
      const p = g.attributes.position, hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r, v = new THREE.Vector3(), c = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); c.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z))); const n = v.clone().sub(c); if (n.lengthSq() > 1e-9) { v.copy(c).add(n.normalize().multiplyScalar(r)); p.setXYZ(i, v.x, v.y, v.z); } }
      g.computeVertexNormals();
    }
    boxCache.set(key, g); return g;
  }
  const Cy = (rt, rb, h, s = 16) => new THREE.CylinderGeometry(rt, rb, h, s);
  const Sp = (r, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs);
  function mesh(g, geo, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; }
  function grp(parent, x = 0, y = 0, z = 0, ry = 0) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g); return g; }
  // A seat people may later drag to where they use it and put back (owner, 14 Oct 2026: "ให้ตัวละคร ลากเก้าอี้ ลากโซฟา บีนแบ็กไปมาได้ แต่ต้องเก็บที่เดิมด้วย"):
  // its own Object3D, never merged into a static batch, with its kind and its home pose (in its parent's space) recorded at build time.
  function movable(o, kind) { o.userData.movable = kind; o.userData.home = { x: o.position.x, z: o.position.z, rotY: o.rotation.y }; return o; }
  // ---------- Poly Haven furniture (v58, CC0 glTF with meshopt) ----------
  // A model takes the place of a hand-built piece once it has loaded, at the same spot in the same parent (so it is
  // anchored inside the same room), scaled uniformly to the piece's height (h), width (w) or depth (d). Until then, or
  // if it never loads, the hand-built piece stays; it is kept out of the batches (userData.swap) so hiding it works.
  // tint: the palette colour the model's colour map is brought to on average (its mean measured from the image).
  /* binary assets inlined as data URIs: the artifact host does not serve .glb or .hdr (CC0, Poly Haven) */
  const EMBED_GLB = {'modern_coffee_table_01': 'assets/models/modern_coffee_table_01.glb', 'side_table_01': 'assets/models/side_table_01.glb', 'vintage_electric_kettle': 'assets/models/vintage_electric_kettle.glb'};
  const EMBED_HDR = 'assets/hdr/sky.hdr';
  /* vehicles and boats (v59): CC0 and CC-BY glTFs inlined as data URIs, credited in the page footer */
  const EMBED_VEH = {'veh_car2_concept': 'assets/models/veh_car2_concept.glb', 'veh_car_sedan': 'assets/models/veh_car_sedan.glb', 'veh_car_hatchback': 'assets/models/veh_car_hatchback.glb', 'veh_car_suv': 'assets/models/veh_car_suv.glb', 'veh_car_pickup': 'assets/models/veh_car_pickup.glb', 'veh_car_taxi': 'assets/models/veh_car_taxi.glb', 'veh_car_police': 'assets/models/veh_car_police.glb', 'veh_car_supercar': 'assets/models/veh_car_supercar.glb', 'veh_car_ambulance': 'assets/models/veh_car_ambulance.glb', 'veh_car_parcel_van': 'assets/models/veh_car_parcel_van.glb', 'veh_car_icecream_truck': 'assets/models/veh_car_icecream_truck.glb', 'veh_motorbike_scooter': 'assets/models/veh_motorbike_scooter.glb', 'veh_heli_civil': 'assets/models/veh_heli_civil.glb', 'veh_boat_watertaxi': 'assets/models/veh_boat_watertaxi.glb'};
  Object.assign(EMBED_GLB, EMBED_VEH);
  const MODELS = {}, TINTED = new Map();
  function model(name) {
    if (!GLTFLoader || !MeshoptDecoder) return Promise.reject(new Error('the glTF loader did not load'));
    if (!MODELS[name]) { const l = new GLTFLoader(loadMgr()); l.setMeshoptDecoder(MeshoptDecoder); MODELS[name] = l.loadAsync(EMBED_GLB[name] || ('assets/models/' + name + '.glb')).then(gl => gl.scene); }
    return MODELS[name];
  }
  function meanColour(m) {
    if (!m.map || !m.map.image) return m.color.clone();
    const c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d'); x.drawImage(m.map.image, 0, 0, 16, 16);
    const d = x.getImageData(0, 0, 16, 16).data; let r = 0, g = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4; return new THREE.Color(r / n / 255, g / n / 255, b / n / 255).convertSRGBToLinear().multiply(m.color);
  }
  function tinted(m, hex) {
    const k = m.uuid + hex; if (TINTED.has(k)) return TINTED.get(k);
    const t = m.clone(), a = meanColour(m), c = lin(hex); t.color.setRGB(m.color.r * c.r / Math.max(a.r, .01), m.color.g * c.g / Math.max(a.g, .01), m.color.b * c.b / Math.max(a.b, .01));
    TINTED.set(k, t); return t;
  }
  function swapIn(hand, name, fit) {
    hand.userData.swap = name; const parent = fit.parent || hand.parent;
    model(name).then(src => {
      const m = src.clone(true), b = new THREE.Box3().setFromObject(m), size = b.getSize(new THREE.Vector3());
      const s = fit.h ? fit.h / size.y : fit.w ? fit.w / size.x : fit.d / size.z;
      m.scale.setScalar(s); m.position.set(-(b.min.x + b.max.x) / 2 * s, -b.min.y * s, -(b.min.z + b.max.z) / 2 * s);
      m.traverse(o => { if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = true; if (fit.tint && !(o.material.transparent || /glass/i.test(o.material.name))) o.material = tinted(o.material, fit.tint); });
      const g = new THREE.Group(); g.add(m); g.position.set(fit.x, fit.y || 0, fit.z); g.rotation.y = fit.ry || 0; g.userData.model = name;
      parent.add(g); hand.visible = false; hand.userData.modelGroup = g; USE.dirty = true;
    }).catch(e => console.warn('model ' + name + ' did not load; the hand-built piece stays', e));
    return hand;
  }
  // A box placed by its back-left floor corner, like the plan of the rooms.
  function block(parent, x, z, w, d, h, m, y0 = 0) { return mesh(parent, B(w, h, d), m, x + w / 2, y0 + h / 2, z + d / 2); }
  const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z); // the front of every prop and person is +z

  // ---------- props ----------
  // a top-end ergonomic chair: polished five-star base on casters, gas lift, synchro tilt, a tall woven mesh back
  // with adjustable lumbar, a headrest and 4D armrests
  function premiumChair(parent, x, z, ry) {
    const g = grp(parent, x, 0, z, ry), alu = std(0xd7dadd, { roughness: .2, metalness: .9 }), mesh_ = std(0x2b2d30, { roughness: .85 }), pad = std(0x1c1d1f, { roughness: .6 });
    for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5, leg = mesh(g, B(.05, .035, .34), alu, Math.sin(a) * .17, .08, Math.cos(a) * .17); leg.rotation.y = a; const w = mesh(g, Cy(.035, .035, .04, 12), M.black, Math.sin(a) * .33, .035, Math.cos(a) * .33); w.rotation.z = Math.PI / 2; }
    mesh(g, Cy(.03, .03, .3, 12), M.black, 0, .25, 0); mesh(g, Cy(.022, .022, .14, 10), alu, 0, .43, 0);
    mesh(g, B(.36, .06, .3), M.black, 0, .48, 0);
    mesh(g, B(.5, .07, .48), mesh_, 0, .53, .02);
    mesh(g, B(.52, .025, .5), pad, 0, .5, .02);
    // back: frame, woven mesh, lumbar pad, headrest
    const back = grp(g, 0, .56, -.24, 0); back.rotation.x = -.12;
    mesh(back, B(.05, .62, .05), M.black, 0, .3, -.03);
    mesh(back, B(.48, .66, .025), mesh_, 0, .45, 0); mesh(back, B(.5, .025, .04), M.black, 0, .79, 0); mesh(back, B(.5, .025, .04), M.black, 0, .12, 0);
    [-.25, .25].forEach(sx => mesh(back, B(.025, .68, .04), M.black, sx, .45, 0));
    mesh(back, B(.36, .09, .04), pad, 0, .3, .03);
    mesh(back, B(.05, .16, .03), M.black, 0, .88, -.01); mesh(back, B(.34, .14, .06), pad, 0, .98, .02);
    // armrests on height-adjustable posts
    [-.28, .28].forEach(sx => { mesh(g, B(.04, .22, .06), M.black, sx, .65, -.02); mesh(g, B(.08, .03, .26), pad, sx, .77, 0); });
    movable(g, 'chair'); reg(g, 'เก้าอี้สุขภาพรุ่นท็อป', [{ th: 'นั่งปรับเก้าอี้', how: 'sit', d: .05 }]);
    return g;
  }
  function ergoChair(parent, x, z, ry) {
    const g = grp(parent, x, 0, z, ry);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      const leg = mesh(g, B(.04, .03, .3), M.black, Math.sin(a) * .15, .06, Math.cos(a) * .15); leg.rotation.y = a;
      mesh(g, Sp(.025, 8, 6), M.black, Math.sin(a) * .29, .025, Math.cos(a) * .29);
    }
    mesh(g, Cy(.025, .025, .3, 10), M.chrome, 0, .22, 0);
    mesh(g, B(.46, .07, .44), M.chairFabric, 0, .44, 0);
    const back = mesh(g, B(.44, .5, .03), M.chairMesh, 0, .8, -.24); back.rotation.x = -.1;
    mesh(g, B(.04, .42, .03), M.black, 0, .66, -.27);
    mesh(g, B(.34, .1, .05), M.chairFabric, 0, .66, -.21);
    const head = mesh(g, B(.26, .1, .05), M.chairFabric, 0, 1.13, -.29); head.rotation.x = -.1;
    [-1, 1].forEach(s => { mesh(g, B(.03, .18, .03), M.black, s * .25, .56, -.03); mesh(g, B(.06, .03, .24), M.black, s * .25, .66, 0); });
    movable(g, 'chair'); reg(g, 'เก้าอี้เพื่อสุขภาพ', [{ th: 'นั่งพัก', how: 'sit', d: .02 }]);
    return g;
  }
  function screenMat(tex) { return new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }); }
  function macbook(parent, x, y, z, ry, tex) {
    const g = grp(parent, x, y, z, ry);
    mesh(g, B(.32, .012, .22), M.alu, 0, .006, 0);
    mesh(g, B(.28, .002, .1), M.black, 0, .013, -.035);
    mesh(g, B(.11, .001, .065), M.aluDark, 0, .013, .06);
    const lid = grp(g, 0, .012, -.108); lid.rotation.x = -.28;
    mesh(lid, B(.32, .21, .007), M.alu, 0, .105, 0);
    mesh(lid, new THREE.PlaneGeometry(.29, .18), screenMat(tex), 0, .107, .0042);
    reg(g, 'MacBook', [{ th: 'เปิด/ปิด MacBook', fx: ix => { const lid = ix.obj.children[3], scr = lid && lid.children[1]; if (scr) scr.visible = !scr.visible; }, done: 'สลับหน้าจอแล้ว' }]);
    return g;
  }
  function monitor(parent, x, y, z, ry, tex, w = .6) {
    const g = grp(parent, x, y, z, ry);
    mesh(g, B(.24, .012, .17), M.alu, 0, .006, 0);
    mesh(g, B(.05, .3, .02), M.alu, 0, .16, -.05);
    mesh(g, B(w, w * .58, .025), M.glossy, 0, .4, -.03);
    mesh(g, new THREE.PlaneGeometry(w - .025, w * .58 - .025), screenMat(tex), 0, .4, -.0165);
    reg(g, 'จอมอนิเตอร์', [{ th: 'เปิด/ปิดจอ', fx: ix => { const scr = ix.obj.children[3]; if (scr) scr.visible = !scr.visible; }, done: 'สลับจอแล้ว' }]);
    return g;
  }
  function keyboard(parent, x, y, z, ry) {
    const g = grp(parent, x, y, z, ry);
    mesh(g, B(.36, .012, .12), M.alu, 0, .006, 0); mesh(g, B(.33, .004, .09), M.white, 0, .014, 0);
    const mouse = mesh(g, Sp(.03, 12, 8), M.white, .27, .012, .01); mouse.scale.set(.75, .4, 1.2);
    reg(g, 'คีย์บอร์ด', [{ th: 'นั่งพิมพ์งาน', how: 'desk' }]);
  }
  function mug(parent, x, y, z, m) {
    const g = grp(parent, x, y, z);
    mesh(g, Cy(.038, .033, .095, 20), m || M.ceramic, 0, .0475, 0);
    const h = mesh(g, new THREE.TorusGeometry(.025, .007, 8, 16, Math.PI), m || M.ceramic, .042, .05, 0); h.rotation.z = -Math.PI / 2;
    mesh(g, Cy(.033, .033, .004, 20), M.coffee, 0, .09, 0);
    reg(g, 'แก้วกาแฟ', [{ th: 'นั่งจิบกาแฟ', how: 'desk' }]);
    return g;
  }
  // ---------- foliage (owner, 14 Oct 2026: "ต้นไม้ มีใบสมจริง ไม่ใช่เป็นก้อนกลมๆ ทาสี ทุกจุด") ----------
  // Leaves are alpha-cut cards: a near-white leaf texture tinted by the material colour, so one texture serves
  // green, autumn and snow. Each cluster is three crossed vertical cards plus a flat one, merged per tree.
  function leafTex() {
    return ctex(256, 256, (g, w) => {
      g.clearRect(0, 0, w, w);
      for (let i = 0; i < 300; i++) {
        const x = 20 + rnd() * (w - 40), y = 20 + rnd() * (w - 40), r = Math.hypot(x - w / 2, y - w / 2);
        if (r > w * .47) continue;
        const l = 200 + Math.floor(rnd() * 55); g.save(); g.translate(x, y); g.rotate(rnd() * Math.PI * 2);
        g.fillStyle = `rgb(${l - 10},${l},${l - 25})`; g.beginPath(); g.ellipse(0, 0, 4 + rnd() * 3, 9 + rnd() * 5, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = `rgba(80,90,60,.5)`; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -9); g.lineTo(0, 9); g.stroke(); g.restore();
      }
    });
  }
  function pineTex() {
    return ctex(128, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (let row = 0; row < 26; row++) {
        const y = 10 + row * 9, half = (row + 2) / 28 * w * .48;
        for (let k = 0; k < 18; k++) { const l = 190 + Math.floor(rnd() * 60); g.strokeStyle = `rgb(${l - 20},${l},${l - 30})`; g.lineWidth = 1.6; g.beginPath(); const sx = w / 2 + (rnd() - .5) * 6; g.moveTo(sx, y); g.lineTo(w / 2 + (rnd() < .5 ? -1 : 1) * half * (.5 + rnd() * .5), y + 8 + rnd() * 6); g.stroke(); }
      }
      g.fillStyle = '#6b5a44'; g.fillRect(w / 2 - 2, h - 14, 4, 14);
    });
  }
  function hedgeTex() {
    return ctex(128, 128, (g, w) => {
      g.fillStyle = '#2f5233'; g.fillRect(0, 0, w, w);
      for (let i = 0; i < 700; i++) { g.fillStyle = ['#3d6438', '#4f7d3c', '#5d8c44', '#2a4a2e'][Math.floor(rnd() * 4)]; g.save(); g.translate(rnd() * w, rnd() * w); g.rotate(rnd() * 6); g.beginPath(); g.ellipse(0, 0, 2.5, 5, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
    }, 2, 1);
  }
  // Merge leaf-card clusters into one geometry: [{x, y, z, s, a}] in the tree's local frame.
  function cardsGeo(cards, tall = 1) {
    const pos = [], uv = [], nor = [], idx = []; let v = 0;
    // v59: each card's normals point out from the canopy's centre (blended with up), so the crown shades like a volume
    const cx = cards.reduce((a, c) => a + c.x, 0) / cards.length, cy = cards.reduce((a, c) => a + c.y, 0) / cards.length, cz = cards.reduce((a, c) => a + c.z, 0) / cards.length;
    const nv = new THREE.Vector3();
    const quad = (p) => { p.forEach(q => { pos.push(...q); nv.set(q[0] - cx, (q[1] - cy) * .8, q[2] - cz); if (nv.lengthSq() < 1e-6) nv.set(0, 1, 0); nv.normalize().multiplyScalar(.75).add({ x: 0, y: .55, z: 0 }).normalize(); nor.push(nv.x, nv.y, nv.z); }); uv.push(0, 0, 1, 0, 1, 1, 0, 1); idx.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4; };
    cards.forEach(c => {
      const h = c.s / 2 * tall;
      for (let k = 0; k < 3; k++) { const a = c.a + k * Math.PI / 3, dx = Math.cos(a) * c.s / 2, dz = Math.sin(a) * c.s / 2; quad([[c.x - dx, c.y - h, c.z - dz], [c.x + dx, c.y - h, c.z + dz], [c.x + dx, c.y + h, c.z + dz], [c.x - dx, c.y + h, c.z - dz]]); }
      if (tall <= 1.2) { const r = c.s * .45, a = c.a; const p = (u, w2) => [c.x + Math.cos(a) * u - Math.sin(a) * w2, c.y + h * .2, c.z + Math.sin(a) * u + Math.cos(a) * w2]; quad([p(-r, -r), p(r, -r), p(r, r), p(-r, r)]); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    return g;
  }
  function leafMat(tex, color) { return new THREE.MeshStandardMaterial({ map: tex, color: lin(color), alphaTest: .45, side: THREE.DoubleSide, roughness: .8 }); }
  const LEAF_DEPTH = new Map();
  function foliage(parent, geo, mat, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    // one alpha-tested shadow material per leaf texture (v58: shared, so leaf cards of different trees can merge)
    if (!LEAF_DEPTH.has(mat.map)) LEAF_DEPTH.set(mat.map, new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: mat.map, alphaTest: .45 }));
    m.customDepthMaterial = LEAF_DEPTH.get(mat.map);
    parent.add(m); return m;
  }
  // v59 leaves (owner, 14 Oct 2026: "ใบไม้ ต้นไม้ ต้องสมจริงที่สุดกว่านี้"): every leaf-card material outdoors sways in the
  // wind in the vertex shader (a slow gust plus a fast flutter, growing with height, none inside the building), is lit
  // on both faces from its canopy normal, and lets the sun glow through when it stands behind the leaves
  const FOL = { time: { value: 0 }, wind: { value: 1 }, sunView: { value: null }, sunCol: { value: null } };
  const FOL_VERT = `
    { vec4 fw = modelMatrix * vec4(transformed, 1.);
      #ifdef USE_INSTANCING
        fw = modelMatrix * instanceMatrix * vec4(transformed, 1.);
      #endif
      float indoor = step(-.6, fw.x) * step(fw.x, 27.2) * step(-.6, fw.z) * step(fw.z, 17.4) * step(fw.y, 2.8);
      float amp = folWind * (1. - indoor) * clamp(fw.y / 4., 0., 1.6);
      vec3 gust = vec3(sin(folTime * 1.3 + fw.x * .35 + fw.z * .21), 0., cos(folTime * 1.1 + fw.x * .27 - fw.z * .33)) * .055;
      float fl = sin(folTime * 6.3 + dot(fw.xyz, vec3(3.1, 2.7, 4.3))) * .014;
      transformed += (gust + vec3(fl, fl * .6, -fl)) * amp; }`;
  const patched = new WeakSet();
  function foliagePatch(m) {
    if (!m || patched.has(m)) return; patched.add(m);
    if (!FOL.sunView.value) { FOL.sunView.value = new THREE.Vector3(0, 1, 0); FOL.sunCol.value = new THREE.Color(1, 1, 1); }
    const depth = !!m.isMeshDepthMaterial;
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { folTime: FOL.time, folWind: FOL.wind, folSunV: FOL.sunView, folSunC: FOL.sunCol });
      sh.vertexShader = 'uniform float folTime, folWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + FOL_VERT);
      if (depth) return;
      sh.fragmentShader = 'uniform vec3 folSunV, folSunC;\n' + sh.fragmentShader.replace('#include <normal_fragment_begin>', FACE_UP())
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          { float back = pow(max(dot(-normalize(vViewPosition), folSunV), 0.), 3.); reflectedLight.directDiffuse += diffuseColor.rgb * folSunC * back * .45; }`);
    };
    m.customProgramCacheKey = () => 'foliage59' + (depth ? 'D' : '');
  }
  // every leaf and needle card in the map, and its shadow material; run once the map is built, before the batches
  function patchFoliage() {
    three.scene.traverse(o => {
      if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
      const mp = o.material.map; if (mp !== TEX.leaf && mp !== TEX.pine) return;
      foliagePatch(o.material); if (o.customDepthMaterial) foliagePatch(o.customDepthMaterial);
    });
  }
  // a cloud of clusters inside an ellipsoid canopy
  function canopyCards(n, cy, rx, ry, size) {
    const out = [];
    for (let i = 0; i < n; i++) { const u = rnd() * Math.PI * 2, v = Math.acos(2 * rnd() - 1), k = Math.cbrt(rnd()); out.push({ x: Math.sin(v) * Math.cos(u) * rx * k, y: cy + Math.cos(v) * ry * k, z: Math.sin(v) * Math.sin(u) * rx * k, s: size * (.8 + rnd() * .4), a: rnd() * Math.PI }); }
    return out;
  }
  function plant(parent, x, z, s = 1) {
    const g = grp(parent, x, 0, z);
    mesh(g, Cy(.17 * s, .13 * s, .32 * s, 20), M.pot, 0, .16 * s, 0);
    mesh(g, Cy(.16 * s, .16 * s, .02, 20), M.soil, 0, .31 * s, 0);
    foliage(g, cardsGeo(canopyCards(7, .62 * s, .2 * s, .2 * s, .32 * s)), leafMat(TEX.leaf, 0x4f8a4a));
    for (let i = 0; i < 4; i++) { const a = i * 1.6 + rnd(); const st = mesh(g, Cy(.008 * s, .012 * s, .35 * s, 5), M.bark, Math.cos(a) * .05 * s, .45 * s, Math.sin(a) * .05 * s); st.rotation.set(Math.sin(a) * .4, 0, -Math.cos(a) * .4); }
    reg(g, 'ต้นไม้', [{ th: 'รดน้ำต้นไม้', how: 'front', d: .6, done: 'รดน้ำแล้ว' }]);
    return g;
  }
  function tree(parent, x, z, s = 1) {
    const g = grp(parent, x, 0, z);
    const trunk = mesh(g, Cy(.09 * s, .17 * s, 1.9 * s, 10), M.bark, 0, .95 * s, 0); trunk.rotation.z = (rnd() - .5) * .08;
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + rnd() * .6, br = mesh(g, Cy(.03 * s, .06 * s, 1.1 * s, 6), M.bark, Math.cos(a) * .3 * s, 1.75 * s, Math.sin(a) * .3 * s); br.rotation.set(Math.sin(a) * .7, 0, -Math.cos(a) * .7); }
    const m = leafMat(TEX.leaf, 0x3f7f45); three.canopies.push({ m, i: three.canopies.length });
    foliage(g, cardsGeo(canopyCards(16, 2.15 * s, 1.15 * s, .85 * s, 1.1 * s)), m);
    reg(g, 'ต้นไม้ใหญ่', [{ th: 'เดินเล่นใต้ร่มไม้', how: 'front', d: 1.4, spread: .7 }]);
  }
  function bookshelf(parent, x, z, ry, w = 1.6, h = 1.9) {
    const g = grp(parent, x, 0, z, ry);
    mesh(g, B(w, h, .03), M.walnut, 0, h / 2, -.16);
    [-1, 1].forEach(s => mesh(g, B(.03, h, .34), M.walnut, s * (w / 2 - .015), h / 2, 0));
    for (let r = 0; r < 5; r++) {
      const y = .05 + r * (h - .1) / 4; mesh(g, B(w, .03, .34), M.walnut, 0, y, 0);
      if (r === 4) break;
      let bx = -w / 2 + .05;
      while (bx < w / 2 - .12) {
        const bw = .03 + rnd() * .04, bh = .22 + rnd() * .12;
        if (rnd() < .12) { bx += .08; continue; }
        const b = mesh(g, B(bw, bh, .22), M.book[Math.floor(rnd() * M.book.length)], bx + bw / 2, y + .015 + bh / 2, 0);
        if (rnd() < .08) b.rotation.z = .25;
        bx += bw + .004;
      }
    }
    reg(g, 'ชั้นหนังสือ', [{ th: 'หยิบหนังสืออ่าน', how: 'front', d: .8, spread: .5 }]);
    return g;
  }
  function floorLamp(parent, x, z) {
    const g = grp(parent, x, 0, z);
    mesh(g, Cy(.14, .16, .03, 20), M.black, 0, .015, 0); mesh(g, Cy(.012, .012, 1.5, 8), M.black, 0, .76, 0);
    const shade = mesh(g, Cy(.14, .22, .26, 20, 1, true), std(0xf3ead6, { side: THREE.DoubleSide, emissive: 0xffd9a0, emissiveIntensity: 0 }), 0, 1.52, 0);
    const light = new THREE.PointLight(0xffd9a0, 0, 5, 2); light.position.set(0, 1.45, 0); g.add(light);
    three.lamps.push({ bulb: shade, light });
    reg(g, 'โคมไฟตั้งพื้น', [{ th: 'นั่งอ่านหนังสือใต้โคมไฟ', how: 'desk' }]);
  }
  function sofa(parent, x, z, ry) {
    // v58: Poly Haven sofa_02 was tried here and left out: a distressed leather chesterfield, not this room's soft modern sofa
    const g = grp(parent, x, 0, z, ry), h = g;
    mesh(h, B(2.1, .22, .9), M.sofa, 0, .2, 0);
    [-.52, .52].forEach(dx => { const c = mesh(h, B(1, .14, .78), M.sofa, dx, .38, .04); c.scale.y = 1; });
    mesh(h, B(2.1, .55, .22), M.sofa, 0, .55, -.36);
    [-1, 1].forEach(s => mesh(h, B(.2, .42, .9), M.sofa, s * 1.0, .42, 0));
    [[-.7, .62, 0xf2ece2], [.6, .66, 0x1f1d1c]].forEach(([dx, y, c]) => { const p = mesh(g, B(.36, .32, .1), std(c, { roughness: .95 }), dx, y, -.2); p.rotation.set(-.3, 0, (rnd() - .5) * .3); });
    [-1, 1].forEach(s => mesh(h, Cy(.025, .02, .1, 8), M.black, s * .95, .05, .35));
    movable(g, 'sofa'); reg(g, 'โซฟา', [{ th: 'นั่งพักบนโซฟา', how: 'sit', d: .12, spread: .6 }]);
    return g;
  }

  // ---------- the building ----------
  // The building is drawn on a 16 x 12 plan and stretched by K so every room is roomier (owner, 14 Oct 2026:
  // "ขยายพื้นที่ห้องกว้างขวางทุกห้อง ไม่แออัด"). Walls and floors stretch; furniture keeps its real size and
  // moves with its room: things against a wall stay on that wall, everything else keeps its place around
  // the room's centre.
  // A lived-in kitchen (owner, 14 Oct 2026: "ห้องครัวโล่งไปหน่อย ใส่อะไรเพิ่มมาที"; the rug came out again: "พรมในห้องครัวไม่สวยเลย เอาออก"):
  // three pendants over the dining table, two pendants over the island, an open walnut shelf of jars and plates on the back wall, a wall clock, a
  // coffee and tea station in the empty front corner, a fruit bowl and a bread board, a tall plant and recycling bins.
  // Building coordinates; the kitchen spans x 16.8 to 26.6 and z 7 to 16.8.
  function kitchenExtras(root) {
    const walnut = M.walnut, black = M.black;
    // open shelf on the back wall: two walnut boards with jars, plates and a small plant
    // (on the solid wall above the back counter; x 17.36 to 19.04 is the doorway from the corridor)
    [1.35, 1.75].forEach(y => block(root, 23.0, 7.02, 2.0, .26, .035, walnut, y));
    for (let i = 0; i < 5; i++) { const x = 23.2 + i * .36; mesh(root, Cy(.06, .06, .18, 14), std(0xeef3f2, { transparent: true, opacity: .55, roughness: .1 }), x, 1.385 + .09, 7.15); mesh(root, Cy(.062, .062, .025, 14), [walnut, black][i % 2], x, 1.385 + .19, 7.15); mesh(root, Cy(.05, .05, .1, 12), std([0xc98a3a, 0x7d8f5a, 0xb5652a, 0xe0d2b8, 0x5a3a22][i], { roughness: 1 }), x, 1.385 + .05, 7.15); }
    for (let i = 0; i < 4; i++) { const pl = mesh(root, Cy(.14, .14, .015, 24), std(0xf4f1ea, { roughness: .4 }), 23.35 + i * .03, 1.785 + .14, 7.12); pl.rotation.x = Math.PI / 2 - .12; }
    plant(root, 24.7, 7.15, .45).position.y = 1.785;
    // a round wall clock above the shelf
    { const ck = grp(root, 25.7, 1.6, 7.03, 0); const face = mesh(ck, Cy(.17, .17, .03, 32), std(0xf4f1ea, { roughness: .5 }), 0, 0, 0); face.rotation.x = Math.PI / 2; const rim = mesh(ck, new THREE.TorusGeometry(.17, .012, 8, 32), black, 0, 0, .012);
      mesh(ck, B(.012, .11, .005), black, 0, .045, .02); const mh = mesh(ck, B(.009, .15, .005), black, .03, .03, .022); mh.rotation.z = -1.1; }
    // coffee and tea station in the front right corner: a walnut cabinet with an espresso machine, a grinder, mugs and a kettle
    const cab = block(root, 22.7, 16.05, 2.6, .62, .88, walnut);
    block(root, 22.68, 16.03, 2.64, .66, .035, std(0xe8e4dc, { roughness: .35 }), .88);
    const esp = grp(root, 23.3, .915, 16.32, Math.PI); mesh(esp, B(.36, .38, .32), M.chrome || std(0xc9ccd0, { metalness: .8, roughness: .25 }), 0, .19, 0); mesh(esp, B(.3, .04, .2), black, 0, .02, -.08); mesh(esp, Cy(.03, .03, .08, 10), black, -.07, .14, -.18).rotation.x = Math.PI / 2;
    const gr = grp(root, 23.85, .915, 16.32, 0); mesh(gr, B(.16, .2, .18), black, 0, .1, 0); mesh(gr, Cy(.07, .04, .16, 14), std(0x5a3a22, { transparent: true, opacity: .8 }), 0, .28, 0);
    [24.25, 24.4, 24.55].forEach(x => mug(root, x, .915, 16.2));
    swapIn(mesh(root, Cy(.08, .1, .2, 16), std(0xe8e4dc, { roughness: .3 }), 24.95, .915 + .1, 16.32), 'vintage_electric_kettle', { x: 24.95, y: .915, z: 16.32, ry: Math.PI, h: .24 });
    reg(cab, 'สถานีกาแฟและชา', [{ th: 'ชงกาแฟ', how: 'front', d: .55, dir: [0, -1] }, { th: 'ชงชา', how: 'front', d: .55, dir: [0, -1] }]);
    // fruit bowl on the island, a bread board on the dining table
    mesh(root, Cy(.2, .1, .1, 24), std(0xe8e4dc, { roughness: .4 }), 23.6, .88 + .05, 11.95);
    [[0, 0, 0xd94a2b], [.07, .04, 0xe8a33a], [-.06, .05, 0x7da843], [.02, -.07, 0xd94a2b], [-.04, -.04, 0xe8c33a]].forEach(([dx, dz, c]) => mesh(root, Sp(.055, 12, 10), std(c, { roughness: .6 }), 23.6 + dx, .88 + .13, 11.95 + dz));
    block(root, 19.6, 11.85, .5, .3, .025, walnut, .78); mesh(root, Cy(.09, .09, .1, 14), std(0xc98a3a, { roughness: .9 }), 19.85, .78 + .075, 12.0).rotation.z = Math.PI / 2;
    // a wooden counter along the low partition (x 19.15 to 22.25), drawers and doors, a stone top and a hand-wash sink
    {
      const oak = M.walnut, x0 = 19.15, x1 = 22.25, z0 = 7.06, dep = .62, h = .88;
      block(root, x0, z0, x1 - x0, dep, h - .1, oak, .1); block(root, x0 + .04, z0 + .04, x1 - x0 - .08, dep - .1, .1, black);
      for (let x = x0 + .52; x < x1 - .1; x += .52) block(root, x - .005, z0 + dep, .01, .006, h - .16, std(0x5a3f2c, { roughness: .8 }), .12);
      for (let x = x0 + .2; x < x1; x += .52) block(root, x, z0 + dep + .004, .14, .012, .018, M.chrome, h - .2);
      const top = block(root, x0 - .02, z0 - .02, x1 - x0 + .04, dep + .05, .04, std(0xe8e4dc, { roughness: .35 }), h);
      const sx = 21.45, sz = z0 + .32;
      mesh(root, B(.46, .03, .36), std(0xf4f6f6, { roughness: .2 }), sx, h + .025, sz); mesh(root, B(.4, .02, .3), std(0xb8c4c8, { roughness: .15, metalness: .4 }), sx, h + .035, sz);
      const fa = grp(root, sx, h + .04, z0 + .1, 0); mesh(fa, Cy(.022, .026, .3, 12), M.chrome, 0, .15, 0); const sp = mesh(fa, Cy(.015, .015, .2, 10), M.chrome, 0, .29, .09); sp.rotation.x = Math.PI / 2; mesh(fa, B(.08, .015, .02), M.chrome, .05, .24, 0);
      mesh(root, Cy(.035, .04, .16, 12), std(0x3a5248, { roughness: .4 }), sx - .38, h + .08, z0 + .14); mesh(root, Cy(.01, .01, .05, 8), black, sx - .38, h + .18, z0 + .14);
      block(root, sx + .3, z0 + .04, .26, .12, .3, std(0xf4f1ea, { roughness: .5 }), 1.25);
      // an electric induction hob with a ceiling hood over it (owner, 14 Oct 2026: "มีเตาไฟฟ้าและฮู๊ดดูดควันด้วย")
      const ind = block(root, 19.4, z0 + .06, .62, .5, .012, std(0x111214, { roughness: .08, metalness: .3 }), h + .04);
      [[19.56, .17, .1], [19.86, .17, .08], [19.56, .4, .08], [19.86, .4, .1]].forEach(([x, dz, r]) => { const c = mesh(root, new THREE.TorusGeometry(r, .004, 6, 28), std(0x3a3c40, { emissive: 0xff5a1f, emissiveIntensity: 0 }), x, h + .053, z0 + .06 + dz); c.rotation.x = Math.PI / 2; });
      block(root, 19.45, z0 + .5, .5, .03, .006, std(0x6b7075), h + .053);
      block(root, 19.3, z0 + .02, .82, .5, .1, M.chrome, 1.72); block(root, 19.55, z0 + .12, .32, .26, 2.4 - 1.82, M.chrome, 1.82);
      block(root, 19.34, z0 + .06, .74, .42, .006, std(0x2a2c30, { roughness: .6 }), 1.715);
      reg(ind, 'เตาไฟฟ้าและฮู้ดดูดควัน', [{ th: 'ทำอาหาร (สุ่มเมนู)', how: 'front', d: .55, dir: [0, 1], fx: () => setTimeout(() => cookDish(), 0) }]);
      mesh(root, Cy(.05, .05, .25, 14), std(0x7d8f5a, { roughness: .9 }), 20.6, h + .125, z0 + .3); plant(root, 20.6, z0 + .3, .35).position.y = h + .25;
      [20.2, 20.36].forEach((x, i) => mesh(root, Cy(.06, .06, [.24, .18][i], 14), std(0xeef3f2, { transparent: true, opacity: .55, roughness: .1 }), x, h + [.12, .09][i], z0 + .3));
      reg(top, 'อ่างล้างมือ', [{ th: 'ล้างมือ', how: 'front', d: .45, dir: [0, 1] }]);
    }
    // three recycling bins by the side counter
    [[0x2b7bb9, 'กระดาษ'], [0xe0b03a, 'พลาสติก'], [0x3f6b38, 'ทั่วไป']].forEach(([c], i) => { const b = block(root, 25.85, 14.55 + i * .4, .36, .34, .62, std(c, { roughness: .6 })); if (!i) reg(b, 'ถังแยกขยะ', [{ th: 'ทิ้งขยะ', how: 'front', d: .5, dir: [-1, 0] }]); });
  }
  function wallClash() {
    if (!three.shell) return [];
    three.scene.updateMatrixWorld(true);
    const b = new THREE.Box3(), walls = [], hits = [], figs = new Set();
    three.shell.children.forEach(m => { if (!m.isMesh) return; b.setFromObject(m); const dx = b.max.x - b.min.x, dz = b.max.z - b.min.z; if (b.max.y - b.min.y < .5 || Math.min(dx, dz) > .4) return; walls.push({ min: b.min.clone(), max: b.max.clone(), ax: dx < dz ? 'x' : 'z' }); });
    three.figures.forEach(f => f.traverse(o => figs.add(o)));
    three.scene.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || o.userData.batch || figs.has(o)) return; // a merged batch is measured through its hidden originals
      for (let a = o; a; a = a.parent) if (a === three.shell) return;
      b.setFromObject(o); if (b.isEmpty() || b.max.y < .2) return;
      // an indoor object (its centre on the floor plate) never reaches past the plate's edge, walled or open
      const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2, X1 = 19 * K, Z1 = 12 * K;
      if (cx > 0 && cx < X1 && cz > 0 && cz < Z1 && b.max.y < 2.6 && (b.min.x < -.02 || b.max.x > X1 + .02 || b.min.z < -.02 || b.max.z > Z1 + .02)) {
        let ix = null; for (let a = o; a; a = a.parent) if (a.userData && a.userData.ix !== undefined) { ix = a.userData.ix; break; }
        hits.push({ name: ix === null ? o.geometry.type : IX[ix].name, x: +cx.toFixed(2), z: +cz.toFixed(2), wall: 'edge of the building' }); return;
      }
      if (b.max.x - b.min.x > 8 || b.max.z - b.min.z > 8 || b.max.x < FOOT.x0 - 3 || b.min.x > FOOT.x1 + 3 || b.max.z < FOOT.z0 - 3 || b.min.z > FOOT.z1 + 3) return;
      for (const w of walls) {
        if (b.max.y <= w.min.y + .02 || b.min.y >= w.max.y - .02) continue;
        const ax = w.ax, ot = ax === 'x' ? 'z' : 'x';
        if (Math.min(b.max[ot], w.max[ot]) - Math.max(b.min[ot], w.min[ot]) < .05) continue;
        if (b.min[ax] < w.min[ax] - .02 && b.max[ax] > w.max[ax] + .02) { let ix = null; for (let a = o; a; a = a.parent) if (a.userData && a.userData.ix !== undefined) { ix = a.userData.ix; break; } hits.push({ name: ix === null ? o.geometry.type : IX[ix].name, x: +((b.min.x + b.max.x) / 2).toFixed(2), z: +((b.min.z + b.max.z) / 2).toFixed(2), wall: ax + ' ' + w.min[ax].toFixed(2) }); break; }
      }
    });
    return hits;
  }
  // ---------- static batching (v58) ----------
  // About 6,600 meshes drew about 6,900 calls a frame. Once the map is built, every mesh nothing refers to again (not
  // held by three.*, not inside an interactive IX object or a movable seat, not transparent, not instanced) is merged
  // with the others whose material matches in everything but its colour, its shadow flags and its 12 m cell: the
  // colour moves into a vertex colour, which the shader multiplies exactly as it did the material colour, so a frame
  // draws a few hundred calls and frustum culling still works cell by cell. A material three.* holds keeps its own
  // identity, since the time of day and the weather recolour it. The originals stay in the scene, hidden, so
  // wallClash() still measures every piece on its own. An IX object, a movable seat and a person are merged only
  // within themselves (a person per limb), so each still moves, turns and animates as one.
  const BATCH = { cell: 20, staticIx: new Set(), list: [], meshes: 0, own: 0, movable: [], sigs: new WeakMap(), tints: new Map() };
  function matSig(m) {
    if (BATCH.sigs.has(m)) return BATCH.sigs.get(m);
    const out = [];
    for (const k in m) {
      if (k === 'uuid' || k === 'id' || k === 'name' || k === 'version' || k === 'userData' || k === 'color' || k[0] === '_') continue;
      const v = m[k];
      if (v === null || v === undefined || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') out[out.length] = k + ':' + v;
      else if (v.isColor) out[out.length] = k + ':' + v.r.toFixed(5) + ',' + v.g.toFixed(5) + ',' + v.b.toFixed(5);
      else if (v.isTexture) out[out.length] = k + ':' + v.uuid;
      else if (v.isVector2 || v.isVector3 || v.isEuler) out[out.length] = k + ':' + v.toArray().join(',');
      else if (typeof v === 'function') { if (Object.prototype.hasOwnProperty.call(m, k)) out[out.length] = k + ':' + String(v); }
      else if (Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype) out[out.length] = k + ':' + JSON.stringify(v);
      else out[out.length] = k + ':' + m.uuid; // anything else keeps the material its own
    }
    const s = out.join('|'); BATCH.sigs.set(m, s); return s;
  }
  // the shared material of a colour-merged batch: the original with a white colour and vertex colours on
  function tintMat(m) {
    const k = matSig(m); if (BATCH.tints.has(k)) return BATCH.tints.get(k);
    const t = m.clone(); t.color.setRGB(1, 1, 1); t.vertexColors = true;
    if (Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile')) t.onBeforeCompile = m.onBeforeCompile;
    if (Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey')) t.customProgramCacheKey = m.customProgramCacheKey;
    BATCH.tints.set(k, t); return t;
  }
  // every attribute as plain float32 (a quantized or interleaved glTF attribute cannot take a matrix), always indexed;
  // with a tint, the colour attribute carries the material colour (times the mesh's own vertex colour, if it had one)
  function bakeGeo(src, m4, names, tint) {
    const g = new THREE.BufferGeometry(), n = src.attributes.position.count;
    names.forEach(nm => {
      const a = src.attributes[nm];
      if (nm === 'color') {
        const f = new Float32Array(n * 3), c = tint ? tint.c : null;
        for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) f[i * 3 + k] = (a && (!tint || tint.own) ? a.getComponent(i, k) : 1) * (c ? [c.r, c.g, c.b][k] : 1);
        g.setAttribute('color', new THREE.BufferAttribute(f, 3)); return;
      }
      const f = new Float32Array(n * a.itemSize);
      for (let i = 0; i < n; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a.getComponent(i, k);
      g.setAttribute(nm, new THREE.BufferAttribute(f, a.itemSize));
    });
    g.setIndex(src.index ? Array.from(src.index.array) : Array.from({ length: n }, (_, i) => i));
    g.applyMatrix4(m4); return g;
  }
  const mergeable = o => o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !Array.isArray(o.material) && !o.material.transparent && o.renderOrder === 0
    && o.layers.mask === 1 && o.frustumCulled && !o.children.length && !Object.prototype.hasOwnProperty.call(o, 'onBeforeRender')
    && !o.customDistanceMaterial && !o.userData.batch && (o.userData.ix === undefined || BATCH.staticIx.has(o.userData.ix)) && !o.userData.movable
    && o.geometry.attributes.position && o.geometry.attributes.normal && !Object.keys(o.geometry.morphAttributes).length
    && o.geometry.drawRange.start === 0 && o.geometry.drawRange.count === Infinity && o.matrixWorld.determinant() > 0;
  // one merge candidate: a held material keeps its identity, any other is grouped by everything but its colour
  function entryOf(o, m4, host, held) {
    // a leaf card's alpha-tested shadow material (customDepthMaterial) travels with it, so only cards sharing one merge
    const uv = !!o.geometry.attributes.uv, vc = !!(o.material.vertexColors && o.geometry.attributes.color), base = ['position', 'normal'].concat(uv ? ['uv'] : []);
    const dm = o.customDepthMaterial ? 'D' + o.customDepthMaterial.uuid : '';
    if (held && held.has(o.material)) return { o, m4, host, key: 'u' + o.material.uuid + dm + (uv ? 'U' : '') + (vc ? 'C' : ''), names: base.concat(vc ? ['color'] : []), mat: o.material, tint: null };
    return { o, m4, host, key: 's' + matSig(o.material) + dm + (uv ? 'U' : ''), names: base.concat(['color']), mat: o.material, tint: { c: o.material.color, own: vc } };
  }
  function mergeGroups(groups, drop, track) {
    let n = 0;
    groups.forEach(list => {
      if (list.length < 2) return;
      const geos = list.map(x => bakeGeo(x.o.geometry, x.m4, x.names, x.tint)), geo = BGU.mergeGeometries(geos, false);
      geos.forEach(g => g.dispose());
      if (!geo) return;
      geo.computeBoundingBox(); geo.computeBoundingSphere();
      const f = list[0], m = new THREE.Mesh(geo, f.tint ? tintMat(f.mat) : f.mat);
      m.castShadow = f.o.castShadow; m.receiveShadow = f.o.receiveShadow; m.userData.batch = true;
      if (f.o.customDepthMaterial) m.customDepthMaterial = f.o.customDepthMaterial;
      f.host.add(m); m.updateMatrixWorld(true);
      list.forEach(x => {
        if (drop) x.o.parent.remove(x.o); else x.o.visible = false;
        if (track) BATCH.list[BATCH.list.length] = { o: x.o, w: x.o.matrixWorld.clone() };
      });
      n++;
    });
    return n;
  }
  // merges the plain pieces inside one object, in the space of the object (or, perParent, of the group each piece
  // hangs from, so a person's limbs still swing); pieces under a nested IX object, a movable seat or skip() stay
  function mergeOwn(root, opt = {}) {
    if (!BGU || !three.ok) return 0;
    root.updateMatrixWorld(true);
    const groups = new Map(), invs = new Map();
    root.traverse(o => {
      if (o === root || !mergeable(o) || !o.visible || (opt.skip && opt.skip(o))) return;
      if (o.userData.swap) return;
      for (let a = o.parent; a && a !== root; a = a.parent) if (!a.visible || a.userData.swap || a.userData.ix !== undefined || a.userData.movable || (opt.skip && opt.skip(a))) return;
      const host = opt.perParent ? o.parent : root;
      if (!invs.has(host)) invs.set(host, new THREE.Matrix4().copy(host.matrixWorld).invert());
      const e = entryOf(o, new THREE.Matrix4().multiplyMatrices(invs.get(host), o.matrixWorld), host, opt.held), key = [host.uuid, o.castShadow, o.receiveShadow, e.key].join('|');
      if (!groups.has(key)) groups.set(key, []);
      const l = groups.get(key); l[l.length] = e;
    });
    const n = mergeGroups(groups, !!opt.drop, false); BATCH.own += n; return n;
  }
  function staticBatch() {
    if (!three.ok || !BGU || /[?&]nobatch/.test(location.search)) return;
    const scene = three.scene; scene.updateMatrixWorld(true);
    // Canopies recoloured together share one material: applyLight3D gives canopy i the colour pal[i % pal.length] in
    // every weather, so canopies whose i agree modulo the palettes' common length always wear the same colour.
    const gcd = (a, b) => b ? gcd(b, a % b) : a, L = Object.values(CANOPY).reduce((a, p) => a * p.length / gcd(a, p.length), 1);
    const canopyOf = new Map(), swap = new Map();
    (three.canopies || []).forEach(c => { const k = matSig(c.m) + '|' + (c.i % L); if (!canopyOf.has(k)) canopyOf.set(k, c.m); else if (canopyOf.get(k) !== c.m) { swap.set(c.m, canopyOf.get(k)); c.m = canopyOf.get(k); } });
    if (swap.size) scene.traverse(o => { if (o.isMesh && swap.has(o.material)) o.material = swap.get(o.material); });
    const owned = new Set(), held = new Set(), seen = new Set();
    // shell, jetty and waterNav.world are read only while the map is built (walls, the walk grid), never changed after
    const SKIP = new Set(['renderer', 'controls', 'post', 'scene', 'camera', 'shell', 'jetty', 'waterNav']);
    const matsOf = o => o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    const scan = (v, depth) => {
      if (!v || typeof v !== 'object' || seen.has(v) || depth > 4) return; seen.add(v);
      if (v.isObject3D) { owned.add(v); v.traverse(o => matsOf(o).forEach(m => held.add(m))); return; }
      if (v.isMaterial) { held.add(v); return; }
      if (v.isTexture || v.isBufferGeometry || v.isBufferAttribute) return;
      if (v instanceof Map || v instanceof Set || Array.isArray(v)) { v.forEach(x => scan(x, depth + 1)); return; }
      if (Object.getPrototypeOf(v) === Object.prototype) Object.values(v).forEach(x => scan(x, depth + 1));
    };
    Object.entries(three).forEach(([k, v]) => { if (!SKIP.has(k)) scan(v, 0); });
    // an action may recolour or retexture the object it belongs to (the TV, the projector screen): that root's own material stays held
    IX.forEach(x => matsOf(x.obj).forEach(m => held.add(m)));
    const underOwned = o => { for (let a = o; a; a = a.parent) if (owned.has(a)) return true; return false; };
    const shown = o => { for (let a = o; a; a = a.parent) if (!a.visible) return false; return true; };
    // An interactive object that nothing ever moves, hides or recolours (people only walk up to it, sit on it or talk
    // beside it) joins the map's batches like any static piece; its hidden originals still answer the click raycast,
    // which ignores visibility, so its menu opens exactly as before.
    const LIVE = /material|visible|rotation|position|scale|children|traverse|getObject|shake/;
    const movableUp = o => { for (let a = o; a; a = a.parent) if (a.userData.movable) return true; return false; };
    IX.forEach((x, k) => { if (!underOwned(x.obj) && !movableUp(x.obj) && !x.acts.some(a => a.fx && LIVE.test(String(a.fx)))) BATCH.staticIx.add(k); });
    const inside = o => { for (let a = o; a; a = a.parent) if (a.userData.swap || owned.has(a) || (a.userData.ix !== undefined && !BATCH.staticIx.has(a.userData.ix)) || a.userData.movable) return true; return false; };
    // 1. the static map, per cell
    const root = new THREE.Group(); root.name = 'static-batches'; scene.add(root); root.updateMatrixWorld(true);
    const groups = new Map(), box = new THREE.Box3(), c = new THREE.Vector3(), statics = [], owners = [];
    scene.traverse(o => {
      if ((o.userData.movable || (o.userData.ix !== undefined && !BATCH.staticIx.has(o.userData.ix))) && !o.isMesh && shown(o)) owners[owners.length] = o;
      if (mergeable(o) && shown(o) && !inside(o)) statics[statics.length] = o;
    });
    statics.forEach(o => {
      const e = entryOf(o, o.matrixWorld, root, held);
      box.setFromObject(o).getCenter(c);
      const key = [o.castShadow, o.receiveShadow, Math.floor(c.x / BATCH.cell), Math.floor(c.z / BATCH.cell), e.key].join('|');
      if (!groups.has(key)) groups.set(key, []);
      const l = groups.get(key); l[l.length] = e;
    });
    BATCH.meshes += mergeGroups(groups, false, true);
    // 2. each movable seat and each interactive object within itself, unless three.* holds it (it animates) or one
    // of its actions reaches into its children (the MacBook lid and the monitor screen switch a child on and off)
    owners.forEach(g => {
      if (g.userData.movable) BATCH.movable[BATCH.movable.length] = g;
      if (underOwned(g)) return;
      const ix = g.userData.ix !== undefined ? IX[g.userData.ix] : null;
      // (an action on the object itself, ix.obj.visible / position / material, is fine: the merged pieces hang from it)
      const fx = ix ? ix.acts.map(a => a.fx ? String(a.fx).replace(/ix\.obj\.(visible|position|rotation|material)/g, '') : '').join(' ') : '';
      if (/children|traverse|getObject|\.visible|\.rotation|\.position|\.scale/.test(fx)) return;
      // an action that only changes a piece's material (the purifier's LED): every material of the object keeps its
      // identity, so the change still lands on whatever batch draws that piece
      let h = held; if (/\.material/.test(fx)) { h = new Set(held); g.traverse(o => matsOf(o).forEach(m => h.add(m))); }
      mergeOwn(g, { held: h, skip: a => owned.has(a) });
    });
    // 3. the moving machines merge within themselves, per parent group, so a spinning rotor or tail still spins
    [].concat((three.cars || []).map(c => c.g), (three.cyclists || []).map(c => c.g), (three.vacuums || []).map(v => v.g), [three.heli && three.heli.h, three.boat])
      .filter(Boolean).forEach(g => mergeOwn(g, { perParent: true, held }));
    scene.updateMatrixWorld(true);
  }
  // test probe: a hidden original that moved, showed itself, or lost a visible ancestor means something animates it
  // and it should never have been merged
  function batchInfo() {
    three.scene.updateMatrixWorld(true);
    const drift = [];
    BATCH.list.forEach(({ o, w }) => {
      let anc = true; for (let a = o.parent; a; a = a.parent) if (!a.visible) { anc = false; break; }
      const moved = !o.parent || o.matrixWorld.elements.some((e, i) => Math.abs(e - w.elements[i]) > 1e-5);
      if (moved || o.visible || !anc) drift[drift.length] = { type: o.geometry.type, moved, shown: o.visible, ancestorHidden: !anc };
    });
    let seatMeshes = 0, seatCasters = 0; const kinds = {};
    three.scene.traverse(g => { if (!g.userData.movable) return; kinds[g.userData.movable] = (kinds[g.userData.movable] || 0) + 1; g.traverseVisible(o => { if (o.isMesh) { seatMeshes++; if (o.castShadow) seatCasters++; } }); });
    return { staticBatches: BATCH.meshes, ownBatches: BATCH.own, originalsHidden: BATCH.list.length, drift: drift.length, driftSample: drift.slice(0, 8), movableKinds: kinds, movableMeshes: seatMeshes, movableCasters: seatCasters };
  }
  function raisedDeck(root) {
    const top = .08 + PLAT.h, wood = (key, w, d) => { const t = TEX[key].clone(); t.needsUpdate = true; t.repeat.set(w / 2, d / 2); return std(0xffffff, { map: t, roughness: .7 }); };
    const deck = (x0, x1, key) => {
      const m = wood(key, x1 - x0, PLAT.z1);
      block(root, x0, 0, x1 - x0, PLAT.z1, top, m).userData.walkable = true;
      block(root, x0, PLAT.z1 - .04, x1 - x0, .07, .035, M.walnut, top - .035).userData.walkable = true; // nosing
      const led = block(root, x0 + .05, PLAT.z1 + .03, x1 - x0 - .1, .012, .018, std(0xfff1d6, { emissive: 0xffc98a, emissiveIntensity: 0 }), top - .07);
      led.userData.walkable = true; three.lamps.push({ bulb: led, light: null });
      return m;
    };
    const mats = { focus: deck(PLAT.x0, PLAT.wall - .06, 'walnut'), nap: deck(PLAT.wall + .06, PLAT.x1, 'oak') };
    // two treads up from each room, the lower one with a deeper shadow line, plus a cheek board either side
    PLAT.stairs.forEach(([a, b], i) => {
      const m = i ? mats.nap : mats.focus;
      for (let k = 0; k < 2; k++) {
        const h = top - (k + 1) * PLAT.rise, z = PLAT.z1 + k * PLAT.run;
        block(root, a, z, b - a, PLAT.run, h, m).userData.walkable = true;
        block(root, a, z + PLAT.run - .04, b - a, .05, .03, M.walnut, h - .03).userData.walkable = true;
      }
      [a - .05, b].forEach(x => block(root, x, PLAT.z1, .05, PLAT.run * 2, top - PLAT.rise, M.walnut));
    });
    // a glass balustrade with an oak handrail along the open edge, broken only by the two stairs and the partition
    const gaps = [...PLAT.stairs, [PLAT.wall - .06, PLAT.wall + .06]].sort((p, q) => p[0] - q[0]);
    let x = PLAT.x0;
    [...gaps, [PLAT.x1, PLAT.x1]].forEach(([a, b]) => {
      if (a - x > .1) {
        block(root, x, PLAT.z1 - .05, a - x, .02, .86, M.glass, top + .04);
        block(root, x, PLAT.z1 - .08, a - x, .07, .045, M.walnut, top + .9);
        [x, a - .04].forEach(px => block(root, px, PLAT.z1 - .06, .04, .04, .94, M.black, top));
      }
      x = b;
    });
  }
  function anchorGroup(root, ax, az) { const [dx, dz] = shiftOf(ax, az); const g = new THREE.Group(); g.position.set(dx, 0, dz); root.add(g); return g; }
  function artTexture(seedShift) {
    return ctex(300, 380, (g, w, h) => {
      g.fillStyle = '#efe7da'; g.fillRect(0, 0, w, h);
      const cols = ['#6b4630', '#1f1d1c', '#b98a5e', '#d9c4a8', '#8a5a36'];
      for (let i = 0; i < 5; i++) { g.fillStyle = cols[(i + seedShift) % cols.length]; g.beginPath(); g.arc(60 + rnd() * 180, 80 + rnd() * 220, 30 + rnd() * 80, rnd() * 3, rnd() * 3 + 2.4); g.fill(); }
      g.strokeStyle = '#1f1d1c'; g.lineWidth = 3; g.beginPath(); g.moveTo(30, h - 60); g.bezierCurveTo(110, h - 160, 200, h - 20, 270, h - 120); g.stroke();
    });
  }
  function wallArt(parent, x, y, z, ry, tex, w = .7, h = .9) {
    const g = grp(parent, x, y, z, ry);
    mesh(g, B(w + .06, h + .06, .03), std(0x1f1d1c, { roughness: .4 }), 0, 0, 0);
    mesh(g, new THREE.PlaneGeometry(w, h), std(0xffffff, { map: tex, roughness: .9 }), 0, 0, .017);
    reg(g, 'ภาพศิลปะ', [{ th: 'ยืนชมภาพ', how: 'front' }]);
    return g;
  }
  function beanbag(parent, x, z, color, s = 1) {
    const geo = new THREE.SphereGeometry(.5 * s, 36, 24), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
      vy = vy < 0 ? vy * .28 : vy * .78;
      if (vy > 0) vy -= .13 * s * Math.exp(-(vx * vx + vz * vz) / (.06 * s * s));
      const n = 1 + Math.sin(vx * 9 + vz * 7) * .025;
      p.setXYZ(i, vx * n, vy, vz * n);
    }
    geo.computeVertexNormals();
    const b = mesh(parent, geo, std(color, { roughness: 1 }), x, .14 * s + .08, z);
    b.rotation.y = rnd() * 6;
    movable(b, 'beanbag'); reg(b, 'บีนแบ็ก', [{ th: 'นั่งบีนแบ็ก', how: 'sit', d: 0, dy: -.2 }]);
    return b;
  }
  function massageChair(parent, x, z, ry) {
    const g = grp(parent, x, .08, z, ry), leather = std(0x2a2522, { roughness: .42 }), stitch = std(0x3a332f, { roughness: .5 });
    mesh(g, B(.72, .12, 1.15), M.black, 0, .06, 0);
    mesh(g, B(.6, .18, .62), leather, 0, .42, .05);
    [-1, 1].forEach(s => { mesh(g, B(.1, .55, .95), M.walnut, s * .37, .42, 0); mesh(g, B(.17, .08, .72), leather, s * .37, .73, .02); });
    const back = mesh(g, B(.64, 1.0, .24), leather, 0, .95, -.34); back.rotation.x = -.38;
    for (let i = 0; i < 4; i++) { const r = mesh(g, B(.56, .02, .02), stitch, 0, .62 + i * .2, -.24 - i * .075); r.rotation.x = -.38; }
    const pillow = mesh(g, B(.44, .18, .14), std(0x3a332f, { roughness: .6 }), 0, 1.45, -.55); pillow.rotation.x = -.38;
    const leg = mesh(g, B(.52, .5, .16), leather, 0, .26, .55); leg.rotation.x = -.55; // slopes down from the seat front, so calves rest on it
    mesh(g, B(.08, .02, .12), std(0x111111, { emissive: 0x5fb6e3, emissiveIntensity: .7 }), .37, .78, .2);
    movable(g, 'armchair'); reg(g, 'เก้าอี้นวดไฟฟ้า', [{ th: 'นวดผ่อนคลาย', how: 'sit', d: .05, dy: .1, fx: ix => { three.shake = { obj: ix.obj, base: ix.obj.position.clone(), until: performance.now() + ACT_MS }; } }]);
    return g;
  }
  function blanket(parent, x, y, z, ry, color) {
    const g = grp(parent, x, y, z, ry), m = std(color, { roughness: 1 });
    mesh(g, B(.55, .025, .5), m, 0, 0, 0);
    const fold = mesh(g, B(.55, .3, .025), m, 0, -.15, .25); fold.rotation.x = .15;
    for (let i = 0; i < 5; i++) mesh(g, B(.02, .005, .5), std(0xf4f1ea), -.22 + i * .11, .014, 0);
    reg(g, 'ผ้าห่ม', [{ th: 'พับผ้าห่มให้เรียบร้อย', how: 'front' }]);
  }

  // ---------- projector (owner, 14 Oct 2026: "อยากให้เพิ่ม projector ขนาดใหญ่ ไว้เผื่อประชุมทีมหรือคุยงานร่วมกัน ร่วมสมองระดมไอเดีย") ----------
  // A motorised 2.4 m 16:9 screen in a thin case under the ceiling of the meeting room's back wall drops in front of
  // the TV only, so the whiteboard (left wall), the windows (behind the TV) and the doors (front and right) stay clear;
  // a ceiling projector over the table throws a soft cone onto it. It runs while anyone waits in the meeting room for
  // the owner, or for a while after someone presents at the lectern or a brainstorm starts; the room light dims a little.
  function drawSlide() {
    const P = three.proj; if (!P) return;
    const c = P.slide.image, x = c.getContext('2d'), w = c.width, h = c.height, waiting = people.filter(p => p.state === 'waiting').length;
    // the project whose release batch is fullest (each project batches on its own)
    const qOf = p => issues.filter(i => i.lane === 'release-queue' && projectOf(i) === p).length, relPj = Object.keys(PROJECT_KEY).reduce((a, p) => qOf(p) > qOf(a) ? p : a, CONFIG.project), nQ = qOf(relPj);
    x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, w, h); x.fillStyle = '#0D767D'; x.fillRect(0, 0, w, 10);
    x.fillStyle = '#1E282E'; x.font = '600 34px "IBM Plex Sans Thai", sans-serif'; x.fillText(waiting ? 'สรุปงานรอเจ้าของตัดสิน' : 'ระดมไอเดีย', 28, 58);
    x.fillStyle = '#4C5C65'; x.font = '500 18px "IBM Plex Sans Thai", sans-serif'; x.fillText(`รอบ release ${relPj} ` + (relBatch(relPj) ? `${nQ}/${relBatch(relPj)} ใบ` : NO_SOURCE) + (waiting ? ` · รอเจ้าของ ${waiting} คน` : ''), 28, 88);
    x.fillStyle = '#CDD7DA'; x.fillRect(28, 102, w - 56, 8); x.fillStyle = '#0D767D'; x.fillRect(28, 102, (w - 56) * Math.min(1, relBatch(relPj) ? nQ / relBatch(relPj) : 0), 8);
    const notes = [['#f2d16b', 'ลดขั้นตอน'], ['#f2a7a0', 'ทดสอบ'], ['#9fd3c7', 'staging'], ['#bcd3ea', 'รีวิว PR'], ['#e6c79c', 'UX'], ['#f2d16b', 'Jira']];
    notes.forEach(([col, t], i) => {
      const nx = 40 + (i % 3) * 150, ny = 132 + Math.floor(i / 3) * 74; x.save(); x.translate(nx + 60, ny + 30); x.rotate(((i * 37) % 7 - 3) * .02);
      x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(-58, -26, 120, 60); x.fillStyle = col; x.fillRect(-60, -30, 120, 60);
      x.fillStyle = '#1E282E'; x.font = '600 17px "IBM Plex Sans Thai", sans-serif'; x.textAlign = 'center'; x.fillText(t, 0, 6); x.restore();
    });
    P.slide.needsUpdate = true;
  }
  function projOn(ms = ACT_MS) { if (three.proj) three.proj.until = performance.now() + ms; }
  function projector(root) {
    const white = std(0xf1ede6, { roughness: .5 }), dark = std(0x2a2b2d, { roughness: .4, metalness: .3 });
    // the screen: case, two hangers, the roll (cloth and weighted bottom bar) that drops from it
    let g = anchorGroup(root, 2.8, 0);
    const scr = grp(g, 2.8, 2.3, .27);
    mesh(scr, B(2.62, .09, .11), white, 0, 0, 0); [-1.2, 1.2].forEach(x => mesh(scr, B(.04, .06, .04), dark, x, .07, 0));
    const roll = grp(scr, 0, -.045, 0);
    const slide = ctex(640, 360, () => {});
    const cloth = mesh(roll, new THREE.PlaneGeometry(2.4, 1.35), std(0xf4f2ee, { roughness: .95, emissive: 0xffffff, emissiveIntensity: 0 }), 0, -.675, 0);
    cloth.material.emissiveMap = slide; cloth.castShadow = false;
    mesh(roll, B(2.44, .025, .03), dark, 0, -1.36, 0);
    roll.scale.y = .001;
    // a slim walnut lectern beside the screen: the presenter stands behind it, facing the table
    const lec = grp(g, 4.35, 0, .85, 0);
    mesh(lec, B(.42, .95, .32), M.walnut, 0, .475, 0); const top = mesh(lec, B(.46, .03, .36), dark, 0, .98, -.02); top.rotation.x = -.2;
    reg(lec, 'โพเดียมนำเสนอ', [{ th: 'นำเสนองานบนโปรเจกเตอร์', how: 'beside', d: -.42, dir: [0, 1], fx: () => projOn() }]);
    // the projector on a pole from the ceiling over the table, lens toward the screen
    g = anchorGroup(root, 3, 2.5);
    const pj = grp(g, 2.7, 0, 2.55, 0);
    mesh(pj, Cy(.06, .06, .02, 16), white, 0, 2.39, 0); mesh(pj, Cy(.018, .018, .3, 10), dark, 0, 2.24, 0);
    mesh(pj, B(.3, .02, .26), dark, 0, 2.09, 0); mesh(pj, B(.38, .13, .32), white, 0, 2.01, 0);
    for (let i = 0; i < 5; i++) mesh(pj, B(.012, .06, .2), dark, .12 + i * .012, 2.01, .02);
    const lensBody = mesh(pj, Cy(.055, .06, .07, 20), dark, -.08, 2.0, -.19); lensBody.rotation.x = Math.PI / 2;
    const lens = mesh(pj, Cy(.04, .04, .01, 20), std(0x9fb6c4, { roughness: .05, metalness: .2, emissive: 0xfff3dc, emissiveIntensity: 0 }), -.08, 2.0, -.228); lens.rotation.x = Math.PI / 2;
    // the light cone, a soft four-sided beam from the lens to the screen, built once both are placed
    root.updateMatrixWorld(true);
    const a = lens.getWorldPosition(new THREE.Vector3()), b = cloth.localToWorld(new THREE.Vector3(0, 0, 0)).setY(2.3 - .045 - .675), L = a.distanceTo(b);
    const geo = new THREE.ConeGeometry(1, L, 4, 1, true); geo.rotateY(Math.PI / 4); geo.scale(1.2 / Math.SQRT1_2, 1, .675 / Math.SQRT1_2);
    const cone = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: .07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    cone.position.copy(a).add(b).multiplyScalar(.5); cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.clone().sub(b).normalize());
    cone.visible = false; cone.userData.walkable = true; root.add(cone);
    three.proj = { roll, cloth, lens, cone, slide, until: 0, on: false, k: 0, force: null };
  }
  function stepProjector(dt) {
    const P = three.proj; if (!P) return;
    const on = P.force !== null ? P.force : performance.now() < P.until || people.some(p => p.state === 'waiting');
    if (on !== P.on) { P.on = on; if (on) drawSlide(); applyScene(); }
    P.k += ((on ? 1 : 0) - P.k) * (reduce ? 1 : Math.min(1, dt * 1.8)); // the motor rolls the screen down or up in about two seconds
    P.roll.scale.y = Math.max(.001, P.k);
    const lit = on && P.k > .97;
    // lit, the slide is both the cloth's colour and a soft glow (a projected image reads brighter than the room)
    if (P.cloth.material.map !== (lit ? P.slide : null)) { P.cloth.material.map = lit ? P.slide : null; P.cloth.material.needsUpdate = true; }
    P.cloth.material.emissiveIntensity = lit ? .32 : 0; P.lens.material.emissiveIntensity = on ? 1.6 : 0; P.cone.visible = lit;
  }
  function buildOffice(root) {
    const land = anchorGroup(root, 8, 12); buildLandscape(land);
    three.groundMat = three.meadow; three.paverMat = M.paver; // v59: held, so the rain can wet the stone paths after batching
    // the stretched shell: floors, outer walls with windows, partitions, snow on wall tops
    const shell = new THREE.Group(); shell.scale.set(K, 1, K); root.add(shell); three.shell = shell;
    // v58: each floor from its PBR set, in the colour of the procedural floor it replaces (ROOMS[].floor keeps its name)
    const FLOOR_PBR = { carpetCharcoal: ['wool_rug', 0x3a3633], carpetCream: ['wool_rug', 0xe8dfd0], tileWhite: ['cream_tile', 0xf2efea], tileBlack: ['cream_tile', 0x2a2725], oak: ['oak_floor', 0xc4996a], walnut: ['walnut_dark', 0x6e4a32] };
    ROOMS.forEach(r => {
      // the black kitchen tile keeps its procedural pattern: tinting the photo tile black darkened its grout too and it
      // read as carpet; it is box mapped (2 m per texture, 0.5 m tiles, as in v57) so it keeps its size on the stretched shell
      if (r.floor === 'tileBlack') { const m = std(0xffffff, { map: TEX.tileBlack, roughness: .72 }); m.defines = Object.assign({}, m.defines, { BOX_TILE: '2.000', BOX_WORLD: '' }); m.onBeforeCompile = BOX_UV; block(shell, r.x, r.z, r.w, r.d, .08, m); return; }
      const [set, hex] = FLOOR_PBR[r.floor];
      block(shell, r.x, r.z, r.w, r.d, .08, pbrMat(set, hex, { r: r.floor.startsWith('tile') ? .72 : .75 }));
    });
    block(shell, 0, -.15, 19, .15, 2.4, M.plaster); block(shell, -.15, -.15, .15, 5.15, 2.4, M.wall2); // v59: from the back wall's outer face, so the back-left corner has no gap
    block(shell, 19, -.15, .15, 5.03, 2.4, M.wall2);
    block(shell, 7.94, 0, .12, 3.3, 2.4, M.partition);
    block(shell, 15.94, 0, .12, 3.2, 2.4, M.plaster); block(shell, 15.94, 4.2, .12, .7, 2.4, M.plaster); block(shell, 15.94, 3.2, .12, 1, .35, M.plaster, 2.05);
    // lounge (owner, 14 Oct 2026): full-width, floor to ceiling clear glass on its outer wall and its front
    const clear = std(0xe6f3f8, { transparent: true, opacity: .16, roughness: .02, metalness: .1, depthWrite: false });
    block(shell, -.12, 5, .05, 7, 2.35, clear, .03); block(shell, 0, 11.94, 4, .05, 2.35, clear, .03);
    for (let zz = 5; zz <= 12.01; zz += 1.4) block(shell, -.14, zz - .02, .08, .04, 2.4, M.frame);
    for (let xx = 0; xx <= 4.01; xx += 1) block(shell, xx - .02, 11.92, .04, .08, 2.4, M.frame);
    block(shell, -.15, 5, .1, 7, .06, M.frame, 2.35); block(shell, 0, 11.92, 4, .1, .06, M.frame, 2.35);
    block(shell, -.15, 5, .1, 7, .04, M.frame); block(shell, 0, 11.92, 4, .1, .04, M.frame);
    block(shell, -.2, -.2, 19.4, .05, .02, M.frame, 2.4);
    [[1, 3], [3.6, 5.4], [11, 13], [13.6, 15.4], [16.8, 18.2]].forEach(([a, b]) => {
      block(shell, a - .05, -.17, b - a + .1, .04, 1.3, M.frame, .8);
      const wm = winGlass(); // v59: reflective glass over a faint room, not a black slab
      block(shell, a, -.16, b - a, .03, 1.2, wm, .85); three.wins.push(wm);
      block(shell, a + (b - a) / 2 - .02, -.18, .04, .05, 1.2, M.frame, .85);
    });
    [].forEach(([a, b]) => {
      block(shell, -.17, a - .05, .04, b - a + .1, 1.3, M.frame, .8);
      const wm = std(0x9fc8e0, { emissive: 0xffd98a, emissiveIntensity: 0, roughness: .05, metalness: .2 });
      block(shell, -.16, a, .03, b - a, 1.2, wm, .85); three.wins.push(wm);
    });
    [block(shell, 0, -.18, 19.2, .2, .06, M.snow, 2.4), block(shell, -.18, 0, .2, 5, .06, M.snow, 2.4)].forEach(s => three.snowOnly.push(s));
    [[6, 0, .12, 2.4], [6, 3.2, .12, 1.8], [9.8, 0, .12, 2.4], [6.2, 3.3, 3.6, .1], [9.8, 3.6, .12, 1.4],
     [0, 4.9, 1.6, .12], [2.8, 4.9, 3.2, .12], [10, 4.9, 2.4, .12], [13.6, 4.9, 2.4, .12]].forEach(([x, z, w, d]) => {
      block(shell, x, z, w, d, .9, M.partition); block(shell, x, z, w, d, .5, M.glass, .9); block(shell, x, z, w, d, .03, M.frame, 1.4);
    });
    [[4, 5, .1, 1.6], [4, 8.6, .1, 3.4], [11.85, 5, .1, 2], [11.85, 9, .1, 3]].forEach(([x, z, w, d]) => block(shell, x, z, w, d, .75, M.partition));
    block(shell, 16, 4.88, 3, .12, 2.4, M.plaster);
    // warm interior light in every room, on in the evening and at night (no shadow map, to stay smooth)
    ROOMS.forEach(r => { if (!r.name) return; const l = new THREE.PointLight(0xffd9a8, 0, Math.max(r.w, r.d) * K * 1.1, 2); l.position.set((r.x + r.w / 2) * K, 2.3, (r.z + r.d / 2) * K); root.add(l); three.roomLights.push(l); });

    // meeting room: walnut table, eight ergonomic chairs, MacBook and coffee; TV with the Gate slide; whiteboard
    let g = anchorGroup(root, 3, 2.5);
    block(g, 1.3, 2.65, 2.8, 1.1, .05, M.walnut, .72);
    [[1.6, 3.2], [3.8, 3.2]].forEach(([x, z]) => mesh(g, Cy(.05, .2, .72, 16), M.steel, x, .36, z));
    SPOTS.meeting.forEach(s => {
      const ch = ergoChair(g, s.x, s.y, faceTo(s.x, s.y, 2.7, 3.2));
      // v58: the three chairs facing the projector screen also take a brainstorm, which runs the projector
      if (s.y > 4) { const acts = IX[ch.userData.ix].acts; acts[acts.length] = { th: 'ระดมไอเดีย', how: 'sit', d: .02, fx: () => projOn() }; }
    });
    macbook(g, 2.2, .77, 3.0, faceTo(2.2, 3, 2.2, 2.0), TEX.code[0]);
    mug(g, 3.3, .77, 3.4); mug(g, 1.8, .77, 3.45);
    block(g, 1.1, 2.3, 3.2, 1.8, .015, std(0x2a2725, { roughness: 1 }), .08);
    g = anchorGroup(root, 2.8, 0);
    block(g, 1.5, .01, 2.6, .05, 1.5, M.glossy, .65);
    reg(mesh(g, new THREE.PlaneGeometry(2.5, 1.4), screenMat(TEX.slide), 2.8, 1.4, .065), 'ทีวีห้องประชุม', [
      { th: 'เปิด/ปิดทีวี', fx: ix => { const m = ix.obj.material; m.map = m.map ? null : TEX.slide; m.color.setHex(m.map ? 0xffffff : 0x0b0c0e); m.needsUpdate = true; }, done: 'สลับทีวีแล้ว' },
      { th: 'นำเสนองาน', how: 'front', d: 1.4 }]);
    block(g, 1.8, .02, 2, .3, .45, M.walnut);
    plant(g, 4.6, .4, 1.1);
    g = anchorGroup(root, 0, 2.5);
    const wb = grp(g, .02, 1.35, 2.5, Math.PI / 2); reg(wb, 'ไวท์บอร์ด', [{ th: 'ระดมความคิด', how: 'front', d: .9, spread: .6 }]);
    mesh(wb, B(2, 1, .03), M.frame, 0, 0, 0); mesh(wb, new THREE.PlaneGeometry(1.94, .94), std(0xffffff, { map: TEX.board, roughness: .3 }), 0, 0, .016);
    g = anchorGroup(root, 0, 0); plant(g, .45, .45, 1.2);
    projector(root);

    // restrooms, men and women: toilet, glass shower booth, walnut vanity with basin, mirror, towel, a sign
    const toilet = (gg, x, z, name, ry = 0) => {
      const wc = grp(gg, x, 0, z, ry); reg(wc, name, [{ th: 'เข้าห้องน้ำ', how: 'front', d: .75 }]);
      mesh(wc, Cy(.18, .14, .4, 20), M.ceramic, 0, .2, .12); mesh(wc, Cy(.2, .2, .04, 20), M.ceramic, 0, .42, .12);
      mesh(wc, B(.42, .38, .18), M.ceramic, 0, .6, -.15); mesh(wc, Cy(.02, .02, .02, 10), M.chrome, .1, .8, -.15);
    };
    const shower = (gg, x, z) => {
      const sh = grp(gg, x, 0, z, 0);
      mesh(sh, B(.9, .06, .9), M.ceramic, .45, .03, .45);
      const pane = std(0xdff0f6, { transparent: true, opacity: .22, roughness: .03, metalness: .1, depthWrite: false });
      mesh(sh, B(.9, 1.95, .02), pane, .45, 1.04, .9); mesh(sh, B(.02, 1.95, .9), pane, .9, 1.04, .45);
      mesh(sh, B(.03, 1.95, .03), M.chrome, .9, 1.04, .9); mesh(sh, B(.9, .03, .03), M.chrome, .45, 2.02, .9); mesh(sh, B(.03, .03, .9), M.chrome, .9, 2.02, .45);
      mesh(sh, Cy(.012, .012, .5, 8), M.chrome, .2, 1.75, .06); const head = mesh(sh, Cy(.09, .07, .03, 18), M.chrome, .2, 2.0, .16); head.rotation.x = .5;
      mesh(sh, B(.5, .5, .01), std(0x3a2a20, { roughness: .9 }), .45, 1.2, .015);
      reg(sh, 'ตู้อาบน้ำ', [{ th: 'อาบน้ำ', how: 'front', d: .7 }]);
    };
    const vanity = (gg, x, z, ry) => {
      const v = grp(gg, x, 0, z, ry);
      reg(block(v, -.5, -.25, 1, .5, .8, M.walnut), 'อ่างล้างหน้า', [{ th: 'ล้างมือ', how: 'front', d: .6 }]); block(v, -.5, -.25, 1, .5, .04, M.white, .8);
      mesh(v, Cy(.16, .12, .08, 20), M.ceramic, 0, .86, 0); mesh(v, Cy(.015, .015, .2, 8), M.chrome, 0, .95, -.2);
      block(v, -.4, -.27, .8, .02, .75, std(0xdfe9ee, { metalness: .9, roughness: .05 }), 1.1);
      block(v, .55, -.27, .3, .04, .5, std(0xe9e1d3, { roughness: 1 }), .9);
    };
    g = anchorGroup(root, 6, 0); toilet(g, 6.5, .55, 'ห้องน้ำชาย');
    g = anchorGroup(root, 7.9, 0); shower(g, 7.0, .05);
    g = anchorGroup(root, 7.9, 2); vanity(g, 7.65, 2.0, -Math.PI / 2); plant(g, 7.6, 3.0, .7);
    g = anchorGroup(root, 9.9, 0); toilet(g, 9.5, .55, 'ห้องน้ำหญิง');
    g = anchorGroup(root, 8.1, 0); shower(g, 8.08, .05);
    g = anchorGroup(root, 8.1, 2); vanity(g, 8.35, 2.0, Math.PI / 2); plant(g, 8.4, 3.0, .7);
    const panel = std(0x5a3f2c, { roughness: .6 }), steelP = std(0xc9cdd1, { roughness: .35, metalness: .7 });
    const stall = (gg, x0, z0, w, d) => { block(gg, x0, z0 + d, w * .62, .04, 1.9, panel, .15); const door = block(gg, x0 + w * .62, z0 + d, w * .38, .04, 1.9, panel, .15); door.rotation.y = -.5; block(gg, x0 + w - .04, z0, .04, d, 1.9, panel, .15); mesh(gg, B(.05, .05, .02), M.chrome, x0 + w * .55, 1.05, z0 + d + .03); };
    const urinal = (gg, x, z, ry) => { const u = grp(gg, x, 0, z, ry); mesh(u, B(.36, .62, .3), M.ceramic, 0, .9, .15); mesh(u, B(.3, .5, .02), std(0xe9eef0, { roughness: .2 }), 0, .9, .31); mesh(u, Cy(.015, .015, .25, 8), M.chrome, 0, 1.33, .05); reg(u, 'โถปัสสาวะชาย', [{ th: 'เข้าห้องน้ำ', how: 'front', d: .55 }]); };
    const dryer = (gg, x, z, ry) => { const d = grp(gg, x, 1.1, z, ry); mesh(d, B(.28, .3, .16), steelP, 0, 0, .08); reg(d, 'เครื่องเป่ามือ', [{ th: 'เป่ามือ', how: 'front', d: .45 }]); };
    const towels = (gg, x, z, ry) => { const t = grp(gg, x, 1.25, z, ry); mesh(t, B(.28, .36, .12), steelP, 0, 0, .06); mesh(t, B(.2, .02, .03), std(0xffffff), 0, -.17, .1); };
    const tiles = (gg, x, z, w, d) => { const t = TEX.tileWhite.clone(); t.needsUpdate = true; t.repeat.set(Math.max(w, d) * 2, 3); block(gg, x, z, w, d, 1.4, std(0xffffff, { map: t, roughness: .25 })); };
    // men's room: stall around the toilet, two urinals on the west wall with a divider
    g = anchorGroup(root, 6, 0); tiles(g, 6.0, .0, 1.95, .02); stall(g, 6.02, 0, .95, 1.0);
    g = anchorGroup(root, 6, 1.7); tiles(g, 6.0, .65, .02, 1.75);
    urinal(g, 6.03, 1.25, Math.PI / 2); urinal(g, 6.03, 2.05, Math.PI / 2); block(g, 6.02, 1.63, .45, .03, .9, panel, .5);
    g = anchorGroup(root, 7.9, 2); dryer(g, 7.92, 2.75, -Math.PI / 2); towels(g, 7.92, 1.35, -Math.PI / 2);
    // women's room: two toilet stalls, one on the back wall and one on the east wall, sanitary bins
    g = anchorGroup(root, 9.9, 0); tiles(g, 8.05, .0, 1.95, .02); stall(g, 8.85, 0, .9, 1.0); mesh(g, Cy(.1, .09, .3, 14), steelP, 9.6, .15, .8);
    g = anchorGroup(root, 9.9, 1.7); tiles(g, 9.98, .65, .02, 1.75); toilet(g, 9.45, 1.75, 'ห้องน้ำหญิง', -Math.PI / 2);
    block(g, 9.05, 1.15, .95, .04, 1.9, panel, .15); const wd = block(g, 9.05, 2.3, .04, .5, 1.9, panel, .15); wd.rotation.y = .5; mesh(g, Cy(.1, .09, .3, 14), steelP, 9.85, .15, 2.2);
    g = anchorGroup(root, 8.1, 2); dryer(g, 8.08, 2.75, Math.PI / 2); towels(g, 8.08, 1.35, Math.PI / 2);
    // pictogram signs on both doors
    const pict = (men) => ctex(128, 160, (c, w, h) => { c.fillStyle = men ? '#2b5f8a' : '#a8445c'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.beginPath(); c.arc(w / 2, 34, 16, 0, 6.3); c.fill();
      if (men) { c.fillRect(w / 2 - 18, 56, 36, 50); c.fillRect(w / 2 - 16, 104, 13, 40); c.fillRect(w / 2 + 3, 104, 13, 40); } else { c.beginPath(); c.moveTo(w / 2, 54); c.lineTo(w / 2 + 30, 116); c.lineTo(w / 2 - 30, 116); c.closePath(); c.fill(); c.fillRect(w / 2 - 14, 116, 10, 30); c.fillRect(w / 2 + 4, 116, 10, 30); } });
    g = anchorGroup(root, 6, 2.8); const sm = mesh(g, new THREE.PlaneGeometry(.26, .32), std(0xffffff, { map: pict(true), roughness: .4 }), 5.97, 1.6, 2.2); sm.rotation.y = -Math.PI / 2;
    g = anchorGroup(root, 9.9, 2.8); const sw = mesh(g, new THREE.PlaneGeometry(.26, .32), std(0xffffff, { map: pict(false), roughness: .4 }), 10.03, 1.6, 2.4); sw.rotation.y = Math.PI / 2;

    // nap room: a soft king size bed (1.93 x 2.03 m) against the back wall, cute mushroom lamps on both nightstands,
    // a small TV on the wall facing the bed, a rug, a plant and a throw blanket
    g = anchorGroup(root, 17.5, 0);
    const bed = grp(g, 17.5, PLAT.h, 0, 0);
    mesh(bed, B(2.0, .3, 2.1), M.walnut, 0, .17, 1.12);
    mesh(bed, B(2.1, 1.1, .1), std(0x5a3f2c, { roughness: .95 }), 0, .62, .06);
    [-.7, -.35, 0, .35, .7].forEach(dx => mesh(bed, B(.02, .9, .02), std(0x4a3324, { roughness: 1 }), dx, .66, .115));
    mesh(bed, B(1.93, .26, 2.0), std(0xefe4d2, { roughness: 1 }), 0, .45, 1.13);
    mesh(bed, B(1.97, .1, 1.35), std(0xd9c2a3, { roughness: 1 }), 0, .6, 1.42);
    mesh(bed, B(1.99, .05, .5), std(0xb0704a, { roughness: 1 }), 0, .66, 1.85);
    [[-.5, .32], [.5, .32], [-.45, .5], [.45, .5]].forEach(([dx, dz], k) => { const pw = mesh(bed, B(.7, .16, .38), std(k < 2 ? 0xf3e9d8 : 0xc9a27c, { roughness: 1 }), dx, .66 + (k < 2 ? 0 : .04), dz); pw.rotation.x = -.25; });
    reg(bed, 'เตียงคิงไซซ์', [{ th: 'งีบหลับ 20 นาที', how: 'front', d: .55, dy: .15, pose: 'sit' }, { th: 'นั่งดูทีวีบนเตียง', how: 'front', d: .55, dy: .15, pose: 'sit' }]);
    [-1.35, 1.35].forEach(dx => {
      { const ns = grp(bed); block(ns, dx - .25, -.0, .5, .42, .5, M.walnut); block(ns, dx - .24, .4, .48, .02, .02, M.black, .3);
        swapIn(ns, 'side_table_01', { x: dx, z: .21, h: .5, parent: bed, tint: 0x6e4a32 }); }
      const lamp = grp(bed, dx, .5, .2, 0);
      mesh(lamp, Cy(.05, .07, .14, 18), std(0xf3ead6, { roughness: .4 }), 0, .07, 0);
      const cap = mesh(lamp, new THREE.SphereGeometry(.13, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(0xffe6c4, { side: THREE.DoubleSide, emissive: 0xffc98a, emissiveIntensity: 0, roughness: .6 }), 0, .14, 0);
      [[.05, .04], [-.06, .07], [.02, -.07]].forEach(([a, b]) => mesh(lamp, Sp(.018, 8, 6), std(0xffffff, { roughness: .5 }), a, .25, b));
      const light = new THREE.PointLight(0xffc98a, 0, 3, 2); light.position.set(0, .2, 0); lamp.add(light);
      three.lamps.push({ bulb: cap, light });
    });
    // warm latte walls with a walnut slat feature wall behind the bed, so the room never reads stark white
    const latte = std(0xe6d2bb, { roughness: .95 }), slat = std(0x7a5236, { roughness: .8 });
    block(g, 15.5, .01, 4.08, .03, 2.35, latte);
    for (let x = 16.1; x <= 18.9; x += .14) block(g, x, .04, .07, .03, 2.3, slat);
    block(g, 19.55, .01, .03, 6.8, 2.35, latte);
    block(g, 15.49, .01, .03, 4.45, 2.35, latte); block(g, 15.49, 5.9, .03, .9, 2.35, latte);
    // a big soft wool rug under the bed, wider than the bed and past its foot, with a darker border
    block(g, 15.85, .15, 3.3, 2.6, .012, pbrMat('wool_rug', 0x9a6b4c, { r: 1 }), .08 + PLAT.h).userData.walkable = true;
    block(g, 15.95, .25, 3.1, 2.4, .014, pbrMat('wool_rug', 0xd8bf9f, { r: 1 }), .08 + PLAT.h).userData.walkable = true;
    // a knitted pouf and a sheepskin by the bed
    mesh(g, Cy(.28, .3, .36, 22), std(0xc98f62, { roughness: 1 }), 18.75, .26 + PLAT.h, 2.55);
    block(g, 15.7, 2.35, .7, .45, .02, std(0xf1e6d4, { roughness: 1 }), .1 + PLAT.h).userData.walkable = true;
    plant(g, 18.95, .45, 1.0).position.y = PLAT.h;
    g = anchorGroup(root, 17.5, 4.88);
    block(g, 17.05, 4.78, .9, .03, .52, M.glossy, 1.3);
    reg(mesh(g, new THREE.PlaneGeometry(.86, .48), screenMat(TEX.movie), 17.5, 1.56, 4.76), 'ทีวีห้องงีบ', [
      { th: 'เปิด/ปิดทีวี', fx: ix => { const m = ix.obj.material; m.map = m.map ? null : TEX.movie; m.color.setHex(m.map ? 0xffffff : 0x0b0c0e); m.needsUpdate = true; }, done: 'สลับทีวีแล้ว' }]).rotation.y = Math.PI;
    block(g, 16.3, 4.4, .9, .4, .5, M.walnut);

    // focus room (owner, 14 Oct 2026: "ห้องสมาธิ ไว้สำหรับทีมที่ต้องการมานั่งโฟกัสงานคนเดียว", "เมื่อ agent ทำงานที่ซับซ้อน ให้เดินมาใช้ห้องนี้"):
    // one large motorised standing desk (2.4 x 0.9 m, walnut top) facing the back wall: an ultrawide monitor and a
    // vertical monitor on a dual arm, a MacBook on a stand, keyboard, mouse on a desk mat, a desk lamp, headphones on
    // a stand, notebook and pen, coffee, a small plant and a cable tray; acoustic felt panels on the wall; a big rug
    g = anchorGroup(root, 13, 0); g.position.y = PLAT.h;
    block(g, 10.7, .15, 4.6, 2.55, .02, pbrMat('wool_rug', 0x3a2a20, { r: 1 }), .08).userData.walkable = true;
    block(g, 10.85, .2, 4.3, 2.35, .022, pbrMat('wool_rug', 0x8a6748, { r: 1 }), .08).userData.walkable = true;
    const dx = 13, top = .76;
    const deskTop = block(g, dx - 1.2, .12, 2.4, .9, .045, M.walnut, top - .045);
    [-.95, .95].forEach(o => { block(g, dx + o - .04, .45, .08, .08, top - .1, M.black, .06); block(g, dx + o - .05, .2, .1, .7, .06, M.black); block(g, dx + o - .04, .15, .08, .8, .04, M.black, top - .1); });
    block(g, dx - .8, .2, 1.6, .12, .06, M.black, top - .18);
    block(g, dx + .9, .98, .1, .03, .04, std(0x1f1d1c), top - .07);
    block(g, dx - .5, .62, 1.0, .34, .006, std(0x2b2d30, { roughness: 1 }), top);
    // dual monitor arm with an ultrawide and a vertical screen
    mesh(g, Cy(.02, .02, .45, 10), M.black, dx, top + .22, .2);
    monitor(g, dx - .15, top, .3, 0, TEX.code[0], 1.05);
    monitor(g, dx + .78, top, .32, -.35, TEX.code[1], .42);
    macbook(g, dx - .85, top + .08, .55, .25, TEX.code[2]); block(g, dx - 1.0, .45, .3, .22, .07, M.alu, top);
    keyboard(g, dx - .05, top + .006, .72, 0);
    mesh(g, B(.06, .03, .1), M.black, dx + .38, top + .02, .74);
    mug(g, dx + .62, top, .78);
    const nb = block(g, dx + .7, .55, .22, .3, .02, std(0x6b4630, { roughness: .8 }), top); nb.rotation.y = .2;
    mesh(g, Cy(.006, .006, .16, 6), M.black, dx + .86, top + .03, .7).rotation.z = Math.PI / 2;
    const hs = grp(g, dx + 1.05, top, .35, 0); mesh(hs, Cy(.05, .06, .02, 16), M.black, 0, .01, 0); mesh(hs, Cy(.01, .01, .28, 8), M.black, 0, .15, 0);
    mesh(hs, new THREE.TorusGeometry(.08, .016, 8, 20, Math.PI), M.black, 0, .3, 0).rotation.y = Math.PI / 2;
    const lamp = grp(g, dx - 1.05, top, .25, 0); mesh(lamp, Cy(.06, .07, .02, 16), M.black, 0, .01, 0); const la = mesh(lamp, Cy(.008, .008, .42, 6), M.black, .04, .21, 0); la.rotation.z = -.25;
    const shade = mesh(lamp, Cy(.035, .08, .1, 16, 1, true), std(0xf3ead6, { side: THREE.DoubleSide, emissive: 0xffd9a0, emissiveIntensity: 0 }), .12, .44, .05); three.lamps.push({ bulb: shade, light: null });
    plant(g, dx + 1.0, .55, .45);
    reg(deskTop, 'โต๊ะทำงานโฟกัส', [{ th: 'ปรับโต๊ะยืนทำงาน', how: 'front', d: 1.2 }, { th: 'นั่งโฟกัสงาน', how: 'front', d: 1.0, pose: 'type' }]);
    premiumChair(g, dx, 1.45, Math.PI);
    // acoustic felt panels on the back wall
    [[11.2, 1.2], [11.65, 1.55], [14.35, 1.55], [14.8, 1.2], [11.2, 1.9], [14.8, 1.9]].forEach(([x, y], i) => block(g, x - .2, .01, .4, .04, .4, std([0x6b4630, 0x8a6748, 0x3a2a20][i % 3], { roughness: 1 }), y - .2));
    plant(g, 10.45, .4, 1.1);
    g = anchorGroup(root, 16, 2.5); g.position.y = PLAT.h; bookshelf(g, 15.75, .9, -Math.PI / 2, 1.3, 1.8); // on the deck, by the partition
    g = anchorGroup(root, 10, 2.5); wallArt(g, 10.04, 1.5, 1.2, Math.PI / 2, TEX.art[0]); // on the solid wall, clear of the doorway
    g = anchorGroup(root, 10, 5); plant(g, 10.5, 4.3, 1.4);
    g = anchorGroup(root, 10, 0); g.position.y = PLAT.h; floorLamp(g, 10.5, .5);
    raisedDeck(root); kitchenExtras(root);

    // lounge: sofa with a throw and art above it, coffee table with books and coffee, a massage chair,
    // three soft beanbags, rug, bookshelf, lamp, plant
    g = anchorGroup(root, 0, 8.5);
    sofa(g, .65, 8.2, Math.PI / 2);
    blanket(g, .75, .5, 7.35, Math.PI / 2, 0xb98a5e);
    // v59: the lounge's outer walls are glass, so its picture stands on an easel beside the sofa instead of hanging on the glass
    { const ea = grp(g, .6, 0, 6.55, Math.PI / 2 - .35), oakM = std(0x8a5a36, { roughness: .7 });
      [-.3, .3].forEach(sx => { const l = mesh(ea, B(.035, 1.75, .035), oakM, sx, .86, .05); l.rotation.x = -.12; l.rotation.z = -sx * .08; });
      const bl = mesh(ea, B(.035, 1.7, .035), oakM, 0, .82, -.32); bl.rotation.x = .3; mesh(ea, B(.82, .035, .08), oakM, 0, .62, .1);
      const art = wallArt(ea, 0, 1.0, .07, 0, TEX.art[2], .75, .5); art.rotation.x = -.12; }
    g = anchorGroup(root, 2, 8.5);
    block(g, .9, 6.8, 2.8, 3.6, .015, pbrMat('wool_rug', 0x5a3a24, { r: 1 }), .08);
    { const ct = grp(g); block(ct, 1.4, 7.5, .9, 1.4, .04, M.oak, .4); [[1.45, 7.55], [2.25, 7.55], [1.45, 8.85], [2.25, 8.85]].forEach(([x, z]) => block(ct, x, z, .04, .04, .4, M.black));
      swapIn(ct, 'modern_coffee_table_01', { x: 1.85, z: 8.2, h: .44, parent: g }); }
    mug(g, 1.8, .44, 8.4); block(g, 1.6, 7.8, .3, .4, .01, std(0x1f1d1c), .44);
    [[0xb98a5e, 0], [0xf4f1ea, .03], [0x1f1d1c, .06]].forEach(([c, y], i) => block(g, 1.95 - i * .01, 8.55 + i * .01, .26, .2, .03, std(c, { roughness: .8 }), .44 + y));
    massageChair(g, 3.25, 11.15, faceTo(3.25, 11.15, 1.8, 8.4));
    // home theatre facing the sofa (owner, 14 Oct 2026: "ห้องนั่งเล่นมีทีวี โฮมเทียเตอร์และ PS5")
    const ht = grp(g, 3.6, 0, 8.2, -Math.PI / 2);
    mesh(ht, B(2.2, .5, .45), M.walnut, 0, .25, 0); mesh(ht, B(2.1, .02, .4), M.black, 0, .51, 0);
    [-.55, .55].forEach(dx => mesh(ht, B(.9, .3, .02), std(0x5a3a24, { roughness: .6 }), dx, .25, .23));
    mesh(ht, B(.12, .32, .08), M.alu, 0, .66, -.05);
    mesh(ht, B(1.46, .86, .04), M.glossy, 0, 1.25, -.08);
    const tvScr = mesh(ht, new THREE.PlaneGeometry(1.42, .8), new THREE.MeshBasicMaterial({ color: 0x0b0c0e, toneMapped: false }), 0, 1.25, -.055);
    mesh(ht, B(1.0, .07, .1), M.black, 0, .56, .1);
    // v59: bookshelf speakers on the console (the floor towers stood inside a beanbag)
    [-.97, .97].forEach(dx => { mesh(ht, B(.2, .34, .22), std(0x1f1d1c, { roughness: .5 }), dx, .69, 0); [.62, .78].forEach(yy => mesh(ht, Cy(.045, .045, .01, 16), M.alu, dx, yy, .115).rotation.x = Math.PI / 2); });
    mesh(ht, B(.36, .36, .36), std(0x1f1d1c, { roughness: .5 }), -1.25, .18, -.5);
    const ps5 = grp(ht, .78, .52, 0, 0); mesh(ps5, B(.1, .39, .26), std(0xf4f4f2, { roughness: .3 }), 0, .2, 0); mesh(ps5, B(.06, .39, .2), M.black, 0, .2, 0);
    const pad = grp(g, 1.95, .45, 8.1, .4); mesh(pad, B(.16, .04, .1), std(0xf4f4f2, { roughness: .3 }), 0, 0, 0); [-.07, .07].forEach(dx => mesh(pad, Sp(.035, 10, 8), std(0xf4f4f2, { roughness: .3 }), dx, -.01, .03));
    reg(ht, 'ทีวีและโฮมเธียเตอร์', [
      { th: 'เปิด/ปิดทีวี', fx: () => { const m = tvScr.material; m.map = m.map ? null : TEX.movie; m.color.setHex(m.map ? 0xffffff : 0x0b0c0e); m.needsUpdate = true; }, done: 'สลับทีวีแล้ว' },
      { th: 'เล่น PS5', how: 'front', d: 2.3, dy: -.22, pose: 'sit', fx: () => { const m = tvScr.material; m.map = TEX.game; m.color.setHex(0xffffff); m.needsUpdate = true; } },
      { th: 'เปิดเพลงดัง ๆ', fx: () => { if (!audio.on) { toast([['กดปุ่ม ', false], ['♪ เสียง', true], [' ก่อนนะ', false]]); return; } audio.music.gain.setTargetAtTime(.75, audio.ctx.currentTime, .3); setTimeout(() => audio.music.gain.setTargetAtTime(.32, audio.ctx.currentTime, .6), 20000); toast([['โฮมเธียเตอร์', true], [' เปิดดังแล้ว 20 วินาที', false]]); } }
    ]);
    reg(ps5, 'PS5', [{ th: 'เล่น PS5', how: 'front', d: 3.0, dy: -.22, pose: 'sit', dir: [-1, 0], fx: () => { const m = tvScr.material; m.map = TEX.game; m.color.setHex(0xffffff); m.needsUpdate = true; } }]);
    beanbag(g, 1.15, 9.75, 0xf0e9de, 1.45); beanbag(g, 2.35, 10.2, 0xb98a5e, 1.6); beanbag(g, 3.35, 9.6, 0x3a3532, 1.45); beanbag(g, .7, 10.6, 0x8a6748, 1.35); beanbag(g, 3.4, 10.55, 0xd9c8a8, 1.35);
    // the doorway to the meeting room (plan x 1.6 to 2.8) stays clear; shelves stand either side of it and on the east wall
    g = anchorGroup(root, 2, 5.5); reg(bookshelf(g, 3.95, 5.25, 0, 1.4, 1.5), 'ชั้นหนังสือ', [{ th: 'เลือกหนังสือ', how: 'front', d: .7 }]);
    reg(bookshelf(g, .55, 5.25, 0, 1.0, 1.95), 'ชั้นหนังสือ', [{ th: 'เลือกหนังสือ', how: 'front', d: .7 }]);
    reg(bookshelf(g, 4.6, 6.1, -Math.PI / 2, .9, 1.95), 'ชั้นหนังสือ', [{ th: 'เลือกหนังสือ', how: 'front', d: .7 }]);
    // a reading corner on tatami: a low chabudai table, four zabuton floor cushions, a tea set and a stack of books
    g = anchorGroup(root, 2, 12);
    { const tat = TEX.deck.clone(); tat.needsUpdate = true;
      block(g, .85, 10.45, 2.0, 1.35, .04, std(0xd9c894, { roughness: .95 }), .08);
      for (let i = 0; i < 3; i++) block(g, .85, 10.45 + i * .45, 2.0, .015, .045, std(0x3a3532, { roughness: .9 }), .08);
      const tb = grp(g, 1.85, 0, 11.12, 0);
      mesh(tb, B(1.1, .05, .7), M.walnut, 0, .33, 0); [[-.48, -.28], [.48, -.28], [-.48, .28], [.48, .28]].forEach(([a, b]) => mesh(tb, B(.06, .3, .06), M.walnut, a, .16, b));
      mesh(tb, Cy(.06, .05, .09, 14), std(0x5a6e5a, { roughness: .4 }), -.25, .4, 0); [[-.05, .1], [.05, .1]].forEach(([a, b]) => mesh(tb, Cy(.03, .025, .05, 12), std(0xe9e4d8, { roughness: .4 }), a, .38, b));
      [[0xb98a5e, 0], [0x2f4858, .025], [0xf4f1ea, .05]].forEach(([c, y], i) => mesh(tb, B(.24, .025, .17), std(c, { roughness: .8 }), .3, .37 + y, -.05 + i * .01));
      reg(tb, 'โต๊ะญี่ปุ่นมุมอ่านหนังสือ', [{ th: 'นั่งอ่านหนังสือที่โต๊ะญี่ปุ่น', how: 'front', d: .6, dy: -.42, pose: 'sit', spread: .6 }]);
      [[-.85, 0], [.85, 0], [0, -.6], [0, .6]].forEach(([a, b], i) => mesh(g, B(.5, .07, .5), std([0x8a5a36, 0x2f4858, 0xb98a5e, 0x6b4630][i], { roughness: 1 }), 1.85 + a, .1, 11.12 + b));
    }
    g = anchorGroup(root, 0, 12); floorLamp(g, .4, 11.4);
    g = anchorGroup(root, 4, 12); plant(g, 3.5, 11.5, 1.3);

    // kitchen: counter run with sink, coffee machine, kettle, mugs and a black fridge along the wall;
    // a dining table with four chairs and fruit; the matcha and coffee bar at the front
    g = anchorGroup(root, 19, 8.5); g.position.x += 3;
    block(g, 15.2, 5.3, .7, 4.6, .86, M.walnut);
    for (let i = 0; i < 5; i++) { block(g, 15.18, 5.4 + i * .9, .02, .82, .7, std(0x6b4630, { roughness: .55 }), .08); block(g, 15.16, 5.75 + i * .9, .01, .12, .02, M.black, .68); }
    block(g, 15.15, 5.25, .8, 4.7, .05, std(0x2f3337, { roughness: .25, metalness: .2 }), .86);
    block(g, 15.3, 6.0, .5, .6, .02, M.steel, .9); mesh(g, Cy(.012, .012, .25, 8), M.chrome, 15.75, 1.02, 6.3);
    const cm = grp(g, 15.55, .91, 7.3, -Math.PI / 2); reg(cm, 'เครื่องชงกาแฟ', [{ th: 'ชงกาแฟ', how: 'front', d: .8 }]);
    mesh(cm, B(.3, .38, .3), M.black, 0, .19, 0); mesh(cm, B(.26, .06, .12), M.chrome, 0, .36, .1); mug(cm, 0, .02, .1);
    swapIn(mesh(g, Cy(.07, .08, .2, 16), M.steel, 15.5, 1.01, 8.2), 'vintage_electric_kettle', { x: 15.5, y: .91, z: 8.2, ry: -Math.PI / 2, h: .24 });
    for (let i = 0; i < 4; i++) mug(g, 15.45 + (i % 2) * .12, .91, 9.0 + Math.floor(i / 2) * .12, std([0xf4f1ea, 0x1f1d1c, 0xb98a5e, 0xf4f1ea][i], { roughness: .25 }));
    const fridgeObj = reg(block(g, 15.1, 10.2, .85, .75, 2.0, std(0x1f1d1c, { metalness: .3, roughness: .35 })), 'ตู้เย็น', [{ th: 'เปิดตู้เย็นหาของกิน', how: 'front', d: .9, dir: [-1, 0] }, { th: 'หยิบวัตถุดิบมาทำอาหาร', fx: () => setTimeout(() => cookDish(), 0) }].concat(PACKS.map(pk => ({ th: 'สั่งเสบียง: ' + pk.th + ' ' + baht(pk.thb), fx: () => orderSupply(pk, selectedPid != null ? people.find(x => x.id === selectedPid) : null) }))));
    block(g, 15.08, 10.25, .02, .03, .5, M.chrome, 1.2);
    const dw = block(g, 15.16, 8.15, .02, .62, .72, M.steel, .08); block(g, 15.14, 8.2, .02, .52, .03, M.chrome, .7);
    const dwLed = mesh(g, B(.01, .02, .05), std(0x111111, { emissive: 0x7ee787, emissiveIntensity: 0 }), 15.15, .76, 8.75);
    reg(dw, 'เครื่องล้างจาน', [{ th: 'ล้างจาน', how: 'front', d: .9, dir: [-1, 0], fx: () => { dwLed.material.emissiveIntensity = .9; setTimeout(() => { dwLed.material.emissiveIntensity = 0; }, ACT_MS); } }]);
    g = anchorGroup(root, 14, 8.5);
    const dining = block(g, 12.1, 7.9, 3.3, 1.25, .05, M.oak, .73);
    [12.75, 14.75].forEach(x => mesh(g, Cy(.05, .28, .73, 16), M.black, x, .365, 8.52));
    const settings = [];
    [[12.5, 8.2], [13.3, 8.2], [14.1, 8.2], [14.9, 8.2], [12.5, 8.85], [13.3, 8.85], [14.1, 8.85], [14.9, 8.85], [12.25, 8.52]].forEach(([x, z]) => { const pl = mesh(g, Cy(.12, .1, .015, 24), M.ceramic, x, .785, z); pl.visible = false; settings.push(pl); });
    reg(dining, 'โต๊ะอาหาร', [{ th: 'ตั้งโต๊ะอาหาร', fx: () => settings.forEach(p => { p.visible = !p.visible; }), done: 'ตั้งโต๊ะแล้ว' }, { th: 'เรียกทุกคนมากินข้าว', fx: () => { const chairs = IX.map((x, k) => [x, k]).filter(([x]) => x.name === 'เก้าอี้เพื่อสุขภาพ' && roomAtWorld(x.obj.getWorldPosition(new THREE.Vector3()).x, x.obj.getWorldPosition(new THREE.Vector3()).z) === 6); people.slice(0, chairs.length).forEach((p, i) => { p.act = { k: 'ix', ix: chairs[i][1], a: 0, until: Date.now() + ACT_MS }; }); settings.forEach(p => { p.visible = true; }); render(false); toast([['ข้าวพร้อมแล้ว ', true], ['ทุกคนมากินข้าวกัน', false]]); } }]);
    mesh(g, new THREE.SphereGeometry(.16, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std(0xf6f4ef, { roughness: .25, side: THREE.DoubleSide }), 13.5, .93, 8.8);
    [[0xd9412b, -.05, 0], [0xf2c94c, .06, .03], [0x7bb243, 0, -.06]].forEach(([c, dx, dz]) => mesh(g, Sp(.05, 12, 10), std(c, { roughness: .4 }), 13.5 + dx, .82, 8.8 + dz));
    // a served dish on every plate, hidden until someone cooks
    const food = settings.map(pl => { const fg = grp(g, pl.position.x, .8, pl.position.z, 0); fg.visible = false;
      mesh(fg, new THREE.SphereGeometry(.07, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0xf7f3ea, { roughness: .9 }), -.02, 0, 0);
      const top = mesh(fg, new THREE.SphereGeometry(.06, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), std(0x8a4b2a, { roughness: .7 }), .045, 0, .02); top.scale.y = .5;
      const egg = mesh(fg, Cy(.035, .035, .01, 14), std(0xfffbf0, { roughness: .6 }), .02, .03, -.04); mesh(egg, Cy(.014, .014, .012, 10), std(0xf2b233, { roughness: .4 }), 0, .006, 0);
      return { fg, top, egg }; });
    three.kitchen = { fridge: fridgeObj, dining, settings, food };
    [[12.5, 7.55, 0], [13.3, 7.55, 0], [14.1, 7.55, 0], [14.9, 7.55, 0], [12.5, 9.5, Math.PI], [13.3, 9.5, Math.PI], [14.1, 9.5, Math.PI], [14.9, 9.5, Math.PI], [11.75, 8.52, Math.PI / 2]].forEach(([x, z, r]) => ergoChair(g, x, z, r));
    g = anchorGroup(root, 14, 12); matchaBar(g);
    g = anchorGroup(root, 12.2, 8.5);
    {
      const cols = [0xd9412b, 0xf2c94c, 0x2f7fbf, 0x3a9d5d, 0xe07b2a, 0x8a4bb3, 0xf3f0e8];
      // snack rack
      const sr = grp(g, 12.05, 0, 8.95, 0);
      mesh(sr, B(.45, 1.8, .9), std(0x5a3f2c, { roughness: .7 }), .225, .9, .45);
      for (let r = 0; r < 5; r++) { mesh(sr, B(.42, .02, .86), std(0x3a2a20), .23, .2 + r * .34, .45); for (let k = 0; k < 6; k++) mesh(sr, B(.12, .2 + (k % 2) * .05, .1), std(cols[(r * 3 + k) % cols.length], { roughness: .5 }), .3, .31 + r * .34, .1 + k * .14); }
      reg(sr, 'ชั้นขนมกรุบกรอบ', [{ th: 'หยิบขนมกรุบกรอบ', how: 'front', d: .7, dir: [1, 0], fx: () => useStock('snack', 1) }]);
      // ice cream chest freezer with a glass lid and tubs inside
      const ic = grp(g, 12.05, 0, 10.0, 0);
      mesh(ic, B(.7, .82, 1.2), std(0xf4f6f7, { roughness: .35 }), .35, .41, .6);
      mesh(ic, B(.66, .02, 1.16), std(0xcfe9f5, { transparent: true, opacity: .4, roughness: .05, depthWrite: false }), .35, .83, .6);
      for (let k = 0; k < 8; k++) mesh(ic, Cy(.09, .08, .1, 14), std(cols[k % cols.length], { roughness: .4 }), .2 + (k % 2) * .3, .74, .2 + Math.floor(k / 2) * .27);
      const sgn = mesh(ic, new THREE.PlaneGeometry(.9, .22), std(0xffffff, { map: signTex('ICE CREAM', '#2f7fbf', '#ffffff'), roughness: .4 }), .71, .55, .6); sgn.rotation.y = Math.PI / 2;
      reg(ic, 'ตู้ไอศกรีม', [{ th: 'ตักไอศกรีม', how: 'front', d: .7, dir: [1, 0], fx: () => useStock('snack', 1) }]);
      // a tall double glass-door beverage cooler, lit inside
      const bc = grp(g, 12.05, 0, 11.3, 0);
      mesh(bc, B(.72, 2.0, 1.3), std(0x1f1d1c, { roughness: .35, metalness: .3 }), .36, 1.0, .65);
      mesh(bc, B(.02, 1.62, 1.18), std(0xfff8e8, { emissive: 0xfff2d6, emissiveIntensity: .35 }), .1, 1.0, .65);
      for (let r = 0; r < 5; r++) for (let k = 0; k < 9; k++) mesh(bc, Cy(.035, .035, .2, 10), std(cols[(r + k) % cols.length], { roughness: .3, metalness: .4 }), .4, .35 + r * .32, .14 + k * .125);
      [-.32, .32].forEach(dz => { mesh(bc, B(.02, 1.66, .6), std(0xdff0f6, { transparent: true, opacity: .25, roughness: .03, depthWrite: false }), .73, 1.0, .65 + dz); mesh(bc, B(.03, .5, .03), M.chrome, .75, 1.05, .65 + dz * .12); });
      const ds = mesh(bc, new THREE.PlaneGeometry(1.2, .22), std(0xffffff, { map: signTex('COLD DRINKS', '#1f1d1c', '#8de0bd'), emissive: 0xffffff, emissiveIntensity: .25 }), .73, 1.9, .65); ds.rotation.y = Math.PI / 2;
      reg(bc, 'ตู้เครื่องดื่มใหญ่', [{ th: 'หยิบเครื่องดื่มเย็น ๆ', how: 'front', d: .75, dir: [1, 0], fx: () => useStock('drink', 1) }]);
      // a wine fridge with tinted glass, bottle racks and a soft blue light
      const wf = grp(g, 12.05, 0, 12.75, 0);
      mesh(wf, B(.62, 1.8, .6), std(0x2b2a29, { roughness: .4, metalness: .3 }), .31, .9, .3);
      mesh(wf, B(.02, 1.6, .52), std(0x9fb8ff, { emissive: 0x6f8fff, emissiveIntensity: .3 }), .08, .9, .3);
      for (let r = 0; r < 7; r++) for (let k = 0; k < 3; k++) { const b = mesh(wf, Cy(.035, .035, .34, 10), std(r % 3 ? 0x2c4a2e : 0x6b1f2a, { roughness: .25, metalness: .2 }), .32, .2 + r * .22, .14 + k * .14); b.rotation.z = Math.PI / 2; }
      mesh(wf, B(.02, 1.66, .56), std(0x3a3532, { transparent: true, opacity: .45, roughness: .05, depthWrite: false }), .63, .9, .3);
      reg(wf, 'ตู้ไวน์', [{ th: 'เปิดไวน์ฉลองงานเสร็จ', how: 'front', d: .75, dir: [1, 0], fx: () => useStock('drink', 1) }]);
    }
    // cooking line along the new back wall of the larger kitchen (owner, 14 Oct 2026: a full kitchen like The Sims 4)
    g = anchorGroup(root, 17.5, 5);
    const steel = M.steel, glassBlack = std(0x111214, { roughness: .08, metalness: .4 });
    block(g, 16.15, 5.05, 2.7, .62, .86, M.walnut);
    for (let i = 0; i < 4; i++) block(g, 16.2 + i * .66, 5.66, .62, .02, .7, std(0x6b4630, { roughness: .55 }), .08);
    block(g, 16.12, 5.02, 2.76, .66, .05, std(0x2f3337, { roughness: .25, metalness: .2 }), .86);
    const hob = block(g, 16.4, 5.12, .7, .5, .015, glassBlack, .91);
    const burners = [[16.58, 5.25], [16.92, 5.25], [16.58, 5.5], [16.92, 5.5]].map(([x, z]) => { const r = mesh(g, new THREE.TorusGeometry(.08, .008, 6, 24), std(0x222222, { emissive: 0xff5a1f, emissiveIntensity: 0 }), x, .93, z); r.rotation.x = Math.PI / 2; return r; });
    const pan = grp(g, 16.58, .93, 5.25, .4); mesh(pan, Cy(.13, .11, .06, 24), std(0x2b2a29, { roughness: .4, metalness: .5 }), 0, .03, 0); mesh(pan, B(.28, .02, .03), M.black, .26, .05, 0);
    const pot = mesh(g, Cy(.11, .11, .16, 24), steel, 16.92, 1.0, 5.5);
    const ovenDoor = block(g, 16.4, 5.67, .7, .03, .55, glassBlack, .12);
    const ovenLight = mesh(g, new THREE.PlaneGeometry(.6, .4), new THREE.MeshBasicMaterial({ color: 0x1a1a1a, toneMapped: false }), 16.75, .4, 5.705);
    block(g, 16.42, 5.69, .66, .02, .03, M.chrome, .62);
    // range hood: canopy and chimney
    block(g, 16.3, 5.04, .9, .5, .12, steel, 1.75); block(g, 16.6, 5.04, .3, .25, .75, steel, 1.87);
    // prep area: cutting board, knife, tomatoes, herbs; utensil rail
    block(g, 17.6, 5.18, .45, .3, .025, M.oak, .91);
    [[17.7, 5.3, 0xd9412b], [17.78, 5.24, 0xd9412b], [17.9, 5.3, 0x7bb243]].forEach(([x, z, c]) => mesh(g, Sp(.035, 10, 8), std(c, { roughness: .4 }), x, .96, z));
    block(g, 17.62, 5.38, .22, .02, .01, M.chrome, .94);
    block(g, 16.2, 5.03, 2.5, .03, .02, steel, 1.45);
    [16.5, 16.8, 17.1, 17.4].forEach(x => mesh(g, Cy(.008, .008, .25, 6), M.black, x, 1.33, 5.06));
    const cookFx = { on: false };
    // steam puffs over the pan and the pot while something cooks
    const steam = []; for (let i = 0; i < 10; i++) { const m = mesh(g, Sp(.05, 8, 6), std(0xffffff, { transparent: true, opacity: 0, roughness: 1, depthWrite: false }), 16.58 + (i % 2) * .34, 1.0, 5.25 + (i % 3) * .12); m.castShadow = false; steam.push({ m, t: i / 10 }); }
    three.steam = { list: steam, until: 0, base: 1.0 };
    reg(hob, 'เตาและเครื่องดูดควัน', [{ th: 'ทำอาหาร (สุ่มเมนู)', how: 'front', d: .75, dir: [0, 1], fx: () => setTimeout(() => cookDish(), 0) }]
      .concat(DISHES.map(d => ({ th: 'ทำ' + d.th, fx: () => setTimeout(() => cookDish(d), 0) }))));
    three.kitchen.hob = hob; three.kitchen.burners = burners; three.kitchen.oven = ovenLight;
    reg(ovenDoor, 'เตาอบ', [{ th: 'อบขนม', how: 'front', d: .8, dir: [0, 1], fx: () => { ovenLight.material.color.setHex(0xffb060); setTimeout(() => ovenLight.material.color.setHex(0x1a1a1a), ACT_MS); } }]);
    reg(pan, 'กระทะ', [{ th: 'ผัดกะเพรา', how: 'front', d: .9, dir: [0, 1] }]);
    reg(pot, 'หม้อต้ม', [{ th: 'ต้มน้ำซุป', how: 'front', d: .9, dir: [0, 1] }]);
    // island with a white stone top, a herb planter and three stools
    g = anchorGroup(root, 17.5, 8.5);
    const island = block(g, 16.3, 8.1, 2.2, .95, .88, M.walnut);
    block(g, 16.25, 8.05, 2.3, 1.05, .05, std(0xeeece6, { roughness: .25 }), .88);
    block(g, 16.9, 8.4, .5, .2, .14, std(0x1f1d1c), .93);
    foliage(g, cardsGeo(canopyCards(5, 1.12, .2, .06, .2)), leafMat(TEX.leaf, 0x5d8c44), 17.15, 0, 8.5);
    [16.7, 17.4, 18.1].forEach(x => { const st = movable(grp(g, x, 0, 9.45), 'stool'); reg(st, 'เก้าอี้สตูล', [{ th: 'นั่งเก้าอี้สตูล', how: 'sit', d: 0, dir: [0, -1] }]); mesh(st, Cy(.17, .17, .05, 20), std(0x3b3f45, { roughness: .6 }), 0, .72, 0); mesh(st, Cy(.025, .025, .7, 10), M.chrome, 0, .36, 0); mesh(st, Cy(.18, .2, .02, 20), M.chrome, 0, .01, 0); });
    reg(island, 'เกาะครัว', [{ th: 'เตรียมวัตถุดิบ', how: 'front', d: .95, dir: [0, 1], spread: .7 }]); three.kitchen.island = island;


    // team room: the donut table (owner, 14 Oct 2026); the work places are added by buildDesk
    g = anchorGroup(root, 8, 8.5); donut(g);
    block(g, 5.0, 5.4, 6.4, 6.4, .012, pbrMat('wool_rug', 0x8a6748, { r: 1 }), .08);
    // v59: shades above standing eye height (1.79 to 1.95 m), cords hung from arms on a slim post that stands in the planter
    [[6.7, 8.6], [9.7, 8.6], [8.2, 10.1]].forEach(([px, pz]) => { mesh(g, Cy(.005, .005, .35, 4), M.black, px, 2.125, pz); const sh = mesh(g, new THREE.SphereGeometry(.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(0xd9b48a, { side: THREE.DoubleSide, emissive: 0xffc98a, emissiveIntensity: 0, roughness: .6 }), px, 1.95, pz); sh.scale.y = .8; sh.rotation.x = Math.PI; three.lamps.push({ bulb: sh, light: null });
      const L = Math.hypot(px - DONUT.cx, pz - DONUT.cy), arm = mesh(g, B(.03, .03, L), M.black, (px + DONUT.cx) / 2, 2.3, (pz + DONUT.cy) / 2); arm.rotation.y = Math.atan2(px - DONUT.cx, pz - DONUT.cy); });
    mesh(g, Cy(.03, .035, 1.8, 10), M.black, DONUT.cx, 1.4, DONUT.cy); mesh(g, Cy(.06, .06, .04, 12), M.black, DONUT.cx, 2.3, DONUT.cy);
    {
      const arm = (ax, az, ry, col) => { const a = grp(g, ax, 0, az, ry); mesh(a, B(.8, .42, .8), std(col, { roughness: .95 }), 0, .21, 0); mesh(a, B(.8, .5, .16), std(col, { roughness: .95 }), 0, .62, -.32); [-.34, .34].forEach(sx => mesh(a, B(.12, .3, .8), std(col, { roughness: .95 }), sx, .5, 0)); mesh(a, B(.6, .1, .55), std(0xf1e6d4, { roughness: 1 }), 0, .47, .05); reg(a, 'อาร์มแชร์', [{ th: 'นั่งพักอ่านหนังสือ', how: 'sit', d: .05, dy: .05 }]); };
      arm(2.95, 10.2, Math.PI / 2, 0x8a5a36); arm(2.95, 11.9, Math.PI / 2, 0x6b4630);
      const st = grp(g, 2.95, 0, 11.05, 0); mesh(st, Cy(.28, .28, .04, 24), M.walnut, 0, .5, 0); mesh(st, Cy(.03, .03, .5, 8), M.black, 0, .25, 0); mug(st, .08, .52, 0); plant(st, -.1, .05, .35);
      const sb = grp(g, 4.0, 0, 3.88, 0); mesh(sb, B(2.4, .7, .45), M.walnut, 0, .35, 0); mesh(sb, B(2.42, .03, .47), std(0x3a2a20, { roughness: .6 }), 0, .71, 0);
      for (let i = 0; i < 6; i++) mesh(sb, B(.04, .22 + (i % 3) * .03, .16), std([0x8a5a36, 0x2f4858, 0xf4f1ea][i % 3], { roughness: .8 }), -.9 + i * .05, .84, 0);
      plant(sb, .6, 0, .45); plant(sb, -.4, 0, .4);
      const sl = grp(sb, .95, .72, 0, 0); mesh(sl, Cy(.07, .08, .03, 16), M.black, 0, .015, 0); mesh(sl, Cy(.01, .01, .3, 6), M.black, 0, .17, 0); const ss = mesh(sl, Cy(.08, .12, .14, 16, 1, true), std(0xf3ead6, { side: THREE.DoubleSide, emissive: 0xffd9a0, emissiveIntensity: 0 }), 0, .36, 0); three.lamps.push({ bulb: ss, light: null });
      reg(sb, 'ตู้ข้างผนัง', [{ th: 'จัดของบนตู้', how: 'front', d: .7 }]);
      plant(g, 2.8, 13.0, 1.3); plant(g, 13.1, 13.0, 1.3);
    }
    three.desk = new THREE.Group(); g.add(three.desk);
    g = anchorGroup(root, 4, 12); plant(g, 4.5, 11.5, 1.2);
    g = anchorGroup(root, 11.4, 5.5); plant(g, 11.3, 5.5, 1.2); // anchored inside the team room, not on the corner four rooms share

    purifierFan(anchorGroup(root, 0, 5), .5, 5.6, Math.PI / 4);
    purifierFan(anchorGroup(root, 16, 5), 15.5, 4.4, -Math.PI * .75);
    purifierFan(anchorGroup(root, 6, 0), 5.5, .5, -Math.PI / 4);
    purifierFan(anchorGroup(root, 11.4, 5.5), 11.45, 5.6, Math.PI * 1.25);
    [5, 4, 6].forEach(r => robotVacuum(root, r));
    // garden around the building, the pool, the front yard with the road
    [[-1.8, 1, 1.1], [-3.2, 6.5, 1.2], [-2.8, 11.5, 1], [16.6, -5, 1.1], [41, 6, 1.2], [-1.4, 15.2, 1], [14.8, 15.6, 1.1], [-4, 16, 1.3], [21, 14.5, 1.2], [8, -3, 1.1], [40.5, -3, 1]].forEach(([x, z, s]) => tree(anchorGroup(root, x, z), x, z, s));
    const poolG = anchorGroup(root, 16, 6); poolG.position.x += 4.5; pool(poolG);
    helipad(root);
    buildTerrain(root);
    const front = anchorGroup(root, 8, 12);
    frontYard(front);
    town(front);
    [[5.9, 16.5], [10.1, 16.5]].forEach(([x, z]) => {
      mesh(front, Cy(.04, .05, 2.2, 10), M.black, x, 1.1, z);
      const bulb = mesh(front, Sp(.13, 14, 10), std(0xfff2cc, { emissive: 0xffd36b, emissiveIntensity: 0 }), x, 2.25, z);
      const light = new THREE.PointLight(0xffd59a, 0, 9, 2); light.position.set(x, 2.2, z); front.add(light);
      three.lamps.push({ bulb, light });
    });
    // puddles for rain and fallen leaves for autumn, outside the stretched building
    for (let i = 0; i < 9; i++) {
      let x, z; do { x = -10 + rnd() * 44; z = -8 + rnd() * 24; } while (x > FOOT.x0 - 1 && x < FOOT.x1 + 1 && z > FOOT.z0 - 1 && z < FOOT.z1 + 1);
      const p = mesh(root, new THREE.CircleGeometry(.5 + rnd() * .7, 24), M.puddle, x, .012, z); p.rotation.x = -Math.PI / 2; p.scale.y = .6; three.rainOnly.push(p);
    }
    const fallen = new THREE.InstancedMesh(mapleGeo(520, prng(6262)), mapleLeafMat(), 520); // v59: real maple leaves (CC0 scans), not orange squares
    const dummy = new THREE.Object3D(), col = new THREE.Color();
    for (let i = 0; i < 520; i++) {
      let x, z; do { x = -12 + rnd() * 50; z = -10 + rnd() * 30; } while (x > FOOT.x0 && x < FOOT.x1 && z > FOOT.z0 && z < FOOT.z1);
      dummy.position.set(x, .015, z); dummy.rotation.set(-Math.PI / 2, 0, rnd() * 6); dummy.updateMatrix(); fallen.setMatrixAt(i, dummy.matrix);
      fallen.setColorAt(i, col.setRGB(...[[.9, .85, .8], [.8, .72, .62], [1, .95, .9], [.7, .6, .5], [.85, .8, .7]][i % 5])); // drier and browner on the ground
    }
    fallen.receiveShadow = true; root.add(fallen); three.autumnOnly.push(fallen);
  }

  // Matcha and coffee corner (owner, 14 Oct 2026): a bar at the front of the kitchen.
  const BAR = { x: 12.3, z: 10.55, w: 3.0, d: .7, h: .92 };
  function matchaBar(world) {
    block(world, BAR.x, BAR.z, BAR.w, BAR.d, BAR.h - .05, M.walnut);
    for (let i = 0; i < 4; i++) block(world, BAR.x + .08 + i * .73, BAR.z + BAR.d - .005, .68, .01, .7, std(0x6b4630, { roughness: .5 }), .1);
    block(world, BAR.x - .03, BAR.z - .03, BAR.w + .06, BAR.d + .06, .05, std(0xe9e6df, { roughness: .2 }), BAR.h - .05);
    const y = BAR.h;
    // espresso machine with group head, portafilter and drip tray
    const em = grp(world, 12.75, y, 10.85, 0); reg(em, 'เครื่องเอสเปรสโซ', [{ th: 'ชงเอสเปรสโซ', how: 'front', d: 1.0 }]);
    mesh(em, B(.48, .42, .4), M.chrome, 0, .21, 0); mesh(em, B(.48, .06, .4), M.black, 0, .45, 0);
    mesh(em, Cy(.05, .05, .08, 16), M.black, 0, .27, .22); const pf = mesh(em, B(.04, .03, .2), M.black, 0, .23, .32); pf.rotation.y = .3;
    mesh(em, B(.36, .03, .14), M.steel, 0, .02, .24); mesh(em, Cy(.03, .03, .03, 12), M.ceramic, -.08, .05, .26);
    [-.15, .15].forEach(dx => mesh(em, Cy(.025, .025, .02, 12), M.steel, dx, .38, .21).rotation.x = Math.PI / 2);
    // grinder
    const gr = grp(world, 13.25, y, 10.8, 0);
    mesh(gr, B(.16, .3, .2), M.black, 0, .15, 0); mesh(gr, Cy(.09, .05, .18, 16), std(0x6a4a30, { transparent: true, opacity: .85, roughness: .2 }), 0, .4, 0);
    // matcha set: chawan with whisked matcha, chasen, chashaku, tin, gooseneck kettle
    const ms = grp(world, 13.75, y, 10.85, 0); reg(ms, 'ชุดชงมัทฉะ', [{ th: 'ชงมัทฉะ', how: 'front', d: 1.0 }]);
    mesh(ms, new THREE.SphereGeometry(.07, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std(0x3e4a3c, { roughness: .5, side: THREE.DoubleSide }), 0, .07, 0);
    mesh(ms, Cy(.064, .064, .004, 20), std(0x7fa83a, { roughness: .6 }), 0, .055, 0);
    const whisk = grp(ms, .14, 0, .02); mesh(whisk, Cy(.018, .018, .05, 12), std(0xd9c49a), 0, .025, 0); mesh(whisk, Cy(.03, .016, .06, 16, 1, true), std(0xe6d4a8, { side: THREE.DoubleSide }), 0, .08, 0);
    const scoop = mesh(ms, B(.012, .004, .17), std(0xd9c49a), -.1, .005, .06); scoop.rotation.y = .5;
    mesh(ms, Cy(.04, .04, .1, 18), std(0x4f7a33, { roughness: .35, metalness: .3 }), -.16, .05, -.08);
    const kt = grp(ms, .3, 0, -.06); mesh(kt, Cy(.07, .08, .15, 20), std(0x2a2b2d, { roughness: .3, metalness: .6 }), 0, .075, 0);
    const spout = mesh(kt, new THREE.TorusGeometry(.09, .008, 6, 16, Math.PI / 1.6), std(0x2a2b2d, { metalness: .6, roughness: .3 }), .07, .1, 0); spout.rotation.z = -.4;
    mesh(kt, B(.02, .1, .02), M.black, -.08, .14, 0);
    // cups, a glass of iced matcha latte
    [[-.35, 0], [-.45, .02]].forEach(([dx, dz]) => mug(ms, dx, 0, dz + .15));
    const glass = grp(ms, .55, 0, .1); mesh(glass, Cy(.04, .035, .13, 18), std(0xffffff, { transparent: true, opacity: .3, roughness: .05 }), 0, .065, 0);
    mesh(glass, Cy(.034, .031, .05, 18), std(0xf2efe4), 0, .03, 0); mesh(glass, Cy(.035, .034, .06, 18), std(0x86ad48), 0, .085, 0);
    // menu board on a stand and two bar stools
    const mb = grp(world, 14.5, y, 10.7, -.25); mesh(mb, B(.02, .02, .02), M.black, 0, .01, 0);
    const board = mesh(mb, new THREE.PlaneGeometry(.5, .29), std(0xffffff, { map: TEX.menu, roughness: .9 }), 0, .2, 0); board.rotation.x = -.15;
    mesh(mb, B(.52, .31, .015), std(0x6b4630), 0, .2, -.01).rotation.x = -.15;
    [12.65, 13.35, 14.05, 14.75].forEach(x => { const st = movable(grp(world, x, 0, 11.7), 'stool'); reg(mesh(st, Cy(.18, .18, .05, 20), std(0x3b3f45, { roughness: .6 }), 0, .72, 0), 'เก้าอี้บาร์', [{ th: 'นั่งจิบกาแฟที่บาร์', how: 'sit', d: 0, dy: .2, dir: [0, -1] }]); mesh(st, Cy(.025, .025, .7, 10), M.chrome, 0, .36, 0); mesh(st, Cy(.18, .2, .02, 20), M.chrome, 0, .01, 0); mesh(st, new THREE.TorusGeometry(.14, .01, 6, 20), M.chrome, 0, .3, 0).rotation.x = Math.PI / 2; });
  }

  // Swimming pool (owner, 14 Oct 2026): in the garden to the right of the building.
  // Pool plaza (owner, 14 Oct 2026: "ลานกว้างๆ ขยายสระว่ายน้ำให้ใหญ่ขึ้นและมีน้ำพุและสไลเดอร์"): a larger pool on a
  // wide wooden deck, a fountain on the plaza in front of it and a slide tower at the far corner.
  const POOL = { x: 19.4, z: -1, w: 9, d: 10 };
  function pool(world) {
    // v59: a mosaic floor lit by moving caustics under a clear turquoise shader (poolFloorMat, poolWaterMat)
    const deck = std(0xffffff, { map: TEX.deck, roughness: .7 }), rim = std(0xe8e4dc, { roughness: .6 }), tile = poolFloorMat();
    const { x, z, w, d } = POOL, L = 1.6, R = 5, Bk = 1.6, F = 6;
    [[x - L, z - Bk, w + L + R, Bk], [x - L, z + d, w + L + R, F], [x - L, z, L, d], [x + w, z, R, d]].forEach(([a, b, ww, dd]) => block(world, a, b, ww, dd, .12, deck));
    [[x - .15, z - .15, w + .3, .15], [x - .15, z + d, w + .3, .15], [x - .15, z, .15, d], [x + w, z, .15, d]].forEach(([a, b, ww, dd]) => block(world, a, b, ww, dd, .03, rim, .12));
    block(world, x, z, w, d, .02, tile, .02);
    for (let i = 1; i < 4; i++) block(world, x, z + i * d / 4, w, .05, .01, std(0x2f6f8f, { roughness: .3 }), .045);
    const waveGeo = new THREE.PlaneGeometry(w, d, Math.round(w * 4), Math.round(d * 4));
    const water = new THREE.Mesh(waveGeo, poolWaterMat());
    three.poolWave = { geo: waveGeo, t: 0 };
    water.rotation.x = -Math.PI / 2; water.position.set(x + w / 2, .09, z + d / 2); water.receiveShadow = true; world.add(water);
    three.water = water; reg(water, 'สระว่ายน้ำ', [{ th: 'ว่ายน้ำ', how: 'at', d: 0, dy: -.75, spread: 1.4, dir: [0, 1] }, { th: 'ยืนริมสระ', how: 'front', d: 5.6, spread: .9, dir: [0, 1] }]);
    [[x + .5, z + .02, 0], [x + w - .5, z + d - .02, Math.PI]].forEach(([lx, lz, r]) => {
      const ladder = grp(world, lx, 0, lz, r);
      [-.2, .2].forEach(dx => { const t = mesh(ladder, new THREE.TorusGeometry(.18, .02, 8, 16, Math.PI), M.chrome, dx, .3, .12); t.rotation.y = Math.PI / 2; });
      [.05, .2].forEach(yy => mesh(ladder, B(.42, .02, .06), M.chrome, 0, yy, .25));
    });
    // loungers and umbrellas along the front of the plaza
    for (let i = 0; i < 4; i++) {
      const lx = x + .9 + i * 1.6, lz = z + d + 1.0;
      const l = grp(world, lx, .12, lz, Math.PI); reg(l, 'เตียงอาบแดด', [{ th: 'อาบแดด', how: 'sit', d: .2, dy: .05 }]);
      mesh(l, B(.65, .1, 1.7), std(0xf4f1ea, { roughness: .9 }), 0, .25, 0);
      const back = mesh(l, B(.65, .08, .6), std(0xf4f1ea, { roughness: .9 }), 0, .45, -.75); back.rotation.x = .7;
      [[-.28, -.75], [.28, -.75], [-.28, .75], [.28, .75]].forEach(([a, b]) => mesh(l, B(.04, .2, .04), M.walnut, a, .1, b));
      if (i % 2 === 0) { mesh(world, Cy(.18, .18, .4, 16), M.walnut, lx + .8, .32, lz); mug(world, lx + .8, .52, lz); }
    }
    [x + 1.7, x + 5.0].forEach(ux => {
      const um = grp(world, ux, .12, z + d + 2.2, 0);
      mesh(um, Cy(.2, .22, .05, 20), M.black, 0, .025, 0); mesh(um, Cy(.02, .02, 2.2, 10), M.walnut, 0, 1.1, 0);
      mesh(um, new THREE.ConeGeometry(1.4, .5, 16, 1, true), std(0xf0e6d2, { side: THREE.DoubleSide, roughness: .9 }), 0, 2.15, 0);
    });
    // fountain: a stone basin, two tiers and live water jets
    const fx0 = x + w / 2 + 1.5, fz0 = z + d + 4.2, fg = grp(world, fx0, .12, fz0, 0);
    const stone = std(0xd9cfbf, { roughness: .8 });
    mesh(fg, Cy(1.6, 1.7, .45, 40), stone, 0, .22, 0);
    const pondTop = mesh(fg, new THREE.CircleGeometry(1.45, 40), poolWaterMat(), 0, .4, 0); pondTop.rotation.x = -Math.PI / 2;
    mesh(fg, Cy(.18, .26, 1.1, 16), stone, 0, .75, 0);
    mesh(fg, Cy(.8, .3, .2, 32), stone, 0, 1.3, 0);
    mesh(fg, Cy(.1, .14, .5, 12), stone, 0, 1.6, 0);
    mesh(fg, Cy(.42, .16, .14, 24), stone, 0, 1.9, 0);
    const N = 220, pos = new Float32Array(N * 3), vel = [];
    for (let i = 0; i < N; i++) { pos.set([0, 2 + rnd() * 1.2, 0], i * 3); vel.push({ a: rnd() * Math.PI * 2, s: .5 + rnd() * .6, life: rnd() }); }
    const fgeo = new THREE.BufferGeometry(); fgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const drops = new THREE.Points(fgeo, new THREE.PointsMaterial({ size: .07, color: 0xdff4ff, transparent: true, opacity: .85, depthWrite: false }));
    fg.add(drops); three.fountain = { drops, vel, on: true };
    reg(fg, 'น้ำพุ', [{ th: 'เปิด/ปิดน้ำพุ', fx: () => { three.fountain.on = !three.fountain.on; drops.visible = three.fountain.on; }, done: 'สลับน้ำพุแล้ว' }, { th: 'โยนเหรียญอธิษฐาน', how: 'front', d: 2.2, spread: .8, dir: [0, 1] }]);
    // slide tower: four posts, a deck at 3.2 m with rails, a ladder, and a tube slide spiralling into the pool
    const tx = x + w + 2.6, tz = z + 2.2, tw = grp(world, tx, 0, tz, 0), post = std(0x6b4630, { roughness: .7 });
    [[-.8, -.8], [.8, -.8], [-.8, .8], [.8, .8]].forEach(([a, b]) => mesh(tw, B(.14, 3.9, .14), post, a, 1.95, b));
    mesh(tw, B(1.9, .1, 1.9), deck, 0, 3.2, 0);
    [[0, -.9, 1.9, .06], [-.9, 0, .06, 1.9], [.9, 0, .06, 1.9]].forEach(([a, b, ww, dd]) => mesh(tw, B(ww, .06, dd), post, a, 4.0, b));
    for (let i = 0; i < 12; i++) mesh(tw, B(.7, .05, .06), M.steel, 0, .25 + i * .26, 1.0);
    [-.36, .36].forEach(a => mesh(tw, B(.05, 3.3, .05), M.steel, a, 1.65, 1.0));
    mesh(tw, new THREE.ConeGeometry(1.5, .7, 4, 1), std(0xb98a5e, { roughness: .8 }), 0, 4.6, 0).rotation.y = Math.PI / 4;
    const path = new THREE.CatmullRomCurve3([[0, 3.25, -.7], [-1.0, 2.9, -1.4], [-2.2, 2.4, -.8], [-2.4, 1.8, .6], [-1.6, 1.25, 1.6], [-2.4, .75, 2.4], [-3.4, .32, 2.6]].map(([a, b, c]) => new THREE.Vector3(tx + a, b, tz + c)));
    const slide = new THREE.Mesh(new THREE.TubeGeometry(path, 90, .36, 14, false), std(0xc98a52, { roughness: .35, side: THREE.DoubleSide }));
    slide.castShadow = true; slide.receiveShadow = true; world.add(slide);
    for (let i = 1; i < 6; i++) { const p = path.getPoint(i / 6); mesh(world, Cy(.05, .05, Math.max(.2, p.y - .4), 8), M.steel, p.x, (p.y - .4) / 2 + .1, p.z); }
    reg(tw, 'สไลเดอร์', [{ th: 'เล่นสไลเดอร์', how: 'at', d: 0, dy: 3.17, dir: [-1, 0] }]);
    {
      const bx = x + w + 1.4, bz = z + 5.0, bw = 3.4, bd = 4.6, wall = std(0xece6dc, { roughness: .9 }), trim = std(0x6b4630, { roughness: .7 });
      block(world, bx, bz, bw, bd, 2.6, wall, .12);
      block(world, bx - .15, bz - .15, bw + .3, bd + .3, .12, std(0x2b2a29, { roughness: .6 }), 2.72);
      block(world, bx - .4, bz - .1, .4, bd + .2, .06, std(0x2b2a29, { roughness: .6 }), 2.55);
      const pict = men => ctex(128, 160, (c, ww, hh) => { c.fillStyle = men ? '#2b5f8a' : '#a8445c'; c.fillRect(0, 0, ww, hh); c.fillStyle = '#fff'; c.beginPath(); c.arc(ww / 2, 34, 16, 0, 6.3); c.fill();
        if (men) { c.fillRect(ww / 2 - 18, 56, 36, 50); c.fillRect(ww / 2 - 16, 104, 13, 40); c.fillRect(ww / 2 + 3, 104, 13, 40); } else { c.beginPath(); c.moveTo(ww / 2, 54); c.lineTo(ww / 2 + 30, 116); c.lineTo(ww / 2 - 30, 116); c.closePath(); c.fill(); c.fillRect(ww / 2 - 14, 116, 10, 30); c.fillRect(ww / 2 + 4, 116, 10, 30); } });
      [[true, bz + 1.15, 'ห้องน้ำชาย (สระ)'], [false, bz + 3.45, 'ห้องน้ำหญิง (สระ)']].forEach(([men, dz, name]) => {
        const door = block(world, bx - .03, dz - .45, .06, .9, 2.1, std(0x3a2a20, { roughness: .5 }), .12);
        block(world, bx - .05, dz - .55, .05, 1.1, .1, trim, 2.22);
        const sg = mesh(world, new THREE.PlaneGeometry(.26, .32), std(0xffffff, { map: pict(men), roughness: .4 }), bx - .07, 1.75, dz); sg.rotation.y = -Math.PI / 2;
        reg(door, name, [{ th: 'เข้าห้องน้ำ', how: 'front', d: .7, dir: [-1, 0] }, { th: 'อาบน้ำหลังว่ายน้ำ', how: 'front', d: .7, dir: [-1, 0] }]);
      });
      block(world, bx - .03, bz + 2.27, .08, .06, 2.4, trim, .12);
      // an open rinse shower on the deck between the pool and the changing block
      const rs = grp(world, bx - 1.1, 0, bz + 2.3, 0); mesh(rs, Cy(.04, .04, 2.3, 10), M.chrome, 0, 1.27, 0); mesh(rs, B(.4, .03, .04), M.chrome, -.18, 2.4, 0); mesh(rs, Cy(.1, .08, .03, 16), M.chrome, -.36, 2.37, 0);
      block(world, bx - 1.5, bz + 1.9, .8, .8, .02, std(0x9fb3bd, { roughness: .4 }), .12);
      reg(rs, 'ฝักบัวริมสระ', [{ th: 'ล้างตัวก่อนลงสระ', how: 'front', d: .45 }]);
    }
    plant(world, x - .9, z - .9, 1.4); plant(world, x - .9, z + d + 4.5, 1.4); plant(world, x + w + 4.2, z + d + 4.5, 1.4);
  }

  // Helipad (owner, 14 Oct 2026: "ลานจอดเฮลิคอปเตอร์และต้องกดเพื่อใช้งานได้จริง"): on the open meadow behind the
  // building, clear of the pond and the trees. Tap the helicopter to start it, fly a loop over the map and land.
  function helipad(root) {
    const g = grp(root, 12 * K / 1.4 + 3.6, 0, -14, 0);
    mesh(g, Cy(6.4, 6.6, .12, 48), std(0x3a3836, { roughness: .85 }), 0, .06, 0);
    const pad = mesh(g, new THREE.CircleGeometry(6.2, 48), std(0xffffff, { map: TEX.helipad, roughness: .8 }), 0, .125, 0); pad.rotation.x = -Math.PI / 2;
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; const b = mesh(g, Sp(.09, 10, 8), std(0xd8f5d0, { emissive: 0x66ff88, emissiveIntensity: 0 }), Math.cos(a) * 6.3, .17, Math.sin(a) * 6.3); three.lamps.push({ bulb: b, light: null }); }
    const sock = grp(g, 7.4, 0, -4.6, 0); mesh(sock, Cy(.05, .06, 3.2, 8), M.steel, 0, 1.6, 0);
    const cone = mesh(sock, new THREE.ConeGeometry(.22, 1.1, 12, 1, true), std(0xd2691e, { side: THREE.DoubleSide, roughness: .8 }), .55, 3.1, 0); cone.rotation.z = Math.PI / 2;
    // the helicopter
    const h = grp(g, 0, 1.02, 0, -Math.PI / 4), body = std(0x2b2a29, { roughness: .35, metalness: .5 }), accent = std(0xb98a5e, { roughness: .5, metalness: .3 });
    mesh(h, Sp(1, 28, 20), body, 0, .2, 0).scale.set(1.05, .95, 1.9);
    mesh(h, Sp(1, 24, 16), std(0x1d2a33, { roughness: .05, metalness: .6, transparent: true, opacity: .85 }), 0, .32, 1.05).scale.set(.85, .7, .95);
    mesh(h, Cy(1, 1, .12, 48), accent, 0, -.05, 0).scale.set(1.025, 1, 1.85); // v59: a band that follows the hull, not a plank through it
    const boom = mesh(h, Cy(.22, .1, 3.4, 14), body, 0, .45, -2.9); boom.rotation.x = Math.PI / 2;
    mesh(h, B(.08, 1.0, .6), body, 0, .95, -4.45);
    mesh(h, B(1.2, .06, .4), body, 0, .5, -4.3);
    const tail = grp(h, .14, .95, -4.5, 0); [0, 1].forEach(k => { const bl = mesh(tail, B(.03, .9, .1), M.black, 0, 0, 0); bl.rotation.x = k * Math.PI / 2; });
    mesh(h, Cy(.08, .1, .45, 10), M.black, 0, 1.25, 0);
    const rotor = grp(h, 0, 1.5, 0, 0);
    for (let k = 0; k < 4; k++) { const bl = mesh(rotor, B(5.6, .04, .24), M.black, 0, 0, 0); bl.rotation.y = k * Math.PI / 4; }
    mesh(rotor, Cy(.18, .18, .12, 14), M.steel, 0, 0, 0);
    [-.85, .85].forEach(sx => {
      const sk = mesh(h, Cy(.05, .05, 3.2, 10), M.steel, sx, -.98, 0); sk.rotation.x = Math.PI / 2;
      [-.8, .8].forEach(sz => { const st = mesh(h, Cy(.04, .04, .6, 8), M.steel, sx * .85, -.7, sz); st.rotation.z = -sx * .35; });
    });
    three.heli = { h, rotor, tail, pad: g, home: h.position.clone(), homeRy: h.rotation.y, spin: 0, state: 'idle', t0: 0 };
    reg(h, 'เฮลิคอปเตอร์', [
      { th: 'ขึ้นบินชมเมือง', fx: () => startFlight() },
      { th: 'ติด/ดับเครื่อง', fx: () => { const H = three.heli; if (H.state === 'idle') H.state = 'warm'; else if (H.state === 'warm') H.state = 'idle'; }, done: 'สลับเครื่องยนต์แล้ว' },
      { th: 'ไปขึ้นเครื่อง', how: 'front', d: 2.6, dir: [1, 0] }
    ]);
    reg(g, 'ลานจอดเฮลิคอปเตอร์', [{ th: 'เดินดูลานจอด', how: 'front', d: 7.2, spread: 1, dir: [0, 1] }]);
  }
  function startFlight() {
    const H = three.heli; if (!H || H.state === 'fly') return;
    if (reduce) { toast([['เฮลิคอปเตอร์', true], [' ปิดการเคลื่อนไหวอยู่ ตามการตั้งค่าลดการเคลื่อนไหวของเครื่อง', false]]); return; }
    H.state = 'fly'; H.t0 = performance.now(); sfx.heli(30);
    toast([['เฮลิคอปเตอร์', true], [' ขึ้นบินชมเมือง', false]]);
  }
  // A 30 second flight: 4 s climb, 22 s loop around the office, 4 s descent to the pad.
  function stepHeli(now, dt) {
    const H = three.heli; if (!H) return;
    const target = H.state === 'fly' ? 1 : H.state === 'warm' ? .45 : 0;
    H.spin += (target - H.spin) * Math.min(1, dt * .8);
    // v59: the main rotor turns while the engine runs; on the ground with the engine off it runs down and parks
    if (H.state === 'idle' && H.spin < .012) { H.spin = 0; const r = H.rotor.rotation.y, park = Math.round((r - Math.PI / 4) / (Math.PI / 2)) * Math.PI / 2 + Math.PI / 4; H.rotor.rotation.y += (park - r) * Math.min(1, dt * 1.5); }
    else H.rotor.rotation.y += H.spin * dt * 28;
    H.tail.rotation.x += H.spin * dt * 40;
    if (H.state !== 'fly') return;
    const e = (now - H.t0) / 1000, cx = 8 * K - H.pad.position.x, cz = 6 * K - H.pad.position.z, r = 30;
    if (e < 4) { H.h.position.set(H.home.x, H.home.y + e / 4 * 14, H.home.z); }
    else if (e < 26) {
      const a = (e - 4) / 22 * Math.PI * 2, ang0 = Math.atan2(H.home.z - cz, H.home.x - cx);
      const k = Math.min(1, (e - 4) / 2), k2 = Math.min(1, (26 - e) / 2), blend = Math.min(k, k2);
      const ox = cx + Math.cos(ang0 + a) * r, oz = cz + Math.sin(ang0 + a) * r;
      H.h.position.set(H.home.x + (ox - H.home.x) * blend, H.home.y + 14, H.home.z + (oz - H.home.z) * blend);
      H.h.rotation.y = -(ang0 + a) + (blend > .5 ? 0 : H.homeRy * (1 - blend * 2));
      H.h.rotation.z = blend * .18;
    } else if (e < 30) { H.h.position.set(H.home.x, H.home.y + (30 - e) / 4 * 14, H.home.z); H.h.rotation.set(0, H.homeRy, 0); }
    else { H.h.position.copy(H.home); H.h.rotation.set(0, H.homeRy, 0); H.state = 'idle'; toast([['เฮลิคอปเตอร์', true], [' ลงจอดแล้ว', false]]); }
  }
  function stepFountain(dt) {
    const F = three.fountain; if (!F || !F.on) return;
    const p = F.drops.geometry.attributes.position.array;
    F.vel.forEach((v, i) => {
      v.life += dt * .8; if (v.life > 1) { v.life -= 1; v.a = Math.random() * Math.PI * 2; v.s = .5 + Math.random() * .6; }
      const t = v.life * 1.1, r = v.s * t;
      p[i * 3] = Math.cos(v.a) * r; p[i * 3 + 2] = Math.sin(v.a) * r; p[i * 3 + 1] = 2 + 2.6 * t - 4.9 * t * t;
      if (p[i * 3 + 1] < .4) p[i * 3 + 1] = .4;
    });
    F.drops.geometry.attributes.position.needsUpdate = true;
  }
  // Far landscape (owner, 14 Oct 2026: "ธรรมชาติภายนอกไกลสุดแมปยังต้องสมจริง"): a height field that stays below the
  // meadow near the office and rises into rolling hills, forest and snow-capped peaks towards the horizon.
  const TERRAIN_C = { x: 8, z: 6 };
  function fbm(x, z) {
    let v = 0, a = 1, f = .012;
    for (let o = 0; o < 5; o++) { v += a * (Math.sin(x * f + o * 1.7) * Math.cos(z * f * 1.13 - o * .9) + .5 * Math.sin((x + z) * f * .7 + o)); a *= .5; f *= 2.03; }
    return v;
  }
  function heightAt(x, z) {
    const r = Math.hypot(x - TERRAIN_C.x, z - TERRAIN_C.z), t = Math.min(1, Math.max(0, (r - 72) / 110)), ramp = t * t * (3 - 2 * t);
    if (ramp <= 0) return -1.2; // below the river and lake beds, so the far terrain never covers the water
    return ramp * (18 + 22 * (fbm(x, z) * .5 + .5)) + ramp * ramp * 26 * Math.max(0, fbm(x * .6 + 40, z * .6 - 30));
  }
  function buildTerrain(root) {
    const size = 460, seg = 150, geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2); geo.translate(TERRAIN_C.x, 0, TERRAIN_C.z);
    const p = geo.attributes.position, n = p.count, base = new Float32Array(n * 3), snowy = new Float32Array(n * 3), autumn = new Float32Array(n * 3);
    const c = new THREE.Color(), mix = (a, b, t) => c.copy(lin(a)).lerp(lin(b), Math.max(0, Math.min(1, t)));
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), z = p.getZ(i), y = heightAt(x, z); p.setY(i, y);
      const jitter = (fbm(x * 3.1, z * 2.7) * .5 + .5) * .35;
      if (y < 8) mix(0x6b9a4f, 0x4f7d3c, y / 8 + jitter); else if (y < 26) mix(0x3f6b3a, 0x2f5233, (y - 8) / 18 + jitter * .5); else if (y < 40) mix(0x6f675f, 0x8a8178, (y - 26) / 14); else mix(0x9a9590, 0xf4f8fb, (y - 40) / 6);
      base.set([c.r, c.g, c.b], i * 3);
      const sn = c.clone().lerp(lin(0xeef3f6), y > 2 ? .85 : .6); snowy.set([sn.r, sn.g, sn.b], i * 3);
      const au = c.clone(); if (y < 26) au.lerp(lin([0xb5652a, 0xc98a3a, 0x8a5a2a][i % 3]), .45 + jitter * .3); autumn.set([au.r, au.g, au.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(base.slice(), 3)); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 })); m.receiveShadow = true; m.position.y = -.02;
    root.add(m); three.terrain = { geo, base, snowy, autumn };
    // forests on the hills: instanced conifers and round trees, set on the height field
    const pine = new THREE.InstancedMesh(cardsGeo([{ x: 0, y: 0, z: 0, s: 3.6, a: 0 }], 1.7), new THREE.MeshStandardMaterial({ map: TEX.pine, alphaTest: .45, side: THREE.DoubleSide, roughness: .85 }), 900);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.25, .35, 2, 6), new THREE.MeshStandardMaterial({ color: lin(0x5a3e28), roughness: 1 }), 1400); // v59: a trunk for the round trees too (audit B11)
    const round = new THREE.InstancedMesh(cardsGeo(canopyCards(9, 0, 1.8, 1.4, 1.8)), new THREE.MeshStandardMaterial({ map: TEX.leaf, alphaTest: .45, side: THREE.DoubleSide, roughness: .8 }), 500);
    const d = new THREE.Object3D(), col = new THREE.Color(), ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0); let pi = 0, ri = 0, rt = 0, guard = 0;
    while ((pi < 900 || ri < 500) && guard++ < 20000) {
      const a = rnd() * Math.PI * 2, r = 70 + rnd() * 150, x = TERRAIN_C.x + Math.cos(a) * r, z = TERRAIN_C.z + Math.sin(a) * r, y = heightAt(x, z);
      if (y < .5 || y > 30) continue;
      const s = .7 + rnd() * .9;
      if (pi < 900 && (y > 10 || rnd() < .55)) {
        d.position.set(x, y + 3.1 * s, z); d.rotation.set(0, rnd() * 6, 0); d.scale.set(s, s, s); d.updateMatrix(); pine.setMatrixAt(pi, d.matrix);
        pine.setColorAt(pi, col.copy(lin([0x2f5e3a, 0x2a5233, 0x3a6b42][pi % 3])));
        d.position.set(x, y + .9 * s, z); d.updateMatrix(); trunk.setMatrixAt(pi, d.matrix); pi++;
      } else if (ri < 500) {
        d.position.set(x, y + 3 * s, z); d.rotation.set(0, rnd() * 6, 0); d.scale.set(s, s * 1.1, s); d.updateMatrix(); round.setMatrixAt(ri, d.matrix);
        round.setColorAt(ri, col.copy(lin(0x4f8a4a))); ri++;
        d.position.set(x, y + .9 * s, z); d.scale.set(s * .8, s * 1.05, s * .8); d.updateMatrix(); trunk.setMatrixAt(900 + ri - 1, d.matrix); rt = ri;
      }
    }
    pine.count = pi; round.count = ri;
    for (let k = pi; k < 900; k++) trunk.setMatrixAt(k, ZERO_M); trunk.count = 900 + rt; // pine trunks first, then the round trees' trunks from 900
    [pine, trunk, round].forEach(o => { o.castShadow = false; o.receiveShadow = true; root.add(o); });
    three.forest = { pine, round };
  }
  function weatherTerrain() {
    const T = three.terrain; if (!T) return;
    const src = weather === 'snow' ? T.snowy : weather === 'autumn' ? T.autumn : T.base;
    T.geo.attributes.color.array.set(src); T.geo.attributes.color.needsUpdate = true;
    const c = new THREE.Color();
    [three.forest, three.forest2].forEach(F => { if (!F) return;
    if (F.bush) { for (let i = 0; i < F.bush.count; i++) F.bush.setColorAt(i, c.copy(lin(weather === 'autumn' ? [0xb5652a, 0xc98a3a, 0x8a6a2a][i % 3] : weather === 'snow' ? 0xdfe8ec : [0x3f6b38, 0x4f7d3c, 0x5a8a44][i % 3]))); F.bush.instanceColor.needsUpdate = true; }
    for (let i = 0; i < F.round.count; i++) F.round.setColorAt(i, c.copy(lin(weather === 'autumn' ? [0xc8582a, 0xe0922f, 0xb33d26, 0xd9b03a][i % 4] : weather === 'snow' ? 0xdfe8ec : weather === 'rain' ? 0x3a6b3c : 0x4f8a4a)));
    F.round.instanceColor.needsUpdate = true;
    for (let i = 0; i < F.pine.count; i++) F.pine.setColorAt(i, c.copy(lin(weather === 'snow' ? [0xcfdcd6, 0xb9cbc2, 0xdfe8ec][i % 3] : [0x2f5e3a, 0x2a5233, 0x3a6b42][i % 3])));
    F.pine.instanceColor.needsUpdate = true;
    });
  }

  // A tube between two points, for bike frames.
  function tube(g, a, b, r, m) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const o = mesh(g, Cy(r, r, va.distanceTo(vb), 10), m);
    o.position.copy(va).add(vb).multiplyScalar(.5);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    return o;
  }
  function ebike(parent, x, z, ry) {
    const g = grp(parent, x, 0, z, ry), frame = std(0xf1ede6, { roughness: .45 }), dark = M.black;
    [-.52, .52].forEach(wz => {
      const w = mesh(g, new THREE.TorusGeometry(.31, .035, 10, 32), std(0x1a1a1a, { roughness: .7 }), 0, .34, wz); w.rotation.y = Math.PI / 2;
      const rim = mesh(g, new THREE.TorusGeometry(.27, .012, 6, 32), M.steel, 0, .34, wz); rim.rotation.y = Math.PI / 2;
      mesh(g, Cy(.05, .05, .06, 14), dark, 0, .34, wz).rotation.z = Math.PI / 2;
    });
    const R = [0, .34, -.52], F = [0, .34, .52], BB = [0, .3, -.04], ST = [0, .86, -.24], HT = [0, .92, .36], HB = [0, .66, .42];
    tube(g, BB, ST, .022, frame); tube(g, ST, HT, .02, frame); tube(g, BB, HB, .032, frame);
    tube(g, R, BB, .014, frame); tube(g, R, ST, .012, frame); tube(g, HB, F, .016, dark); tube(g, HT, HB, .024, frame);
    tube(g, [0, .6, .08], [0, .45, -.01], .045, std(0x2b2a29, { roughness: .4 }));
    tube(g, HT, [0, 1.02, .32], .014, dark);
    mesh(g, Cy(.012, .012, .52, 8), dark, 0, 1.02, .32).rotation.z = Math.PI / 2;
    mesh(g, B(.11, .05, .24), std(0x3a2a20, { roughness: .6 }), 0, .9, -.27);
    mesh(g, Cy(.07, .07, .02, 18), M.steel, .03, .3, -.04).rotation.z = Math.PI / 2;
    const light = mesh(g, B(.06, .04, .03), std(0xfff6dd, { emissive: 0xffe9b0, emissiveIntensity: .4 }), 0, .88, .42);
    light.userData.lamp = true;
    reg(g, 'จักรยานไฟฟ้า', [{ th: 'ยืม/คืนจักรยาน', fx: ix => { ix.obj.visible = !ix.obj.visible; toast([['จักรยาน', true], [ix.obj.visible ? ' คืนเข้าแท่นชาร์จแล้ว' : ' ถูกยืมออกไปแล้ว', false]]); } }]);
    return g;
  }
  // Front of the office (owner, 14 Oct 2026): e-bike sharing dock for five, a small waiting shelter with
  // three seats, and a planted stone path from the door to the road.
  function frontYard(world) {
    // the road with curbs, centre dashes and a zebra crossing in front of the path
    block(world, -70, 17, 160, 2.6, .02, three.roadMat = std(0x2d2b2a, { roughness: .92 }), .002); // v59: held, so rain can wet it
    [16.85, 19.6].forEach(z => block(world, -70, z, 160, .15, .1, std(0xd8d2c8, { roughness: .8 })));
    for (let x = -68; x < 88; x += 3) if (x < 5 || x > 11) block(world, x, 18.27, 1.4, .06, .005, M.white, .022);
    for (let z = 17.2; z < 19.5; z += .55) block(world, 6.8, z, 2.4, .3, .005, M.white, .022);
    // the path: cream stone slabs in a staggered bond, black gravel edges, box hedges with flowers, bollard lights
    block(world, 6.8, 12, 2.4, 4.85, .015, std(0x2a2826, { roughness: 1 }), .003);
    for (let z = 12.05, row = 0; z < 16.8; z += .6, row++) {
      const off = row % 2 ? .25 : 0;
      [[7.0 + off, .95], [8.0 + off, .95 - off]].forEach(([x, w]) => block(world, x, z, Math.min(w, 9.0 - x), .52, .035, M.paver, .005));
    }
    const hedge = std(0xffffff, { map: TEX.hedge, roughness: .95 }), flowers = [0xf4f1ea, 0xd9c4e8, 0xe8b4a0, 0xf2d27a];
    [[6.2, 6.75], [9.25, 9.8]].forEach(([a, b]) => {
      [[12.2, 15.0], [15.9, 16.8]].forEach(([z0, z1]) => {
        const h = block(world, a, z0, b - a, z1 - z0, .5, hedge); h.scale.y = 1;
        for (let z = z0 + .15; z < z1; z += .28) mesh(world, Sp(.07, 10, 8), std(flowers[Math.floor(rnd() * 4)], { roughness: .7 }), a + (b - a) / 2 + (rnd() - .5) * .3, .53, z);
      });
    });
    for (let z = 12.7; z < 16.8; z += 1.3) [6.88, 9.12].forEach(x => {
      mesh(world, Cy(.06, .06, .55, 14), M.black, x, .275, z);
      const cap = mesh(world, Cy(.065, .065, .06, 14), std(0xfff2cc, { emissive: 0xffd36b, emissiveIntensity: 0 }), x, .5, z); three.lamps.push({ bulb: cap, light: null });
    });
    // a walnut pergola over the path with climbing greenery
    const per = std(0x6b4630, { roughness: .7 });
    [[6.85, 15.25], [9.15, 15.25], [6.85, 15.85], [9.15, 15.85]].forEach(([x, z]) => mesh(world, B(.12, 2.4, .12), per, x, 1.2, z));
    [15.25, 15.85].forEach(z => mesh(world, B(2.7, .12, .1), per, 8, 2.42, z));
    // a solid roof over the path, not open slats (owner, 14 Oct 2026: "หลังคาโซนนอกอาคาร ต้องเป็นหลังคาทึบ")
    for (let x = 6.9; x <= 9.1; x += .3) mesh(world, B(.06, .06, .9), per, x, 2.52, 15.55);
    mesh(world, B(2.95, .07, 1.05), std(0x2b2a29, { roughness: .6 }), 8, 2.6, 15.55); three.snowOnly.push(mesh(world, B(2.9, .05, 1.0), M.snow, 8, 2.66, 15.55)); mesh(world, B(3.0, .14, .05), per, 8, 2.6, 15.05); mesh(world, B(3.0, .14, .05), per, 8, 2.6, 16.06);
    foliage(world, cardsGeo(Array.from({ length: 14 }, () => ({ x: 6.8 + rnd() * 2.4, y: 2.62 + rnd() * .1, z: 15.2 + rnd() * .7, s: .55 + rnd() * .25, a: rnd() * Math.PI }))), leafMat(TEX.leaf, 0x4f8a4a));
    // two tall black planters with olive trees beside the door
    [6.45, 9.55].forEach(x => {
      mesh(world, B(.5, .7, .5), std(0x1f1d1c, { roughness: .5 }), x, .35, 12.35);
      mesh(world, Cy(.03, .04, .8, 8), M.bark, x, 1.1, 12.35);
      foliage(world, cardsGeo(canopyCards(8, 1.55, .32, .28, .4)), leafMat(TEX.leaf, 0x7d8f5a), x, 0, 12.35);
    });
    // e-bike sharing: a concrete pad, five charging posts with green status lights, five bikes, a totem
    block(world, 1.0, 13.6, 4.9, 1.9, .04, std(0xcfc8bc, { roughness: .9 }), .003);
    for (let i = 0; i < 5; i++) {
      const x = 1.5 + i * .95;
      ebike(world, x, 14.35, 0);
      mesh(world, B(.12, .75, .12), std(0x2b2a29, { roughness: .4 }), x, .38, 15.2);
      mesh(world, B(.16, .14, .16), std(0x1f1d1c, { roughness: .3 }), x, .8, 15.2);
      mesh(world, B(.06, .03, .01), std(0x7ee787, { emissive: 0x3fb950, emissiveIntensity: .9 }), x, .82, 15.12);
    }
    const totem = grp(world, 5.6, 0, 15.25, 0); reg(totem, 'จุดยืมจักรยาน', [{ th: 'ดูจำนวนจักรยาน', fx: () => { const n = IX.filter(x => x.name === 'จักรยานไฟฟ้า' && x.obj.visible).length; toast([['จักรยานพร้อมใช้ ', false], [n + ' / 5 คัน', true]]); } }]);
    mesh(totem, B(.45, 1.6, .12), std(0x1f1d1c, { roughness: .4 }), 0, .8, 0);
    mesh(totem, new THREE.PlaneGeometry(.38, .5), screenMat(TEX.bikeSign), 0, 1.15, .062);
    // a small waiting shelter: three walnut seats on black frames under a slatted roof, a side table with a plant
    block(world, 10.2, 13.5, 2.7, 1.6, .04, M.paver, .003);
    for (let i = 0; i < 3; i++) {
      const s = grp(world, 10.75 + i * .8, 0, 14.35, 0); reg(s, 'ที่นั่งรอ', [{ th: 'นั่งรอ', how: 'sit', d: .02 }]);
      mesh(s, B(.5, .05, .46), M.walnut, 0, .46, 0); const bk = mesh(s, B(.5, .38, .04), M.walnut, 0, .7, -.22); bk.rotation.x = -.12;
      [[-.22, -.2], [.22, -.2], [-.22, .2], [.22, .2]].forEach(([a, b]) => mesh(s, Cy(.015, .015, .46, 8), M.black, a, .23, b));
    }
    [[10.3, 13.6], [12.8, 13.6], [10.3, 15.0], [12.8, 15.0]].forEach(([x, z]) => mesh(world, Cy(.03, .03, 2.2, 8), M.black, x, 1.1, z));
    // a solid sloped roof on the waiting shelter, with a walnut fascia and a ceiling underneath
    const sroof = mesh(world, B(2.9, .08, 1.85), std(0x2b2a29, { roughness: .6 }), 11.55, 2.33, 14.3); sroof.rotation.x = .08;
    { const sc = mesh(world, B(2.85, .05, 1.8), M.snow, 11.55, 2.39, 14.3); sc.rotation.x = .08; three.snowOnly.push(sc); }
    block(world, 10.15, 13.42, 2.8, 1.76, .03, std(0xb98a5e, { roughness: .7 }), 2.2);
    mesh(world, B(2.95, .16, .05), std(0x6b4630, { roughness: .7 }), 11.55, 2.3, 13.38); mesh(world, B(2.95, .16, .05), std(0x6b4630, { roughness: .7 }), 11.55, 2.22, 15.22);
    swapIn(mesh(world, Cy(.18, .18, .45, 18), M.black, 12.6, .225, 14.0), 'side_table_01', { x: 12.6, z: 14.0, h: .45 }); plant(world, 12.6, 14.0, .8).position.y = .45;
  }

  // Water sits below the meadow: the meadow has holes cut for the river and the pond, sloped banks run
  // down to the water, so the jetty can be reached by steps going down (owner, 14 Oct 2026).
  const WATER_Y = -.6, BED_Y = -.85;
  function edgesOf(curve, w, vary = true, n = 220) {
    const L = [], R = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = curve.getPoint(t), tg = curve.getTangent(t), nx = -tg.z, nz = tg.x, k = vary ? w * (.9 + .1 * Math.sin(i / 11)) : w;
      L.push([p.x + nx * k, p.z + nz * k]); R.push([p.x - nx * k, p.z - nz * k]);
    }
    return { L, R };
  }
  function strip(A, B, yA, yB, m) {
    const pos = [], uv = [], idx = [];
    A.forEach((a, i) => { const b = B[i]; pos.push(a[0], yA, a[1], b[0], yB, b[1]); uv.push(i / 6, 0, i / 6, 1); if (i) { const s = (i - 1) * 2; idx.push(s, s + 1, s + 2, s + 1, s + 3, s + 2); } });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    // the strip's winding faces down, so draw both sides or the water and the bed disappear from above
    m.side = THREE.DoubleSide;
    const o = new THREE.Mesh(g, m); o.receiveShadow = true; return o;
  }
  function rock(parent, x, z, s, y0 = 0) {
    const r = mesh(parent, new THREE.DodecahedronGeometry(s, 0), std([0x8a8178, 0x6f675f, 0x9a9086][Math.floor(rnd() * 3)], { roughness: .95 }), x, y0 + s * .35, z);
    r.scale.set(1 + rnd() * .5, .55 + rnd() * .3, 1 + rnd() * .4); r.rotation.set(rnd(), rnd() * 6, rnd());
  }
  function reeds(parent, x, z, y0 = 0) {
    const g = grp(parent, x, y0, z);
    for (let i = 0; i < 9; i++) { const h = .7 + rnd() * .6, r = mesh(g, Cy(.012, .02, h, 5), std(0x7a8a3a, { roughness: .9 }), (rnd() - .5) * .5, h / 2, (rnd() - .5) * .5); r.rotation.set((rnd() - .5) * .3, 0, (rnd() - .5) * .3); if (i % 3 === 0) mesh(g, Cy(.03, .03, .16, 8), std(0x5a3a24), r.position.x, h - .05, r.position.z); }
  }
  // ---------- v59 water (owner, 14 Oct 2026: "ผืนหญ้าและผืนน้ำตอนนี้ปลอมมาก ปรับมาให้สมจริงด่วน") ----------
  // The lake and the river share one planar mirror at the water level (the technique of three's Water.js, MIT),
  // rendered once a frame for both, with three's waternormals map (MIT) for slow small waves. A Fresnel blend lays the
  // reflection over a body colour that runs from a shallow green brown at the banks to a dark green in the middle,
  // with foam and a soft fade along the shore, so no plane edge shows. The pool has its own clear turquoise shader
  // over a mosaic floor with moving caustics. Rain draws ripple rings into both.
  const prng = s => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; // v59: its own sequence, so the seeded map keeps its layout
  const GLSL_NOISE = `
    float aoH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float aoN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
      return mix(mix(aoH(i), aoH(i + vec2(1., 0.)), f.x), mix(aoH(i + vec2(0., 1.)), aoH(i + vec2(1., 1.)), f.x), f.y); }
    vec2 aoRipple(vec2 p, float t) { // rain rings: one drop per cell per second, a ring that spreads and fades
      vec2 acc = vec2(0.);
      for (int k = 0; k < 2; k++) {
        vec2 q = p * (k == 0 ? 2.3 : 3.1) + float(k) * 17.3, c = floor(q), f = fract(q) - .5;
        vec2 o = vec2(aoH(c), aoH(c + 4.1)) - .5; float ph = fract(t * (.9 + .3 * aoH(c + 9.7)) + aoH(c + 2.3));
        vec2 d = f - o * .6; float r = length(d), ring = exp(-pow((r - ph * .45) * 22., 2.)) * (1. - ph);
        acc += d / max(r, 1e-3) * ring;
      }
      return acc;
    }`;
  let WAT = null;
  function waterUniforms() {
    if (WAT) return WAT;
    const nt = new THREE.TextureLoader(loadMgr()).load('assets/textures/water/waternormals.jpg');
    nt.wrapS = nt.wrapT = THREE.RepeatWrapping; nt.colorSpace = THREE.NoColorSpace; nt.anisotropy = MAX_ANISO;
    WAT = { time: { value: 0 }, rain: { value: 0 }, ice: { value: 0 }, refl: { value: 0 }, light: { value: 1 }, glow: { value: 0 }, caus: { value: 1 },
      sunDir: { value: new THREE.Vector3(.4, .8, .4).normalize() }, sunColor: { value: new THREE.Color(1, 1, 1) },
      skyTop: { value: lin(0x6fa8d8) }, skyHor: { value: lin(0xbfe0f4) }, normalSampler: { value: nt },
      mirrorSampler: { value: null }, textureMatrix: { value: new THREE.Matrix4() } };
    return WAT;
  }
  // natural water (river: shape 0, its uv.y runs across the strip; pond: shape 1, a circle's radial uv)
  function waterMat(shape) {
    const U = waterUniforms(), u = Object.assign({}, THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
      time: U.time, rain: U.rain, ice: U.ice, refl: U.refl, light: U.light, sunDir: U.sunDir, sunColor: U.sunColor, skyHor: U.skyHor,
      normalSampler: U.normalSampler, mirrorSampler: U.mirrorSampler, textureMatrix: U.textureMatrix, uShape: { value: shape },
      shallowCol: { value: lin(0x6c7a4e) }, deepCol: { value: lin(0x1c3530) }, foamCol: { value: lin(0xe6ece4) }, iceCol: { value: lin(0xdbe9ef) } });
    const m = new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
      vertexShader: `uniform mat4 textureMatrix; varying vec4 vMirror; varying vec3 vW; varying vec2 vUv;
        #include <common>
        #include <fog_pars_vertex>
        void main() { vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vMirror = textureMatrix * w; vUv = uv;
          vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D mirrorSampler, normalSampler; uniform float time, rain, ice, refl, light, uShape;
        uniform vec3 sunDir, sunColor, skyHor, shallowCol, deepCol, foamCol, iceCol; varying vec4 vMirror; varying vec3 vW; varying vec2 vUv;
        #include <common>
        #include <fog_pars_fragment>
        ${GLSL_NOISE}
        void main() {
          float shore = clamp(uShape < .5 ? 1. - abs(vUv.y * 2. - 1.) : 1. - 2. * length(vUv - .5), 0., 1.); // 0 at the bank, 1 in the middle
          vec2 p = vW.xz;
          vec3 s = (texture2D(normalSampler, p / 6.1 + vec2(time / 41., time / 57.)).rgb + texture2D(normalSampler, p / 4.3 - vec2(time / -47., time / 63.)).rgb
            + .6 * texture2D(normalSampler, p / 17.0 + vec2(time / 97., -time / 89.)).rgb) / 2.6 * 2. - 1.;
          float k = (.55 + rain * .5) * (1. - ice * .9);
          vec3 N = normalize(vec3(s.x * k, s.z, s.y * k)); N.xz += aoRipple(p, time) * rain * .35 * (1. - ice); N = normalize(N);
          vec3 eye = cameraPosition - vW; float dist = length(eye); vec3 E = eye / dist;
          vec3 rs = texture2D(mirrorSampler, vMirror.xy / vMirror.w + N.xz * (.002 + 1. / dist) * .55).rgb;
          vec3 R0 = mix(skyHor * light, rs, refl);
          float th = max(dot(E, N), 0.), F = .06 + .94 * pow(1. - th, 5.);
          float deep = smoothstep(0., .75, shore);
          vec3 body = mix(shallowCol, deepCol, deep) * light * (.7 + .3 * max(dot(N, sunDir), 0.));
          vec3 col = mix(body, R0, F) + sunColor * pow(max(dot(N, normalize(sunDir + E)), 0.), 260.) * 3.5 * (1. - ice);
          float fn = aoN(p * 3.1 + vec2(time * .15, -time * .11)) * .6 + aoN(p * 7.7 - time * .2) * .4, band = 1. - smoothstep(0., .1, shore);
          float foam = band * smoothstep(.5, .75, fn + band * .25) * .5 * (1. - ice);
          col = mix(col, foamCol * light, foam);
          float a = mix(mix(.74, .97, smoothstep(0., .4, shore)), 1., F * .8); a = max(a, foam);
          col = mix(col, iceCol * light * (.88 + .12 * fn), ice * .92); a = mix(a, .97, ice);
          a *= smoothstep(0., .04, shore);
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }` });
    three.waters.push({ m }); return m;
  }
  // the one mirror of the lake and the river, rendered before the frame when either is on screen
  const _mv = { p: null };
  function renderMirror() {
    const W = three.mirror; if (!W || !WAT) return;
    if (weather === 'snow' || !W.meshes.length) { WAT.refl.value = 0; return; }
    const V = _mv.p || (_mv.p = { fr: new THREE.Frustum(), m: new THREE.Matrix4(), cp: new THREE.Vector3(), dir: new THREE.Vector3(), up: new THREE.Vector3(), t: new THREE.Vector3(), pl: new THREE.Plane(), q: new THREE.Vector4(), c: new THREE.Vector4() });
    const cam = three.camera; cam.updateMatrixWorld();
    V.fr.setFromProjectionMatrix(V.m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    if (!W.boxes.some(b => V.fr.intersectsBox(b))) return;
    if (W.every > 1 && (W.frame++ % W.every)) return;
    V.cp.setFromMatrixPosition(cam.matrixWorld); if (V.cp.y <= W.y + .05) return;
    const mc = W.cam, y = W.y;
    V.dir.set(0, 0, -1).transformDirection(cam.matrixWorld); V.up.set(0, 1, 0).transformDirection(cam.matrixWorld);
    mc.position.set(V.cp.x, 2 * y - V.cp.y, V.cp.z); V.dir.y = -V.dir.y; V.up.y = -V.up.y;
    mc.up.copy(V.up); mc.lookAt(V.t.copy(mc.position).add(V.dir)); mc.far = cam.far; mc.updateMatrixWorld();
    mc.projectionMatrix.copy(cam.projectionMatrix);
    WAT.textureMatrix.value.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1).multiply(mc.projectionMatrix).multiply(mc.matrixWorldInverse);
    // oblique near plane on the water (Lengyel), so nothing under the surface shows in the reflection
    V.pl.setFromNormalAndCoplanarPoint(V.t.set(0, 1, 0), V.up.set(0, y, 0)).applyMatrix4(mc.matrixWorldInverse);
    const P = mc.projectionMatrix.elements; V.c.set(V.pl.normal.x, V.pl.normal.y, V.pl.normal.z, V.pl.constant);
    V.q.set((Math.sign(V.c.x) + P[8]) / P[0], (Math.sign(V.c.y) + P[9]) / P[5], -1, (1 + P[10]) / P[14]);
    V.c.multiplyScalar(2 / V.c.dot(V.q)); P[2] = V.c.x; P[6] = V.c.y; P[10] = V.c.z + 1; P[14] = V.c.w;
    const r = three.renderer, prev = r.getRenderTarget(), sh = r.shadowMap.autoUpdate;
    W.meshes.forEach(o => { o.visible = false; }); if (three.water) three.water.visible = false;
    mc.layers.set(W.lite ? 2 : 1); const c0 = r.info.render.calls;
    r.shadowMap.autoUpdate = false; r.setRenderTarget(W.rt); r.state.buffers.depth.setMask(true); r.clear(); r.render(three.scene, mc);
    W.cost = r.info.render.calls - c0; if (!W.lite) W.fullCost = W.cost; W.drew = true;
    r.setRenderTarget(prev); r.shadowMap.autoUpdate = sh;
    W.meshes.forEach(o => { o.visible = true; }); if (three.water) three.water.visible = true;
    WAT.refl.value = 1;
  }
  function sizeMirror() {
    const W = three.mirror; if (!W) return;
    const s = new THREE.Vector2(); three.renderer.getDrawingBufferSize(s);
    const k = W.half ? .35 : .5; W.rt.setSize(Math.max(256, Math.round(s.x * k)), Math.max(256, Math.round(s.y * k)));
  }
  function initMirror(meshes, y) {
    const U = waterUniforms(), rt = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType });
    U.mirrorSampler.value = rt.texture;
    three.mirror = { rt, cam: new THREE.PerspectiveCamera(), meshes, y, every: 1, frame: 0, half: false, boxes: meshes.map(o => { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o).expandByScalar(2); }) };
    // What the water can reflect goes on layer 1, the only layer the mirror camera draws: the map's merged batches,
    // the forests, the terrain and every piece standing outside the building. People, the furniture inside the
    // rooms and the water itself stay off it, which keeps the reflection to about a third of a frame's draw calls.
    three.mirror.cam.layers.set(1); three.mirror.budget = 2000; three.mirror.lite = false;
    const peopleSet = new Set(); if (three.people) three.people.traverse(o => peopleSet.add(o));
    const b = new THREE.Box3(), c = new THREE.Vector3(); let n = 0;
    const near = meshes.map(o => new THREE.Box3().setFromObject(o).expandByVector(new THREE.Vector3(5, 6, 5))), wide = meshes.map(o => new THREE.Box3().setFromObject(o).expandByVector(new THREE.Vector3(30, 40, 30))); // small pieces count only beside the water (the bridge, the jetty, the boat)
    three.scene.updateMatrixWorld(true);
    three.scene.traverse(o => {
      if (o.isLight) { o.layers.enable(1); o.layers.enable(2); return; } // the same lights in both passes, so no material needs a second program
      if (!(o.isMesh || o.isInstancedMesh) || peopleSet.has(o) || meshes.includes(o) || o === three.water || o === three.grass) return;
      if (!o.isInstancedMesh) {
        b.setFromObject(o); if (b.isEmpty() || b.max.y < .5) return; // ground-hugging pieces never show in a reflection
        b.getCenter(c); if (c.x > FOOT.x0 && c.x < FOOT.x1 && c.z > FOOT.z0 && c.z < FOOT.z1 && b.max.y < 3) return; // the rooms' furniture and their merged batches
        if (!o.userData.batch && b.getSize(c).length() < 1.2 && !near.some(w => w.intersectsBox(b))) return;
        if (!wide.some(w => w.intersectsBox(b))) return; // too far from the water to show in it
      }
      o.layers.enable(1); n++;
      // layer 2 is the lean reflection used when a frame would pass the draw-call budget: the forests, the terrain,
      // the sky and whatever stands right at the water (the bank trees, the bridge, the jetty, the boat)
      if (o.isInstancedMesh || b.isEmpty() || b.getSize(c).length() > 200 || near.some(w => w.intersectsBox(b))) o.layers.enable(2);
    });
    three.mirror.reflects = n;
  }
  // the pool: clear turquoise over its tiles, deeper looking at a glancing angle, the sky in its Fresnel reflection
  function poolWaterMat() {
    const U = waterUniforms();
    if (three.poolMat) return three.poolMat;
    const u = Object.assign({}, THREE.UniformsUtils.clone(THREE.UniformsLib.fog), { time: U.time, rain: U.rain, ice: U.ice, light: U.light, glow: U.glow,
      sunDir: U.sunDir, sunColor: U.sunColor, skyTop: U.skyTop, skyHor: U.skyHor, normalSampler: U.normalSampler,
      poolCol: { value: lin(0x139fb2) }, glowCol: { value: lin(0x3fd6e6) }, iceCol: { value: lin(0xdbe9ef) } });
    three.poolMat = new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, fog: true,
      vertexShader: `varying vec3 vW, vN;
        #include <common>
        #include <fog_pars_vertex>
        void main() { vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
          vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D normalSampler; uniform float time, rain, ice, light, glow; uniform vec3 sunDir, sunColor, skyTop, skyHor, poolCol, glowCol, iceCol;
        varying vec3 vW, vN;
        #include <common>
        #include <fog_pars_fragment>
        ${GLSL_NOISE}
        void main() {
          vec2 p = vW.xz;
          vec3 s = (texture2D(normalSampler, p / 2.3 + vec2(time / 23., time / 31.)).rgb + texture2D(normalSampler, p / 1.7 - vec2(time / -29., time / 37.)).rgb) / 2. * 2. - 1.;
          vec3 N = normalize(vN + vec3(s.x, 0., s.y) * .22 * (1. - ice)); N.xz += aoRipple(p, time) * rain * .3 * (1. - ice); N = normalize(N);
          vec3 E = normalize(cameraPosition - vW);
          float th = max(dot(E, N), 0.), F = .02 + .98 * pow(1. - th, 5.);
          vec3 rd = reflect(-E, N); vec3 sky = mix(skyHor, skyTop, clamp(rd.y, 0., 1.)) * light;
          float absorb = 1. - exp(-1.0 / max(th, .12));
          vec3 body = poolCol * light * .55 + glowCol * glow;
          vec3 col = mix(body, sky, F) + sunColor * pow(max(dot(N, normalize(sunDir + E)), 0.), 300.) * 4. * (1. - ice);
          float a = clamp(mix(absorb * .34, 1., F), 0., 1.);
          col = mix(col, iceCol * light, ice * .9); a = mix(a, .95, ice);
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }` });
    return three.poolMat;
  }
  // the pool floor: a pale mosaic in a light grout, with two drifting caustic nets (their minimum) lighting it by day
  function poolTileTex() {
    const r = prng(5917);
    return ctex(256, 256, (g, w) => {
      g.fillStyle = '#9cc4cb'; g.fillRect(0, 0, w, w);
      const t = w / 8, cols = ['#e7f6f8', '#d6eff3', '#c6e8ef', '#dff3f6', '#bfe3ea'];
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(x * t + 1.5, y * t + 1.5, t - 3, t - 3); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x * t + 3, y * t + 3, t - 10, 3); }
    }, 1, 1);
  }
  function causticTex() {
    const r = prng(8123), S = 128, n = 22, pts = Array.from({ length: n }, () => [r() * S, r() * S]);
    const c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), im = x.createImageData(S, S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      let f1 = 1e9, f2 = 1e9;
      for (const [px, py] of pts) for (let oy = -S; oy <= S; oy += S) for (let ox = -S; ox <= S; ox += S) { const d = Math.hypot(i - px - ox, j - py - oy); if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d; }
      const e = f2 - f1, v = Math.pow(Math.max(0, 1 - e / 7), 2.2) * 255, k = (j * S + i) * 4;
      im.data[k] = im.data[k + 1] = im.data[k + 2] = v; im.data[k + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = MAX_ANISO; return t;
  }
  function poolFloorMat() {
    const U = waterUniforms(), m = std(0xffffff, { map: poolTileTex(), roughness: .25 }), ct = causticTex();
    m.map.repeat.set(4.5, 5);
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { time: U.time, caus: U.caus, glow: U.glow, causTex: { value: ct } });
      sh.vertexShader = 'varying vec3 vCW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vCW = (modelMatrix * vec4(transformed, 1.)).xyz;');
      sh.fragmentShader = 'uniform sampler2D causTex; uniform float time, caus, glow; varying vec3 vCW;\n' + sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        { vec2 cp = vCW.xz; float c1 = texture2D(causTex, cp * .45 + vec2(time * .031, time * .019)).r, c2 = texture2D(causTex, vec2(-cp.x, cp.y) * .39 + vec2(-time * .024, time * .027)).r;
          float cs = min(c1, c2); reflectedLight.directDiffuse += reflectedLight.directDiffuse * cs * 1.7 * caus; reflectedLight.indirectDiffuse += diffuseColor.rgb * cs * glow * .35; }`)
        // seen only through the pool water: light travelling 1.3 m down and back loses red first, so the white
        // tiles turn turquoise, more so at a glancing look (the path through the water grows as 1 / cos)
        .replace('#include <opaque_fragment>', `{ float th = abs(normalize(cameraPosition - vCW).y); float path = 1.3 / max(th, .18);
          outgoingLight *= exp(-vec3(.85, .16, .1) * path) * (1. - ice * .5); }
          #include <opaque_fragment>`);
      sh.fragmentShader = 'uniform float ice;\n' + sh.fragmentShader; sh.uniforms.ice = U.ice;
    };
    m.customProgramCacheKey = () => 'poolFloor59';
    three.poolFloor = m; return m;
  }
  // ---------- v59 lawns (owner, 14 Oct 2026: the large flat grass planes looked fake) ----------
  // The meadow keeps the CC0 grass set at its 2 m repeat and adds what a real lawn has: a low-frequency brightness and
  // hue drift that hides the repeat, dry patches, worn darker grass along paths, kerbs and trunks, and a wet dark soil
  // band at the river and lake banks. Which ground is lawn comes from one top-down render of the finished map (meadow
  // green, anything else red, the water holes empty), so every path and building is respected without a hand list.
  // Over the lawn near the office stand instanced grass tufts that sway in the wind and shrink away with distance.
  const GROUND = { x0: -60, z0: -46, w: 140, d: 104, cs: .25, U: null };
  function groundUniforms() {
    if (GROUND.U) return GROUND.U;
    const t = new THREE.DataTexture(new Uint8Array([0, 0, 255, 255]), 1, 1); t.needsUpdate = true;
    return (GROUND.U = { gMask: { value: t }, gO: { value: new THREE.Vector2(GROUND.x0, GROUND.z0) }, gS: { value: new THREE.Vector2(GROUND.w, GROUND.d) }, gHas: { value: 0 }, gWet: { value: lin(0x3b2f22) } });
  }
  const FACE_UP = () => THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'); // cards and blades lit from their up normal on both sides
  function groundPatch(m) {
    const G = groundUniforms();
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, G);
      sh.vertexShader = 'varying vec3 vGW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vGW = (modelMatrix * vec4(transformed, 1.)).xyz;');
      sh.fragmentShader = 'uniform sampler2D gMask; uniform vec2 gO, gS; uniform float gHas; uniform vec3 gWet; varying vec3 vGW;\n' + GLSL_NOISE + "\n" + sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
          float gwet = 0.;
          { vec2 p = vGW.xz; float mn = aoN(p * .045) * .6 + aoN(p * .17 + 3.1) * .4, dry = smoothstep(.58, .82, aoN(p * .012 + 7.3));
            diffuseColor.rgb *= mix(.36, .66, mn) * mix(.8, 1.1, aoN(p * .21 + 1.7)) * mix(.88, 1.06, aoN(p * 1.35)) * vec3(.92, 1., .78); diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.22, 1.08, .7), dry * .6);
            vec2 mu = (p - gO) / gS; float inM = step(0., mu.x) * step(mu.x, 1.) * step(0., mu.y) * step(mu.y, 1.) * gHas;
            vec4 mk = texture2D(gMask, clamp(mu, 0., 1.)) * inM; float edge = aoN(p * 1.7) * .35;
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.7, .6, .42), clamp(mk.r * (1.2 + edge) - .05, 0., 1.) * .75);
            gwet = clamp(mk.g * (1. + edge) - .05, 0., 1.); diffuseColor.rgb = mix(diffuseColor.rgb, gWet, gwet * .75); }`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, .38, gwet * .7);');
    };
    m.customProgramCacheKey = () => 'meadow59';
  }
  const BANK_SNOW = { value: 0 };
  // river and lake banks: sand that darkens and turns glossy toward the water and grows over with grass at the top
  function bankMat() {
    const m = std(0x8c7656, { roughness: 1, side: THREE.DoubleSide });
    m.onBeforeCompile = sh => {
      sh.uniforms.bWater = { value: WATER_Y }; sh.uniforms.bSnow = BANK_SNOW; sh.uniforms.bGrass = { value: lin(0x44652f) }; sh.uniforms.bWet = { value: lin(0x4a3b2b) };
      sh.vertexShader = 'varying vec3 vBW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vBW = (modelMatrix * vec4(transformed, 1.)).xyz;');
      sh.fragmentShader = 'uniform float bWater, bSnow; uniform vec3 bGrass, bWet; varying vec3 vBW;\n' + GLSL_NOISE + "\n" + sh.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          float bn = aoN(vBW.xz * 2.3) * .6 + aoN(vBW.xz * 7.1) * .4, bwet = 1. - smoothstep(bWater + .05, bWater + .32 + bn * .1, vBW.y);
          diffuseColor.rgb *= .85 + bn * .3; diffuseColor.rgb = mix(diffuseColor.rgb, bWet, bwet * .85);
          diffuseColor.rgb = mix(diffuseColor.rgb, bGrass * (.8 + bn * .4), smoothstep(-.5 - bn * .16, -.16, vBW.y) * .9);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.86, .9, .93), bSnow * smoothstep(bWater + .12, bWater + .3 + bn * .1, vBW.y));`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, .32, bwet);');
    };
    m.customProgramCacheKey = () => 'bank59';
    three.bankMat = m; return m;
  }
  function blur1(src, W, H, r) {
    const a = new Float32Array(W * H), b = new Float32Array(W * H), n = 2 * r + 1;
    for (let j = 0; j < H; j++) { let s = 0; for (let i = -r; i <= r; i++) s += src[j * W + Math.min(W - 1, Math.max(0, i))]; for (let i = 0; i < W; i++) { a[j * W + i] = s / n; s += src[j * W + Math.min(W - 1, i + r + 1)] - src[j * W + Math.max(0, i - r)]; } }
    for (let i = 0; i < W; i++) { let s = 0; for (let j = -r; j <= r; j++) s += a[Math.min(H - 1, Math.max(0, j)) * W + i]; for (let j = 0; j < H; j++) { b[j * W + i] = s / n; s += a[Math.min(H - 1, j + r + 1) * W + i] - a[Math.max(0, j - r) * W + i]; } }
    return b;
  }
  const blur = (src, W, H, r) => blur1(blur1(src, W, H, r), W, H, r);
  function buildGround() {
    if (!three.ok || !three.meadowMesh) return;
    const r = three.renderer, scene = three.scene, G = GROUND, W = Math.round(G.w / G.cs), H = Math.round(G.d / G.cs);
    // 1. the top-down lawn map: everything between the meadow and 60 cm above it, seen from straight above
    const rt = new THREE.WebGLRenderTarget(W, H), cam = new THREE.OrthographicCamera(-G.w / 2, G.w / 2, G.d / 2, -G.d / 2, 0, .603);
    cam.position.set(G.x0 + G.w / 2, .6, G.z0 + G.d / 2); cam.up.set(0, 0, -1); cam.lookAt(cam.position.x, -1, cam.position.z); cam.updateMatrixWorld();
    const red = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide }), green = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
    const vis = [], mats = [];
    [three.people, three.rain, three.snow, three.leaves].concat(three.snowOnly, three.rainOnly, three.autumnOnly).forEach(o => { if (o) { vis.push([o, o.visible]); o.visible = false; } });
    scene.traverseVisible(o => { if (o.isMesh) { mats.push([o, o.material]); o.material = o === three.meadowMesh ? green : red; } else if (o.isPoints || o.isLine || o.isSprite) { vis.push([o, o.visible]); o.visible = false; } });
    const bg = scene.background, fog = scene.fog, cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha(), sh = r.shadowMap.autoUpdate;
    scene.background = null; scene.fog = null; r.shadowMap.autoUpdate = false;
    r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(); r.render(scene, cam);
    const px = new Uint8Array(W * H * 4); r.readRenderTargetPixels(rt, 0, 0, W, H, px);
    r.setRenderTarget(null); r.setClearColor(cc, ca); r.shadowMap.autoUpdate = sh; scene.background = bg; scene.fog = fog;
    mats.forEach(([o, m]) => { o.material = m; }); vis.forEach(([o, v]) => { o.visible = v; });
    rt.dispose(); red.dispose(); green.dispose();
    // rows come back bottom up (bottom = the far +z edge); row j of the data is z0 + (j + .5) * cs
    const lawn = new Float32Array(W * H), occ = new Float32Array(W * H), hole = new Float32Array(W * H);
    for (let rr = 0; rr < H; rr++) for (let i = 0; i < W; i++) {
      const k = (rr * W + i) * 4, j = (H - 1 - rr) * W + i;
      if (px[k + 3] < 128) hole[j] = 1; else if (px[k + 1] > 128 && px[k] < 128) lawn[j] = 1; else occ[j] = 1;
    }
    const wear = blur(occ, W, H, 3), wet = blur(hole, W, H, 3), data = new Uint8Array(W * H * 4);
    for (let j = 0; j < W * H; j++) { data[j * 4] = Math.min(255, wear[j] * 1.7 * 255); data[j * 4 + 1] = Math.min(255, wet[j] * 2.2 * 255); data[j * 4 + 2] = lawn[j] * 255; data[j * 4 + 3] = 255; }
    const tex = new THREE.DataTexture(data, W, H); tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
    const U = groundUniforms(); U.gMask.value = tex; U.gHas.value = 1;
    three.groundInfo = { W, H, lawn: lawn.reduce((a, b) => a + b, 0), occ: occ.reduce((a, b) => a + b, 0), hole: hole.reduce((a, b) => a + b, 0), data };
    // 2. grass tufts over the lawn around the office, thinning out near paths, kerbs and the water
    const rg = prng(4421), spots = [], X0 = -26, X1 = 60, Z0 = -26, Z1 = 36, CAP = 26000;
    for (let z = Z0; z < Z1 && spots.length < CAP; z += G.cs) for (let x = X0; x < X1 && spots.length < CAP; x += G.cs) {
      const i = Math.floor((x - G.x0) / G.cs), j = Math.floor((z - G.z0) / G.cs); if (i < 0 || j < 0 || i >= W || j >= H) continue;
      const q = j * W + i; if (!lawn[q]) continue;
      const keep = .62 * (1 - Math.min(1, wear[q] * 2.2)) * (1 - Math.min(1, wet[q] * 3));
      if (rg() > keep) continue;
      spots.push([x + rg() * G.cs, z + rg() * G.cs, .75 + rg() * .55, rg() * 6.283, rg()]);
    }
    const geo = grassClumpGeo(prng(991)), mat = grassMat();
    const im = new THREE.InstancedMesh(geo, mat, spots.length), d = new THREE.Object3D(), c = new THREE.Color();
    const tints = [[1, 1, 1], [1.1, 1.06, .78], [.84, .96, .82], [.95, 1.02, .9]];
    spots.forEach(([x, z, s, a, h], n) => { d.position.set(x, 0, z); d.rotation.set(0, a, 0); d.scale.set(s, s * (.8 + h * .5), s); d.updateMatrix(); im.setMatrixAt(n, d.matrix); const t = tints[Math.floor(h * 4) % 4]; im.setColorAt(n, c.setRGB(t[0], t[1], t[2])); });
    im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false; im.name = 'grass-tufts';
    scene.add(im); three.grass = im; three.groundInfo.tufts = spots.length;
    // 3. rain splashes: rings that open and fade on the ground, paths and puddles around the office (never on water)
    const sr = prng(8808), sp = [];
    for (let tries = 0; tries < 40000 && sp.length < 2600; tries++) {
      const x = -24 + sr() * 82, z = -22 + sr() * 56; if (x > FOOT.x0 && x < FOOT.x1 && z > FOOT.z0 && z < FOOT.z1) continue;
      const i = Math.floor((x - G.x0) / G.cs), j = Math.floor((z - G.z0) / G.cs); if (i < 0 || j < 0 || i >= W || j >= H || hole[j * W + i]) continue;
      sp[sp.length] = [x, z, sr(), .7 + sr() * .6];
    }
    const sg = new THREE.InstancedBufferGeometry(), sq = new THREE.PlaneGeometry(1, 1); sq.rotateX(-Math.PI / 2);
    sg.index = sq.index; sg.setAttribute('position', sq.attributes.position); sg.setAttribute('uv', sq.attributes.uv);
    sg.setAttribute('aOff', new THREE.InstancedBufferAttribute(new Float32Array(sp.flat()), 4)); sg.instanceCount = sp.length;
    const splash = new THREE.Mesh(sg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: true,
      uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), { time: three.rainU.time, light: three.rainU.light }),
      vertexShader: `attribute vec4 aOff; uniform float time; varying vec2 vUv; varying float vPh;
        #include <common>
        #include <fog_pars_vertex>
        void main() { vPh = fract(aOff.z * 7.3 + time * (1.1 + aOff.z * .6)); vUv = uv;
          vec3 wp = vec3(aOff.x, .045, aOff.y) + position * (.22 * aOff.w);
          vec4 mvPosition = viewMatrix * vec4(wp, 1.); gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform float light; varying vec2 vUv; varying float vPh;
        #include <common>
        #include <fog_pars_fragment>
        void main() { float r = length(vUv - .5) * 2.; float ring = exp(-pow((r - vPh) * 9., 2.)) * (1. - vPh) * step(r, 1.);
          if (ring < .01) discard; gl_FragColor = vec4(vec3(.85, .9, .95) * (.3 + .7 * light), ring * .55);
          #include <fog_fragment>
        }` }));
    splash.frustumCulled = false; splash.renderOrder = 3; splash.visible = false; splash.name = 'rain-splashes';
    scene.add(splash); three.splash = splash; three.groundInfo.splashes = sp.length;
  }
  // nine tapering blades of two segments, leaning out from the clump's centre; aH is the height along the blade
  function grassClumpGeo(r) {
    const pos = [], nor = [], col = [], ah = [], idx = []; let v = 0;
    const base = lin(0x2f4f22), mid = lin(0x557f37), tip = lin(0x8db45a);
    for (let b = 0; b < 9; b++) {
      const a = r() * 6.283, rr = Math.sqrt(r()) * .12, x = Math.cos(a) * rr, z = Math.sin(a) * rr, h = .13 + r() * .2, w = .02 + r() * .014;
      const ba = a + (r() - .5) * 1.2, dx = Math.cos(ba), dz = Math.sin(ba), bend = .03 + r() * .09, fx = -dz, fz = dx, n = new THREE.Vector3(dx * .25, 1, dz * .25).normalize();
      [[0, w, base], [.55, w * .65, mid], [1, 0, tip]].forEach(([t, ww, cl]) => {
        const cx = x + dx * bend * t * t, cz = z + dz * bend * t * t, y = h * t;
        const put = (px, pz) => { pos.push(px, y, pz); nor.push(n.x, n.y, n.z); col.push(cl.r, cl.g, cl.b); ah.push(t); };
        if (ww > 0) { put(cx - fx * ww / 2, cz - fz * ww / 2); put(cx + fx * ww / 2, cz + fz * ww / 2); } else put(cx, cz);
      });
      idx.push(v, v + 1, v + 3, v, v + 3, v + 2, v + 2, v + 3, v + 4); v += 5;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('aH', new THREE.Float32BufferAttribute(ah, 1)); g.setIndex(idx);
    return g;
  }
  function grassMat() {
    const U = waterUniforms(), m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .88 });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { time: U.time, gFade: { value: new THREE.Vector2(44, 78) } });
      sh.vertexShader = 'uniform float time; uniform vec2 gFade; attribute float aH;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec4 gI = modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.); float gF = 1. - smoothstep(gFade.x, gFade.y, distance(cameraPosition, gI.xyz));
          float gw = sin(time * 1.7 + gI.x * .45 + gI.z * .33) * .6 + sin(time * 3.3 + gI.x * 1.3 - gI.z * .9) * .25 + .35;
          transformed.y *= gF; transformed.xz *= mix(.5, 1., gF); transformed.x += gw * aH * aH * .06; transformed.z += gw * aH * aH * .025; }`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', FACE_UP());
    };
    m.customProgramCacheKey = () => 'grass59';
    return m;
  }
  let _street = 7051;
  const srnd = () => { _street = (_street * 16807) % 2147483647; return (_street - 1) / 2147483646; };
  function cardsOwn(n, cy, rx, ry, size) { const out = []; for (let i = 0; i < n; i++) { const u = srnd() * Math.PI * 2, v = Math.acos(2 * srnd() - 1), k = Math.cbrt(srnd()); out.push({ x: Math.sin(v) * Math.cos(u) * rx * k, y: cy + Math.cos(v) * ry * k, z: Math.sin(v) * Math.sin(u) * rx * k, s: size * (.75 + srnd() * .5), a: srnd() * Math.PI }); } return out; }
  function streetTree(parent, x, z, kind, park) {
    const g = grp(parent, x, 0, z, srnd() * 6.28), s = (park ? 1.0 : .85) + srnd() * (park ? .6 : .35);
    if (!park) mesh(g, B(1.3, .06, 1.3), std(0x3a3532, { roughness: .6, metalness: .3 }), 0, .03, 0);
    if (kind === 'palm') {
      let y = 0; for (let i = 0; i < 9; i++) { const seg = mesh(g, Cy(.13 * s, .15 * s, .62 * s, 9), M.bark, Math.sin(i * .18) * .12, y + .31 * s, 0); seg.rotation.z = -.04; y += .6 * s; }
      const fm = leafMat(TEX.leaf, 0x4f8a3e); three.canopies.push({ m: fm, i: three.canopies.length });
      for (let k = 0; k < 9; k++) { const a = k / 9 * 6.28, fr = foliage(g, cardsGeo([{ x: 0, y: 0, z: 0, s: 2.2 * s, a: 0 }], .45), fm, Math.cos(a) * .9 * s, y - .2, Math.sin(a) * .9 * s); fr.rotation.set(Math.sin(a) * .9, a, -Math.cos(a) * .9); }
      return g;
    }
    const spec = {
      rain:   { h: 2.6, top: [26, 3.4, 2.6, .9, 1.5], c: 0x4a7f3c },
      golden: { h: 2.2, top: [18, 3.0, 1.5, 1.2, 1.1], c: 0xf0c535 },
      pink:   { h: 2.2, top: [18, 3.0, 1.6, 1.2, 1.1], c: 0xe38fb4 },
      column: { h: 1.2, top: [16, 3.2, .7, 2.0, .9], c: 0x355f34 },
      shade:  { h: 2.0, top: [20, 2.9, 1.9, 1.3, 1.2], c: 0x3f7f45 }
    }[kind];
    const trunk = mesh(g, Cy(.1 * s, .2 * s, spec.h * s, 10), M.bark, 0, spec.h * s / 2, 0); trunk.rotation.z = (srnd() - .5) * .1;
    if (kind === 'rain') for (let i = 0; i < 5; i++) { const a = i * 1.26, br = mesh(g, Cy(.04 * s, .08 * s, 1.6 * s, 6), M.bark, Math.cos(a) * .55 * s, spec.h * s + .35, Math.sin(a) * .55 * s); br.rotation.set(Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0); }
    const m = leafMat(TEX.leaf, spec.c); three.canopies.push({ m, i: three.canopies.length });
    const [n, cy, rx, ry, sz] = spec.top; foliage(g, cardsGeo(cardsOwn(n, cy * s, rx * s, ry * s, sz * s)), m);
    if (kind === 'golden' || kind === 'pink') { const m2 = leafMat(TEX.leaf, 0x4f8a3e); foliage(g, cardsGeo(cardsOwn(8, cy * s - .3, rx * s * .9, ry * s * .8, sz * s * .9)), m2); }
    reg(g, kind === 'rain' ? 'ต้นจามจุรี' : kind === 'golden' ? 'ต้นราชพฤกษ์' : kind === 'pink' ? 'ต้นชมพูพันธุ์ทิพย์' : 'ต้นไม้ริมทาง', [{ th: 'นั่งพักใต้ร่มไม้', how: 'front', d: 1.3, spread: .6 }]);
    return g;
  }
  function streetLamp(parent, x, z, ry) {
    const g = grp(parent, x, 0, z, ry); mesh(g, Cy(.06, .09, 4.2, 10), M.black, 0, 2.1, 0); mesh(g, B(.9, .06, .1), M.black, .42, 4.15, 0);
    const head = mesh(g, B(.42, .12, .24), std(0xfff3d6, { emissive: 0xffd9a0, emissiveIntensity: 0, roughness: .4 }), .82, 4.08, 0); three.lamps.push({ bulb: head, light: null });
  }
  function bench(parent, x, z, ry) {
    const g = grp(parent, x, 0, z, ry), wood = std(0x8a5a36, { roughness: .7 });
    for (let i = 0; i < 3; i++) mesh(g, B(1.6, .04, .12), wood, 0, .45, -.14 + i * .14);
    for (let i = 0; i < 2; i++) mesh(g, B(1.6, .1, .03), wood, 0, .7 + i * .14, -.22);
    [-.7, .7].forEach(bx => mesh(g, B(.06, .45, .45), M.black, bx, .22, -.05));
    reg(g, 'ม้านั่งริมทาง', [{ th: 'นั่งพักริมทาง', how: 'sit', d: 0, dy: .05 }]);
  }
  function flowerBed(parent, x, z, w) {
    block(parent, x - w / 2, z - .4, w, .8, .3, std(0x9a948a, { roughness: .95 }));
    block(parent, x - w / 2 + .06, z - .34, w - .12, .68, .32, std(0x5a3f2c, { roughness: 1 }));
    for (let i = 0; i < w * 6; i++) mesh(parent, Sp(.07, 6, 5), flowerMat([0xe0542f, 0xf2c94c, 0xf3d7e0, 0xffffff, 0xb05aa0][i % 5]), x - w / 2 + .15 + srnd() * (w - .3), .36, z - .25 + srnd() * .5);
  }
  // v59: flowers share one material per colour (held, so the batches keep it): snow hides them all at once
  function flowerMat(hex, r = .6) { const k = hex + '|' + r; three.flowerMats = three.flowerMats || {}; return three.flowerMats[k] || (three.flowerMats[k] = std(hex, { roughness: r })); }
  function shrub(parent, x, z) {
    const g = grp(parent, x, 0, z, srnd() * 6), s = .7 + srnd() * .5;
    const m = leafMat(TEX.leaf, [0x4f7d3c, 0x5d8c44, 0x3f6b3a][Math.floor(srnd() * 3)]); three.canopies.push({ m, i: three.canopies.length });
    foliage(g, cardsGeo(cardsOwn(9, .45 * s, .7 * s, .4 * s, .6 * s)), m);
    reg(g, 'พุ่มไม้', [{ th: 'รดน้ำพุ่มไม้', how: 'front' }]);
    if (srnd() < .5) for (let i = 0; i < 8; i++) mesh(g, Sp(.05, 6, 5), flowerMat([0xe0542f, 0xf3d7e0, 0xffffff, 0xf2c94c][i % 4]), (srnd() - .5) * 1.1 * s, .5 * s + srnd() * .35, (srnd() - .5) * 1.1 * s);
    return g;
  }
  function plantEmptyLand() {
    if (!NAV.g) return;
    const poolBox = three.water ? new THREE.Box3().setFromObject(three.water).expandByScalar(3.5) : null;
    const kinds = ['rain', 'shade', 'golden', 'pink', 'column', 'palm', 'shade', 'rain'], placed = [];
    const clear = (x, z, rad) => { const [ci, cj] = cellOf(x, z), rc = Math.ceil(rad / NAV.cs); for (let j = cj - rc; j <= cj + rc; j++) for (let i = ci - rc; i <= ci + rc; i++) { if (i < 0 || j < 0 || i >= NAV.nx || j >= NAV.nz) return false; if (NAV.g[j * NAV.nx + i]) return false; } return true; };
    for (let k = 0; k < 2600 && placed.length < 140; k++) {
      const x = -55 + srnd() * 120, z = -22 + srnd() * 78;
      if (x > -2 && x < 28 && z > -2 && z < 19) continue; // the building and its front yard
      if (z > 14.5 && z < 27) continue; // the road, the sidewalks and the street trees
      if (Math.hypot(x - 8, z - 6) > 68) continue;
      if (poolBox && x > poolBox.min.x && x < poolBox.max.x && z > poolBox.min.z && z < poolBox.max.z) continue; // never in the pool
      if (!clear(x, z, 3.0) || placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 5)) continue;
      placed.push([x, z]);
      const t = srnd() < .3 ? shrub(three.scene, x, z) : streetTree(three.scene, x, z, kinds[placed.length % kinds.length], true);
      const r = .35, [ci, cj] = cellOf(x, z), rc = Math.ceil(r / NAV.cs);
      for (let j = cj - rc; j <= cj + rc; j++) for (let i = ci - rc; i <= ci + rc; i++) if (i >= 0 && j >= 0 && i < NAV.nx && j < NAV.nz) NAV.g[j * NAV.nx + i] = 1;
    }
  }
  function streetscape(front) {
    const kinds = ['rain', 'golden', 'shade', 'pink', 'rain', 'column', 'palm', 'shade'];
    let k = 0;
    for (let x = -66; x <= 88; x += 7.5) {
      streetTree(front, x, 21.3, kinds[k++ % kinds.length]);
      if (x < -6 || x > 26) streetTree(front, x + 3.7, 15.3, kinds[(k + 3) % kinds.length]);
      if (Math.round(x / 7.5) % 2 === 0) { streetLamp(front, x + 1.8, 20.95, Math.PI); if (x < -6 || x > 26) streetLamp(front, x + 1.8, 15.65, 0); }
      if (Math.round(x / 7.5) % 3 === 0) { bench(front, x === 46.5 ? 36 : x + 5.6, 21.15, Math.PI); /* v59: this one bench stands at 36, clear of the showroom row, so all six bays fit */ if (x < -6 || x > 26) flowerBed(front, x + 6.2, 15.4, 2.2); }
    }
  }
  function conifer(parent, x, z, s) {
    mesh(parent, Cy(.1 * s, .16 * s, 1.2 * s, 8), M.bark, x, .6 * s, z);
    const m = leafMat(TEX.pine, 0x2f5e3a); three.conifers.push(m);
    foliage(parent, cardsGeo([{ x: 0, y: 2.1 * s, z: 0, s: 2.8 * s, a: rnd() * Math.PI }], 1.55), m, x, 0, z);
  }
  function bridge(parent, cx, cz, ry) {
    const g = grp(parent, cx, 0, cz, ry), plank = std(0xffffff, { map: TEX.deck, roughness: .7 }), post = std(0x6b4630, { roughness: .7 }), rail = std(0x8a5a36, { roughness: .6 });
    g.userData.walkable = true;
    reg(g, 'สะพานไม้', [{ th: 'ชมวิวบนสะพาน', how: 'at', d: 0, dy: 1.42, spread: .5, dir: [1, 0] }]);
    const span = 11, rise = 1.3, N = 30, W = 1.9;
    const arc = t => ({ z: -span / 2 + t * span, y: .2 + Math.sin(t * Math.PI) * rise });
    for (let i = 0; i < N; i++) {
      const t = (i + .5) / N, a = arc(t), da = arc(Math.min(1, t + .01)), db = arc(Math.max(0, t - .01));
      const p = mesh(g, B(W, .08, span / N - .03), plank, 0, a.y, a.z); p.rotation.x = -Math.atan2(da.y - db.y, da.z - db.z);
    }
    for (let i = 0; i < 12; i++) { const t = (i + .5) / 12, a = arc(t); const beam = mesh(g, B(.12, .14, span / 12), post, 0, a.y - .12, a.z); beam.rotation.x = -Math.atan2(arc(t + .01).y - arc(t - .01).y, .02 * span); }
    [-1, 1].forEach(s => {
      for (let i = 0; i <= 8; i++) { const a = arc(i / 8); mesh(g, B(.1, .95, .1), post, s * (W / 2 - .05), a.y + .45, a.z); }
      for (let i = 0; i < 24; i++) {
        const a0 = arc(i / 24), a1 = arc((i + 1) / 24), len = Math.hypot(a1.z - a0.z, a1.y - a0.y), rx = -Math.atan2(a1.y - a0.y, a1.z - a0.z);
        mesh(g, B(.09, .07, len + .02), rail, s * (W / 2 - .05), (a0.y + a1.y) / 2 + .92, (a0.z + a1.z) / 2).rotation.x = rx;
        mesh(g, B(.05, .05, len + .02), rail, s * (W / 2 - .05), (a0.y + a1.y) / 2 + .5, (a0.z + a1.z) / 2).rotation.x = rx;
      }
      [0, 1].forEach(e => { const a = arc(e); const lp = mesh(g, B(.18, 1.2, .18), post, s * (W / 2 + .02), a.y + .55, a.z); const lan = mesh(g, B(.2, .2, .2), std(0xfff2cc, { emissive: 0xffd36b, emissiveIntensity: 0 }), lp.position.x, a.y + 1.25, a.z); three.lamps.push({ bulb: lan, light: null }); });
    });
    block(g, -W / 2 - .2, -span / 2 - 1.6, W + .4, 1.6, .05, plank);
    block(g, -W / 2 - .2, span / 2, W + .4, 1.6, .05, plank);
  }
  // A small jetty with steps down from the bank, a mooring post, and a wooden rowboat tied to it.
  function jetty(parent, curve) {
    let best = 0, bd = 1e9; for (let i = 0; i <= 400; i++) { const p = curve.getPoint(i / 400), d = Math.abs(p.x - 12.6); if (d < bd) { bd = d; best = i / 400; } }
    const p = curve.getPoint(best), tg = curve.getTangent(best), ry = Math.atan2(-tg.z, tg.x);
    const g = grp(parent, p.x, 0, p.z, ry); three.jetty = g;
    const plank = std(0xffffff, { map: TEX.deck, roughness: .7 }), dark = std(0x5a3a24, { roughness: .8 }), deckY = -.35;
    for (let i = 0; i < 4; i++) block(g, -.55, -5.15 + i * .28, 1.1, .28, .05, plank, -.09 * (i + 1) - .02);
    [-.6, .6].forEach(x => { const s = mesh(g, B(.06, .14, 1.2), dark, x, -.22, -4.6); s.rotation.x = -.3; });
    for (let z = -4.03; z < -1.95; z += .21) block(g, -.6, z, 1.2, .18, .05, plank, deckY - .05);
    [-3.9, -2.95, -2.05].forEach(z => [-.63, .63].forEach(x => mesh(g, Cy(.07, .08, 1.0, 10), dark, x, deckY - .35, z)));
    mesh(g, Cy(.09, .1, .5, 12), dark, .55, deckY + .2, -2.15);
    mesh(g, B(.05, .04, .26), M.black, .55, deckY + .1, -2.15);
    const lantern = grp(g, -.55, deckY, -2.15); mesh(lantern, B(.06, 1, .06), dark, 0, .5, 0);
    const lb = mesh(lantern, B(.16, .2, .16), std(0xfff2cc, { emissive: 0xffd36b, emissiveIntensity: 0 }), 0, 1.08, 0); three.lamps.push({ bulb: lb, light: null });
    // rowboat: wooden hull, gunwale, two thwarts, two oars resting inside
    const boat = grp(g, 1.55, WATER_Y + .3, -1.35, 0); three.boat = boat; three.boatY = boat.position.y;
    reg(boat, 'เรือไม้', [{ th: 'พายเรือเล่น', how: 'at', d: 0, dy: -.9, dir: [1, 0], fx: () => { three.rowing = performance.now() + ACT_MS; } }]);
    const hullMat = std(0xffffff, { map: TEX.deck, roughness: .65, side: THREE.DoubleSide });
    const hull = mesh(boat, new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), hullMat, 0, 0, 0); hull.scale.set(1.6, .4, .55);
    const gun = mesh(boat, new THREE.TorusGeometry(1, .035, 8, 48), std(0x5a3a24, { roughness: .6 }), 0, 0, 0); gun.rotation.x = Math.PI / 2; gun.scale.set(1.6, .55, 1);
    // floorboards above the waterline, so no river shows inside the hull
    const floor = mesh(boat, new THREE.CircleGeometry(1, 32), std(0xffffff, { map: TEX.deck, roughness: .7, side: THREE.DoubleSide }), 0, -.16, 0); floor.rotation.x = -Math.PI / 2; floor.scale.set(1.42, .47, 1);
    [-.5, .55].forEach(x => mesh(boat, B(.12, .04, .98), plank, x, -.08, 0));
    [-.12, .12].forEach(z => { const o = grp(boat, .1, -.05, z, 0); o.rotation.z = .05; mesh(o, Cy(.02, .02, 2.1, 8), dark, 0, 0, 0).rotation.z = Math.PI / 2; mesh(o, B(.32, .015, .1), dark, 1.05, 0, 0); });
    // rope from the mooring post to the stern ring, sagging a little
    const A = new THREE.Vector3(.55, deckY + .1, -2.15), Bp = new THREE.Vector3(1.55 - 1.5, WATER_Y + .32, -1.35);
    const rope = std(0xc9a979, { roughness: .9 });
    for (let i = 0; i < 10; i++) {
      const t0 = i / 10, t1 = (i + 1) / 10, s0 = Math.sin(t0 * Math.PI) * .18, s1 = Math.sin(t1 * Math.PI) * .18;
      const a = A.clone().lerp(Bp, t0); a.y -= s0; const b = A.clone().lerp(Bp, t1); b.y -= s1;
      tube(g, a.toArray(), b.toArray(), .012, rope);
    }
    reeds(g, -1.3, -3.95, WATER_Y); reeds(g, 2.8, -4.0, WATER_Y);
  }
  function buildLandscape(world) {
    const RIVER_PTS = [[-125, 33], [-70, 30], [-40, 27], [-18, 31], [0, 28.5], [10, 29.5], [24, 27], [42, 31], [75, 28], [125, 31]];
    const curve = new THREE.CatmullRomCurve3(RIVER_PTS.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const outer = edgesOf(curve, 5.2, false), inner = edgesOf(curve, 3.9);
    const POND = { x: -16, z: -19, rx: 21, rz: 10 };
    const PSX = POND.rx / 7, PSZ = POND.rz / 7;
    // meadow with holes for the river banks and the pond (shape y = -z, rotated flat)
    const shape = new THREE.Shape(); shape.absarc(8, -6, 150, 0, Math.PI * 2, false);
    const rh = new THREE.Path(); const ring = [...outer.L, ...outer.R.slice().reverse()]; rh.moveTo(ring[0][0], -ring[0][1]); ring.slice(1).forEach(([x, z]) => rh.lineTo(x, -z)); rh.closePath(); shape.holes.push(rh);
    const ph = new THREE.Path(); for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2, x = POND.x + Math.cos(a) * POND.rx, y = -(POND.z + Math.sin(a) * POND.rz); i ? ph.lineTo(x, y) : ph.moveTo(x, y); } shape.holes.push(ph);
    const shapeGeo = new THREE.ShapeGeometry(shape, 48);
    // v58: the meadow from the grass PBR set on its own metre uv (a 2 m repeat), in the procedural grass's colour; the
    // weather tints groundMat.color, so that colour is kept as three.groundTint and applyLight3D multiplies it back in
    const meadow = pbrMat('grass', 0x6b9a4f, { r: 1, uv: 'mesh' }); three.meadow = meadow; three.groundTint = meadow.color.clone();
    [meadow.map, meadow.normalMap, meadow.roughnessMap].forEach(t => t.repeat.set(.5, .5));
    groundPatch(meadow); // v59: macro variation, worn edges and wet banks (buildGround fills its map)
    const m = new THREE.Mesh(shapeGeo, meadow); m.rotation.x = -Math.PI / 2; m.receiveShadow = true; world.add(m); three.meadowMesh = m;
    const snowField = new THREE.Mesh(shapeGeo, M.snow); snowField.rotation.x = -Math.PI / 2; snowField.position.y = .004; snowField.receiveShadow = true; world.add(snowField); three.snowOnly.push(snowField);
    // river: sloped sandy banks, a bed, and the water between them
    const bm = bankMat();
    world.add(strip(outer.L, inner.L, 0, -.75, bm), strip(inner.R, outer.R, -.75, 0, bm));
    world.add(strip(inner.L, inner.R, BED_Y, BED_Y, std(0x6b5a44, { roughness: 1 })));
    const rv = strip(edgesOf(curve, 4.05).L, edgesOf(curve, 4.05).R, WATER_Y, WATER_Y, waterMat(0)); rv.receiveShadow = false; world.add(rv);
    for (let i = 0; i < 50; i++) { const t = rnd(), p = curve.getPoint(t), tg = curve.getTangent(t), side = rnd() < .5 ? -1 : 1, off = 4.2 + rnd() * .9; rock(world, p.x - tg.z * off * side, p.z + tg.x * off * side, .25 + rnd() * .4, -.5 + (off - 4.2) * .5); }
    for (let i = 0; i < 20; i++) { const t = rnd(), p = curve.getPoint(t), tg = curve.getTangent(t), side = rnd() < .5 ? -1 : 1; reeds(world, p.x - tg.z * 3.95 * side, p.z + tg.x * 3.95 * side, WATER_Y); }
    // the bridge in line with the path from the front door, and the jetty beside it
    const bz = curve.getPoint(.47).z; bridge(world, 8, bz, 0); three.bridgeZ = bz;
    three.waterNav = { world, curve, half: 4.3, pond: POND, bridge: { x: 8, z: bz } };
    const landing = bz - 5.5 - 1.6;
    for (let z = 19.85; z < landing; z += .62) { block(world, 7.05, z, .9, .52, .03, M.paver, .005); block(world, 8.05, z, .9, .52, .03, M.paver, .005); }
    jetty(world, curve);
    // the pond: sloped bank, bed, water, lilies and reeds
    const pb = mesh(world, new THREE.CylinderGeometry(7, 6, .75, 64, 4, true), three.bankMat, POND.x, -.375, POND.z); pb.scale.set(PSX, 1, PSZ);
    const bed = mesh(world, new THREE.CircleGeometry(6.05, 64), std(0x8f7a5a, { roughness: 1 }), POND.x, BED_Y, POND.z); bed.rotation.x = -Math.PI / 2; bed.scale.set(PSX, PSZ, 1);
    [[.7, 0x6b5a44], [.42, 0x4a3f33]].forEach(([k, c], i) => { const d = mesh(world, new THREE.CircleGeometry(6.05 * k, 48), std(c, { roughness: 1 }), POND.x, BED_Y + .005 * (i + 1), POND.z); d.rotation.x = -Math.PI / 2; d.scale.set(PSX, PSZ, 1); });
    for (let i = 0; i < 180; i++) { const a = rnd() * 6.3, r = Math.sqrt(rnd()) * 5.6; mesh(world, Sp(.06 + rnd() * .08, 7, 5), std([0x9a8f80, 0xb8ad9c, 0x7d7468][i % 3], { roughness: .9 }), POND.x + Math.cos(a) * r * PSX, BED_Y + .02, POND.z + Math.sin(a) * r * PSZ).scale.y = .5; }
    const pond = mesh(world, new THREE.CircleGeometry(6.25, 64), waterMat(1), POND.x, WATER_Y, POND.z); pond.castShadow = false; reg(pond, 'บึงบัว', [{ th: 'ให้อาหารปลา', how: 'front', d: POND.rz + .6, spread: .8, dir: [0, 1] }]); pond.rotation.x = -Math.PI / 2; pond.scale.set(PSX, PSZ, 1);
    three.natWater = [rv, pond]; // v59: the lake and the river share one mirror (initMirror, after the map is placed)
    for (let i = 0; i < 90; i++) { const a = rnd() * 6.3, r = 2.4 + rnd() * 3.2; const lp = mesh(world, new THREE.CircleGeometry(.3 + rnd() * .25, 14, 0, Math.PI * 1.8), three.lilyMat || (three.lilyMat = std(0x4f8a3e, { roughness: .6, side: THREE.DoubleSide })), POND.x + Math.cos(a) * r * PSX, WATER_Y + .01, POND.z + Math.sin(a) * r * PSZ); lp.rotation.x = -Math.PI / 2; lp.rotation.z = rnd() * 6; if (i % 4 === 0) mesh(world, Sp(.08, 10, 8), flowerMat(0xf3d7e0, .8), lp.position.x, WATER_Y + .05, lp.position.z); }
    for (let i = 0; i < 70; i++) { const a = rnd() * 6.3, rr = 5.9 + rnd() * .35; reeds(world, POND.x + Math.cos(a) * rr * PSX, POND.z + Math.sin(a) * rr * PSZ, WATER_Y); rock(world, POND.x + Math.cos(a + .3) * 7.4 * PSX, POND.z + Math.sin(a + .3) * 7.4 * PSZ, .3 + rnd() * .4); }
    // the lake shore: cattails in clumps, a fallen log half in the water, willows on the far bank
    for (let c = 0; c < 9; c++) { const a = rnd() * 6.3; for (let k = 0; k < 7; k++) { const aa = a + (rnd() - .5) * .12, rr = 6 + rnd() * .3, cx = POND.x + Math.cos(aa) * rr * PSX, cz = POND.z + Math.sin(aa) * rr * PSZ, h = .9 + rnd() * .5;
      mesh(world, Cy(.008, .01, h, 5), std(0x6b7d3a, { roughness: 1 }), cx, WATER_Y + h / 2, cz); mesh(world, Cy(.03, .03, .16, 8), std(0x5a3a22, { roughness: 1 }), cx, WATER_Y + h - .1, cz); } }
    { const lg = grp(world, POND.x + POND.rx * .55, WATER_Y + .05, POND.z - POND.rz * .78, .5); const log = mesh(lg, Cy(.22, .26, 4.2, 12), std(0x6b5440, { roughness: 1 }), 0, 0, 0); log.rotation.z = Math.PI / 2 - .08; mesh(lg, Cy(.05, .05, .9, 6), std(0x5a4636, { roughness: 1 }), -.6, .35, .1).rotation.z = .9; }
    for (let i = 0; i < 9; i++) { const a = Math.PI * (1.08 + i * .1), x = POND.x + Math.cos(a) * (POND.rx + 2.5), z = POND.z + Math.sin(a) * (POND.rz + 2.5); tree(world, x, z, 1.5 + rnd() * .7); }
    // the forest behind the lake: a deep band of mixed conifers and broadleaf trees with an understorey of shrubs,
    // thick where the ground noise is high and opening into clearings where it is low, smaller trees at the edge
    {
      const N = 2400, NR = 1300, NB = 1400;
      const pine = new THREE.InstancedMesh(cardsGeo([{ x: 0, y: 0, z: 0, s: 3.6, a: 0 }], 1.7), new THREE.MeshStandardMaterial({ map: TEX.pine, alphaTest: .45, side: THREE.DoubleSide, roughness: .85 }), N);
      const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.22, .34, 2.2, 6), new THREE.MeshStandardMaterial({ color: lin(0x4a3424), roughness: 1 }), N + NR);
      const round = new THREE.InstancedMesh(cardsGeo(canopyCards(9, 0, 1.8, 1.4, 1.8)), new THREE.MeshStandardMaterial({ map: TEX.leaf, alphaTest: .45, side: THREE.DoubleSide, roughness: .8 }), NR);
      const bush = new THREE.InstancedMesh(cardsGeo(canopyCards(6, 0, .9, .5, 1)), new THREE.MeshStandardMaterial({ map: TEX.leaf, alphaTest: .45, side: THREE.DoubleSide, roughness: .85 }), NB);
      const d = new THREE.Object3D(), col = new THREE.Color(), HELI = { x: 12.4, z: -18.8 };
      let pi = 0, ri = 0, bi = 0, ti = 0, guard = 0;
      const ok = (x, z, m) => ((x - POND.x) / (POND.rx + m)) ** 2 + ((z - POND.z) / (POND.rz + m)) ** 2 > 1 && Math.hypot(x - HELI.x, z - HELI.z) > 11 && z < -6;
      while ((pi < N || ri < NR || bi < NB) && guard++ < 60000) {
        const x = -140 + rnd() * 270, z = -34 - rnd() * 95 * rnd() - rnd() * 30;
        if (!ok(x, z, 4)) continue;
        const dens = fbm(x * 2.2, z * 2.2) * .5 + .5, depth = Math.min(1, (-30 - z) / 25);
        if (rnd() > dens * 1.25 * (.45 + depth * .55)) continue;
        const y = Math.max(0, heightAt(x + 3.2, z + 4.8)), s = (.55 + rnd() * .75) * (.75 + depth * .45);
        if (bi < NB && rnd() < .38) {
          d.position.set(x, y + .45 * s, z); d.rotation.set(0, rnd() * 6, 0); d.scale.set(s, s * .8, s); d.updateMatrix(); bush.setMatrixAt(bi, d.matrix);
          bush.setColorAt(bi, col.copy(lin([0x3f6b38, 0x4f7d3c, 0x5a8a44][bi % 3]))); bi++; continue;
        }
        if (pi < N && rnd() < .6) {
          d.position.set(x, y + 3.1 * s, z); d.rotation.set(0, rnd() * 6, 0); d.scale.set(s, s * (1 + rnd() * .35), s); d.updateMatrix(); pine.setMatrixAt(pi, d.matrix);
          pine.setColorAt(pi, col.copy(lin([0x2f5e3a, 0x2a5233, 0x3a6b42][pi % 3]))); pi++;
        } else if (ri < NR) {
          d.position.set(x, y + 3 * s, z); d.rotation.set(0, rnd() * 6, 0); d.scale.set(s * 1.1, s * 1.15, s * 1.1); d.updateMatrix(); round.setMatrixAt(ri, d.matrix);
          round.setColorAt(ri, col.copy(lin([0x4f8a4a, 0x5a8f45, 0x447a40][ri % 3]))); ri++;
        } else continue;
        d.position.set(x, y + 1 * s, z); d.scale.set(s, s, s); d.updateMatrix(); trunk.setMatrixAt(ti++, d.matrix);
      }
      pine.count = pi; round.count = ri; bush.count = bi; trunk.count = ti;
      [pine, trunk, round, bush].forEach(o => { o.castShadow = false; o.receiveShadow = true; world.add(o); });
      three.forest2 = { pine, round, bush };
    }
    // tree line and far hills
    for (let i = 0; i < 60; i++) {
      const a = rnd() * Math.PI * 2, r = 42 + rnd() * 22, x = 8 + Math.cos(a) * r, z = 6 + Math.sin(a) * r;
      if (z > 20 && z < 40) continue;
      if (((x - POND.x) / (POND.rx + 3)) ** 2 + ((z - POND.z) / (POND.rz + 3)) ** 2 < 1) continue; // never in the lake
      if (i % 3) conifer(world, x, z, 1.2 + rnd() * 1.1); else tree(world, x, z, 1.3 + rnd() * .8);
    }
  }

  // Donut table: a walnut ring with a hole, four legs, a planter in the middle.
  const DONUT = { cx: 8.2, cy: 8.6, rOut: 2.1, rIn: 1.0, h: .74 };
  function donutSeat(i, n) { const a = -Math.PI / 2 + (i / n) * Math.PI * 2, r = DONUT.rOut + .5; return { x: DONUT.cx + r * Math.cos(a), y: DONUT.cy + r * Math.sin(a), a }; }
  function donut(world) {
    const shape = new THREE.Shape(); shape.absarc(0, 0, DONUT.rOut, 0, Math.PI * 2, false);
    const hole = new THREE.Path(); hole.absarc(0, 0, DONUT.rIn, 0, Math.PI * 2, true); shape.holes.push(hole);
    const t = TEX.walnut.clone(); t.needsUpdate = true; t.repeat.set(.4, .4);
    const top = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .05, bevelEnabled: true, bevelThickness: .015, bevelSize: .015, bevelSegments: 2, curveSegments: 64 }), std(0xffffff, { map: t, roughness: .5 }));
    top.rotation.x = -Math.PI / 2; top.position.set(DONUT.cx, DONUT.h - .05, DONUT.cy); top.castShadow = true; top.receiveShadow = true; world.add(top);
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3, r = (DONUT.rOut + DONUT.rIn) / 2; mesh(world, Cy(.03, .03, DONUT.h - .05, 10), M.black, DONUT.cx + r * Math.cos(a), (DONUT.h - .05) / 2, DONUT.cy + r * Math.sin(a)); }
    mesh(world, Cy(.75, .7, .55, 32), std(0x1f1d1c, { roughness: .6 }), DONUT.cx, .275, DONUT.cy);
    const p = plant(world, DONUT.cx, DONUT.cy, 1.5); p.position.y = .5;
  }
  // One work place per seat: an ergonomic chair, a MacBook, a coffee mug; every second seat an external monitor.
  function buildDesk() {
    const g = three.desk; while (g.children.length) g.remove(g.children[0]);
    const n = Math.max(6, people.length);
    for (let i = 0; i < n; i++) {
      const s = donutSeat(i, n), face = faceTo(s.x, s.y, DONUT.cx, DONUT.cy);
      // the top ergonomic chair with a headrest at every donut seat (owner, 14 Oct 2026: "ปรับเก้าอี้ทำงานตรงโต๊ะโดนัท ให้เป็นเก้าอี้เพื่อสุขภาพ ระดับแพงมาก มีที่พิงหัว")
      premiumChair(g, s.x, s.y, face);
      const r = DONUT.rOut - .22, mx = DONUT.cx + r * Math.cos(s.a), mz = DONUT.cy + r * Math.sin(s.a);
      macbook(g, mx, DONUT.h, mz, face + Math.PI, TEX.code[i % 3]);
      const r2 = DONUT.rOut - .28, a2 = s.a + .16;
      mug(g, DONUT.cx + r2 * Math.cos(a2), DONUT.h, DONUT.cy + r2 * Math.sin(a2));
      if (i % 2 === 0) { const r3 = DONUT.rIn + .25, a3 = s.a - .12; monitor(g, DONUT.cx + r3 * Math.cos(a3), DONUT.h, DONUT.cy + r3 * Math.sin(a3), face + Math.PI, TEX.code[(i + 1) % 3], .5); }
    }
    // v58: each chair merged within itself (it stays movable), then the mugs in the desk's space (see staticBatch)
    g.children.filter(o => o.userData.movable).forEach(o => mergeOwn(o));
    mergeOwn(g);
  }

  // ---------- people: a face, hair, and the work clothes of each role ----------
  const SKINS = [0xf1c9a5, 0xe2b089, 0xc98e66, 0xf6d6b8, 0xd8a077, 0xb98260];
  const HAIRS = [0x1b1512, 0x2a1d16, 0x3b2a20, 0x141414, 0x4a3426];
  const STYLES = ['short', 'long', 'bun', 'side', 'short', 'buzz', 'long'];
  const NPC_OUT = [0x7d8f5a, 0xb98a5e, 0x3a3532, 0xe9e4d8, 0x6b4630, 0x55657a, 0xc8b48c, 0x8a5a36];
  const OUTFIT = {
    head: { top: 'blazer', shirt: 0xf4f4f2, coat: 0x2c323b, pants: 0x2c323b, shoes: 0x5a3a24 },
    po:   { top: 'blazer', shirt: 0xf4efe6, coat: 0x6b4a33, pants: 0x2b3a55, shoes: 0x4a3426 },
    ba:   { top: 'shirt', shirt: 0xbcd3ea, pants: 0x2b3a55, shoes: 0x4a3426, glasses: true },
    dev:  { top: 'hoodie', shirts: [0x6b7280, 0x55714f, 0x7b5a8c, 0x9a6b4c], pants: 0x34507a, shoes: 0xf0f0ee },
    qa:   { top: 'polo', shirt: 0x3f8f87, pants: 0xc8b48c, shoes: 0x4a3426 },
    tl:   { top: 'shirt', shirt: 0xf6f6f4, pants: 0x3a3f46, shoes: 0x222222, glasses: true },
    qal:  { top: 'blouse', shirt: 0xe39a90, pants: 0x23272e, shoes: 0x222222 },
    npc:  { top: 'hoodie', shirts: NPC_OUT, pants: 0x3a3f46, shoes: 0xe9e4d8, civilian: true },
    // passers-by by kind (owner, 14 Oct 2026: "คน NPC สมจริงเหมือนคนในออฟฟิศเราหน่อย"): the same faces, hair and
    // detail as the staff, dressed for what they are doing; the kind is also n.type for their lines
    walker:    { top: 'shirt', shirts: [0xdfe7ef, 0xe39a90, 0xf4efe6, 0xbcd3ea], pants: 0x2b3a55, shoes: 0x4a3426, bag: 0x6b4630, civilian: true },
    jogger:    { top: 'tee', shirts: [0x2f8f6f, 0xd9653b, 0x3a5a8c], pants: 0x23272e, shorts: true, shoes: 0xf0f0ee, hat: 'cap', hatColor: 0x1f1d1c, civilian: true },
    dogwalker: { top: 'hoodie', shirts: [0x8a9a7a, 0xb98a5e, 0x6b7280], pants: 0x3a4250, shoes: 0xe9e4d8, civilian: true },
    tourist:   { top: 'tee', shirts: [0xf2d16b, 0x7fb6d8, 0xf4f1ea], pants: 0xc8b48c, shorts: true, shoes: 0x8a6748, hat: 'sun', hatColor: 0xe8dcc0, backpack: 0x3f5a46, phone: true, civilian: true },
    rider:     { top: 'jacket', shirt: 0x2a2b2d, coat: 0xd9653b, pants: 0x2c323b, shoes: 0x1f1d1c, hat: 'helmet', hatColor: 0xf4f4f2, civilian: true },
    cyclist:   { top: 'tee', shirts: [0x3a7a9c, 0x7d8f5a], pants: 0x1f1d1c, shoes: 0xe9e4d8, hat: 'helmet', hatColor: 0x2f8f6f, civilian: true }
  };
  function makeHumanProc(role, idx, pose) {
    const O = OUTFIT[role], g = new THREE.Group(); g.userData.legs = []; g.userData.arms = [];
    const L = { skin: SKINS[(idx * 7 + 3) % SKINS.length], hair: HAIRS[(idx * 3 + 1) % HAIRS.length], style: role === 'qal' ? 'long' : STYLES[(idx * 5 + 2) % STYLES.length], glasses: O.glasses || idx % 4 === 2 };
    const skin = std(L.skin, { roughness: .55 }), skinD = std(new THREE.Color(L.skin).multiplyScalar(.9).getHex(), { roughness: .55 });
    const hairM = std(L.hair, { roughness: .6 });
    const shirt = std(O.shirts ? O.shirts[idx % O.shirts.length] : O.shirt, { roughness: .85 });
    const pants = std(O.pants, { roughness: .85 }), shoes = std(O.shoes, { roughness: .35 }), coat = O.coat ? std(O.coat, { roughness: .7 }) : null;
    const top = coat || shirt, badgeM = std(ROLES[role] ? hexOf(ROLES[role].color) : 0x6b4630, { roughness: .5 });
    const sit = pose !== 'stand', hip = sit ? .5 : .9;
    [-1, 1].forEach(s => {
      if (sit) {
        const th = mesh(g, Cy(.075, .068, .44, 12), pants, s * .1, hip, .2); th.rotation.x = Math.PI / 2;
        mesh(g, Cy(.064, .052, .46, 12), O.shorts ? skin : pants, s * .1, .25, .42);
        mesh(g, B(.11, .07, .25), shoes, s * .1, .035, .47);
      } else {
        const hipG = grp(g, s * .1, .9, 0); g.userData.legs.push(hipG);
        if (O.shorts) { mesh(hipG, Cy(.078, .07, .4, 12), pants, 0, -.2, 0); mesh(hipG, Cy(.06, .05, .46, 12), skin, 0, -.62, 0); }
        else mesh(hipG, Cy(.075, .056, .84, 12), pants, 0, -.42, 0);
        mesh(hipG, B(.11, .07, .25), shoes, 0, -.865, .05);
        if (O.top === 'tee' && O.shorts) mesh(hipG, B(.112, .02, .2), std(0xf4f4f2, { roughness: .5 }), 0, -.835, .05); // running-shoe sole
      }
    });
    mesh(g, Cy(.19, .18, .16, 18), pants, 0, hip + .04, 0).scale.z = .72;
    mesh(g, Cy(.188, .188, .035, 18), std(0x1d1a17, { roughness: .4 }), 0, hip + .13, 0).scale.z = .72;
    const tY = hip + .42;
    mesh(g, Cy(.215, .18, .52, 20), top, 0, tY, 0).scale.z = .66;
    mesh(g, Sp(.22, 20, 12), top, 0, tY + .23, 0).scale.set(1, .42, .68);
    if (O.top === 'blazer') {
      mesh(g, B(.11, .3, .01), shirt, 0, tY + .1, .142);
      mesh(g, B(.036, .27, .008), std(0x7a1f2b, { roughness: .5 }), 0, tY + .08, .149);
      [-1, 1].forEach(s => { const lp = mesh(g, B(.05, .26, .01), coat, s * .07, tY + .1, .147); lp.rotation.z = -s * .28; });
      [0, -1].forEach(k => mesh(g, Sp(.012, 8, 6), std(0x111111), .045, tY - .08 + k * .1, .146));
    } else if (O.top === 'hoodie') {
      const hood = mesh(g, new THREE.TorusGeometry(.12, .05, 8, 18), shirt, 0, tY + .28, -.07); hood.rotation.x = Math.PI / 2.4;
      [-1, 1].forEach(s => mesh(g, Cy(.006, .006, .18, 6), std(0xeeeeee), s * .05, tY + .12, .14));
      mesh(g, B(.24, .1, .02), std(new THREE.Color(shirt.color).multiplyScalar(.85).getHex()), 0, tY - .1, .14);
    } else if (O.top === 'tee') {
      const nk = mesh(g, new THREE.TorusGeometry(.07, .012, 6, 18), std(new THREE.Color(shirt.color).multiplyScalar(.82).getHex(), { roughness: .85 }), 0, tY + .27, .02); nk.rotation.x = Math.PI / 2;
    } else if (O.top === 'jacket') {
      mesh(g, B(.008, .42, .008), std(0x2a2b2d, { roughness: .4, metalness: .5 }), 0, tY + .02, .148); // zip
      const cl = mesh(g, new THREE.TorusGeometry(.085, .025, 8, 18), coat, 0, tY + .28, 0); cl.rotation.x = Math.PI / 2;
      [-1, 1].forEach(s => mesh(g, B(.03, .03, .01), std(0xf4f4f2, { roughness: .3 }), s * .1, tY + .15, .145)); // reflective tabs
    } else {
      [-1, 1].forEach(s => { const c = mesh(g, B(.09, .035, .07), shirt, s * .055, tY + .29, .075); c.rotation.z = s * .45; c.rotation.x = .3; });
      for (let k = 0; k < (O.top === 'polo' ? 2 : 4); k++) mesh(g, Sp(.008, 6, 4), std(0xeeeeee), 0, tY + .2 - k * .09, .145);
    }
    if (!O.civilian) {
      [-1, 1].forEach(s => { const ly = mesh(g, B(.012, .24, .004), badgeM, s * .045, tY + .14, .146); ly.rotation.z = s * .22; });
      mesh(g, B(.075, .1, .006), std(0xffffff, { roughness: .3 }), 0, tY - .01, .15);
      mesh(g, B(.075, .026, .007), badgeM, 0, tY + .025, .151);
    }
    mesh(g, Cy(.055, .062, .1, 12), skin, 0, tY + .31, 0);
    const hy = tY + .48;
    mesh(g, Sp(.125, 28, 20), skin, 0, hy, 0).scale.set(.94, 1.1, 1);
    [-1, 1].forEach(s => mesh(g, Sp(.028, 10, 8), skinD, s * .118, hy, -.005).scale.set(.5, 1, .8));
    [-1, 1].forEach(s => {
      mesh(g, Sp(.019, 12, 10), std(0xfafafa, { roughness: .2 }), s * .044, hy + .014, .103).scale.z = .55;
      mesh(g, Sp(.011, 10, 8), std(0x2b1a12, { roughness: .1 }), s * .044, hy + .014, .113);
      mesh(g, Sp(.004, 6, 4), std(0xffffff, { emissive: 0xffffff, emissiveIntensity: .6 }), s * .044 + .004, hy + .019, .122);
      const brow = mesh(g, B(.046, .01, .012), hairM, s * .045, hy + .052, .11); brow.rotation.z = -s * .1;
    });
    mesh(g, Sp(.02, 10, 8), skinD, 0, hy - .014, .122).scale.set(.75, 1.25, 1);
    const lips = mesh(g, new THREE.TorusGeometry(.024, .006, 6, 18, Math.PI), std(0xa5544c, { roughness: .4 }), 0, hy - .05, .108); lips.rotation.z = Math.PI; lips.scale.y = .7;
    const cap = mesh(g, new THREE.SphereGeometry(.134, 28, 18, 0, Math.PI * 2, 0, Math.PI * .52), hairM, 0, hy + .012, -.006); cap.scale.set(.98, 1.12, 1.05); cap.rotation.x = -.42;
    if (L.style === 'long') { mesh(g, B(.25, .34, .07), hairM, 0, hy - .1, -.085); [-1, 1].forEach(s => mesh(g, B(.04, .22, .08), hairM, s * .118, hy - .05, -.02)); }
    if (L.style === 'bun') mesh(g, Sp(.058, 14, 10), hairM, 0, hy + .12, -.09);
    if (L.style === 'side') { const f = mesh(g, B(.13, .035, .05), hairM, .035, hy + .09, .095); f.rotation.z = -.32; }
    if (L.style === 'buzz') cap.scale.set(.96, 1.06, 1.01);
    if (L.glasses) {
      const gm = std(0x15171a, { roughness: .3 });
      [-1, 1].forEach(s => { mesh(g, new THREE.TorusGeometry(.028, .004, 6, 18), gm, s * .045, hy + .014, .127); const tp = mesh(g, B(.004, .004, .1), gm, s * .075, hy + .02, .08); tp.rotation.y = s * .2; });
      mesh(g, B(.03, .004, .004), gm, 0, hy + .02, .128);
    }
    // headwear: a cap, a sun hat or a cycling helmet over the hair
    if (O.hat) {
      const hm = std(O.hatColor, { roughness: O.hat === 'helmet' ? .25 : .8, metalness: O.hat === 'helmet' ? .1 : 0 });
      if (O.hat === 'cap') { const c = mesh(g, new THREE.SphereGeometry(.14, 20, 10, 0, Math.PI * 2, 0, Math.PI * .5), hm, 0, hy + .03, -.005); c.scale.set(1, .9, 1.05); const br = mesh(g, B(.2, .012, .12), hm, 0, hy + .04, .15); br.rotation.x = .12; }
      if (O.hat === 'sun') { mesh(g, Cy(.27, .27, .012, 28), hm, 0, hy + .07, 0); mesh(g, Cy(.12, .14, .1, 20), hm, 0, hy + .12, 0); mesh(g, Cy(.142, .142, .025, 20), std(0x6b4630, { roughness: .8 }), 0, hy + .085, 0); }
      if (O.hat === 'helmet') { const hl = mesh(g, new THREE.SphereGeometry(.16, 20, 12, 0, Math.PI * 2, 0, Math.PI * .55), hm, 0, hy + .02, -.01); hl.scale.set(1, .95, 1.15); mesh(g, B(.2, .015, .05), std(0x1f1d1c, { roughness: .4 }), 0, hy + .03, .16); }
    }
    // a backpack, or a shoulder bag hanging at the hip
    if (O.backpack) {
      const bp = std(O.backpack, { roughness: .8 });
      mesh(g, B(.3, .38, .14), bp, 0, tY + .05, -.2); mesh(g, B(.26, .14, .05), bp, 0, tY - .06, -.29);
      [-1, 1].forEach(s => mesh(g, B(.035, .42, .02), std(0x1f1d1c, { roughness: .7 }), s * .1, tY + .06, .135));
    }
    if (O.bag) {
      const bg = std(O.bag, { roughness: .55 });
      mesh(g, B(.06, .24, .2), bg, .21, hip + .02, .02);
      const st = mesh(g, B(.02, .62, .01), bg, .04, tY + .05, .14); st.rotation.z = -.62;
    }
    const sleeveShort = O.top === 'polo' || O.top === 'tee';
    g.userData.elbows = [];
    [-1, 1].forEach(s => {
      const sh = grp(g, s * .24, tY + .2, 0);
      mesh(sh, Cy(.058, .05, .3, 12), sleeveShort ? (O.top === 'tee' ? shirt : top) : top, 0, -.15, 0);
      if (O.top === 'blazer') mesh(sh, Cy(.05, .05, .02, 12), shirt, 0, -.29, 0);
      const el = grp(sh, 0, -.3, 0);
      mesh(el, Cy(.049, .041, .27, 12), sleeveShort ? skin : top, 0, -.135, 0);
      mesh(el, Sp(.046, 12, 10), skin, 0, -.29, .005).scale.set(.75, 1.1, .55);
      if (O.phone && s > 0) mesh(el, B(.075, .14, .01), std(0x15171a, { roughness: .2, metalness: .4 }), 0, -.3, .04); // phone in the right hand
      if (pose === 'type') { sh.rotation.x = -.5; el.rotation.x = -1.05; sh.rotation.z = s * .12; }
      else if (sit) { sh.rotation.x = -.25; el.rotation.x = -.95; }
      else { sh.rotation.z = s * .07; el.rotation.x = O.phone && s > 0 ? -1.1 : -.12; g.userData.arms.push(sh); g.userData.elbows.push(el); }
    });
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    // a soft contact shadow under the feet of a standing figure only; on a seated one it floated at seat height over the
    // chair and read as fake (owner, 14 Oct 2026: "เงาอะไรตรงเก้าอี้ครัว ปลอมมาก เอาออกไป"); the real shadow map covers sitting
    if (!sit && pose !== 'type') {
      const blob = new THREE.Mesh(new THREE.CircleGeometry(.36, 24), new THREE.MeshBasicMaterial({ map: TEX.blob, transparent: true, depthWrite: false, opacity: .55 }));
      blob.rotation.x = -Math.PI / 2; blob.position.set(0, .005, 0); blob.renderOrder = 1; g.add(blob);
    }
    mergeOwn(g, { perParent: true, drop: true }); // v58: one mesh per limb and look, so a person costs a few calls, not forty
    return g;
  }
  function hexOf(s) { return parseInt(s.slice(1), 16); }
  // ---------- rigged people (owner, 14 Oct 2026: "ปรับความคมชัด สมจริง ทั้งรูปทรงการเคลื่อนไหว กิริยา ให้เหมือน the sims 4 มากที่สุด") ----------
  // Every person is a holder Group (the object three.figures, npc.f, IX and the bubbles keep) whose child is either the
  // hand-built body above or, once the rig source has loaded, a skinned clone driven by its own AnimationMixer. The
  // holder never changes, so picking, hover tags, bubbles and the wallClash and walk-grid skip lists keep working.
  // Swapping the stand-in for Quaternius later is one entry in CHAR_SOURCES: its file, its bone names (semantic keys
  // follow SMPL, the same names tools/node/retarget.mjs writes) and its clip names. Missing clips fall back to poses
  // built here from the rig's own idle frame, so lie, swim, floor-sit and cook work before real clips exist.
  /* rig inlined as a data URI: the artifact host does not serve .glb (stand-in, see assets/manifest.json) */
  const EMBED_CHAR = { 'quaternius_m': 'assets/chars/quaternius_m.glb', 'quaternius_w': 'assets/chars/quaternius_w.glb', 'xbot': 'assets/chars/xbot.glb' };
  const CHAR_SOURCES = {
    // Quaternius "Ultimate Modular Men/Women" (poly.pizza, see assets/manifest.json characters_quaternius): one armature,
    // three outfits merged per file by tools/node/merge_outfits.mjs, IK feet re-parented to the shins by
    // tools/node/fk_feet.mjs (so the built sit/type poses keep the feet on the legs), tips Foot.X_end / Head_end made joints.
    quaternius_m: {
      file: 'quaternius_m', height: 1.76, recolor: null, yaw: 0, // glTF +Z forward (Blender export); see the yaw note in prepare()
      variants: ['suit', 'casual', 'hoodie'],
      // skin and hair take the page's palettes through lin(), like every std() material (v60: see dressVariant)
      tint: { skin: /^Skin/, hair: /^Hair/, hairK: 1 },
      bones: {
        Pelvis: 'Body', Spine1: 'Abdomen', Spine2: 'Torso', Spine3: 'Chest', Neck: 'Neck', Head: 'Head', HeadTop: 'Head_end',
        L_Hip: 'UpperLeg.L', L_Knee: 'LowerLeg.L', L_Ankle: 'Foot.L', L_Foot: 'Foot.L_end',
        R_Hip: 'UpperLeg.R', R_Knee: 'LowerLeg.R', R_Ankle: 'Foot.R', R_Foot: 'Foot.R_end',
        L_Collar: 'Shoulder.L', L_Shoulder: 'UpperArm.L', L_Elbow: 'LowerArm.L', L_Wrist: 'Wrist.L', L_Hand: 'Middle1.L',
        R_Collar: 'Shoulder.R', R_Shoulder: 'UpperArm.R', R_Elbow: 'LowerArm.R', R_Wrist: 'Wrist.R', R_Hand: 'Middle1.R'
      },
      // no nod, sit or typing clip in the pack: listen falls back to idle, sit / type / drink use the built poses
      clips: { idle: 'CharacterArmature|Idle', walk: 'CharacterArmature|Walk', run: 'CharacterArmature|Run', wave: 'CharacterArmature|Wave', interact: 'CharacterArmature|Interact' }
    },
    quaternius_w: null, // filled below: the women's file has the same joint names, so it shares the men's map and clips
    // stand-in until the Quaternius files arrive: three.js example Xbot (see assets/manifest.json for its URL and licence)
    xbot: {
      file: 'xbot', height: 1.76, recolor: 'regions',
      bones: {
        Pelvis: 'mixamorigHips', Spine1: 'mixamorigSpine', Spine2: 'mixamorigSpine1', Spine3: 'mixamorigSpine2', Neck: 'mixamorigNeck', Head: 'mixamorigHead', HeadTop: 'mixamorigHeadTop_End',
        L_Hip: 'mixamorigLeftUpLeg', L_Knee: 'mixamorigLeftLeg', L_Ankle: 'mixamorigLeftFoot', L_Foot: 'mixamorigLeftToeBase', L_Toe: 'mixamorigLeftToe_End',
        R_Hip: 'mixamorigRightUpLeg', R_Knee: 'mixamorigRightLeg', R_Ankle: 'mixamorigRightFoot', R_Foot: 'mixamorigRightToeBase', R_Toe: 'mixamorigRightToe_End',
        L_Collar: 'mixamorigLeftShoulder', L_Shoulder: 'mixamorigLeftArm', L_Elbow: 'mixamorigLeftForeArm', L_Wrist: 'mixamorigLeftHand', L_Hand: 'mixamorigLeftHandMiddle1',
        R_Collar: 'mixamorigRightShoulder', R_Shoulder: 'mixamorigRightArm', R_Elbow: 'mixamorigRightForeArm', R_Wrist: 'mixamorigRightHand', R_Hand: 'mixamorigRightHandMiddle1'
      },
      clips: { idle: 'idle', walk: 'walk', run: 'run', listen: 'agree', disagree: 'headShake' }
    }
  };
  // Swapping to Quaternius (Universal Base Characters + Universal Animation Library, CC0) when the owner's files arrive:
  //   1. node patch-chars/tools/inspect.mjs <character.glb> lists its bones and clips; merge the wanted UAL clips into the
  //      character file (or load them with the retarget hook below) and shrink it with tools/optimize_char.mjs.
  //   2. add an entry here and set CHAR_USE to it; run apply_chars.py with --glb=<that file>.
  //   The names below are the UE-mannequin style the pack is expected to use; NOT checked against the files yet:
  //   quaternius: { file: 'quaternius', height: 1.76, recolor: null,
  //     bones: { Pelvis: 'pelvis', Spine1: 'spine_01', Spine2: 'spine_02', Spine3: 'spine_03', Neck: 'neck_01', Head: 'Head',
  //       L_Hip: 'thigh_l', L_Knee: 'calf_l', L_Ankle: 'foot_l', L_Foot: 'ball_l', R_Hip: 'thigh_r', R_Knee: 'calf_r', R_Ankle: 'foot_r', R_Foot: 'ball_r',
  //       L_Collar: 'clavicle_l', L_Shoulder: 'upperarm_l', L_Elbow: 'lowerarm_l', L_Wrist: 'hand_l', R_Collar: 'clavicle_r', R_Shoulder: 'upperarm_r', R_Elbow: 'lowerarm_r', R_Wrist: 'hand_r' },
  //     clips: { idle: '<idle loop>', walk: '<walk loop>', run: '<jog loop>', listen: '<nod>', sit: '<sit idle>', sitDown: '<sit down>', standUp: '<stand up>', type: '<typing>', drink: '<drink>' } }
  //   Any clip named in clips replaces the built fallback of the same name; recolor: null keeps the pack's own outfits.
  CHAR_SOURCES.quaternius_w = Object.assign({}, CHAR_SOURCES.quaternius_m, { file: 'quaternius_w', height: 1.66, variants: ['suit', 'formal', 'casual'] });
  // v60, ON by default: Quaternius men and women in the same scene (owner rule: people with faces in work clothes), each
  // person keeps one of the two sources (srcFor). ?rig=off keeps the hand-built people, ?rig=xbot the faceless stand-in,
  // ?rig=m or ?rig=w one source only (for checks); no ?rig, or a bare ?rig, loads both.
  const CHAR_USE = (m => { const v = m ? m[1] || '' : ''; return v === 'off' ? null : v === 'xbot' ? ['xbot'] : v === 'm' ? ['quaternius_m'] : v === 'w' ? ['quaternius_w'] : ['quaternius_m', 'quaternius_w']; })(location.search.match(/[?&]rig(?:=([a-z]+))?(?:&|$)/));
  const CHARS = (() => {
    const S = { ok: false, failed: false, src: null, tpl: null, clips: {}, holders: new Set(), rigs: new Set(), frame: 0, calib: null, extra: {} };
    const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
    const tv = V(), tv2 = V(), tq = Q(), tq2 = Q(), UP = new THREE.Vector3(0, 1, 0);
    const san = n => THREE.PropertyBinding.sanitizeNodeName(n);
    const has = o => o && o.userData && o.userData.rig;
    // ----- use spec: another module may define useSpecFor(obj, act) -> { seatY, back, facing, recline, hands }; defaults otherwise
    function specFor(obj, act) {
      try { if (typeof useSpecFor === 'function') { const s = useSpecFor(obj, act); if (s) return s; } } catch (e) { /* the table is optional */ }
      return null;
    }
    // ----- bone helpers, all in character space (the template stands at the origin facing +Z, left = +X)
    function boneMap(root, src) {
      const by = new Map(); root.traverse(o => { if (o.isBone) by.set(o.name, o); });
      const m = {}; Object.entries(src.bones).forEach(([k, n]) => { m[k] = by.get(n) || by.get(san(n)) || null; });
      return m;
    }
    function aim(b, c, dir) {
      if (!b || !c) return; b.updateWorldMatrix(true, true);
      const p = b.getWorldPosition(tv), cur = c.getWorldPosition(tv2).sub(p).normalize();
      tq.setFromUnitVectors(cur, tv.copy(dir).normalize()).multiply(b.getWorldQuaternion(tq2));
      b.parent.getWorldQuaternion(tq2).invert(); b.quaternion.copy(tq2.multiply(tq)); b.updateWorldMatrix(false, true);
    }
    function turn(b, axis, ang) {
      if (!b || !ang) return; b.updateWorldMatrix(true, false);
      const pq = b.parent.getWorldQuaternion(Q()), r = Q().setFromAxisAngle(axis, ang);
      b.quaternion.premultiply(pq.clone().invert().multiply(r).multiply(pq)); b.updateWorldMatrix(false, true);
    }
    const X = new THREE.Vector3(1, 0, 0), Y = UP, d3 = (x, y, z) => new THREE.Vector3(x, y, z);
    // ----- outfit colours painted by body region in the shader (the stand-in has one plain surface)
    const MATS = new Map();
    // aRegion per vertex (baked once on the shared geometry): 0 top, 1 pants, 2 shoes, 3 skin, 4 hair, 5 forearm, 6 shin,
    // 7 shirt front (under a jacket), 8 collar. The code travels as one-hot weights and the fragment keeps the strongest,
    // so a border falls cleanly between two regions: interpolating the raw code (the first version) painted thin false
    // bands, e.g. trousers and shoes colours along every top-to-skin border. Fabric is shaded rougher than skin.
    function regionMat(base, out, dark) {
      const key = base.uuid + JSON.stringify(out) + (dark || 1); if (MATS.has(key)) return MATS.get(key);
      const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .8, metalness: 0, name: 'ao-person' });
      const cols = [out.top, out.pants, out.shoes, out.skin, out.hair, out.short ? out.skin : out.top, out.shorts ? out.skin : out.pants, out.front, out.collar].map(h => lin(h));
      const rough = [.9, .85, .45, .55, .7, out.short ? .55 : .9, out.shorts ? .55 : .85, .8, .85];
      const U = { uCol: { value: cols }, uRough: { value: rough }, uDark: { value: dark || 1 } };
      m.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = 'attribute float aRegion; varying vec3 vR0, vR1, vR2;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          float rc = floor(aRegion + .5);
          vR0 = vec3(step(abs(rc), .5), step(abs(rc - 1.), .5), step(abs(rc - 2.), .5));
          vR1 = vec3(step(abs(rc - 3.), .5), step(abs(rc - 4.), .5), step(abs(rc - 5.), .5));
          vR2 = vec3(step(abs(rc - 6.), .5), step(abs(rc - 7.), .5), step(abs(rc - 8.), .5));`);
        sh.fragmentShader = 'varying vec3 vR0, vR1, vR2; uniform vec3 uCol[9]; uniform float uRough[9]; uniform float uDark; int aoReg;\n' + sh.fragmentShader
          .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
          float aoW[9]; aoW[0] = vR0.x; aoW[1] = vR0.y; aoW[2] = vR0.z; aoW[3] = vR1.x; aoW[4] = vR1.y; aoW[5] = vR1.z; aoW[6] = vR2.x; aoW[7] = vR2.y; aoW[8] = vR2.z;
          aoReg = 0; float aoB = aoW[0]; for (int i = 1; i < 9; i++) if (aoW[i] > aoB) { aoB = aoW[i]; aoReg = i; }
          vec4 diffuseColor = vec4(uCol[aoReg] * diffuse * uDark, opacity);`)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n          roughnessFactor = uRough[aoReg];');
      };
      m.customProgramCacheKey = () => 'aoRegion2';
      MATS.set(key, m); return m;
    }
    // ----- load the source, measure it, build the clips once on a template
    function boot() {
      if (!CHAR_USE) { S.off = true; if (/[?&]test/.test(location.search)) window.__aoChars = { stats }; return; } // rig off: nothing loads, every figure stays hand-built
      if (!THREE || !GLTFLoader || !SkeletonUtils) { S.failed = true; return; }
      // every source is loaded and measured on its own template (D); S keeps the first one's for stats and retarget
      S.src = CHAR_SOURCES[CHAR_USE[0]]; S.D = {};
      const l = new GLTFLoader(loadMgr()); if (MeshoptDecoder) l.setMeshoptDecoder(MeshoptDecoder);
      Promise.allSettled(CHAR_USE.map(key => { const src = CHAR_SOURCES[key];
        return l.loadAsync((typeof EMBED_CHAR !== 'undefined' && EMBED_CHAR[src.file]) || ('assets/chars/' + src.file + '.glb')).then(gl => {
          const D = { key, src, clips: {} }; prepare(gl, D); S.D[key] = D; return D; }); })).then(rs => {
        const got = rs.filter(r => r.status === 'fulfilled').map(r => r.value);
        rs.forEach((r, i) => { if (r.status === 'rejected') console.warn('rigged source ' + CHAR_USE[i] + ' did not load', r.reason); });
        if (!got.length) { S.failed = true; console.warn('rigged people did not load; the hand-built people stay'); return; }
        const P = S.D[CHAR_USE.find(k => S.D[k])];
        ['src', 'tpl', 'clips', 'calib', 'mixer', 'hipsName', 'ankleH', 'ballH', 'legY', 'pose', 'stride', 'strideLat', 'strideFloor', 'strideSamples', 'regions'].forEach(k => { S[k] = P[k]; });
        S.ok = true;
        S.holders.forEach(h => { if (isLive(h)) upgrade(h); else S.holders.delete(h); });
        hyLoad(); // v61: HY-Motion clips, from their own file
        if (/[?&]test/.test(location.search) && window.__aoChars) Object.assign(window.__aoChars, { hy: () => S.hy, hyDemo, hyDemoEnd, hyDemoNow: () => { const r = S.demoRig; return r && r.cur ? { clip: r.cur.getClip().name, t: +r.cur.time.toFixed(2), state: r.state, speed: r.speed, walking: !!r.h.userData.walk } : null; } });
      });
    }
    function prepare(gl, D) {
      const src = D.src, scene0 = gl.scene;
      const clips = {}; gl.animations.forEach(c => { clips[c.name] = c; });
      // template: body (seat offset) > fit (scale, yaw to +Z, feet on the floor) > the clone
      const tpl = makeRig(scene0, D, true);
      const B = tpl.B, mixer = new THREE.AnimationMixer(tpl.root);
      const idle = clips[src.clips.idle]; if (idle) { mixer.clipAction(idle).play(); mixer.update(0); }
      tpl.body.updateMatrixWorld(true);
      // facing: from the ankle to the toe; turn the fit node so the character faces +Z like every prop here
      const fa = B.L_Foot.getWorldPosition(V()).sub(B.L_Ankle.getWorldPosition(V())).add(B.R_Foot.getWorldPosition(V()).sub(B.R_Ankle.getWorldPosition(V())));
      // a source may state its facing: the Quaternius rest and idle poses splay one foot ~59 deg, so the foot-based
      // estimate turned every person ~32 deg off their path (measured from the head mesh, 15 Oct 2026)
      const yaw = typeof src.yaw === 'number' ? src.yaw : -Math.atan2(fa.x, fa.z); tpl.fit.rotation.y = yaw; tpl.body.updateMatrixWorld(true);
      // scale to the source height and stand the soles on y = 0
      const box = new THREE.Box3(); tpl.skinned.forEach(sm => { sm.computeBoundingBox(); box.union(sm.boundingBox.clone().applyMatrix4(sm.matrixWorld)); });
      const k = src.height / (box.max.y - box.min.y); tpl.fit.scale.setScalar(k); tpl.body.updateMatrixWorld(true);
      box.makeEmpty(); tpl.skinned.forEach(sm => { sm.computeBoundingBox(); box.union(sm.boundingBox.clone().applyMatrix4(sm.matrixWorld)); });
      tpl.fit.position.y = -box.min.y; tpl.body.updateMatrixWorld(true);
      D.calib = { yaw, k, y: tpl.fit.position.y };
      // root motion off: keep the hips' height and drop their travel, so positions come from the sim
      const hipsName = B.Pelvis.name;
      const upL = UP.clone().applyQuaternion(B.Pelvis.parent.getWorldQuaternion(Q()).invert()).normalize();
      // root motion off: only the net horizontal drift over the cycle is removed (its linear trend); the sway and surge
      // inside the cycle stay, since they are what keeps the planted foot still (removing all horizontal motion left a
      // 0.1 m/s sideways slide on the stand-in's walk)
      const inPlace = c => { if (!c) return c; c = c.clone(); c.tracks.forEach(t => { if (t.name !== hipsName + '.position') return;
        const v = t.values, tm = t.times, T = tm[tm.length - 1] - tm[0] || 1, p0 = V().fromArray(v, 0), drift = V().fromArray(v, v.length - 3).sub(p0), d = V();
        drift.sub(upL.clone().multiplyScalar(drift.dot(upL))); // keep any vertical change
        for (let i = 0, k = 0; i < v.length; i += 3, k++) { d.fromArray(v, i).sub(drift.clone().multiplyScalar((tm[k] - tm[0]) / T)); d.toArray(v, i); } }); return c; };
      Object.entries(src.clips).forEach(([k2, n]) => { if (clips[n]) D.clips[k2] = inPlace(clips[n]); });
      D.tpl = tpl; D.mixer = mixer; D.hipsName = hipsName;
      D.ankleH = (B.L_Ankle.getWorldPosition(V()).y + B.R_Ankle.getWorldPosition(V()).y) / 2;
      D.ballH = B.L_Foot ? (B.L_Foot.getWorldPosition(V()).y + B.R_Foot.getWorldPosition(V()).y) / 2 : D.ankleH;
      buildFallbacks(tpl, mixer, D);
      // stride speed of the walk and run clips in m/s, measured from the planted foot, so playback rate follows the path speed
      D.stride = {};
      ['walk', 'run'].forEach(n => { if (D.clips[n]) D.stride[n] = strideSpeed(tpl, D.clips[n], D); });
      mixer.stopAllAction();
      // regions for the outfit shader, in the skinned mesh's bind space
      if (src.recolor === 'regions') { D.regions = true; tpl.skinned.forEach(sm => bakeRegions(sm, tpl.B)); }
      if (/[?&]test/.test(location.search)) window.__aoChars = { stats, probe, retarget, addClip: (n, c) => { D.clips[n] = c; },
        fullRate: on => { S.fullRate = !!on; },
        // which region each bone's vertices received, and each person's outfit colours, for checking the clothing
        regionsByBone: () => D.tpl.skinned.map(sm => { const a = sm.geometry.attributes.aRegion, si = sm.geometry.attributes.skinIndex, sw = sm.geometry.attributes.skinWeight, out = {};
          if (!a) return null; for (let i = 0; i < a.count; i++) { let best = 0, bw = -1; for (let c = 0; c < 4; c++) { const w = sw.getComponent(i, c); if (w > bw) { bw = w; best = si.getComponent(i, c); } }
            const k = sm.skeleton.bones[best].name.replace('mixamorig', '') + ':' + a.getX(i); out[k] = (out[k] || 0) + 1; } return { mesh: sm.name, out }; }),
        outfits: () => [...S.rigs].filter(r => r.h.userData.pid !== undefined).map(r => { const c = r.h.userData.char, o = outfitOf(c.role, c.idx); return { pid: r.h.userData.pid, role: c.role, top: '#' + o.top.toString(16).padStart(6, '0'), skin: '#' + o.skin.toString(16).padStart(6, '0'), state: r.state }; }), rigs: () => [...S.rigs].map(r => ({ pid: r.h.userData.pid, npc: r.h.userData.pid === undefined, src: r.D.key, variant: r.r.variant, role: r.h.userData.char.role, idx: r.h.userData.char.idx, state: r.state, cur: r.curName, t: +r.t.toFixed(2), queue: r.queue && r.queue.name, busy: +Math.max(0, r.busyUntil - r.t).toFixed(2),
          walking: !!r.h.userData.walk, wait: r.h.userData.walk ? +(r.h.userData.walk.wait || 0).toFixed(2) : null,
          actions: r.mixer._actions.filter(a => a.isRunning() || a.getEffectiveWeight() > .01).map(a => a.getClip().name + ':' + a.getEffectiveWeight().toFixed(2) + '@' + a.time.toFixed(2) + 'x' + a.getEffectiveTimeScale().toFixed(2)) })) };
    }
    function makeRig(source, D, isTpl) {
      const root = SkeletonUtils.clone(source), body = new THREE.Group(), fit = new THREE.Group();
      fit.add(root); body.add(fit); const skinned = [];
      root.traverse(o => { if (o.isSkinnedMesh) { skinned.push(o); o.castShadow = true; o.receiveShadow = false; o.frustumCulled = true; o.raycast = () => {}; } });
      if (!isTpl) { fit.rotation.y = D.calib.yaw; fit.scale.setScalar(D.calib.k); fit.position.y = D.calib.y; }
      return { root, body, fit, skinned, B: boneMap(root, D.src) };
    }
    // Each vertex wears the region of the bone that weighs on it most (bones outside the map take their nearest mapped
    // ancestor's). Nothing is measured through matrices, so a quantized or rescaled file cannot shift it into another
    // space (the first, height-threshold version did, and painted every vertex as pants). Hair is the part of the head
    // above its middle and toward the back, measured inside the head's own vertices.
    const REGION_OF = { L_Ankle: 2, L_Foot: 2, L_Toe: 2, R_Ankle: 2, R_Foot: 2, R_Toe: 2, L_Hip: 1, R_Hip: 1, Pelvis: 1, L_Knee: 6, R_Knee: 6,
      Spine1: 0, Spine2: 0, Spine3: 0, L_Collar: 0, R_Collar: 0, L_Shoulder: 0, R_Shoulder: 0, L_Elbow: 5, R_Elbow: 5, L_Wrist: 3, R_Wrist: 3, L_Hand: 3, R_Hand: 3, Neck: 3, Head: 3, HeadTop: 3 };
    function bakeRegions(sm, B) {
      const g = sm.geometry, pa = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = sm.skeleton.bones;
      if (!si || !sw) return null;
      if (g.attributes.aRegion) return g.attributes.aRegion;
      const sem = new Map(Object.entries(B).filter(([, b]) => b).map(([k, b]) => [b, k]));
      const regionOfBone = b => { for (let a = b; a; a = a.parent) { const k = sem.get(a); if (k !== undefined && REGION_OF[k] !== undefined) return REGION_OF[k]; } return 0; };
      const isHead = b => { for (let a = b; a; a = a.parent) { const k = sem.get(a); if (k === 'Head' || k === 'HeadTop') return true; if (k) return false; } return false; };
      const semOfB = b => { for (let a = b; a; a = a.parent) { const k = sem.get(a); if (k) return k; } return null; };
      const code = new Float32Array(pa.count), ks = new Array(pa.count), head = [], neck = [], p = V();
      for (let i = 0; i < pa.count; i++) {
        let best = 0, bw = -1; for (let c = 0; c < 4; c++) { const w = sw.getComponent(i, c); if (w > bw) { bw = w; best = si.getComponent(i, c); } }
        const b = bones[best]; code[i] = regionOfBone(b); ks[i] = semOfB(b);
        if (isHead(b)) head.push(i); else if (sem.get(b) === 'Neck') neck.push(i);
      }
      const mean = idx => { const m = V(); idx.forEach(i => m.add(p.fromBufferAttribute(pa, i))); return m.divideScalar(idx.length); };
      const group = (...n) => { const out = []; for (let i = 0; i < pa.count; i++) if (n.includes(ks[i])) out[out.length] = i; return out; };
      // forward: the toes lie ahead of the ankles in any mesh that has feet
      const ftI = group('L_Foot', 'R_Foot', 'L_Toe', 'R_Toe'), anI = group('L_Ankle', 'R_Ankle'), fwd0 = ftI.length && anI.length ? mean(ftI).sub(mean(anI)) : null;
      if (head.length > 20) {
        const hc = mean(head), up = (neck.length ? hc.clone().sub(mean(neck)) : UP.clone()).normalize();
        let hMax = -Infinity, fMin = Infinity, fMax = -Infinity; const fwd = fwd0 ? fwd0.clone() : V();
        fwd.sub(up.clone().multiplyScalar(fwd.dot(up))); const hasF = fwd.lengthSq() > 1e-8; if (hasF) fwd.normalize();
        head.forEach(i => { p.fromBufferAttribute(pa, i).sub(hc); hMax = Math.max(hMax, p.dot(up)); if (hasF) { const f = p.dot(fwd); fMin = Math.min(fMin, f); fMax = Math.max(fMax, f); } });
        head.forEach(i => { p.fromBufferAttribute(pa, i).sub(hc); const h = p.dot(up) / hMax, f = hasF ? (p.dot(fwd) - fMin) / (fMax - fMin) : 1;
          if (h > .42 || (h > -.15 && f < .38)) code[i] = 4; });
      }
      // garment cues, measured inside the upper torso's own vertices: the top rim is the collar (8), and the front
      // centre opens into a V (7) that shows the shirt under a jacket; a plain colour alone read as bare skin whenever a
      // top shares the skin's hue (the PO's brown blazer: hue 60 vs 62, dE 37)
      const chest = group('Spine2', 'Spine3'), pel = group('Pelvis'), upper = head.length ? head : neck;
      if (chest.length > 12 && pel.length && upper.length && fwd0) {
        const cc = mean(chest), up2 = mean(upper).sub(mean(pel)).normalize(), side = V().crossVectors(up2, fwd0).normalize(), fw = V().crossVectors(side, up2).normalize();
        let sMax = 0, hMin = Infinity, hMx = -Infinity, fMn = Infinity, fMx = -Infinity;
        chest.forEach(i => { p.fromBufferAttribute(pa, i).sub(cc); sMax = Math.max(sMax, Math.abs(p.dot(side))); const h = p.dot(up2), f = p.dot(fw); hMin = Math.min(hMin, h); hMx = Math.max(hMx, h); fMn = Math.min(fMn, f); fMx = Math.max(fMx, f); });
        chest.forEach(i => { p.fromBufferAttribute(pa, i).sub(cc); const hn = (p.dot(up2) - hMin) / (hMx - hMin), fn = (p.dot(fw) - fMn) / (fMx - fMn), sn = Math.abs(p.dot(side)) / sMax;
          if (hn > .88 && sn < .55) code[i] = 8; else if (fn > .55 && hn > .25 && sn < .5 * hn) code[i] = 7; });
      }
      neck.forEach(i => { code[i] = 8; }); // a joint ring at the neck reads as the collar
      const attr = new THREE.BufferAttribute(code, 1); g.setAttribute('aRegion', attr); return attr;
    }
    // ----- fallback poses, built from the idle frame by aiming limbs in character space
    function buildFallbacks(tpl, mixer, D) {
      const B = tpl.B, bones = []; tpl.root.traverse(o => { if (o.isBone) bones.push(o); });
      tpl.body.updateMatrixWorld(true);
      const base = new Map(bones.map(b => [b, b.quaternion.clone()])), hipsP = B.Pelvis.position.clone();
      const reset = () => { base.forEach((q, b) => b.quaternion.copy(q)); B.Pelvis.position.copy(hipsP); tpl.body.updateMatrixWorld(true); };
      const legY = B.L_Hip.getWorldPosition(V()).y, hipsW = B.Pelvis.getWorldPosition(V()), hipOff = hipsW.y - legY;
      D.legY = legY;
      const setHip = (upLegY, dz = 0) => { const t = V().set(hipsW.x, upLegY + hipOff, hipsW.z + dz); B.Pelvis.parent.updateWorldMatrix(true, false); B.Pelvis.position.copy(B.Pelvis.parent.worldToLocal(t)); tpl.body.updateMatrixWorld(true); };
      const side = s => (s > 0 ? 'L_' : 'R_');
      const legs = (thigh, shin, foot) => [1, -1].forEach(s => { const p = side(s); aim(B[p + 'Hip'], B[p + 'Knee'], thigh(s)); aim(B[p + 'Knee'], B[p + 'Ankle'], shin(s)); if (foot) aim(B[p + 'Ankle'], B[p + 'Foot'], foot(s)); });
      const arm = (s, upper, fore, hand) => { const p = side(s); aim(B[p + 'Shoulder'], B[p + 'Elbow'], upper); aim(B[p + 'Elbow'], B[p + 'Wrist'], fore); if (hand && B[p + 'Hand']) aim(B[p + 'Wrist'], B[p + 'Hand'], hand); };
      const P = {
        sit: (o = {}) => { setHip(o.legY || .5, -.02); legs(s => d3(s * .1, -.03, 1), s => d3(0, -1, .1), s => d3(0, -.45, .9)); turn(B.Spine1, X, o.recline ? -o.recline : -.04); if (o.recline) turn(B.Neck, X, o.recline * .45); [1, -1].forEach(s => arm(s, d3(s * .2, -.85, .35), d3(-s * .1, -.3, .95))); },
        sitLow: () => { setHip(.3, -.02); legs(s => d3(s * .12, .3, 1), s => d3(0, -.62, .8), s => d3(0, -.2, 1)); turn(B.Spine1, X, -.12); [1, -1].forEach(s => arm(s, d3(s * .25, -.8, .3), d3(-s * .05, -.2, .97))); },
        floor: () => { setHip(.17, -.05); legs(s => d3(s * .55, .1, .83), s => d3(-s * .78, -.22, .58), s => d3(-s * .5, -.2, .8)); [1, -1].forEach(s => arm(s, d3(s * .3, -.8, .45), d3(s * .12, -.55, .82))); },
        type: (o = {}) => { P.sit(o); [1, -1].forEach(s => arm(s, d3(s * .22, -.72, .62), d3(-s * .2, -.06, .98), d3(-s * .1, -.25, 1))); turn(B.Neck, X, .14); },
        ride: () => { P.sit(); turn(B.Spine1, X, .32); [1, -1].forEach(s => arm(s, d3(s * .3, -.45, .85), d3(s * .05, -.25, .97))); },
        crouch: () => { setHip(.68, .04); legs(s => d3(s * .1, -.55, .85), s => d3(0, -1, -.25), s => d3(0, -.35, .95)); turn(B.Spine1, X, .5); [1, -1].forEach(s => arm(s, d3(s * .25, -.8, .45), d3(s * .05, -.6, .8))); },
        cook: (k = 0) => { [1, -1].forEach(s => arm(s, d3(s * .2, -.86, .45), s < 0 ? d3(-.12 + Math.cos(k) * .1, -.18, .98 + Math.sin(k) * .1) : d3(-s * .1, -.15, .98))); turn(B.Neck, X, .3); },
        drink: (u = 0) => { arm(-1, d3(-.12 - .05 * (1 - u), -.55 - .4 * (1 - u), .8 * u + .2), d3(.35 * u, .88 * u - .5 * (1 - u), .35 + .4 * (1 - u))); turn(B.Neck, X, -.18 * u); },
        talk: (k = 0) => { const a = Math.sin(k), b = Math.cos(k * 1.3); arm(-1, d3(-.4 - .1 * a, -.72, .5), d3(-.3 + .2 * a, .25 + .15 * b, .9)); arm(1, d3(.32, -.82 + .06 * b, .4), d3(.15, .1 + .1 * a, .97)); turn(B.Neck, X, .06 * b); turn(B.Neck, Y, .12 * a); },
        swim: (k = 0) => { const c = Math.cos(k), s2 = Math.sin(k); [1, -1].forEach(s => arm(s, d3(s * (.55 + .4 * c), -.15 - .25 * s2, .75 - .3 * c), d3(s * (.2 + .5 * c), -.05, .9))); legs(s => d3(s * .12, -1, .15 + .2 * Math.sin(k + s)), s => d3(0, -1, -.2 - .15 * Math.cos(k + s))); }
      };
      D.pose = P;
      const tracksOf = (keys, dur) => {
        const times = keys.map(k => k.t), qs = new Map(bones.map(b => [b, []])), hp = [];
        keys.forEach(k => { reset(); k.f(); bones.forEach(b => qs.get(b).push(...b.quaternion.toArray())); hp.push(...B.Pelvis.position.toArray()); });
        reset();
        const tr = [new THREE.VectorKeyframeTrack(B.Pelvis.name + '.position', times, hp)];
        bones.forEach(b => tr.push(new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', times, qs.get(b))));
        return new THREE.AnimationClip('', dur, tr);
      };
      const make = (name, keys, dur) => { if (D.clips[name]) return; const c = tracksOf(keys, dur); c.name = name; D.clips[name] = c; };
      const loop = (name, n, dur, f) => make(name, Array.from({ length: n + 1 }, (_, i) => ({ t: dur * i / n, f: () => f(i / n * Math.PI * 2) })), dur);
      const still = (name, f) => make(name, [{ t: 0, f: () => { f(); turn(B.Spine2, X, 0); } }, { t: 1.6, f: () => { f(); turn(B.Spine2, X, .025); } }, { t: 3.2, f: () => { f(); turn(B.Spine2, X, 0); } }], 3.2);
      still('sit', () => P.sit()); still('sitLow', () => P.sitLow()); still('floor', () => P.floor()); still('ride', () => P.ride());
      still('lie', () => P.sit({ recline: .75 }));
      loop('type', 8, .64, k => { P.type(); [1, -1].forEach(s => turn(B[side(s) + 'Wrist'], X, .09 * Math.sin(k + (s > 0 ? 0 : 1.7)))); });
      loop('cook', 8, 1.4, k => P.cook(k));
      loop('talk', 8, 2.6, k => P.talk(k));
      loop('swim', 8, 1.8, k => P.swim(k));
      make('drink', [0, .9, 1.5, 2.3, 4].map((t, i) => ({ t, f: () => P.drink([0, 1, 1, 0, 0][i]) })), 4);
      make('sitDown', [{ t: 0, f: () => {} }, { t: .42, f: () => P.crouch() }, { t: .85, f: () => P.sit() }], .85);
      make('standUp', [{ t: 0, f: () => P.sit() }, { t: .45, f: () => P.crouch() }, { t: .9, f: () => {} }], .9);
      if (!D.clips.listen) D.clips.listen = D.clips.idle;
    }
    // stride speed: how fast the planted contact point (heel or ball, the same rule as the test probe) moves back
    // under the body in the in-place clip; playing the clip at path speed / this rate keeps that point still
    function strideSpeed(tpl, clip, D) {
      const m = new THREE.AnimationMixer(tpl.root), a = m.clipAction(clip).play(), B = tpl.B, n = 240, dt = clip.duration / n;
      const names = ['L_Ankle', 'L_Foot', 'R_Ankle', 'R_Foot'], rest = [D.ankleH, D.ballH, D.ankleH, D.ballH], fr = [];
      for (let i = 0; i <= n; i++) { m.setTime(i * dt); tpl.body.updateMatrixWorld(true); fr[i] = names.map(k => B[k] ? B[k].getWorldPosition(V()) : null); }
      const contact = (i, j) => { let best = -1, ex = Infinity; [j, j + 1].forEach(k => { const q = fr[i][k]; if (!q) return; const e2 = q.y - rest[k]; if (e2 < .015 && e2 < ex) { ex = e2; best = k; } }); return best; };
      const v = [];
      const lat = [];
      for (let i = 1; i <= n; i++) [0, 2].forEach(j => { const k = contact(i, j); if (k >= 0 && contact(i - 1, j) === k) { v[v.length] = -(fr[i][k].z - fr[i - 1][k].z) / dt; lat[lat.length] = Math.abs(fr[i][k].x - fr[i - 1][k].x) / dt; } });
      lat.sort((x, y) => x - y); D.strideLat = D.strideLat || {}; D.strideLat[clip.name] = lat.length ? +lat[Math.floor(lat.length / 2)].toFixed(3) : null;
      // the clip's own floor: how far the planted point still moves at a perfectly matched rate (median over contact frames)
      { const sv = v.slice().sort((x, y) => x - y), v0 = sv.length ? sv[Math.floor(sv.length / 2)] : 0, res = [];
        for (let i = 1; i <= n; i++) [0, 2].forEach(j => { const k = contact(i, j); if (k >= 0 && contact(i - 1, j) === k) res[res.length] = Math.hypot(-(fr[i][k].z - fr[i - 1][k].z) / dt - v0, (fr[i][k].x - fr[i - 1][k].x) / dt); });
        res.sort((x, y) => x - y); D.strideFloor = D.strideFloor || {}; D.strideFloor[clip.name] = res.length ? +res[Math.floor(res.length / 2)].toFixed(3) : null; }
      a.stop(); m.uncacheRoot(tpl.root); v.sort((x, y) => x - y);
      D.strideSamples = D.strideSamples || {}; D.strideSamples[clip.name] = v.length;
      return v.length ? Math.max(.2, v[Math.floor(v.length / 2)]) : 1.3;
    }
    // ----- per person
    function makeHolder(role, idx, pose, proc) {
      const h = new THREE.Group(); h.add(proc);
      ['legs', 'arms', 'elbows'].forEach(k => { h.userData[k] = proc.userData[k] || []; });
      h.userData.char = { role, idx, pose, proc };
      S.holders.add(h);
      if (S.ok) upgrade(h);
      return h;
    }
    function outfitOf(role, idx) {
      const O = OUTFIT[role] || OUTFIT.npc;
      const shirt = O.shirts ? O.shirts[idx % O.shirts.length] : O.shirt, top = O.coat || shirt, k = (h, f) => new THREE.Color(h).multiplyScalar(f).getHex();
      // a jacket (blazer, rider's jacket) opens over its shirt; every other top keeps its own colour at the front, with a
      // collar or neckline a shade darker (a ribbed tee neck darker still), the cue the hand-built figures draw too
      const jacket = O.top === 'blazer' || O.top === 'jacket';
      return { top, pants: O.pants, shoes: O.shoes, skin: SKINS[(idx * 7 + 3) % SKINS.length], hair: O.hat ? O.hatColor : HAIRS[(idx * 3 + 1) % HAIRS.length], short: O.top === 'polo' || O.top === 'tee', shorts: !!O.shorts,
        front: jacket ? shirt : top, collar: jacket ? shirt : k(top, O.top === 'tee' ? .78 : .86) };
    }
    // men and women in one scene: each person keeps one source, from a hash of role and index (about half and half in
    // every role and among the street people); a source that failed to load hands its people to the other
    function srcFor(c) {
      const keys = CHAR_USE.filter(k => S.D[k]); if (keys.length < 2) return S.D[keys[0]];
      let x = 2166136261; const s = (c.role || '') + '#' + c.idx; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
      return S.D[keys[((x >>> 0) >>> 7) % keys.length]];
    }
    // skin tones for the rigged people, light to deep brown (sRGB). Every colour goes through lin(), as std() does: the page
    // runs with ColorManagement off, and the first version set the sRGB hex straight into the linear colour, which rendered
    // the skin near white (and needed a 0.35 factor on the hair to hide the same fault). The light end stops at c99772:
    // measured at the brightest desks in the afternoon, f0c8a8 rendered efe3d5 (lightness .89), e4b998 ddd0c3 (.82) and
    // d4a582 ebd9c4 (.85), pale beige rather than skin even through lin()
    const RIG_SKINS = [0xc99772, 0xbd8a66, 0xb07d5a, 0xa1704f, 0x906142, 0x7a4c33, 0x643b26, 0xb88663];
    const TINTS = new Map();
    // one outfit per person (the others are removed from the clone), skin and hair tinted from the palettes
    function dressVariant(r, c, D) {
      const v = D.src.variants, pick = v[(c.idx + (c.role || '').length) % v.length], t = D.src.tint || {};
      const skin = RIG_SKINS[(c.idx * 5 + (c.role || '').length * 3 + 2) % RIG_SKINS.length], hair = HAIRS[(c.idx * 3 + 1) % HAIRS.length];
      const tint = (m, hex, f) => { const k = m.uuid + ':' + hex + ':' + f; if (!TINTS.has(k)) { const n = m.clone(); n.color.copy(lin(hex)).multiplyScalar(f); TINTS.set(k, n); } return TINTS.get(k); };
      const swap = m => t.skin && t.skin.test(m.name) ? tint(m, skin, /Dark/i.test(m.name) ? .82 : 1) : t.hair && t.hair.test(m.name) ? tint(m, hair, t.hairK || 1) : m;
      for (let i = r.skinned.length - 1; i >= 0; i--) { const sm = r.skinned[i];
        if (!sm.name.startsWith(pick + '_')) { sm.parent.remove(sm); r.skinned.splice(i, 1); continue; }
        sm.material = Array.isArray(sm.material) ? sm.material.map(swap) : swap(sm.material); }
      r.variant = pick; r.skinHex = skin;
    }
    let cupGeo = null, cupMat = null, blobGeo = null, blobMat = null, proxyGeo = null;
    function upgrade(h) {
      const c = h.userData.char; if (!c || h.userData.rig) return;
      const D = srcFor(c), r = makeRig(D.tpl.root, D, false), out = outfitOf(c.role, c.idx);
      if (D.src.variants) dressVariant(r, c, D);
      if (D.regions) r.skinned.forEach(sm => { if (sm.geometry.attributes.aRegion) sm.material = regionMat(sm.material, out, /joint/i.test(sm.material.name) ? .8 : 1); });
      const sc = [1, .96, 1.03, .98, 1.05, .94, 1.01][c.idx % 7]; r.body.scale.setScalar(sc);
      // a soft contact shadow under the feet while standing; the shadow map covers sitting
      blobGeo = blobGeo || new THREE.CircleGeometry(.34, 24); blobMat = blobMat || new THREE.MeshBasicMaterial({ map: TEX.blob, transparent: true, depthWrite: false, opacity: .5 });
      const blob = new THREE.Mesh(blobGeo, blobMat); blob.rotation.x = -Math.PI / 2; blob.position.y = .005; blob.renderOrder = 1; blob.raycast = () => {}; h.add(blob);
      // an invisible capsule answers the click and hover ray instead of thousands of skinned triangles
      proxyGeo = proxyGeo || new THREE.CylinderGeometry(.24, .22, 1.8, 8).translate(0, .9, 0);
      const proxy = new THREE.Mesh(proxyGeo, blobMat); proxy.visible = false; proxy.userData.proxy = true; r.body.add(proxy);
      cupGeo = cupGeo || new THREE.CylinderGeometry(.035, .03, .1, 12); cupMat = cupMat || std(0xf4f1ea, { roughness: .35 });
      const cup = new THREE.Mesh(cupGeo, cupMat); cup.visible = false; cup.castShadow = true;
      if (r.B.R_Wrist) { r.B.R_Wrist.add(cup); r.body.updateMatrixWorld(true); const cs = 1 / r.B.R_Wrist.getWorldScale(V()).x; cup.scale.setScalar(cs); cup.position.set(0, .09 * cs, .03 * cs); } // R69: the wrist's measured scale, the Quaternius armature carries ×100
      h.remove(c.proc); h.add(r.body);
      h.userData.legs = []; h.userData.arms = []; h.userData.elbows = [];
      const mixer = new THREE.AnimationMixer(r.root);
      const rig = { r, D, mixer, h, sc, state: null, act: null, base: null, queue: null, busyUntil: 0, look: 0, lookAt: null, lookUntil: 0, talkUntil: 0, speed: 0, run: false, acc: 0, cup, blob, morph: blinkTargets(r.root), blinkAt: 2 + Math.random() * 3, seatY: 0, seatTo: 0, t: 0 };
      h.userData.rig = rig; S.rigs.add(rig);
      setPose(h, c.pose, c.spot, false);
      mixer.update(Math.random() * 2);
    }
    function blinkTargets(root) {
      const out = []; root.traverse(o => { if (o.morphTargetDictionary) Object.entries(o.morphTargetDictionary).forEach(([n, i]) => { if (/blink|eyes?_?clos/i.test(n)) out.push([o, i]); }); });
      return out;
    }
    const ACT_RE = [[/ดื่ม|จิบ|กาแฟ|ชา|มัทฉะ|เอสเปรสโซ|ไวน์/, 'drink'], [/ผัด|ต้ม|ทำอาหาร|อบขนม|วัตถุดิบ|ล้างจาน|ตักไอศกรีม/, 'cook'], [/ว่ายน้ำ/, 'swim'], [/งีบ|นอน|อาบแดด|นวด|เตียง/, 'lie'], [/โต๊ะญี่ปุ่น/, 'floor'], [/นำเสนอ|ระดม/, 'talk']];
    function stateFor(rig, pose, spot) {
      const c = rig.h.userData.char, label = spot ? (spot.act || '') + ' ' + (spot.room || '') : '';
      let act = null; for (const [re, a] of ACT_RE) if (re.test(label)) { act = a; break; }
      const spec = spot && spot.use ? spot.use : null;
      if (pose === 'type') return { st: hyEat(rig, label) ? 'eat' : 'type', seat: spec }; // v61: eating at a table uses the HY-Motion eat clip
      if (pose === 'sit') {
        if (c.role === 'rider' || c.role === 'cyclist') return { st: 'ride' };
        if (act === 'lie' || (spec && spec.recline)) return { st: 'lie', seat: spec };
        if (act === 'floor') return { st: 'floor', seat: spec };
        const legH = spec && spec.seatY !== undefined ? spec.seatY + .08 : .5 + (spot && spot.dy || 0); // thigh height above the floor
        if (legH < .24) return { st: 'floor', seat: spec };
        return { st: legH < .4 ? 'sitLow' : 'sit', seat: spec };
      }
      if (act === 'drink' || act === 'cook' || act === 'swim' || act === 'talk') return { st: act };
      return { st: 'idle' };
    }
    const SEATED = new Set(['sit', 'sitLow', 'floor', 'type', 'lie', 'ride']);
    // ----- v61: HY-Motion clips (Tencent HY-Motion 1.0, SMPL-H skeleton, non-commercial), retargeted offline per rig by
    // tools/retarget.mjs (world-space rest-pose delta transfer) and kept in their own file, assets/motion/hymotion-clips.js
    // (RISK_REGISTER R84: swappable for CC0 or hand-keyed clips). A clip that does not bind fully is never registered,
    // so every state keeps its built fallback; a missing file costs one console warning and nothing else.
    SEATED.add('eat');
    const HY_OF = { type: 'hy_type', drink: 'hy_drink', eat: 'hy_eat', lie: 'hy_lie', talk: 'hy_chat', stretch: 'hy_stretch' };
    const HY_FILE = 'assets/motion/hymotion-clips.js';
    S.hy = {};
    function hyPick(rig, name) { const k = HY_OF[name]; return k && rig.D.clips[k] ? k : name === 'eat' ? 'type' : name; }
    function hyEat(rig, label) { return /กิน|ทานข้าว|ทานอาหาร|มื้อ/.test(label) && !!rig.D.clips.hy_eat; }
    function hyClip(name, c, fps) {
      const n = c.n, times = Float32Array.from({ length: n }, (_, i) => Math.min(c.d, i / fps)), raw = Uint8Array.from(atob(c.q), ch => ch.charCodeAt(0));
      const q = new Int16Array(raw.buffer), pr = Uint8Array.from(atob(c.p), ch => ch.charCodeAt(0)), p = new Float32Array(pr.buffer), tracks = [];
      let at = 0;
      c.b.forEach((b, i) => {
        const k = c.k[i] === '1', len = k ? 4 : n * 4, v = new Float32Array(len); for (let j = 0; j < len; j++) v[j] = q[at + j] / 32767; at += len;
        tracks.push(k ? new THREE.QuaternionKeyframeTrack(b + '.quaternion', [0, c.d], [...v, ...v]) : new THREE.QuaternionKeyframeTrack(b + '.quaternion', times, v));
      });
      tracks.push(new THREE.VectorKeyframeTrack(c.h + '.position', times, p));
      return new THREE.AnimationClip(name, c.d, tracks);
    }
    function hyInstall(H) {
      let n = 0;
      Object.values(S.D || {}).forEach(D => {
        const set = H && H.rigs && H.rigs[D.key]; if (!set) return; S.hy[D.key] = {};
        Object.entries(set).forEach(([name, c]) => {
          const res = retarget(THREE.AnimationClip.toJSON(hyClip('hy_' + name, c, H.fps || 30)));
          S.hy[D.key][name] = { bound: res.bound, of: res.of };
          if (res.bound === res.of && res.of > 0) { D.clips['hy_' + name] = res.clip; n++; }
        });
      });
      // people already in a matching state cross-fade into the new clip
      S.rigs.forEach(rig => { const k = HY_OF[rig.curName]; if (k && rig.D.clips[k] && rig.cur && rig.cur.getClip() !== rig.D.clips[k]) play(rig, rig.curName, reduce ? 0 : .35); });
      return n;
    }
    function hyLoad() {
      const done = () => { try { hyInstall(window.__HYMOTION_CLIPS); } catch (e) { console.warn('HY-Motion clips did not install; the built animations stay', e); } };
      if (window.__HYMOTION_CLIPS) { done(); return; }
      const el = document.createElement('script'); el.src = HY_FILE; el.async = true;
      el.onload = done; el.onerror = () => console.warn('HY-Motion clips (' + HY_FILE + ') did not load; the built animations stay');
      document.head.appendChild(el);
    }
    // a standing, idle person stretches now and then (once, then back to idle); never with reduced motion
    function hyIdle(rig) {
      if (reduce || !rig.D.clips.hy_stretch || rig.state !== 'idle' || rig.curName !== 'idle' || rig.queue) return;
      if (rig.hyNext === undefined) { rig.hyNext = rig.t + 20 + Math.random() * 40; return; }
      if (rig.t < rig.hyNext) return;
      rig.hyNext = rig.t + 40 + Math.random() * 60;
      const d = play(rig, 'stretch', .35, true); rig.queue = { name: 'idle', at: rig.t + d - .35 };
    }
    // ?test only: put one person into a clip, at a time inside it, and frame the camera on them
    function hyDemo(name, t = 1.5, o = {}) {
      hyDemoEnd();
      const ok = r => r.h.parent && !r.h.userData.walk && !r.speed && r.state !== "walk" && r.state !== "run" && (o.seated ? ['type', 'sit', 'eat', 'lie', 'sitLow'].includes(r.state) : r.state === 'idle' || r.state === 'talk' || r.state === 'drink');
      const all = [...S.rigs].filter(ok), pref = o.seated ? all.filter(r => r.state === 'type' || r.state === 'sit') : all;
      const rig = (o.key ? pref.find(r => r.D.key === o.key) : null) || pref[0] || all[0] || [...S.rigs][0]; if (!rig) return null;
      const st = name === 'chat' ? 'talk' : name;
      rig.queue = null; rig.cur = null; rig.mixer.stopAllAction(); play(rig, st, 0); rig.cur.time = t; rig.dirty = true; rig.state = st === 'stretch' ? 'idle' : st; rig.hyNext = 1e9;
      rig.cup.visible = st === 'drink'; rig.mixer.update(0); S.demoRig = rig; rig.hyHold = true; rig.h.updateMatrixWorld(true);
      const p = rig.h.getWorldPosition(new THREE.Vector3()), fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rig.h.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
      const a = o.angle || 0, dir = fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a), ground = p.y + (rig.seatY || 0) * 0;
      const tgt = p.clone().add(new THREE.Vector3(0, o.seated ? .65 : .9, 0)), cam = tgt.clone().add(dir.multiplyScalar(o.dist || 2.3)).add(new THREE.Vector3(0, .35, 0));
      if (o.isolate) {
        // studio view for the limb check: everything but this person is hidden, a grid marks the floor under the holder
        S.demoHidden = []; three.scene.traverse(m => { if ((m.isMesh || m.isInstancedMesh || m.isPoints || m.isLine || m.isSprite) && m.visible) { let mine = false; for (let x = m; x; x = x.parent) if (x === rig.h) { mine = true; break; } if (!mine) { m.visible = false; S.demoHidden.push(m); } } });
        S.demoGrid = new THREE.GridHelper(3, 12, 0x333333, 0x888888); S.demoGrid.position.set(p.x, ground + .002, p.z); three.scene.add(S.demoGrid);
      }
      three.camera.position.copy(cam); if (three.controls) { three.controls.target.copy(tgt); three.controls.update(); } else three.camera.lookAt(tgt);
      return { key: rig.D.key, state: rig.state, clip: rig.cur.getClip().name, pos: p.toArray().map(x => +x.toFixed(2)) };
    }
    function hyDemoEnd() { if (S.demoRig) S.demoRig.hyHold = false; (S.demoHidden || []).forEach(m => { m.visible = true; }); S.demoHidden = null; if (S.demoGrid) { three.scene.remove(S.demoGrid); S.demoGrid.geometry.dispose(); S.demoGrid = null; } }
    function play(rig, name, fade, once) {
      const clip = rig.D.clips[hyPick(rig, name)] || rig.D.clips[name] || rig.D.clips.idle; if (!clip) return 0; // v61: HY-Motion first
      const a = rig.mixer.clipAction(clip); if (rig.cur === a && !once) return 0;
      a.reset(); a.enabled = true; a.setEffectiveTimeScale(1); a.setEffectiveWeight(1);
      if (once) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } else a.setLoop(THREE.LoopRepeat, Infinity);
      if (!once) a.time = Math.random() * clip.duration; // no two people in lockstep; the phase never moves a planted foot
      if (rig.cur && fade > 0) { a.play(); rig.cur.crossFadeTo(a, fade, false); } else { rig.mixer.stopAllAction(); a.play(); }
      rig.cur = a; rig.curName = name; rig.dirty = true; return clip.duration;
    }
    function setPose(h, pose, spot, animate = true) {
      const rig = h && h.userData.rig; if (!rig) { if (h && h.userData.char) { h.userData.char.pose = pose; h.userData.char.spot = spot; } return; }
      const was = rig.state, { st, seat } = stateFor(rig, pose, spot), fade = reduce || !animate ? 0 : .32;
      rig.state = st; rig.speed = 0; rig.cup.visible = st === 'drink'; rig.blob.visible = !SEATED.has(st) && st !== 'swim';
      // seat height from the use spec, relative to the default seat the spot's dy already assumes
      rig.seatTo = seat && seat.seatY !== undefined ? seat.seatY + .08 - .5 - (spot && spot.dy || 0) : 0;
      rig.backTo = seat && seat.back ? -seat.back : 0; rig.yawTo = seat && seat.facing ? seat.facing : 0;
      if (!SEATED.has(st)) rig.seatTo = rig.backTo = rig.yawTo = 0;
      if (fade && SEATED.has(st) && !SEATED.has(was) && st !== 'ride') { rig.queue = { name: st, at: rig.t + play(rig, 'sitDown', .22, true) - .12 }; rig.busyUntil = rig.t + .85; return; }
      if (fade && !SEATED.has(st) && SEATED.has(was) && was !== 'ride') { rig.queue = { name: st === 'idle' ? 'idle' : st, at: rig.t + play(rig, 'standUp', .2, true) - .15 }; rig.busyUntil = rig.t + .9; return; }
      rig.queue = null; play(rig, st, fade);
      if (!fade) { rig.seatY = rig.seatTo; rig.r.body.position.y = rig.seatY; }
    }
    // walking and running: the clip plays at the rate that keeps the planted foot still at this speed
    function moving(h, speed, run) {
      const rig = h.userData.rig; if (!rig) return; if (rig.hyHold) return; // v61: set only by the ?test hyDemo hook
      if (!speed) { if (rig.state === 'walk' || rig.state === 'run') { rig.state = 'idle'; play(rig, rig.talkUntil > rig.t ? 'talk' : 'idle', .3); } return; }
      const want = run && rig.D.clips.run ? 'run' : 'walk';
      if (rig.state !== want) { rig.state = want; rig.queue = null; rig.cup.visible = false; rig.blob.visible = true; rig.seatTo = rig.backTo = rig.yawTo = 0; play(rig, want, rig.state === 'idle' ? .25 : .3); }
      rig.speed = speed; const v0 = (rig.D.stride[want] || 1.3) * rig.sc; rig.cur.setEffectiveTimeScale(Math.min(2.4, Math.max(.4, speed / v0)));
    }
    function chat(a, b, ms) {
      const fa = figOf(a), fb = figOf(b); if (!fa || !fb) return;
      [[fa, fb], [fb, fa]].forEach(([x, y]) => { const r = x.userData.rig; if (!r) return; r.lookAt = y; r.lookUntil = r.t + ms / 1000; });
    }
    function speaking(who) { const f = figOf(who), r = f && f.userData.rig; if (!r || r.state !== 'idle') return; r.talkUntil = r.t + 1.8; play(r, 'talk', .3); }
    function figOf(x) { return !x ? null : x.npc ? x.npc.f : x.isObject3D ? x : three.figures.get(x.id); }
    function busy(h) { const r = h && h.userData.rig; return r ? Math.max(0, r.busyUntil - r.t) : 0; }
    // ----- the frame: mixers, look-at, blinks, level of detail
    const cam = V(), fr = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere();
    const stats0 = { updated: 0, skipped: 0, culled: 0 };
    function update(dt) {
      if (!S.ok) return; S.frame++;
      const camera = three.camera; camera.getWorldPosition(cam); pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); fr.setFromProjectionMatrix(pm);
      stats0.updated = stats0.skipped = stats0.culled = 0;
      S.rigs.forEach(rig => {
        rig.t += dt;
        if (!rig.h.parent) { if (!isLive(rig.h)) { S.rigs.delete(rig); S.holders.delete(rig.h); } return; }
        rig.h.getWorldPosition(tv); sph.set(tv.setY(tv.y + .9), 1.2);
        const seen = fr.intersectsSphere(sph), far = cam.distanceTo(tv) > 28, moving = rig.state === 'walk' || rig.state === 'run', every = S.fullRate ? 1 : !seen ? 4 : far && !moving ? 2 : 1; // a walker on screen always runs at full rate, so no planted foot drifts between updates
        rig.acc += dt; rig.every = every; if (!seen) stats0.culled++;
        if (rig.queue && rig.t >= rig.queue.at) { const q = rig.queue; rig.queue = null; play(rig, q.name, .25); }
        hyIdle(rig); // v61
        if (rig.talkUntil && rig.t > rig.talkUntil && rig.state === 'idle' && rig.curName === 'talk') { rig.talkUntil = 0; play(rig, rig.lookUntil > rig.t ? 'listen' : 'idle', .35); }
        // the seat offset glides so a person settles onto a higher or lower seat instead of popping
        const k = Math.min(1, dt * 4); rig.seatY += (rig.seatTo - rig.seatY) * k; rig.r.body.position.y = rig.seatY;
        rig.r.body.position.z += ((rig.backTo || 0) - rig.r.body.position.z) * k; rig.r.body.rotation.y += ((rig.yawTo || 0) - rig.r.body.rotation.y) * k;
        if ((S.frame + rig.h.userData.char.idx) % every) { stats0.skipped++; return; }
        stats0.updated++;
        if (reduce) { if (rig.dirty) rig.mixer.update(5); } else rig.mixer.update(rig.acc);
        if (!reduce && moving) footLock(rig, rig.acc); else if (rig.locks) rig.locks = null;
        rig.acc = 0; rig.dirty = false;
        lookAt(rig);
        if (rig.morph.length) { rig.blinkAt -= dt * every; const on = rig.blinkAt < .12; rig.morph.forEach(([o, i]) => { o.morphTargetInfluences[i] = on ? 1 : 0; }); if (rig.blinkAt < 0) rig.blinkAt = 2 + Math.random() * 4; }
      });
    }
    // ----- foot locking: the planted contact point (heel, then ball) stays where it touched down, and an analytic
    // two-bone IK bends the leg to reach it. Clip timing alone left the stand-in's own slide (0.10 m/s walking);
    // the lock removes it. A lock lets go when the foot lifts, or if holding it would stretch the leg too far.
    const iq = Q(), iq2 = Q(), ia = V(), ib = V(), ic = V(), it = V(), ax0 = V(), ax1 = V(), fq = Q();
    function ik2(A, Bn, C, T) {
      A.updateWorldMatrix(true, true);
      const a = A.getWorldPosition(ia), b = Bn.getWorldPosition(ib), c = C.getWorldPosition(ic);
      const lab = b.distanceTo(a), lcb = c.distanceTo(b), lat = Math.min(Math.max(T.distanceTo(a), .01), lab + lcb - .001);
      const cl = x => Math.min(1, Math.max(-1, x));
      const ca = c.clone().sub(a).normalize(), ba = b.clone().sub(a).normalize(), ab = a.clone().sub(b).normalize(), cb = c.clone().sub(b).normalize(), ta = T.clone().sub(a).normalize();
      const ac_ab_0 = Math.acos(cl(ca.dot(ba))), ba_bc_0 = Math.acos(cl(ab.dot(cb)));
      const ac_ab_1 = Math.acos(cl((lcb * lcb - lab * lab - lat * lat) / (-2 * lab * lat))), ba_bc_1 = Math.acos(cl((lat * lat - lab * lab - lcb * lcb) / (-2 * lab * lcb)));
      ax0.crossVectors(ca, ba); if (ax0.lengthSq() < 1e-10) return; ax0.normalize();
      const ac_at_0 = Math.acos(cl(ca.dot(ta))); ax1.crossVectors(ca, ta);
      const agr = A.getWorldQuaternion(Q()), bgr = Bn.getWorldQuaternion(Q()), aInv = agr.clone().invert(), bInv = bgr.clone().invert();
      A.quaternion.multiply(iq.setFromAxisAngle(ax0.clone().applyQuaternion(aInv), ac_ab_1 - ac_ab_0));
      Bn.quaternion.multiply(iq.setFromAxisAngle(ax0.clone().applyQuaternion(bInv), ba_bc_1 - ba_bc_0));
      if (ax1.lengthSq() > 1e-10) A.quaternion.multiply(iq.setFromAxisAngle(ax1.normalize().applyQuaternion(aInv), ac_at_0));
    }
    function footLock(rig, dt) {
      const B = rig.r.B; if (!B.L_Hip || !B.L_Knee || !B.L_Ankle) return;
      rig.h.updateWorldMatrix(true, true); // from the holder down: stepWalkers moved it this frame, and a stale holder matrix put every lock one frame behind
      const base = rig.h.getWorldPosition(V()).y, sc = rig.sc, locks = rig.locks || (rig.locks = [{ k: null, p: V(), off: V() }, { k: null, p: V(), off: V() }]);
      [['L_', 0], ['R_', 1]].forEach(([s, j]) => {
        const L = locks[j], hip = B[s + 'Hip'], knee = B[s + 'Knee'], ank = B[s + 'Ankle'], ball = B[s + 'Foot'];
        const pa = ank.getWorldPosition(V()), pb = ball ? ball.getWorldPosition(V()) : null;
        const ea = pa.y - base - rig.D.ankleH * sc, eb = pb ? pb.y - base - rig.D.ballH * sc : Infinity;
        let k = Math.min(ea, eb) < .015 ? (eb < ea ? 'b' : 'a') : null;
        // a foot that is swinging forward can skim the floor; only a point that is (nearly) still in the world may plant
        const pt0 = k === 'b' ? pb : pa, prev = L.prev && L.prev[k || 'a'], wv = prev && dt > 0 ? Math.hypot(pt0.x - prev.x, pt0.z - prev.z) / dt : 0;
        L.prev = { a: pa.clone(), b: pb ? pb.clone() : null };
        const bodyV = rig.speed || 1.3;
        if (k && L.k !== k && wv > Math.max(.35, bodyV * .3)) k = null; // still swinging: not a touchdown
        if (k && L.k === k && wv > bodyV + .3) k = null;                   // lifting off
        if (k) {
          const pt = k === 'a' ? pa : pb;
          // a new contact (or heel to ball) starts where that point is shown now, so the switch never pops
          if (L.k !== k) { L.p.copy(pt).add(L.off); L.k = k; }
          L.off.set(L.p.x - pt.x, 0, L.p.z - pt.z);
          if (L.off.length() > .22 * sc) { L.k = null; } // holding on would overstretch the leg: let go and glide back
        } else { L.k = null; L.off.multiplyScalar(Math.exp(-dt * 14)); }
        if (!L.k && L.off.lengthSq() < 1e-8) return;
        it.copy(pa).add(L.off);
        ank.getWorldQuaternion(fq); // keep the foot's animated orientation
        ik2(hip, knee, ank, it);
        knee.updateWorldMatrix(true, false); ank.quaternion.copy(knee.getWorldQuaternion(iq2).invert().multiply(fq)); ank.updateWorldMatrix(false, true);
      });
    }
    const isLive = h => { for (let a = h; a; a = a.parent) if (a === three.scene) return true; return false; };
    function lookAt(rig) {
      const B = rig.r.B; let want = 0;
      if (rig.lookAt && rig.lookUntil > rig.t && rig.state !== 'walk' && rig.state !== 'run') {
        rig.lookAt.getWorldPosition(tv); tv.y += 1.5; rig.h.worldToLocal(tv);
        want = Math.max(-1.1, Math.min(1.1, Math.atan2(tv.x, tv.z)));
      } else rig.lookAt = null;
      rig.look += (want - rig.look) * .12;
      if (Math.abs(rig.look) < .002) return;
      rig.h.getWorldQuaternion(tq); const up = UP.clone().applyQuaternion(tq);
      turn(B.Neck, up, rig.look * .4); turn(B.Head, up, rig.look * .6);
    }
    // ----- tests: what is loaded, and the planted-foot speed of walkers in world space
    function stats() {
      return { ok: S.ok, off: !!S.off, failed: S.failed, source: CHAR_USE, sources: S.D ? Object.keys(S.D) : [],
        mix: [...S.rigs].reduce((m, r) => { const k = (r.h.userData.pid === undefined ? 'npc:' : 'staff:') + r.D.key; m[k] = (m[k] || 0) + 1; return m; }, {}),
        variants: [...S.rigs].reduce((m, r) => { const k = r.D.key + ':' + r.r.variant; m[k] = (m[k] || 0) + 1; return m; }, {}), regions: S.regions ? regionReport() : null, holders: S.holders.size, rigs: S.rigs.size, clips: Object.keys(S.clips), stride: S.stride, strideSamples: S.strideSamples, strideLateral: S.strideLat, strideFloor: S.strideFloor, calib: S.calib,
        bones: S.tpl ? (() => { const n = []; S.tpl.root.traverse(o => { if (o.isBone) n.push(o.name); }); return n; })() : [], lod: Object.assign({}, stats0),
        states: [...S.rigs].reduce((m, r) => { m[r.state] = (m[r.state] || 0) + 1; return m; }, {}) };
    }
    // how many vertices of each skinned mesh carry each region, so a test can see the outfit is painted
    function regionReport() {
      const names = ['top', 'pants', 'shoes', 'skin', 'hair', 'forearm', 'shin', 'front', 'collar'];
      return S.tpl.skinned.map(sm => { const a = sm.geometry.attributes.aRegion, n = {}; if (!a) return { name: sm.name, regions: null }; for (let i = 0; i < a.count; i++) { const k = names[a.getX(i)]; n[k] = (n[k] || 0) + 1; } return { name: sm.name, count: a.count, regions: n }; });
    }
    function probe(sec, maxTurn = .5) {
      return new Promise(res => {
        const prev = new Map(), out = { samples: 0, by: {}, body: {}, sg: {}, ex: [] }, t0 = performance.now();
        const step = () => {
          S.rigs.forEach(rig => {
            if (rig.state !== 'walk' && rig.state !== 'run') { prev.delete(rig); return; }
            const B = rig.r.B, now = performance.now(), ry = rig.h.rotation.y;
            // the ground contact of each foot: the heel (ankle) or the ball, whichever sits at its own standing height
            const pts = ['L_Ankle', 'L_Foot', 'R_Ankle', 'R_Foot'].map(n => B[n] ? B[n].getWorldPosition(V()) : null);
            const rest = [rig.D.ankleH, rig.D.ballH, rig.D.ankleH, rig.D.ballH];
            const p = prev.get(rig);
            // speeds use the rig's own simulation clock (rig.t), so a slow or clamped frame cannot read as sliding;
            // samples are split by state and by the rig's level of detail (every: 1 full rate, 2 far, 4 off screen)
            const body = rig.h.getWorldPosition(V());
            if (p && rig.t - p.st > 1e-4 && now - p.t < 80) {
              const dts = rig.t - p.st, turning = Math.abs(Math.atan2(Math.sin(ry - p.ry), Math.cos(ry - p.ry))) / dts;
              const key = rig.state + '/every' + (rig.every || 1), bodyV = Math.hypot(body.x - p.b.x, body.z - p.b.z) / dts;
              [0, 2].forEach(j => {
                let best = -1, ex = Infinity;
                [j, j + 1].forEach(k => { if (!pts[k] || !p.f[k]) return; const e = pts[k].y - body.y - rest[k] * rig.sc; if (e < .015 && e < ex) { ex = e; best = k; } });
                out.samples++;
                if (best < 0 || turning > maxTurn) return;
                const v = Math.hypot(pts[best].x - p.f[best].x, pts[best].z - p.f[best].z) / dts;
                const adv = bodyV > .05 ? ((pts[best].x - p.f[best].x) * (body.x - p.b.x) + (pts[best].z - p.f[best].z) * (body.z - p.b.z)) / (bodyV * dts) / dts : 0;
                if (adv > bodyV * .5) return; // swinging forward: not a stance frame
                if (v > .3 && out.ex.length < 30) out.ex[out.ex.length] = { v: +v.toFixed(2), bodyV: +bodyV.toFixed(2), adv: +adv.toFixed(2), pt: best, cur: rig.curName, state: rig.state, ts: rig.cur ? +rig.cur.getEffectiveTimeScale().toFixed(2) : null,
                  acts: rig.mixer._actions.filter(x => x.getEffectiveWeight() > .01).map(x => x.getClip().name + ':' + x.getEffectiveWeight().toFixed(2)).join(' '), lock: rig.locks ? rig.locks.map(L => (L.k || '-') + L.off.length().toFixed(2)).join('/') : 'none', walkWait: rig.h.userData.walk ? rig.h.userData.walk.wait : null, every: rig.every, dts: +dts.toFixed(4) };
                if (bodyV > .05) { const sg = ((pts[best].x - p.f[best].x) * (body.x - p.b.x) + (pts[best].z - p.f[best].z) * (body.z - p.b.z)) / (bodyV * dts) / dts; (out.sg[key] = out.sg[key] || [])[out.sg[key].length] = sg; }
                (out.by[key] = out.by[key] || [])[out.by[key].length] = v; (out.body[key] = out.body[key] || [])[out.body[key].length] = bodyV;
              });
            }
            prev.set(rig, { t: now, st: rig.t, f: pts, ry, b: body });
          });
          if (performance.now() - t0 < sec * 1000) requestAnimationFrame(step);
          else {
            const q = (a, f) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.floor((s.length - 1) * f)].toFixed(3) : null; };
            const by = {}; Object.keys(out.by).forEach(k => { const a = out.by[k]; by[k] = { stanceFrames: a.length, median: q(a, .5), p75: q(a, .75), p90: q(a, .9), bodyMedian: q(out.body[k], .5), signedMedian: out.sg[k] ? q(out.sg[k], .5) : null }; });
            res({ samples: out.samples, by, examples: out.ex });
          }
        };
        requestAnimationFrame(step);
      });
    }
    // ----- retarget hook: a clip in AnimationClip.toJSON form (Quaternius, or HY-Motion via tools/node/retarget.mjs)
    // whose tracks name bones by semantic (SMPL) names or by another rig's names; map = { theirName: semanticName }
    function retarget(json, map) {
      const clip = THREE.AnimationClip.parse(json), names = S.src.bones, sem = map || {}, kept = [], own = new Set();
      S.tpl.root.traverse(o => { if (o.isBone) own.add(o.name); });
      clip.tracks.forEach(t => {
        const i = t.name.lastIndexOf('.'), node = t.name.slice(0, i), prop = t.name.slice(i);
        const key = sem[node] || node, target = own.has(node) ? node : names[key] ? san(names[key]) : null;
        if (!target) return; if (prop === '.position' && target !== S.hipsName) return;
        t.name = target + prop; kept.push(t);
      });
      clip.tracks = kept; return { clip, bound: kept.length, of: json.tracks.length };
    }
    return { boot, makeHolder, setPose, spec: specFor, moving, chat, speaking, busy, update, reuse: (h, pose, spot) => { if (!h || !h.userData.rig) return false; setPose(h, pose, spot, true); return true; }, arrive: (h, pose, spot) => setPose(h, pose, spot, true), retarget, stats, probe, get ok() { return S.ok; } };
  })();
  function makeHuman(role, idx, pose) {
    const proc = makeHumanProc(role, idx, pose);
    return CHARS.makeHolder(role, idx, pose, proc);
  }

  // Spots for meetings, the Head's desk and idle people, in grid units (x, y = depth).
  const SPOTS = {
    head: [{ x: 13.45, y: 2.75 }],
    meeting: [{ x: 1.75, y: 2.15 }, { x: 2.7, y: 2.15 }, { x: 3.65, y: 2.15 }, { x: 1.75, y: 4.25 }, { x: 2.7, y: 4.25 }, { x: 3.65, y: 4.25 }, { x: .85, y: 3.2 }, { x: 4.6, y: 3.2 }],
    // idle spots per room, each with the anchor of the furniture group it stands among (see shiftOf)
    idle: [
      [{ x: 3.2, y: 8.6, a: [2, 8.5] }, { x: 2.6, y: 9.9, a: [2, 8.5] }, { x: 1.6, y: 6.2, a: [2, 8.5] }, { x: 3.4, y: 9.3, a: [2, 8.5] }],
      [{ x: 12.9, y: 12.1, a: [14, 12], look: { x: 12.9, y: 10.8 } }, { x: 13.9, y: 12.1, a: [14, 12], look: { x: 13.9, y: 10.8 } }, { x: 14.5, y: 7.6, a: [16, 8.5] }, { x: 14.6, y: 6.4, a: [16, 8.5] }],
      [{ x: 6.9, y: 2.6, a: [6, 2] }]
    ],
    idleLook: [{ x: 1.8, y: 8.2 }, { x: 15.5, y: 7.3 }, { x: 6.5, y: .6 }]
  };
  // A spot on the 16 x 12 plan, moved with the furniture group anchored at (ax, az), in world coordinates.
  function W(x, z, ax, az, extra) {
    const [dx, dz] = shiftOf(ax, az), o = Object.assign({ x: x + dx, y: z + dz, dy: 0 }, extra || {});
    if (extra && extra.look) o.look = { x: extra.look.x + dx, y: extra.look.y + dz };
    return o;
  }
  const ACT_MS = 45000;
  // What a person can be told to do from the menu (owner, 14 Oct 2026, "เหมือนในเกม The Sims 4").
  // These move the figure in this page only; the real agent is driven by labels and comments on GitHub.
  const ACTS = {
    matcha:  { th: 'ไปโซนเครื่องดื่ม', fx: () => useStock('drink', 1),          room: 'โซนเครื่องดื่ม', spot: i => W(13.4 + (i % 2) * .7, 12.1, 14, 12, { pose: 'stand', look: { x: 13.4 + (i % 2) * .7, y: 10.8 } }) },
    massage: { th: 'ไปนวดผ่อนคลาย',      room: 'ห้องพักผ่อน · เก้าอี้นวด', spot: () => W(3.25, 11.15, 2, 8.5, { pose: 'sit', dy: .1, look: { x: 1.8, y: 8.4 } }) },
    beanbag: { th: 'นั่งบีนแบ็ก',          room: 'ห้องพักผ่อน · บีนแบ็ก', spot: i => { const b = [[1.15, 9.75], [2.35, 10.2], [3.35, 9.6], [.7, 10.6], [3.4, 10.55]][i % 5]; return W(b[0], b[1], 2, 8.5, { pose: 'sit', dy: -.2, look: { x: 1.8, y: 8.4 } }); } },
    bridge:  { th: 'เดินเล่นที่สะพาน',     room: 'สะพานไม้', spot: i => W(8 + (i % 2 ? .4 : -.4), three.bridgeZ || 29, 8, 12, { pose: 'stand', dy: 1.42, look: { x: 14, y: three.bridgeZ || 29 } }) },
    dock:    { th: 'ไปที่ท่าเรือ',          room: 'ท่าเรือ', spot: i => dockSpot(i) },
    meeting: { th: 'เรียกเข้าห้องประชุม',  room: 'ห้องประชุม', spot: i => { const m = SPOTS.meeting[i % SPOTS.meeting.length]; return W(m.x, m.y, 3, 2.5, { pose: 'sit', look: { x: 2.7, y: 3.2 } }); } }
  };
  // ---------- every object can be tapped, like The Sims 4 (owner, 14 Oct 2026) ----------
  // reg() marks an object with the actions it offers. how: 'sit' puts the person on it facing its front,
  // 'front' stands them d metres in front of it facing it, 'at' puts them on its spot. fx runs an effect.
  const IX = [];
  function reg(obj, name, acts) { if (obj) { obj.userData.ix = IX.length; IX.push({ obj, name, acts: withExtras(obj, name, acts) }); } return obj; }
  function ixSpot(ix, a, i) {
    const o = ix.obj, p = new THREE.Vector3(), q = new THREE.Quaternion();
    o.updateWorldMatrix(true, false); o.getWorldPosition(p); o.getWorldQuaternion(q);
    const fwd = a.dir ? new THREE.Vector3(a.dir[0], 0, a.dir[1]).normalize() : new THREE.Vector3(0, 0, 1).applyQuaternion(q).setY(0).normalize();
    const side = new THREE.Vector3(-fwd.z, 0, fwd.x), n = (i % 3) - 1;
    const pos = p.clone().add(fwd.clone().multiplyScalar(a.d || 0)).add(side.multiplyScalar(n * (a.spread || 0)));
    const look = a.how === 'front' ? p : pos.clone().add(fwd);
    return { x: pos.x, y: pos.z, dy: (a.dy || 0) + (a.keepY ? p.y : 0), pose: a.pose || (a.how === 'sit' ? 'sit' : 'stand'), look: { x: look.x, y: look.z }, use: CHARS.spec(ix.obj, a) };
  }
  let selectedPid = null;
  function actorFor() {
    return people.find(p => p.id === selectedPid) || people.find(p => p.state === 'idle' && p.role !== 'head') || people.find(p => p.role !== 'head') || people[0];
  }

  function dockSpot(i) {
    if (!three.jetty) return W(8, 24, 8, 12, { pose: 'stand' });
    three.jetty.updateWorldMatrix(true, false);
    const p = three.jetty.localToWorld(new THREE.Vector3(i % 2 ? .25 : -.25, 0, -2.6)), t = three.jetty.localToWorld(new THREE.Vector3(1.5, 0, -1.3));
    return { x: p.x, y: p.z, dy: -.43, pose: 'stand', look: { x: t.x, y: t.z } };
  }
  // the focus room's four desks (plan coordinates, anchored to its back wall)
  const FOCUS = [{ x: 13 }];
  const IDLE_ROOM = ['ห้องพักผ่อน', 'ห้องครัว · โซนเครื่องดื่ม', 'ห้องน้ำชาย'];
  const PLACES = [
    { name: 'โซนเครื่องดื่ม', x: 13.5, y: .1, z: 12.4, ax: 14, az: 12 },
    { name: 'โซนตู้แช่และขนม', x: 12.8, y: .1, z: 11.4, ax: 12.2, az: 8.5 },
    { name: 'โซนทำอาหาร', x: 17.5, y: .1, z: 6.4, ax: 17.5, az: 5 },
    { name: 'สระว่ายน้ำ', x: 28.4, y: .2, z: 4, ax: 16, az: 6 },
    { name: 'ท่าเรือ', x: 12.3, y: .1, z: 0, ax: 8, az: 12, dock: true }
  ];

  // ================= v59 objects: every object used, poses true to the object, seats dragged and put back =================
  // (owner, 14 Oct 2026: "ตัวละครต้องผลัดกันใช้สิ่งของที่มีให้ครบ ไม่ใช่วางเป็นพร็อบไปงั้นๆ", "ให้ตัวละคร ลากเก้าอี้ ลากโซฟา บีนแบ็กไปมาได้
  // แต่ต้องเก็บที่เดิมด้วย", "เช็คความสมจริงของการใช้สิ่งของด้วย อย่างแบบ นั่งแล้วจมบีนแบ็กไปเลยครึ่งตัวก็ไม่ใช่")
  // A staff member is one jointed figure for life (pelvis, spine, head, hips, knees, ankles, shoulders, elbows), posed by joint
  // values that blend over 0.35 s, so sitting down, standing up, lying, swimming and reaching are motions, never a one-frame swap.
  // Lengths (m): pelvis joint .92 above the soles when standing, thigh .44, shin .41, ankle to sole .07, upper arm .30, forearm .29.
  const RIG = { hip: .92, thigh: .44, shin: .41, foot: .07, upper: .30, fore: .29, torsoHalf: .142, chest: .45, shoulderY: .62, toe: .175 };
  function makeRig(role, idx) {
    const O = OUTFIT[role], g = new THREE.Group();
    const L = { skin: SKINS[(idx * 7 + 3) % SKINS.length], hair: HAIRS[(idx * 3 + 1) % HAIRS.length], style: role === 'qal' ? 'long' : STYLES[(idx * 5 + 2) % STYLES.length], glasses: O.glasses || idx % 4 === 2 };
    const skin = std(L.skin, { roughness: .55 }), skinD = std(new THREE.Color(L.skin).multiplyScalar(.9).getHex(), { roughness: .55 });
    const hairM = std(L.hair, { roughness: .6 });
    const shirt = std(O.shirts ? O.shirts[idx % O.shirts.length] : O.shirt, { roughness: .85 });
    const pants = std(O.pants, { roughness: .85 }), shoes = std(O.shoes, { roughness: .35 }), coat = O.coat ? std(O.coat, { roughness: .7 }) : null;
    const top = coat || shirt, badgeM = std(ROLES[role] ? hexOf(ROLES[role].color) : 0x6b4630, { roughness: .5 });
    const P = grp(g, 0, RIG.hip, 0), S = grp(P, 0, 0, 0);
    P.name = 'pelvis'; S.name = 'spine';
    mesh(P, Cy(.19, .18, .16, 18), pants, 0, .04, 0).scale.z = .72;
    mesh(P, Cy(.188, .188, .035, 18), std(0x1d1a17, { roughness: .4 }), 0, .13, 0).scale.z = .72;
    const hips = [], knees = [], ankles = [], shs = [], els = [], hands = [];
    [-1, 1].forEach(s => {
      const hp = grp(P, s * .1, 0, 0), kn = grp(hp, 0, -RIG.thigh, 0), an = grp(kn, 0, -RIG.shin, 0);
      hp.name = 'hip'; kn.name = 'knee'; an.name = 'ankle';
      mesh(hp, Cy(.075, .066, RIG.thigh, 12), pants, 0, -RIG.thigh / 2, 0);
      mesh(kn, Cy(.064, .052, RIG.shin, 12), O.shorts ? skin : pants, 0, -RIG.shin / 2, 0);
      mesh(an, B(.11, .07, .25), shoes, 0, -.035, .05);
      if (O.top === 'tee' && O.shorts) mesh(an, B(.112, .02, .2), std(0xf4f4f2, { roughness: .5 }), 0, -.06, .05);
      hips.push(hp); knees.push(kn); ankles.push(an);
    });
    const tY = .42;
    mesh(S, Cy(.215, .18, .52, 20), top, 0, tY, 0).scale.z = .66;
    mesh(S, Sp(.22, 20, 12), top, 0, tY + .23, 0).scale.set(1, .42, .68);
    if (O.top === 'blazer') {
      mesh(S, B(.11, .3, .01), shirt, 0, tY + .1, .142);
      mesh(S, B(.036, .27, .008), std(0x7a1f2b, { roughness: .5 }), 0, tY + .08, .149);
      [-1, 1].forEach(s => { const lp = mesh(S, B(.05, .26, .01), coat, s * .07, tY + .1, .147); lp.rotation.z = -s * .28; });
      [0, -1].forEach(k => mesh(S, Sp(.012, 8, 6), std(0x111111), .045, tY - .08 + k * .1, .146));
    } else if (O.top === 'hoodie') {
      const hood = mesh(S, new THREE.TorusGeometry(.12, .05, 8, 18), shirt, 0, tY + .28, -.07); hood.rotation.x = Math.PI / 2.4;
      [-1, 1].forEach(s => mesh(S, Cy(.006, .006, .18, 6), std(0xeeeeee), s * .05, tY + .12, .14));
      mesh(S, B(.24, .1, .02), std(new THREE.Color(shirt.color).multiplyScalar(.85).getHex()), 0, tY - .1, .14);
    } else if (O.top === 'tee') {
      const nk = mesh(S, new THREE.TorusGeometry(.07, .012, 6, 18), std(new THREE.Color(shirt.color).multiplyScalar(.82).getHex(), { roughness: .85 }), 0, tY + .27, .02); nk.rotation.x = Math.PI / 2;
    } else {
      [-1, 1].forEach(s => { const c = mesh(S, B(.09, .035, .07), shirt, s * .055, tY + .29, .075); c.rotation.z = s * .45; c.rotation.x = .3; });
      for (let k = 0; k < (O.top === 'polo' ? 2 : 4); k++) mesh(S, Sp(.008, 6, 4), std(0xeeeeee), 0, tY + .2 - k * .09, .145);
    }
    if (!O.civilian) {
      [-1, 1].forEach(s => { const ly = mesh(S, B(.012, .24, .004), badgeM, s * .045, tY + .14, .146); ly.rotation.z = s * .22; });
      mesh(S, B(.075, .1, .006), std(0xffffff, { roughness: .3 }), 0, tY - .01, .15);
      mesh(S, B(.075, .026, .007), badgeM, 0, tY + .025, .151);
    }
    const H = grp(S, 0, tY + .31, 0); H.name = 'head';
    mesh(H, Cy(.055, .062, .1, 12), skin, 0, 0, 0);
    const hy = .17;
    mesh(H, Sp(.125, 28, 20), skin, 0, hy, 0).scale.set(.94, 1.1, 1);
    [-1, 1].forEach(s => mesh(H, Sp(.028, 10, 8), skinD, s * .118, hy, -.005).scale.set(.5, 1, .8));
    [-1, 1].forEach(s => {
      mesh(H, Sp(.019, 12, 10), std(0xfafafa, { roughness: .2 }), s * .044, hy + .014, .103).scale.z = .55;
      mesh(H, Sp(.011, 10, 8), std(0x2b1a12, { roughness: .1 }), s * .044, hy + .014, .113);
      const brow = mesh(H, B(.046, .01, .012), hairM, s * .045, hy + .052, .11); brow.rotation.z = -s * .1;
    });
    mesh(H, Sp(.02, 10, 8), skinD, 0, hy - .014, .122).scale.set(.75, 1.25, 1);
    const lips = mesh(H, new THREE.TorusGeometry(.024, .006, 6, 18, Math.PI), std(0xa5544c, { roughness: .4 }), 0, hy - .05, .108); lips.rotation.z = Math.PI; lips.scale.y = .7;
    const cap = mesh(H, new THREE.SphereGeometry(.134, 28, 18, 0, Math.PI * 2, 0, Math.PI * .52), hairM, 0, hy + .012, -.006); cap.scale.set(.98, 1.12, 1.05); cap.rotation.x = -.42;
    if (L.style === 'long') { mesh(H, B(.25, .34, .07), hairM, 0, hy - .1, -.085); [-1, 1].forEach(s => mesh(H, B(.04, .22, .08), hairM, s * .118, hy - .05, -.02)); }
    if (L.style === 'bun') mesh(H, Sp(.058, 14, 10), hairM, 0, hy + .12, -.09);
    if (L.style === 'side') { const f = mesh(H, B(.13, .035, .05), hairM, .035, hy + .09, .095); f.rotation.z = -.32; }
    if (L.style === 'buzz') cap.scale.set(.96, 1.06, 1.01);
    if (L.glasses) {
      const gm = std(0x15171a, { roughness: .3 });
      [-1, 1].forEach(s => { mesh(H, new THREE.TorusGeometry(.028, .004, 6, 18), gm, s * .045, hy + .014, .127); const tp = mesh(H, B(.004, .004, .1), gm, s * .075, hy + .02, .08); tp.rotation.y = s * .2; });
      mesh(H, B(.03, .004, .004), gm, 0, hy + .02, .128);
    }
    const mouth = new THREE.Object3D(); mouth.position.set(0, hy - .05, .16); H.add(mouth);
    const sleeveShort = O.top === 'polo' || O.top === 'tee';
    [-1, 1].forEach(s => {
      const sh = grp(S, s * .24, RIG.shoulderY, 0); sh.name = 'shoulder';
      mesh(sh, Cy(.058, .05, RIG.upper, 12), sleeveShort ? (O.top === 'tee' ? shirt : top) : top, 0, -RIG.upper / 2, 0);
      if (O.top === 'blazer') mesh(sh, Cy(.05, .05, .02, 12), shirt, 0, -.29, 0);
      const el = grp(sh, 0, -RIG.upper, 0); el.name = 'elbow';
      mesh(el, Cy(.049, .041, .27, 12), sleeveShort ? skin : top, 0, -.135, 0);
      mesh(el, Sp(.046, 12, 10), skin, 0, -RIG.fore, .005).scale.set(.75, 1.1, .55);
      const hand = new THREE.Object3D(); hand.name = 'hand'; hand.position.set(0, -RIG.fore, .005); el.add(hand);
      shs.push(sh); els.push(el); hands.push(hand);
    });
    // what a hand holds (a cup, a book, a game pad); hidden until an activity shows it
    const cup = grp(els[0], 0, -RIG.fore - .02, .05); mesh(cup, Cy(.038, .033, .095, 16), M.ceramic, 0, 0, 0); cup.visible = false; cup.name = 'cup';
    const book = grp(els[0], .12, -RIG.fore - .02, .06); mesh(book, B(.2, .26, .03), std(0x8a5a36, { roughness: .8 }), 0, 0, 0); mesh(book, B(.19, .25, .032), std(0xf4f1ea, { roughness: .9 }), .004, 0, 0); book.visible = false; book.name = 'book';
    const padG = grp(els[0], .12, -RIG.fore - .01, .05); mesh(padG, B(.16, .04, .1), std(0xf4f4f2, { roughness: .3 }), 0, 0, 0); padG.visible = false; padG.name = 'pad';
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    const blob = new THREE.Mesh(new THREE.CircleGeometry(.36, 24), new THREE.MeshBasicMaterial({ map: TEX.blob, transparent: true, depthWrite: false, opacity: .55 }));
    blob.rotation.x = -Math.PI / 2; blob.position.set(0, .005, 0); blob.renderOrder = 1; g.add(blob);
    mergeOwn(g, { perParent: true, drop: true });
    g.userData.objRig = { P, S, H, hips, knees, ankles, shs, els, hands, mouth, cup, book, pad: padG, blob };
    g.userData.legs = []; g.userData.arms = []; g.userData.elbows = [];
    g.userData.pose = poseOf('stand'); applyPose(g, g.userData.pose);
    return g;
  }
  // ---------- poses: plain numbers per joint, so any two blend ----------
  const POSE_KEYS = ['py', 'pz', 'prx', 'sx', 'hx', 'blob'];
  const POSE_PAIRS = ['hipX', 'hipZ', 'hipY', 'hipT', 'knee', 'ank', 'shX', 'shY', 'shZ', 'elX'];
  function poseOf(kind) {
    const q = { py: RIG.hip, pz: 0, prx: 0, sx: 0, hx: 0, blob: 1, hipX: [0, 0], hipZ: [0, 0], hipY: [0, 0], hipT: [0, 0], knee: [0, 0], ank: [0, 0], shX: [0, 0], shY: [0, 0], shZ: [-.07, .07], elX: [-.12, -.12] };
    if (kind === 'type') { q.shX = [-.5, -.5]; q.elX = [-1.05, -1.05]; q.shZ = [-.12, .12]; }
    return q;
  }
  const clonePose = q => { const o = {}; POSE_KEYS.forEach(k => { o[k] = q[k]; }); POSE_PAIRS.forEach(k => { o[k] = q[k].slice(); }); if (q.ik) o.ik = q.ik; if (q.hold) o.hold = q.hold; return o; };
  function lerpPose(a, b, t) {
    const o = {}, e = t * t * (3 - 2 * t);
    POSE_KEYS.forEach(k => { o[k] = a[k] + (b[k] - a[k]) * e; });
    POSE_PAIRS.forEach(k => { o[k] = [0, 1].map(i => a[k][i] + (b[k][i] - a[k][i]) * e); });
    o.hold = t < .5 ? a.hold : b.hold; return o;
  }
  let _eu = null, _qt = null, _ay = null;
  function applyPose(f, q) {
    const R = f.userData.objRig; if (!R) return;
    if (!_eu) { _eu = new THREE.Euler(); _qt = new THREE.Quaternion(); _ay = new THREE.Vector3(0, 1, 0); }
    R.P.position.set(0, q.py, q.pz); R.P.rotation.set(q.prx, 0, 0);
    R.S.rotation.set(q.sx, 0, 0); R.H.rotation.set(q.hx, 0, 0);
    for (let i = 0; i < 2; i++) {
      // hip = swing about the vertical, then pitch, then abduction, then a twist about the thigh (cross-legged needs the twist)
      R.hips[i].quaternion.setFromEuler(_eu.set(q.hipX[i], q.hipY[i], q.hipZ[i], 'YXZ')).multiply(_qt.setFromAxisAngle(_ay, q.hipT[i]));
      R.knees[i].rotation.set(q.knee[i], 0, 0); R.ankles[i].rotation.set(q.ank[i], 0, 0);
      R.shs[i].rotation.set(q.shX[i], q.shY[i], q.shZ[i], 'XYZ'); R.els[i].rotation.set(q.elX[i], 0, 0);
    }
    R.blob.visible = q.blob > .5;
    const h = q.hold || null; R.cup.visible = h === 'cup'; R.book.visible = h === 'book'; R.pad.visible = h === 'pad';
  }
  // Two-bone IK for an arm: aims the shoulder and bends the elbow so the hand lands on a world point (pole: down and back).
  const _v = () => new THREE.Vector3();
  function armTo(f, i, target) {
    const R = f.userData.objRig, sh = R.shs[i], el = R.els[i];
    sh.parent.updateWorldMatrix(true, false);
    const inv = new THREE.Matrix4().copy(sh.parent.matrixWorld).invert();
    const S = sh.position.clone(), T = target.clone().applyMatrix4(inv), a = RIG.upper, b = RIG.fore;
    const d0 = T.clone().sub(S), D = Math.min(Math.max(d0.length(), .12), a + b - .002), dir = d0.normalize();
    const ca = Math.min(1, Math.max(-1, (a * a + D * D - b * b) / (2 * a * D))), alpha = Math.acos(ca);
    const bend = Math.PI - Math.acos(Math.min(1, Math.max(-1, (a * a + b * b - D * D) / (2 * a * b))));
    // the elbow swings out of the line shoulder-target toward the pole (down and behind, in the spine's frame)
    const pole = new THREE.Vector3(0, -1, -.6), side = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))); if (side.lengthSq() < 1e-6) side.set(0, 0, -1); side.normalize();
    const E = S.clone().add(dir.clone().multiplyScalar(Math.cos(alpha) * a)).add(side.clone().multiplyScalar(Math.sin(alpha) * a));
    const yAx = S.clone().sub(E).normalize(); // the bone runs along local -y
    const fore = T.clone().sub(E); let zAx = fore.clone().sub(yAx.clone().multiplyScalar(fore.dot(yAx))); if (zAx.lengthSq() < 1e-8) zAx = new THREE.Vector3(0, 0, 1).sub(yAx.clone().multiplyScalar(yAx.z)); zAx.normalize();
    const xAx = new THREE.Vector3().crossVectors(yAx, zAx).normalize();
    sh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAx, yAx, zAx));
    el.rotation.set(-bend, 0, 0);
    sh.updateMatrixWorld(true);
  }
  function handWorld(f, i) { const h = f.userData.objRig.hands[i]; h.updateWorldMatrix(true, false); return h.getWorldPosition(_v()); }
  // Leg solve in the leg's own plane: hip at height Hh above the floor, ankle aimed at (zf, foot height). Returns hipX, knee, ank.
  function legIK(Hh, zf, toe, fy) {
    const a = RIG.thigh, b = RIG.shin, dy = (fy === undefined ? RIG.foot : fy) - Hh, D = Math.min(Math.max(Math.hypot(zf, dy), .15), a + b - .002);
    const gam = Math.atan2(zf, -dy), al = Math.acos(Math.min(1, Math.max(-1, (a * a + D * D - b * b) / (2 * a * D))));
    const th = gam + al, k = Math.PI - Math.acos(Math.min(1, Math.max(-1, (a * a + b * b - D * D) / (2 * a * b))));
    return { hipX: -th, knee: k, ank: th - k + (toe || 0) };
  }
  // ---------- the use spec: one row per object (by its menu name), driving every pose ----------
  // kind: stand | sit | recline | lie | floor | squat | swim | ride | row | slide.  soft: how far a soft seat may give (m, beanbag
  // at most .08). hands: object (both hands on the thing used) | none | cup (to the mouth) | book | pad.  gap: clearance from the
  // object's face when standing.  cap: how many people use it at once.  Seat tops, floors and backrests come from ray casts on
  // the object's own meshes when it is used, never from typed heights.
  const USE_SPEC = {
    'บีนแบ็ก': { kind: 'sit', soft: .03, hipFront: .38, perch: true }, 'โซฟา': { kind: 'sit', soft: .02, cap: 3 }, 'อาร์มแชร์': { kind: 'sit', soft: .02, hands: 'book' },
    'เก้าอี้นวดไฟฟ้า': { kind: 'sit', soft: .02, legs: 'rest' }, 'เก้าอี้สุขภาพรุ่นท็อป': { kind: 'sit', soft: .01 }, 'เก้าอี้เพื่อสุขภาพ': { kind: 'sit', soft: .01 },
    'เก้าอี้บาร์': { kind: 'sit', hands: 'cup', perch: true }, 'เก้าอี้สตูล': { kind: 'sit', perch: true }, 'ที่นั่งรอ': { kind: 'sit' }, 'ม้านั่งริมทาง': { kind: 'sit', cap: 2 },
    'เตียงอาบแดด': { kind: 'recline', hipZ: .5 }, 'โต๊ะญี่ปุ่นมุมอ่านหนังสือ': { kind: 'floor', cushions: true, hands: 'book', cap: 4 },
    'เตียงคิงไซซ์': [{ kind: 'lie', hipZ: 1.35 }, { kind: 'recline', hipZ: .68 }], 'ทีวีห้องงีบ': { kind: 'recline', hipZ: .68, via: 'เตียงคิงไซซ์', viaAct: 1 },
    'ทีวีและโฮมเธียเตอร์': { kind: 'floor', front: 2.1, hands: 'pad' }, 'PS5': { kind: 'floor', front: 2.1, hands: 'pad', via: 'ทีวีและโฮมเธียเตอร์', viaAct: 1 },
    'สระว่ายน้ำ': [{ kind: 'swim', cap: 3 }, { kind: 'stand', hands: 'none', gap: .45, cap: 3 }], 'สไลเดอร์': { kind: 'slide' }, 'เรือไม้': { kind: 'row' },
    'สะพานไม้': { kind: 'stand', hands: 'none', at: true, cap: 2 }, 'จักรยานไฟฟ้า': { kind: 'ride' },
    'ต้นจามจุรี': { kind: 'floor', trunk: true }, 'ต้นราชพฤกษ์': { kind: 'floor', trunk: true }, 'ต้นไม้ริมทาง': { kind: 'floor', trunk: true }, 'ต้นชมพูพันธุ์ทิพย์': { kind: 'floor', trunk: true },
    'ต้นไม้ใหญ่': { kind: 'stand', hands: 'none', gap: .9 }, 'หุ่นยนต์ดูดฝุ่น': { kind: 'squat' }, 'พุ่มไม้': { kind: 'stand' },
    'MacBook': { kind: 'desk', r: 1.1 }, 'จอมอนิเตอร์': { kind: 'desk', r: 1.2 }, 'คีย์บอร์ด': { kind: 'desk', r: 1.1 }, 'แก้วกาแฟ': { kind: 'desk', r: 1.2, hands: 'cup' },
    'โต๊ะอาหาร': { kind: 'desk', r: 1.8, cap: 4 }, 'โคมไฟตั้งพื้น': { kind: 'desk', r: 1.6, hands: 'book' }, 'ภาพศิลปะ': { kind: 'stand', hands: 'none', gap: .8 },
    'ชั้นหนังสือ': { kind: 'stand', hands: 'object', after: 'book' }, 'เกาะครัว': { kind: 'stand', cap: 3 }
  };
  const NO_HANDS = new Set(['คาเฟ่ Bean Bridge', 'Riverside Co-working', 'มินิมาร์ท', 'ตึกสำนักงาน', 'ร้านดอกไม้', 'อพาร์ตเมนต์', 'ร้านอาหาร', 'บ้านริมน้ำ', 'ลานจอดเฮลิคอปเตอร์',
    'เฮลิคอปเตอร์', 'บึงบัว', 'น้ำพุ', 'ทีวีห้องประชุม', 'พัดลมฟอกอากาศ', 'สะพานไม้',
    'ห้องน้ำชาย', 'ห้องน้ำหญิง', 'ห้องน้ำชาย (สระ)', 'ห้องน้ำหญิง (สระ)', 'โถปัสสาวะชาย', 'ตู้อาบน้ำ', 'ฝักบัวริมสระ']); // walked into, not handled
  const NOT_OBJECTS = new Set(['คนเดินผ่าน']); // people, not objects: never scheduled as a thing to use
  function specFor(ix, k) {
    let s = USE_SPEC[ix.name]; if (Array.isArray(s)) s = s[k] || s[0];
    const a = ix.acts[k] || {}, o = Object.assign({}, s || {});
    if (!o.kind) o.kind = a.how === 'sit' ? 'sit' : a.pose === 'sit' ? 'sit' : a.pose === 'type' ? 'desk' : 'stand';
    if (o.kind === 'desk' && !o.r) o.r = 1.4;
    if (!o.hands) o.hands = o.kind === 'stand' ? (NO_HANDS.has(ix.name) || a.how === 'at' ? 'none' : 'object') : 'none';
    if (!o.cap) o.cap = a.spread ? 3 : 1;
    return o;
  }
  const USE = { rolled: new Map(), usage: new Map(), plans: new Map(), ground: new Map(), solid: null, hash: null, dirty: false, seatHolder: new Map(), lastUse: new Map(), probe: null, batched: null, cycle: null };
  // every mesh of an object, including the originals a static batch hid (they still answer ray casts)
  function batchedSet() { if (!USE.batched) USE.batched = new Set(BATCH.list.map(x => x.o)); return USE.batched; }
  function partsOf(root, solidOnly) {
    const out = [], bs = batchedSet();
    root.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || (o.userData.batch && !isOwnMerge(o, root))) return;
      if (o.material && (o.material.alphaTest > 0 || (solidOnly && o.material.transparent && o.material.opacity < .3))) return;
      for (let a = o; a && a !== root.parent; a = a.parent) if (!a.visible && !(a === o && bs.has(o))) return;
      out.push(o);
    });
    return out;
  }
  const isOwnMerge = (m, root) => { for (let a = m.parent; a; a = a.parent) if (a === root) return true; return false; };
  function useRoot(ix) { const o = ix.obj; return o.userData.movable ? o : o.parent && o.parent.userData.movable ? o.parent : o; }
  function boxLocal(root, parts) {
    root.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), b = new THREE.Box3(), t = new THREE.Box3(), m4 = new THREE.Matrix4();
    (parts || partsOf(root, true)).forEach(m => { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); t.copy(m.geometry.boundingBox).applyMatrix4(m4.multiplyMatrices(inv, m.matrixWorld)); b.union(t); });
    return b;
  }
  function boxWorld(parts) { const b = new THREE.Box3(), t = new THREE.Box3(); parts.forEach(m => { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); t.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld); b.union(t); }); return b; }
  const RC = { r: null };
  function cast(meshes, o, d, far, minNy) {
    const rc = RC.r || (RC.r = new THREE.Raycaster());
    rc.set(o, d); rc.far = far || 5; rc.near = 0;
    const hits = rc.intersectObjects(meshes, false);
    for (const h of hits) {
      if (minNy !== undefined && h.face) { const n = h.face.normal.clone().transformDirection(h.object.matrixWorld); if (d.y < 0 ? n.y < minNy : false) continue; }
      return h;
    }
    return null;
  }
  // every solid piece of the map, people and moving vehicles left out, in a 2 m grid for quick neighbour queries
  function solidList() {
    if (USE.solid && !USE.dirty) return USE.solid;
    USE.dirty = false; USE.batched = null;
    const skip = new Set([three.people]); (three.npcs || []).forEach(n => { skip.add(n.f); if (n.dog) skip.add(n.dog); }); (three.cars || []).forEach(c => skip.add(c.g)); (three.cyclists || []).forEach(c => skip.add(c.g));
    if (three.heli) skip.add(three.heli.h); if (three.sky) skip.add(three.sky); if (three.rain) skip.add(three.rain); if (three.snow) skip.add(three.snow); if (three.leaves) skip.add(three.leaves);
    const bs = batchedSet(), list = [];
    three.scene.updateMatrixWorld(true);
    three.scene.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh) return;
      // v60: any person holder (userData.char) is left out too, wherever it stands: the park's walkers and tourists sat in
      // no skip list, and a Quaternius skinned mesh's quantized geometry box times its node matrix spans 20-200 m, which
      // filled the office with phantom furniture and refused every seat drag
      for (let a = o; a; a = a.parent) if (skip.has(a) || a.userData.pid !== undefined || a.userData.char) return;
      if (o.userData.batch) { let own = false; for (let a = o.parent; a; a = a.parent) if (a.userData.movable || a.userData.ix !== undefined || a.userData.model) { own = true; break; } if (!own) return; }
      if (o.material && o.material.alphaTest > 0) return;
      for (let a = o; a; a = a.parent) if (!a.visible && !(a === o && bs.has(o))) return;
      let mov = false; for (let a = o; a; a = a.parent) if (a.userData.movable) { mov = true; break; }
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      list.push({ o, mov, box: new THREE.Box3().copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld), inv: new THREE.Matrix4().copy(o.matrixWorld).invert() });
    });
    const hash = new Map(), C = 2, key = (i, j) => i + ',' + j;
    list.forEach((e, n) => { if (e.mov) return; const b = e.box; for (let i = Math.floor(b.min.x / C); i <= Math.floor(b.max.x / C); i++) for (let j = Math.floor(b.min.z / C); j <= Math.floor(b.max.z / C); j++) { const k = key(i, j); if (!hash.has(k)) hash.set(k, []); hash.get(k).push(n); } });
    USE.solid = list; USE.hash = { map: hash, C, key }; USE.ground.clear();
    return list;
  }
  function solidNear(x, z, r) {
    const L = solidList(), H = USE.hash, out = new Set();
    for (let i = Math.floor((x - r) / H.C); i <= Math.floor((x + r) / H.C); i++) for (let j = Math.floor((z - r) / H.C); j <= Math.floor((z + r) / H.C); j++) (H.map.get(H.key(i, j)) || []).forEach(n => out.add(L[n]));
    L.forEach(e => { if (e.mov) { e.o.updateWorldMatrix(true, false); e.box.copy(e.o.geometry.boundingBox).applyMatrix4(e.o.matrixWorld); e.inv.copy(e.o.matrixWorld).invert(); if (e.box.distanceToPoint(new THREE.Vector3(x, e.box.min.y, z)) < r) out.add(e); } });
    return [...out];
  }
  // the walking surface: the floor plate inside, a cached ray cast outside (fixes people floating 8 cm over every outdoor surface)
  const inPlate = (x, z) => x > 0 && x < 19 * K && z > 0 && z < 12 * K;
  function groundAt(x, z, hint, exact, ignore) {
    const plate = inPlate(x, z) ? .08 + floorY(x, z) : null;
    const base = plate !== null && hint === undefined ? plate : (hint || 0), from = plate !== null && hint === undefined ? plate + .35 : Math.max(2.0, base + .6);
    const key = Math.round(x / .2) + ',' + Math.round(z / .2) + ',' + Math.round(from * 2);
    if (!exact && !ignore && USE.ground.has(key)) return USE.ground.get(key);
    // only what people walk on counts as ground: floors, decks, pavers, treads, rugs and the terrain (a thin slab near the floor,
    // anything at least 1.6 m across both ways, or flagged walkable); a planter, a bench or a table top is never stood on
    const walk = e => { const b = e.box; if (b.max.y - b.min.y <= .2 && b.min.y < Math.max(base, 0) + .4) return true; if (Math.min(b.max.x - b.min.x, b.max.z - b.min.z) >= 1.6) return true; for (let a = e.o; a; a = a.parent) if (a.userData.walkable) return true; return false; };
    const near = solidNear(x, z, .6).filter(e => walk(e) && !(ignore && ignore.has(e.o))).map(e => e.o);
    const h = cast(near, new THREE.Vector3(x, from, z), new THREE.Vector3(0, -1, 0), from + 3, .55);
    const y = h ? Math.max(h.point.y, plate !== null ? plate : -Infinity) : (plate !== null ? plate : 0);
    if (!exact && !ignore) USE.ground.set(key, y); return y;
  }
  // is a world point inside a mesh: its own box, or the ellipse or round section of a sphere or cylinder (as the audit tests)
  function insideMesh(e, p) {
    const g = e.o.geometry, q = p.clone().applyMatrix4(e.inv), bb = g.boundingBox;
    if (!bb.containsPoint(q)) return false;
    const t = g.type, c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3()).multiplyScalar(.5);
    if (t === 'SphereGeometry' || t === 'IcosahedronGeometry') return (q.x - c.x) ** 2 / s.x ** 2 + (q.y - c.y) ** 2 / s.y ** 2 + (q.z - c.z) ** 2 / s.z ** 2 <= 1;
    if (t === 'CylinderGeometry' || t === 'CapsuleGeometry' || t === 'ConeGeometry') return (q.x - c.x) ** 2 / s.x ** 2 + (q.z - c.z) ** 2 / s.z ** 2 <= 1;
    if (/Plane|Circle|Shape|Torus|Tube|Lathe|Ring|Extrude/.test(t)) return false;
    return true;
  }
  // a standing body as a capsule of 45 points; blocked when a piece of furniture (not the floor) is inside it
  function standBlocked(x, y, z, ignore, ry) {
    const near = solidNear(x, z, .9).filter(e => !(ignore && ignore.has(e.o)) && e.box.max.y > y + .03 && e.box.min.y < y + 1.75 && !(e.box.max.y - e.box.min.y < .06 && e.box.max.y < y + .2));
    const v = new THREE.Vector3();
    // the soles too (heel and toe of each foot, 3.5 cm up): a plinth or a step at foot height blocks the spot
    // (the whole shoe: heel to toe tip, both edges, at the sole and the instep, so a pot beside a toe is not stepped into)
    if (ry !== undefined) { const fw = [Math.sin(ry), Math.cos(ry)], sd = [-fw[1], fw[0]]; for (const s of [-.15, -.1, -.05, .05, .1, .15]) for (const t of [-.09, .04, .17, .21]) for (const hy of [.02, .08]) { v.set(x + sd[0] * s + fw[0] * t, y + hy, z + sd[1] * s + fw[1] * t); for (const e of near) if (e.box.containsPoint(v) && insideMesh(e, v)) return e.o; } }
    for (const hy of [.2, .55, .95, 1.3, 1.62]) for (let k = 0; k <= 8; k++) {
      const a = k / 8 * Math.PI * 2, r = k === 8 ? 0 : (hy > 1.5 ? .12 : .17);
      v.set(x + Math.cos(a) * r, y + hy, z + Math.sin(a) * r);
      for (const e of near) if (e.box.containsPoint(v) && insideMesh(e, v)) return e.o;
    }
    return null;
  }
  // the probe: one unseen figure posed exactly like the real one, so poses are solved against the real geometry
  function probe(T, q) {
    const f = USE.probe || (USE.probe = makeRig('dev', 0));
    f.position.set(T.x, T.y, T.z); f.rotation.set(0, T.ry, 0); applyPose(f, q); f.updateMatrixWorld(true); return f;
  }
  const worldOf = (o, x, y, z) => { o.updateWorldMatrix(true, false); return new THREE.Vector3(x, y, z).applyMatrix4(o.matrixWorld); };
  const down = () => new THREE.Vector3(0, -1, 0);
  // the highest seat surface under a world point, on the object's own meshes
  function seatTopAt(parts, x, z, from) { const h = cast(parts, new THREE.Vector3(x, from, z), down(), from + 1, .5); return h ? h.point.y : null; }
  // sole height of a foot pointed down by beta (the toe reaches lowest)
  const toeDrop = beta => .07 * Math.cos(beta) + RIG.toe * Math.sin(beta);
  // Sit on a seat surface: pelvis on the surface (soft seats give by `soft`), thighs level to the seat edge, feet flat on the
  // floor (or the toes when the seat is high, or the leg rest), back leaned until it meets the backrest.
  function solveSit(parts, at, fwd, opt) {
    const side = new THREE.Vector3(-fwd.z, 0, fwd.x), P = (dx, dz) => at.clone().add(side.clone().multiplyScalar(dx)).add(fwd.clone().multiplyScalar(dz));
    const top0 = boxWorld(parts).max.y + .05;
    let seat = -Infinity; [[0, 0], [-.09, .06], [.09, .06], [0, .1]].forEach(([dx, dz]) => { const p = P(dx, dz), s = seatTopAt(parts, p.x, p.z, opt.from !== undefined ? opt.from : top0); if (s !== null) seat = Math.max(seat, s); });
    if (seat === -Infinity) return null;
    // the seat edge: how far forward the surface stays within 3 cm of the seat height
    let edge = .05; for (let dz = .1; dz <= .6; dz += .05) { const p = P(0, dz), s = seatTopAt(parts, p.x, p.z, opt.from !== undefined ? opt.from : top0); if (s === null || seat - s > .03) break; edge = dz; }
    // perched on a stool: the pelvis moves to the seat's front edge so the thighs leave the seat at once and slope to the floor
    // (the hip joint at the edge itself: the thigh roots rest on the rim and slope away, the seat behind carries the pelvis)
    if (opt.perch === true && edge > .1) return solveSit(parts, at.clone().add(fwd.clone().multiplyScalar(edge - .01)), fwd, Object.assign({}, opt, { perch: 'done' }));
    // the floor under the feet: the highest ground under either heel or toe (a kerb under the toes is stood on, not stood in)
    let floor = opt.floorY;
    // (the seat's own base, a five-star foot or a recliner's plinth, is never the floor)
    if (floor === undefined) { const own = new Set(parts); floor = -Infinity; [-.1, .1].forEach(dx => [.35, .45, .62].forEach(dz => { const p = P(dx, dz); floor = Math.max(floor, groundAt(p.x, p.z, opt.groundHint, true, own)); })); }
    // the feet stand clear of the seat's own base at floor level (a five-star base, a beanbag's lower bulge)
    // (cast at every height the shins pass, up to 15 cm under the seat: a beanbag bulges most at its middle, not at the floor)
    { let zm = 0; for (let y = .1; y <= Math.max(.1, seat - floor - .15); y += .08) { const o = P(0, 1.3); o.y = floor + y; const h = cast(parts, o, fwd.clone().negate(), 1.3); if (h) zm = Math.max(zm, 1.3 - h.distance + .1); } opt = Object.assign({}, opt, { zfMin: zm }); }
    const sink = Math.min(opt.soft || 0, .08);
    const q = poseOf('stand'); q.py = seat - sink + .075 - floor; q.blob = 0;
    q.shX = [-.25, -.25]; q.elX = [-.95, -.95]; q.shZ = [-.1, .1];
    const T = { x: at.x, y: floor, z: at.z, ry: Math.atan2(fwd.x, fwd.z) };
    solveLegs(q, edge, opt);
    // the deepest point of the pelvis and thighs rests exactly on the seat (a soft seat gives by at most `sink`, capped at 2 cm)
    // (a hard seat is met 2 mm above its top, so the contact never rounds to just under the surface)
    const give = Math.min(sink, .02), aim = give > 0 ? -give : .002;
    for (let it = 0; it < 6; it++) { const g = contactGap(parts, T, q); if (g === null || Math.abs(g - aim) < .002) break; q.py -= g - aim; solveLegs(q, edge, opt); }
    if (opt.legs === 'rest') restLegs(parts, T, q);
    leanBack(parts, T, q, opt.maxLean || .55);
    return { T, q, seat, floor, edge };
  }
  // legs for a pelvis at q.py above the floor under the feet
  function solveLegs(q, edge, opt) {
    const Hh = q.py, a = RIG.thigh, b = RIG.shin, foot = RIG.foot;
    q.hipZ = [0, 0];
    if (opt.legs === 'straight') { q.hipX = [-Math.PI / 2, -Math.PI / 2]; q.knee = [0, 0]; q.ank = [0, 0]; return; }
    // a leg rest carries the calves: thighs level along the seat, the knee is then opened onto the rest (restLegs)
    if (opt.legs === 'rest') { q.hipX = [-Math.PI / 2, -Math.PI / 2]; q.knee = [Math.PI / 2, Math.PI / 2]; q.ank = [0, 0]; return; }
    if (Hh - foot - b >= -.005) {
      // high seat: thighs level (tilting down only past the seat edge, or freely when perched on a stool), shins plumb, then the toes
      const need = Math.asin(Math.min(1, Math.max(0, (Hh - foot - b) / a))), tmax = opt.perch ? need : edge > .44 ? .02 : Math.asin(Math.min(1, .03 / Math.max(edge, .1)));
      const tau = Math.min(need, Math.max(tmax, 0)), th = Math.PI / 2 - tau, gap = Hh - a * Math.sin(tau) - b;
      let beta = 0; if (gap - foot > .003) { let lo = 0, hi = 1.3; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (toeDrop(m) < gap) lo = m; else hi = m; } beta = (lo + hi) / 2; }
      q.hipX = [-th, -th]; q.knee = [th, th]; q.ank = [beta, beta];
      // plumb shins would put the feet on the seat's base: angle them forward to clear it
      // (pointed toes too: a foot hanging over a beanbag's lower bulge would sink into it, so it goes to the floor beyond it)
      if (opt.zfMin && a * Math.sin(th) < opt.zfMin) { const L = legIK(Hh, opt.zfMin, 0); q.hipX = [L.hipX, L.hipX]; q.knee = [L.knee, L.knee]; q.ank = [L.ank, L.ank]; }
      return;
    }
    // low seat (beanbag, cushion, sofa): knees up, feet flat on the floor ahead of the seat edge and clear of its base
    const dy = Hh - foot, zf = Math.min(.85, Math.max(edge + .12, opt.zfMin || 0, Math.sqrt(Math.max(.03, (.86 * (a + b)) ** 2 - dy * dy))));
    const L = legIK(Hh, zf, 0); q.hipX = [L.hipX, L.hipX]; q.knee = [L.knee, L.knee]; q.ank = [L.ank, L.ank]; q.hipZ = [-.06, .06];
  }
  // lowest point of the pelvis and the thigh undersides minus the seat surface under it (null when nothing is under them)
  function contactGap(parts, T, q) {
    const f = probe(T, q), R = f.userData.objRig, pts = [[0, -.04, 0], [-.1, -.04, 0], [.1, -.04, 0], [0, -.04, -.08]].map(([x, y, z]) => worldOf(R.P, x, y, z));
    // the thigh's whole length (root ring to knee ring) on its lower five sides: a thigh crossing a rim or a beanbag's rising
    // front touches between its ends, so the ends alone miss it
    R.hips.forEach(h => [0, .12, .3, .5, .7, .85, 1].forEach(t => { const r = .075 + (.066 - .075) * t; [-.75, -.4, 0, .4, .75].forEach(a => pts.push(worldOf(h, Math.sin(a) * r, -RIG.thigh * t, -Math.cos(a) * r))); }));
    let g = null; pts.forEach(p => { const h = cast(parts, p.clone().add(V3(0, .3, 0)), down(), .75); if (!h) return; const d = p.y - h.point.y; if (g === null || d < g) g = d; });
    return g;
  }
  // sitting on the ground: the lowest of the pelvis underside and the thigh surface (whole length, 8 sides) above the ground under it
  function seatGap(T, q) {
    const f = probe(T, q), R = f.userData.objRig, pts = [[0, -.04, 0], [-.1, -.04, 0], [.1, -.04, 0], [0, -.04, -.08]].map(([x, y, z]) => worldOf(R.P, x, y, z));
    R.hips.forEach(h => [0, .25, .5, .75, 1].forEach(t => { const r = .075 + (.066 - .075) * t; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; pts.push(worldOf(h, Math.sin(a) * r, -RIG.thigh * t, Math.cos(a) * r)); } }));
    let g = Infinity; pts.forEach(p => { g = Math.min(g, p.y - groundAt(p.x, p.z)); });
    return g;
  }
  // calves on a sloped leg rest: open the knee until the calf meets the rest
  function restLegs(parts, T, q) {
    // (the feet stay square to the shins, so the soles face forward and the toes point away from the rest)
    // the lowest of the calf and the heel corners of the shoe (the heel reaches the rest before the calf does)
    const gapAt = k => {
      q.knee = [k, k]; q.ank = [0, 0]; const f = probe(T, q), R = f.userData.objRig, pts = [[worldOf(R.knees[0], 0, -RIG.shin * .55, 0), .058]];
      R.ankles.forEach(a => [-.055, .055].forEach(x => [-.07, 0].forEach(y => pts.push([worldOf(a, x, y, -.075), 0]))));
      let g = 1; pts.forEach(([m, off]) => { const h = cast(parts, m.clone().add(new THREE.Vector3(0, .25, 0)), down(), .8); if (h) g = Math.min(g, m.y - off - h.point.y); });
      return g;
    };
    let lo = .05, hi = Math.PI / 2;
    if (gapAt(hi) > 0) return; // no rest under the calf: leave the legs as solved
    for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (gapAt(m) > 0) lo = m; else hi = m; }
    gapAt(lo);
  }
  // lean the spine back until the torso meets the backrest (0 to 2 cm), or sit forward when the backrest is closer than the back
  // what is behind a point of the back, cast from 30 cm in front of it so a backrest the body has already gone into is still
  // found (a ray that starts inside a mesh sees none of its faces); the distance returned is from the point itself
  function backCast(parts, c, n) { const h = cast(parts, c.clone().addScaledVector(n, -.3), n, 1.2); return h ? { distance: h.distance - .3, point: h.point } : null; }
  function leanBack(parts, T, q, maxLean) {
    // the gap is the nearest of the back's points to whatever is behind them: the seat's own back, and the room behind it (the
    // wall behind a bed's headboard), so a reclining head never goes through a wall; the head is then settled by the neck
    const own = new Set(parts), behind = parts.concat(solidNear(T.x, T.z, 1.6).map(e => e.o).filter(o => !own.has(o)));
    const backN = R => worldOf(R.S, 0, .52, -1).sub(worldOf(R.S, 0, .52, 0)).normalize();
    const gapAt = sx => {
      q.sx = sx; const f = probe(T, q), R = f.userData.objRig, S = R.S, n = backN(R); let g = null;
      // chest, shoulder blades, both shoulders, and the back of the head less 5 cm (the neck can tip the head that far forward)
      [[worldOf(S, 0, .52, 0), RIG.torsoHalf], [worldOf(S, 0, .66, 0), .1], [worldOf(S, -.17, .65, 0), .095], [worldOf(S, .17, .65, 0), .095], [worldOf(R.H, 0, .17, 0), .08]].forEach(([c, half]) => { const h = backCast(behind, c, n); if (h) { const d = h.distance - half; if (g === null || d < g) g = d; } });
      // (only when nothing is behind the chest: the small of the back, for a park bench whose backrest ends below the chest)
      if (g === null) { const h = backCast(behind, worldOf(S, 0, .25, 0), n); if (h) g = h.distance - RIG.torsoHalf; }
      return g;
    };
    const settleNeck = () => {
      // tip the head forward (or back) the least that keeps the back of the head off the headrest
      const headGap = hx => { q.hx = hx; const f = probe(T, q), R = f.userData.objRig, h = backCast(behind, worldOf(R.H, 0, .17, 0), backN(R)); return h ? h.distance - .13 : 1; };
      const hx0 = q.hx || 0; if (headGap(hx0) >= 0) { q.hx = hx0; return; }
      for (let d = .05; d <= .8; d += .05) for (const s of [1, -1]) if (headGap(hx0 + s * d) >= .005) { q.hx = hx0 + s * d; return; }
      q.hx = hx0;
    };
    const g0 = gapAt(0); q.backGap = g0;
    if (g0 === null) { q.sx = 0; return; }
    if (g0 < 0) { const fw = new THREE.Vector3(Math.sin(T.ry), 0, Math.cos(T.ry)), m = Math.min(.14, -g0 + .005); T.x += fw.x * m; T.z += fw.z * m; q.sx = 0; settleNeck(); return; }
    if (g0 <= .02) { q.sx = 0; settleNeck(); return; }
    let lo = -maxLean, hi = 0; const gl = gapAt(lo);
    // (the back was found upright, so losing it further back means the chest went through it, never that it vanished)
    if (gl !== null && gl > .02) { q.sx = lo; settleNeck(); return; }
    for (let i = 0; i < 16; i++) { const m = (lo + hi) / 2, g = gapAt(m); if (g !== null && g > .01) hi = m; else lo = m; }
    q.sx = (lo + hi) / 2; settleNeck();
  }
  // ---------- plans: where a person's feet go and how every joint sits, for each kind of use ----------
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  function objFwd(ix, a) {
    const o = ix.obj, q = new THREE.Quaternion(); o.updateWorldMatrix(true, false); o.getWorldQuaternion(q);
    if (a && a.dir) return V3(a.dir[0], 0, a.dir[1]).normalize();
    const f = V3(0, 0, 1).applyQuaternion(q).setY(0); return f.lengthSq() < 1e-6 ? V3(0, 0, 1) : f.normalize();
  }
  const ixPos = ix => { ix.obj.updateWorldMatrix(true, false); return ix.obj.getWorldPosition(V3(0, 0, 0)); };
  const sitAct = ix => ix.acts.findIndex(a => a.how === 'sit');
  const isSeat = ix => !NOT_OBJECTS.has(ix.name) && sitAct(ix) >= 0 && specFor(ix, sitAct(ix)).kind === 'sit';
  // the object's face toward `fwd`, in world space: centre, the face point, and its half depth
  function faceOf(root, parts, fwd) {
    const bl = boxLocal(root, parts), c = bl.getCenter(V3(0, 0, 0)), s = bl.getSize(V3(0, 0, 0)).multiplyScalar(.5);
    const qi = new THREE.Quaternion(); root.getWorldQuaternion(qi); qi.invert();
    const dl = fwd.clone().applyQuaternion(qi), h = Math.abs(dl.x) * s.x + Math.abs(dl.y) * s.y + Math.abs(dl.z) * s.z;
    const cw = root.localToWorld(c.clone()), ew = root.localToWorld(c.clone().add(dl.clone().multiplyScalar(h)));
    return { cw, ew, depth: Math.abs((ew.x - cw.x) * fwd.x + (ew.z - cw.z) * fwd.z), bw: boxWorld(parts) };
  }
  function standPose(T, kind) { const q = poseOf(kind === 'type' ? 'type' : 'stand'); return q; }
  // stand in front of the object, clear of every piece of furniture, facing its centre; hands on it when the use is manual
  function planStand(ix, aIdx, sp, slot, hint) {
    const a = ix.acts[aIdx] || {}, root = useRoot(ix), parts = partsOf(root, true); if (!parts.length) return null;
    const fwd = objFwd(ix, a), side = V3(-fwd.z, 0, fwd.x), n = slot === undefined ? 0 : (slot % 3) - 1;
    let base, look;
    if (sp.at || a.how === 'at' || a.how === 'beside') { const s0 = ixSpot(ix, a, slot || 0); base = V3(s0.x, 0, s0.y); look = V3(s0.look.x, 0, s0.look.y); }
    else { const F = faceOf(root, parts, fwd), gap = sp.gap !== undefined ? sp.gap : sp.hands === 'object' ? .24 : .5; base = F.cw.clone().add(fwd.clone().multiplyScalar(F.depth + gap)).add(side.clone().multiplyScalar(n * (a.spread || 0))); base.y = 0; look = F.cw.clone(); }
    // the highest ground under either sole (heel and toe), cast exactly, so no part of a shoe sinks on a slope or a step
    const yAt = (x, z) => { const fw2 = V3(look.x - x, 0, look.z - z); if (fw2.lengthSq() < 1e-6) fw2.copy(fwd).negate(); fw2.normalize(); const sd2 = V3(-fw2.z, 0, fw2.x); let y = -Infinity; [-.1, .1].forEach(s => [-.07, .17].forEach(t => { y = Math.max(y, groundAt(x + sd2.x * s + fw2.x * t, z + sd2.z * s + fw2.z * t, hint, true)); })); return y; };
    // the nearest free spot to the ideal one: candidates ordered by how far they move (beside a chair before behind it)
    let best = null;
    const ig = new Set(), cand = [];
    for (const back of [0, .05, .1, .15, .2, .3, .4, .55, .7]) for (const lat of [0, .12, -.12, .25, -.25, .4, -.4, .55, -.55, .7, -.7]) cand.push([back, lat, Math.hypot(back, lat * .9)]);
    cand.sort((a, b) => a[2] - b[2]);
    for (const [back, lat] of cand) {
      const p = base.clone().add(fwd.clone().multiplyScalar(back)).add(side.clone().multiplyScalar(lat)), y = yAt(p.x, p.z), ry = Math.atan2(look.x - p.x, look.z - p.z);
      if (!standBlocked(p.x, y, p.z, ig, ry)) { best = { p, y }; break; }
    }
    if (!best) best = { p: base, y: yAt(base.x, base.z) };
    const T = { x: best.p.x, y: best.y, z: best.p.z, ry: Math.atan2(look.x - best.p.x, look.z - best.p.z) };
    const plan = { kind: 'stand', T, q: poseOf('stand'), ix: [ix.obj.userData.ix], ik: [], facesObject: !(sp.at || a.how === 'at' || a.how === 'beside') };
    if (sp.hands === 'object') reachObject(plan, parts, partsOf(root));
    if (sp.after === 'book') plan.q.hold = 'book';
    return plan;
  }
  // both hands to the object's surface at a working height; step in (if the floor is free) or squat when it is out of reach
  // hands on the object: the nearer of its face at waist-to-chest height and its top just inside the front edge (glass doors count);
  // step in while the floor is free, then lean forward from the hips; squat only for things lower than 60 cm
  function reachObject(plan, parts, allParts) {
    const T = plan.T, bw = boxWorld(parts), toObj = V3(Math.sin(T.ry), 0, Math.cos(T.ry)), hitParts = allParts && allParts.length ? allParts : parts;
    let low = bw.max.y - T.y < .6;
    const squat = (topY) => { plan.kind = 'squat'; const q = plan.q, py = Math.min(.8, Math.max(.42, topY - T.y + .42 - .55)), L = legIK(py, .2, 0); q.py = py; q.hipX = [L.hipX, L.hipX]; q.knee = [L.knee, L.knee]; q.ank = [L.ank, L.ank]; q.sx = .35; q.hipZ = [-.12, .12]; q.blob = 1; };
    if (low) squat(bw.max.y);
    let targets = [], squatTried = low;
    for (let pass = 0; pass < 24; pass++) {
      const f = probe(T, plan.q), R = f.userData.objRig; targets = [];
      for (let i = 0; i < 2; i++) {
        // the working height: 30 cm under the shoulder when squatting (a dishwasher's door, an oven handle), 22 cm under it standing
        // (chest height: the forearms meet a door or a front square on, instead of sloping into it)
        const sh = worldOf(R.shs[i], 0, 0, 0), ht = Math.min(Math.max(low ? sh.y - .3 : sh.y - .22, bw.min.y + .04), bw.max.y - .02), cands = [];
        const h1 = cast(hitParts, V3(sh.x, ht, sh.z), toObj.clone(), 1.4); if (h1 && h1.point.y < T.y + 1.6) cands.push(h1);
        // the top surface nearest the body: scanned forward in 3 cm steps from 30 cm behind the shoulder, then 6 cm in from that edge
        { const top = Math.min(bw.max.y + .05, T.y + 1.6), at = d => { const p = V3(sh.x, 0, sh.z).add(toObj.clone().multiplyScalar(d)); return cast(hitParts, V3(p.x, top, p.z), down(), 2, .5); };
          for (let d = -.3; d <= .9; d += .03) { const e = at(d); if (e && e.point.y < sh.y) { const h2 = at(d + .06) || e; if (h2.point.y < sh.y) cands.push(h2); break; } } }
        if (!cands.length) { targets.push(null); continue; }
        const h = cands.sort((a, b) => sh.distanceTo(a.point) - sh.distanceTo(b.point))[0], n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : toObj.clone().negate();
        targets.push({ p: h.point.clone().add(n.multiplyScalar(.03)), d: sh.distanceTo(h.point) });
      }
      const far = Math.max(...targets.map(t => t ? t.d : 0)), lowest = Math.min(...targets.filter(Boolean).map(t => t.p.y));
      if (far <= .56) break;
      // what the hands need is below waist height: squat to it instead of folding over
      if (!squatTried && isFinite(lowest) && lowest < T.y + .6) { squatTried = true; low = true; squat(lowest); continue; }
      // step in by up to 12 cm at a time while the floor and the body stay clear, then lean from the hips
      if (pass < 8 && !plan.noStep) { const step = Math.min(far - .5, .12), nx = T.x + toObj.x * step, nz = T.z + toObj.z * step, ny = groundAt(nx, nz, undefined, true); if (!standBlocked(nx, ny, nz, null, T.ry) && !bodyBlocked({ x: nx, y: ny, z: nz, ry: T.ry }, plan.q)) { T.x = nx; T.z = nz; T.y = ny; continue; } plan.noStep = true; }
      if (plan.q.sx < .95) { const s0 = plan.q.sx; plan.q.sx = Math.min(.95, s0 + .12); if (!bodyBlocked(T, plan.q)) continue; plan.q.sx = s0; }
      // still short at a low counter or a basin: bend the knees (feet flat, up to 26 cm lower), as people do over a sink
      if (plan.kind !== 'squat' && (plan.q.py === undefined || plan.q.py > RIG.hip - .26)) { const q = plan.q, keep = { py: q.py, hipX: q.hipX.slice(), knee: q.knee.slice(), ank: q.ank.slice() }, py = (q.py === undefined ? RIG.hip : q.py) - .05, L = legIK(py, .06, 0); q.py = py; q.hipX = [L.hipX, L.hipX]; q.knee = [L.knee, L.knee]; q.ank = [L.ank, L.ank]; if (!bodyBlocked(T, q)) continue; Object.assign(q, keep); }
      break;
    }
    delete plan.noStep;
    // too close (the arms folded, the elbows into the front): step back until the nearer hand is 40 cm from the shoulder
    for (let k = 0; k < 4 && targets.some(Boolean); k++) { const f = probe(T, plan.q), R = f.userData.objRig, near = Math.min(...targets.map((t, i) => t ? worldOf(R.shs[i], 0, 0, 0).distanceTo(t.p) : 9)); if (near >= .4) break; const b = Math.min(.4 - near + .01, .1), nx = T.x - toObj.x * b, nz = T.z - toObj.z * b, ny = groundAt(nx, nz, undefined, true); if (standBlocked(nx, ny, nz, null, T.ry)) break; T.x = nx; T.z = nz; T.y = ny; }
    // a squat or a lean never puts knees or the chest into the furniture: step back until it is clear
    for (let k = 0; k < 6 && bodyBlocked(T, plan.q); k++) { T.x -= toObj.x * .05; T.z -= toObj.z * .05; }
    plan.ik = targets.map((t, i) => t ? { i, p: t.p } : null).filter(Boolean);
  }
  // points down the legs and the trunk inside any furniture (the target object included)
  function bodyBlocked(T, q) {
    const f = probe(T, q), R = f.userData.objRig, pts = [];
    R.hips.forEach(h => [.5, 1].forEach(t => pts.push(worldOf(h, 0, -RIG.thigh * t, .06))));
    R.knees.forEach(k => [0, .5].forEach(t => pts.push(worldOf(k, 0, -RIG.shin * t, .06))));
    [.25, .5, .7].forEach(y => pts.push(worldOf(R.S, 0, y, .14))); pts.push(worldOf(R.H, 0, .17, .12));
    const near = solidNear(T.x, T.z, 1.2).filter(e => !(e.box.max.y - e.box.min.y < .06 && e.box.max.y < T.y + .2));
    return pts.some(p => near.some(e => e.box.containsPoint(p) && insideMesh(e, p)));
  }
  // sit on a seat object (the seat's own menu action gives the spot and the facing)
  function planSit(seatIx, slot, sp, extra) {
    const ix = IX[seatIx], k = sitAct(ix) >= 0 ? sitAct(ix) : 0, a = ix.acts[k] || {}, root = useRoot(ix), parts = partsOf(root, true);
    const s0 = ixSpot(ix, a, slot || 0), fwd = objFwd(ix, a);
    let at = V3(s0.x, 0, s0.y);
    // a round soft seat (beanbag): sit toward its front, pouf style, so the feet reach the floor
    // (its reach forward is found by casting down along the facing until the top surface ends, not from a bounding box)
    if (sp.hipFront) { const c = root.getWorldPosition(V3(0, 0, 0)), top = boxWorld(parts).max.y + .05; let half = 0; for (let d = 0; d <= 1.5; d += .02) { const p = V3(c.x, 0, c.z).add(fwd.clone().multiplyScalar(d)); if (seatTopAt(parts, p.x, p.z, top) === null) break; half = d; } at = V3(c.x, 0, c.z).add(fwd.clone().multiplyScalar(Math.max(0, half - sp.hipFront))); }
    const opt = Object.assign({ soft: sp.soft, legs: sp.legs, perch: sp.perch }, extra || {});
    let r = solveSit(parts, at, fwd, opt);
    if (!r) return null;
    // no backrest: sit the way the legs are clear (a stool at a counter without knee room, a bench with a planter in front)
    if (r.q.backGap === null && sp.turn !== false) {
      const own = new Set(partsOf(root)); let best = { r, n: legsBlocked(r.T, r.q, own) };
      if (best.n > 0) for (const ang of [Math.PI / 2, -Math.PI / 2, Math.PI]) { const f2 = fwd.clone().applyAxisAngle(V3(0, 1, 0), ang), r2 = solveSit(parts, at, f2, opt); if (!r2) continue; const n = legsBlocked(r2.T, r2.q, own); if (n < best.n) best = { r: r2, n }; if (!n) break; }
      r = best.r;
    }
    return { kind: 'sit', T: r.T, q: r.q, ix: [seatIx], ik: [], seatIx, restLegs: sp.legs === 'rest' };
  }
  // how many points along the legs sit inside furniture other than the seat itself
  function legsBlocked(T, q, own) {
    // thighs may rest on the seat itself; shins and feet may not be inside anything, the seat included
    const f = probe(T, q), R = f.userData.objRig, thighs = [], lower = [];
    R.hips.forEach(h => [.5, .8, 1].forEach(t => thighs.push(worldOf(h, 0, -RIG.thigh * t, .03))));
    R.knees.forEach(k => [.3, .6, .9].forEach(t => lower.push(worldOf(k, 0, -RIG.shin * t, .03))));
    R.ankles.forEach(a => { lower.push(worldOf(a, 0, -.03, .15)); lower.push(worldOf(a, 0, -.05, -.05)); });
    const near = solidNear(T.x, T.z, 1.4).filter(e => !(e.box.max.y - e.box.min.y < .06 && e.box.max.y < T.y + .2));
    const hit = (p, withOwn) => near.some(e => (withOwn || !own.has(e.o)) && e.box.containsPoint(p) && insideMesh(e, p));
    let n = 0; thighs.forEach(p => { if (hit(p, false)) n++; }); lower.forEach(p => { if (hit(p, true)) n++; });
    return n;
  }
  // lie on the back (bed) or recline with straight legs against the backrest (bed head, sun lounger)
  function planLie(ix, sp, recline) {
    const root = useRoot(ix), parts = partsOf(root, true), bl = boxLocal(root, parts), fwd = objFwd(ix, null);
    const at = root.localToWorld(V3((bl.min.x + bl.max.x) / 2, 0, bl.min.z + (sp.hipZ || .6))); at.y = 0;
    const floor = groundAt(at.x, at.z, root.getWorldPosition(V3(0, 0, 0)).y), top0 = boxWorld(parts).max.y + .05;
    if (recline) {
      const r = solveSit(parts, at, fwd, { legs: 'straight', soft: .02, maxLean: 1.25, floorY: floor, from: top0 });
      if (!r) return null; r.q.shX = [-.1, -.1]; r.q.elX = [-.5, -.5]; r.q.shZ = [-.25, .25];
      settleLegs(parts, r.T, r.q);
      return { kind: 'recline', T: r.T, q: r.q, ix: [ix.obj.userData.ix], ik: [] };
    }
    const m = seatTopAt(parts, at.x, at.z, top0); if (m === null) return null;
    const q = poseOf('stand'); q.blob = 0; q.prx = -Math.PI / 2; q.py = m - .015 + .135 - floor; q.shZ = [-.14, .14]; q.elX = [-.15, -.15];
    const T = { x: at.x, y: floor, z: at.z, ry: Math.atan2(fwd.x, fwd.z) };
    settleLegs(parts, T, q); settleHead(parts, T, q);
    return { kind: 'lie', T, q, ix: [ix.obj.userData.ix], ik: [] };
  }
  // legs straight along a surface: tip the hips until the calves rest on it
  function settleLegs(parts, T, q) {
    // the lowest of the calf and every shoe corner (heels reach lowest when legs lie straight) against the surface under it
    const gapAt = v => {
      q.hipX = q.prx ? [v, v] : [-Math.PI / 2 + v, -Math.PI / 2 + v]; q.knee = [-v * .4, -v * .4];
      const f = probe(T, q), R = f.userData.objRig; let g = 1;
      R.knees.forEach((k, i) => {
        const pts = [worldOf(k, 0, -RIG.shin * .5, -.058), worldOf(k, 0, -RIG.shin * .5, .058)];
        [-.05, .05].forEach(x => [-.07, 0].forEach(y => [-.075, .175].forEach(z => pts.push(worldOf(R.ankles[i], x, y, z)))));
        pts.forEach(p => { const h = cast(parts, p.clone().add(V3(0, .3, 0)), down(), .9); if (h) g = Math.min(g, p.y - h.point.y); });
      });
      return g;
    };
    let lo = -.35, hi = .45; const glo = gapAt(lo), ghi = gapAt(hi);
    if ((glo > 0) === (ghi > 0)) { gapAt(Math.abs(glo) < Math.abs(ghi) ? lo : hi); return; }
    const sgnLo = glo > 0; for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if ((gapAt(m) > 0) === sgnLo) lo = m; else hi = m; }
    gapAt((lo + hi) / 2);
  }
  // head resting on the pillow: bend the neck until the back of the head meets what is under it
  function settleHead(parts, T, q) {
    const gapAt = v => { q.hx = v; const f = probe(T, q), H = f.userData.objRig.H, c = worldOf(H, 0, .17, 0), h = cast(parts, c.clone().add(V3(0, .4, 0)), down(), 1); return h ? c.y - .125 - h.point.y : 1; };
    let lo = -.3, hi = 1.0; if (gapAt(lo) * gapAt(hi) > 0) { q.hx = Math.abs(gapAt(lo)) < Math.abs(gapAt(hi)) ? lo : hi; return; }
    const sLo = gapAt(lo) > 0; for (let i = 0; i < 16; i++) { const m = (lo + hi) / 2; if ((gapAt(m) > 0) === sLo) lo = m; else hi = m; }
    q.hx = (lo + hi) / 2;
  }
  // on the floor: cross-legged on a cushion (the reading table, the game corner) or knees up against a tree trunk
  function planFloor(ix, aIdx, sp, slot) {
    const root = useRoot(ix), parts = partsOf(root, true); let at, fwd, lookAt = null, trunk = null;
    if (sp.cushions) { const cs = [[-.85, 0], [.85, 0], [0, -.6], [0, .6]][(slot || 0) % 4]; at = root.localToWorld(V3(cs[0], 0, cs[1])); lookAt = root.getWorldPosition(V3(0, 0, 0)); }
    else if (sp.trunk) {
      const c = root.getWorldPosition(V3(0, 0, 0)), dirs = [0, 1, 2, 3].map(k => { const an = k * Math.PI / 2 + (slot || 0) * .4; return V3(Math.sin(an), 0, Math.cos(an)); });
      // the trunk is measured at pelvis height (a trunk flares at its foot), the body sits 15 cm clear of it
      for (const d of dirs) { const y0 = groundAt(c.x + d.x * .8, c.z + d.z * .8, undefined, true) + .12, h = cast(parts, V3(c.x + d.x * 1.5, y0, c.z + d.z * 1.5), d.clone().negate(), 1.6); if (!h) continue; const p = h.point.clone().add(d.clone().multiplyScalar(.2)); const yy = groundAt(p.x, p.z, undefined, true); if (!standBlocked(p.x + d.x * .45, yy, p.z + d.z * .45, new Set(parts))) { at = p; fwd = d; trunk = h; break; } }
      if (!at) return planStand(ix, aIdx, { hands: 'none', gap: .9 }, slot);
    } else {
      // in front of a screen: the nearest spot at viewing distance whose cross-legged footprint is clear (a coffee table is not a seat)
      const F = faceOf(root, parts, objFwd(ix, ix.acts[aIdx])); fwd = objFwd(ix, ix.acts[aIdx]); lookAt = F.cw;
      const sd = V3(-fwd.z, 0, fwd.x), base = F.cw.clone().add(fwd.clone().multiplyScalar(F.depth + (sp.front || 1.5))), cand = [];
      [0, .3, -.3, .6, -.5, .9].forEach(dz => [0, .45, -.45, .9, -.9].forEach(dx => cand.push([dz, dx, Math.hypot(dz, dx)])));
      cand.sort((a, b) => a[2] - b[2]); at = base;
      for (const [dz, dx] of cand) { const p = base.clone().add(fwd.clone().multiplyScalar(dz)).add(sd.clone().multiplyScalar(dx)); if (floorFree(p, V3(F.cw.x - p.x, 0, F.cw.z - p.z).normalize())) { at = p; break; } }
    }
    if (lookAt) fwd = V3(lookAt.x - at.x, 0, lookAt.z - at.z).normalize();
    // the surface under the pelvis: a cushion, a rug or the ground
    const near = solidNear(at.x, at.z, .5).map(e => e.o), h0 = cast(near, V3(at.x, groundAt(at.x, at.z) + .5, at.z), down(), 1.2, .5), surf = h0 ? h0.point.y : groundAt(at.x, at.z);
    const T = { x: at.x, y: surf, z: at.z, ry: Math.atan2(fwd.x, fwd.z) }, q = poseOf('stand'); q.blob = 0;
    if (trunk) {
      // the soles stand on the highest ground under heel and toe (a planter's rim under the toes is stood on, not stood in)
      const fp = at.clone().add(fwd.clone().multiplyScalar(.42)), sdT = V3(-fwd.z, 0, fwd.x); let gy = -Infinity;
      [-.1, .1].forEach(s => [-.075, .175].forEach(t => { const p = fp.clone().add(fwd.clone().multiplyScalar(t)).add(sdT.clone().multiplyScalar(s)); gy = Math.max(gy, groundAt(p.x, p.z, undefined, true)); }));
      const fy = gy - surf + RIG.foot;
      q.hipZ = [-.1, .1]; q.shX = [-.35, -.35]; q.elX = [-.9, -.9]; q.shZ = [-.15, .15];
      // the pelvis and the thigh roots rest on the ground (2 mm above it), the knees up, then the back against the trunk
      const knees = py => { const L = legIK(py, .42, 0, fy); q.py = py; q.hipX = [L.hipX, L.hipX]; q.knee = [L.knee, L.knee]; q.ank = [L.ank, L.ank]; };
      knees(.075);
      for (let it = 0; it < 4; it++) { const g = seatGap(T, q); if (Math.abs(g - .002) < .002) break; knees(q.py - (g - .002)); }
      leanBack(parts, T, q, .5);
      return { kind: 'floor', T, q, ix: [ix.obj.userData.ix], ik: [] };
    }
    // cross-legged: thighs out and level, knees folded, shins crossed in front and resting on the floor
    q.py = .085; q.hipX = [-1.5, -1.5]; q.hipY = [-.62, .62]; q.hipT = [1.25, -1.25]; q.knee = [2.55, 2.55]; q.ank = [-.3, -.3];
    settleCross(near, T, q);
    if (sp.hands === 'book') q.hold = 'book'; if (sp.hands === 'pad') q.hold = 'pad';
    const plan = { kind: 'floor', T, q, ix: [ix.obj.userData.ix], ik: [] };
    if (q.hold) holdInFront(plan);
    return plan;
  }
  // is the floor around a sitting person free: pelvis, folded knees and the space ahead, 5 to 60 cm up
  function floorFree(p, fw) {
    const y0 = groundAt(p.x, p.z, undefined, true), sd = V3(-fw.z, 0, fw.x), near = solidNear(p.x, p.z, 1.2).filter(e => !(e.box.max.y - e.box.min.y < .06 && e.box.max.y < y0 + .2)), v = V3(0, 0, 0);
    for (const [a, b] of [[0, 0], [.25, 0], [-.25, 0], [0, .3], [.3, .35], [-.3, .35], [0, .55], [0, -.2]]) for (const h of [.06, .3, .6]) { v.set(p.x + sd.x * a + fw.x * b, y0 + h, p.z + sd.z * a + fw.z * b); if (near.some(e => e.box.containsPoint(v) && insideMesh(e, v))) return false; }
    return true;
  }
  // lower or raise the folded legs until the lowest shin point touches the floor surface
  function settleCross(near, T, q) {
    // (each shin point against what is under it: a rug or a cushion edge under the ankles is higher than the floor under the pelvis)
    const under = p => { const h = cast(near, V3(p.x, p.y + .12, p.z), down(), 1.2, .5); return h ? h.point.y : T.y; };
    const low = () => { const f = probe(T, q), R = f.userData.objRig; let m = Infinity; R.knees.forEach(k => [.2, .5, .8, 1].forEach(t => { const p = worldOf(k, 0, -RIG.shin * t, 0); m = Math.min(m, p.y - .055 - under(p)); })); R.ankles.forEach(a => [[0, -.07, .17], [0, -.07, -.07]].forEach(([x, y, z]) => { const p = worldOf(a, x, y, z); m = Math.min(m, p.y - under(p)); })); return m; };
    let lo = -1.75, hi = -1.15; const g = v => { q.hipX = [v, v]; return low(); };
    if (g(lo) * g(hi) > 0) { q.hipX = Math.abs(g(lo)) < Math.abs(g(hi)) ? [lo, lo] : [hi, hi]; return; }
    const sLo = g(lo) > 0; for (let i = 0; i < 16; i++) { const m = (lo + hi) / 2; if ((g(m) > 0) === sLo) lo = m; else hi = m; } g((lo + hi) / 2);
  }
  // a book or a game pad held in both hands in front of the chest
  function holdInFront(plan) {
    const f = probe(plan.T, plan.q), S = f.userData.objRig.S;
    plan.ik = [{ i: 0, p: worldOf(S, -.07, .3, .33) }, { i: 1, p: worldOf(S, .13, .3, .33) }];
  }
  function planSwim(ix, aIdx, slot) {
    const a = ix.acts[aIdx], s0 = ixSpot(ix, a, slot || 0), wy = ix.obj.getWorldPosition(V3(0, 0, 0)).y, fwd = objFwd(ix, a), side = V3(-fwd.z, 0, fwd.x);
    const q = poseOf('stand'); q.blob = 0; q.prx = Math.PI / 2; q.py = 0; q.hx = -.7; q.shZ = [-.1, .1];
    // the whole body (head 1.1 m ahead of the pelvis, feet 0.95 m behind, 0.35 m to each side) stays 0.3 m inside the water's edge
    const wb = boxWorld([ix.obj]), c = wb.getCenter(V3(0, 0, 0)), along = p => (p.x - c.x) * fwd.x + (p.z - c.z) * fwd.z, across = p => (p.x - c.x) * side.x + (p.z - c.z) * side.z;
    const halfA = Math.abs(fwd.x) * (wb.max.x - wb.min.x) / 2 + Math.abs(fwd.z) * (wb.max.z - wb.min.z) / 2, halfC = Math.abs(side.x) * (wb.max.x - wb.min.x) / 2 + Math.abs(side.z) * (wb.max.z - wb.min.z) / 2;
    const p0 = V3(s0.x, 0, s0.y), u = Math.min(Math.max(along(p0), -halfA + .95 + .3), halfA - 1.1 - .3), v = Math.min(Math.max(across(p0), -halfC + .65), halfC - .65);
    // clear of anything under the surface too (the pool's steps and ledges): the nearest lane spot where no joint is inside a solid
    const water = new Set(partsOf(ix.obj)), ry = Math.atan2(fwd.x, fwd.z), clear = Tq => { const f = probe(Tq, q), R = f.userData.objRig, pts = [worldOf(R.P, 0, 0, 0), worldOf(R.S, 0, .4, 0), worldOf(R.H, 0, .1, 0)]; R.hips.forEach(h => [.5, 1].forEach(t => pts.push(worldOf(h, 0, -RIG.thigh * t, 0)))); R.knees.forEach(k => [.5, 1].forEach(t => pts.push(worldOf(k, 0, -RIG.shin * t, 0)))); const near = solidNear(Tq.x, Tq.z, 1.6).filter(e => !water.has(e.o)); return !pts.some(pt => near.some(e => e.box.containsPoint(pt) && insideMesh(e, pt))); };
    let best = null;
    for (const du of [0, .3, -.3, .6, -.6, .9, -.9, 1.2, -1.2]) { for (const dv of [0, .3, -.3, .6, -.6]) { const uu = Math.min(Math.max(u + du, -halfA + .95 + .3), halfA - 1.1 - .3), vv = Math.min(Math.max(v + dv, -halfC + .65), halfC - .65), p = c.clone().add(fwd.clone().multiplyScalar(uu)).add(side.clone().multiplyScalar(vv)), Tq = { x: p.x, y: wy - .015, z: p.z, ry }; if (clear(Tq)) { best = Tq; break; } } if (best) break; }
    const p = c.clone().add(fwd.clone().multiplyScalar(u)).add(side.clone().multiplyScalar(v));
    return { kind: 'swim', T: best || { x: p.x, y: wy - .015, z: p.z, ry }, q, ix: [ix.obj.userData.ix], ik: [], anim: 'swim' };
  }
  // the slide: sitting at the top of the chute with legs down the slope, then sliding down it when motion is allowed
  function planSlide(ix) {
    const tw = ix.obj, c = tw.getWorldPosition(V3(0, 0, 0)); let tube = null;
    solidList().forEach(e => { if (e.o.geometry.type === 'TubeGeometry' && e.box.distanceToPoint(c) < 4) tube = e.o; });
    if (!tube) return null;
    const pa = tube.geometry.attributes.position, ring = tube.geometry.parameters.radialSegments + 1, ringC = r => { const v = V3(0, 0, 0); for (let i = 0; i < ring; i++) v.add(V3(pa.getX(r * ring + i), pa.getY(r * ring + i), pa.getZ(r * ring + i))); return v.multiplyScalar(1 / ring).applyMatrix4(tube.matrixWorld); };
    const rings = tube.geometry.parameters.tubularSegments + 1, path = []; for (let r = 0; r < rings; r += 3) path.push(ringC(r));
    const p0 = ringC(2), p1 = ringC(5), dir = p1.clone().sub(p0).setY(0).normalize();
    const h = cast([tube], p0.clone(), down(), 1); if (!h) return null;
    const T = { x: p0.x, y: h.point.y, z: p0.z, ry: Math.atan2(dir.x, dir.z) }, q = poseOf('stand'); q.blob = 0;
    const slope = Math.atan2(p0.y - p1.y, p0.distanceTo(V3(p1.x, p0.y, p1.z)));
    q.py = .075; q.hipX = [-Math.PI / 2 + slope, -Math.PI / 2 + slope]; q.knee = [.15, .15]; q.sx = -.1; q.shX = [-.2, -.2]; q.shZ = [-.5, .5]; q.elX = [-.2, -.2];
    return { kind: 'slide', T, q, ix: [ix.obj.userData.ix], ik: [], anim: 'slide', path, tube };
  }
  function planRow(ix) {
    // the rower faces along the hull's length (its local x), toward the middle, so the feet land on the floorboards; the menu
    // spot's direction is a world direction for standing on the jetty, not the boat's axis
    const root = ix.obj, parts = partsOf(root, true), c = root.getWorldPosition(V3(0, 0, 0)), bq = new THREE.Quaternion(); root.getWorldQuaternion(bq);
    const fwd = V3(-1, 0, 0).applyQuaternion(bq).setY(0).normalize();
    let best = null; for (let t = -.7; t <= .7001; t += .05) [t].forEach(t => { const p = c.clone().add(fwd.clone().multiplyScalar(t)), s = seatTopAt(parts, p.x, p.z, boxWorld(parts).max.y + .3); if (s !== null && (!best || s > best.s + .02)) best = { p, s }; });
    if (!best) return null;
    // the floor under the feet: the highest point under either sole (an oar lying on the boards is stood on, not stood in)
    const sd = V3(-fwd.z, 0, fwd.x); let fy = -Infinity;
    [-.1, .1].forEach(s => [.38, .62].forEach(t => { const p = best.p.clone().add(fwd.clone().multiplyScalar(t)).add(sd.clone().multiplyScalar(s)), h = cast(parts, V3(p.x, best.s + .1, p.z), down(), 1, .5); if (h) fy = Math.max(fy, h.point.y); }));
    const r = solveSit(parts, best.p, fwd, { floorY: isFinite(fy) ? fy : best.s - .3, from: best.s + .1 }); if (!r) return null;
    const plan = { kind: 'row', T: r.T, q: r.q, ix: [ix.obj.userData.ix], ik: [], anim: 'boat' };
    // the hands hold the oars: the end of each long pole nearest the rower's chest
    const S = probe(r.T, r.q).userData.objRig.S, chest = worldOf(S, 0, .3, .2), oars = [];
    parts.forEach(m => { const g = m.geometry; if (g.type !== 'CylinderGeometry' || g.parameters.height < 1.2) return; const a = worldOf(m, 0, g.parameters.height / 2, 0), b = worldOf(m, 0, -g.parameters.height / 2, 0); const near = a.distanceTo(chest) < b.distanceTo(chest) ? a : b, far = near === a ? b : a; oars.push(near.clone().lerp(far, .08)); });
    oars.sort((p, q2) => p.distanceTo(chest) - q2.distanceTo(chest));
    // arm 0 hangs at the figure's local -x, which is +sd in the world for this facing
    const two = oars.slice(0, 2).sort((p, q2) => (q2.clone().sub(chest).dot(sd)) - (p.clone().sub(chest).dot(sd)));
    plan.ik = two.length === 2 ? [{ i: 0, p: two[0].add(V3(0, .035, 0)) }, { i: 1, p: two[1].add(V3(0, .035, 0)) }] : [];
    return plan;
  }
  // astride an e-bike: on the saddle, feet on the pedals, hands on the grips (the bike stays parked)
  function planRide(ix) {
    const root = ix.obj; if (!root.visible) return null;
    const parts = partsOf(root, true), L = (x, y, z) => root.localToWorld(V3(x, y, z)), fwd = objFwd(ix, null), sad = L(0, 0, -.27);
    const top = seatTopAt(parts, sad.x, sad.z, 1.3); if (top === null) return null;
    const floor = groundAt(sad.x, sad.z, undefined, true), q = poseOf('stand'); q.blob = 0; q.py = top + .04 - floor; q.sx = .5;
    // pedals: the cranks level, the right foot forward; the sole centre (7 cm under the ankle, 5 cm ahead) sits on the pedal
    const pedals = [L(-.13, .3, -.04 + .16), L(.13, .3, -.04 - .16)];
    const legs = () => pedals.forEach((pd, i) => { const zf = pd.clone().sub(sad).dot(fwd) - .05, Lg = legIK(q.py, zf, 0, pd.y - floor + .07); q.hipX[i] = Lg.hipX; q.knee[i] = Lg.knee; q.ank[i] = Lg.ank; });
    q.hipZ = [-.06, .06]; legs(); // (thighs apart enough to clear the saddle's sides, feet still on the pedals)
    const plan = { kind: 'ride', T: { x: sad.x, y: floor, z: sad.z, ry: Math.atan2(fwd.x, fwd.z) }, q, ix: [ix.obj.userData.ix], ik: [] };
    // the pelvis and the inner thighs rest on the saddle (2 mm above its surface), never sunk into it
    for (let it = 0; it < 5; it++) { const g = contactGap(parts, plan.T, q); if (g === null || Math.abs(g - .002) < .002) break; q.py -= g - .002; legs(); }
    plan.ik = [{ i: 0, p: L(-.24, 1.02, .32) }, { i: 1, p: L(.24, 1.02, .32) }];
    plan.pedals = pedals;
    return plan;
  }
  // at a desk (MacBook, monitor, keyboard, dining table, mug, lamp): sit on the free seat that faces it and work at it
  function planDesk(ixIdx, aIdx, sp, seatIx, who) {
    const ix = IX[ixIdx];
    if (seatIx === undefined || seatIx === null) return planStand(ix, aIdx, { hands: sp.hands === 'cup' ? 'object' : 'object' }, 0);
    const sitOn = () => { const pl = planSit(seatIx, 0, specFor(IX[seatIx], sitAct(IX[seatIx]))); if (pl) { pl.ix = [ixIdx, seatIx]; pl.kind = 'sit'; } return pl; };
    // a seat rolled in for this desk earlier is planned from where it stands at home
    const seat = useRoot(IX[seatIx]), home = USE.rolled.get(seatIx); if (home) { setSeatWorld(seat, home.x, home.z, home.ry); USE.rolled.delete(seatIx); }
    let plan = sitOn(); if (!plan) return null;
    if (sp.hands === 'cup') { plan.q.hold = 'cup'; plan.anim = 'sip'; return plan; }
    if (sp.hands === 'book') { plan.q.hold = 'book'; holdInFront(plan); return plan; }
    typeAt(plan, partsOf(ix.obj, true));
    // the keys out of reach with the back against the backrest: roll the chair in toward the desk, as people do, by the
    // shortfall (4 cm steps) wherever the chair still fits; it goes back home when the desk work ends (useAssign)
    const reach = pl => { const f = probe(pl.T, pl.q), R = f.userData.objRig; return pl.ik.length ? Math.max(...pl.ik.map(t => worldOf(R.shs[t.i], 0, 0, 0).distanceTo(t.p))) : 0; };
    const r0 = reach(plan);
    if (seat.userData.movable && r0 > .55) {
      const w = seatWorld(seat), fw = V3(Math.sin(plan.T.ry), 0, Math.cos(plan.T.ry));
      for (let s = Math.min(.45, r0 - .5); s >= .04; s -= .04) {
        const t = { x: w.x + fw.x * s, z: w.z + fw.z * s, ry: w.ry }; if (!seatFits(seat, t, who, null, true)) continue;
        setSeatWorld(seat, t.x, t.z, t.ry); const p2 = sitOn(); if (p2) { typeAt(p2, partsOf(ix.obj, true)); if (p2.ik.length === plan.ik.length && reach(p2) < r0) { USE.rolled.set(seatIx, w); return p2; } }
        setSeatWorld(seat, w.x, w.z, w.ry);
      }
    }
    return plan;
  }
  // hands on the keys: the top of what is in front at desk height
  function typeAt(plan, parts) {
    const f = probe(plan.T, plan.q), R = f.userData.objRig, fw = V3(Math.sin(plan.T.ry), 0, Math.cos(plan.T.ry)), sd = V3(-fw.z, 0, fw.x), S = worldOf(R.S, 0, 0, 0);
    const near = solidNear(S.x, S.z, 1.2).map(e => e.o).filter(o => { for (let a = o; a; a = a.parent) if (a === f) return false; return true; });
    const list = parts.length ? parts.concat(near) : near;
    plan.ik = [];
    [-1, 1].forEach((s, i) => { for (const dz of [.32, .4, .48, .56]) { const p = S.clone().add(fw.clone().multiplyScalar(dz)).add(sd.clone().multiplyScalar(s * -.13)), h = cast(list, V3(p.x, S.y + .55, p.z), down(), 1, .6); if (h && h.point.y > S.y + .05 && h.point.y < S.y + .55) { plan.ik.push({ i, p: h.point.clone().add(V3(0, .025, 0)) }); break; } } });
  }
  // seated work at the donut table or a focus desk: the nearest seat, typing on what is in front
  function planSeatSpot(seatIx, slot, type) {
    const sp = specFor(IX[seatIx], sitAct(IX[seatIx])), plan = planSit(seatIx, slot, sp); if (!plan) return null;
    if (type) { plan.q.shX = [-.5, -.5]; plan.q.elX = [-1.05, -1.05]; typeAt(plan, []); plan.kind = 'type'; }
    else if (sp.hands === 'cup') { plan.q.hold = 'cup'; plan.anim = 'sip'; }
    else if (sp.hands === 'book') { plan.q.hold = 'book'; holdInFront(plan); }
    return plan;
  }
  // the plan for one placement spot (from placeAll); falls back to a plain stand on the ground at the spot
  function planSpot(p, s) {
    try {
      if (s.drag) return planDrag(p, s);
      if (s.ix !== undefined) {
        let ixIdx = s.ix, aIdx = s.a, ix = IX[ixIdx], sp = specFor(ix, aIdx);
        if (sp.via && s.viaIx !== undefined) { ixIdx = s.viaIx; aIdx = sp.viaAct || 0; ix = IX[ixIdx]; sp = Object.assign(specFor(ix, aIdx), { hands: sp.hands || specFor(ix, aIdx).hands }); }
        let plan = null;
        switch (sp.kind) {
          case 'sit': plan = planSit(ixIdx, s.slot, sp); if (plan && sp.hands === 'cup') { plan.q.hold = 'cup'; plan.anim = 'sip'; } if (plan && sp.hands === 'book') { plan.q.hold = 'book'; holdInFront(plan); } break;
          case 'recline': plan = planLie(ix, sp, true); break;
          case 'lie': plan = planLie(ix, sp, false); break;
          case 'floor': plan = planFloor(ix, aIdx, sp, s.slot); break;
          case 'swim': plan = planSwim(ix, aIdx, s.slot); break;
          case 'slide': plan = planSlide(ix); break;
          case 'row': plan = planRow(ix); break;
          case 'ride': plan = planRide(ix); break;
          case 'desk': plan = planDesk(ixIdx, aIdx, sp, s.seatIx, p); break;
          case 'squat': plan = planStand(ix, aIdx, Object.assign({}, sp, { hands: 'object', gap: .22 }), s.slot); break;
          default: plan = planStand(ix, aIdx, sp, s.slot, s.dy ? .08 + (s.dy || 0) : undefined);
        }
        if (plan) { if (s.viaIx !== undefined && plan.ix.indexOf(s.ix) < 0) plan.ix.push(s.ix); return plan; }
      }
      if (s.seatIx !== undefined && s.seatIx !== null) { const plan = planSeatSpot(s.seatIx, s.seatSlot || 0, s.pose === 'type'); if (plan) return plan; }
    } catch (e) { if (/[?&]test/.test(location.search)) console.warn('plan failed', s.room, e && e.message); }
    const ry = faceTo(s.x, s.y, s.look.x, s.look.y), hint = s.dy ? .08 + s.dy : undefined;
    // the nearest spot within 60 cm whose floor is clear of furniture under the soles and around the body (a step, a planter)
    let px = s.x, pz = s.y;
    if (standBlocked(px, groundAt(px, pz, hint), pz, null, ry)) { let done = false; for (const r of [.15, .3, .45, .6]) { for (let k = 0; k < 12 && !done; k++) { const a = k / 12 * Math.PI * 2, x = s.x + Math.cos(a) * r, z = s.y + Math.sin(a) * r, r2 = faceTo(x, z, s.look.x, s.look.y); if (!standBlocked(x, groundAt(x, z, hint), z, null, r2)) { px = x; pz = z; done = true; } } if (done) break; } }
    return { kind: 'stand', T: { x: px, y: groundAt(px, pz, hint), z: pz, ry: faceTo(px, pz, s.look.x, s.look.y) }, q: poseOf('stand'), ix: [], ik: [] };
  }
  // ---------- claims and use counts: run once per placement pass, right after placeAll ----------
  function useAssign(out) {
    const held = new Map(), now = Date.now(), live = USE.seatHolder;
    // seats being dragged are held by their dragger
    people.forEach(p => { if (p.drag && p.drag.seatIx !== undefined) held.set(p.drag.seatIx, p.id); });
    const seats = IX.map((x, i) => [x, i]).filter(([x]) => isSeat(x));
    const freeSeat = (pos, r, pid, faceTo_) => {
      let best = null, bd = Infinity;
      seats.forEach(([x, i]) => { if (held.has(i) && held.get(i) !== pid) return; const w = ixPos(x), d = Math.hypot(w.x - pos.x, w.z - pos.z); if (d > r) return; let score = d; if (faceTo_) { const fw = objFwd(x, x.acts[sitAct(x)]), to = V3(faceTo_.x - w.x, 0, faceTo_.z - w.z).normalize(); if (fw.dot(to) < .2) return; score -= .3 * fw.dot(to); } if (score < bd) { bd = score; best = i; } });
      return best;
    };
    out.forEach((s, pid) => {
      if (s.drag) return;
      if (s.ix !== undefined) {
        const ix = IX[s.ix], sp = specFor(ix, s.a);
        if (sp.via) { const me = ixPos(ix); let bi = null, bd = Infinity; IX.forEach((x, i) => { if (x.name !== sp.via) return; const w = ixPos(x), d = Math.hypot(w.x - me.x, w.z - me.z); if (d < bd) { bd = d; bi = i; } }); if (bi !== null) { s.viaIx = bi; held.set(bi, pid); } }
        if (sp.kind === 'desk') { const at = ixPos(ix); s.seatIx = freeSeat(at, sp.r || 1.2, pid, at); if (s.seatIx !== null) held.set(s.seatIx, pid); }
        else if (sp.kind === 'sit') held.set(s.ix, pid);
        return;
      }
      if (s.pose === 'sit' || s.pose === 'type') { const i = freeSeat(V3(s.x, 0, s.y), .95, pid, null); if (i !== null) { s.seatIx = i; held.set(i, pid); } }
    });
    USE.seatHolder = held;
    // chairs rolled in to a desk go home once nobody works at that desk from them
    USE.rolled.forEach((home, i) => { let still = false; out.forEach(s => { if (s.ix !== undefined && s.seatIx === i && specFor(IX[s.ix], s.a).kind === 'desk') still = true; }); if (!still) { setSeatWorld(useRoot(IX[i]), home.x, home.z, home.ry); USE.rolled.delete(i); } });
    // a use starts when a person's object changes; each start counts once for every object involved
    out.forEach((s, pid) => {
      const objs = [s.ix, s.viaIx, s.seatIx, s.drag ? s.drag.seatIx : undefined].filter(i => i !== undefined && i !== null), key = objs.slice().sort().join(',');
      const prev = USE.lastUse.get(pid); if (key && key !== prev) objs.forEach(i => USE.usage.set(i, (USE.usage.get(i) || 0) + 1));
      USE.lastUse.set(pid, key);
    });
    return out;
  }
  // ---------- seats dragged to where they are used, then put back exactly where they were ----------
  // A person walks to the seat, takes hold of it, walks to the target with the seat following their own footsteps (so it
  // passes doors the way they did), pushed out of any wall it would touch, uses it there, then drags it back and sets it
  // down on its recorded home pose (position and turn), which is restored exactly. A seat someone sits on is never taken.
  const DRAG_TH = { chair: 'ลากเก้าอี้ไปนั่งคุยกับเพื่อน', stool: 'ลากเก้าอี้สตูลไปนั่งคุยกับเพื่อน', beanbag: 'ลากบีนแบ็กไปนั่งริมหน้าต่าง', sofa: 'ลากโซฟาเข้าไปใกล้ทีวี', armchair: 'ขยับเก้าอี้นวดออกมานั่งให้สบาย' };
  function seatIxOfObj(o) { if (o.userData.ix !== undefined) return o.userData.ix; let r; o.traverse(c => { if (r === undefined && c.userData.ix !== undefined) r = c.userData.ix; }); return r; }
  function seatWorld(seat) { seat.updateWorldMatrix(true, false); const p = seat.getWorldPosition(V3(0, 0, 0)), q = new THREE.Quaternion(); seat.getWorldQuaternion(q); return { x: p.x, y: p.y, z: p.z, ry: new THREE.Euler().setFromQuaternion(q, 'YXZ').y }; }
  function setSeatWorld(seat, x, z, ry) {
    const par = seat.parent; par.updateWorldMatrix(true, false);
    const wy = seat.getWorldPosition(V3(0, 0, 0)).y, l = par.worldToLocal(V3(x, wy, z)), pq = new THREE.Quaternion(); par.getWorldQuaternion(pq);
    seat.position.x = l.x; seat.position.z = l.z; seat.rotation.y = ry - new THREE.Euler().setFromQuaternion(pq, 'YXZ').y; seat.updateMatrixWorld(true);
  }
  function wallBoxes() {
    if (USE.walls) return USE.walls;
    const b = new THREE.Box3(), out = []; if (!three.shell) return (USE.walls = out);
    three.shell.updateMatrixWorld(true);
    three.shell.children.forEach(m => { if (!m.isMesh) return; b.setFromObject(m); const dx = b.max.x - b.min.x, dz = b.max.z - b.min.z; if (b.max.y - b.min.y < .5 || Math.min(dx, dz) > .4) return; out.push({ min: b.min.clone(), max: b.max.clone() }); });
    return (USE.walls = out);
  }
  // the smallest move that takes the seat out of every wall it overlaps (and inside the floor plate when it is indoors)
  function pushOutOfWalls(seat) {
    let moved = 0;
    const shift = (dx, dz) => { const w = seatWorld(seat); setSeatWorld(seat, w.x + dx, w.z + dz, w.ry); moved += Math.abs(dx) + Math.abs(dz); };
    for (let it = 0; it < 4; it++) {
      let b = new THREE.Box3().setFromObject(seat), best = null;
      for (const w of wallBoxes()) {
        if (b.max.y <= w.min.y + .02 || b.min.y >= w.max.y - .02) continue;
        const ox = Math.min(b.max.x, w.max.x + .03) - Math.max(b.min.x, w.min.x - .03), oz = Math.min(b.max.z, w.max.z + .03) - Math.max(b.min.z, w.min.z - .03);
        if (ox <= 1e-4 || oz <= 1e-4) continue;
        const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2, wx = (w.min.x + w.max.x) / 2, wz = (w.min.z + w.max.z) / 2;
        const mv = ox < oz ? { x: cx < wx ? -ox - .01 : ox + .01, z: 0 } : { x: 0, z: cz < wz ? -oz - .01 : oz + .01 };
        if (!best || Math.abs(mv.x) + Math.abs(mv.z) > Math.abs(best.x) + Math.abs(best.z)) best = mv;
      }
      if (best) shift(best.x, best.z);
      // an indoor seat never reaches past the floor plate's edge, whatever wall (or glass) stands there
      b = new THREE.Box3().setFromObject(seat);
      const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2, X1 = 19 * K, Z1 = 12 * K;
      let ex = 0, ez = 0;
      if (cx > 0 && cx < X1 && cz > 0 && cz < Z1) { ex = b.min.x < .01 ? .015 - b.min.x : b.max.x > X1 - .01 ? X1 - .015 - b.max.x : 0; ez = b.min.z < .01 ? .015 - b.min.z : b.max.z > Z1 - .01 ? Z1 - .015 - b.max.z : 0; }
      if (ex || ez) shift(ex, ez);
      if (!best && !ex && !ez) break;
    }
    return moved;
  }
  function seatRadius(seat) { const b = boxLocal(seat, partsOf(seat, true)), s = b.getSize(V3(0, 0, 0)); return Math.max(s.x, s.z) / 2; }
  // can the seat stand at (x, z, ry): no wall, no other furniture under its footprint, nobody standing there
  function seatFits(seat, t, who, ignoreKind, noPeople) {
    const w0 = seatWorld(seat); setSeatWorld(seat, t.x, t.z, t.ry);
    let ok = pushOutOfWalls(seat) < .005;
    const back = () => setSeatWorld(seat, w0.x, w0.z, w0.ry);
    if (!ok) { USE.fitWhy = 'wall'; back(); return false; }
    // sample the seat's own footprint (its local box, so a turned seat is not judged by its larger world box)
    const own = new Set(partsOf(seat)), lb = boxLocal(seat, partsOf(seat, true)), v = V3(0, 0, 0);
    const kindOf = o => { for (let a = o; a; a = a.parent) if (a.userData.movable) return a.userData.movable; return null; };
    const near = solidNear(t.x, t.z, 1.6).filter(e => !own.has(e.o) && !(e.box.max.y - e.box.min.y < .06 && e.box.max.y < .25) && !(ignoreKind && kindOf(e.o) === ignoreKind));
    for (let i = 0; i <= 4 && ok; i++) for (let j = 0; j <= 4 && ok; j++) for (const hy of [.18, .4]) { v.set(lb.min.x + (lb.max.x - lb.min.x) * (.04 + .92 * i / 4), lb.min.y + hy, lb.min.z + (lb.max.z - lb.min.z) * (.04 + .92 * j / 4)); seat.localToWorld(v); for (const e of near) if (e.box.containsPoint(v) && insideMesh(e, v)) { ok = false; USE.fitWhy = 'furniture ' + ownerName(e.o); break; } if (!ok) break; }
    // (a chair rolled a few cm in under its own desk ignores people: anyone in its way would already be in the chair)
    if (ok && !noPeople) three.figures.forEach((f, id) => { if (who && id === who.id) return; if (Math.hypot(f.position.x - t.x, f.position.z - t.z) < seatRadius(seat) + .3) { ok = false; USE.fitWhy = 'person'; } });
    back(); return ok;
  }
  const ownerName = o => { for (let a = o; a; a = a.parent) if (a.userData.ix !== undefined) return IX[a.userData.ix].name; return o.geometry.type + (o.userData.batch ? '(batch)' : ''); };
  // ?test: why each candidate target of a seat kind is refused
  function dragWhy(kind) {
    const seat = []; three.scene.traverse(o => { if (o.userData.movable === kind) seat.push(o); }); if (!seat.length) return 'none';
    const p = people.find(q => q.role !== 'head'), rows = [];
    seat.slice(0, 2).forEach(s => { USE.fitLog = []; const t = dragTargets(p, s, kind); rows.push({ seat: IX[seatIxOfObj(s)] ? IX[seatIxOfObj(s)].name : kind, chosen: t, tried: USE.fitLog.slice(0, 12) }); });
    USE.fitLog = null; return rows;
  }
  const sameFloor = (a, b) => Math.abs(floorY(a.x, a.z) - floorY(b.x, b.z)) < .01;
  function dragTargets(p, seat, kind) {
    const h = seatWorld(seat), fw = V3(Math.sin(h.ry), 0, Math.cos(h.ry)), r = seatRadius(seat), out = [];
    if (kind === 'chair' || kind === 'stool') {
      three.figures.forEach((f, id) => {
        if (id === p.id || !f.userData.plan || !/^(sit|type)$/.test(f.userData.plan.kind) || f.userData.walk) return;
        const T = f.userData.plan.T, ofw = V3(Math.sin(T.ry), 0, Math.cos(T.ry)), sd = V3(-ofw.z, 0, ofw.x);
        [1, -1].forEach(s => [.9, 1.1, 1.3].forEach(d => { const x = T.x + sd.x * s * d + ofw.x * .2, z = T.z + sd.z * s * d + ofw.z * .2; out.push({ x, z, ry: Math.atan2(T.x - x, T.z - z) }); }));
      });
    } else if (kind === 'beanbag') {
      const X1 = 19 * K, Z1 = 12 * K, edges = [[h.x, 0, 0, -1, h.z], [h.x, Z1, 0, 1, Z1 - h.z], [0, h.z, -1, 0, h.x], [X1, h.z, 1, 0, X1 - h.x]].sort((a, b) => a[4] - b[4]);
      edges.forEach(([ex, ez, nx, nz]) => [.6, .9, 1.2].forEach(m => [0, .6, -.6, 1.2, -1.2].forEach(lat => { const x = ex - nx * (r + m) + nz * lat, z = ez - nz * (r + m) + nx * lat; out.push({ x, z, ry: Math.atan2(nx, nz) }); })));
    } else {
      // a heavy seat moves a short way within its room: forward first, then on a diagonal, sideways, back, with a small turn if needed
      const sd = V3(-fw.z, 0, fw.x);
      [[0, .6], [0, .45], [.45, .3], [-.45, .3], [.6, .1], [-.6, .1], [0, .32], [.4, -.25], [-.4, -.25], [0, .9], [.8, .5], [-.8, .5], [.9, 0], [-.9, 0], [0, 1.2], [1.1, .7], [-1.1, .7]].forEach(([dx, dz]) => [0, .25, -.25].forEach(t => out.push({ x: h.x + fw.x * dz + sd.x * dx, z: h.z + fw.z * dz + sd.z * dx, ry: h.ry + t })));
      return pickTarget(out, seat, h, p);
    }
    out.sort((a, b) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(b.x - h.x, b.z - h.z));
    return pickTarget(out, seat, h, p);
  }
  // does a walked polyline pass through any wall (a doorway is a gap between wall boxes, so it passes)
  function crossesWall(pts) {
    const W = wallBoxes();
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k], dx = b.x - a.x, dz = b.z - a.z;
      for (const w of W) {
        let t0 = 0, t1 = 1; const ok = [[a.x, dx, w.min.x - .04, w.max.x + .04], [a.z, dz, w.min.z - .04, w.max.z + .04]].every(([o, d, lo, hi]) => { if (Math.abs(d) < 1e-9) return o >= lo && o <= hi; let u = (lo - o) / d, v = (hi - o) / d; if (u > v) [u, v] = [v, u]; t0 = Math.max(t0, u); t1 = Math.min(t1, v); return t0 <= t1; });
        if (ok) return true;
      }
    }
    return false;
  }
  // where the dragger walks to so the seat, trailing L behind, ends on `to`; and the walked route from `from`
  function dragGoal(from, to, L, seat) {
    const path = route(from.x, from.z, to.x, to.z) || [{ x: to.x, z: to.z }];
    const pr = path.length > 1 ? path[path.length - 2] : from, dl = V3(to.x - pr.x, 0, to.z - pr.z); if (dl.lengthSq() < 1e-6) dl.set(Math.sin(to.ry || 0), 0, Math.cos(to.ry || 0)); dl.normalize();
    let goal = { x: to.x + dl.x * L, z: to.z + dl.z * L };
    if (standBlocked(goal.x, groundAt(goal.x, goal.z), goal.z, new Set(partsOf(seat)))) goal = { x: to.x + dl.x * L * .6, z: to.z + dl.z * L * .6 };
    return { goal, path: [from].concat(route(from.x, from.z, goal.x, goal.z) || [goal]) };
  }
  function pickTarget(out, seat, h, p) {
    const log = (t, why) => { if (USE.fitLog) USE.fitLog.push({ x: +t.x.toFixed(2), z: +t.z.toFixed(2), why }); }, ok = [];
    for (const t of out) {
      if (ok.length >= 6) break;
      if (Math.hypot(t.x - h.x, t.z - h.z) < .3 || !sameFloor(h, t) || roomAtWorld(t.x, t.z) === ROOM_OUT) { log(t, 'near/floor/outside'); continue; }
      const path = route(h.x, h.z, t.x, t.z); if (!path || path.some(q => !sameFloor(h, q))) { log(t, 'route'); continue; }
      if (seatFits(seat, t, p)) ok.push(t); else log(t, USE.fitWhy);
    }
    return ok;
  }
  function seatBusy(seatIx, p) {
    if (seatIx === undefined) return false;
    if (USE.seatHolder.has(seatIx) && USE.seatHolder.get(seatIx) !== p.id) return true;
    if (people.some(q => q !== p && q.drag && q.drag.seatIx === seatIx)) return true;
    let busy = false; three.figures.forEach((f, id) => { if (id !== p.id && f.userData.plan && (f.userData.plan.ix || []).indexOf(seatIx) >= 0) busy = true; });
    return busy;
  }
  function grabPoint(seat, dir, r) {
    const c = seatWorld(seat); for (const turn of [0, .5, -.5, 1, -1, 1.6, -1.6]) { const d = dir.clone().applyAxisAngle(V3(0, 1, 0), turn), x = c.x + d.x * (r + .32), z = c.z + d.z * (r + .32); if (!standBlocked(x, groundAt(x, z), z, new Set(partsOf(seat)))) return { x, z }; }
    return { x: c.x + dir.x * (r + .32), z: c.z + dir.z * (r + .32) };
  }
  function startDrag(p, seat, opt) {
    const seatIx = seatIxOfObj(seat), kind = seat.userData.movable;
    if (!kind || seatBusy(seatIx, p) || people.some(q => q.drag && q.drag.seat === seat)) return false;
    const h = seatWorld(seat), r = seatRadius(seat), L = r + .32, ign = new Set(partsOf(seat));
    // the first target whose drag there and back never passes through a wall (navPath lets a route cut a corner near its ends)
    for (const t of dragTargets(p, seat, kind)) {
      const dir = V3(t.x - h.x, 0, t.z - h.z).normalize(), grab = grabPoint(seat, dir, r), there = dragGoal(grab, t, L, seat);
      if (crossesWall(there.path)) { if (USE.fitLog) USE.fitLog.push({ x: +t.x.toFixed(2), z: +t.z.toFixed(2), why: 'route through a wall' }); continue; }
      const back = V3(h.x - t.x, 0, h.z - t.z).normalize(); let regrab = { x: t.x + back.x * L, z: t.z + back.z * L };
      if (standBlocked(regrab.x, groundAt(regrab.x, regrab.z), regrab.z, ign)) regrab = there.goal;
      const home = dragGoal(regrab, h, L, seat);
      if (crossesWall(home.path)) { if (USE.fitLog) USE.fitLog.push({ x: +t.x.toFixed(2), z: +t.z.toFixed(2), why: 'way back through a wall' }); continue; }
      p.drag = { seat, seatIx, kind, target: t, homeW: h, phase: 'go', n: 0, r, L, useS: opt && opt.useS !== undefined ? opt.useS : ACT_MS * .6 / 1000, grab, regrab, goals: { pu: there.goal, ba: home.goal }, paths: { pu: there.path, ba: home.path }, trail: [], maxAway: 0 };
      return true;
    }
    return false;
  }
  const refreshPlaces = () => placeFigures(placeAll());
  function dragArrived(p) {
    const d = p.drag; if (!d) return;
    const f = three.figures.get(p.id), c = seatWorld(d.seat);
    if (d.phase === 'go' || d.phase === 'regrab') { d.phase = d.phase === 'go' ? 'pull' : 'back'; d.n++; d.trail = [{ x: c.x, z: c.z }, { x: f.position.x, z: f.position.z }]; d.yawOff = c.ry - Math.atan2(f.position.x - c.x, f.position.z - c.z); refreshPlaces(); return; }
    if (d.phase === 'pull' || d.phase === 'back') { const to = d.phase === 'pull' ? d.target : d.homeW; d.settle = { from: c, to, t: 0 }; d.phase = d.phase === 'pull' ? 'place' : 'putback'; }
  }
  // where the dragger stands for each phase (placeAll calls this before anything else for that person)
  function dragSpot(p) {
    const now = Date.now();
    if (!p.drag) {
      const a = p.act && p.act.until > now && p.act.k === 'ix' && IX[p.act.ix] && IX[p.act.ix].acts[p.act.a];
      if (!a || a.how !== 'drag') return null;
      let seat = IX[p.act.ix].obj; while (seat && !seat.userData.movable) seat = seat.parent;
      if (USE.logical && seat) { const c = seatWorld(seat); return { x: c.x, y: c.z, pose: 'stand', look: { x: c.x, y: c.z + 1 }, room: IX[p.act.ix].name, act: a.th, drag: { phase: 'go', n: 0, seatIx: p.act.ix } }; }
      if (!seat || !startDrag(p, seat)) { p.act = null; return null; }
    }
    const d = p.drag, c = seatWorld(d.seat), base = { pose: 'stand', room: IX[d.seatIx] ? IX[d.seatIx].name : 'ลากที่นั่ง', act: DRAG_TH[d.kind], drag: { phase: d.phase, n: d.n, seatIx: d.seatIx } };
    if (d.phase === 'use') return Object.assign(base, { x: c.x, y: c.z, pose: 'sit', look: { x: c.x + Math.sin(c.ry), y: c.z + Math.cos(c.ry) } });
    if (d.phase === 'go' || d.phase === 'regrab') {
      const g = d.phase === 'go' ? d.grab : d.regrab; return Object.assign(base, { x: g.x, y: g.z, look: { x: c.x, y: c.z } });
    }
    const to = d.phase === 'pull' || d.phase === 'place' ? d.target : d.homeW, key = d.phase === 'pull' || d.phase === 'place' ? 'pu' : 'ba';
    d.goal = d.goals[key]; d.path = d.paths[key].map(q => [+q.x.toFixed(2), +q.z.toFixed(2)]);
    return Object.assign(base, { x: d.goal.x, y: d.goal.z, look: { x: d.goal.x + (d.goal.x - to.x), y: d.goal.z + (d.goal.z - to.z) } });
  }
  function planDrag(p, s) {
    const d = p && p.drag; if (!d) return null;
    if (d.phase === 'use') { const pl = planSit(d.seatIx, d.kind === 'sofa' ? 1 : 0, specFor(IX[d.seatIx], sitAct(IX[d.seatIx]))); if (pl) { pl.ix = [d.seatIx]; return pl; } }
    const T = { x: s.x, y: groundAt(s.x, s.y), z: s.y, ry: faceTo(s.x, s.y, s.look.x, s.look.y) }, plan = { kind: 'stand', T, q: poseOf('stand'), ix: [d.seatIx], ik: [] };
    if (d.phase === 'go' || d.phase === 'regrab') { const b = new THREE.Box3().setFromObject(d.seat), probeF = probe(T, plan.q); plan.ik = [0, 1].map(i => { const sh = worldOf(probeF.userData.objRig.shs[i], 0, 0, 0), q = b.clampPoint(sh, V3(0, 0, 0)); q.y = Math.max(Math.min(b.max.y, sh.y - .25), b.min.y + .05); return { i, p: q }; }); }
    return plan;
  }
  // the seat follows the dragger's own footsteps, L metres behind, and is pushed out of any wall
  function dragFollow(p, f) {
    const d = p.drag; if (!d || (d.phase !== 'pull' && d.phase !== 'back')) return;
    const tr = d.trail, last = tr[tr.length - 1];
    if (!last || Math.hypot(f.position.x - last.x, f.position.z - last.z) > .02) tr.push({ x: f.position.x, z: f.position.z });
    let need = d.L, px = f.position.x, pz = f.position.z, at = null;
    for (let i = tr.length - 2; i >= 0; i--) { const s = Math.hypot(tr[i].x - px, tr[i].z - pz); if (s >= need && s > 1e-6) { const e = need / s; at = { x: px + (tr[i].x - px) * e, z: pz + (tr[i].z - pz) * e, ry: Math.atan2(px - tr[i].x, pz - tr[i].z) }; break; } need -= s; px = tr[i].x; pz = tr[i].z; }
    if (!at) return;
    // a chair or a stool turns gently with the path; a sofa, a massage chair or a beanbag slides without turning (it turns only as it is set down)
    const c = seatWorld(d.seat), turns = d.kind === 'chair' || d.kind === 'stool'; let dy = at.ry + d.yawOff - c.ry; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    setSeatWorld(d.seat, at.x, at.z, turns ? c.ry + dy * .15 : c.ry); pushOutOfWalls(d.seat);
    const w = seatWorld(d.seat); d.maxAway = Math.max(d.maxAway, Math.hypot(w.x - d.homeW.x, w.z - d.homeW.z));
  }
  function stepDrag(dt) {
    people.forEach(p => {
      const d = p.drag; if (!d) return;
      const f = three.figures.get(p.id);
      if (d.settle) {
        const s = d.settle; s.t = reduce ? 1 : Math.min(1, s.t + dt / .4); const e = s.t * s.t * (3 - 2 * s.t); let dr = s.to.ry - s.from.ry; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
        setSeatWorld(d.seat, s.from.x + (s.to.x - s.from.x) * e, s.from.z + (s.to.z - s.from.z) * e, s.from.ry + dr * e);
        if (s.t < 1) pushOutOfWalls(d.seat); // the end pose was checked when it was chosen; on the way there, walls still push
        if (s.t >= 1) {
          d.settle = null;
          if (d.phase === 'putback') { const h = d.seat.userData.home; d.seat.position.x = h.x; d.seat.position.z = h.z; d.seat.rotation.y = h.rotY; d.seat.updateMatrixWorld(true); USE.lastDrag = d; p.drag = null; p.act = null; refreshPlaces(); return; }
          d.phase = 'use'; d.n++; d.useUntil = USE.t + d.useS; refreshPlaces(); return;
        }
      }
      if (d.phase === 'use' && USE.t > d.useUntil && f && !f.userData.walk && !f.userData.blend) { d.phase = 'regrab'; d.n++; refreshPlaces(); return; }
      // a hand on the seat while pulling it
      if (f && jointed(f) && f.userData.walk && (d.phase === 'pull' || d.phase === 'back')) { const b = new THREE.Box3().setFromObject(d.seat), sh = worldOf(f.userData.objRig.shs[0], 0, 0, 0), q = b.clampPoint(sh, V3(0, 0, 0)); q.y = Math.max(Math.min(b.max.y, sh.y - .3), b.min.y + .05); armTo(f, 0, q); }
    });
  }
  // ?test: drag one seat of every kind to its target and back; each must end on its home pose (1 cm, 1 degree) with no wall clash
  function dragTest() {
    const res = [], all = []; three.scene.traverse(o => { if (o.userData.movable) all.push(o); });
    refreshPlaces();
    for (const kind of ['chair', 'stool', 'beanbag', 'sofa', 'armchair']) {
      const cands = all.filter(o => o.userData.movable === kind), helper = people.find(q => q.role !== 'head' && !q.drag && q.state === 'idle') || people.find(q => q.role !== 'head' && !q.drag);
      // (the test frees the seat first: whoever sits on it at that moment stands up, so the result never depends on the clock)
      const free = o => { const si = seatIxOfObj(o); let moved = false; people.forEach(q => { if (q === helper) return; const f = three.figures.get(q.id), pl = f && f.userData.plan; if (USE.seatHolder.get(si) === q.id || (pl && (pl.ix || []).indexOf(si) >= 0)) { q.act = null; moved = true; } }); if (moved) refreshPlaces(); };
      let seat = null; for (const o of cands) { helper.act = null; free(o); if (startDrag(helper, o, { useS: .6 })) { seat = o; break; } }
      if (!seat) { res.push({ kind, ok: false, why: 'no free seat with a valid target among ' + cands.length }); continue; }
      const d = helper.drag, t = d.target; refreshPlaces();
      let steps = 0, clash = 0; const phases = [];
      let first = null;
      while (helper.drag && steps < 8000) { stepWalkers(.05); stepPoses(.05); if (steps % 4 === 0) { const cl = wallClash(); if (cl.length && !first) { const sw = seatWorld(seat); first = { at: steps, phase: helper.drag && helper.drag.phase, clash: cl, seat: [+sw.x.toFixed(2), +sw.z.toFixed(2), +sw.ry.toFixed(2)], home: [+d.homeW.x.toFixed(2), +d.homeW.z.toFixed(2)], grab: [+d.grab.x.toFixed(2), +d.grab.z.toFixed(2)], goal: d.goal && [+d.goal.x.toFixed(2), +d.goal.z.toFixed(2)], path: d.path, person: (f => f && [+f.position.x.toFixed(2), +f.position.z.toFixed(2)])(three.figures.get(helper.id)) }; } clash = Math.max(clash, cl.length); } const ph = helper.drag ? helper.drag.phase : 'done'; if (phases[phases.length - 1] !== ph) phases.push(ph); steps++; }
      const h = seat.userData.home, er = { dx: seat.position.x - h.x, dz: seat.position.z - h.z, dr: (seat.rotation.y - h.rotY) * 180 / Math.PI };
      const after = wallClash().length, ok = !helper.drag && Math.abs(er.dx) <= .01 && Math.abs(er.dz) <= .01 && Math.abs(er.dr) <= 1 && clash === 0 && after === 0 && d.maxAway > .25;
      res.push({ kind, ok, seat: IX[d.seatIx] ? IX[d.seatIx].name : kind, movedAwayM: +d.maxAway.toFixed(2), target: [+t.x.toFixed(2), +t.z.toFixed(2)], steps, phases: phases.join('>'), clashDuring: clash, clashAfter: after, homeErrCm: [+(er.dx * 100).toFixed(2), +(er.dz * 100).toFixed(2)], homeErrDeg: +er.dr.toFixed(3), firstClash: first });
    }
    refreshPlaces();
    return res;
  }
  // ---------- every object has a use: the actions added to objects that only had a switch (or nothing) ----------
  const EXTRA_ACTS = {
    'MacBook': [{ th: 'นั่งทำงานกับ MacBook', how: 'desk' }], 'จอมอนิเตอร์': [{ th: 'นั่งทำงานหน้าจอ', how: 'desk' }],
    'ทีวีห้องงีบ': [{ th: 'นั่งดูทีวีบนเตียง', how: 'via' }], 'พัดลมฟอกอากาศ': [{ th: 'ยืนรับลมเย็นหน้าพัดลม', how: 'front' }],
    'หุ่นยนต์ดูดฝุ่น': [{ th: 'เทฝุ่นในหุ่นยนต์ดูดฝุ่น', how: 'front', fx: ix => { const v = (three.vacuums || []).find(x => x.g === ix.obj); if (v) v.on = false; } }],
    'จักรยานไฟฟ้า': [{ th: 'นั่งคร่อมจักรยานไฟฟ้า', how: 'ride' }], 'จุดยืมจักรยาน': [{ th: 'สแกนปลดล็อกจักรยาน', how: 'front' }],
    'โต๊ะอาหาร': [{ th: 'นั่งกินข้าว', how: 'desk' }]
  };
  // reg() passes every object's actions through here: an object with no use of its own gets one, a movable seat gets its drag
  function withExtras(obj, name, acts) {
    const out = acts.slice();
    if (!out.some(a => a.how) && EXTRA_ACTS[name]) EXTRA_ACTS[name].forEach(a => out.push(Object.assign({}, a)));
    const mv = obj.userData.movable || (obj.parent && obj.parent.userData.movable);
    if (mv && DRAG_TH[mv] && !out.some(a => a.how === 'drag')) out.push({ th: DRAG_TH[mv], how: 'drag' });
    return out;
  }
  const inScene = o => { for (let a = o; a; a = a.parent) if (a === three.scene) return true; return false; };
  function usableIx(i) { const x = IX[i]; return x && !NOT_OBJECTS.has(x.name) && x.acts.some(a => a.how) && inScene(x.obj) && (x.obj.visible || x.obj.userData.swap); }
  const capOf = i => { const x = IX[i], k = x.acts.findIndex(a => a.how); return specFor(x, k).cap || 1; };
  const isKitchenIx = i => { const x = IX[i]; if (BREAK_KITCHEN.includes(x.name)) return true; const w = ixPos(x); return roomAtWorld(w.x, w.z) === 6; };
  // the least-used free object, from the kitchen 6 times in 10 (owner's break bias), across every object on the map
  function pickUse(p, kitchenFirst) {
    const now = Date.now(), inUse = new Map();
    people.forEach(q => { if (q === p) return; if (q.act && q.act.until > now && q.act.k === 'ix') inUse.set(q.act.ix, (inUse.get(q.act.ix) || 0) + 1); if (q.drag) inUse.set(q.drag.seatIx, 99); });
    USE.seatHolder.forEach((pid, i) => { if (pid !== p.id) inUse.set(i, Math.max(inUse.get(i) || 0, 99)); });
    const cand = IX.map((x, i) => i).filter(i => usableIx(i) && (inUse.get(i) || 0) < capOf(i));
    let pool = cand.filter(i => isKitchenIx(i) === !!kitchenFirst); if (!pool.length) pool = cand; if (!pool.length) return null;
    const n = i => USE.usage.get(i) || 0, least = Math.min(...pool.map(n)), top = pool.filter(i => n(i) === least), ix = top[Math.floor(Math.random() * top.length)];
    const acts = IX[ix].acts.map((a, k) => [a, k]).filter(([a]) => a.how);
    return { ix, a: acts[n(ix) % acts.length][1] };
  }
  // ?test: one fast cycle, logical (no walking): every round each person but the Head takes the break the scheduler picks,
  // and placeAll places it (the same code that counts uses live), until every object has been used once or the round cap
  // (4 x objects / people) is reached. Objects still unused are logged as UNUSED OBJECT.
  function usageCycle() {
    const saved = people.map(p => [p, p.act, p.drag, p.idleSeat]), keep = { usage: USE.usage, last: USE.lastUse, hold: USE.seatHolder };
    USE.usage = new Map(); USE.lastUse = new Map(); USE.logical = true;
    const objs = IX.map((x, i) => i).filter(usableIx), workers = people.filter(p => p.role !== 'head'), cap = Math.ceil(objs.length * 4 / Math.max(1, workers.length)) + 10;
    let rounds = 0, picks = 0, kitchen = 0;
    try {
      while (rounds < cap) {
        rounds++;
        workers.forEach(p => { p.act = null; p.drag = null; });
        workers.forEach(p => { const k = Math.random() < .6, pk = pickUse(p, k); if (pk) { p.act = { k: 'ix', ix: pk.ix, a: pk.a, until: Date.now() + ACT_MS }; picks++; if (isKitchenIx(pk.ix)) kitchen++; } });
        placeAll();
        if (objs.every(i => (USE.usage.get(i) || 0) > 0)) break;
      }
    } finally { USE.logical = false; }
    const unused = objs.filter(i => !(USE.usage.get(i) > 0)), counts = objs.map(i => USE.usage.get(i) || 0);
    const report = { definition: 'rounds of one break pick per non-Head person, placed by placeAll, until every object is used or 4 x objects / people rounds', objects: objs.length, people: workers.length, rounds, cap, picks, kitchenShare: +(kitchen / Math.max(1, picks)).toFixed(2), minUses: Math.min(...counts), maxUses: Math.max(...counts), unused: unused.map(i => IX[i].name + ' #' + i) };
    saved.forEach(([p, a, d, s]) => { p.act = a; p.drag = d; p.idleSeat = s; });
    USE.usage = keep.usage; USE.lastUse = keep.last; USE.seatHolder = keep.hold;
    return report;
  }
  // ---------- speech bubbles: never on top of each other, faded when a wall stands between the camera and the speaker ----------
  function layoutBubbles(w, h) {
    const cam = three.camera, v = new THREE.Vector3(), placed = [], frame = (USE.bf = (USE.bf || 0) + 1);
    const items = three.bubbles.map(a => {
      const f = a.obj || three.figures.get(a.pid); if (!f) return null;
      if (f.userData && jointed(f)) { f.userData.objRig.H.updateWorldMatrix(true, false); f.userData.objRig.H.getWorldPosition(v); v.y += .55; } else { f.getWorldPosition(v); v.y += a.y; }
      const wp = v.clone(); v.project(cam);
      return { a, x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, z: v.z, wp, bw: a.el.offsetWidth || 120, bh: a.el.offsetHeight || 32 };
    }).filter(Boolean).sort((p, q) => p.z - q.z);
    // a bubble's box is anchored at its bottom (translate -50%, -100%) and its tail hangs 7 px below that, so each one is the
    // rectangle [x - w/2, x + w/2] by [y - h, y + 7]; a bubble that meets one already placed moves up until its tail clears
    // that one's top, and again for every other it then meets (each move is upward, so this ends within the count placed)
    const POP = 1.06, TAIL = 7, GAP = 4, ext = (bw, bh) => ({ hx: bw * POP / 2, up: bh + bh * (POP - 1) / 2, dn: TAIL + bh * (POP - 1) / 2 }), meets = (r, x, y, bw, bh) => { const a = ext(r.bw, r.bh), b = ext(bw, bh); return Math.abs(r.x - x) < a.hx + b.hx + GAP && y + b.dn > r.y - a.up - GAP && y - b.up < r.y + a.dn + GAP; };
    items.forEach(it => {
      let y = it.y;
      for (let k = 0; k <= placed.length; k++) {
        const hits = placed.filter(r => meets(r, it.x, y, it.bw, it.bh));
        if (!hits.length) break; y = Math.min(...hits.map(r => r.y - ext(r.bw, r.bh).up)) - ext(it.bw, it.bh).dn - GAP - 1;
      }
      if (it.z < 1) placed.push({ x: it.x, y, bw: it.bw, bh: it.bh }); // (one behind the camera is hidden and takes no room)
      it.a.el.style.left = it.x.toFixed(1) + 'px'; it.a.el.style.top = y.toFixed(1) + 'px';
      it.a.el.style.visibility = it.z < 1 ? 'visible' : 'hidden';
      if (frame % 6 === 0 || it.a.occ === undefined) it.a.occ = occluded(cam.position, it.wp);
      it.a.el.classList.toggle('occluded', !!it.a.occ);
    });
  }
  function occluded(from, to) {
    if (!three.shell) return false;
    const rc = RC.o || (RC.o = new THREE.Raycaster()), d = to.clone().sub(from), L = d.length(); rc.set(from, d.normalize()); rc.far = L - .3;
    const walls = USE.occ || (USE.occ = three.shell.children.filter(m => m.isMesh && !(m.material && m.material.transparent && m.material.opacity < .6)));
    return rc.intersectObjects(walls, false).length > 0;
  }
  // ?test hooks for the object, pose and drag checks
  function useHooks() {
    return {
      IX, ACTS, render, placeAll, placeFigures, stepPoses, planSpot, specFor, partsOf, useRoot, USE, RIG, THREE, ixSpot, roomAtWorld, floorY, groundAt, BATCH, get reduce() { return reduce; },
      usage: () => IX.map((x, i) => i).filter(usableIx).map(i => ({ i, name: x_(i), n: USE.usage.get(i) || 0 })),
      cycle: () => USE.cycle, runCycle: () => (USE.cycle = usageCycle()), dragTest, dragWhy,
      plans: () => people.map(p => { const f = three.figures.get(p.id), pl = f && f.userData.plan; return { id: p.id, role: p.role, kind: pl && pl.kind, ix: pl && pl.ix, walking: !!(f && f.userData.walk) }; })
    };
  }
  const x_ = i => IX[i].name;
  // after the empty land is planted: a shrub that landed on the helipad (under the parked helicopter) moves to the pad's edge
  function useBootLate() {
    // a throw lying on the sofa belongs to the sofa, so it travels with it when the sofa is dragged (attach keeps its world pose)
    IX.forEach(x => {
      if (x.name !== 'ผ้าห่ม') return; const w = x.obj.getWorldPosition(V3(0, 0, 0));
      IX.forEach(s => { if (s.name !== 'โซฟา' || !s.obj.userData.movable) return; const b = new THREE.Box3().setFromObject(s.obj).expandByScalar(.05); if (b.containsPoint(w)) s.obj.attach(x.obj); });
    });
    // a beanbag laid over other furniture (the massage chair, the TV console) settles to the nearest free spot; that spot is its home
    const bags = []; three.scene.traverse(o => { if (o.userData.movable === 'beanbag') bags.push(o); });
    USE.layout = [];
    bags.forEach(b => {
      const h = seatWorld(b), ok = t => seatFits(b, t, null, 'beanbag') && !legZoneHit(b, t);
      if (ok(h)) return;
      const why = USE.fitWhy || 'leg room of a seat'; let best = null;
      for (let r = .1; r <= 1.6 && !best; r += .1) for (let k = 0; k < 24 && !best; k++) { const a = k / 24 * Math.PI * 2, t = { x: h.x + Math.cos(a) * r, z: h.z + Math.sin(a) * r, ry: h.ry }; if (roomAtWorld(t.x, t.z) === roomAtWorld(h.x, h.z) && ok(t)) best = t; }
      if (!best) { USE.layout.push({ seat: 'บีนแบ็ก', from: [+h.x.toFixed(2), +h.z.toFixed(2)], to: null, why }); return; }
      setSeatWorld(b, best.x, best.z, best.ry); b.userData.home = { x: b.position.x, z: b.position.z, rotY: b.rotation.y };
      USE.layout.push({ seat: 'บีนแบ็ก', why, from: [+h.x.toFixed(2), +h.z.toFixed(2)], to: [+best.x.toFixed(2), +best.z.toFixed(2)] });
    });
    USE.dirty = true;
    if (!three.heli) return;
    const c = three.heli.pad.getWorldPosition(V3(0, 0, 0)), R = 7.6;
    IX.forEach(x => {
      if (x.name !== 'พุ่มไม้') return; const o = x.obj, w = o.getWorldPosition(V3(0, 0, 0)), d = Math.hypot(w.x - c.x, w.z - c.z);
      if (d >= R) return;
      const a = d > .01 ? Math.atan2(w.z - c.z, w.x - c.x) : 0; o.position.x += c.x + Math.cos(a) * R - w.x; o.position.z += c.z + Math.sin(a) * R - w.z;
      const [ci, cj] = cellOf(c.x + Math.cos(a) * R, c.z + Math.sin(a) * R); for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) if (NAV.g && i >= 0 && j >= 0 && i < NAV.nx && j < NAV.nz) NAV.g[j * NAV.nx + i] = 1;
    });
  }
  // would a beanbag at t sit in the leg room of a seat nearby (where a sitter's shins and feet go, 35 to 85 cm ahead of each seat place)
  function legZoneHit(bag, t) {
    const w0 = seatWorld(bag); setSeatWorld(bag, t.x, t.z, t.ry);
    const ents = partsOf(bag, true).map(o => { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); return { o, box: new THREE.Box3().copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld), inv: new THREE.Matrix4().copy(o.matrixWorld).invert() }; });
    let hit = false;
    IX.forEach(x => {
      if (hit || x.name === 'บีนแบ็ก' || !isSeat(x)) return; const k = sitAct(x), cap = specFor(x, k).cap || 1;
      for (let slot = 0; slot < cap && !hit; slot++) {
        const s0 = ixSpot(x, x.acts[k], slot); if (Math.hypot(s0.x - t.x, s0.y - t.z) > 2.5) continue;
        const fw = objFwd(x, x.acts[k]), sd = V3(-fw.z, 0, fw.x), y0 = groundAt(s0.x, s0.y);
        for (const dz of [.35, .6, .85]) for (const dx of [-.15, .15]) for (const hh of [.1, .35]) { const p = V3(s0.x + fw.x * dz + sd.x * dx, y0 + hh, s0.y + fw.z * dz + sd.z * dx); if (ents.some(e => e.box.containsPoint(p) && insideMesh(e, p))) { hit = true; break; } }
      }
    });
    setSeatWorld(bag, w0.x, w0.z, w0.ry); return hit;
  }
  // exterior windows: glass that reflects the sky, with a faint painted room behind it (it glows warm at night as before)
  let WIN_TEX = null;
  function winGlass() {
    if (!WIN_TEX) WIN_TEX = ctex(256, 128, (g, w, h) => {
      const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#8da3b0'); bg.addColorStop(.55, '#6d7f8a'); bg.addColorStop(1, '#4f5a61'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,244,222,.55)'; g.fillRect(w * .12, h * .06, w * .76, h * .05);            // a ceiling light strip
      g.fillStyle = 'rgba(70,58,48,.55)'; g.fillRect(w * .06, h * .3, w * .2, h * .5);                 // a shelf against the back wall
      for (let k = 0; k < 4; k++) { g.fillStyle = `rgba(${[200, 150, 230, 120][k]},${[170, 120, 220, 90][k]},${[120, 90, 200, 60][k]},.5)`; g.fillRect(w * (.075 + k * .045), h * .36, w * .03, h * .12); }
      g.fillStyle = 'rgba(60,52,46,.6)'; g.fillRect(w * .36, h * .62, w * .4, h * .06); g.fillRect(w * .38, h * .68, w * .02, h * .3); g.fillRect(w * .73, h * .68, w * .02, h * .3); // a desk
      g.fillStyle = 'rgba(30,32,36,.65)'; g.fillRect(w * .5, h * .44, w * .14, h * .17);              // a monitor
      g.fillStyle = 'rgba(70,110,70,.55)'; g.beginPath(); g.ellipse(w * .88, h * .55, w * .05, h * .2, 0, 0, Math.PI * 2); g.fill(); // a plant
      const sh = g.createLinearGradient(0, 0, w, h); sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(.42, 'rgba(255,255,255,.28)'); sh.addColorStop(.5, 'rgba(255,255,255,0)'); g.fillStyle = sh; g.fillRect(0, 0, w, h); // a sky streak
    });
    return std(0xffffff, { map: WIN_TEX, emissive: 0xffd98a, emissiveMap: WIN_TEX, emissiveIntensity: 0, roughness: .06, metalness: .3, envMapIntensity: 1.6 });
  }
  function placeAll() {
    const team = people;
    const n = Math.max(6, team.length);
    const used = { meeting: 0, idle: [0, 0, 0], seat: new Set(), focus: 0 }, actUsed = {};
    const out = new Map(), now = Date.now();
    const meet = () => ACTS.meeting.spot(used.meeting++);
    team.forEach((p, i) => { const s = donutSeat(i, n); out.set(p.id, W(s.x, s.y, 8, 8.5, { room: 'ห้องทีม โต๊ะโดนัท', pose: p.state === 'working' || p.state === 'sweeping' ? 'type' : 'sit', look: { x: DONUT.cx, y: DONUT.cy } })); });
    people.forEach(p => {
      { const ds = dragSpot(p); if (ds) { out.set(p.id, ds); return; } }
      if (p.act && p.act.until > now && p.act.k === 'ix') {
        const ix = IX[p.act.ix], a = ix.acts[p.act.a], key = 'ix' + p.act.ix, i = actUsed[key] = (actUsed[key] || 0) + 1;
        out.set(p.id, Object.assign(ixSpot(ix, a, i - 1), { room: ix.name, act: a.th, ix: p.act.ix, a: p.act.a, slot: i - 1 })); return;
      }
      if (p.act && p.act.until > now && p.act.spot) { out.set(p.id, Object.assign({}, p.act.spot)); return; }
      if (p.act && p.act.until > now) {
        const a = ACTS[p.act.k], i = actUsed[p.act.k] = (actUsed[p.act.k] || 0) + 1;
        out.set(p.id, Object.assign(a.spot(i - 1), { room: a.room, act: a.th })); return;
      }
      p.act = null;
      if (p.state === 'working' && p.issue && (p.issue.size === 'L' || p.issue.size === 'XL') && used.focus < FOCUS.length) {
        const f = FOCUS[used.focus++]; out.set(p.id, W(f.x, 1.45, 13, 0, { room: 'ห้องสมาธิ', pose: 'type', look: { x: f.x, y: .3 } })); return;
      }
      if (p.role === 'head') { if (p.state === 'waiting') out.set(p.id, Object.assign(meet(), { room: 'ห้องประชุม' })); return; }
      if (p.state === 'waiting') out.set(p.id, Object.assign(meet(), { room: 'ห้องประชุม' }));
      if (p.state === 'idle') {
        const seats = three.idleSeats;
        if (seats.length) { // v59: the least-used free seat, kept until the person moves on
          const taken = st => USE.seatHolder.has(st.k) && USE.seatHolder.get(st.k) !== p.id;
          let j = p.idleSeat; if (j === undefined || p.idleKey !== p.idleSpot || used.seat.has(j) || !seats[j] || taken(seats[j])) { let bu = Infinity; j = 0; seats.forEach((st, k) => { if (used.seat.has(k) || taken(st)) return; const u = USE.usage.get(st.k) || 0; if (u < bu) { bu = u; j = k; } }); p.idleSeat = j; p.idleKey = p.idleSpot; }
          used.seat.add(j); const st = seats[j], ix = IX[st.k], a0 = Math.max(0, ix.acts.findIndex(a => a.how === 'sit')); out.set(p.id, Object.assign(ixSpot(ix, ix.acts[a0], st.i), { room: st.room, ix: st.k, a: a0, slot: st.i })); }
        else { const k = p.idleSpot % 3, list = SPOTS.idle[k], s = list[used.idle[k]++ % list.length]; out.set(p.id, W(s.x, s.y, s.a[0], s.a[1], { room: IDLE_ROOM[k], pose: 'stand', look: s.look || SPOTS.idleLook[k] })); }
      }
    });
    return useAssign(out);
  }

  // ---------- the neighbourhood (owner, 14 Oct 2026: "แมปโล่งมาก ... มีตึกอื่นๆ หรือ คนเดินไปมา ... NPC") ----------
  // Built in the front yard's frame (the same frame as the road, the river and the bridge).
  function facadeTex(wall, glass, lit) {
    return ctex(128, 128, (g, w) => {
      g.fillStyle = lit ? '#000' : wall; g.fillRect(0, 0, w, w);
      for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
        const x = 12 + c * 60, y = 14 + r * 60;
        if (lit) { g.fillStyle = rnd() < .6 ? '#ffd9a0' : '#000'; g.fillRect(x, y, 44, 40); continue; }
        g.fillStyle = '#2b2a29'; g.fillRect(x - 3, y - 3, 50, 46); g.fillStyle = glass; g.fillRect(x, y, 44, 40);
        g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x + 4, y + 4, 12, 32);
      }
    });
  }
  function signTex(text, bg, fg) {
    return ctex(512, 128, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = '700 54px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4); });
  }
  let _plaster = null;
  function plasterTex() {
    if (_plaster) return _plaster;
    _plaster = ctex(256, 256, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { const v = 225 + Math.floor(Math.random() * 30); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); } g.strokeStyle = 'rgba(0,0,0,.05)'; for (let y = 0; y < h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } });
    _plaster.wrapS = _plaster.wrapT = THREE.RepeatWrapping; return _plaster;
  }
  function townBuilding(parent, x, z, w, d, floors, opt) {
    const g = grp(parent, x, 0, z, opt.ry || 0), h = floors * 3.2;
    const wallC = new THREE.Color(opt.wall), trimM = std(opt.trim || 0x2b2a29, { roughness: .7 });
    const grain = plasterTex(); const wt = grain.clone(); wt.needsUpdate = true; wt.repeat.set(w / 3, h / 3);
    mesh(g, B(w, h, d), std(wallC.getHex(), { map: wt, roughness: .92 }), 0, h / 2, 0);
    mesh(g, B(w + .12, .6, d + .12), std(0x8d877e, { roughness: .95 }), 0, .3, 0);
    for (let f = 1; f < floors; f++) mesh(g, B(w + .1, .16, d + .1), trimM, 0, f * 3.2, 0);
    mesh(g, B(w + .3, .28, d + .3), trimM, 0, h + .14, 0);
    const shop = !!(opt.sign || opt.awning || opt.tables);
    // windows as instances: frame, recessed glass that lights up at night, and a sill, on all four faces
    const glassM = std(0x6f8796, { roughness: .08, metalness: .55, emissive: 0xffd9a0, emissiveIntensity: 0 }); three.townWin.push(glassM);
    const spots = [];
    const face = (len, off, ry, nx, nz) => { const bays = Math.max(1, Math.round(len / 2.6)); for (let f = 0; f < floors; f++) for (let b = 0; b < bays; b++) {
      const u = -len / 2 + (b + .5) * len / bays; if (f === 0 && (shop && nz > 0)) continue; if (f === 0 && nz > 0 && Math.abs(u - (opt.doorX || 0)) < 1.2) continue;
      spots.push({ x: nx ? nx * off : u, z: nz ? nz * off : u, y: f * 3.2 + 1.75, ry }); } };
    face(w, d / 2, 0, 0, 1); face(w, d / 2, Math.PI, 0, -1); face(d, w / 2, Math.PI / 2, 1, 0); face(d, w / 2, -Math.PI / 2, -1, 0);
    const inst = (geo, m, dz, dy) => { const im = new THREE.InstancedMesh(geo, m, spots.length), o = new THREE.Object3D();
      spots.forEach((s, i) => { o.position.set(s.x, s.y + dy, s.z); o.rotation.set(0, s.ry, 0); o.translateZ(dz); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
      im.receiveShadow = true; g.add(im); return im; };
    if (spots.length) { inst(B(1.3, 1.65, .1), std(0x2b2a29, { roughness: .5 }), .03, 0); inst(B(1.1, 1.45, .04), glassM, .07, 0); inst(B(1.5, .07, .22), std(0xd6d0c4, { roughness: .8 }), .1, -.86); inst(B(.04, 1.45, .05), std(0x2b2a29, { roughness: .5 }), .09, 0); }
    // ground floor: a glazed shopfront with mullions, or a framed door with a canopy
    if (shop) {
      mesh(g, B(w * .86, 2.6, .06), glassM, 0, 1.9, d / 2 + .03);
      for (let i = 0; i <= 5; i++) mesh(g, B(.07, 2.7, .1), trimM, -w * .43 + i * w * .86 / 5, 1.9, d / 2 + .05);
      mesh(g, B(w * .88, .12, .12), trimM, 0, 3.25, d / 2 + .05);
    }
    // balconies with glass railings on homes and apartments
    if (opt.balcony || (!shop && !opt.gable && floors >= 3)) for (let f = 1; f < floors; f++) [-w / 4, w / 4].forEach(bx => {
      mesh(g, B(2.2, .12, 1.0), std(0xd6d0c4, { roughness: .8 }), bx, f * 3.2 + .06, d / 2 + .5);
      mesh(g, B(2.2, .9, .03), std(0xcfe3ea, { transparent: true, opacity: .35, roughness: .05, depthWrite: false }), bx, f * 3.2 + .57, d / 2 + .99);
      mesh(g, B(2.24, .04, .06), trimM, bx, f * 3.2 + 1.03, d / 2 + .99);
    });
    // roof: parapet, rooftop air conditioners and a water tank
    if (!opt.gable) {
      [[0, d / 2], [0, -d / 2]].forEach(([px, pz]) => mesh(g, B(w, .8, .15), std(wallC.getHex(), { roughness: .9 }), px, h + .55, pz));
      [[w / 2, 0], [-w / 2, 0]].forEach(([px, pz]) => mesh(g, B(.15, .8, d), std(wallC.getHex(), { roughness: .9 }), px, h + .55, pz));
      mesh(g, B(1.1, .8, .8), std(0xb9bcbf, { roughness: .5, metalness: .4 }), -w / 4, h + .55, -d / 4);
      mesh(g, B(1.1, .8, .8), std(0xb9bcbf, { roughness: .5, metalness: .4 }), -w / 4 + 1.4, h + .55, -d / 4);
      mesh(g, Cy(.6, .6, 1.4, 18), std(0xe9e4d8, { roughness: .6 }), w / 4, h + .85, -d / 6);
    }
    if (opt.gable) { const roof = mesh(g, new THREE.CylinderGeometry(0, Math.hypot(w, d) / 2 * .78, 2.2, 4), std(opt.roof || 0x5a3a24, { roughness: .8 }), 0, h + 1.4, 0); roof.rotation.y = Math.PI / 4; roof.scale.set(w / Math.hypot(w, d) * 1.45, 1, d / Math.hypot(w, d) * 1.45);
      const cap = mesh(g, roof.geometry, M.snow, 0, h + 1.47, 0); cap.rotation.y = Math.PI / 4; cap.scale.copy(roof.scale).multiplyScalar(1.025); cap.castShadow = false; three.snowOnly.push(cap); } // v59: snow on the roofs (audit gap 14)
    else { const cap = mesh(g, B(w - .32, .07, d - .32), M.snow, 0, h + .2, 0); cap.castShadow = false; three.snowOnly.push(cap); }
    if (opt.sign) { const s = mesh(g, new THREE.PlaneGeometry(Math.min(w * .8, 6), 1.1), std(0xffffff, { map: signTex(opt.sign, opt.signBg || '#1f1d1c', opt.signFg || '#f4f1ea'), emissive: 0xffffff, emissiveIntensity: .15, roughness: .6 }), 0, 3.1, d / 2 + .03); three.townWin.push(s.material); }
    if (opt.awning) { const a = mesh(g, B(w * .9, .08, 1.4), std(opt.awning, { roughness: .9 }), 0, 2.7, d / 2 + .7); a.rotation.x = .25; }
    const dx0 = opt.doorX || 0;
    mesh(g, B(1.5, 2.55, .1), trimM, dx0, 1.27, d / 2 + .03); mesh(g, B(1.2, 2.3, .06), std(0x3a2a20, { roughness: .45 }), dx0, 1.15, d / 2 + .07);
    mesh(g, B(.3, .06, .03), M.chrome, dx0 + .4, 1.1, d / 2 + .11);
    if (!shop) mesh(g, B(1.9, .1, 1.1), trimM, dx0, 2.75, d / 2 + .55);
    mesh(g, B(1.8, .14, .7), std(0x9a948a, { roughness: .95 }), dx0, .07, d / 2 + .35);
    if (opt.tables) for (let i = 0; i < 2; i++) { const tx = -w / 4 + i * w / 2; mesh(g, Cy(.4, .4, .04, 18), M.walnut, tx, .75, d / 2 + 2.2); mesh(g, Cy(.05, .05, .75, 8), M.black, tx, .37, d / 2 + 2.2); [-.7, .7].forEach(o => mesh(g, B(.42, .45, .42), std(0x2b2a29), tx + o, .23, d / 2 + 2.2)); }
    reg(g, opt.name, [{ th: opt.act || 'แวะไปที่นี่', how: 'front', d: d / 2 + 1.6, spread: .8 }]);
    return g;
  }
  // a small dog for a dog walker (v58): body, head with snout and ears, a lead, and two leg pairs that trot
  function dog(color) {
    const g = new THREE.Group(), fur = std(color, { roughness: .9 }), dark = std(0x1f1d1c, { roughness: .4 });
    const body = mesh(g, Cy(.09, .085, .42, 14), fur, 0, .3, 0); body.rotation.x = Math.PI / 2;
    mesh(g, Sp(.1, 14, 10), fur, 0, .4, .25).scale.set(.9, .95, 1.05);
    mesh(g, B(.08, .07, .1), fur, 0, .37, .35); mesh(g, Sp(.022, 8, 6), dark, 0, .39, .405);
    [-1, 1].forEach(s => { const e = mesh(g, B(.04, .08, .03), fur, s * .06, .48, .22); e.rotation.z = s * .35; mesh(g, Sp(.013, 8, 6), dark, s * .038, .43, .335); });
    const tail = mesh(g, Cy(.015, .01, .18, 8), fur, 0, .38, -.27); tail.rotation.x = -.7;
    g.userData.legs = [];
    [.15, -.15].forEach(z => { const pair = grp(g, 0, .26, z); [-1, 1].forEach(s => mesh(pair, Cy(.025, .02, .26, 8), fur, s * .055, -.13, 0)); g.userData.legs.push(pair); });
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    mergeOwn(g, { perParent: true, drop: true });
    return g;
  }
  function car(color) {
    const g = new THREE.Group(), paint = std(color, { roughness: .3, metalness: .6 });
    mesh(g, B(1.8, .6, 4.2), paint, 0, .55, 0);
    mesh(g, B(1.6, .55, 2.2), std(0x1d2a33, { roughness: .05, metalness: .6, transparent: true, opacity: .9 }), 0, 1.1, -.2);
    mesh(g, B(1.62, .08, 2.0), paint, 0, 1.4, -.2);
    [[-.85, 1.3], [.85, 1.3], [-.85, -1.3], [.85, -1.3]].forEach(([x, z]) => { const wh = mesh(g, Cy(.34, .34, .25, 18), M.black, x, .34, z); wh.rotation.z = Math.PI / 2; });
    [-.6, .6].forEach(x => mesh(g, B(.3, .14, .05), std(0xfff6dd, { emissive: 0xffe9b0, emissiveIntensity: .5 }), x, .62, 2.11));
    [-.6, .6].forEach(x => mesh(g, B(.3, .12, .05), std(0x8a1f1f, { emissive: 0xff3b3b, emissiveIntensity: .4 }), x, .62, -2.11));
    return g;
  }
  function town(front) {
    // sidewalks on both sides of the road
    [[15.95, .9], [19.75, .9]].forEach(([z, dd]) => block(front, -70, z, 160, dd, .12, M.paver, .002));
    // shops and offices along the road, west and east of the office
    townBuilding(front, -14, 10, 9, 7, 2, { name: 'คาเฟ่ Bean Bridge', sign: 'BEAN BRIDGE', wall: '#e9e1d3', awning: 0x6b4630, tables: true, act: 'แวะซื้อกาแฟ' });
    townBuilding(front, -27, 9.5, 10, 8, 3, { name: 'Riverside Co-working', sign: 'RIVERSIDE CO-WORK', wall: '#d9cbb4', trim: 0x1f1d1c, act: 'แวะคุยงาน' });
    townBuilding(front, -40, 10, 8, 7, 2, { name: 'มินิมาร์ท', sign: 'MINI MART 24H', signBg: '#6b4630', wall: '#f4f1ea', awning: 0x1f1d1c, act: 'แวะซื้อขนม' });
    townBuilding(front, -54, 9, 12, 9, 5, { name: 'ตึกสำนักงาน', wall: '#cfc8bc', trim: 0x2b2a29, act: 'แวะดูตึก' });
    townBuilding(front, 52, 10, 9, 7, 2, { name: 'ร้านดอกไม้', sign: 'FLORA', wall: '#f2ece2', awning: 0x7d8f5a, act: 'แวะซื้อดอกไม้' });
    townBuilding(front, 64, 9.5, 11, 9, 4, { name: 'อพาร์ตเมนต์', wall: '#d8cfc2', trim: 0x5a3a24, act: 'แวะเยี่ยมเพื่อน' });
    townBuilding(front, 77, 10, 9, 8, 2, { name: 'ร้านอาหาร', sign: 'RIVER KITCHEN', wall: '#e3d8c6', awning: 0x8a5a36, tables: true, act: 'แวะกินข้าว' });
    // a row of houses across the river, reached over the bridge
    [-26, -14, -2, 22, 34].forEach((hx, k) => townBuilding(front, hx, 44 + (k % 2) * 1.5, 7, 7, 2, { name: 'บ้านริมน้ำ', wall: ['#f4f1ea', '#e9e1d3', '#d9cbb4'][k % 3], gable: true, roof: [0x5a3a24, 0x2b2a29, 0x6b4630][k % 3], ry: Math.PI, act: 'แวะทักทายเพื่อนบ้าน' }));
    for (let x = -30; x < 40; x += 8) if (Math.abs(x - 8) > 4) tree(front, x, 39.5, .9);
    streetscape(front);
    // traffic (v59): built by buildVehicles() once the map stands: one-way, weighted, with the riverside showroom
    three.cars = []; VEH.front = front;
    // NPCs: walkers and joggers on the sidewalks, two people who cross the bridge, two cyclists
    three.npcs = [];
    // each passer-by is a kind (v58), picked per idx so no two neighbours on a path dress alike; a dog walker's dog follows
    const KIND = { 1: 'walker', 2: 'tourist', 3: 'jogger', 4: 'dogwalker', 5: 'walker', 6: 'tourist', 7: 'dogwalker', 8: 'walker' };
    const add = (path, run, loop, idx) => {
      const type = KIND[idx] || 'walker', f = makeHuman(type, idx, 'stand'); f.position.set(path[0].x, .08, path[0].z); front.add(f);
      const npc = { f, path, i: 1, run, loop, speed: run ? 3.2 : 1.25, phase: Math.random() * 6, type };
      if (type === 'dogwalker') { npc.dog = dog([0xc9a26b, 0x2a2725, 0xe9e4d8][idx % 3]); npc.dog.position.set(path[0].x + .5, 0, path[0].z); front.add(npc.dog); }
      reg(f, 'คนเดินผ่าน', [{ th: 'ทักทาย', fx: ix => sayObj(ix.obj, pick(['สวัสดีค่าา อากาศดีเนอะ', 'หวัดดี ออฟฟิศนี้น่ารักมาก', 'วิ่งอยู่ ไว้คุยกันนะ', 'ร้านกาแฟตรงนั้นอร่อยนะ ลองดู'])) },
        { th: 'ชวนคนในออฟฟิศมาคุย', fx: () => { const p = actorFor(); if (p) chatWithNpc(p, npc); } }]);
      three.npcs.push(npc);
    };
    const lane = (z, x0, x1) => [{ x: x0, z }, { x: x1, z }];
    add(lane(16.4, -60, 70), false, 'pingpong', 1); add(lane(16.2, 65, -55), false, 'pingpong', 2);
    add(lane(20.2, -50, 72), true, 'pingpong', 3); add(lane(20.3, 60, -62), false, 'pingpong', 4);
    add(lane(16.6, 10, -40), false, 'pingpong', 5); add(lane(20.1, -20, 40), false, 'pingpong', 6);
    const bz = three.bridgeZ || 29;
    add([{ x: 8.3, z: 20.6 }, { x: 8.3, z: bz - 7 }, { x: 8.3, z: bz + 7 }, { x: 4, z: 42 }], false, 'pingpong', 7);
    add([{ x: 7.7, z: 41 }, { x: 7.7, z: bz + 7 }, { x: 7.7, z: bz - 7 }, { x: 13, z: 20.6 }], false, 'pingpong', 8);
    three.cyclists = [];
    [[17.4, 1, -35, 0x7d8f5a], [19.2, -1, 25, 0x3a3532]].forEach(([z, dir, x, c], k) => {
      // v58: the first is a delivery rider (orange jacket, helmet, an insulated box on the rack), the second a cyclist in a helmet
      const type = k === 0 ? 'rider' : 'cyclist';
      const g = new THREE.Group(); ebike(g, 0, 0, 0); const r = makeHuman(type, 10 + k, 'sit'); r.position.set(0, .38, -.18); r.scale.setScalar(.95); g.add(r);
      if (type === 'rider') { const bx = grp(g, 0, .78, -.62); mesh(bx, B(.42, .38, .4), std(0xd9653b, { roughness: .55 }), 0, 0, 0); mesh(bx, B(.43, .04, .41), std(0x2a2b2d, { roughness: .5 }), 0, .2, 0); mesh(bx, B(.3, .08, .005), std(0xf4f4f2, { roughness: .4 }), 0, .02, .203); mergeOwn(bx); }
      g.position.set(x, 0, z); g.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2; front.add(g); three.cyclists.push({ g, dir, speed: 4.5, type });
    });
  }
  function bridgeY(x, z) {
    const bz = three.bridgeZ || 29; if (Math.abs(x - 8) > 1 || Math.abs(z - bz) > 5.5) return 0;
    const t = (z - (bz - 5.5)) / 11; return .2 + Math.sin(t * Math.PI) * 1.3 + .05;
  }
  function stepTown(dt) {
    stepVehicles(dt); // v59: road traffic, the showroom drive and the river boats
    (three.npcs || []).forEach(n => {
      if (n.pause > performance.now()) {
        const f = n.f; CHARS.moving(f, 0); (f.userData.legs || []).forEach(l => { l.rotation.x = 0; }); (f.userData.arms || []).forEach(a => { a.rotation.x = 0; });
        f.rotation.x = 0; if (n.run) (f.userData.elbows || []).forEach(e => { e.rotation.x = -.12; });
        if (n.face) { const wp = f.getWorldPosition(new THREE.Vector3()), want = Math.atan2(n.face.x - wp.x, n.face.z - wp.z); let d = want - f.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); f.rotation.y += d * Math.min(1, dt * 6); }
        if (n.dog) stepDog(n, dt, false);
        return;
      }
      const f = n.f, tgt = n.path[n.i], dx = tgt.x - f.position.x, dz = tgt.z - f.position.z, dist = Math.hypot(dx, dz), stepLen = n.speed * dt;
      if (dist <= stepLen) { n.i += n.dir || 1; if (n.i >= n.path.length || n.i < 0) { n.dir = -(n.dir || 1); n.i += 2 * n.dir; } }
      else { f.position.x += dx / dist * stepLen; f.position.z += dz / dist * stepLen; }
      const want = Math.atan2(dx, dz); let d = want - f.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); f.rotation.y += d * Math.min(1, dt * 8);
      if (f.userData.rig) { CHARS.moving(f, n.speed, n.run); f.position.y = .08 + bridgeY(f.position.x, f.position.z); f.rotation.x = 0; n.phase += dt * n.speed * 3; if (n.dog) stepDog(n, dt, true); return; }
      n.phase += dt * n.speed * (n.run ? 2.6 : 3.4);
      const amp = n.run ? .85 : .5, sw = Math.sin(n.phase), legs = f.userData.legs, arms = f.userData.arms;
      if (legs[0]) { legs[0].rotation.x = sw * amp; legs[1].rotation.x = -sw * amp; }
      if (arms[0]) { arms[0].rotation.x = -sw * amp * .8; arms[1].rotation.x = sw * amp * .8; }
      f.position.y = .08 + bridgeY(f.position.x, f.position.z) + Math.abs(Math.cos(n.phase)) * (n.run ? .06 : .03);
      // v58: the same lean as a walking or running staff member; a jogger runs with bent elbows
      f.rotation.x = n.run ? .12 : .03;
      if (n.run) (f.userData.elbows || []).forEach(e => { e.rotation.x = -1.35; });
      if (n.dog) stepDog(n, dt, true);
    });
  }
  // the dog trots half a metre to the walker's right and a little behind, turning with them
  function stepDog(n, dt, moving) {
    const d = n.dog, f = n.f, ry = f.rotation.y, k = Math.min(1, dt * 4);
    const tx = f.position.x + Math.cos(ry) * -.55 - Math.sin(ry) * .35, tz = f.position.z - Math.sin(ry) * -.55 - Math.cos(ry) * .35;
    d.position.x += (tx - d.position.x) * k; d.position.z += (tz - d.position.z) * k; d.position.y = bridgeY(d.position.x, d.position.z);
    let r = ry - d.rotation.y; r = Math.atan2(Math.sin(r), Math.cos(r)); d.rotation.y += r * Math.min(1, dt * 5);
    const sw = moving ? Math.sin(n.phase * 1.6) * .6 : 0; d.userData.legs[0].rotation.x = sw; d.userData.legs[1].rotation.x = -sw;
  }
  // ---------- vehicles and boats (v59, owner 14 Oct 2026) ----------
  // "ปรับรถให้สมจริง เรือให้สมจริง", "สีให้มันเข้มและเท่ห์มีเทสกว่านี้", "อยากให้รถที่ขับผ่านมีความหลากหลาย",
  // "ริมแม่น้ำเยื้องออฟฟิศ มารถเหล่านั้นมาจอดเรียงกัน", "อยากให้มีเรือสัญจรจริงในแม่น้ำหน้าออฟฟิศ มีคนนั่ง มีคนขับ".
  // Model agnostic: every vehicle is a role in VEHICLES and its glTF is the key glb names in EMBED_GLB, so a better model
  // later is one line (glb, plus paint when its body-paint material has another name). A model is scaled on load so its
  // length is size[2] (and its width at most size[0]), centred, wheels on the ground, front +Z; size is also what the
  // traffic lanes and the showroom bays are planned with, so a swapped model always fits the bay it was planned for.
  // Nothing here draws from rnd() or srnd(): the map's seeded sequences stay exactly as they were.
  const VEHICLES = {
    sedan:     { glb: 'veh_car_sedan', size: [1.81, 1.18, 4.22], paint: 'Blue', type: 'driver', weight: 18 },
    hatch:     { glb: 'veh_car_hatchback', size: [1.64, 1.15, 3.31], paint: 'LightBlue', type: 'driver', weight: 16 },
    suv:       { glb: 'veh_car_suv', size: [2.11, 1.53, 4.21], paint: 'White', type: 'driver', weight: 14 },
    pickup:    { glb: 'veh_car_pickup', size: [2.31, 1.85, 5.18], recolor: { hue: [180, 225], sat: .2 }, type: 'driver', weight: 12 },
    taxi:      { glb: 'veh_car_taxi', size: [1.81, 1.31, 4.22], livery: true, type: 'driver', weight: 12 },
    police:    { glb: 'veh_car_police', size: [1.96, 1.36, 4.1], livery: true, type: 'police', weight: 3, bar: { mats: { BlueLights: 0x2f6bff, WhiteLights: 0xff2a2a } } },
    supercar:  { glb: 'veh_car_supercar', size: [2.26, 1.15, 4.8], recolor: { hue: [30, 70], sat: .35 }, type: 'driver', weight: 1, lamps: true },
    ambulance: { glb: 'veh_car_ambulance', size: [2.49, 2.67, 5.6], livery: true, type: 'ambulance', weight: 2, lamps: true,
      bar: { boxes: [{ c: [-.75, 2.71, -.05], s: [.45, .09, .14], hex: 0xff2a2a }, { c: [.75, 2.71, -.05], s: [.45, .09, .14], hex: 0x2f6bff }] } },
    parcel:    { glb: 'veh_car_parcel_van', size: [2.2, 2.6, 5.0], paint: '07___Default', fixedPaint: 0x23292f, type: 'parcel', weight: 8, lamps: true, decal: 'parcel' },
    icecream:  { glb: 'veh_car_icecream_truck', size: [3.06, 4.34, 5.43], livery: true, type: 'icecream', weight: 4, decal: 'icecream', hatch: true, sign: 'icecream_sign' },
    scooter:   { glb: 'veh_motorbike_scooter', size: [.65, 1.28, 1.85], livery: true, type: 'rider', weight: 10, narrow: true, lamps: true, rider: [0, .78, -.2] },
    // the riverside showroom: the owner's brands ("แลมโบ พอร์ช คาเยน แมคลาเรน", "ออดี้ กับ volvo และมินิคูเปอร์"). Until the owner's
    // models arrive each slot borrows the nearest model here; swapping one in is its glb line (and size, the real car's W, H, L).
    // v60: "Car Concept" by Eric Chadwick, Darmstadt Graphics Group GmbH, CC BY 4.0 (logos removed; see assets/cars2-manifest.json).
    // Own head and brake lamps (Headlight, Brakelight); 'Paint 1 Carmine' takes the dark paint, 'Paint 2 Carmine' stays near black.
    lambo:     { glb: 'veh_car2_concept', size: [2.54, 1.15, 4.35], paint: 'Paint 1 Carmine', type: 'driver', show: 10 },
    mclaren:   { glb: 'veh_car_supercar', size: [2.26, 1.15, 4.8], recolor: { hue: [30, 70], sat: .35 }, type: 'driver', lamps: true, show: 10 },
    cayenne:   { glb: 'veh_car_suv', size: [2.11, 1.53, 4.21], paint: 'White', type: 'driver', show: 10 },
    audi:      { glb: 'veh_car_sedan', size: [1.81, 1.18, 4.22], paint: 'Blue', type: 'driver', show: 9 },
    volvo:     { glb: 'veh_car_suv', size: [2.11, 1.53, 4.21], paint: 'White', type: 'driver', show: 9 },
    mini:      { glb: 'veh_car_hatchback', size: [1.64, 1.15, 3.31], paint: 'LightBlue', type: 'driver', show: 9 },
    heli:      { glb: 'veh_heli_civil', keepOrigin: true, rotor: 'rotor_main' },
    watertaxi: { glb: 'veh_boat_watertaxi', keepOrigin: true, axis: [.72, 1, 1], livery: true, boat: true }
  };
  // dark, tasteful paints; pearl white only now and then. Emergency, taxi and delivery liveries keep their own colours.
  const PAINTS = [
    { name: 'gloss black', hex: 0x0b0c0e, r: .2, met: .55, cc: 1, w: 1.2 }, { name: 'matte black', hex: 0x18191b, r: .62, met: .1, cc: .15, w: .7 },
    { name: 'gunmetal', hex: 0x2c3036, r: .3, met: .7, cc: 1, w: 1 }, { name: 'nardo grey', hex: 0x7c7f81, r: .34, met: .2, cc: 1, w: 1 },
    { name: 'deep navy', hex: 0x0f1a30, r: .28, met: .55, cc: 1, w: 1 }, { name: 'british racing green', hex: 0x0d3524, r: .3, met: .45, cc: 1, w: 1 },
    { name: 'dark burgundy', hex: 0x47101a, r: .3, met: .5, cc: 1, w: 1 }, { name: 'pearl white', hex: 0xe4e1da, r: .26, met: .25, cc: 1, w: .35 }
  ];
  // where the liveries sit on these two models (the box sides, measured on the files); a new model moves them here
  const VEH_DECAL = { icecream: { x: -1.47 }, parcel: { x: .945 } };
  const ROAD = { x0: -68, x1: 88, kerbR: 19.48, bikeZ: 17.3, deckY: .12, quay: 2.5, back: 20.7 };
  ROAD.len = ROAD.x1 - ROAD.x0;
  const SHOW_ROLES = Object.keys(VEHICLES).filter(r => VEHICLES[r].show);
  const SHOW_A = Math.PI / 3, SHOW_X = [30, 70, 48], SHOW_R = +((location.search.match(/[?&]vehR=([\d.]+)/) || [])[1] || 3.4); // bay angle; the stretch searched (front-frame x) and its preferred middle
  const VEH = { front: null, land: null, road: [], show: [], boats: [], tpl: new Map(), t: 0, night: 0, nightAt: -9, seed: 140726, active: null, nextAt: 14, gap: 16, cam: null, lit: [] };
  const vrnd = () => { VEH.seed = (VEH.seed * 16807) % 2147483647; return (VEH.seed - 1) / 2147483646; };
  const vpick = (list, w) => { const tot = list.reduce((a, x) => a + w(x), 0); let r = vrnd() * tot; for (const x of list) { r -= w(x); if (r <= 0) return x; } return list[list.length - 1]; };
  const ss01 = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

  // ----- procedural textures (drawn here, CC0) -----
  function vehCanvasTex(w, h, draw, normal) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = MAX_ANISO;
    t.colorSpace = normal ? THREE.NoColorSpace : THREE.SRGBColorSpace; return t;
  }
  function flakeTex() {
    return VEH.flake || (VEH.flake = vehCanvasTex(256, 256, (g, w, h) => {
      const d = g.createImageData(w, h);
      for (let i = 0; i < w * h; i++) { const a = vrnd() * 6.283, k = vrnd() < .35 ? 60 * vrnd() : 8 * vrnd(); d.data[i * 4] = 128 + Math.cos(a) * k; d.data[i * 4 + 1] = 128 + Math.sin(a) * k; d.data[i * 4 + 2] = 255; d.data[i * 4 + 3] = 255; }
      g.putImageData(d, 0, 0);
    }, true));
  }
  function treadTex() {
    return VEH.tread || (VEH.tread = vehCanvasTex(64, 64, (g, w, h) => {
      const d = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, s = Math.sin(x / w * Math.PI * 2 * 4), groove = Math.abs(((y / h) * 2 + (x % 16 < 8 ? .25 : 0)) % 1 - .5) < .08 ? 1 : 0; d.data[i] = 128 + s * 70; d.data[i + 1] = 128 + groove * 90 * Math.sign(s || 1); d.data[i + 2] = 230; d.data[i + 3] = 255; }
      g.putImageData(d, 0, 0);
    }, true));
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function decalTex(kind) {
    VEH.decals = VEH.decals || {};
    if (VEH.decals[kind]) return VEH.decals[kind];
    const t = kind === 'icecream' ? vehCanvasTex(512, 256, (g, w, h) => {
      // the ice-cream livery over the source model's sushi lettering: cream panel, pink drip, three cones
      g.fillStyle = '#f7efe2'; roundRect(g, 4, 4, w - 8, h - 8, 26); g.fill();
      g.fillStyle = '#f2a7c3'; g.beginPath(); g.moveTo(4, 30); for (let x = 4; x <= w - 4; x += 32) { g.quadraticCurveTo(x + 8, 70, x + 16, 36); g.quadraticCurveTo(x + 24, 52, x + 32, 30); } g.lineTo(w - 4, 4); g.lineTo(4, 4); g.closePath(); g.fill();
      [[70, '#8fd3c1'], [130, '#f6d36b'], [190, '#c98a5a']].forEach(([x, c]) => {
        g.fillStyle = '#d9a35f'; g.beginPath(); g.moveTo(x - 24, 150); g.lineTo(x + 24, 150); g.lineTo(x, 222); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(120,70,30,.45)'; g.lineWidth = 2; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(x + k * 9 - 10, 150); g.lineTo(x + k * 4, 210); g.stroke(); }
        g.fillStyle = c; g.beginPath(); g.arc(x, 132, 30, 0, Math.PI * 2); g.fill();
      });
      g.fillStyle = '#5a2e3a'; g.font = '700 74px "IBM Plex Sans Thai", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('ไอศกรีม', 238, 128);
      g.fillStyle = '#c2417a'; g.font = '700 30px "Bai Jamjuree", sans-serif'; g.fillText('ICE CREAM', 244, 194);
    }) : vehCanvasTex(512, 256, (g, w, h) => {
      // the delivery livery: a charcoal van with an amber band, a parcel mark and the words
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#e8a33a'; g.fillRect(0, 150, w, 26);
      g.fillStyle = '#f4f1ea'; roundRect(g, 24, 34, 96, 96, 10); g.fill();
      g.fillStyle = '#e8a33a'; g.fillRect(24, 68, 96, 14); g.fillRect(64, 34, 16, 96);
      g.fillStyle = '#f4f1ea'; g.font = '700 64px "IBM Plex Sans Thai", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('ส่งพัสดุด่วน', 140, 84);
      g.font = '600 26px "Bai Jamjuree", sans-serif'; g.fillText('PARCEL EXPRESS', 144, 214);
    });
    if (kind !== 'icecream') t.premultiplyAlpha = false;
    return (VEH.decals[kind] = t);
  }
  function foamTex() {
    return VEH.foam || (VEH.foam = vehCanvasTex(128, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) { const y = vrnd() * h, fade = 1 - y / h, x = w / 2 + (vrnd() - .5) * w * (.3 + .7 * y / h); g.fillStyle = `rgba(255,255,255,${(.12 + .5 * vrnd()) * fade})`; g.beginPath(); g.arc(x, y, 1 + vrnd() * 5 * (1 - fade * .5), 0, Math.PI * 2); g.fill(); }
    }));
  }
  function poolTex() {
    return VEH.pool || (VEH.pool = vehCanvasTex(128, 128, (g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(255,236,200,.85)'); r.addColorStop(.55, 'rgba(255,226,180,.35)'); r.addColorStop(1, 'rgba(255,220,170,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); }));
  }
  function stoneTex() {
    return VEH.stone || (VEH.stone = vehCanvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#9b9893'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 128) for (let x = 0; x < w; x += 256) { const v = (vrnd() - .5) * 18, o = (y / 128) % 2 ? 128 : 0; g.fillStyle = `rgb(${172 + v},${169 + v},${163 + v})`; g.fillRect((x + o) % w + 2, y + 2, 252, 124); if (o) g.fillRect(0, y + 2, 126, 124); }
      for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${vrnd() < .5 ? '255,255,255' : '40,38,36'},${.05 + vrnd() * .07})`; g.fillRect(vrnd() * w, vrnd() * h, 1 + vrnd() * 2, 1 + vrnd() * 2); }
    }));
  }

  // ----- materials on load -----
  const VMAT = new Map();
  function vehKind(o, m, S) {
    const n = m.name || '', l = n.toLowerCase();
    let wheel = false; for (let a = o; a && !a.userData.vehRoot; a = a.parent) if (/wheel|tire|tyre/i.test(a.name)) { wheel = true; break; }
    if (S.bar && S.bar.mats && S.bar.mats[n] !== undefined) return 'bar';
    if (/window|glass/.test(l)) return 'glass';
    if (/headlight|^lights$/.test(l)) return 'head';
    if (/tail|brake/.test(l) && !/^brake$|caliper|pad/.test(l)) return 'tail'; // CarConcept's red calipers are the material 'Brake': a part, not a lamp
    if (S.paint && n === S.paint) return 'paint';
    if (m.map) return 'tex';
    if (/^black$|19___default|tire|tyre|rubber/.test(l)) return wheel ? 'tyre' : 'trim';
    if (/^grey$|chrome|13___default/.test(l)) return 'chrome';
    return 'plain';
  }
  function vehMat(o, m, S) {
    const kind = vehKind(o, m, S), key = m.uuid + kind;
    if (VMAT.has(key)) return VMAT.get(key);
    const P = o => { const x = new THREE.MeshPhysicalMaterial(Object.assign({ color: m.color.clone(), map: m.map || null, roughness: .45, metalness: 0, envMapIntensity: 1.1 }, o)); x.name = m.name; return x; };
    let x;
    if (kind === 'glass') x = P({ color: lin(0x0f151a), map: null, roughness: .04, metalness: .1, transparent: true, opacity: .84, clearcoat: 1, clearcoatRoughness: .02, envMapIntensity: 1.6, ior: 1.5 });
    else if (kind === 'head') x = P({ color: lin(0xeeeae0), roughness: .1, clearcoat: 1, emissive: lin(0xfff1d6), emissiveIntensity: 0 });
    else if (kind === 'tail') x = P({ color: lin(0x5a0b0b), roughness: .2, clearcoat: 1, emissive: lin(0xff2414), emissiveIntensity: 0 });
    else if (kind === 'bar') x = P({ color: lin(S.bar.mats[m.name]), roughness: .2, clearcoat: 1, emissive: lin(S.bar.mats[m.name]), emissiveIntensity: 0 });
    else if (kind === 'paint') x = P({ roughness: .3, metalness: .45, clearcoat: 1, clearcoatRoughness: .06, normalMap: flakeTex(), normalScale: new THREE.Vector2(.14, .14), envMapIntensity: 1.25 });
    else if (kind === 'tyre') x = P({ color: lin(0x121315), roughness: .92, normalMap: treadTex(), normalScale: new THREE.Vector2(.6, .6), envMapIntensity: .5 });
    else if (kind === 'trim') x = P({ color: lin(0x0e0f11), roughness: .5, metalness: .2, clearcoat: .4, envMapIntensity: .9 });
    else if (kind === 'chrome') x = P({ color: lin(0xc9cdd1), roughness: .2, metalness: 1, envMapIntensity: 1.3 });
    else if (kind === 'tex') x = P({ color: new THREE.Color(1, 1, 1), roughness: .42, metalness: Math.min(.25, m.metalness || 0), clearcoat: S.boat ? .2 : .7, clearcoatRoughness: .12 });
    else x = P({ roughness: .5, clearcoat: .3 });
    if (m.transparent && kind !== 'glass') { x.transparent = true; x.opacity = m.opacity; }
    // a mesh shipped without normals is drawn faceted: GLTFLoader marks its material flatShading, and the upgrade keeps it
    if (m.flatShading || !o.geometry.attributes.normal) x.flatShading = true;
    x.userData.vk = kind; VMAT.set(key, x); return x;
  }
  // a box-projected uv in metres for a mesh that came without one, so the flake and tread maps have somewhere to sit
  function vehUV(o, mode) {
    const g = o.geometry; if (!g || g.attributes.uv || !g.attributes.position) return;
    const p = g.attributes.position, nrm = g.attributes.normal, s = o.getWorldScale(new THREE.Vector3()), uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) * s.x, y = p.getY(i) * s.y, z = p.getZ(i) * s.z;
      if (mode === 'tread') { uv[i * 2] = (Math.atan2(z, y) / (Math.PI * 2) + .5) * 6; uv[i * 2 + 1] = x * 3; continue; }
      const ax = nrm ? Math.abs(nrm.getX(i)) : 0, ay = nrm ? Math.abs(nrm.getY(i)) : 1, az = nrm ? Math.abs(nrm.getZ(i)) : 0;
      const [u, v] = ay >= ax && ay >= az ? [x, z] : ax >= az ? [z, y] : [x, y];
      uv[i * 2] = u / .35; uv[i * 2 + 1] = v / .35;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  // a palette or colour map recoloured on a canvas: pixels whose hue falls in the range take the paint, keeping their shading
  const RECOLOR = new Map();
  function recolorMap(tex, rule, hex) {
    const key = tex.uuid + hex; if (RECOLOR.has(key)) return RECOLOR.get(key);
    const img = tex.image, w = img.width, h = img.height, c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, w, h), a = d.data, P = new THREE.Color(hex);
    for (let i = 0; i < a.length; i += 4) {
      const r = a[i] / 255, gg = a[i + 1] / 255, b = a[i + 2] / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), sat = mx ? (mx - mn) / mx : 0;
      if (sat < rule.sat || mx < .12) continue;
      let hue = mx === mn ? 0 : mx === r ? 60 * (((gg - b) / (mx - mn)) % 6) : mx === gg ? 60 * ((b - r) / (mx - mn) + 2) : 60 * ((r - gg) / (mx - mn) + 4); if (hue < 0) hue += 360;
      if (hue < rule.hue[0] || hue > rule.hue[1]) continue;
      const k = .55 + .6 * mx; a[i] = Math.min(255, P.r * 255 * k); a[i + 1] = Math.min(255, P.g * 255 * k); a[i + 2] = Math.min(255, P.b * 255 * k);
    }
    g.putImageData(d, 0, 0);
    const t = new THREE.CanvasTexture(c); t.flipY = tex.flipY; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT; t.anisotropy = MAX_ANISO;
    RECOLOR.set(key, t); return t;
  }

  // ----- templates: one processed copy per role, cloned per vehicle -----
  function vehTemplate(role) {
    if (VEH.tpl.has(role)) return VEH.tpl.get(role);
    const S = VEHICLES[role];
    const p = model(S.glb).then(src => {
      const root = src.clone(true); root.userData.vehRoot = true;
      if (S.axis) root.scale.multiply(new THREE.Vector3().fromArray(S.axis));
      root.updateMatrixWorld(true);
      let b = new THREE.Box3().setFromObject(root), size = b.getSize(new THREE.Vector3());
      if (S.size) { let k = S.size[2] / size.z; if (size.x * k > S.size[0] * 1.03) k = S.size[0] * 1.03 / size.x; root.scale.multiplyScalar(k); root.updateMatrixWorld(true); b = new THREE.Box3().setFromObject(root); size = b.getSize(new THREE.Vector3()); }
      if (!S.keepOrigin) { root.position.x -= (b.min.x + b.max.x) / 2; root.position.y -= b.min.y; root.position.z -= (b.min.z + b.max.z) / 2; }
      const wrap = new THREE.Group(); wrap.add(root); wrap.userData.vehRoot = true; wrap.updateMatrixWorld(true);
      const wheels = [];
      wrap.traverse(o => {
        if (/wheel/i.test(o.name) && !/steer/i.test(o.name) && o !== root && !wheels.some(w => { for (let a = o.parent; a; a = a.parent) if (a === w) return true; return false; })) wheels.push(o);
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = true;
        o.material = vehMat(o, o.material, S);
        if (o.material.userData.vk === 'paint') vehUV(o, 'box'); else if (o.material.userData.vk === 'tyre') vehUV(o, 'tread');
      });
      // brake pads and calipers hang on the hub, not the rim: they move to a hub group with the wheel's rest transform,
      // which steers with the wheel but never spins (CarConcept: WheelFrontLBrakePad and the rest are wheel children)
      wrap.updateMatrixWorld(true);
      wheels.forEach(w => { const pads = w.children.filter(c => /brake ?pad|caliper/i.test(c.name)); if (!pads.length) return;
        const hub = new THREE.Group(); hub.name = 'hub:' + w.name; hub.position.copy(w.position); hub.quaternion.copy(w.quaternion); hub.scale.copy(w.scale);
        w.parent.add(hub); hub.updateMatrixWorld(true); pads.forEach(p => hub.attach(p)); });
      const box = new THREE.Box3().setFromObject(wrap);
      return { role, wrap, box, size: box.getSize(new THREE.Vector3()), wheelNames: wheels.map(w => w.name) };
    });
    p.catch(e => console.warn('vehicle model ' + role + ' did not load; the hand-built stand-in stays', e));
    VEH.tpl.set(role, p); return p;
  }
  function paintFor(S) {
    if (S.fixedPaint !== undefined) return { hex: S.fixedPaint, r: .32, met: .4, cc: 1 };
    if (S.livery) return null;
    return vpick(PAINTS, p => p.w);
  }
  // one vehicle's own copy: per-car materials (paint, lamps, light bar) are cloned so cars never flash or recolour together
  function vehInstance(T, S, paint) {
    const g = T.wrap.clone(true), own = new Map(), inst = { body: g, head: [], tail: [], bar: [], wheels: [], paint, sign: null, hatch: null };
    g.traverse(o => {
      if (o.name && T.wheelNames.includes(o.name) && !inst.wheels.some(w => w.o === o)) inst.wheels.push({ o });
      if (S.sign && o.name === S.sign) inst.sign = o;
      if (!o.isMesh) return;
      const m = o.material, k = m.userData.vk;
      if (k === 'paint' || k === 'head' || k === 'tail' || k === 'bar' || (k === 'tex' && S.recolor && paint)) {
        if (!own.has(m)) { const c = m.clone(); c.userData = Object.assign({}, m.userData); own.set(m, c); }
        o.material = own.get(m);
      }
    });
    own.forEach((c, src) => {
      const k = c.userData.vk;
      if (k === 'paint' && paint) { c.color.copy(lin(paint.hex)); c.roughness = paint.r; c.metalness = paint.met; c.clearcoat = paint.cc; if (paint.cc < .5) c.normalScale.set(.05, .05); }
      if (k === 'tex' && paint && c.map) c.map = recolorMap(c.map, S.recolor, paint.hex);
      if (k === 'head') inst.head.push(c); else if (k === 'tail') inst.tail.push(c); else if (k === 'bar') inst.bar.push(c);
    });
    const box = T.box, H = box.max.y - box.min.y, W = box.max.x - box.min.x;
    // lamps for models without their own head and tail materials
    if (S.lamps || (!inst.head.length && !S.axis)) {
      const hm = new THREE.MeshStandardMaterial({ color: lin(0xeeeae0), emissive: lin(0xfff1d6), emissiveIntensity: 0, roughness: .2 });
      const tm = new THREE.MeshStandardMaterial({ color: lin(0x5a0b0b), emissive: lin(0xff2414), emissiveIntensity: 0, roughness: .3 });
      const y = Math.min(.8, box.min.y + H * (S.narrow ? .55 : .3)), xs = S.narrow ? [0] : [-W * .33, W * .33], pg = new THREE.PlaneGeometry(S.narrow ? .12 : .24, S.narrow ? .08 : .1);
      xs.forEach(x => { const f = new THREE.Mesh(pg, hm); f.position.set(x, y, box.max.z + .012); g.add(f); const r = new THREE.Mesh(pg, tm); r.position.set(x, y, box.min.z - .012); r.rotation.y = Math.PI; g.add(r); });
      inst.head.push(hm); inst.tail.push(tm);
    }
    if (S.bar && S.bar.boxes) S.bar.boxes.forEach(bx => {
      const m = new THREE.MeshPhysicalMaterial({ color: lin(bx.hex), emissive: lin(bx.hex), emissiveIntensity: 0, roughness: .2, clearcoat: 1 });
      const o = new THREE.Mesh(new THREE.BoxGeometry(...bx.s), m); o.position.fromArray(bx.c); g.add(o); inst.bar.push(m);
    });
    if (S.decal === 'icecream') {
      const m = new THREE.MeshStandardMaterial({ map: decalTex('icecream'), roughness: .45, polygonOffset: true, polygonOffsetFactor: -2 });
      const d = new THREE.Mesh(new THREE.PlaneGeometry(2.36, 1.12), m); d.position.set(VEH_DECAL.icecream.x, 2.12, -1.38); d.rotation.y = -Math.PI / 2; g.add(d);
    }
    if (S.decal === 'parcel') {
      const m = new THREE.MeshStandardMaterial({ map: decalTex('parcel'), transparent: true, roughness: .45, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
      [-1, 1].forEach(s => { const d = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), m); d.position.set(s * VEH_DECAL.parcel.x, 1.55, -.9); d.rotation.y = s * Math.PI / 2; d.renderOrder = 2; g.add(d); });
    }
    if (S.hatch) {
      // a roller shutter over the serving hatch: down while the truck drives, rolled up under the awning when it stands
      const pivot = new THREE.Group(); pivot.position.set(box.max.x - .585, 2.42, -1.3); g.add(pivot);
      const sh = new THREE.Mesh(new THREE.BoxGeometry(.03, 1.1, 2.02), new THREE.MeshStandardMaterial({ color: lin(0xe9e1d3), roughness: .5, metalness: .3 }));
      sh.position.y = -.55; sh.castShadow = true; pivot.add(sh); inst.hatch = pivot;
    }
    inst.wheels.forEach(w => {
      const o = w.o, wb = new THREE.Box3().setFromObject(o), c = wb.getCenter(new THREE.Vector3());
      w.r = Math.max(.12, (wb.max.y - wb.min.y) / 2); w.front = c.z > 0 && !/back|rear|_r[lr]$/i.test(o.name);
      w.q0 = o.quaternion.clone(); const inv = w.q0.clone().invert(); w.axis = new THREE.Vector3(1, 0, 0).applyQuaternion(inv).normalize(); w.spin = 0;
      w.hub = o.parent ? o.parent.getObjectByName('hub:' + o.name) || null : null; if (w.hub) w.hq0 = w.hub.quaternion.clone();
    });
    return inst;
  }

  // ----- a vehicle on the road or in a bay -----
  function vehStandIn(S) {
    if (S.narrow) { const g = new THREE.Group(); ebike(g, 0, 0, 0); return g; }
    return car(0x2c3036);
  }
  function makeVehicle(role, opt) {
    const S = VEHICLES[role], g = new THREE.Group(), v = Object.assign({ g, role, S, type: S.type, len: S.size[2], wid: S.size[0], x: 0, z: 0, y: 0, a: 0, v: 0, vMax: 7 + vrnd() * 2.5, mode: 'ring', steer: 0, brake: 0, flashT: vrnd() * 3 }, opt || {});
    v.paint = paintFor(S); v.stand = vehStandIn(S); g.add(v.stand); VEH.front.add(g);
    if (S.narrow) v.vMax = 6.5 + vrnd() * 1.5;
    vehAttach(v);
    return v;
  }
  function vehAttach(v) {
    const S = v.S;
    vehTemplate(v.role).then(T => {
      if (v.S !== S) return; // rerolled meanwhile
      const inst = vehInstance(T, S, v.paint);
      if (v.inst) v.g.remove(v.inst.body);
      if (v.stand) { v.g.remove(v.stand); v.stand = null; }
      v.inst = inst; v.g.add(inst.body); vehMirror(inst.body, 0);
      if (S.rider) { if (!v.riderFig) { v.riderFig = makeHuman('rider', 30 + VEH.road.indexOf(v), 'sit'); } v.riderFig.position.set(S.rider[0], S.rider[1] - .5, S.rider[2] + .09); inst.body.add(v.riderFig); }
      vehLights(v);
    }).catch(() => {});
  }
  // The water's planar mirror (when the page has one) draws only layers 1 and 2, and initMirror() sorts the scene into
  // them once, at boot, before any glTF has arrived. A model that arrives later joins the reflection here: layer 1 (the
  // full reflection), and layer 2 too (the lean one) for what sits right on the water. Riders and passengers are people,
  // which the mirror leaves out, so they are added after this runs.
  function vehMirror(root, lean) {
    if (!three.mirror) return;
    root.traverse(o => { if (o.isMesh || o.isInstancedMesh) { o.layers.enable(1); if (lean) o.layers.enable(2); } });
  }
  function laneZ(v) { return v.S.narrow || v.bike ? ROAD.bikeZ : ROAD.kerbR - v.wid / 2; }
  function poseVehicle(v) {
    v.g.position.set(v.x, v.y, v.z); v.g.rotation.y = Math.PI / 2 - v.a;
  }
  // the four corners of a vehicle's footprint (x, z), optionally grown by m
  function vehCorners(x, z, a, len, wid, m = 0) {
    const c = Math.cos(a), s = Math.sin(a), hl = len / 2 + m, hw = wid / 2 + m;
    return [[x + c * hl - s * hw, z + s * hl + c * hw], [x + c * hl + s * hw, z + s * hl - c * hw], [x - c * hl + s * hw, z - s * hl - c * hw], [x - c * hl - s * hw, z - s * hl + c * hw]];
  }
  function obbHit(A, B) {
    const ax = [];
    [A, B].forEach(P => { for (let i = 0; i < 4; i++) { const p = P[i], q = P[(i + 1) % 4]; ax.push([-(q[1] - p[1]), q[0] - p[0]]); } });
    for (const [nx, nz] of ax) {
      let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
      A.forEach(p => { const d = p[0] * nx + p[1] * nz; a0 = Math.min(a0, d); a1 = Math.max(a1, d); });
      B.forEach(p => { const d = p[0] * nx + p[1] * nz; b0 = Math.min(b0, d); b1 = Math.max(b1, d); });
      if (a1 < b0 || b1 < a0) return false;
    }
    return true;
  }
  function vehHull(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    p.forEach(q => { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); });
    p.slice().reverse().forEach(q => { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); });
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function vehClipZ(poly, z0, z1) {
    const clip = (P, keep, cut) => { const out = []; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], ka = keep(a), kb = keep(b); if (ka) out.push(a); if (ka !== kb) { const t = (cut - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, cut]); } } return out; };
    return clip(clip(poly, q => q[1] >= z0, z0), q => q[1] <= z1, z1);
  }
  const rectHit = (P, r) => obbHit(P, [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]]);

  // ----- the riverside showroom, laid out against what actually stands on the strip -----
  function riverEdge(off) {
    const wn = three.waterNav, pts = [];
    for (let i = 0; i <= 900; i++) { const t = i / 900, p = wn.curve.getPoint(t), tg = wn.curve.getTangent(t); pts.push([p.x + tg.z * off, p.z - tg.x * off]); }
    return x => { let best = null; for (let i = 1; i < pts.length; i++) { const [x0, z0] = pts[i - 1], [x1, z1] = pts[i]; if ((x0 - x) * (x1 - x) <= 0 && x1 !== x0) { const z = z0 + (z1 - z0) * (x - x0) / (x1 - x0); best = best === null ? z : Math.min(best, z); } } return best; };
  }
  function showObstacles() {
    const out = [], inv = new THREE.Matrix4().copy(VEH.front.matrixWorld).invert(), box = new THREE.Box3(), skip = new Set();
    (three.npcs || []).forEach(n => { skip.add(n.f); if (n.dog) skip.add(n.dog); }); (three.cyclists || []).forEach(c => skip.add(c.g));
    three.scene.updateMatrixWorld(true);
    [VEH.front, VEH.land].forEach(root => root.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh) return;
      for (let a = o; a; a = a.parent) if (skip.has(a)) return;
      box.setFromObject(o).applyMatrix4(inv);
      if (box.max.y < .25 || box.min.y > 1.6 || box.max.x - box.min.x > 3 || box.max.z - box.min.z > 3) return;
      if (box.max.z < 19.7 || box.min.z > 22.5 || box.max.x < 20 || box.min.x > 70) return;
      out.push([box.min.x - .2, box.min.z - .2, box.max.x + .2, box.max.z + .2]);
    }));
    return out;
  }
  // the path from the lane into a bay: lane, a right-hand arc of radius R, then straight along the bay heading. The arc is
  // traced by the rear axle (0.3 L behind the centre), as a real car turns, so the rear does not swing out over the far kerb;
  // the points stored are the centre's.
  function bayPath(P, a, zL, R, L) {
    const k = .3 * L, Q = { x: P.x - Math.cos(a) * k, z: P.z - Math.sin(a) * k };
    const E = { z: zL + R * (1 - Math.cos(a)) }; const s = (Q.z - E.z) / Math.sin(a); E.x = Q.x - s * Math.cos(a);
    const qx = E.x - R * Math.sin(a), q = [{ x: qx, z: zL, a: 0 }];
    const arcLen = R * a; for (let d = .25; d <= arcLen + 1e-6; d += .25) { const f = d / R; q.push({ x: qx + R * Math.sin(f), z: zL + R * (1 - Math.cos(f)), a: f }); }
    for (let d = .25; d <= s + 1e-6; d += .25) q.push({ x: E.x + Math.cos(a) * d, z: E.z + Math.sin(a) * d, a });
    // the path always ends exactly on the bay pose, so a car back from its drive stands where it stood before it left
    const last = q[q.length - 1]; if (Math.hypot(last.x - Q.x, last.z - Q.z) > 1e-6) q.push({ x: Q.x, z: Q.z, a });
    const pts = q.map(p => ({ x: p.x + Math.cos(p.a) * k, z: p.z + Math.sin(p.a) * k, a: p.a }));
    let acc = 0; pts.forEach((p, i) => { if (i) acc += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z); p.s = acc; });
    return { pts, xs: pts[0].x, len: acc };
  }
  function layoutShowroom() {
    // Every position where a role can stand on its own (inside the deck, its path clear of trunks, lamps and benches and
    // never swinging past the far kerb), then the set of positions with the most bays, one per role, that never touch each
    // other's car or path. Bays are angled 60 degrees: the approach band is 1.15 W wide where it crosses the line of
    // street trees, so two narrow cars share one gap between trunks.
    const obs = showObstacles(), edge = riverEdge(ROAD.quay), A = SHOW_A, R = SHOW_R, cands = [];
    SHOW_ROLES.forEach((role, ri) => {
      const S = VEHICLES[role], L = S.size[2], W = S.size[0], zL = ROAD.kerbR - W / 2;
      const kerbMin = Math.min(16.85, zL - W / 2 - .15);
      // a bay may start at the sidewalk, or sit back behind the trunk line where only its approach crosses between trunks
      for (const back of [.14, .6, 1.1]) for (let xp = SHOW_X[0]; xp <= SHOW_X[1]; xp += .25) {
        const zP = ROAD.back + back + L / 2 * Math.sin(A) + W / 2 * Math.cos(A);
        const P = { x: xp, z: zP }, me = vehCorners(xp, zP, A, L, W);
        if (me.some(([cx, cz]) => { const e = edge(cx); return e === null || cz > e - .35; })) continue;
        const path = bayPath(P, A, zL, R, L);
        if (path.pts.some(p => { const c = vehCorners(p.x, p.z, p.a, L, W, .12); return vehCorners(p.x, p.z, p.a, L, W).some(q => q[1] < kerbMin) || obs.some(r => rectHit(c, r)); })) continue;
        const xs = me.map(c => c[0]).concat(path.pts.filter(p => p.z > 19.6).map(p => p.x));
        cands.push({ role, ri, P, A, L, W, zL, path, edge, me, x0: Math.min(...xs) - L, x1: Math.max(...xs) + L });
      }
    });
    cands.sort((a, b) => a.P.x - b.P.x); cands.forEach((c, k) => { c.k = k; });
    if (/[?&]vehdiag/.test(location.search)) console.warn('VEHDIAG cands ' + cands.length + ' ' + JSON.stringify(SHOW_ROLES.map(r => [r, cands.filter(c => c.role === r).length])));
    const memo = new Map(), clash = (a, b) => {
      if (a.x1 < b.x0 || b.x1 < a.x0) return false;
      const k = a.k + ':' + b.k; if (memo.has(k)) return memo.get(k);
      const hit = obbHit(vehCorners(a.P.x, a.P.z, A, a.L, a.W, .35), b.me) || a.path.pts.some(p => obbHit(vehCorners(p.x, p.z, p.a, a.L, a.W, .1), b.me)) || b.path.pts.some(p => obbHit(vehCorners(p.x, p.z, p.a, b.L, b.W, .1), a.me));
      memo.set(k, hit); return hit;
    };
    // best(i, mask): the most valuable set using candidates after i, given the roles in mask are taken; the owner's five
    // kinds weigh most, then a compact row near the middle of the river bend
    const wOf = c => VEHICLES[c.role].show - Math.abs(c.P.x - SHOW_X[2]) * .01, best = new Map();
    const solve = (i, mask, chosen) => {
      const key = i + '|' + mask; if (best.has(key)) return best.get(key);
      let out = { v: 0, set: [] };
      for (let j = i + 1; j < cands.length; j++) {
        const c = cands[j]; if (mask & (1 << c.ri)) continue;
        if (i >= 0 && clash(cands[i], c)) continue;
        const r = solve(j, mask | (1 << c.ri)); const v = wOf(c) + r.v;
        if (v > out.v) out = { v, set: [c].concat(r.set) };
      }
      best.set(key, out); return out;
    };
    let bays = solve(-1, 0).set;
    if (/[?&]vehdiag/.test(location.search)) console.warn('VEHDIAG R ' + R + ' bays ' + bays.map(b => b.role + '@' + b.P.x).join(' '));
    // the chain only checked neighbours; drop any later bay that still touches an earlier one
    bays = bays.filter((c, k) => !bays.slice(0, k).some(o => clash(o, c)));
    SHOW_ROLES.forEach(r => { if (!bays.some(b => b.role === r)) console.warn('showroom: no room left for ' + r); });
    return { bays, edge, obs };
  }
  function buildShowroom() {
    const F = VEH.front, lay = layoutShowroom(); VEH.lay = lay;
    if (!lay.bays.length) return;
    const xs = lay.bays.map(b => vehCorners(b.P.x, b.P.z, b.A, b.L, b.W).map(c => c[0])).flat();
    const X0 = Math.min(...xs) - 1.6, X1 = Math.max(...xs) + 1.6, ZB = ROAD.back, edge = lay.edge;
    VEH.deck = { X0, X1, ZB };
    // the polished deck, stepped out over the bank to a stone quay wall with a railing at the water
    const line = []; for (let x = X0; x <= X1 + 1e-6; x += .5) line.push([x, edge(x)]);
    const shape = new THREE.Shape(); shape.moveTo(X0, -ZB); shape.lineTo(X1, -ZB); for (let i = line.length - 1; i >= 0; i--) shape.lineTo(line[i][0], -line[i][1]); shape.closePath();
    // tree pits: the deck stops short of every trunk, lamp post and bench that stands on the strip, so none is buried
    lay.obs.forEach(r => {
      const x0 = Math.max(r[0], X0 + .05), x1 = Math.min(r[2], X1 - .05), z0 = Math.max(r[1], ZB + .03), z1 = r[3];
      if (x1 - x0 < .05 || z1 - z0 < .05 || z1 > edge((x0 + x1) / 2) - .1) return;
      const h = new THREE.Path(); h.moveTo(x0, -z0); h.lineTo(x0, -z1); h.lineTo(x1, -z1); h.lineTo(x1, -z0); h.closePath(); shape.holes[shape.holes.length] = h;
    });
    const sg =new THREE.ShapeGeometry(shape); const uv = sg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4);
    const deckM = new THREE.MeshStandardMaterial({ map: stoneTex(), roughness: .2, metalness: .05, envMapIntensity: 1.2 });
    const deck = new THREE.Mesh(sg, deckM); deck.rotation.x = -Math.PI / 2; deck.position.y = ROAD.deckY; deck.receiveShadow = true; F.add(deck);
    const wallM = std(0x6f6a62, { roughness: .9, side: THREE.DoubleSide });
    const wall = strip(line, line, ROAD.deckY, -.9, wallM); wall.castShadow = false; F.add(wall);
    [[X0, ZB, edge(X0)], [X1, ZB, edge(X1)]].forEach(([x, z0, z1]) => F.add(strip([[x, z0], [x, z1]], [[x, z0], [x, z1]], ROAD.deckY, -.9, wallM)));
    const coping = strip(line.map(([x, z]) => [x, z - .25]), line, ROAD.deckY + .03, ROAD.deckY + .03, std(0xd8d2c8, { roughness: .5 })); F.add(coping);
    // railing: brushed steel posts and two rails, a smoked glass panel run between them
    const steel = M.steel, glassM = new THREE.MeshPhysicalMaterial({ color: lin(0x9fb2b8), roughness: .05, metalness: 0, transparent: true, opacity: .22, depthWrite: false, clearcoat: 1, side: THREE.DoubleSide });
    for (let i = 0; i < line.length; i += 3) { const [px, pz] = line[i]; mesh(F, Cy(.03, .03, 1.0, 10), steel, px, ROAD.deckY + .5, pz - .12); }
    for (let i = 1; i < line.length; i++) {
      const [ax, az] = line[i - 1], [bx, bz] = line[i], len = Math.hypot(bx - ax, bz - az), ry = -Math.atan2(bz - az, bx - ax);
      [1.0, .55].forEach(h => { const r = mesh(F, Cy(.022, .022, len + .01, 8), steel, (ax + bx) / 2, ROAD.deckY + h, (az + bz) / 2 - .12); r.rotation.set(0, ry, Math.PI / 2); });
    }
    const gpos = [], gidx = []; line.forEach(([px, pz], i) => { gpos.push(px, ROAD.deckY + .12, pz - .12, px, ROAD.deckY + .95, pz - .12); if (i) { const k = (i - 1) * 2; gidx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } });
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3)); gg.setIndex(gidx); gg.computeVertexNormals();
    const glass = new THREE.Mesh(gg, glassM); glass.renderOrder = 1; F.add(glass);
    // bays: white lines at the bay angle, a bollard light at each bay's nose by the railing, a warm pool of light under each car at night
    const lineM = std(0xf4f1ea, { roughness: .5 }), pools = [];
    lay.bays.forEach(b => {
      const c = Math.cos(b.A), s = Math.sin(b.A), hw = b.W / 2 + .35, hl = b.L / 2 + .25;
      [-1, 1].forEach(side => { const lx = b.P.x - s * hw * side, lz = b.P.z + c * hw * side, o = mesh(F, B(hl * 2, .006, .09), lineM, lx, ROAD.deckY + .004, lz); o.rotation.y = -b.A; o.castShadow = false; });
      const ex = b.P.x + c * hl - s * 0, ez = b.P.z + s * hl, eb = mesh(F, B(.09, .006, hw * 2), lineM, ex, ROAD.deckY + .004, ez); eb.rotation.y = -b.A; eb.castShadow = false;
      // the spot light stands at the car's nose by the railing, where no path reaches, and tilts back at the car
      const clearOf = q => !lay.obs.some(r => rectHit(q, r)) && !lay.bays.some(o => obbHit(q, vehCorners(o.P.x, o.P.z, o.A, o.L, o.W, .1)) || o.path.pts.some(p => obbHit(q, vehCorners(p.x, p.z, p.a, o.L, o.W, .1))));
      for (const d of [.35, .25, .15]) {
        const bx = b.P.x + c * (hl + d) + s * .5, bz = b.P.z + s * (hl + d) - c * .5, bp = [[bx - .12, bz - .12], [bx + .12, bz - .12], [bx + .12, bz + .12], [bx - .12, bz + .12]];
        if (bz < ZB + .15 || bz > edge(bx) - .3 || !clearOf(bp)) continue;
        const bol = grp(F, bx, ROAD.deckY, bz, Math.PI / 2 - b.A + Math.PI);
        mesh(bol, Cy(.06, .07, .55, 14), M.black, 0, .275, 0);
        const head = grp(bol, 0, .58, 0); head.rotation.x = .5;
        const cap = mesh(head, Cy(.07, .07, .09, 14), std(0xfff2cc, { emissive: 0xffd9a0, emissiveIntensity: 0 }), 0, 0, 0); cap.rotation.x = Math.PI / 2;
        three.lamps[three.lamps.length] = { bulb: cap, light: null }; (VEH.bollards = VEH.bollards || [])[VEH.bollards.length] = [bx, bz];
        break;
      }
      const pm = new THREE.MeshBasicMaterial({ map: poolTex(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(b.L + 2.2, b.W + 2.2), pm); pool.rotation.set(-Math.PI / 2, 0, -b.A); pool.position.set(b.P.x, ROAD.deckY + .012, b.P.z); pool.renderOrder = 1; F.add(pool); pools.push(pm);
    });
    VEH.pools = pools;
    // planters along the back of the deck wherever no bay, path or trunk is
    const hedge = std(0xffffff, { map: TEX.hedge, roughness: .95 }), box = std(0x2b2a29, { roughness: .55 });
    for (let px = X0 + .8; px <= X1 - .8; px += .25) {
      const me = [[px - .6, ZB + .1], [px + .6, ZB + .1], [px + .6, ZB + .6], [px - .6, ZB + .6]];
      if (lay.obs.some(r => rectHit(me, r)) || lay.bays.some(b => obbHit(me, vehCorners(b.P.x, b.P.z, b.A, b.L, b.W, .3)) || b.path.pts.some(p => obbHit(me, vehCorners(p.x, p.z, p.a, b.L, b.W, .15))))) continue;
      mesh(F, B(1.2, .42, .5), box, px, ROAD.deckY + .21, ZB + .35); mesh(F, B(1.1, .26, .4), hedge, px, ROAD.deckY + .52, ZB + .35);
      (VEH.planters = VEH.planters || []).push([px - .6, ZB + .1, px + .6, ZB + .6]); px += 2.6;
    }
    // a low stone sign at the west end
    const sign = mesh(F, B(.18, .7, 1.6), std(0x2b2a29, { roughness: .4 }), X0 + .45, ROAD.deckY + .35, ZB + 1.6);
    const face = mesh(F, new THREE.PlaneGeometry(1.5, .5), std(0xffffff, { map: signTex('RIVERSIDE MOTORS', '#1f1d1c', '#e9e4d8'), roughness: .5 }), X0 + .35, ROAD.deckY + .38, ZB + 1.6); face.rotation.y = -Math.PI / 2; sign.castShadow = true;
    // paved aprons where the bay paths cross the strip between the sidewalk and the deck, and a ramp over the kerb
    const apron = new THREE.MeshStandardMaterial({ map: stoneTex(), roughness: .3 }), rampM = std(0x3a3836, { roughness: .9 });
    const flat = (poly, y, m, hf) => {
      if (poly.length < 3) return; const sh = new THREE.Shape(); poly.forEach(([x, z], i) => i ? sh.lineTo(x, -z) : sh.moveTo(x, -z)); sh.closePath();
      const sg2 = new THREE.ShapeGeometry(sh, 4), uv2 = sg2.attributes.uv, p2 = sg2.attributes.position;
      for (let i = 0; i < uv2.count; i++) { uv2.setXY(i, uv2.getX(i) / 4, uv2.getY(i) / 4); if (hf) p2.setZ(i, hf(-p2.getY(i))); }
      if (hf) sg2.computeVertexNormals();
      const o = new THREE.Mesh(sg2, m); o.rotation.x = -Math.PI / 2; o.position.y = y; o.receiveShadow = true; F.add(o); return o;
    };
    lay.bays.forEach(b => {
      const pts = b.path.pts.filter(p => p.z > 18.6 && p.z < ZB + 1.5).map(p => vehCorners(p.x, p.z, p.a, b.L, b.W, -.15)).flat();
      const hull = vehHull(pts);
      // a dropped kerb: the kerb and gutter under the path become a gentle ramp
      flat(vehClipZ(hull, 19.05, 19.78), 0, rampM, z => .024 + .104 * ss01((z - 19.05) / .6));
    });
    // rocks and reeds of the bank that the deck now covers stay under it instead of poking through
    const inv = new THREE.Matrix4().copy(VEH.land.matrixWorld).invert(), bb = new THREE.Box3(); VEH.hidden = [];
    VEH.land.children.forEach(o => {
      if (o === three.jetty || !(o.isMesh || o.isGroup)) return;
      bb.setFromObject(o).applyMatrix4(inv); if (bb.isEmpty() || bb.max.x - bb.min.x > 4 || bb.max.z - bb.min.z > 4) return;
      const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2, e = edge(cx);
      if (cx > X0 - .3 && cx < X1 + .3 && cz > ZB - .3 && e !== null && cz < e + .6 && bb.max.y > ROAD.deckY - .02) { o.visible = false; VEH.hidden.push(o); }
    });
    // the walk grid: bays, planters and the railing are solid; the deck between them stays walkable
    if (NAV.g) {
      const w = new THREE.Vector3(), markW = (x, z) => { w.set(x, 0, z); F.localToWorld(w); const [i, j] = cellOf(w.x, w.z); if (i >= 0 && j >= 0 && i < NAV.nx && j < NAV.nz) NAV.g[j * NAV.nx + i] = 1; };
      lay.bays.forEach(b => { for (let u = -b.L / 2; u <= b.L / 2; u += .15) for (let q = -b.W / 2; q <= b.W / 2; q += .15) markW(b.P.x + Math.cos(b.A) * u - Math.sin(b.A) * q, b.P.z + Math.sin(b.A) * u + Math.cos(b.A) * q); });
      line.forEach(([px, pz]) => { for (let d = 0; d < .35; d += .1) markW(px, pz - d); });
      (VEH.planters || []).forEach(r => { for (let px = r[0]; px <= r[2]; px += .15) for (let pz = r[1]; pz <= r[3]; pz += .15) markW(px, pz); });
    }
  }

  // ----- traffic -----
  function trafficRoles() { return Object.keys(VEHICLES).filter(r => VEHICLES[r].weight); }
  function buildTraffic() {
    VEH.lay && VEH.lay.bays.forEach((b, i) => {
      const v = makeVehicle(b.role, { mode: 'parked', bay: b, x: b.P.x, z: b.P.z, a: b.A, y: ROAD.deckY, show: true });
      v.vMax = 8.2; VEH.show.push(v); VEH.road.push(v); poseVehicle(v);
    });
    const roles = trafficRoles(), N = 5;
    for (let i = 0; i < N; i++) {
      const role = vpick(roles, r => VEHICLES[r].weight), v = makeVehicle(role, { mode: 'ring' });
      v.x = ROAD.x0 + 6 + i * (ROAD.len / N) + vrnd() * 4; v.z = laneZ(v); v.v = v.vMax * .8; poseVehicle(v); VEH.road.push(v);
    }
    // the two cyclists ride with the traffic, at the kerb on the left (the road is one way: 2.6 m between kerbs)
    (three.cyclists || []).forEach((c, k) => {
      const v = { g: c.g, role: 'bike', S: { size: [.6, 1.1, 1.75], narrow: true }, bike: true, type: c.type, len: 1.75, wid: .6, x: c.g.position.x, z: ROAD.bikeZ, y: 0, a: 0, v: 4, vMax: 4.8 + k * .5, mode: 'ring', src: c };
      c.dir = 1; poseVehicle(v); VEH.road.push(v);
    });
    VEH.road.sort((p, q) => p.x - q.x);
    // spacing pass so no two start inside each other
    const ring = VEH.road.filter(v => v.mode === 'ring');
    for (let i = 1; i < ring.length; i++) { const p = ring[i - 1], q = ring[i]; if (laneOverlap(p, q) && q.x - p.x < (p.len + q.len) / 2 + 4) q.x = p.x + (p.len + q.len) / 2 + 4; poseVehicle(q); }
    three.cars = VEH.road.filter(v => !v.bike);
  }
  const laneOverlap = (p, q) => Math.min(p.z + p.wid / 2, q.z + q.wid / 2) - Math.max(p.z - p.wid / 2, q.z - q.wid / 2) > -.05;
  const ringD = d => ((d % ROAD.len) + ROAD.len) % ROAD.len;
  function reroll(v) {
    const roles = trafficRoles().filter(r => VEHICLES[r].size[2] <= v.len + 1.2);
    const role = vpick(roles, r => VEHICLES[r].weight); if (role === v.role) return;
    const S = VEHICLES[role], nz = S.narrow ? ROAD.bikeZ : ROAD.kerbR - S.size[0] / 2;
    // only when the new body would sit clear of everything around it
    const me = vehCorners(v.x, nz, 0, S.size[2], S.size[0], 1);
    if (VEH.road.some(o => o !== v && obbHit(me, vehCorners(o.x, o.z, o.a, o.len, o.wid)))) return;
    v.role = role; v.S = S; v.type = S.type; v.len = S.size[2]; v.wid = S.size[0]; v.paint = paintFor(S); v.vMax = S.narrow ? 6.5 + vrnd() * 1.5 : 7 + vrnd() * 2.5;
    if (v.inst) { v.g.remove(v.inst.body); v.inst = null; }
    if (v.stand) v.g.remove(v.stand); v.stand = vehStandIn(S); v.g.add(v.stand);
    v.z = laneZ(v); vehAttach(v);
  }
  // a reserved stretch of road while a showroom car crosses the lane: traffic stops short of it
  function zoneOf(v) { const b = v.bay, xs = b.path.xs; return { x0: xs - v.len / 2 - 1.5, x1: b.path.pts.filter(p => p.z < 19.8).reduce((m, p) => Math.max(m, p.x + v.len / 2 + 1), xs) }; }
  function sidewalkClear(v, T) {
    const b = v.bay, cr = b.path.pts.filter(p => p.z > 19.5 && p.z < 21), x0 = Math.min(...cr.map(p => p.x)) - v.len / 2 - 1.5, x1 = Math.max(...cr.map(p => p.x)) + v.len / 2 + 1.5;
    for (const n of three.npcs || []) for (const o of [n.f, n.dog]) {
      if (!o) continue; const z = o.position.z, x = o.position.x; if (z < 19.5 || z > 21.2) continue;
      const reach = (n.run ? 3.4 : 1.4) * T + .8; if (x > x0 - reach && x < x1 + reach) return false;
    }
    return true;
  }
  // free when nothing on the road is inside the stretch and everything coming toward it can still stop short of it
  // (a car queued behind, already stopped, does not hold it)
  function zoneFree(v, Z) {
    for (const o of VEH.road) {
      if (o === v || o.mode === 'parked' || o.mode === 'want-leave') continue;
      const c = vehCorners(o.x, o.z, o.a, o.len, o.wid);
      const xs = c.map(q => q[0]), zs = c.map(q => q[1]), mn = Math.min(...xs), mx = Math.max(...xs);
      if (Math.min(...zs) > 19.75) continue;
      if (mx > Z.x0 && mn < Z.x1 + .5) return false;
      if (o.mode === 'ring') { const d = ringD(Z.x0 - (o.x + o.len / 2)); if (d < 40 && o.v * o.v / 6 > d - .8) return false; }
    }
    return true;
  }
  function idm(v, gap, vL) {
    const a0 = 1.8, b = 2.4, s0 = 2.2, T = 1.1, ss = s0 + Math.max(0, v.v * T + v.v * (v.v - vL) / (2 * Math.sqrt(a0 * b)));
    return a0 * (1 - Math.pow(v.v / v.vMax, 4) - (gap < 50 ? Math.pow(ss / Math.max(.1, gap), 2) : 0));
  }
  function stepRoad(dt) {
    const ring = VEH.road.filter(v => v.mode === 'ring'), zones = VEH.road.filter(v => v.zone).map(v => v.zone);
    const obst = VEH.road.filter(v => v.mode === 'leaving' || v.mode === 'entering');
    ring.forEach(v => {
      // the nearest thing ahead in this lane: a vehicle, a showroom car on its way across, or a reserved stretch
      let gap = 1e9, vL = 0;
      VEH.road.forEach(o => {
        if (o === v || o.mode === 'parked' || !laneOverlap(v, o) && o.mode === 'ring') return;
        if (o.mode === 'ring') { const d = ringD(o.x - v.x); if (d > 0 && d < 70) { const gp = d - (v.len + o.len) / 2; if (gp < gap) { gap = gp; vL = o.v; } } return; }
        const c = vehCorners(o.x, o.z, o.a, o.len, o.wid), zs = c.map(q => q[1]);
        if (Math.min(...zs) > v.z + v.wid / 2 + .05 || Math.max(...zs) < v.z - v.wid / 2 - .05) return;
        const mn = Math.min(...c.map(q => q[0])), d = ringD(mn - v.x) - v.len / 2; if (d < 70 && d - .3 < gap) { gap = d - .3; vL = 0; }
      });
      zones.forEach(Z => { if (v.zoneOwner && v.zone === Z) return; const d = ringD(Z.x0 - v.x) - v.len / 2; if (d < 70 && d < gap && ringD(v.x - Z.x0) > Z.x1 - Z.x0 + v.len) { gap = d; vL = 0; } });
      let acc = Math.max(-9, Math.min(1.8, idm(v, gap, vL)));
      v.v = Math.max(0, v.v + acc * dt);
      // a showroom car back from its drive slows to a stop exactly where its bay path starts
      let home = 1e9; if (v.show && v.home) { home = ringD(v.bay.path.xs - v.x); if (home > ROAD.len - .5) home = 0; if (home < 45) v.v = Math.min(v.v, Math.sqrt(2 * 1.3 * home) + .04); }
      v.brake = acc < -1 || home < 12 ? 1 : 0;
      let dx = v.v * dt;
      if (gap - dx < .25) { dx = Math.max(0, gap - .25); v.v = Math.min(v.v, dx / Math.max(dt, 1e-3)); }
      if (dx > home) dx = home;
      v.x += dx; v.dist = (v.dist || 0) + dx;
      if (v.show && v.home && home - dx < .02) { v.x = v.bay.path.xs; v.v = 0; v.mode = 'arrive'; }
      if (v.x > ROAD.x1) { v.x -= ROAD.len; if (v.show) v.home = true; else if (!v.bike) reroll(v); }
      v.z = laneZ(v); v.y = 0; v.a = 0; v.steer = 0;
      poseVehicle(v);
    });
    // the showroom: one car at a time leaves its bay, drives past the office, comes back and parks in the same bay
    VEH.road.filter(v => v.show).forEach(v => {
      if (v.mode === 'leaving' || v.mode === 'entering') moveOnPath(v, dt);
      else if (v.mode === 'want-leave') { const Z = zoneOf(v); if (zoneFree(v, Z) && sidewalkClear(v, 7)) { v.zone = Z; v.zoneOwner = true; v.mode = 'leaving'; v.pi = v.bay.path.len; v.v = 0; } }
      else if (v.mode === 'arrive') { const Z = zoneOf(v); if (zoneFree(v, Z) && sidewalkClear(v, 7)) { v.zone = Z; v.zoneOwner = true; v.mode = 'entering'; v.pi = 0; v.v = 0; v.home = false; } else { v.v = 0; poseVehicle(v); } }
    });
    if (!VEH.active && VEH.t > VEH.nextAt) {
      const cand = VEH.show.filter(v => v.mode === 'parked'); if (cand.length) { const v = cand[VEH.turn = ((VEH.turn || 0) + 1) % cand.length]; v.mode = 'want-leave'; VEH.active = v; }
    }
  }
  function pathPose(b, s) {
    const P = b.path.pts; let i = 1; while (i < P.length - 1 && P[i].s < s) i++;
    const p = P[i - 1], q = P[i], f = q.s > p.s ? Math.min(1, Math.max(0, (s - p.s) / (q.s - p.s))) : 1;
    return { x: p.x + (q.x - p.x) * f, z: p.z + (q.z - p.z) * f, a: p.a + (q.a - p.a) * f };
  }
  function moveOnPath(v, dt) {
    const b = v.bay, L = b.path.len, rev = v.mode === 'leaving', left = rev ? v.pi : L - v.pi, vMax = rev ? 1.5 : 2.2;
    const target = Math.min(vMax, Math.sqrt(2 * .9 * Math.max(0, left)) + .05);
    v.v += Math.max(-1.6, Math.min(.9, (target - v.v) * 2)) * dt; v.v = Math.max(0, v.v);
    // within a centimetre of the end the step lands exactly on it, so the car stops on its bay pose (or its lane spot)
    let ds = Math.min(left, v.v * dt); if (left - ds < .01) ds = left;
    const s1 = rev ? v.pi - ds : v.pi + ds, p = pathPose(b, s1);
    // never move into anything: hold if the next pose would touch another vehicle
    const me = vehCorners(p.x, p.z, p.a, v.len, v.wid, .08);
    if (VEH.road.some(o => o !== v && obbHit(me, vehCorners(o.x, o.z, o.a, o.len, o.wid)))) { v.v = 0; return; }
    const da = p.a - v.a; v.steer = Math.max(-.6, Math.min(.6, ds > 1e-4 ? Math.atan(da / ds * v.len * .62) * (rev ? -1 : 1) : v.steer * .9));
    v.pi = s1; v.x = p.x; v.z = p.z; v.a = p.a; v.y = ROAD.deckY * ss01((p.z - 19.4) / .5); v.dist = (v.dist || 0) + (rev ? -ds : ds);
    poseVehicle(v);
    if (left - ds < .01) {
      v.zone = null; v.zoneOwner = false; v.steer = 0;
      if (rev) { v.mode = 'ring'; v.home = false; v.a = 0; v.v = 0; v.z = b.zL; poseVehicle(v); }
      else { v.mode = 'parked'; v.v = 0; VEH.active = null; VEH.nextAt = VEH.t + VEH.gap + vrnd() * 10; }
    }
  }
  function vehLights(v) {
    const inst = v.inst; if (!inst) return;
    const n = VEH.night, moving = v.mode !== 'parked';
    inst.head.forEach(m => { m.emissiveIntensity = moving ? n * 3.2 : n * .25; });
    inst.tail.forEach(m => { m.emissiveIntensity = moving ? (n * 1.6 + (v.brake ? 2.2 : 0)) : 0; });
  }
  function stepWheels(v, dt) {
    const inst = v.inst; if (!inst) return;
    const d = (v.dist || 0) - (v.lastDist || 0); v.lastDist = v.dist || 0;
    const q = new THREE.Quaternion(), qs = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    inst.wheels.forEach(w => { w.spin += d / w.r; qs.setFromAxisAngle(w.axis, w.spin); q.setFromAxisAngle(up, w.front ? v.steer : 0); w.o.quaternion.copy(q).multiply(w.q0).multiply(qs); if (w.hub) w.hub.quaternion.copy(q).multiply(w.hq0); });
    if (inst.bar.length) { const on = v.mode !== 'parked'; v.flashT += dt; const ph = Math.floor(v.flashT * 6) % 4; inst.bar.forEach((m, i) => { m.emissiveIntensity = on && ((ph < 2) === (i % 2 === 0)) ? 7 : on ? .2 : 0; }); }
    if (inst.sign) inst.sign.rotation.y += dt * .8;
    if (inst.hatch) { const want = v.mode === 'parked' ? .06 : 1; inst.hatch.scale.y += (want - inst.hatch.scale.y) * Math.min(1, dt * 1.5); }
  }
  function vehNightNow() {
    const slot = timeMode === 'real' ? realSlot() : timeMode, t = TIMES3D[slot] || {};
    return Math.min(1, (t.lamps || (weather === 'rain' && slot !== 'afternoon' ? .6 : 0)) / 1.2);
  }
  function vehLightsAll() {
    VEH.night = vehNightNow();
    VEH.road.forEach(vehLights); (VEH.pools || []).forEach(m => { m.opacity = VEH.night * .9; });
    VEH.boats.forEach(B => { if (B.lamp) B.lamp.emissiveIntensity = VEH.night * 4; });
  }

  // ----- river traffic -----
  // Boats keep to the right (east-bound on the far side, west-bound on the office side). Between the bridge and the
  // moored rowboat a boat follows one straight diagonal (BRIDGE_LINE): within 0.3 m of the centreline under the bridge
  // and clear of the rowboat beyond it; only one boat is in that stretch at a time.
  const BOATZ = { x0: -5.5, a: 2.5, b: 16.5, x1: 24.5, laneE: 1.3, laneW: -.9 };
  const bridgeLine = x => .3 + .2 * (x - 9.1);
  function boatOff(x, dir) {
    const lane = dir > 0 ? BOATZ.laneE : BOATZ.laneW;
    const k = x >= BOATZ.a && x <= BOATZ.b ? 1 : x > BOATZ.x0 && x < BOATZ.a ? ss01((x - BOATZ.x0) / (BOATZ.a - BOATZ.x0)) : x > BOATZ.b && x < BOATZ.x1 ? ss01((BOATZ.x1 - x) / (BOATZ.x1 - BOATZ.b)) : 0;
    return lane + (bridgeLine(x) - lane) * k;
  }
  function riverTable() {
    if (VEH.river) return VEH.river;
    const c = three.waterNav.curve, L = c.getLength(), N = 1600, pts = [];
    for (let i = 0; i <= N; i++) { const u = i / N, p = c.getPointAt(u), t = c.getTangentAt(u); pts.push({ s: u * L, x: p.x, z: p.z, nx: -t.z, nz: t.x }); }
    return (VEH.river = { L, N, pts });
  }
  function riverAt(s) {
    const R = riverTable(), f = Math.min(R.N, Math.max(0, s / R.L * R.N)), i = Math.min(R.N - 1, Math.floor(f)), k = f - i, a = R.pts[i], b = R.pts[i + 1];
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, nx: a.nx + (b.nx - a.nx) * k, nz: a.nz + (b.nz - a.nz) * k };
  }
  function sOfX(x) { const R = riverTable(); let best = 0, bd = 1e9; R.pts.forEach(p => { const d = Math.abs(p.x - x); if (d < bd) { bd = d; best = p.s; } }); return best; }
  function boatPoint(s, dir) { const p = riverAt(s), o = boatOff(p.x, dir); return [p.x + p.nx * o, p.z + p.nz * o]; }
  function seat(B, role, idx, at, type, ry = 0) {
    const f = makeHuman(role, idx, 'sit'); f.position.set(at[0], at[1] - .5, at[2]); f.rotation.y = ry; B.body.add(f);
    const n = { f, type, boat: B }; B.people.push(n); (three.boats = three.boats || []).push(n); return f;
  }
  function wakeMesh(B) {
    const tex = foamTex(), m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -4 });
    const g = new THREE.Group(); VEH.land.add(g);
    const quad = (pts) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2)); geo.setIndex([0, 2, 1, 1, 2, 3]); const o = new THREE.Mesh(geo, m); o.renderOrder = 3; o.frustumCulled = false; g.add(o); return o; };
    const zb = B.bow, zs = B.tail, hb = B.beam / 2, sp = Math.tan(19.5 * Math.PI / 180);
    [-1, 1].forEach(s => quad([[s * .05, 0, zb], [s * (hb + .25), 0, zb - .2], [s * (hb + .05 + 5 * sp), 0, zb - 5.2], [s * (hb + .55 + 5 * sp), 0, zb - 5.3]]));
    quad([[-hb * .7, 0, zs], [hb * .7, 0, zs], [-hb * 1.5, 0, zs - 7], [hb * 1.5, 0, zs - 7]]);
    B.wake = g; B.wakeM = m;
  }
  function makeLongtail() {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const deckT = TEX.deck.clone(); deckT.needsUpdate = true; deckT.repeat.set(1, 1);
    const N = 30, Mn = 12, pos = [], uv = [], col = [], idx = [];
    const hbAt = t => t > .62 ? .65 * Math.sqrt(Math.max(0, 1 - ((t - .62) / .38) ** 2)) : .44 + .21 * Math.sin(t / .62 * Math.PI / 2);
    const sheerAt = t => .42 + .53 * Math.pow(Math.max(0, (t - .55) / .45), 2.2) + .13 * Math.pow(Math.max(0, (.22 - t) / .22), 1.4);
    const keelAt = t => -.25 + .2 * Math.pow(Math.max(0, (t - .72) / .28), 1.5);
    for (let i = 0; i <= N; i++) {
      const t = i / N, z = -3.2 + t * 6.4, hb = hbAt(t), sh = sheerAt(t), kl = keelAt(t);
      for (let j = 0; j <= Mn; j++) {
        const a = j / Mn * Math.PI, x = -Math.cos(a) * hb, y = sh - (sh - kl) * Math.pow(Math.sin(a), .55);
        pos.push(x, y, z); uv.push(z / 1.6, j / Mn * 3);
        const wet = y < .06 ? .45 : y > sh - .06 ? 1.25 : .82; col.push(wet, wet * .95, wet * .9);
        if (i && j) { const k = i * (Mn + 1) + j; idx.push(k - Mn - 2, k - 1, k - Mn - 1, k - Mn - 1, k - 1, k); }
      }
    }
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); hg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); hg.setIndex(idx); hg.computeVertexNormals();
    const hullM = new THREE.MeshStandardMaterial({ map: deckT, color: lin(0x8a5f40), vertexColors: true, roughness: .55, side: THREE.DoubleSide });
    const hull = new THREE.Mesh(hg, hullM); hull.castShadow = true; hull.receiveShadow = true; body.add(hull);
    // floorboards above the waterline so no river shows inside
    const fpos = [], fidx = [];
    for (let i = 0; i <= N; i++) { const t = i / N, z = -3.2 + t * 6.4, hb = hbAt(t) * .82 * Math.min(1, (1 - t) * 4); fpos.push(-hb, .08, z, hb, .08, z); if (i) { const k = (i - 1) * 2; fidx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3)); fg.setIndex(fidx); fg.computeVertexNormals();
    body.add(new THREE.Mesh(fg, std(0x6b4a33, { roughness: .8, side: THREE.DoubleSide })));
    const wood = std(0x5a3a24, { roughness: .6 });
    [1.6, .7, -.2, -1.1].forEach(z => { const t = (z + 3.2) / 6.4; mesh(body, B(hbAt(t) * 1.9, .05, .26), wood, 0, .52, z - .1); });
    // the bow post with a garland of red, yellow and green cloth
    const post = mesh(body, Cy(.035, .05, .5, 10), wood, 0, 1.0, 3.12); post.rotation.x = -.35;
    [0xc8352d, 0xe9b93a, 0x3f8f4f].forEach((c, k) => { const r = mesh(body, new THREE.TorusGeometry(.07 - k * .012, .018, 6, 14), std(c, { roughness: .8 }), 0, 1.05 + k * .05, 3.1 + k * .02); r.rotation.x = Math.PI / 2 - .35; });
    // canopy on four poles (under the bridge limit)
    const can = std(0x1f5f7a, { roughness: .85, side: THREE.DoubleSide });
    [[-.6, 1.85], [.6, 1.85], [-.6, -1.75], [.6, -1.75]].forEach(([x, z]) => mesh(body, Cy(.018, .018, 1.25, 8), M.steel, x, 1.08, z));
    mesh(body, B(1.5, .03, 4.0), can, 0, 1.69, .05);
    // the engine on its pivot post, the long tail shaft angled down to the water, a three-blade propeller, the tiller
    mesh(body, Cy(.05, .06, .4, 10), wood, 0, .45, -3.08);
    const eng = grp(body, 0, .72, -3.1); mesh(eng, B(.5, .4, .6), std(0x2b2f34, { roughness: .4, metalness: .6 }), 0, 0, 0); mesh(eng, B(.52, .06, .4), std(0xb8c0c6, { roughness: .3, metalness: .9 }), 0, .22, 0);
    const shaft = grp(body, 0, .55, -3.35); shaft.rotation.x = -12 * Math.PI / 180;
    const sh = mesh(shaft, Cy(.03, .03, 2.6, 8), M.steel, 0, 0, -1.3); sh.rotation.x = Math.PI / 2;
    const prop = grp(shaft, 0, 0, -2.62); for (let k = 0; k < 3; k++) { const bl = mesh(prop, B(.04, .22, .06), M.steel, 0, .1, 0); bl.position.set(Math.sin(k * 2.09) * .1, Math.cos(k * 2.09) * .1, 0); bl.rotation.z = -k * 2.09; }
    const till = mesh(body, Cy(.02, .02, 1.0, 8), M.black, 0, .86, -2.75); till.rotation.x = Math.PI / 2 - .35;
    const lampM = std(0xfff2cc, { emissive: 0xffd9a0, emissiveIntensity: 0 }); mesh(body, Sp(.05, 10, 8), lampM, 0, 1.74, -1.7);
    mergeOwn(body, { perParent: true });
    return { g, body, prop, beam: 1.3, bow: 3.25, stern: -3.2, tail: -5.9, len: 6.4, lamp: lampM };
  }
  function buildBoats() {
    const land = VEH.land; if (!three.waterNav) return;
    three.riverBoats = []; three.boats = [];
    // the long-tail boat (procedural, from the manifest spec): a boatman at the tiller and six passengers on the thwarts
    const LT = makeLongtail(); land.add(LT.g);
    const B1 = Object.assign(LT, { name: 'longtail', dir: -1, s: sOfX(48), v: 3.6, vC: 4.4, people: [] });
    seat(B1, 'walker', 41, [.22, .55, -2.45], 'boatman');
    [[-.3, 1.6, 'tourist'], [.3, 1.6, 'tourist'], [-.3, .7, 'walker'], [.3, -.2, 'tourist'], [-.3, -.2, 'walker'], [.3, -1.1, 'tourist']].forEach(([x, z, r], k) => seat(B1, r, 42 + k, [x, .55, z], 'passenger'));
    VEH.boats.push(B1); three.riverBoats.push(B1);
    // the water taxi (CC-BY model): narrowed to a 2.35 m beam, a driver at the stern tiller, four passengers
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body); land.add(g);
    const B2 = { name: 'watertaxi', g, body, dir: 1, s: sOfX(-40), v: 2.8, vC: 3.2, beam: 2.35, bow: 3.25, stern: -3.25, tail: -3.3, len: 6.5, people: [] };
    seat(B2, 'walker', 51, [0, .6, -2.95], 'boatman');
    [[-.94, 1], [.94, 1], [-.43, 2.35], [.54, -2.95]].forEach(([x, z], k) => seat(B2, k % 2 ? 'tourist' : 'walker', 52 + k, [x, .6, z], 'passenger'));
    mesh(body, Cy(.02, .02, .7, 8), M.black, 0, .62, -3.2).rotation.x = Math.PI / 2 - .5;
    B2.lamp = std(0xfff2cc, { emissive: 0xffd9a0, emissiveIntensity: 0 }); mesh(body, Sp(.05, 10, 8), B2.lamp, 0, 1.3, -1.2);
    vehTemplate('watertaxi').then(T => { const inst = T.wrap.clone(true); vehMirror(inst, 1); body.add(inst); B2.model = inst; }).catch(() => {
      const hull = mesh(body, B(2.2, .7, 6.2), std(0x6b4a33, { roughness: .6 }), 0, 0, 0); hull.position.y = 0;
    });
    VEH.boats.push(B2); three.riverBoats.push(B2);
    VEH.boats.forEach(B => { wakeMesh(B); B.zoneTok = false; poseBoat(B, 0); });
  }
  function boatInZone(B, s) { const a = boatPoint(s + B.bow * B.dir, B.dir)[0], b = boatPoint(s + B.tail * B.dir, B.dir)[0]; return Math.max(a, b) > BOATZ.x0 - 1 && Math.min(a, b) < BOATZ.x1 + 1; }
  function poseBoat(B, dt) {
    const bowP = boatPoint(B.s + B.bow * B.dir, B.dir), stP = boatPoint(B.s + B.stern * B.dir, B.dir);
    const cx = (bowP[0] + stP[0]) / 2, cz = (bowP[1] + stP[1]) / 2, yaw = Math.atan2(bowP[0] - stP[0], bowP[1] - stP[1]);
    const t = VEH.t, sp = B.v / B.vC;
    B.g.position.set(cx - Math.sin(yaw) * (B.bow + B.stern) / 2, WATER_Y + Math.sin(t * 1.4 + B.len) * .022, cz - Math.cos(yaw) * (B.bow + B.stern) / 2);
    B.g.rotation.y = yaw;
    B.body.rotation.x = -.03 * sp * (B.name === 'longtail' ? 1 : .5) + Math.sin(t * 1.1 + B.len) * .012; B.body.rotation.z = Math.sin(t * .9 + B.len * 2) * .018;
    if (B.prop) B.prop.rotation.z += dt * (8 + 40 * sp);
    if (B.wake) { B.wake.position.set(B.g.position.x, WATER_Y + .012, B.g.position.z); B.wake.rotation.y = yaw; B.wakeM.opacity = Math.min(.75, .15 + .6 * sp); B.wakeM.map.offset.y = (B.wakeM.map.offset.y + dt * .35) % 1; }
  }
  function boatVisible(B) {
    const cam = three.camera; if (!cam) return false;
    VEH.frus = VEH.frus || new THREE.Frustum(); VEH.pm = VEH.pm || new THREE.Matrix4();
    VEH.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); VEH.frus.setFromProjectionMatrix(VEH.pm);
    return VEH.frus.intersectsSphere(new THREE.Sphere(B.g.getWorldPosition(new THREE.Vector3()), 6));
  }
  function stepBoats(dt) {
    const E = VEH.rEnds || (VEH.rEnds = { sMin: sOfX(-112), sMax: sOfX(112), sEnd: sOfX(121), sEnd0: sOfX(-121) }), sMin = E.sMin, sMax = E.sMax, sEnd = E.sEnd;
    VEH.boats.forEach(B => {
      const other = VEH.boats.find(o => o !== B && o.zoneTok);
      // approaching the bridge stretch: take the token, or hold short of it while the other boat is inside
      const entryX = B.dir > 0 ? BOATZ.x0 - 1 : BOATZ.x1 + 1, bowX = boatPoint(B.s + B.bow * B.dir, B.dir)[0], toEntry = (entryX - bowX) * B.dir;
      const inZone = boatInZone(B, B.s);
      if (!B.zoneTok && (inZone || (toEntry > 0 && toEntry < 22)) && !other) B.zoneTok = true;
      if (B.zoneTok && !inZone && toEntry < 0) B.zoneTok = false;
      let vT = B.vC * (inZone ? .65 : 1);
      if (!B.zoneTok && toEntry > 0 && toEntry < 30) vT = Math.min(vT, Math.sqrt(2 * .5 * Math.max(0, toEntry - 4)));
      B.v += Math.max(-.8, Math.min(.5, (vT - B.v) * 1.2)) * dt; B.v = Math.max(0, B.v);
      B.s += B.dir * B.v * dt;
      if ((B.dir > 0 && B.s > sMax) || (B.dir < 0 && B.s < sMin)) {
        const far = B.dir > 0 ? B.s > sEnd : B.s < E.sEnd0;
        if (far || !boatVisible(B)) { B.s = B.dir > 0 ? sMin : sMax; B.zoneTok = false; }
      }
      poseBoat(B, dt);
    });
  }

  // ----- the helicopter: the CC0 model on the pad; its main rotor spins in flight and stops, parked, on the ground -----
  function swapHeli() {
    const H = three.heli; if (!H) return;
    vehTemplate('heli').then(T => {
      const inst = T.wrap.clone(true), keep = new Set(); let rotor = null;
      inst.traverse(o => { if (o.name === VEHICLES.heli.rotor) rotor = o; });
      if (!rotor) return;
      // the model reflects in the water exactly as the hand-built helicopter it replaces did (initMirror's own choice)
      let mask = 0; H.h.children.forEach(c => c.traverse(o => { if (o.isMesh) mask |= o.layers.mask; }));
      H.h.children.forEach(c => { c.visible = false; keep.add(c); });
      inst.traverse(o => { if (o.isMesh) o.layers.mask |= mask; });
      H.h.add(inst); H.model = inst; H.rotor = rotor; H.rotor.rotation.y = Math.PI / 4;
    }).catch(() => {});
  }

  // ----- build and step -----
  function buildVehicles() {
    if (!three.ok || !VEH.front || !three.waterNav) return;
    VEH.land = three.waterNav.world; three.scene.updateMatrixWorld(true);
    // a plain stand-in is drawn until a model arrives (and stays if the glTF loader is missing)
    Object.keys(VEHICLES).forEach(r => { if (GLTFLoader) vehTemplate(r); });
    buildShowroom(); buildTraffic(); buildBoats(); swapHeli();
    vehLightsAll(); setInterval(vehLightsAll, 1000);
  }
  function stepVehicles(dt) {
    if (!VEH.front || !VEH.road.length) return;
    VEH.t += dt;
    // lamps follow the time of day at once when it is switched (the 1 s timer covers reduced motion, where this never runs)
    if (timeMode !== VEH.lastMode || weather !== VEH.lastW || VEH.t - VEH.nightAt > 1) { VEH.lastMode = timeMode; VEH.lastW = weather; VEH.nightAt = VEH.t; vehLightsAll(); }
    stepRoad(dt);
    VEH.road.forEach(v => { if (v.inst) { stepWheels(v, dt); if (v.inst.bar.length || v.brake !== v.lastBrake) { vehLights(v); v.lastBrake = v.brake; } } });
    stepBoats(dt);
  }
  if (/[?&]test/.test(location.search)) window.__veh = {
    info: () => ({ road: VEH.road.map(v => ({ role: v.role, mode: v.mode, x: +v.x.toFixed(2), z: +v.z.toFixed(2), a: +v.a.toFixed(3), len: v.len, wid: v.wid, model: !!v.inst })), bays: VEH.lay ? VEH.lay.bays.map(b => ({ role: b.role, x: +b.P.x.toFixed(2), z: +b.P.z.toFixed(2) })) : [], boats: VEH.boats.map(B => ({ name: B.name, s: +B.s.toFixed(1), x: +B.g.position.x.toFixed(2), z: +B.g.position.z.toFixed(2), people: B.people.length, model: B.name !== 'watertaxi' || !!B.model })), deck: VEH.deck, bollards: (VEH.bollards || []).length, hidden: (VEH.hidden || []).length, night: VEH.night }),
    step: (dt, n) => { for (let i = 0; i < n; i++) { stepTown(dt); } return VEH.t; },
    footprints: () => VEH.road.map(v => ({ role: v.role, mode: v.mode, c: vehCorners(v.x, v.z, v.a, v.len, v.wid) })),
    leave: role => { const v = VEH.show.find(q => q.role === role); if (v && v.mode === 'parked' && !VEH.active) { v.mode = 'want-leave'; VEH.active = v; } return !!v; },
    place: (role, x) => { const v = VEH.road.find(q => q.role === role && q.mode === 'ring'); if (v) { v.x = x; poseVehicle(v); } return !!v; },
    // a staged shot: the listed roles at their x, every other vehicle on the road queued nose to tail at the far west end
    stage: list => { const ring = VEH.road.filter(q => q.mode === 'ring'), used = new Set(); list.forEach(([role, x]) => { const v = ring.find(q => q.role === role && !used.has(q)); if (v) { used.add(v); v.x = x; v.v = 0; poseVehicle(v); } }); let x = ROAD.x0 + 1; ring.filter(q => !used.has(q)).forEach(v => { x += v.len / 2; v.x = x; v.v = 0; x += v.len / 2 + 2.5; poseVehicle(v); }); return used.size; },
    boatAt: (name, x) => { const B = VEH.boats.find(b => b.name === name); if (B) { B.s = sOfX(x); poseBoat(B, 0); } return !!B; },
    boats: () => VEH.boats, land: () => VEH.land, front: () => VEH.front, three: () => three, heli: () => three.heli, swapRole: (i, role) => { const v = VEH.road.filter(q => q.mode === 'ring' && !q.bike)[i]; if (v) { const S = VEHICLES[role]; v.role = role; v.S = S; v.type = S.type; v.len = S.size[2]; v.wid = S.size[0]; v.paint = paintFor(S); if (v.inst) { v.g.remove(v.inst.body); v.inst = null; } v.z = laneZ(v); vehAttach(v); } return !!v; },
    // why a role finds no bay: rejection counts per reason over every candidate x
    diag: role => {
      const S = VEHICLES[role], L = S.size[2], W = S.size[0], A = SHOW_A, zL = ROAD.kerbR - W / 2, lay = VEH.lay, edge = lay.edge, obs = lay.obs;
      const zP = ROAD.back + .14 + L / 2 * Math.sin(A) + W / 2 * Math.cos(A), why = {}, add = k => { why[k] = (why[k] || 0) + 1; };
      for (let xp = 26; xp < 64; xp += .5) {
        const me = vehCorners(xp, zP, A, L, W);
        const bad = me.find(([cx, cz]) => { const e = edge(cx); return e === null || cz > e - .35; }); if (bad) { add('edge'); continue; }
        const path = bayPath({ x: xp, z: zP }, A, zL, 4.2, L); let r = null;
        for (const p of path.pts) { const c = vehCorners(p.x, p.z, p.a, L, W, .12); if (c.some(q => q[1] < Math.min(16.85, zL - W / 2 - .05) - .12)) { r = 'kerb'; break; } const o = obs.find(q => rectHit(c, q)); if (o) { r = 'obs@' + o.map(n => n.toFixed(1)).join(','); break; } }
        add(r || 'ok'); if (!r) (why.okX = why.okX || []).push(xp);
      }
      return { zP: +zP.toFixed(2), obs: obs.length, why };
    },
    nightNow: () => { let err = null; try { vehLightsAll(); } catch (e) { err = String(e); } return { night: VEH.night, slot: timeMode, err }; },
    ready: () => Promise.all([...VEH.tpl.values()].map(p => p.catch(() => null))).then(() => true)
  };
  // how many bubbles may show at once, by stage width; ambient lines wait their turn, event lines get two extra (bubbles crowded the 390 night view in v58 checks)
  function bubbleRoom(extra) {
    const box = document.getElementById('bubbles'), st = document.getElementById('stage'); if (!box || !st) return false;
    const w = st.clientWidth, cap = (w < 560 ? 2 : w < 1025 ? 4 : 6) + (extra || 0);
    return box.children.length < cap;
  }
  function sayObj(obj, text) {
    if (!isFlavourSafe(text) || !bubbleRoom(1)) return;
    const box = document.getElementById('bubbles'); if (!box) return;
    const b = document.createElement('div'); b.className = 'bubble'; b.textContent = text; box.appendChild(b);
    const anchor = { el: b, obj, y: 2.35 }; three.bubbles.push(anchor);
    // v59: the anchor offset stays a percentage of the bubble during the entry; GSAP otherwise holds translate(-50%, -100%)
    // as the one-line size in px, so a bubble the layout then places near an edge wraps and hangs ~100 px below its anchor
    // for the 0.3 s of the tween, over the bubble laid out below it (bubbles.cjs, 390 px; tools/bubble-entry.cjs)
    if (hasGsap) { gsap.set(b, { x: 0, y: 0, xPercent: -50, yPercent: -100 }); gsap.from(b, { scale: .6, opacity: 0, duration: .3, ease: 'back.out(2)', clearProps: 'opacity,transform' }); }
    setTimeout(() => { b.remove(); three.bubbles = three.bubbles.filter(x => x !== anchor); }, 4200);
  }

  // ---------- robot vacuums and bladeless purifier fans (owner, 14 Oct 2026) ----------
  function purifierFan(parent, x, z, ry) {
    const g = grp(parent, x, 0, z, ry), body = std(0xdfe3e6, { metalness: .6, roughness: .25 });
    mesh(g, Cy(.13, .15, .6, 28), body, 0, .3, 0);
    for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; mesh(g, B(.01, .4, .01), M.black, Math.cos(a) * .135, .32, Math.sin(a) * .135); }
    const ring = mesh(g, new THREE.TorusGeometry(.22, .035, 12, 40), body, 0, .92, 0); ring.scale.set(1, 1.5, 1);
    const led = mesh(g, B(.05, .015, .01), std(0x111111, { emissive: 0x5fb6e3, emissiveIntensity: .9 }), 0, .55, .14);
    reg(g, 'พัดลมฟอกอากาศ', [{ th: 'เปิด/ปิดพัดลม', fx: () => { led.material.emissiveIntensity = led.material.emissiveIntensity ? 0 : .9; }, done: 'สลับพัดลมแล้ว' }]);
    return g;
  }
  function robotVacuum(root, room) {
    const g = new THREE.Group(), r = ROOMS[room];
    mesh(g, Cy(.17, .17, .08, 32), std(0x1f1d1c, { roughness: .35, metalness: .3 }), 0, .04, 0);
    mesh(g, Cy(.12, .12, .01, 28), std(0x2b2a29, { roughness: .2 }), 0, .085, 0);
    mesh(g, Cy(.03, .03, .02, 16), std(0x111111, { emissive: 0x7ee787, emissiveIntensity: .8 }), 0, .09, .07);
    const bump = mesh(g, new THREE.TorusGeometry(.17, .012, 6, 32, Math.PI), M.alu, 0, .05, 0); bump.rotation.x = Math.PI / 2;
    g.position.set((r.x + r.w / 2) * K, .08, (r.z + r.d / 2) * K); g.rotation.y = rnd() * 6; root.add(g);
    const v = { g, room, speed: .35, on: true }; three.vacuums.push(v);
    reg(g, 'หุ่นยนต์ดูดฝุ่น', [{ th: 'เริ่ม/หยุดดูดฝุ่น', fx: () => { v.on = !v.on; }, done: 'สลับหุ่นยนต์แล้ว' }]);
  }
  function stepVacuums(dt) {
    (three.vacuums || []).forEach(v => {
      if (!v.on) return;
      const r = ROOMS[v.room], m = .6, g = v.g, nx = g.position.x + Math.sin(g.rotation.y) * v.speed * dt, nz = g.position.z + Math.cos(g.rotation.y) * v.speed * dt;
      if (nx < r.x * K + m || nx > (r.x + r.w) * K - m || nz < r.z * K + m || nz > (r.z + r.d) * K - m || Math.random() < .12 * dt) g.rotation.y += Math.PI * (.5 + Math.random());
      else { g.position.x = nx; g.position.z = nz; }
    });
  }
  // Idle people sit (owner: "เข้ามาแล้วต้องนั่งเลย ... ไม่ยืนค้าง"): the free seats in the lounge and the kitchen.
  function collectSeats() {
    const out = [], wp = new THREE.Vector3();
    IX.forEach((ix, k) => {
      ix.obj.getWorldPosition(wp); const room = roomAtWorld(wp.x, wp.z);
      if (ix.name === 'โซฟา') [0, 1, 2].forEach(i => out.push({ k, i, room: 'ห้องพักผ่อน · โซฟา' }));
      else if (ix.name === 'บีนแบ็ก' || ix.name === 'เก้าอี้นวดไฟฟ้า') out.push({ k, i: 0, room: 'ห้องพักผ่อน · ' + ix.name });
      else if (ix.name === 'เก้าอี้บาร์') out.push({ k, i: 0, room: 'โซนเครื่องดื่ม' });
      else if (ix.name === 'เก้าอี้เพื่อสุขภาพ' && room === 6) out.push({ k, i: 0, room: 'ห้องครัว' });
    });
    three.idleSeats = out;
  }

  // ---------- walking (owner, 14 Oct 2026: "ปรับการเดิน วิ่ง เคลื่อนไหวของคนที่ให้สมจริง ตอนนี้เหมือนวาร์ป") ----------
  // A person who has somewhere new to be stands up, walks (or runs, over 14 m) through the room doors with a
  // leg and arm swing, and only then sits or types. Reduced motion moves them at once.
  const ROOM_OUT = 7;
  const DOORS = [[0, 4, 2.2, 4.95], [0, 1, 6, 2.8], [8, 3, 9.8, 3.0], [3, 7, 16, 3.7], [2, 5, 8, 5], [3, 5, 13, 4.95], [4, 5, 4, 7.6], [6, 5, 11.9, 8], [5, ROOM_OUT, 8, 12.45], [6, ROOM_OUT, 15.5, 12.45]];
  function roomAtWorld(x, z) { const i = ROOMS.findIndex(r => x >= r.x * K && x <= (r.x + r.w) * K && z >= r.z * K && z <= (r.z + r.d) * K); return i < 0 ? ROOM_OUT : i; }
  const NAV = { x0: -80, z0: -24, cs: .3, nx: 0, nz: 0, g: null };
  function buildNav() {
    const nx = NAV.nx = Math.ceil(180 / NAV.cs), nz = NAV.nz = Math.ceil(84 / NAV.cs), g = NAV.g = new Uint8Array(nx * nz);
    const skip = new Set([three.people]); (three.npcs || []).forEach(n => { skip.add(n.f); if (n.dog) skip.add(n.dog); }); (three.cars || []).forEach(c => skip.add(c.g)); (three.cyclists || []).forEach(c => skip.add(c.g));
    if (three.boat) skip.add(three.boat); if (three.heli) skip.add(three.heli.h);
    const mark = (ax, az, bx, bz) => { const i0 = Math.max(0, Math.floor((ax - NAV.x0) / NAV.cs)), i1 = Math.min(nx - 1, Math.floor((bx - NAV.x0) / NAV.cs)), j0 = Math.max(0, Math.floor((az - NAV.z0) / NAV.cs)), j1 = Math.min(nz - 1, Math.floor((bz - NAV.z0) / NAV.cs)); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) g[j * nx + i] = 1; };
    const box = new THREE.Box3(), r = .18;
    three.scene.updateMatrixWorld(true);
    three.scene.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh) return;
      if (o.material && o.material.alphaTest > 0) return;
      for (let a = o; a; a = a.parent) { if (skip.has(a) || a.userData.walkable) return; }
      box.setFromObject(o); if (box.isEmpty()) return;
      if (box.max.y < .25 || box.min.y > 1.7) return;
      if (box.max.x - box.min.x > 60 || box.max.z - box.min.z > 60) return;
      mark(box.min.x - r, box.min.z - r, box.max.x + r, box.max.z + r);
    });
    // water: the river band and the lake, except along the bridge
    const wn = three.waterNav; if (wn) {
      const v = new THREE.Vector3(), br = wn.world.localToWorld(new THREE.Vector3(wn.bridge.x, 0, wn.bridge.z));
      for (let k = 0; k <= 1600; k++) { const pt = wn.curve.getPoint(k / 1600); v.set(pt.x, 0, pt.z); wn.world.localToWorld(v);
        for (let j = -wn.half; j <= wn.half; j += NAV.cs) for (let i = -wn.half; i <= wn.half; i += NAV.cs) { if (i * i + j * j > wn.half * wn.half) continue; const x = v.x + i, z = v.z + j; if (Math.abs(x - br.x) < 1.1 && Math.abs(z - br.z) < 6.2) continue; mark(x, z, x, z); } }
      { const [i0, j0] = cellOf(br.x - .8, br.z - 7.6), [i1, j1] = cellOf(br.x + .8, br.z + 7.6); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (i >= 0 && j >= 0 && i < nx && j < nz) g[j * nx + i] = 0; }
      if (three.jetty) { const jb = new THREE.Box3().setFromObject(three.jetty), [i0, j0] = cellOf(jb.min.x, jb.min.z), [i1, j1] = cellOf(jb.max.x, jb.max.z); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (i >= 0 && j >= 0 && i < nx && j < nz) g[j * nx + i] = 0; }
      const pc = wn.world.localToWorld(new THREE.Vector3(wn.pond.x, 0, wn.pond.z));
      for (let j = -wn.pond.rz; j <= wn.pond.rz; j += NAV.cs) for (let i = -wn.pond.rx; i <= wn.pond.rx; i += NAV.cs) if ((i * i) / (wn.pond.rx * wn.pond.rx) + (j * j) / (wn.pond.rz * wn.pond.rz) <= 1) mark(pc.x + i, pc.z + j, pc.x + i, pc.z + j);
    }
  }
  const cellOf = (x, z) => [Math.floor((x - NAV.x0) / NAV.cs), Math.floor((z - NAV.z0) / NAV.cs)];
  function navPath(x0, z0, x1, z1) {
    if (!NAV.g) return null;
    const { nx, nz, g } = NAV, [si, sj] = cellOf(x0, z0), [gi, gj] = cellOf(x1, z1);
    if (si < 0 || sj < 0 || gi < 0 || gj < 0 || si >= nx || gi >= nx || sj >= nz || gj >= nz) return null;
    const near = 1.2 / NAV.cs, free = (i, j) => i >= 0 && j >= 0 && i < nx && j < nz && (!g[j * nx + i] || Math.hypot(i - si, j - sj) <= near || Math.hypot(i - gi, j - gj) <= near);
    const N = nx * nz, cost = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = [], push = (k, f) => { heap.push([f, k]); let c = heap.length - 1; while (c) { const pr = (c - 1) >> 1; if (heap[pr][0] <= heap[c][0]) break; [heap[pr], heap[c]] = [heap[c], heap[pr]]; c = pr; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r2 = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r2 < heap.length && heap[r2][0] < heap[m][0]) m = r2; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    const h = (i, j) => { const dx = Math.abs(i - gi), dz = Math.abs(j - gj); return Math.max(dx, dz) + .414 * Math.min(dx, dz); };
    const s0 = sj * nx + si, goal = gj * nx + gi; cost[s0] = 0; push(s0, h(si, sj));
    let found = false, steps = 0, best = s0, bestH = h(si, sj);
    while (heap.length && steps++ < 250000) {
      const [, k] = pop(); if (closed[k]) continue; closed[k] = 1; if (k === goal) { found = true; break; }
      const i = k % nx, j = (k / nx) | 0; { const hk = h(i, j); if (hk < bestH) { bestH = hk; best = k; } }
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const ni = i + di, nj = j + dj; if (!free(ni, nj)) continue;
        if (di && dj && (!free(i + di, j) || !free(i, j + dj))) continue;
        const nk = nj * nx + ni, c = cost[k] + (di && dj ? 1.414 : 1); if (c < cost[nk]) { cost[nk] = c; from[nk] = k; push(nk, c + h(ni, nj)); }
      }
    }
    const end = found ? goal : best; if (!found && best === s0) return null;
    const cells = []; for (let k = end; k !== -1; k = from[k]) cells.push(k); cells.reverse();
    // straighten: keep a point only where the straight line to the next kept point would cross a blocked cell
    const sight = (a, b) => { const ai = a % nx, aj = (a / nx) | 0, bi = b % nx, bj = (b / nx) | 0, n = Math.max(Math.abs(bi - ai), Math.abs(bj - aj)) * 2; for (let t = 1; t < n; t++) { const i = Math.round(ai + (bi - ai) * t / n), j = Math.round(aj + (bj - aj) * t / n); if (!free(i, j)) return false; } return true; };
    const keep = [cells[0]]; let a = 0;
    for (let k = 2; k < cells.length; k++) if (!sight(cells[a], cells[k])) { keep.push(cells[k - 1]); a = k - 1; }
    keep.push(cells[cells.length - 1]);
    const pts = keep.slice(1, -1).map(k => ({ x: NAV.x0 + (k % nx + .5) * NAV.cs, z: NAV.z0 + (((k / nx) | 0) + .5) * NAV.cs }));
    pts.push({ x: x1, z: z1 });
    return pts;
  }
  function route(x0, z0, x1, z1) {
    const np = navPath(x0, z0, x1, z1); if (np) return np;
    const a = roomAtWorld(x0, z0), b = roomAtWorld(x1, z1), pts = [];
    if (a !== b) {
      const prev = new Map([[a, null]]), q = [a];
      while (q.length) { const r = q.shift(); if (r === b) break; DOORS.forEach(dr => { const nb = dr[0] === r ? dr[1] : dr[1] === r ? dr[0] : -1; if (nb >= 0 && !prev.has(nb)) { prev.set(nb, [r, dr]); q.push(nb); } }); }
      const doors = []; let cur = b; while (prev.get(cur)) { const [r, dr] = prev.get(cur); doors.unshift(dr); cur = r; }
      doors.forEach(dr => pts.push({ x: dr[2] * K, z: dr[1] === ROOM_OUT || dr[0] === ROOM_OUT ? 12 * K + .7 : dr[3] * K }));
    }
    pts.push({ x: x1, z: z1 });
    return pts;
  }
  // v59: the transform of a spot now comes from its use plan (ray-cast seats and ground); kept under its old name for callers
  function finalTransform(s) { return planSpot(null, s).T; }
  // one jointed figure per person, rebuilt only when the role or the look changes (never per pose)
  // v59 integration: the jointed body sits inside a rigged-character holder (rig patch), so the holder three.figures keeps never
  // changes; with ?rig the holder's body becomes the skinned one and CHARS drives its clips (userData.rig), while the joints of the
  // objects patch stay under userData.objRig. jointed(f) is true only while the jointed body is the one on screen.
  function jointed(f) { return !!(f && f.userData.objRig && !f.userData.rig); } // a declaration, so code earlier in the file may call it
  function swapFigure(p) {
    const old = three.figures.get(p.id), body = makeRig(p.role, p.look), f = CHARS.makeHolder(p.role, p.look, 'stand', body);
    f.userData.objRig = body.userData.objRig; f.userData.pose = body.userData.pose;
    f.userData.pid = p.id; f.userData.look = p.role + '|' + p.look;
    if (old) { f.position.copy(old.position); f.rotation.copy(old.rotation); if (old.userData.pose) { f.userData.pose = clonePose(old.userData.pose); applyPose(f, f.userData.pose); } f.userData.placed = old.userData.placed; three.people.remove(old); }
    three.people.add(f); three.figures.set(p.id, f); return f;
  }
  const r2 = v => Math.round(v * 50) / 50;
  function spotKey(s) {
    let k = [r2(s.x), r2(s.y), s.pose, s.ix, s.a, s.slot, s.seatIx, s.viaIx, s.drag ? s.drag.phase + s.drag.n : ''].join('|');
    [s.ix, s.seatIx, s.viaIx].forEach(i => { if (i === undefined || i === null || !IX[i]) return; const w = useRoot(IX[i]).getWorldPosition(V3(0, 0, 0)); k += '|' + r2(w.x) + ',' + r2(w.z) + ',' + r2(useRoot(IX[i]).rotation.y); });
    return k;
  }
  const planKey = pl => [pl.kind, r2(pl.T.x), r2(pl.T.y), r2(pl.T.z), r2(pl.T.ry), (pl.ix || []).join('.'), pl.q.hold || ''].join('|');
  function placeFigures(spots) {
    const seen = new Set();
    people.forEach(p => {
      seen.add(p.id);
      const s = spots.get(p.id); if (!s) return;
      let f = three.figures.get(p.id);
      if (!f || f.userData.look !== p.role + '|' + p.look) f = swapFigure(p);
      const sk = spotKey(s);
      if (f.userData.spotKey === sk && f.userData.plan) return;
      const pl = planSpot(p, s), key = planKey(pl);
      f.userData.spotKey = sk; f.userData.spot = s; f.userData.key = p.role + '|' + pl.kind + '|' + p.look; f.userData.kind = pl.kind;
      if (f.userData.plan && f.userData.planKey === key) return;
      f.userData.plan = pl; f.userData.planKey = key;
      goTo(f, p, pl);
    });
    [...three.figures.keys()].forEach(id => { if (!seen.has(id)) { three.people.remove(three.figures.get(id)); three.figures.delete(id); } });
  }
  // a blend between two poses (and two transforms), 0.35 s; reduced motion jumps at once
  function blendTo(f, q, dur, toT) {
    const from = clonePose(f.userData.pose || poseOf('stand'));
    f.userData.blend = { from, to: q, t: dur > 0 ? 0 : 1, dur: Math.max(dur, 1e-3), fromP: f.position.clone(), fromRy: f.rotation.y, toT: toT || null };
    if (!(dur > 0)) stepBlend(f, 0);
  }
  const standing = q => !q || (Math.abs(q.py - RIG.hip) < .03 && Math.abs(q.prx) < .02 && Math.abs(q.hipX[0]) < .5);
  function goTo(f, p, pl) {
    const T = pl.T, dist = Math.hypot(f.position.x - T.x, f.position.z - T.z);
    const sp = f.userData.spot;
    if (reduce || dist < .35 || !f.userData.placed) {
      f.userData.walk = null;
      // rig patch: the first placement sets the clip at once, a short hop animates it (with the rig off this only records the pose)
      CHARS.setPose(f, sp ? sp.pose : 'stand', sp, !!f.userData.placed && !reduce);
      if (!f.userData.placed || reduce) { f.position.set(T.x, T.y, T.z); f.rotation.set(0, T.ry, 0); blendTo(f, pl.q, 0); }
      else blendTo(f, pl.q, .35, T);
      f.userData.placed = true;
      if (p && p.drag) dragArrived(p);
      return;
    }
    // seated, lying and floor uses are entered from a step in front (or beside) the object; the sit-down blend carries the body in
    const fw = V3(Math.sin(T.ry), 0, Math.cos(T.ry)), sd = V3(-fw.z, 0, fw.x);
    let ax = T.x, az = T.z;
    if (/^(sit|type|floor|row)$/.test(pl.kind)) { ax += fw.x * .38; az += fw.z * .38; }
    else if (/^(lie|recline)$/.test(pl.kind)) { ax += sd.x * .9 + fw.x * .3; az += sd.z * .9 + fw.z * .3; }
    else if (pl.kind === 'ride') { ax += sd.x * .55; az += sd.z * .55; }
    const path = route(f.position.x, f.position.z, ax, az);
    let len = 0, px = f.position.x, pz = f.position.z; path.forEach(q => { len += Math.hypot(q.x - px, q.z - pz); px = q.x; pz = q.z; });
    const run = len > 14 && !(p && p.drag && (p.drag.phase === 'pull' || p.drag.phase === 'back'));
    // a rigged (skinned) person finishes its stand-up clip before the first step (rig patch); a jointed one blends to standing
    const pre = f.userData.rig ? CHARS.busy(f) : standing(f.userData.pose) ? 0 : .35;
    if (pre && jointed(f)) blendTo(f, poseOf('stand'), pre);
    f.userData.walk = { path, i: 0, final: pl, speed: run ? 3.4 : (p && p.drag && p.drag.phase !== 'go' ? .9 : 1.35), run, phase: 0, pid: p ? p.id : null, pre };
  }
  function stepWalkers(dt) {
    three.figures.forEach(f => {
      const w = f.userData.walk; if (!w) return;
      if (w.pre > 0) { w.pre -= dt; return; }
      const tgt = w.path[w.i], dx = tgt.x - f.position.x, dz = tgt.z - f.position.z, dist = Math.hypot(dx, dz), stepLen = w.speed * dt;
      if (dist <= stepLen) {
        f.position.x = tgt.x; f.position.z = tgt.z; w.i++;
        if (w.i >= w.path.length) {
          f.userData.walk = null;
          blendTo(f, w.final.q, .38, w.final.T);
          { const sp = f.userData.spot; CHARS.arrive(f, sp ? sp.pose : 'stand', sp); } // rig patch: arrival sets the clip
          const p = people.find(x => x.id === w.pid); if (p && p.drag) dragArrived(p);
          return;
        }
      } else { f.position.x += dx / dist * stepLen; f.position.z += dz / dist * stepLen; }
      if (dist > 1e-4) { const want = Math.atan2(dx, dz); let d = want - f.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); f.rotation.y += d * Math.min(1, dt * 10); }
      // rig patch: a skinned person walks or runs on its clip, which carries the bob and the lean
      if (f.userData.rig) { CHARS.moving(f, w.speed, w.run); f.position.y = groundAt(f.position.x, f.position.z); f.rotation.x = 0; const p = w.pid !== null ? people.find(x => x.id === w.pid) : null; if (p && p.drag) dragFollow(p, f, dt); return; }
      // gait: hips swing, the swinging leg bends at the knee and the foot clears the floor, arms swing opposite
      w.phase += dt * w.speed * (w.run ? 2.6 : 3.4);
      const amp = w.run ? .75 : .45, sw = Math.sin(w.phase), cw = Math.cos(w.phase), q = poseOf('stand');
      q.hipX = [-sw * amp, sw * amp];
      q.knee = [Math.max(0, cw) * amp * 1.6 + .08, Math.max(0, -cw) * amp * 1.6 + .08];
      q.ank = [-q.knee[0] * .35, -q.knee[1] * .35];
      q.shX = [sw * amp * .8, -sw * amp * .8]; q.elX = w.run ? [-1.3, -1.3] : [-.25, -.25];
      q.sx = w.run ? .12 : .03; q.py = RIG.hip - (1 - Math.cos(q.hipX[0])) * RIG.thigh * .5;
      if (!f.userData.blend) f.userData.pose = q;
      f.position.y = groundAt(f.position.x, f.position.z) + Math.abs(cw) * (w.run ? .05 : .02);
      const p = w.pid !== null ? people.find(x => x.id === w.pid) : null; if (p && p.drag) dragFollow(p, f, dt);
    });
  }
  function stepBlend(f, dt) {
    const b = f.userData.blend; if (!b) return;
    b.t = Math.min(1, b.t + dt / b.dur);
    f.userData.pose = lerpPose(b.from, b.to, b.t);
    if (b.toT) { const e = b.t * b.t * (3 - 2 * b.t); f.position.set(b.fromP.x + (b.toT.x - b.fromP.x) * e, b.fromP.y + (b.toT.y - b.fromP.y) * e, b.fromP.z + (b.toT.z - b.fromP.z) * e); let d = b.toT.ry - b.fromRy; d = Math.atan2(Math.sin(d), Math.cos(d)); f.rotation.set(0, b.fromRy + d * e, 0); }
    if (b.t >= 1) { f.userData.blend = null; if (b.to.hold !== undefined) f.userData.pose.hold = b.to.hold; }
  }
  // every frame: blends, the moving parts of a use (swim strokes, sips, the slide, the boat), then the hands on their targets
  function stepPoses(dt) {
    USE.t = (USE.t || 0) + dt;
    three.figures.forEach(f => {
      if (!f.userData.objRig) return;
      stepBlend(f, dt);
      const pl = f.userData.plan, q = f.userData.pose, live = pl && !f.userData.walk && !f.userData.blend;
      if (live && pl.anim) animUse(f, pl, q, dt);
      if (!jointed(f)) return; // a skinned body (?rig) takes the transform of the blend and the use; its limbs come from its clips
      applyPose(f, f.userData.pose);
      if (pl && !f.userData.walk && pl.ik && pl.ik.length) {
        const w = f.userData.blend ? f.userData.blend.t : 1;
        pl.ik.forEach(t => {
          const R = f.userData.objRig, sh = R.shs[t.i], el = R.els[t.i], q0 = sh.quaternion.clone(), e0 = el.rotation.x;
          armTo(f, t.i, t.p); if (w < 1) { sh.quaternion.copy(q0.slerp(sh.quaternion.clone(), w)); el.rotation.x = e0 + (el.rotation.x - e0) * w; }
        });
      }
      if (live && pl.anim === 'sip') sipStep(f, dt);
    });
    stepDrag(dt);
  }
  function animUse(f, pl, q, dt) {
    const t = USE.t;
    if (pl.anim === 'swim') {
      const ph = reduce ? 1.2 : t * 2.4;
      q.shX = [-ph % (Math.PI * 2), -(ph + Math.PI) % (Math.PI * 2)]; q.elX = [-.25, -.25];
      q.hipX = reduce ? [.12, -.12] : [Math.sin(t * 7) * .22, -Math.sin(t * 7) * .22]; q.knee = [.12, .12];
      if (!reduce) { f.position.y = pl.T.y + Math.sin(t * 2.4) * .01; f.rotation.z = Math.sin(t * 1.2) * .12; }
    } else if (pl.anim === 'boat' && three.boat) {
      if (!pl.local) { three.boat.updateWorldMatrix(true, false); pl.local = three.boat.worldToLocal(V3(pl.T.x, pl.T.y, pl.T.z)); pl.ikLocal = pl.ik.map(k => three.boat.worldToLocal(k.p.clone())); pl.ry0 = pl.T.ry - three.boat.rotation.y; }
      three.boat.updateWorldMatrix(true, false); const w = three.boat.localToWorld(pl.local.clone()); f.position.copy(w); f.rotation.set(0, pl.ry0 + three.boat.rotation.y, three.boat.rotation.z * .8);
      pl.ik.forEach((k, i) => k.p.copy(three.boat.localToWorld(pl.ikLocal[i].clone())));
      const row = Math.sin(t * 2); if (!reduce) { q.sx = -.15 + row * .2; }
    } else if (pl.anim === 'slide' && !reduce && pl.path) {
      const cyc = (t % 8) / 8, n = pl.path.length - 1;
      if (cyc < .35) { f.position.set(pl.T.x, pl.T.y, pl.T.z); f.rotation.set(0, pl.T.ry, 0); }
      else { const u = Math.min(1, (cyc - .35) / .3) * n, i = Math.min(n - 1, Math.floor(u)), a = pl.path[i], b = pl.path[i + 1], e = u - i, c = a.clone().lerp(b, e); f.position.set(c.x, c.y - .34, c.z); f.rotation.set(0, Math.atan2(b.x - a.x, b.z - a.z), 0); }
    }
  }
  // a sip every few seconds: the cup comes to the mouth (reduced motion holds the sip still)
  function sipStep(f) {
    const R = f.userData.objRig, c = (USE.t % 5) / 5, sipping = reduce || c < .32;
    const tgt = sipping ? worldOf(R.mouth, 0, 0, 0) : worldOf(R.S, -.1, .3, .3);
    for (let k = 0; k < 3; k++) { armTo(f, 0, tgt); if (!sipping) break; const cupTop = worldOf(R.cup, 0, .05, 0); tgt.add(worldOf(R.mouth, 0, 0, 0).sub(cupTop)); }
  }

  // ---------- weather: rain streaks, snowflakes, falling leaves, all outside the building ----------
  const VOL = { x0: -12, x1: 19 * K + 12, z0: -11, z1: 12 * K + 11, top: 13 };
  function outside() { let x, z; do { x = VOL.x0 + rnd() * (VOL.x1 - VOL.x0); z = VOL.z0 + rnd() * (VOL.z1 - VOL.z0); } while (x > FOOT.x0 && x < FOOT.x1 && z > FOOT.z0 && z < FOOT.z1); return [x, z]; }
  // the maple atlas material: each instance picks its cell of the 2 x 2 atlas through aCell
  function mapleLeafMat() {
    if (three.mapleMat) return three.mapleMat;
    const m = std(0xffffff, { map: TEX.maple, alphaTest: .4, side: THREE.DoubleSide, roughness: .85 });
    m.onBeforeCompile = sh => { sh.vertexShader = 'attribute vec2 aCell;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = vMapUv * .5 + aCell * .5;\n#endif'); };
    m.customProgramCacheKey = () => 'maple59';
    return (three.mapleMat = m);
  }
  function mapleGeo(n, r) {
    const g = new THREE.PlaneGeometry(.2, .2), cells = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) cells.set([Math.floor(r() * 2), Math.floor(r() * 2)], i * 2);
    g.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2)); return g;
  }
  function outsideR(r) { let x, z; do { x = VOL.x0 + r() * (VOL.x1 - VOL.x0); z = VOL.z0 + r() * (VOL.z1 - VOL.z0); } while (x > FOOT.x0 && x < FOOT.x1 && z > FOOT.z0 && z < FOOT.z1); return [x, z]; }
  function buildWeather(scene) {
    // v59 rain: thin streaks slanted by the wind, falling in the vertex shader (no per-frame upload), skipped over the
    // building (it has no roof in the cutaway); the old line list's draws stay out of the random sequence's way
    const RN = 2200;
    for (let i = 0; i < RN; i++) { outside(); rnd(); } // keeps the seeded sequence (and so the map) exactly as before
    const rr = prng(3301), RN2 = 14000, base = new THREE.PlaneGeometry(1, 1), rg = new THREE.InstancedBufferGeometry();
    rg.index = base.index; rg.setAttribute('position', base.attributes.position); rg.setAttribute('uv', base.attributes.uv);
    const off = new Float32Array(RN2 * 4);
    for (let i = 0; i < RN2; i++) off.set([VOL.x0 - 8 + rr() * (VOL.x1 - VOL.x0 + 16), rr() * VOL.top, VOL.z0 - 8 + rr() * (VOL.z1 - VOL.z0 + 16), rr()], i * 4);
    rg.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4)); rg.instanceCount = RN2;
    three.rainU = { time: { value: 0 }, light: { value: 1 } };
    three.rain = new THREE.Mesh(rg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: true,
      uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), { time: three.rainU.time, light: three.rainU.light, top: { value: VOL.top }, foot: { value: new THREE.Vector4(FOOT.x0, FOOT.z0, FOOT.x1, FOOT.z1) } }),
      vertexShader: `attribute vec4 aOff; uniform float time, top; uniform vec4 foot; varying vec2 vUv; varying float vA;
        #include <common>
        #include <fog_pars_vertex>
        void main() {
          vec3 dir = normalize(vec3(.32, -1., .12));
          float y = mod(aOff.y - time * (12. + aOff.w * 4.), top);
          vec3 p = vec3(aOff.x, y, aOff.z) + vec3(dir.x, 0., dir.z) * (y - top * .5) / -dir.y;
          vA = (p.x > foot.x && p.x < foot.z && p.z > foot.y && p.z < foot.w) ? 0. : 1.;
          vec3 side = normalize(cross(dir, normalize(cameraPosition - p)));
          vec3 wp = p + dir * position.y * (.5 + aOff.w * .3) + side * position.x * .016;
          vec4 mvPosition = viewMatrix * vec4(wp, 1.); gl_Position = projectionMatrix * mvPosition; vUv = uv;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform float light; varying vec2 vUv; varying float vA;
        #include <common>
        #include <fog_pars_fragment>
        void main() { if (vA < .5) discard; float a = (1. - abs(vUv.x * 2. - 1.)) * smoothstep(0., .5, vUv.y) * .38;
          gl_FragColor = vec4(vec3(.78, .84, .9) * (.25 + .75 * light), a);
          #include <fog_fragment>
        }` }));
    three.rain.frustumCulled = false; three.rain.renderOrder = 3;
    // v59 snow: twice the flakes, sized to read at the overview distance, each drifting on its own
    const SN = 1800, sp = new Float32Array(SN * 3);
    for (let i = 0; i < SN; i++) { const [x, z] = outside(); sp.set([x, rnd() * VOL.top, z], i * 3); }
    const sr = prng(7707), SN2 = 4200, sp2 = new Float32Array(SN2 * 3);
    for (let i = 0; i < SN2; i++) { if (i < SN) { sp2.set(sp.slice(i * 3, i * 3 + 3), i * 3); continue; } const [x, z] = outsideR(sr); sp2.set([x, sr() * VOL.top, z], i * 3); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp2, 3));
    const flake = ctex(32, 32, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.45, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
    three.snow = new THREE.Points(sg, new THREE.PointsMaterial({ size: .3, map: flake, transparent: true, depthWrite: false }));
    // v59 autumn: maple leaves from the CC0 scans (LeafSet028), four colours in a 2 x 2 atlas, each leaf its own cell
    const LN = 160, LN2 = 420, leafM = mapleLeafMat(), lr = prng(5150), lg = mapleGeo(LN2, lr);
    three.leaves = new THREE.InstancedMesh(lg, leafM, LN2);
    three.leafState = [];
    const col = new THREE.Color();
    for (let i = 0; i < LN; i++) {
      const [x, z] = outside();
      three.leafState.push({ x, y: rnd() * 7, z, rx: rnd() * 6, ry: rnd() * 6, sp: .5 + rnd() * .5, sw: rnd() * 6 });
      three.leaves.setColorAt(i, col.setRGB(1, 1, 1)); // the atlas carries the leaf colours
    }
    for (let i = LN; i < LN2; i++) { const [x, z] = outsideR(lr); three.leafState.push({ x, y: lr() * 7, z, rx: lr() * 6, ry: lr() * 6, sp: .45 + lr() * .5, sw: lr() * 6 }); three.leaves.setColorAt(i, col.setRGB(1, 1, 1)); }
    scene.add(three.rain, three.snow, three.leaves);
    updateLeaves(0);
  }
  const dummyL = { o: null };
  function updateLeaves(dt) {
    const d = dummyL.o || (dummyL.o = new THREE.Object3D());
    three.leafState.forEach((l, i) => {
      if (dt) { l.y -= l.sp * dt; l.sw += dt * 1.8; l.x += Math.sin(l.sw) * dt * .5 + dt * .25; l.rx += dt * 2.2; l.ry += dt * 1.3; if (l.y < .02) { const [x, z] = outside(); Object.assign(l, { x, z, y: 6 + rnd() * 2 }); } }
      d.position.set(l.x, l.y, l.z); d.rotation.set(l.rx, l.ry, 0); d.updateMatrix(); three.leaves.setMatrixAt(i, d.matrix);
    });
    three.leaves.instanceMatrix.needsUpdate = true;
  }
  function stepWeather(dt) {
    if (weather === 'rain') { three.rainU.time.value += dt; } else if (weather === 'snow') {
      const a = three.snow.geometry.attributes.position, p = a.array, t = performance.now() / 1000;
      for (let i = 0; i < p.length; i += 3) { p[i + 1] -= .9 * dt; p[i] += Math.sin(t + i) * .25 * dt; if (p[i + 1] < 0) p[i + 1] = VOL.top; }
      a.needsUpdate = true;
    } else if (weather === 'autumn') updateLeaves(dt);
  }

  // ---------- light: time of day mixed with the weather ----------
  const CANOPY = { clear: [0x3f7f45, 0x4f9150, 0x356e3b], rain: [0x2f6436, 0x3a7240, 0x2a5a30], snow: [0xe3ebee, 0xcbd9d4, 0xdce6e9], autumn: [0xc8582a, 0xe0922f, 0xb33d26, 0xd9b03a, 0x9a6a2a] };
  // ---------- v59 sky (audit gap 8: the sky was one flat colour) ----------
  // three's Sky (Preetham daylight scattering) drives the sun by the time of day; the same shader then lays soft
  // drifting clouds (four octaves of value noise on a cloud plane), a night gradient with twinkling stars and the moon,
  // and an overcast veil for rain and snow, and melts into the fog colour at the horizon so the far hills never show a
  // seam. One draw call; it also shows in the lake and river reflection.
  const SKY3D = {
    morning:   { el: 11, turb: 2.2, ray: 3, mie: .005, g: .82, k: .32, tint: [.85, .92, 1.15], cover: .4, cloud: [1, .9, .8], shade: [.58, .56, .6] },
    afternoon: { el: 52, turb: 1.5, ray: 3, mie: .003, g: .8, k: .3, tint: [.62, .8, 1.3], cover: .44, cloud: [1, 1, 1], shade: [.6, .64, .7] },
    evening:   { el: 2.2, turb: 8.5, ray: 3.4, mie: .012, g: .93, k: .9, tint: [.8, .72, 1.1], cover: .32, cloud: [1.5, .78, .48], shade: [.5, .3, .38] },
    night:     { el: -12, turb: 2, ray: .5, mie: .003, g: .8, k: .0, tint: [1, 1, 1], cover: .3, cloud: [.03, .035, .055], shade: [.012, .014, .024] }
  };
  function buildSky(scene) {
    if (!SkyC) return;
    const sky = new SkyC(); sky.scale.setScalar(1000); sky.frustumCulled = false; sky.layers.enable(1); sky.name = 'sky';
    const u = sky.material.uniforms;
    Object.assign(u, { skyK: { value: .5 }, night: { value: 0 }, overcast: { value: 0 }, cover: { value: .38 }, cloudCol: { value: new THREE.Color(1, 1, 1) },
      cloudShade: { value: new THREE.Color(.6, .64, .7) }, fogCol: { value: new THREE.Color() }, skyTint: { value: new THREE.Color(1, 1, 1) }, moonDir: { value: new THREE.Vector3(-.45, .8, -.3).normalize() }, time: { value: 0 } });
    const fs = sky.material.fragmentShader, at = fs.lastIndexOf('void main()');
    sky.material.fragmentShader = fs.slice(0, at) + `uniform float skyK, night, overcast, cover, time; uniform vec3 cloudCol, cloudShade, fogCol, moonDir, skyTint;
      ${GLSL_NOISE}
      ` + fs.slice(at).replace('gl_FragColor = vec4( retColor, 1.0 );', `
        vec3 col = retColor * skyK; col = mix(col, col * skyTint, smoothstep(.0, .45, direction.y)); // a deeper blue overhead
        // night: a dark gradient, twinkling stars and the moon with a soft halo
        vec3 nc = mix(vec3(.010, .016, .040), vec3(.0012, .002, .007), smoothstep(0., .55, direction.y));
        if (direction.y > 0.) { vec2 sp = vec2(atan(direction.z, direction.x), asin(clamp(direction.y, -1., 1.))) * 180.; vec2 ce = floor(sp);
          float h = aoH(ce), d = length(fract(sp) - (vec2(aoH(ce + 3.7), aoH(ce + 9.1)) * .6 + .2));
          nc += vec3(.85, .9, 1.) * step(.972, h) * smoothstep(.17, .0, d) * (.6 + .4 * sin(time * (1.5 + h * 4.) + h * 40.)) * smoothstep(.02, .2, direction.y) * (1.2 + 2.5 * aoH(ce + 5.3)); }
        float md = dot(direction, normalize(moonDir));
        nc += vec3(.95, .95, .9) * smoothstep(.99955, .99968, md) * 2.4 + vec3(.5, .55, .7) * (pow(max(md, 0.), 900.) * .35 + pow(max(md, 0.), 60.) * .02);
        col = mix(col, nc, night);
        // clouds on a plane above: lit tops in the cloud colour, thicker parts toward the shade colour
        if (direction.y > 0.) { vec2 cp = direction.xz / (direction.y + .07) * .8 + vec2(time * .007, time * .0025);
          float n = (aoN(cp) * .5 + aoN(cp * 2.07 + 3.1) * .25 + aoN(cp * 4.31 + 7.7) * .125 + aoN(cp * 8.9 + 1.3) * .0625) / .9375;
          float cv = smoothstep(1. - cover, 1. - cover + .2, n) * smoothstep(.0, .14, direction.y);
          col = mix(col, mix(cloudCol, cloudShade, clamp((n - 1. + cover) * 2.4, 0., 1.)), cv * .93); }
        col = mix(col, cloudShade, overcast);
        col = mix(fogCol, col, smoothstep(-.02, .13, direction.y));
        gl_FragColor = vec4(min(col, vec3(6.)), 1.0);`);
    scene.add(sky); three.sky = sky;
  }
  function skyLight(slot, t, wet, cold, fogLin) {
    const S = three.sky; if (!S) return;
    const u = S.material.uniforms, P = SKY3D[slot], az = Math.atan2(t.sun[2][2], t.sun[2][0]), el = P.el * Math.PI / 180;
    u.sunPosition.value.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    u.turbidity.value = P.turb; u.rayleigh.value = P.ray; u.mieCoefficient.value = P.mie; u.mieDirectionalG.value = P.g; u.skyK.value = P.k; u.skyTint.value.setRGB(...P.tint);
    u.night.value = slot === 'night' ? 1 : 0;
    u.cover.value = wet ? .85 : cold ? .7 : P.cover;
    u.overcast.value = wet ? .78 : cold ? .55 : 0;
    const grey = slot === 'night' ? [.016, .018, .026] : slot === 'evening' ? [.3, .27, .3] : cold ? [.72, .75, .8] : [.42, .45, .5];
    u.cloudCol.value.setRGB(...(wet || cold ? grey.map(v => v * 1.15) : P.cloud)); u.cloudShade.value.setRGB(...(wet || cold ? grey : P.shade));
    u.fogCol.value.copy(fogLin);
    u.moonDir.value.set(-.62, .42, -.66).normalize(); // low over the lake, where a camera can see it
  }
  // pools of warm light under the street and garden lamps after dark: one instanced, additive ground decal each
  function buildPools() {
    const spots = []; const v = new THREE.Vector3();
    three.scene.updateMatrixWorld(true);
    three.lamps.forEach(l => { if (l.light || !l.bulb) return; l.bulb.getWorldPosition(v); spots[spots.length] = [v.x, v.z, Math.max(2.2, v.y * .95)]; });
    if (!spots.length) return;
    const tex = ctex(128, 128, (g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(255,214,150,.75)'); r.addColorStop(.35, 'rgba(255,196,120,.38)'); r.addColorStop(.7, 'rgba(255,180,100,.1)'); r.addColorStop(1, 'rgba(255,170,90,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); });
    tex.repeat.set(1, 1); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 1, polygonOffset: true, polygonOffsetFactor: -2 });
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const im = new THREE.InstancedMesh(geo, m, spots.length), d = new THREE.Object3D();
    spots.forEach(([x, z, r], i) => { d.position.set(x, .03, z); d.scale.set(r * 2.2, 1, r * 2.2); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
    im.renderOrder = 2; im.frustumCulled = false; im.name = 'lamp-pools'; im.visible = false; three.scene.add(im); three.pools = im;
  }
  // v59: the water shaders' light, sun and sky per time of day and weather (their body colour is lit by `light`)
  const WATER_LIGHT = { morning: .85, afternoon: 1, evening: .55, night: .1 }, POOL_GLOW = { morning: 0, afternoon: 0, evening: .2, night: .5 }, CAUS = { morning: .8, afternoon: 1, evening: .3, night: 0 };
  function waterLight(slot, t, sky, wet, cold) {
    if (!WAT) return;
    WAT.light.value = WATER_LIGHT[slot] * (wet ? .65 : 1);
    WAT.glow.value = POOL_GLOW[slot]; WAT.caus.value = CAUS[slot] * (wet ? .15 : cold ? .5 : 1);
    WAT.sunDir.value.set(...t.sun[2]).normalize();
    WAT.sunColor.value.setHex(t.sun[0]).convertSRGBToLinear().multiplyScalar(t.sun[1] * (wet ? .1 : cold ? .5 : 1) * (slot === 'night' ? .4 : 1));
    const h = sky.clone().convertSRGBToLinear(); WAT.skyHor.value.copy(h); WAT.skyTop.value.copy(h).multiply(new THREE.Color(.45, .62, 1));
    WAT.rain.value = wet ? 1 : 0; WAT.ice.value = cold ? 1 : 0; BANK_SNOW.value = cold ? 1 : 0; if (three.lilyMat) three.lilyMat.color.copy(lin(cold ? 0xdfe8ec : 0x4f8a3e)); // v59: pads under snow on the frozen lake
  }
  function applyLight3D(slot) {
    if (!three.ok) return;
    const t = TIMES3D[slot], wet = weather === 'rain', cold = weather === 'snow';
    const sky = new THREE.Color(t.sky);
    if (wet || cold) sky.lerp(new THREE.Color(slot === 'night' ? 0x1f2632 : 0x9aa4ae), wet ? .6 : .45);
    // the composer works in linear HDR and OutputPass encodes to sRGB at the end, so the sky colour goes in linear
    const skyLin = three.post ? sky.clone().convertSRGBToLinear() : sky;
    three.scene.background = skyLin;
    three.scene.fog = new THREE.Fog(skyLin, wet ? 40 : cold ? 60 : 110, wet ? 170 : cold ? 230 : 330);
    three.scene.environmentIntensity = ENV3D[slot] * (wet ? (slot === 'night' ? 1.2 : 1) : cold ? 1.1 : 1);
    // v58: the HDR sky by day, scaled by ENV_SKY_K so a room is as bright as it was under the studio light
    const sky3 = (slot === 'morning' || slot === 'afternoon') && three.envSky;
    three.scene.environment = sky3 ? three.envSky : three.envRoom; if (sky3) three.scene.environmentIntensity *= ENV_SKY_K;
    if (three.post) { const b = three.post.bloom; b.threshold = wet && slot !== 'night' ? Math.min(BLOOM3D[slot], 3.8) : BLOOM3D[slot]; b.enabled = three.post.level < 2 && b.threshold < 5; }
    waterLight(slot, t, sky, wet, cold);
    three.conifers.forEach(m => m.color.copy(lin(cold ? 0xdfe8ec : wet ? 0x284f33 : 0x2f5e3a)));
    three.hills.forEach(m => m.color.copy(lin(cold ? 0xe3ebef : weather === 'autumn' ? 0x9a8a4a : wet ? 0x4f7a50 : 0x5f8a5a)));
    three.hemi.color.setHex(t.hemi[0]); three.hemi.groundColor.setHex(cold ? 0xd8e0e6 : t.hemi[1]); three.hemi.intensity = (t.hemi[2] * (wet ? .85 : 1) + (cold ? .1 : 0)) * LX;
    three.sun.color.setHex(t.sun[0]); three.sun.intensity = t.sun[1] * (wet ? .35 : cold ? .6 : 1) * LX; three.sun.position.set(...t.sun[2]);
    if (three.ambient) three.ambient.intensity = AMB3D[slot] * LX * (wet && slot !== 'night' ? .85 : 1);
    three.renderer.toneMappingExposure = EXPO3D[slot];
    skyLight(slot, t, wet, cold, skyLin);
    if (FOL.sunCol.value) FOL.sunCol.value.copy(three.sun.color).multiplyScalar(three.sun.intensity / LX * (slot === 'night' ? .3 : .9));
    FOL.wind.value = wet ? 1.8 : weather === 'autumn' ? 1.4 : cold ? .5 : 1;
    if (three.pools) { const k = slot === 'night' ? 1 : slot === 'evening' ? .55 : wet ? .25 : 0; three.pools.visible = k > 0; three.pools.material.opacity = k; }
    const lampOn = t.lamps || (wet && slot !== 'afternoon' ? .6 : 0);
    three.lamps.forEach(l => {
      const on = l.off ? 0 : l.color ? Math.max(lampOn, .9) : lampOn;
      if (l.light) l.light.intensity = on * PK(l.light); l.bulb.material.emissiveIntensity = on ? EB.bulb : 0;
    });
    const indoor = slot === 'night' ? 1.1 : slot === 'evening' ? .7 : wet ? .45 : slot === 'morning' ? .15 : 0;
    three.roomLights.forEach((l, i) => { l.intensity = indoor * PK(l) * (i === 0 && three.proj && three.proj.on ? .6 : 1); }); // v58: the meeting room dims while the projector runs
    three.townWin.forEach(m => { m.emissiveIntensity = (slot === 'night' ? 1 : slot === 'evening' ? .6 : wet ? .2 : 0) * EB.win; });
    three.wins.forEach(m => { m.emissiveIntensity = Math.max(t.win, wet ? .25 : 0) * EB.win; });
    three.rain.visible = wet; three.snow.visible = cold; three.leaves.visible = weather === 'autumn';
    three.snowOnly.forEach(o => { o.visible = cold; });
    three.rainOnly.forEach(o => { o.visible = wet; });
    three.autumnOnly.forEach(o => { o.visible = weather === 'autumn'; });
    three.groundMat.color.copy(lin(wet ? 0x8a9a8a : weather === 'autumn' ? 0xd6c98f : 0xffffff));
    if (three.groundTint && three.groundMat === three.meadow) three.groundMat.color.multiply(three.groundTint); // v58: the grass set's palette tint
    three.groundMat.roughness = wet ? .45 : 1;
    // v59 wet ground: the road and the stone paths darken and turn glossy in the rain; flowers hide under snow
    [three.roadMat, M.paver].forEach(m => { if (!m) return; if (!m.userData.dry) m.userData.dry = { c: m.color.clone(), r: m.roughness }; m.color.copy(m.userData.dry.c).multiplyScalar(wet ? .62 : 1); m.roughness = m.userData.dry.r * (wet ? .28 : 1); });
    Object.values(three.flowerMats || {}).forEach(m => { m.visible = !cold; });
    if (three.splash) three.splash.visible = wet;
    if (three.rainU) three.rainU.light.value = slot === 'night' ? .25 : slot === 'evening' ? .6 : 1;
    if (three.grass) { three.grass.visible = !cold; three.grass.material.color.copy(lin(wet ? 0xb4c2b0 : weather === 'autumn' ? 0xe6d39a : 0xffffff)); } // v59: tufts under snow, darker wet, straw in autumn
    weatherTerrain();
    const pal = CANOPY[weather];
    three.canopies.forEach(c => c.m.color.copy(lin(pal[c.i % pal.length])));
    document.getElementById('stage').style.background = '#' + sky.getHexString();
  }

  // ---------- renderer, camera, tags ----------
  function resize3D() {
    if (!three.ok) return;
    const st = document.getElementById('stage'), w = st.clientWidth, h = st.clientHeight;
    if (!w || !h) return;
    // drawing buffer = CSS size x pixel ratio (setSize with false leaves the CSS size to the stylesheet), every pass follows
    three.renderer.setSize(w, h, false);
    if (three.post) three.post.composer.setSize(w, h);
    sizeMirror();
    three.camera.aspect = w / h; three.camera.updateProjectionMatrix();
    three.home = three.HOME.clone().sub(three.TARGET).multiplyScalar(w / h < 1.1 ? 1.45 : 1).add(three.TARGET);
  }
  function placeTags() {
    const st = document.getElementById('stage'), w = st.clientWidth, h = st.clientHeight, v = three.v;
    layoutBubbles(w, h);
    three.anchors.forEach(a => {
      if (a.obj) { v.copy(a.obj.position); v.y += a.y; } else v.set(a.x, a.y, a.z);
      v.project(three.camera);
      a.el.style.left = ((v.x + 1) / 2 * w).toFixed(1) + 'px';
      a.el.style.top = ((1 - v.y) / 2 * h).toFixed(1) + 'px';
      a.el.style.visibility = v.z < 1 && v.z > -1 ? 'visible' : 'hidden';
    });
  }
  let last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (document.hidden) { last = now; return; }
    const dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
    if (!reduce) {
      const t = now / 1000;
      if (three.boat) { const row = three.rowing && now < three.rowing; three.boat.position.y = three.boatY + Math.sin(t * 1.3) * (row ? .035 : .015); three.boat.rotation.z = Math.sin(t * .9) * (row ? .05 : .02); three.boat.position.x = 1.55 + (row ? Math.sin(t * .6) * .35 : 0); }
      const sh = three.shake; if (sh && sh.obj) { if (now < sh.until) sh.obj.position.set(sh.base.x + Math.sin(t * 40) * .006, sh.base.y, sh.base.z + Math.cos(t * 37) * .006); else { sh.obj.position.copy(sh.base); three.shake = null; } }
    }
    if (!reduce) { stepFountain(dt); stepHeli(now, dt); }
    stepProjector(dt);
    if (three.steam) { const on = now < three.steam.until; three.steam.list.forEach(s => { if (!on && s.m.material.opacity <= 0) return; s.t = (s.t + dt * .45) % 1; s.m.position.y = three.steam.base + s.t * .7; s.m.scale.setScalar(.6 + s.t * 1.6); s.m.material.opacity = on ? .35 * (1 - s.t) : Math.max(0, s.m.material.opacity - dt); }); }
    stepWalkers(dt); stepPoses(dt);
    if (!reduce) stepVacuums(dt);
    if (!reduce) stepTown(dt);
    CHARS.update(dt); // after stepWalkers and stepTown: a foot lock solved before its body moved lags one frame
    if (!reduce) { stepWeather(dt); if (weather !== 'snow') { TEX.water.offset.x += dt * .02; TEX.water.offset.y += dt * .013; three.waterTex.forEach(t => { t.offset.x += dt * .05; }); } }
    if (!reduce && three.poolWave && weather !== 'snow') {
      const W = three.poolWave, pa = W.geo.attributes.position; W.t += dt;
      for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i); pa.setZ(i, .018 * Math.sin(x * 1.7 + W.t * 1.6) + .012 * Math.sin(y * 2.3 - W.t * 1.2) + .006 * Math.sin((x + y) * 4.1 + W.t * 2.4)); }
      pa.needsUpdate = true; W.geo.computeVertexNormals();
    }
    if (three.controls && keysDown.size) {
      const c = three.controls, cam = three.camera, fwd = c.target.clone().sub(cam.position).setY(0).normalize(), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const sp = (keysDown.has('Shift') ? 26 : 11) * dt, mv = new THREE.Vector3();
      if (keysDown.has('ArrowUp')) mv.add(fwd); if (keysDown.has('ArrowDown')) mv.sub(fwd); if (keysDown.has('ArrowRight')) mv.add(right); if (keysDown.has('ArrowLeft')) mv.sub(right);
      if (mv.lengthSq()) { mv.normalize().multiplyScalar(sp); cam.position.add(mv); c.target.add(mv); }
      const turn = (keysDown.has('e') || keysDown.has('E') ? 1 : 0) - (keysDown.has('q') || keysDown.has('Q') ? 1 : 0);
      if (turn) { const off = cam.position.clone().sub(c.target); off.applyAxisAngle(new THREE.Vector3(0, 1, 0), turn * 1.4 * dt); cam.position.copy(c.target).add(off); }
    }
    stepCamTween(now);
    if (three.sky) { three.sky.position.copy(three.camera.position); if (!reduce) three.sky.material.uniforms.time.value += dt; }
    if (!reduce) FOL.time.value += dt; if (FOL.sunView.value) FOL.sunView.value.copy(three.sun.position).transformDirection(three.camera.matrixWorldInverse);
    if (three.controls) { three.controls.dampingFactor = 1 - Math.pow(1 - DAMP, dt * 60); three.controls.update(); } // same glide at any frame rate
    three.renderer.info.reset(); // counted per frame (autoReset is off), so the test probe sees every pass of one frame
    if (WAT) { if (!reduce) WAT.time.value += dt; renderMirror(); } // v59: the lake and river reflection, counted in the frame's calls
    if (three.post) {
      const P = three.post, d = P.composer.readBuffer.depthTexture; // the scene pass draws into readBuffer; keep AO on its depth
      if (P.gtao.depthTexture !== d) P.gtao.setGBuffer(d);
      P.composer.render(dt);
    } else three.renderer.render(three.scene, three.camera);
    watchQuality(now);
    // v59: the reflection drops to its lean layer while the frame would pass the draw-call budget, and returns with headroom
    { const W = three.mirror; if (W && W.drew) { const base = three.renderer.info.render.calls - W.cost; W.lite = base + (W.fullCost || W.cost) > W.budget + (W.lite ? -150 : 0); W.every = (W.lite && base + W.cost > W.budget) || (three.post && three.post.level >= 1) ? 2 : 1; W.drew = false; } }
    placeTags();
  }
  // ---------- smooth camera moves: zoom and reset glide instead of jumping ----------
  const DAMP = .06;
  let camTween = null;
  function glideCamera(pos, target, ms = 650) {
    const c = three.controls;
    if (reduce || !c) { three.camera.position.copy(pos); if (c) { c.target.copy(target); c.update(); } else three.camera.lookAt(target); return; }
    camTween = { p0: three.camera.position.clone(), p1: pos.clone(), t0: c.target.clone(), t1: target.clone(), start: performance.now(), ms };
  }
  function stepCamTween(now) {
    if (!camTween) return;
    const k = Math.min(1, (now - camTween.start) / camTween.ms), e = 1 - Math.pow(1 - k, 3); // ease out cubic
    three.camera.position.lerpVectors(camTween.p0, camTween.p1, e); three.controls.target.lerpVectors(camTween.t0, camTween.t1, e);
    if (k >= 1) camTween = null;
  }
  // ---------- quality fallback: under 40 fps for 3 s steps down AO, then shadows and bloom, then pixel ratio ----------
  const perfWin = { t0: 0, frames: 0, slow: 0, log: [] };
  function watchQuality(now) {
    const P = three.post; if (!P || P.locked) return;
    if (!perfWin.t0) { perfWin.t0 = now; return; }
    perfWin.frames++;
    if (now - perfWin.t0 < 1000) return;
    const fps = perfWin.frames * 1000 / (now - perfWin.t0); perfWin.t0 = now; perfWin.frames = 0;
    if (document.hidden) return;
    perfWin.slow = fps < 40 ? perfWin.slow + 1 : 0;
    if (perfWin.slow < 3 || P.level >= 3) return;
    perfWin.slow = 0; P.level++;
    if (P.level === 1) { P.gtao.enabled = false; if (three.mirror) { three.mirror.every = 2; three.mirror.half = true; sizeMirror(); } } // v59: the water mirror at a lower rate too
    if (P.level === 2) { const s = three.sun.shadow; s.mapSize.set(1024, 1024); if (s.map) { s.map.dispose(); s.map = null; } P.bloom.enabled = false; }
    if (P.level === 3) { three.renderer.setPixelRatio(1); P.composer.setPixelRatio(1); resize3D(); }
    perfWin.log.push({ level: P.level, fps: Math.round(fps) });
    console.info('render quality lowered to level ' + P.level + ' at ' + Math.round(fps) + ' fps');
  }
  // ---------- post processing: render, ambient occlusion, bloom, tone map, grade, anti-alias ----------
  // Linear HDR (half float) until OutputPass applies ACES Filmic and sRGB; the grade and SMAA then work on display colour.
  const GRADE = {
    uniforms: { tDiffuse: { value: null }, sat: { value: 1.06 }, warm: { value: .018 }, lift: { value: .012 }, vig: { value: .22 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float sat, warm, lift, vig; varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        float l = dot(c.rgb, vec3(.2126, .7152, .0722));
        c.rgb = mix(vec3(l), c.rgb, sat);                       // a touch more colour, like the Sims palette
        c.rgb *= vec3(1. + warm, 1. + warm * .35, 1. - warm);   // warm, never orange
        c.rgb = c.rgb + lift * (1. - c.rgb);                    // lifted blacks: shadows stay soft, never ink
        vec2 d = vUv - .5; c.rgb *= 1. - vig * dot(d, d);       // gentle vignette toward the corners
        gl_FragColor = c;
      }`
  };
  function buildPost(renderer, scene, camera) {
    if (!FX) return;
    const st = document.getElementById('stage'), w = Math.max(1, st.clientWidth), h = Math.max(1, st.clientHeight);
    // both ping-pong targets carry a depth texture, so ambient occlusion can read the depth the scene pass just wrote
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(w, h) });
    const composer = new FX.EffectComposer(renderer, rt);
    composer.addPass(new FX.RenderPass(scene, camera));
    const gtao = new FX.GTAOPass(scene, camera, w, h);
    // Fed the scene pass's own depth (normals rebuilt from it), GTAO never draws the scene a second time: with about
    // 8,000 draw calls a frame, a second scene pass halved the frame rate. That depth also honours alphaTest, so leaf
    // cards shade as leaves, not squares. Set after construction: r170 cannot take a depth texture in its constructor.
    gtao.setGBuffer(composer.readBuffer.depthTexture);
    // occlusion is soft and low frequency: computed at half resolution and filtered up, at a quarter of the cost
    const gtaoSize = gtao.setSize.bind(gtao); gtao.setSize = (sw, sh) => gtaoSize(Math.max(1, sw >> 1), Math.max(1, sh >> 1));
    gtao.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    gtao.updateGtaoMaterial({ radius: .55, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: 16 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    gtao.blendIntensity = .75;
    composer.addPass(gtao);
    const bloom = new FX.UnrealBloomPass(new THREE.Vector2(w, h), .32, .45, 9);
    composer.addPass(bloom);
    composer.addPass(new FX.OutputPass());
    const grade = new FX.ShaderPass(GRADE); composer.addPass(grade);
    const smaa = new FX.SMAAPass(w * renderer.getPixelRatio(), h * renderer.getPixelRatio()); composer.addPass(smaa);
    three.post = { composer, gtao, bloom, grade, smaa, level: 0 };
  }
  function init3D() {
    if (!THREE) return false;
    const canvas = document.getElementById('scene3d');
    let renderer;
    // antialias off: the composer renders off screen, where SMAA at the end does the edge smoothing
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); } catch { return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    MAX_ANISO = renderer.capabilities.getMaxAnisotropy(); renderer.info.autoReset = false;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 16 / 10, .1, 420);
    const TARGET = new THREE.Vector3(8 * K + 2.5, .4, 6 * K + 1.5), HOME = TARGET.clone().add(new THREE.Vector3(19, 21, 22));
    camera.position.copy(HOME);
    let controls = null;
    if (OrbitControls) {
      controls = new OrbitControls(camera, canvas);
      controls.target.copy(TARGET); controls.enableDamping = true; controls.dampingFactor = DAMP; controls.maxPolarAngle = 1.35;
      controls.addEventListener('start', () => { camTween = null; }); // a hand on the camera always wins over a glide
      controls.minDistance = 4; controls.maxDistance = 95; controls.screenSpacePanning = false; controls.update();
    } else camera.lookAt(TARGET);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8a6a, .8); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0003; sun.shadow.normalBias = .025;
    Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 110 });
    sun.target.position.copy(TARGET); scene.add(sun, sun.target);
    const ambient = new THREE.AmbientLight(0xffffff, .12 * LX); scene.add(ambient);
    three.ambient = ambient; // v59: its strength follows the time of day (AMB3D)
    Object.assign(three, { ok: true, renderer, scene, camera, controls, hemi, sun, HOME, TARGET, v: new THREE.Vector3() });
    makeTextures(); makeMaterials();
    // environment light: three's RoomEnvironment (a soft-boxed studio, built in code, nothing downloaded) prefiltered
    // into a PMREM map, so wood, metal, glass and water get believable reflections; its strength follows the time of day
    const pm = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
    scene.environment = pm.fromScene(room, .04).texture; room.dispose(); pm.dispose();
    // v58: by day the reflections and fill come from a real sky (Poly Haven kloofendal_48d_partly_cloudy_puresky,
    // CC0, 1K HDR), prefiltered the same way; dusk and night keep the studio above, which suits lamp-lit rooms.
    // Never shown as the background: the sky colour per time of day stays as it was.
    three.envRoom = scene.environment;
    if (RGBELoader) new RGBELoader(loadMgr()).load(EMBED_HDR, t => {
      const p2 = new THREE.PMREMGenerator(renderer); three.envSky = p2.fromEquirectangular(t).texture; t.dispose(); p2.dispose(); applyScene();
    });
    buildPost(renderer, scene, camera);
    const world = new THREE.Group(); scene.add(world);
    buildOffice(world);
    // Anything smaller than 8 cm across (LEDs, cups, cables, knobs) throws a shadow of about three shadow-map texels
    // that the soft filter blurs away, yet costs a draw call in the shadow pass; such pieces receive shadows only.
    world.updateMatrixWorld(true);
    world.traverse(o => { if (!o.isMesh || o.isInstancedMesh || !o.castShadow) return; const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); if (g.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis() < .08) o.castShadow = false; });
    three.people = new THREE.Group(); scene.add(three.people);
    buildWeather(scene);
    buildSky(scene);
    resize3D(); camera.position.copy(three.home);
    if (controls) controls.update();
    if (window.ResizeObserver) new ResizeObserver(resize3D).observe(document.getElementById('stage')); else window.addEventListener('resize', resize3D);
    requestAnimationFrame(loop);
    return true;
  }
  // Move the camera toward or away from what it looks at, inside the controls' distance limits.
  function zoomBy(f) {
    if (!three.ok) return;
    // a second click during a glide continues from where the glide is heading, so steps add up as before
    const t = camTween ? camTween.t1 : three.controls ? three.controls.target : three.TARGET;
    const off = (camTween ? camTween.p1 : three.camera.position).clone().sub(t);
    const d = Math.min(75, Math.max(4, off.length() * f));
    glideCamera(t.clone().add(off.setLength(d)), t, 380);
  }
  function resetView() {
    if (!three.ok) return;
    glideCamera(three.home, three.TARGET, 750);
  }

  // ---------- page rendering ----------
  function drawPeople() {
    const spots = placeAll();
    people.forEach(p => { p._room = spots.get(p.id).room; });
    if (!three.ok) return;
    placeFigures(spots);
    const tags = document.getElementById('tags'); tags.innerHTML = '';
    three.anchors = [];
    ROOMS.forEach(r => {
      if (!r.name) return;
      const t = document.createElement('div'); t.className = 'room-tag'; t.textContent = r.name; tags.appendChild(t);
      three.anchors.push({ el: t, x: (r.x + r.w / 2) * K, y: .1, z: (r.z + r.d) * K - .45 });
    });
    PLACES.forEach(pl => { const t = document.createElement('div'); t.className = 'room-tag'; t.textContent = pl.name; tags.appendChild(t); if (pl.dock) { const d = dockSpot(0); three.anchors.push({ el: t, x: d.x, y: .1, z: d.y + 1.2 }); return; } const [dx, dz] = shiftOf(pl.ax, pl.az); three.anchors.push({ el: t, x: pl.x + dx, y: pl.y, z: pl.z + dz }); });
    people.forEach(p => {
      const tag = document.createElement('div'); tag.className = 'tag'; tag.dataset.state = p.state;
      tag.innerHTML = '<i></i><b></b><span></span>';
      tag.querySelector('i').style.background = STATES[p.state].color;
      tag.querySelector('b').textContent = labelOf(p);
      const sp = spots.get(p.id);
      tag.querySelector('span').textContent = sp.act ? sp.act : p.issue ? issueKey(p.issue) : p.state === 'idle' ? 'พัก' : '';
      tag.dataset.pid = p.id; tag.setAttribute('role', 'button'); tag.tabIndex = -1; if (p.id === hoverPid) tag.classList.add('show');
      tag.addEventListener('click', e => { e.stopPropagation(); openMenu(p.id); });
      tags.appendChild(tag);
      three.anchors.push({ el: tag, obj: three.figures.get(p.id), y: sp.pose === 'stand' ? 1.85 : 1.5 });
    });
    placeTags();
  }

  function drawTeamList() {
    const ul = document.getElementById('teamList'); ul.innerHTML = '';
    // listed by rank (owner comment, 14 Oct 2026: "เรียงตามลำดับตำแหน่ง"); people of one role keep their A, B order
    const RANK = ['head', 'po', 'ba', 'tl', 'dev', 'qal', 'qa'];
    [...people].sort((a, b) => RANK.indexOf(a.role) - RANK.indexOf(b.role)).forEach(p => {
      const li = document.createElement('li'); li.className = 'card';
      li.innerHTML = `<span class="swatch"></span><div class="who-now"><div class="top"><b></b><span class="status ${STATES[p.state].cls}"><i></i><span></span></span></div><div class="doing"></div><div class="duty"></div><span class="meta"></span></div>`;
      li.querySelector('.swatch').style.background = ROLES[p.role].color;
      li.querySelector('b').textContent = labelOf(p);
      li.querySelector('.meta').textContent = p._room ? 'อยู่ที่ ' + p._room : '';
      li.title = 'หน้าที่: ' + p.duty + (p._room ? ' · อยู่ที่ ' + p._room : '');
      li.querySelector('.duty').textContent = 'หน้าที่: ' + p.duty;
      li.querySelector('.doing').textContent = p.release ? holderText(p.release) : p.issue ? `${issueKey(p.issue)} · ${laneOf(p.issue).th}` : p.role === 'head' && p.gates.length ? `ส่งเรื่องให้เจ้าของ ${p.gates.length} ใบ` : p.state === 'sweeping' ? 'sweep ประจำวัน (agent-sweep.yml)' : 'พักเบรก'; // R7: never a standing duty as current work
      if (p.role === 'head' && p.gates.length) putSrc(li.querySelector('.doing'), boardLines(live.state).summaryText);
      li.querySelector('.status span').textContent = { working: 'ทำงาน', waiting: 'รอเจ้าของ', blocked: 'ติดปัญหา', sweeping: 'ทำงาน · sweep', idle: 'พักเบรก' }[p.state];
      // no command button here (owner, 14 Oct 2026: "เราไม่สั่ง คุณต้องรู้หน้าที่ตนเอง"); each role pulls its own work
      ul.appendChild(li);
    });
    const c = { working: 0, sweeping: 0, waiting: 0, blocked: 0, idle: 0 }; people.forEach(p => c[p.state]++);
    const st = document.getElementById('summaryText');
    st.textContent = live.state ? `ทำงาน ${c.working + c.sweeping} · รอเจ้าของ ${c.waiting} · ติด ${c.blocked} · พัก ${c.idle}` : ''; // R16
    putSrc(st, live.state ? boardLines(live.state).summaryText : null);
  }

  // one column per team; a card says who holds it and at which step it is
  const TEAMS = [
    { k: 'pob', th: 'PO · BA', sub: 'PO เขียน AC · BA เขียน plan', lanes: ['ready', 'analysis', 'planning'], kind: 'work' },
    { k: 'dev', th: 'Dev', sub: 'Dev และ Tech Lead', lanes: ['queued', 'building', 'in-review', 'merging'], kind: 'work' },
    { k: 'qa', th: 'QA', sub: 'QA Lead และ QA', lanes: ['test-planning'], kind: 'work', release: true },
    { k: 'block', th: 'Blocker', sub: 'งานที่ติดปัญหา', lanes: ['blocked'], kind: 'block' }
  ];
  function drawFlow() {
    const flow = document.getElementById('flow'); flow.innerHTML = '';
    const lines = live.state ? boardLines(live.state) : {};
    const fit = matchMedia('(max-width: 560px)').matches ? 3 : matchMedia('(max-width: 1024px)').matches ? 4 : 7;
    TEAMS.forEach(t => {
      const here = issues.filter(i => t.lanes.includes(i.lane)).sort((a, b) => t.lanes.indexOf(b.lane) - t.lanes.indexOf(a.lane));
      const col = document.createElement('div'); col.className = 'col'; col.dataset.kind = t.kind;
      const head = document.createElement('div'); head.className = 'col-head';
      const b = document.createElement('b'); b.textContent = live.state ? `${t.th} · ${here.length} ใบ` : t.th; putSrc(b, lines.summaryText);
      const who = document.createElement('span'); who.className = 'who'; who.textContent = t.sub;
      head.append(b, who);
      const body = document.createElement('div'); body.className = 'col-body';
      if (!here.length) { const e = document.createElement('span'); e.className = 'empty'; e.textContent = t.k === 'block' ? 'ไม่มีงานที่ติดปัญหา' : 'ไม่มีงาน'; body.appendChild(e); }
      if (t.release) PROJECTS_LIVE.forEach(pr => {
        // one release card per project (owner, 14 Oct 2026); its numbers are the function's (R3, R8, R34)
        const pj = pr.name, rt = releaseText(pr.release);
        const rc = document.createElement('div'); rc.className = 'chip rel'; rc.dataset.project = pj;
        rc.innerHTML = '<span class="num"></span><span class="pchip"></span><span class="t"></span><span class="p"></span><span class="bar"><i></i></span>';
        const holder = rt.phase && rt.phase !== 'collect' && people.find(x => x.release);
        rc.querySelector('.num').textContent = 'รอบ release';
        const pc = rc.querySelector('.pchip'); pc.textContent = pj; pc.dataset.p = pj;
        const tt = rc.querySelector('.t'); tt.textContent = holder ? labelOf(holder) : rt.t; tt.classList.toggle('nosrc', rt.t === NO_SOURCE && !holder);
        const pp = rc.querySelector('.p'); pp.textContent = rt.p; pp.classList.toggle('nosrc', rt.p === NO_SOURCE);
        putSrc(rc, lines['release:' + pr.id] || null);
        rc.querySelector('.bar i').style.width = rt.bar + '%';
        body.appendChild(rc);
      });
      const shown = here.length > fit ? here.slice(0, fit - 1) : here;
      shown.forEach(i => {
        const role = roleOf(i), lane = LANE[i.lane];
        const chip = document.createElement('div'); chip.className = 'chip';
        chip.dataset.short = String(!!role && !i.holder);
        chip.innerHTML = '<span class="num"></span><span class="pchip"></span><span class="p"></span>';
        chip.querySelector('.num').textContent = issueKey(i);
        // the top right of a card names the project (owner, 14 Oct 2026); who holds it stays in the card's title and in the roster
        const who = !role ? (i.lane === 'blocked' ? 'ติดปัญหา' : 'รอคิว') : i.holder ? labelOf(i.holder) : lane.kind === 'wait' ? 'รอเจ้าของ' : 'รอ ' + ROLES[role].label + ' รับงาน';
        const pc = chip.querySelector('.pchip'); pc.textContent = projectOf(i); pc.dataset.p = projectOf(i);
        chip.title = i.title + ' · ' + who;
        const step = i.lane === 'blocked' ? (i.from && LANE[i.from] ? 'ติดที่ ' + LANE[i.from].th : 'ติดปัญหา') : lane.th; // R4
        chip.querySelector('.p').textContent = `${i.size || NO_SIZE} · ${step}`; // R32
        putSrc(chip, i.sizeNote);
        if (lane.gate) { const g = document.createElement('span'); g.className = 'gate'; g.textContent = lane.gate; chip.querySelector('.p').prepend(g, ' '); }
        if (i.kind === 'improvement') { const g = document.createElement('span'); g.className = 'imp'; g.textContent = 'Improvement'; chip.querySelector('.p').prepend(g, ' '); chip.title = '[Improvement] ' + i.title + ' · ' + who; }
        body.appendChild(chip);
      });
      if (shown.length < here.length) { const m = document.createElement('span'); m.className = 'more'; m.textContent = `+${here.length - shown.length} ใบ`; body.appendChild(m); }
      col.append(head, body); flow.appendChild(col);
    });
    const cap = document.getElementById('cap'), cp = live.state && live.state.cap;
    if (cp) { // R33: the counts and the limit are the function's
      cap.dataset.full = String(cp.building >= cp.limit);
      cap.innerHTML = 'เขียนโค้ดพร้อมกัน <b></b> · รอคิว <b></b> · ทั้งหมด <b></b> ใบ';
      const bs = cap.querySelectorAll('b'); bs[0].textContent = `${cp.building}/${cp.limit}`; bs[1].textContent = cp.queued; bs[2].textContent = cp.total;
      putSrc(cap, lines.cap);
    } else { cap.textContent = ''; cap.dataset.full = 'false'; putSrc(cap, null); }
    // ?test: every card in the flow carries its project chip, checked after each render
    if (/[?&]test/.test(location.search)) flow.querySelectorAll('.chip').forEach(c => { const pc = c.querySelector('.pchip'); if (!pc || !pc.textContent.trim() || !PROJECT_KEY[pc.textContent.trim()]) console.error('MISSING PROJECT LABEL', (c.querySelector('.num') || c).textContent.trim() + (c.dataset.project ? ' ' + c.dataset.project : '')); });
    drawProjects();
  }
  // the Projects tab: how many of each project's issues are on the board right now, counted from issues, never typed
  function drawProjects() {
    const grid = document.getElementById('projGrid'); if (!grid) return; grid.innerHTML = '';
    const lines = live.state ? boardLines(live.state) : {};
    PROJECTS_LIVE.forEach(pr => {
      const sec = document.createElement('section'); sec.className = 'scard';
      sec.innerHTML = '<div class="proj-head"><h3></h3><span class="pchip"></span><span class="scope"></span></div><p class="proj-line"></p><p class="now"></p>';
      sec.querySelector('h3').textContent = pr.name;
      const pc = sec.querySelector('.pchip'); pc.textContent = pr.name; pc.dataset.p = pr.name;
      sec.querySelector('.scope').textContent = pr.tag || '';
      sec.querySelector('.proj-line').textContent = pr.description || '';
      const now = sec.querySelector('.now'), has = pr.source !== 'none' && typeof pr.count === 'number'; // E4
      now.textContent = has ? `งานบนบอร์ดตอนนี้ ${pr.count} ใบ` : NO_SOURCE; now.classList.toggle('nosrc', !has);
      putSrc(now, has ? lines['project:' + pr.id] : null);
      grid.appendChild(sec);
    });
  }

  // R28: the roster of the config, read only; it changes by pull request to agent-office/projects.config.json.
  function drawEditor() {
    const list = document.getElementById('peopleList'); list.innerHTML = '';
    const tc = document.getElementById('teamCount'); tc.textContent = people.length ? `· ${people.length} คน` : '';
    const line = live.state ? fmtBangkok(live.state.readAt) && 'ที่มา: roster ในไฟล์ตั้งค่า agent-office/projects.config.json · ' + fmtBangkok(live.state.readAt) : null;
    putSrc(tc, people.length ? line : null);
    ['head', 'po', 'ba', 'tl', 'dev', 'qal', 'qa'].forEach(rk => {
      const members = people.filter(p => p.role === rk); if (!members.length) return;
      const sec = document.createElement('section'); sec.className = 'tgroup';
      sec.innerHTML = '<header><i></i><b></b><span></span></header><p></p>';
      sec.querySelector('i').style.background = ROLES[rk].color; sec.querySelector('b').textContent = ROLES[rk].label;
      const n = sec.querySelector('header span'); n.textContent = members.length + ' คน'; putSrc(n, line);
      sec.querySelector('p').textContent = ROLES[rk].duty;
      members.forEach(p => { const d = document.createElement('p'); d.className = 'pm-ro'; d.textContent = labelOf(p) + (p.duty !== ROLES[rk].duty ? ' · ' + p.duty : ''); sec.appendChild(d); });
      list.appendChild(sec);
    });
  }

  function render(rebuildDesk) {
    applyLive();
    if (rebuildDesk && three.ok) buildDesk();
    drawPeople(); drawTeamList(); drawFlow(); drawEditor();
  }

  // ---------- time of day and weather ----------
  const TIMES = [['real', 'ตามเวลาจริง'], ['morning', 'เช้า'], ['afternoon', 'บ่าย'], ['evening', 'เย็น'], ['night', 'กลางคืน']];
  const TIME_TH = { morning: 'เช้า', afternoon: 'บ่าย', evening: 'เย็น', night: 'กลางคืน' };
  function bangkokHour() { try { return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Bangkok' }).format(new Date())); } catch { return new Date().getHours(); } }
  function realSlot() { const h = bangkokHour(); return h >= 6 && h < 11 ? 'morning' : h >= 11 && h < 16 ? 'afternoon' : h >= 16 && h < 19 ? 'evening' : 'night'; }
  function applyScene() {
    const slot = timeMode === 'real' ? realSlot() : timeMode;
    document.getElementById('nowText').textContent = (timeMode === 'real' ? `ตอนนี้ตามเวลาจริงคือช่วง${TIME_TH[slot]}` : `ตั้งเป็นช่วง${TIME_TH[slot]}`) + ` · ${WEATHER[weather]}`;
    document.querySelectorAll('#timeGrid button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === timeMode)));
    document.querySelectorAll('#weatherGrid button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.w === weather)));
    applyLight3D(slot);
  }
  function drawChoices() {
    const tg = document.getElementById('timeGrid');
    const TI = { real: '🕒', morning: '🌅', afternoon: '☀️', evening: '🌇', night: '🌙' };
    TIMES.forEach(([k, t]) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.t = k; b.innerHTML = '<span class="ic" aria-hidden="true"></span><span></span>'; b.firstChild.textContent = TI[k]; b.lastChild.textContent = t; b.addEventListener('click', () => { timeMode = k; store.set('ao3.time', k); applyScene(); }); tg.appendChild(b); });
    const wg = document.getElementById('weatherGrid');
    const WI = { clear: '🌤️', rain: '🌧️', snow: '❄️', autumn: '🍂' };
    Object.entries(WEATHER).forEach(([k, t]) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.w = k; b.innerHTML = '<span class="ic" aria-hidden="true"></span><span></span>'; b.firstChild.textContent = WI[k]; b.lastChild.textContent = t; b.addEventListener('click', () => { weather = k; store.set('ao3.weather', k); applyScene(); }); wg.appendChild(b); });
  }

  // ---------- clock, tabs, theme, roster, simulation ----------
  function tick() {
    try {
      const o = {}; new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Bangkok' }).formatToParts(new Date()).forEach(p => { o[p.type] = p.value; });
      document.getElementById('clock').textContent = `${o.weekday} ${o.day} ${o.month} ${o.year} ${o.hour}.${o.minute} ${String(o.dayPeriod).toUpperCase()}`;
    } catch {}
    if (timeMode === 'real') applyScene();
  }
  document.querySelectorAll('[role="tab"]').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('[role="tab"]').forEach(t => { const on = t === tab; t.setAttribute('aria-selected', String(on)); document.getElementById(t.getAttribute('aria-controls')).hidden = !on; });
  }));
  const themeBtn = document.getElementById('themeBtn');
  function setTheme(mode) { if (mode) document.documentElement.dataset.theme = mode; else delete document.documentElement.dataset.theme; const dark = mode ? mode === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches; themeBtn.setAttribute('aria-pressed', String(dark)); }
  setTheme(store.get('ao3.theme', null));
  themeBtn.addEventListener('click', () => { const next = themeBtn.getAttribute('aria-pressed') === 'true' ? 'light' : 'dark'; store.set('ao3.theme', next); setTheme(next); });
  document.getElementById('resetView').addEventListener('click', resetView);
  document.getElementById('soundBtn').addEventListener('click', toggleSound);
  document.getElementById('zoomIn').addEventListener('click', () => zoomBy(.75));
  document.getElementById('zoomOut').addEventListener('click', () => zoomBy(1 / .75));
  // ---------- money (owner correction, 16 Oct 2026): every figure is the function's, computed from recorded facts,
  // shown with its source line (R58); a figure without a source shows "ยังไม่มีแหล่งข้อมูล" (R40). Nothing is computed here.
  const toastEl = document.getElementById('toast'); let toastT = 0;
  function toast(parts) {
    toastEl.innerHTML = '';
    parts.forEach(([text, strong]) => { const s = document.createElement(strong ? 'b' : 'span'); s.textContent = text; toastEl.appendChild(s); });
    toastEl.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { toastEl.hidden = true; }, 3800);
    if (hasGsap) gsap.from(toastEl, { y: -8, opacity: 0, duration: .3, clearProps: 'opacity,transform' });
  }
  // Scene objects stay usable but cost nothing: water is CI fix rounds and supplies are working days (R36, R61, R62).
  const PACKS = [];
  function useWater() {}
  function useStock() { return true; }
  function orderSupply() {}
  let fx = null; // R13: the rate card's rate, null until open.er-api.com answers
  function putSrc(el, line) { if (!el) return; if (line) { el.dataset.src = line; el.title = line; } else { delete el.dataset.src; el.removeAttribute('title'); } }
  function putCell(id, c) {
    const el = document.getElementById(id); if (!el) return;
    el.textContent = c.text; el.classList.toggle('nosrc', c.text === NO_SOURCE); putSrc(el, c.line);
  }
  function fillRow(tr, cells) { cells.forEach(c => { const td = document.createElement('td'); if (typeof c === 'string') td.textContent = c; else { td.textContent = c.text; td.classList.toggle('nosrc', c.text === NO_SOURCE); putSrc(td, c.line); } tr.appendChild(td); }); }
  let shownFund = null;
  function drawMoney() {
    if (!live.state) return;
    const v = viewOf(live.state, fx);
    Object.entries(v).forEach(([id, c]) => putCell(id, c));
    const m = live.state.money || {};
    if (hasGsap && typeof m.fund === 'number' && typeof shownFund === 'number' && shownFund !== m.fund && v.fundVal.line) {
      const el = document.getElementById('fundVal'), obj = { v: m.fund };
      gsap.from(obj, { v: shownFund, duration: 1.4, ease: 'power2.out', onUpdate: () => { el.textContent = '฿' + Math.round(obj.v).toLocaleString('en-US'); }, onComplete: () => { el.textContent = v.fundVal.text; } });
    }
    shownFund = typeof m.fund === 'number' ? m.fund : null;
    const owing = (id, c) => { const e = document.getElementById(id); if (e) e.dataset.owing = String(!!c.text && c.text !== 'ชำระเรียบร้อยแล้ว'); };
    owing('debtPill', v.debtChip); owing('officePill', v.officeChip); owing('kDebtBox', v.debtChip);
    const rows = moneyRows(live.state, fx);
    const mu = document.getElementById('missions'); mu.innerHTML = '';
    if (!rows.missions.length) { const li = document.createElement('li'); li.className = 'mission nosrc'; li.textContent = NO_SOURCE; mu.appendChild(li); }
    rows.missions.forEach(x => {
      const li = document.createElement('li'); li.className = 'mission' + (x.done ? ' done' : '');
      li.innerHTML = '<span class="m-t"></span><span class="m-r"></span><span class="m-bar"><i></i></span><span class="m-p"></span>';
      li.querySelector('.m-t').textContent = (x.done ? '✓ ' : '') + x.th;
      const r = li.querySelector('.m-r'); r.textContent = x.reward.text; r.classList.toggle('nosrc', x.reward.text === NO_SOURCE); putSrc(r, x.reward.line);
      li.querySelector('.m-bar i').style.width = (x.goal ? Math.min(100, x.value / x.goal * 100) : 0) + '%';
      const pg = li.querySelector('.m-p'); pg.textContent = x.progress.text; pg.classList.toggle('nosrc', x.progress.text === NO_SOURCE); putSrc(pg, x.progress.line);
      mu.appendChild(li);
    });
    const pu = document.getElementById('paid'); pu.innerHTML = '';
    if (!rows.paid.length) { const li = document.createElement('li'); li.className = 'nosrc'; li.textContent = NO_SOURCE; pu.appendChild(li); }
    rows.paid.forEach(x => {
      const li = document.createElement('li'); li.innerHTML = '<span class="t"></span><span class="amt"></span><span class="note"></span>';
      li.querySelector('.t').textContent = x.t; const a = li.querySelector('.amt'); a.textContent = x.amt.text; putSrc(a, x.amt.line); li.querySelector('.note').textContent = x.note;
      pu.appendChild(li);
    });
    const tb = document.getElementById('tiers'); tb.innerHTML = '';
    if (!rows.tiers.length) { const tr = document.createElement('tr'); fillRow(tr, [{ text: NO_SOURCE, line: null }]); tb.appendChild(tr); }
    rows.tiers.forEach(t => { const tr = document.createElement('tr'); tr.innerHTML = '<td><span class="size"></span> <span class="muted"></span></td>'; tr.querySelector('.size').textContent = t.k; tr.querySelector('.muted').textContent = t.th || ''; fillRow(tr, [t.thb]); tb.appendChild(tr); });
    const rc = document.getElementById('rateCard'); rc.innerHTML = '';
    if (!rows.rate.length) { const tr = document.createElement('tr'); fillRow(tr, [{ text: NO_SOURCE, line: null }]); rc.appendChild(tr); }
    rows.rate.forEach(r => { const tr = document.createElement('tr'); fillRow(tr, [r.k, r.text]); rc.appendChild(tr); });
    const rm = document.getElementById('rateModel'); if (rm) rm.textContent = rows.model || NO_SOURCE;
    const cm = document.getElementById('costMethod'); cm.innerHTML = '';
    if (!rows.costMethod) { const tr = document.createElement('tr'); fillRow(tr, [{ text: NO_SOURCE, line: null }]); cm.appendChild(tr); }
    else rows.costMethod.forEach(e => { const tr = document.createElement('tr'); const th = document.createElement('th'); th.scope = 'row'; th.textContent = e.line; tr.appendChild(th); fillRow(tr, [[e.input, e.where, e.formula, (e.rates || []).map(r => r.text + ' (' + r.origin + ')').join(' · ')].filter(Boolean).join(' · ')]); cm.appendChild(tr); });
    if (rows.priceLink) {
      // R61, R64: a real link back to Numbeo (its terms), built with DOM APIs only, no HTML parsing.
      const tr = document.createElement('tr'), td = document.createElement('td'), a = document.createElement('a');
      a.href = rows.priceLink.url; a.textContent = rows.priceLink.text; a.rel = 'noopener noreferrer'; a.target = '_blank';
      td.colSpan = 2; td.appendChild(a); tr.appendChild(td); cm.appendChild(tr);
    }
  }

  // ---------- sound (owner, 14 Oct 2026, "เพลงประกอบ และเสียงคน เหมือนใน the sims4") ----------
  // Everything is synthesised with Web Audio: original focus music, rain, thunder and engines. No voices of any kind
  // (owner, 14 Oct 2026). No recordings, no game music.
  // Browsers allow sound only after a tap, so it starts from the ♪ button and is off by default.
  const audio = { ctx: null, on: false, master: null, music: null, timer: 0, step: 0 };
  function audioInit() {
    if (audio.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    audio.ctx = new AC(); audio.master = audio.ctx.createGain(); audio.master.gain.value = .5; audio.master.connect(audio.ctx.destination);
    audio.music = audio.ctx.createGain(); audio.music.gain.value = .28; const lp = audio.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    audio.music.connect(lp); lp.connect(audio.master);
    return true;
  }
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  function tone(freq, start, dur, type, gain, dest) {
    const c = audio.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(0, start); g.gain.linearRampToValueAtTime(gain, start + Math.min(.08, dur / 3)); g.gain.exponentialRampToValueAtTime(.0001, start + dur);
    o.connect(g); g.connect(dest || audio.master); o.start(start); o.stop(start + dur + .05);
  }
  // Focus music (owner, 14 Oct 2026: "ดนตรีประกอบแบบสร้างสมาธิ ไปรีเสิจมา แล้ว random ไปเรื่อยๆ ไม่ให้น่าเบื่อ").
  // Research used: Thompson, Schellenberg & Letnic 2012 (instrumental music hurt reading only when fast AND loud),
  // Kiss & Linnell 2021 (background music raised task-focus and cut mind wandering on an easy sustained task).
  // So: instrumental only, slow and quiet; the 62 to 78 BPM range is a judgment. A new scene (key, mode,
  // progression, tempo, lead instrument, optional rain bed) is drawn every 2 to 3 minutes and crossfaded.
  const KEYS = [['F', 53], ['D', 50], ['Bb', 46], ['Eb', 51], ['G', 55], ['C', 48], ['A', 45]];
  const MODES = { major: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10] };
  const PROGS = [[0, 5, 3, 4], [0, 3, 5, 4], [0, 4, 5, 3], [1, 4, 0, 5], [0, 2, 3, 4], [5, 3, 0, 4]];
  const LEADS = { keys: 'เปียโนนุ่ม', mallet: 'มาริมบา', pluck: 'เสียงดีดสาย', pad: 'แพดล่องลอย' };
  function newScene() {
    const [kn, root] = pick(KEYS), mode = pick(Object.keys(MODES));
    return { kn, root, mode, scale: MODES[mode], prog: pick(PROGS), bpm: 62 + Math.floor(Math.random() * 17), lead: pick(Object.keys(LEADS)), rain: Math.random() < .45, bars: 0, len: 24 + Math.floor(Math.random() * 16), mel: 7 };
  }
  function note(sc, degree, octave = 0) { const n = sc.scale.length, d = ((degree % n) + n) % n, o = Math.floor(degree / n); return sc.root + sc.scale[d] + 12 * (o + octave); }
  function voice(kind, freq, t, dur, gain) {
    const c = audio.ctx, out = c.createGain(); out.connect(audio.music);
    const env = (a, rel) => { out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(gain, t + a); out.gain.exponentialRampToValueAtTime(.0001, t + rel); };
    const osc = (type, f, det = 0) => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det; return o; };
    let nodes = [];
    if (kind === 'pad') { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(out); nodes = [osc('sawtooth', freq, -7), osc('sawtooth', freq, 7)]; nodes.forEach(o => o.connect(lp)); env(1.2, dur + 1.5); }
    else if (kind === 'keys') { nodes = [osc('sine', freq), osc('triangle', freq * 2)]; const g2 = c.createGain(); g2.gain.value = .25; nodes[1].connect(g2); g2.connect(out); nodes[0].connect(out); env(.01, 2.2); }
    else if (kind === 'mallet') { nodes = [osc('sine', freq), osc('sine', freq * 3.93)]; const g2 = c.createGain(); g2.gain.value = .18; nodes[1].connect(g2); g2.connect(out); nodes[0].connect(out); env(.005, 1.0); }
    else { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; lp.connect(out); nodes = [osc('triangle', freq)]; nodes[0].connect(lp); env(.004, .7); }
    nodes.forEach(o => { o.start(t); o.stop(t + dur + 2); });
  }
  function thunderClap() {
    if (weather !== 'rain' || document.hidden) return;
    // lightning: the sky and the ambient light jump for a moment, twice
    if (three.ok && three.hemi && !reduce) {
      const base = three.hemi.intensity;
      [0, 160].forEach((ms, k) => setTimeout(() => { three.hemi.intensity = base + (k ? 1.2 : 2) * LX; setTimeout(() => { three.hemi.intensity = base; }, 90); }, ms));
    }
    if (!audio.on) return;
    const c = audio.ctx, dur = 4 + Math.random() * 3, delay = .6 + Math.random() * 1.8, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    let v = 0; for (let i = 0; i < n; i++) { v = v * .985 + (Math.random() * 2 - 1) * .15; d[i] = v * (1 + .6 * Math.sin(i / (c.sampleRate * .37))); }
    const src = c.createBufferSource(), lp = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime + delay;
    src.buffer = buf; lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(140, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.9, t + .08); g.gain.exponentialRampToValueAtTime(.35, t + .9); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    src.connect(lp); lp.connect(g); g.connect(audio.master); src.start(t);
  }
  // thunder now and then, far apart (owner, 14 Oct 2026: "ฟ้าร้องฟ้าผ่า ถี่ไป ห่างกว่านี้"): every 1 to 2.5 minutes
  (function thunderLoop() { setTimeout(() => { thunderClap(); thunderLoop(); }, 60000 + Math.random() * 90000); })();
  function rainBed(on) {
    const c = audio.ctx;
    if (on && !audio.rain) {
      const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0); let last = 0;
      for (let i = 0; i < d.length; i++) { last = (last + .02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; const g = c.createGain(); g.gain.value = 0;
      src.connect(lp); lp.connect(g); g.connect(audio.master); src.start(); g.gain.linearRampToValueAtTime(.05, c.currentTime + 3); audio.rain = { src, g };
    } else if (!on && audio.rain) { const r = audio.rain; r.g.gain.linearRampToValueAtTime(0, c.currentTime + 2); setTimeout(() => r.src.stop(), 2500); audio.rain = null; }
  }
  function startScene(sc) {
    audio.scene = sc; audio.step = 0; rainBed(sc.rain);
    toast([['เพลงโฟกัส ', false], [`${sc.kn} ${sc.mode} · ${sc.bpm} BPM · ${LEADS[sc.lead]}`, true], [sc.rain ? ' · มีเสียงฝน' : '', false]]);
  }
  function musicTick() {
    if (!audio.on) return;
    let sc = audio.scene; if (!sc) { sc = newScene(); startScene(sc); }
    const c = audio.ctx, eighth = 60 / sc.bpm / 2, t = c.currentTime + .05, s = audio.step++, bar = Math.floor(s / 8), inBar = s % 8;
    const deg = sc.prog[bar % sc.prog.length];
    if (inBar === 0) {
      [0, 2, 4, 6].forEach(k => voice('pad', hz(note(sc, deg + k)), t, eighth * 8, .035));
      sc.bars++;
      if (sc.bars >= sc.len) { audio.music.gain.setTargetAtTime(.0001, t, .8); setTimeout(() => { if (!audio.on) return; startScene(newScene()); audio.music.gain.setTargetAtTime(.28, audio.ctx.currentTime, 1.2); }, 2600); }
    }
    if (inBar === 0 || inBar === 4) voice('keys', hz(note(sc, deg, -1)), t, eighth * 3, .06);
    // melody: a gentle random walk on the scale, with rests, sometimes echoing the bar before
    if (Math.random() < .42) {
      sc.mel = Math.max(4, Math.min(13, sc.mel + pick([-2, -1, -1, 0, 1, 1, 2])));
      voice(sc.lead === 'pad' ? 'keys' : sc.lead, hz(note(sc, sc.mel, 1)), t, eighth * (1 + Math.floor(Math.random() * 3)), .045);
    }
    audio.timer = setTimeout(musicTick, eighth * 1000);
  }
  // no spoken voices at all (owner, 14 Oct 2026: "ตัดเรื่องเสียงไทยออกไป ไม่ต้องมีเสียงพูดละ"); speech stays in the bubbles only
  function babble() {}

  const sfx = {
    // no voice-like blips at all (owner, 14 Oct 2026: "ยังได้ยินเสียงคนพูดอุ๊กๆ อิ๊ด ตัดทิ้งนะ อย่าให้ได้ยินอีก"); music, rain, thunder and engines stay
    pop() {},
    click() {},
    // a rotor thump: low saw wave with a fast amplitude wobble, for the length of the flight
    heli(sec) {
      if (!audio.on) return;
      const c = audio.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain(), lp = c.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = 55; lp.type = 'lowpass'; lp.frequency.value = 400;
      lfo.frequency.value = 14; lg.gain.value = .05; lfo.connect(lg); lg.connect(g.gain);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.07, t + 3); g.gain.setValueAtTime(.07, t + sec - 4); g.gain.linearRampToValueAtTime(0, t + sec);
      o.connect(lp); lp.connect(g); g.connect(audio.master); o.start(t); lfo.start(t); o.stop(t + sec + .1); lfo.stop(t + sec + .1);
    },
    cheer() {}
  };
  function toggleSound() {
    const btn = document.getElementById('soundBtn');
    if (!audioInit()) { toast([['เบราว์เซอร์นี้เล่นเสียงไม่ได้', false]]); return; }
    audio.on = !audio.on; btn.setAttribute('aria-pressed', String(audio.on)); btn.setAttribute('aria-label', audio.on ? 'ปิดเพลงและเสียง' : 'เปิดเพลงและเสียง');
    if (audio.on) { audio.ctx.resume(); clearTimeout(audio.timer); audio.music.gain.value = .28; musicTick(); sfx.pop(); }
    else { clearTimeout(audio.timer); rainBed(false); }
  }

  // ---------- speech bubbles (owner, 14 Oct 2026: casual 2026 Thai, like The Sims 4, e.g. "พี่จะวูบแล้วนะ งานเยอะเกิน";
  // and the same day: "เพิ่มบทสนทนา บทพูดของตัวละครให้หลากหลายไม่จำเจ เพื่อพูดคุยในทุกด้าน เหมือนที่คนสมัยนี้คุยกัน") ----------
  // How a line is chosen:
  //  * every pool is a shuffle-bag (dlgDraw): no line of a pool comes back until the whole pool has been used;
  //  * every person remembers what they said for DLG.memoryMs and never repeats it inside that window;
  //  * the context picks the pool, strongest first: activity > state > place > time of day / weather > role > small talk.
  // Lines may carry {key} (the person's ticket), {area} (their sweep area), {own} (their standing duty), {gate}.
  const DLG = { now: () => Date.now(), memoryMs: 10 * 60 * 1000 };
  const dlgBags = new WeakMap(), dlgSaid = new Map(), dlgBigSeen = new Map();
  function dlgShuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function dlgDraw(pool, avoid) {
    if (!pool || !pool.length) return null;
    let bag = dlgBags.get(pool);
    if (!bag || !bag.length) { bag = dlgShuffle(pool.slice()); dlgBags.set(pool, bag); }
    for (let i = bag.length - 1; i >= 0; i--) if (!avoid || !avoid(bag[i])) return bag.splice(i, 1)[0];
    return null;
  }
  function dlgMemo(id) { let m = dlgSaid.get(id); if (!m) { m = new Map(); dlgSaid.set(id, m); } return m; }
  function dlgRecent(id, key) { const m = dlgSaid.get(id), t = m && m.get(key); return t !== undefined && DLG.now() - t < DLG.memoryMs; }
  function dlgKeep(id, key) {
    const m = dlgMemo(id), now = DLG.now(); m.set(key, now);
    if (m.size > 80) m.forEach((t, k) => { if (now - t >= DLG.memoryMs) m.delete(k); });
  }
  function dlgFill(t, p) {
    return t.replace(/\{(\w+)\}/g, (all, k) => {
      if (k === 'key') return p.issue ? issueKey(p.issue) : 'ticket นี้';
      if (k === 'area') return 'ไล่หาจุดบอด';
      if (k === 'own') return ROLES[p.role] ? ROLES[p.role].own : 'งานประจำ';
      if (k === 'gate') return (p.issue && LANE[p.issue.lane] && LANE[p.issue.lane].gate) || 'gate';
      return all;
    });
  }
  // time of day: real clock in Bangkok, or the slot the owner set
  function dlgSlot() {
    const set = { morning: 9, afternoon: Math.random() < .5 ? 12 : 14, evening: 17, night: Math.random() < .5 ? 21 : 1 };
    const h = timeMode === 'real' || set[timeMode] === undefined ? bangkokHour() : set[timeMode];
    return h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 13 ? 'lunch' : h >= 13 && h < 16 ? 'slump' : h >= 16 && h < 19 ? 'evening' : h >= 19 && h < 23 ? 'night' : 'latenight';
  }

  // ---------- shared pools ----------
  const DLG_SCREEN = ['เปิดจอแล้ว ลุยงานต่อ', 'ปิดจอพักสายตาแป๊บ', 'สองจอทำงานไวขึ้นเยอะ', 'เช็กข้อความแป๊บ แล้วกลับมาทำต่อ', 'ปรับแสงจอลงหน่อย ตาจะได้ไม่ล้า'];
  const DLG_MAC = ['เปิด MacBook เริ่มงานกัน', 'แบตยังเยอะ ทำงานได้ยาว ๆ', 'ปิดเครื่องพักแป๊บ เครื่องร้อนแล้ว', 'อัปเดตเครื่องก่อน เดี๋ยวลืม', 'เคลียร์เดสก์ท็อปให้โล่งหน่อย'];
  const DLG_READ = ['เล่มนี้อ่านเพลินมาก', 'อ่านอีกบทเดียว แล้วกลับไปทำงาน', 'มุมอ่านหนังสือนี้เงียบดีจัง', 'หนังสือเรื่องนิสัยดี ๆ ใช้ได้จริงนะ', 'จดประโยคเด็ดเก็บไว้แล้ว', 'อ่านแล้วได้ไอเดียไปใช้กับงานเลย'];
  const DLG_COOK = ['วันนี้ทำเมนูอะไรดีน้า', 'สุ่มได้เมนูไหนก็ทำเมนูนั้น', 'ครัวพร้อม ใจพร้อม', 'ทำเผื่อทุกคนเลยนะ', 'เดี๋ยวกลิ่นหอมไปทั้งออฟฟิศแน่'];
  const DLG_MATCHA = ['มัทฉะเข้มข้น ใจฟู', 'ตีมัทฉะให้ฟองเนียน ๆ', 'มัทฉะลาเต้แก้วนี้คือดีมาก', 'สีเขียวสวยมาก ขอถ่ายรูปก่อน', 'ขอมัทฉะไม่หวาน สายสุขภาพ'];
  const DLG_MASSAGE = ['เก้าอี้นวดคือคำตอบของชีวิต', 'บ่าตึงมาก ขอโหมดแรงสุด', 'นวดสิบนาที หายเหนื่อยเลย', 'หลับตาแป๊บ อย่าเพิ่งเรียกน้า', 'หลังโล่งขึ้นเยอะเลย'];
  const DLG_TV = ['ดูสารคดีสัตว์โลกแป๊บ', 'ขอดูพยากรณ์อากาศหน่อย', 'ตอนเดียวพอ แล้วกลับไปทำงาน', 'ปิดทีวีแล้ว ไปต่อกัน', 'เสียงดังไปนิด ลดลงหน่อยนะ'];
  const DLG_HELI = ['บินชมเมือง ปังมาก', 'จากข้างบนเห็นแม่น้ำทั้งสาย', 'คาดเข็มขัดแล้ว พร้อมบิน', 'ถ่ายรูปเมืองจากฟ้าเก็บไว้', 'ตึกเล็กนิดเดียวเลยจากตรงนี้'];
  const DLG_HELIPAD = ['ตรวจเครื่องก่อนบินทุกครั้ง', 'ลานจอดเรียบร้อยดี', 'ใบพัดหมุนแล้ว เสียงดังมาก', 'ดับเครื่องแล้ว ปลอดภัย', 'ลมแรงนิดนึง รอให้เบาก่อน'];
  const DLG_BIKE = ['ยืมจักรยานไปปั่นรอบบึงแป๊บ', 'e-bike แบตเต็ม ไปได้ไกล', 'คืนจักรยานแล้ว ล็อกเรียบร้อย', 'จักรยานพอให้ทุกคนไหมน้า', 'ปั่นแป๊บเดียว เหงื่อออกเลย'];
  const DLG_BRIDGE = ['วิวดีขนาดนี้ ไอเดียมาเต็ม', 'ลมบนสะพานเย็นสุด ๆ', 'บัวบานเต็มบึงเลย', 'ถ่ายรูปตรงนี้แสงสวยมาก', 'เดินข้ามสะพานแล้วคิดงานออก'];
  const DLG_BOAT = ['ชิลสุด ๆ ขอพักหัวแป๊บ', 'พายช้า ๆ ไม่ต้องรีบ', 'ระวังเรือโคลงนะ', 'เห็นปลาว่ายข้างเรือด้วย', 'พายรอบเดียว แล้วกลับไปลุย'];
  const DLG_HELLO = ['สวัสดี วันนี้เป็นไงบ้าง', 'มาคุยกันแป๊บ เล่าอะไรให้ฟังหน่อย', 'กินข้าวยัง ไปด้วยกันไหม', 'เห็นข่าวเรื่องใหม่ยัง', 'วันนี้ทำได้ดีมากเลยนะ', 'มีอะไรให้ช่วยไหม บอกได้เลย'];
  const DLG_SIT = ['ขอนั่งชาร์จแบตแป๊บ', 'นั่งพักห้านาที เดี๋ยวไปต่อ', 'นั่งแล้วสบาย ไม่อยากลุกเลย', 'พักขาแป๊บ เดินมาทั้งเช้า', 'นั่งนิ่ง ๆ แป๊บ ไอเดียมักมาตอนนี้'];
  const DLG_SHOWER = ['อาบน้ำแล้วสดชื่นเหมือนเกิดใหม่', 'น้ำอุ่นกำลังดี', 'อาบเสร็จจะกลับไปลุยต่อ', 'ฝักบัวนี้แรงดีมาก', 'หอมสบู่ใหม่ ชอบกลิ่นนี้'];
  const DLG_TEAM_PAID = ['เย้ เงินสนับสนุนทีมเข้าแล้ว', 'เงินสนับสนุนทีมมาแล้ว ขอบคุณทุกคน', 'งานผ่าน เงินสนับสนุนทีมเพิ่มแล้ว', 'ได้เงินสนับสนุนทีม เก่งกันมาก', 'เงินสนับสนุนทีมเข้า เย็นนี้ฉลองเบา ๆ'];
  const DLG_TEAM_DEBT = ['ค่าใช้จ่ายด้าน AI ชำระครบแล้ว โล่งสุด ๆ', 'ชำระค่าใช้จ่ายด้าน AI ครบ ไม่ค้างแล้ว', 'ค่าใช้จ่ายด้าน AI เคลียร์แล้ว สบายใจ', 'จ่ายค่าใช้จ่ายด้าน AI ครบ ทีมเก่งมาก'];

  const LINES = {
    // what each role says while working, tied to its real duties
    work: {
      dev: ['โค้ดไหลมาก วันนี้มือขึ้น', 'อย่าเพิ่งทักน้า กำลังโฟกัส', 'bug ตัวนี้มาจากไหนเนี่ย', 'เขียนเทสต์ก่อน แล้วค่อยเขียนโค้ด ตามสูตร',
        'เทสต์แดงตามแผน เดี๋ยวทำให้เขียวเอง', 'เทสต์เขียวหมดแล้ว ฟินมาก', 'CI บน branch แดง ขอไล่ log แป๊บ', 'type ผิดบรรทัดเดียว CI แดงทั้งรอบ',
        'refactor นิดเดียว อ่านง่ายขึ้นเยอะ', '{key} ใกล้เสร็จแล้ว ขอเก็บ edge case อีกนิด', 'เปิด PR {key} แล้ว ฝาก Tech Lead ดูน้า',
        'แก้ตามคอมเมนต์รีวิวครบแล้ว push ใหม่ละ', 'ลองบนจอ 375 ด้วย กันหลุดเหมือนรอบก่อน', 'ตั้งชื่อตัวแปรนี่ยากกว่าเขียนโค้ดอีก',
        'commit เล็ก ๆ ทีละเรื่อง รีวิวง่ายดี', 'พี่จะวูบแล้วนะ งานเยอะเกิน', 'ขอกาแฟอีกแก้ว แล้วจะปิด {key} ให้ได้',
        'ดูดิฟอีกรอบ ไม่อยากให้มีอะไรหลุด', 'งานฝั่ง OLS มี bug ให้แก้ เดี๋ยวจัดให้', 'lint ผ่าน typecheck ผ่าน ใจชื้นละ'],
      po: ['งานนี้ต้องมาก่อน คนใช้จริงรอเยอะ', 'AC ครบแล้ว อ่านแล้วต้องวัดผลได้', 'ขอบเขตชัดแล้ว ส่งต่อให้ BA นะ',
        'ตัดเหลือแค่เคสหลักก่อน ที่เหลือรอบหน้า', '{key} คุณค่าสูง ขอดันขึ้นบนสุด', 'จัดลำดับ backlog ใหม่ ของด่วนขึ้นก่อน',
        'Improvement ใบนี้ดี แต่ขอคิวหลัง bug', 'AC ข้อนี้กว้างไป ขอเขียนให้วัดได้', 'ผู้ใช้ต้องการอะไรจริง ๆ ถามตัวเองอีกรอบ',
        'เป้ารอบนี้คือหน้าส่ง timesheet ต้องลื่น', 'Taskfolio กับ OLS อันไหนรีบกว่า ขอดูก่อน', 'งานเริ่มบวมแล้ว ขอเบรกขอบเขตไว้ก่อน',
        'เขียนสิ่งที่ไม่ทำไว้ชัด ๆ กันงานบวม', 'ฟีดแบ็กผู้ใช้เข้ามา เดี๋ยวคัดแยกให้', 'อันไหน bug อันไหน Improvement แยกก่อนนะ',
        'ขอ AC ระดับผลลัพธ์ ไม่ต้องลงวิธีทำ'],
      ba: ['สรุป requirement ให้แล้ว อ่านง่ายสุด ๆ', 'แปลงภาษาลูกค้าเป็นภาษาทีมอยู่', 'edge case ข้อนี้เกือบหลุด เจอแล้ว',
        'วาด flow ใหม่ ถูกตีกลับแล้วต้องไปไหนต่อ', 'กฎข้อนี้ขัดกับข้อเมื่อวาน ขอเช็กก่อน', 'ลาครึ่งวันคร่อมวันหยุด นับยังไงดีน้า',
        'ผูก AC เข้ากับทุกขั้นของ flow แล้ว', 'ข้อมูลตัวอย่างพร้อม ส่ง QA Lead ได้เลย', 'plan {key} เกือบเสร็จ ขอเช็กอีกรอบ',
        'เคส approver ลาออกกลางทางยังไม่มีกฎ', 'คุยกับ PO แล้ว ขอบเขตตรงกัน สบายใจ', 'ตาราง field ครบแล้ว ใครใช้อะไรชัดหมด',
        'กฎไหนไม่ได้เขียนไว้ ถือว่ายังไม่ได้ตัดสิน', 'เขียน flow ทั้งทางปกติและทางพัง ครบสองแบบ', 'ฝั่ง OLS ขอ requirement เพิ่ม รับทราบจ้า',
        'ชื่อสถานะต้องตรงกันทุกจอ เดี๋ยวคนงง'],
      tl: ['ขอรีวิวแป๊บ โค้ดสวยดีนะ', 'ตรงนี้ขอแก้นิดนึงน้า', 'merge ได้ แต่ขอ CI เขียวก่อน', 'PR {key} อ่านง่ายมาก ชอบ',
        'ฟังก์ชันนี้ซ้ำของเดิม ใช้ตัวเดิมได้เลย', 'ขอเทสต์ที่พังก่อนแก้ด้วยนะ ตามกติกา', 'สถาปัตย์ส่วนนี้ขอคิดเผื่ออนาคตหน่อย',
        'secret ห้ามเข้า repo เช็กแล้วโอเค', 'bundle โตขึ้นนิด ขอ lazy load หน้านี้', 'รีวิวผ่านรอบเดียว เก่งมาก',
        'merge แล้ว เข้าคิวรอบ release เลย', 'query นี้อาจช้าตอนข้อมูลเยอะ ขอ index', 'แตะ schema ต้องถามเจ้าของก่อนนะ',
        'ใช้ code-review ไล่อีกรอบ กันพลาด', 'conflict กับ main นิดหน่อย rebase ให้ที', 'ชื่อ commit สื่อดี อ่านแล้วเข้าใจเลย'],
      qal: ['test plan มาแล้ว ครบทุก AC', 'เคสขอบ ๆ ไม่รอดสายตาหรอก', 'AC ทุกข้อต้องมีเทสต์อย่างน้อยหนึ่งเคส',
        'รอครบ 10 ใบค่อยปล่อยรอบ release', 'จัดเคสตามความเสี่ยง ของสำคัญก่อน', 'test plan {key} ส่งเข้า Gate 2 แล้ว',
        'E2E ต้องตรง requirement ไม่ใช่เดาเอา', 'ขอข้อมูลตัวอย่างจาก BA เพิ่มอีกชุด', 'เขียน test case ฝั่ง OLS อีกห้าเคส',
        'regression ชุดนี้ต้องรันทุกรอบ release', 'สามจอ สองธีม ต้องอยู่ในแผนทุกครั้ง', 'เคสนี้ซ้ำกับข้อสาม รวมกันได้',
        'ผลรอบนี้ส่งเข้า Slack ให้ทีมเห็นแล้ว', 'ไม่มีหลักฐาน ถือว่ายังไม่ผ่านนะ', 'จัดคิว QA ใหม่ งานด่วนขึ้นก่อน',
        'ขอ smoke staging ก่อนเปิดรอบใหญ่'],
      qa: ['ไล่เทสต์บน staging อยู่ ไม่หลุดแน่', 'สามจอ สองธีม ครบหมดแล้ว', 'แนบภาพหน้าจอเป็นหลักฐานใน ticket แล้ว',
        'retest bug ฝั่ง OLS ผ่านแล้ว ปิดได้', 'กด back แล้วข้อมูลหาย เจอของละ', 'เทสต์โหมดมืดอีกรอบ contrast ผ่าน',
        'ลองชื่อยาว ๆ ตารางไม่ล้น ดีมาก', 'จอ 375 ปุ่มยังกดง่ายอยู่ ผ่าน', 'เขียน test case OLS เพิ่มอีกชุด',
        'อัดคลิปหลักฐานไว้แล้ว ดูย้อนได้', 'ทำซ้ำได้สามรอบ ชัวร์ว่าผิดจริง', 'เทียบกับ AC ก่อน ค่อยบอกว่าเป็น bug',
        'console สะอาด ไม่มี error แดงเลย', 'ตรวจ {key} บน staging เสร็จ ผ่านหมด', 'ลองตอนยังไม่มีข้อมูลเลย หน้าจอยังสวย',
        'กดรัว ๆ ก็ไม่ส่งซ้ำ ระบบแข็งแรง'],
      head: ['งานเยอะแต่ทีมเก่ง ไหวอยู่', 'ใครทำดี เดี๋ยวเลี้ยงชาบู', 'ขอดูอีกแป๊บนะ เดี๋ยวกดให้', 'เช็กค่าใช้จ่ายด้าน AI วันนี้ยังอยู่ในงบ',
        'เงินสนับสนุนทีมรอบนี้ ใช้คุ้มทุกบาท', 'ทุก gate ต้องผ่านเจ้าของก่อนนะ', 'วันนี้ทีมปิดงานได้กี่ใบแล้วน้า',
        'ใครติดอะไรบอกได้เลย เดี๋ยวช่วยดัน', 'ส่งเรื่องให้เจ้าของตัดสินแล้ว รอผล', 'token วันนี้ใช้ประหยัดดี ชมทีมเลย',
        'ขอสรุปสั้น ๆ ทุกคนอยู่ขั้นไหน', 'อย่าลืมพักกันบ้าง งานยาวต้องมีแรง', 'Taskfolio กับ OLS แบ่งคนให้พอดี',
        'ทีมเราไม่มีใครถูกปล่อยไว้คนเดียว', 'ภารกิจวันนี้ใกล้ครบ ลุ้นโบนัส', 'งานเยอะได้ แต่ห้ามเร่งจนพลาด']
    },
    wait: ['ส่งให้แล้วน้า ฝากดูหน่อย', 'รอพี่อนุมัติอยู่ ไม่เร่งแต่อยากได้ไว ๆ', 'นั่งรอแบบใจเย็น ๆ จ้า', '{key} รอผ่าน {gate} อยู่น้า',
      'รอเจ้าของดูแป๊บ เตรียมคำตอบไว้แล้ว', 'ถ้าเจ้าของถาม ตอบได้ทุกข้อแน่นอน', 'ไล่อ่าน plan ซ้ำอีกรอบ เผื่อมีคำถาม',
      'รออนุมัติ ขอจิบมัทฉะไปพลาง ๆ', 'สรุปหนึ่งหน้าไว้ให้แล้ว อ่านง่ายมาก', 'เจ้าของตัดสินเมื่อไหร่ ลุยต่อทันที',
      'gate นี้สำคัญ รอได้ ไม่ข้ามแน่นอน', 'นั่งห้องประชุมรอ แอร์เย็นดีนะ', 'เช็กแชตทุกห้านาที ลุ้นคำตอบ',
      'แนบภาพก่อนหลังไว้ให้เจ้าของแล้ว', 'ไม่อยากเร่ง แต่ใจลุ้นมาก', 'รอผลอยู่ ขอทวนข้อมูลอีกที'],
    headWait: ['ส่งเรื่องให้เจ้าของครบแล้ว รอตัดสิน', 'มีใบรอเจ้าของอยู่ เดี๋ยวตามให้', 'เตรียมภาพก่อนหลังให้เจ้าของดูง่าย ๆ',
      'ทุกเรื่องที่ส่งไป มีแหล่งอ้างอิงครบ', 'เจ้าของตอบแล้วจะแจ้งทีมทันที', 'รวบเรื่องเป็นชุด เจ้าของจะได้ไม่เหนื่อย',
      'ไม่มีเรื่องไหนค้างเงียบ ตามครบทุกใบ'],
    blocked: ['ติดอยู่จ้า ใครพอมีเวลาช่วยหน่อย', 'อันนี้เกินมือแล้ว ขอคนช่วยที', 'แบตใกล้หมด ขอกาแฟด่วน',
      'ติดสิทธิ์เข้าระบบ รอเจ้าของช่วยเปิด', 'สเปกยังไม่ชัด ขอถามเจ้าของก่อนนะ', 'หาต้นเหตุเจอครึ่งนึงแล้ว อีกนิด',
      'ลองมาสามทางแล้ว ยังไม่ผ่านเลย', 'ไม่ข้ามนะ ต้องแก้ที่ต้นเหตุ', '{key} ติดอยู่ ขอเจ้าของตัดสินที',
      'staging เป็นอะไร หรือโค้ดเรา ต้องเช็กให้ชัด', 'จดอาการไว้ครบ ใครมาช่วยอ่านได้เลย', 'พี่จะวูบแล้วนะ ติดตรงนี้นานมาก',
      'ขอพักห้านาที แล้วกลับมาสู้ใหม่', 'แจ้ง Head แล้ว รอคนช่วยดัน', 'ติดแต่ไม่ท้อ เดี๋ยวก็ผ่าน', 'ใครเคยเจอ error แบบนี้บ้างไหม'],
    idle: ['พักแป๊บ เดี๋ยวลุยต่อ', 'มัทฉะแก้วนี้คือดีมาก', 'เบรกนี้ไปว่ายน้ำกันไหม', 'พักเบรกแป๊บ เดี๋ยวกลับไปหาจุดบอดต่อ',
      'ยืดเส้นยืดสายหน่อย หลังเริ่มประท้วง', 'พักสายตาห้านาที มองต้นไม้ไกล ๆ', 'ขอเติมน้ำก่อน วันนี้ยังดื่มไม่ถึงลิตร',
      'เบรกสั้น ๆ ชาร์จแบตตัวเองแป๊บ', 'เดินเล่นรอบออฟฟิศ ให้หัวโล่ง', 'ขอขนมสักชิ้น แล้วกลับไปลุย',
      'พักหายใจลึก ๆ งานต่อไปรออยู่', 'ฟังเพลงสักเพลง แล้วค่อยลุยต่อ', 'เติมพลังแล้ว เดี๋ยวไปหาจุดบอดต่อ',
      'ขอกาแฟเย็นแก้วนึง ใจจะได้ฟู', 'นั่งพักแป๊บ ไอเดียมักมาตอนนี้แหละ'],
    sweep: ['กำลัง{area}', 'ไล่หาจุดบอดอยู่ เจอแล้วจะเปิด Improvement', 'เจออะไรแปลก ๆ จะเปิด Improvement ให้',
      'ถ้าผิดสเปกจะไปทาง bug ไม่ใช่ Improvement', 'จุดนี้ไม่มีใครดูมานาน ขอส่องหน่อย', 'ดูให้ครบก่อนค่อยเปิดใบ กันซ้ำ',
      'ค้นใบเก่าก่อน เผื่อมีคนเปิดไว้แล้ว', 'เจอจุดที่ปรับให้ดีขึ้นได้อีกแล้ว', 'ส่องมุมที่คนมองข้าม เดี๋ยวเจอแน่',
      'จดหลักฐานไว้ก่อน จะได้เปิดใบได้ชัด', 'ไม่ปล่อยให้ระบบมีมุมมืดหรอก', 'หา Improvement ที่คุ้มที่สุดก่อน',
      'รอบนี้ไล่ทีละหน้า ไม่ข้ามสักจอ', 'เจอแล้วจะเขียนให้ PO จัดลำดับต่อ', 'ใบ Improvement ต้องมีที่มาชัดเจนนะ'],
    own: ['ใบ Improvement ของทีมเต็มโควตา ขอ{own}ก่อน', 'โควตา Improvement เต็มแล้ว ขอ{own}แทนนะ',
      'คิวเต็ม ไม่เปิดใบเพิ่ม ไป{own}ดีกว่า', 'ทำหน้าที่ประจำดีกว่า {own}', 'ไม่เปิดใบซ้อน ขอ{own}ให้เรียบร้อย',
      'งานประจำก็สำคัญ {own}อยู่นะ'],
    focus: ['ขอโฟกัสเงียบ ๆ นะ งานนี้ซับซ้อน', 'ใส่หูฟังแล้ว อย่าเพิ่งทักน้า', 'โหมดสมาธิเปิดแล้ว เดี๋ยวเสร็จแน่',
      'งานใหญ่ต้องใช้ห้องนี้ เงียบดีมาก', 'ปิดแจ้งเตือนหมดแล้ว ลุยยาว ๆ', 'คิดทีละขั้น ไม่รีบ แต่ไม่ช้า',
      'ห้องนี้เงียบจนได้ยินความคิดตัวเอง', 'ขออีกหนึ่งชั่วโมงเต็ม ๆ นะ', 'วาดภาพรวมก่อน แล้วค่อยลงรายละเอียด',
      'จับเวลา 25 นาทีรอบที่สาม ยังไหวอยู่'],
    bigStart: ['งานใหญ่ {key} มาแล้ว ลุยกันเลย', '{key} หลายจอเลย ขอวางแผนก่อนลงมือ', 'เปิดงานใหญ่ ขอเข้าห้องสมาธินะ',
      'ชิ้นนี้ใหญ่ ซอยเป็นชิ้นเล็กก่อน', 'งานนี้ยาว แต่สนุกแน่นอน', 'สูดหายใจลึก ๆ เริ่ม {key} ละ'],
    bigDone: ['จบงานใหญ่แล้ว โล่งสุด ๆ', 'งานใหญ่ส่งต่อแล้ว ขอฉลองแป๊บ', 'ปิดงานชิ้นใหญ่ได้ ภูมิใจมาก',
      'เหนื่อยแต่คุ้ม งานใหญ่ผ่านแล้ว', 'เย้ ผ่านด่านใหญ่ ขอมัทฉะรางวัลตัวเอง', 'จบชิ้นใหญ่ เย็นนี้ไปกินอะไรอร่อย ๆ กัน'],
    release: {
      approve: ['ครบ 10 ใบแล้ว ขออนุมัติขึ้น staging', 'ตรวจรายการรอบ release ก่อนกดอนุมัติ', 'ทุกใบมีเทสต์ครบ อนุมัติได้',
        'ขึ้น staging รอบนี้ ลุ้นนิด ๆ', 'เช็ก CI ทุกใบเขียวก่อนปล่อย'],
      regression: ['รัน regression ทั้งชุดอยู่ รอแป๊บ', 'ผ่านไปครึ่งทาง ยังไม่มีแดง', 'regression รอบนี้ลื่นมาก',
        'ถ้าแดงสักเคส หยุดหาต้นเหตุก่อน', 'จดผลทุกเคสไว้เป็นหลักฐาน', 'ใกล้ครบแล้ว เดี๋ยวส่งผลเข้า Slack'],
      prod: ['ผ่านครบ เตรียมขึ้น production', 'ขึ้น prod รอบนี้ ขอเช็กอีกรอบ', 'staging ผ่านแล้ว ค่อยขึ้น prod ตามขั้น',
        'ปิดรอบ release นี้ได้สวย ๆ', 'ขอบคุณทุกคนที่ช่วยกันรอบนี้']
    },
    time: {
      morning: ['อรุณสวัสดิ์ทุกคน วันนี้สู้ ๆ', 'กาแฟแก้วแรกของวัน ต้องมา', 'เช้านี้ BTS คนแน่นมาก', 'เช้านี้ตื่นทันนาฬิกาปลุกครั้งแรก',
        'เช็กลิสต์งานวันนี้ก่อนเริ่ม', 'เช้าแล้ว สมองยังโหลดไม่เสร็จ', 'ข้าวเช้ากินยัง โจ๊กหน้าซอยดีนะ'],
      lunch: ['เที่ยงนี้กินอะไรดี คำถามยากสุดของวัน', 'สั่งข้าวมันไก่แล้ว รอไรเดอร์อยู่', 'ไปร้านส้มตำหน้าซอยกันไหม',
        'คิวร้านข้าวยาวมาก ทำกินเองดีกว่า', 'อิ่มแล้วง่วง เป็นธรรมชาติ', 'มื้อนี้ขอสลัด แต่ของหวานด้วยนะ'],
      slump: ['บ่ายสองโมง ตาจะปิดแล้ว', 'ง่วงหลังข้าว ขอกาแฟเย็นด่วน', 'บ่ายนี้ขอขนมสักห่อ', 'ลุกเดินแป๊บ แก้ง่วง',
        'ช่วงบ่ายนี่สมาธิหายไปไหน', 'ใครจะสั่งชานมไข่มุก บวกด้วย'],
      evening: ['ใกล้เลิกงานแล้ว เก็บงานให้จบ', 'เย็นนี้ไปวิ่งสวนกันไหม', 'รถติดแน่ ๆ รอให้เบาก่อนค่อยกลับ',
        'เย็นนี้ทำกับข้าวกินเองที่ห้อง', 'จดสิ่งที่ต้องทำพรุ่งนี้ไว้ก่อน', 'ฟ้าตอนเย็นสวยมาก ถ่ายรูปเก็บไว้'],
      night: ['ดึกแล้ว ปิดงานชิ้นนี้แล้วพักนะ', 'คืนนี้ดูซีรีส์ต่ออีกตอน', 'ไฟออฟฟิศตอนกลางคืนชิลดี',
        'หิวรอบดึก ขอมาม่าสักซอง', 'พรุ่งนี้ค่อยต่อ สมองต้องพัก', 'นอนให้พอนะ พรุ่งนี้งานเยอะ'],
      latenight: ['ตีหนึ่งแล้ว ทำไมยังไม่ง่วงเลย', 'ดึกมากแล้ว ขอเซฟงานแล้วไปนอน', 'เงียบจนได้ยินเสียงแอร์',
        'อย่านอนดึกบ่อยนะ ร่างกายฟ้อง', 'ดึกแบบนี้ขอโกโก้ร้อนแก้วนึง']
    },
    weather: {
      clear: ['แดดแรงมาก ออกไปข้างนอกเหมือนโดนอบ', 'ร้อนขนาดนี้ ขอน้ำแข็งเพิ่ม', 'ฟ้าใสสุด ๆ เหมาะไปเที่ยวทะเล',
        'อากาศดีแบบนี้ ไปพายเรือกันไหม', 'ทาครีมกันแดดยัง แดดเปรี้ยงเลย', 'ร้อนจนอยากย้ายไปทำงานในสระ'],
      rain: ['ฝนตกอีกแล้ว ลืมร่มตามเคย', 'ฝนแบบนี้ รถติดยาวแน่นอน', 'เสียงฝนตกฟังแล้วง่วงมาก', 'ฝนตกเหมาะกับหมูกระทะสุด',
        'เรียกรถยากมาก ฝนตกทีไรเป็นงี้', 'รองเท้าเปียกหมดเลย ขอบคุณฝนนะ', 'ฝนตกแบบนี้ BTS คนแน่นแน่'],
      snow: ['หิมะตกจริงดิ เหมือนไปญี่ปุ่นเลย', 'หนาวมาก ขอโกโก้ร้อนแก้วใหญ่', 'ปั้นตุ๊กตาหิมะตอนพักกันไหม',
        'ใส่เสื้อกันหนาวสามชั้นแล้ว', 'หิมะสวยมาก ถ่ายรูปไปอวดที่บ้าน', 'อากาศแบบนี้ อยากกินชาบูมาก'],
      autumn: ['ใบไม้ร่วงสวยมาก ฟีลเกาหลีเลย', 'ลมเย็น ๆ แบบนี้ทำงานเพลินดี', 'ถ่ายรูปกับใบไม้แดงไว้ลงโซเชียล',
        'อากาศแบบนี้ เหมาะกับลาเต้ร้อน', 'ใบไม้เต็มทาง หุ่นยนต์ดูดฝุ่นเหนื่อยแน่', 'ใส่คาร์ดิแกนพอดี ไม่ร้อนไม่หนาว']
    },
    // matched against the start of p._room
    place: {
      'ห้องครัว': ['ครัวนี้หอมทั้งวัน', 'ใครทำอะไรกิน ขอชิมด้วย', 'ล้างแก้วตัวเองด้วยนะทุกคน', 'ตู้เย็นมีของอร่อยเพียบ', 'ครัวสะอาดแบบนี้ ทำกับข้าวสนุก'],
      'ห้องทีม': ['โต๊ะโดนัทนี่คุยงานง่ายดี', 'นั่งใกล้กันแบบนี้ ถามกันง่าย', 'ขอยืมสายชาร์จหน่อย', 'โต๊ะนี้วิวดีสุดในออฟฟิศ', 'นั่งรวมกันแล้วงานไวขึ้นจริง'],
      'ห้องประชุม': ['ประชุมสั้น ๆ ได้ข้อสรุปชัด ๆ', 'ไวท์บอร์ดเต็มแล้ว ถ่ายรูปเก็บก่อน', 'ใครจองห้องต่อ เดี๋ยวรีบเคลียร์', 'แอร์เย็นจนต้องใส่เสื้อคลุม'],
      'ห้องพักผ่อน': ['ห้องนี้นั่งแล้วไม่อยากลุก', 'พักตรงนี้แป๊บ หัวโล่งขึ้นเยอะ', 'เพลงเบา ๆ แสงอุ่น ๆ ชอบมาก', 'นั่งตรงนี้แล้วไอเดียมา'],
      'โซนเครื่องดื่ม': ['วันนี้ดื่มอะไรดี มีให้เลือกเยอะเกิน', 'น้ำเปล่าก่อน แล้วค่อยกาแฟ', 'ตู้เครื่องดื่มเติมของแล้ว ใจดีมาก', 'ขอแก้วใหญ่ วันนี้ยาว'],
      'สะพานไม้': ['ยืนบนสะพาน ลมพัดเย็นดี', 'วิวบึงบัวจากตรงนี้สวยสุด', 'เดินข้ามสะพาน ช่วยให้คิดออก', 'ตรงนี้ถ่ายรูปแสงดีมาก'],
      'ท่าเรือ': ['เรือจอดเรียงสวยเลย', 'ลมริมน้ำนี่ดีจริง', 'พายเรือรอบเดียว แล้วกลับไปทำงาน', 'ปลามาเยอะ ใครเอาอาหารปลามา']
    },
    // every activity name the page can put on a person (IX acts, ACTS, and the older keys)
    act: {
      'นั่งปรับเก้าอี้': ['ปรับเก้าอี้ให้หลังตรง จะได้ไม่ปวด', 'เก้าอี้ดีนี่ชีวิตเปลี่ยนเลย', 'ปรับความสูงพอดีแล้ว ลุยต่อ', 'หลังพิงสบาย ทำงานได้ยาว ๆ'],
      'นั่งพัก': DLG_SIT,
      'นั่งพักบนโซฟา': ['โซฟานุ่มจนอยากหลับ', 'เอนหลังแป๊บ สบายมาก', 'โซฟานี้คือห้องประชุมไม่เป็นทางการ', 'นั่งตรงนี้แล้วคิดงานออก'],
      'นั่งพักริมทาง': ['นั่งดูคนเดินผ่าน เพลินดี', 'ลมเย็น ๆ นั่งตรงนี้สบาย', 'ม้านั่งตรงนี้วิวดีนะ', 'นั่งพักขาแป๊บ เดินมาไกล'],
      'นั่งรอ': ['นั่งรอแป๊บ เดี๋ยวก็ถึงคิว', 'รอแบบใจเย็น ๆ จ้า', 'รอไปเช็กข้อความไป', 'ที่นั่งรอนี้สบายกว่าที่คิด'],
      'เปิด/ปิด MacBook': DLG_MAC,
      'เปิด/ปิดจอ': DLG_SCREEN,
      'รดน้ำต้นไม้': ['รดน้ำต้นไม้หน่อย ใบเริ่มเหี่ยว', 'ต้นไม้งามขึ้นทุกวัน', 'คุยกับต้นไม้แป๊บ ได้ยินว่าโตไว', 'น้ำพอดี ๆ ไม่ให้รากเน่า'],
      'เดินเล่นใต้ร่มไม้': ['ร่มไม้เย็นสบายดีจัง', 'เดินเล่นแป๊บ ให้หัวโล่ง', 'ได้กลิ่นต้นไม้แล้วสดชื่น', 'เดินตรงนี้แล้วคิดงานออก'],
      'นั่งพักใต้ร่มไม้': ['ร่มไม้เย็นสบายดีจัง', 'นั่งฟังเสียงนกแป๊บ', 'ได้กลิ่นต้นไม้แล้วสดชื่น', 'นั่งตรงนี้แล้วใจเย็นลง'],
      'หยิบหนังสืออ่าน': DLG_READ, 'นั่งพักอ่านหนังสือ': DLG_READ, 'นั่งอ่านหนังสือที่โต๊ะญี่ปุ่น': DLG_READ, 'เลือกหนังสือ': DLG_READ,
      'ชงกาแฟ': ['กาแฟแก้วที่สามของวัน ไม่มีใครห้าม', 'หอมกาแฟคั่วใหม่', 'ขอเข้ม ๆ หน่อย บ่ายนี้ยาว', 'ใครเอากาแฟบ้าง ชงเผื่อ'],
      'ชงเอสเปรสโซ': ['ช็อตเดียวตื่นเต็มตา', 'ครีมาสวยมาก ภูมิใจ', 'เอสเปรสโซเข้ม ๆ แบบนี้แหละ', 'เครื่องนี้ชงอร่อยกว่าร้านอีก'],
      'ชงชา': ['ชาอุ่น ๆ ใจสงบ', 'ชาเขียวร้อนแก้วนึง', 'ชงชามะลิ หอมทั้งห้อง', 'ขอชาแทนกาแฟวันนี้'],
      'ชงมัทฉะ': DLG_MATCHA, 'ไปชงมัทฉะ': DLG_MATCHA,
      'ไปโซนเครื่องดื่ม': ['ไปเติมเครื่องดื่มแป๊บ', 'วันนี้ดื่มอะไรดี ตัวเลือกเยอะเกิน', 'ขอน้ำเย็น ๆ สักแก้ว', 'ใครฝากอะไรไหม เดี๋ยวหยิบให้'],
      'หยิบเครื่องดื่มเย็น ๆ': ['น้ำเย็นชื่นใจสุด ๆ', 'ขวดเย็นเจี๊ยบ หายร้อนเลย', 'ขอโซดามะนาวสักขวด', 'หยิบเผื่อเพื่อนด้วย'],
      'ทำอาหาร': DLG_COOK, 'ทำอาหาร (สุ่มเมนู)': DLG_COOK,
      'ผัดกะเพรา': ['ไฟแรง ๆ กลิ่นมาเต็ม', 'ใบกะเพราใส่ท้ายสุดนะ', 'ไข่ดาวกรอบ ๆ คู่กันเลย', 'เผ็ดแค่ไหนดี บอกได้เลย'],
      'อบขนม': ['ครัวซองต์ใกล้ได้แล้ว รอแป๊บ', 'กลิ่นเนยหอมไปทั้งครัว', 'อบคุกกี้เผื่อทุกคนเลย', 'รอขนมขึ้นฟู ใจลุ้นมาก'],
      'ต้มน้ำซุป': ['ซุปร้อน ๆ อุ่นใจ', 'เคี่ยวนาน ๆ น้ำซุปถึงจะหวาน', 'ชิมแล้ว รสกำลังดี', 'หอมตะไคร้ใบมะกรูดสุด ๆ'],
      'เตรียมวัตถุดิบ': ['หั่นผักแบบเชฟเลย', 'เตรียมของให้ครบก่อน ค่อยเปิดไฟ', 'ล้างผักสะอาดแล้ว', 'หั่นเท่า ๆ กัน จะได้สุกพร้อมกัน'],
      'หยิบวัตถุดิบมาทำอาหาร': ['หยิบวัตถุดิบให้ครบก่อน', 'ของสดมาก วันนี้อร่อยแน่', 'หยิบผักหยิบหมู พร้อมแล้ว', 'เช็กว่าวัตถุดิบพอทุกคนไหม'],
      'เปิดตู้เย็นหาของกิน': ['เปิดตู้เย็นหาอะไรกินหน่อย', 'มีโยเกิร์ตเหลือหนึ่งถ้วย', 'ตู้เย็นเต็มไปด้วยของดี', 'ขอผลไม้สักชิ้น'],
      'ล้างจาน': ['เครื่องล้างจานคือฮีโร่ประจำครัว', 'เก็บจานเข้าเครื่องก่อน', 'ครัวสะอาด ใจก็สะอาด', 'ล้างเสร็จแล้ว ครัวพร้อมรอบหน้า'],
      'ตั้งโต๊ะอาหาร': ['จัดจานช้อนให้ครบทุกที่', 'ตั้งโต๊ะสวย ๆ กินอร่อยขึ้น', 'วางแก้วน้ำให้ทุกคนแล้ว', 'ใครจะนั่งตรงไหนก็ได้เลย'],
      'เรียกทุกคนมากินข้าว': ['ข้าวพร้อมแล้ว มากินกันเร็ว', 'วางงานก่อน มากินข้าวกัน', 'กินด้วยกันอร่อยกว่า', 'ใครหิวมาก่อนได้ก่อนนะ'],
      'หยิบขนมกรุบกรอบ': ['ขอขนมสักห่อ เติมพลัง', 'กรอบ ๆ แบบนี้หยุดไม่ได้', 'แบ่งกันกินนะทุกคน', 'ขนมห่อเดียว ไม่เกินนี้แน่'],
      'ตักไอศกรีม': ['ไอศกรีมสองสกู๊ป ชีวิตดีขึ้นทันที', 'รสชาไทยหอมมาก', 'ตักเผื่อใครไหม', 'ร้อนแบบนี้ต้องไอศกรีม'],
      'เปิดไวน์ฉลองงานเสร็จ': ['ฉลองงานเสร็จกันหน่อย', 'ชนแก้วให้ทีมเก่งของเรา', 'แก้วเดียวพอนะ พรุ่งนี้มีงาน', 'เก่งมากทุกคน รอบนี้สวยมาก'],
      'จัดของบนตู้': ['จัดของให้เป็นระเบียบ หาง่ายขึ้น', 'ของเยอะจัง แยกหมวดก่อน', 'ตู้เรียบร้อย ใจก็เรียบร้อย', 'อันนี้ของใครวางลืมไว้'],
      'ล้างมือ': ['ล้างมือก่อนกินข้าวนะ', 'ฟอกสบู่ยี่สิบวินาที', 'มือสะอาด พร้อมทำงาน', 'น้ำเย็นดีจัง'],
      'เป่ามือ': ['เป่ามือแป๊บ เดี๋ยวแห้ง', 'เครื่องเป่ามือแรงดีมาก', 'มือแห้งแล้ว ไปต่อ', 'เสียงดังนิดแต่ไวดี'],
      'เข้าห้องน้ำ': ['ขอตัวแป๊บนะ', 'เดี๋ยวกลับมา อย่าเพิ่งเริ่ม', 'แป๊บเดียวจริง ๆ', 'ฝากดูจอแป๊บนะ'],
      'อาบน้ำ': DLG_SHOWER, 'อาบน้ำหลังว่ายน้ำ': DLG_SHOWER,
      'ล้างตัวก่อนลงสระ': ['ล้างตัวก่อนลงสระ ตามกติกา', 'น้ำเย็นนิดนึง ตื่นเลย', 'พร้อมแล้ว ลงสระได้', 'สะอาดก่อน ทุกคนสบายใจ'],
      'ทิ้งขยะ': ['แยกขยะให้ถูกถังนะ', 'ขวดพลาสติกไปถังรีไซเคิล', 'ทิ้งขยะแป๊บ ห้องจะได้สะอาด', 'เศษอาหารแยกไว้ทำปุ๋ย'],
      'นั่งบีนแบ็ก': ['นอนแป๊บเดียว ไม่หลับจริง ๆ', 'บีนแบ็กนี้ดูดคนลงไปเลย', 'นั่งตรงนี้แล้วลุกยากมาก', 'เอนแป๊บ ไอเดียกำลังมา'],
      'นวดผ่อนคลาย': DLG_MASSAGE, 'ไปนวดผ่อนคลาย': DLG_MASSAGE,
      'ระดมความคิด': ['เขียนไอเดียลงไวท์บอร์ดก่อน', 'ไอเดียไหนก็ได้ ยังไม่ตัดสิน', 'วาดภาพรวมแล้วเห็นทางเลย', 'ใครมีไอเดียเพิ่ม มาเขียนได้'],
      'งีบหลับ 20 นาที': ['งีบยี่สิบนาที ตั้งปลุกแล้ว', 'ขอหลับแป๊บ ตื่นมาสดใสแน่', 'เตียงนี้นุ่มเกินไปแล้ว', 'อย่าให้หลับเกินนะ ปลุกด้วย'],
      'นั่งดูทีวีบนเตียง': DLG_TV, 'เปิด/ปิดทีวี': DLG_TV,
      'ปรับโต๊ะยืนทำงาน': ['ยืนทำงานบ้าง หลังจะได้พัก', 'ปรับโต๊ะสูงขึ้นแป๊บ', 'ยืนแล้วสมองตื่นขึ้นเยอะ', 'นั่งสลับยืน ดีต่อสุขภาพ'],
      'นั่งโฟกัสงาน': ['โหมดโฟกัส ห้ามรบกวนน้า', 'ปิดแจ้งเตือนหมดแล้ว', 'หนึ่งงาน หนึ่งเวลา', 'ขอเวลาเต็ม ๆ หนึ่งชั่วโมง'],
      'เล่น PS5': ['เกมแข่งรถรอบเดียวพอ', 'ใครมาแข่งด้วยกัน', 'ชนะแล้ว ขอฉลองแป๊บ', 'จบด่านนี้แล้วไปทำงานต่อ'],
      'เปิดเพลงดัง ๆ': ['เพลงนี้ต้องเปิดดัง ๆ', 'ใครอยากขอเพลงบอกได้', 'จังหวะนี้ทำงานไวขึ้นแน่', 'เบาลงนิดนึง เดี๋ยวคนโฟกัสไม่ได้'],
      'ว่ายน้ำ': ['น้ำเย็นฉ่ำ หายง่วงเลย', 'ว่ายสองรอบ พอแล้ว', 'ท่ากบดีที่สุด เหนื่อยน้อย', 'ว่ายน้ำตอนเบรก ดีต่อใจมาก'],
      'ยืนริมสระ': ['น้ำใสจนเห็นพื้นเลย', 'ยืนรับลมริมสระแป๊บ', 'จะลงดีไหมน้า', 'ใครจะว่ายด้วยกันบ้าง'],
      'อาบแดด': ['ขอวิตามินดีแป๊บ', 'ทาครีมกันแดดแล้ว', 'นอนอาบแดดสิบนาทีพอ', 'ลมพัดเย็น ๆ เคลิ้มเลย'],
      'เปิด/ปิดน้ำพุ': ['เปิดน้ำพุ เสียงน้ำช่วยให้ใจเย็น', 'น้ำพุสวยมากตอนแดดส่อง', 'ปิดน้ำพุแป๊บ ประหยัดน้ำ', 'เสียงน้ำไหลฟังแล้วผ่อนคลาย'],
      'โยนเหรียญอธิษฐาน': ['ขอให้ CI เขียวทุกรอบ', 'อธิษฐานให้งานผ่านทุก gate', 'ขอให้ทีมสุขภาพแข็งแรง', 'โยนลงกลางน้ำพอดีเป๊ะ'],
      'เล่นสไลเดอร์': ['วี้ดดด สนุกเกิน', 'อีกรอบได้ไหม ขอนะ', 'ไถลลงมาเร็วมาก', 'เหมือนกลับไปเป็นเด็กเลย'],
      'ขึ้นบินชมเมือง': DLG_HELI, 'ไปขึ้นเครื่อง': DLG_HELI,
      'ติด/ดับเครื่อง': DLG_HELIPAD, 'เดินดูลานจอด': DLG_HELIPAD,
      'ยืม/คืนจักรยาน': DLG_BIKE, 'ดูจำนวนจักรยาน': DLG_BIKE,
      'ชมวิวบนสะพาน': DLG_BRIDGE, 'เดินเล่นที่สะพาน': DLG_BRIDGE,
      'พายเรือเล่น': DLG_BOAT, 'ไปที่ท่าเรือ': DLG_BOAT,
      'ให้อาหารปลา': ['ปลามารุมเต็มเลย', 'โปรยทีละนิดนะ อย่าให้เยอะ', 'ตัวสีส้มนั่นตัวใหญ่สุด', 'ปลาที่นี่อ้วนท้วนสมบูรณ์'],
      'ทักทาย': DLG_HELLO, 'ชวนคนในออฟฟิศมาคุย': DLG_HELLO,
      'เปิด/ปิดพัดลม': ['เปิดพัดลมฟอกอากาศหน่อย', 'อากาศสะอาด หายใจโล่ง', 'ปิดพัดลมแป๊บ เสียงดังไป', 'ลมเย็นพอดี ทำงานสบาย'],
      'เริ่ม/หยุดดูดฝุ่น': ['ให้หุ่นยนต์ทำความสะอาดหน่อย', 'หุ่นยนต์ดูดฝุ่นขยันกว่าเราอีก', 'หยุดก่อน มันจะชนขาโต๊ะ', 'พื้นสะอาดเอี่ยมเลย'],
      'เรียกเข้าห้องประชุม': ['เข้าห้องประชุมกันแป๊บ', 'สิบห้านาทีพอ ได้ข้อสรุปแล้วแยกย้าย', 'เอาโน้ตมาด้วยนะ', 'ประชุมสั้น ๆ แต่ได้ผล']
    },
    // small talk a person says out loud, about life outside work
    chat: ['เมื่อคืนดูซีรีส์ถึงตีสอง พลาดมาก', 'เย็นนี้ไปตีแบดกันไหม', 'ใครสั่งชานมบ้าง จะสั่งรวม', 'เสาร์นี้จะไปตลาดนัด',
      'แมวที่บ้านนอนทับคีย์บอร์ดอีกแล้ว', 'ปลายปีนี้อยากไปญี่ปุ่น', 'ลองพิลาทิสครั้งแรก ปวดทั้งตัว', 'เมื่อวานวิ่งได้ห้ากิโล ภูมิใจ',
      'ตะกร้า 11.11 เต็มแล้ว ต้องตัดใจ', 'ลอยกระทงปีนี้ทำกระทงขนมปัง', 'เพลงนี้ติดหูทั้งวันเลย', 'วันนี้ดื่มน้ำครบสองลิตรแล้ว',
      'เริ่มเรียนภาษาเกาหลีวันละนิด', 'ปลูกกะเพราที่ระเบียงงามมาก', 'จดรายจ่ายทุกวัน ค่ากาแฟเยอะสุด', 'มีมในกลุ่มแชตวันนี้ขำมาก',
      'พรุ่งนี้วันเกิดเพื่อน เตรียมเค้กไว้แล้ว', 'อยากกินหมูกระทะมาก', 'แอปส่งอาหารลดค่าส่ง ใจสั่นเลย', 'BTS วันนี้มาเร็วผิดปกติ',
      'เปลี่ยนเคสมือถือใหม่ สีพาสเทล', 'เสาร์นี้จะไปคาเฟ่เปิดใหม่', 'ลองใช้ AI สรุปหนังสือ อ่านไวขึ้น', 'ทำ side project เว็บสูตรอาหารอยู่',
      'นอนเร็วเมื่อคืน ตื่นมาสดชื่นมาก', 'หลานโทรมาอวดว่าได้ดาวที่โรงเรียน', 'แม่ส่งรูปแกงมาให้ดู คิดถึงบ้าน', 'คอนเสิร์ตเดือนหน้า ลุ้นกดบัตร',
      'ตีแบดเมื่อวาน ชนะทุกเซ็ต', 'ซื้อหม้อทอดไร้น้ำมัน ใช้ทุกวัน', 'สงกรานต์ปีหน้าจะกลับบ้าน', 'ปีใหม่นี้อยากไปเที่ยวทะเล',
      'ทำงานที่บ้านเมื่อวาน แมวขึ้นมาประชุมด้วย', 'อยากได้หูฟังตัดเสียงตัวใหม่', 'เกมเมื่อคืน ผ่านด่านยากได้แล้ว',
      'เก็บเงินเที่ยวได้ครึ่งทางแล้ว', 'เพิ่งดูหนังผีมา เมื่อคืนนอนเปิดไฟ', 'เช้านี้เจอน้องหมาน่ารักหน้าคอนโด'],
    // read by other code as strings: each read draws the next line of its bag
    team: { get paid() { return dlgDraw(DLG_TEAM_PAID); }, get debt() { return dlgDraw(DLG_TEAM_DEBT); } }
  };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  function dlgActName(p) {
    if (!p.act) return null;
    if (p.act.k === 'ix') { const ix = IX[p.act.ix], a = ix && ix.acts[p.act.a]; return a ? a.th : null; }
    if (p.act.spot) return p.act.spot.act || null;
    return ACTS[p.act.k] ? ACTS[p.act.k].th : null;
  }
  function dlgActPool(name) {
    if (!name) return null;
    if (LINES.act[name]) return LINES.act[name];
    if (name.startsWith('คุยกับ')) return DLG_HELLO;
    if (name.startsWith('ทำ')) return DLG_COOK;
    return null;
  }
  function dlgPlacePool(room) {
    if (!room) return null;
    const k = Object.keys(LINES.place).find(r => room.startsWith(r));
    return k ? LINES.place[k] : null;
  }
  // a big ticket (size L or XL) gets one line when it starts and one when it leaves the person
  function dlgBig(p) {
    const prev = dlgBigSeen.get(p.id), cur = p.issue && (p.issue.size === 'L' || p.issue.size === 'XL') ? p.issue.n : null;
    if (cur && cur !== prev) { dlgBigSeen.set(p.id, cur); return LINES.bigStart; }
    if (prev && cur !== prev) { dlgBigSeen.delete(p.id); return LINES.bigDone; }
    return null;
  }
  function dlgStatePool(p) {
    if (p._room === 'ห้องสมาธิ') return LINES.focus;
    if (p.state === 'blocked') return LINES.blocked;
    if (p.release && LINES.release[phaseKey(p.release.phase)]) return LINES.release[phaseKey(p.release.phase)]; // R68
    if (p.state === 'waiting') return p.role === 'head' ? LINES.headWait : LINES.wait;
    if (p.state === 'sweeping') return LINES.sweep;
    if (p.ownDuty) return LINES.own;
    if (p.state === 'idle') return LINES.idle;
    return LINES.work[p.role] || LINES.idle;
  }
  function lineFor(p) {
    const avoid = t => dlgRecent(p.id, t);
    const tiers = [];
    const push = (pool, chance) => { if (pool && pool.length && !tiers.some(x => x[0] === pool)) tiers.push([pool, chance]); };
    push(dlgActPool(dlgActName(p)), .75);
    push(dlgBig(p), 1);
    push(dlgStatePool(p), .6);
    push(dlgPlacePool(p._room), .35);
    if (Math.random() < .5) push(LINES.time[dlgSlot()], .3); else push(LINES.weather[weather] || LINES.weather.clear, .3);
    push(LINES.work[p.role], .35);
    push(LINES.chat, 1);
    // first pass honours the weights; the second takes any pool that still has a fresh line for this person
    let t = null;
    for (const [pool, chance] of tiers) if (Math.random() < chance && (t = dlgDraw(pool, avoid))) break;
    if (!t) for (const [pool] of tiers) if ((t = dlgDraw(pool, avoid))) break;
    if (!t) { const all = [...LINES.chat]; t = all.sort((u, v) => (dlgMemo(p.id).get(u) || 0) - (dlgMemo(p.id).get(v) || 0))[0]; }
    dlgKeep(p.id, t);
    return dlgFill(t, p);
  }
  // ---------- conversations: speaker a says lines 0, 2, 4; speaker b says lines 1, 3 ----------
  const TALKS = {
    'po>ba': [['งานนี้ต้องมาก่อนนะ คนใช้รอเยอะ', 'รับทราบ เดี๋ยวสรุป flow ให้วันนี้', 'เยี่ยม เสร็จแล้วส่งให้เจ้าของดูเลย'],
      ['AC ข้อสองขอแบบวัดผลได้นะ', 'ได้ เขียนเป็นตัวเลขชัด ๆ เลย', 'แบบนี้แหละ QA Lead ชอบแน่', 'เดี๋ยวผูกเข้ากับ flow ให้ด้วย'],
      ['ผู้ใช้บ่นว่าส่ง timesheet หลายขั้นไป', 'ดู flow แล้ว ตัดได้หนึ่งขั้น', 'ดีมาก ไม่กระทบกฎอนุมัติใช่ไหม', 'ไม่กระทบ เช็กกับกฎทุกข้อแล้ว'],
      ['ใบ OLS ขอแทรกคิวได้ไหม', 'ได้ แต่ขอ AC ก่อนเริ่มนะ', 'ส่งให้ภายในบ่ายนี้', 'โอเค รับไว้ต่อคิวเลย']],
    'ba>po': [['ข้อนี้ขอบเขตยังไม่ชัด ช่วยตัดสินที', 'เอาแค่เคสหลักก่อน ที่เหลือรอบหน้า', 'โอเค ล็อกตามนี้นะ'],
      ['เจอ edge case ลาครึ่งวันคร่อมวันหยุด', 'สเปกเขียนไว้ไหม', 'ยังไม่มี ต้องให้เจ้าของตัดสิน', 'งั้นทำเป็นคำถามส่ง Head เลย'],
      ['สองฟีเจอร์นี้ชนกันนิดนึง', 'อันไหนกระทบผู้ใช้มากกว่า', 'อันแรก คนใช้ทุกวัน', 'งั้นอันแรกมาก่อน อีกอันรอคิว']],
    'ba>qal': [['plan เสร็จแล้ว ฝากเขียน test plan ต่อนะ', 'รับ ขอข้อมูลตัวอย่างด้วยได้ไหม', 'แนบไว้ท้าย plan แล้ว', 'ครบแบบนี้ เขียนไวแน่'],
      ['flow อนุมัติมีทางแยกสามทางนะ', 'งั้นต้องมีเทสต์สามเส้นทาง', 'บวกเคสถูกตีกลับอีกหนึ่ง', 'จดแล้ว ไม่หลุดแน่'],
      ['กฎข้อนี้เพิ่งเปลี่ยนเมื่อเช้า', 'ขอบคุณที่บอก เดี๋ยวแก้เคสตาม', 'อัปเดตเอกสารให้แล้วด้วย']],
    'qal>ba': [['AC ข้อ 3 ขอตัวอย่างข้อมูลหน่อย', 'ได้ เดี๋ยวเติมให้ใน plan', 'ขอบคุณนะ test plan จะได้ครบ'],
      ['เคสคนไม่มี approver ทำยังไง', 'plan ยังไม่ได้เขียน ขอเช็กสเปกก่อน', 'ถ้าสเปกไม่มี ส่งคำถามให้เจ้าของนะ', 'ได้ ไม่เดาเองแน่นอน'],
      ['submitted กับ pending ต่างกันไหม', 'ต่างกัน อันแรกส่งแล้ว อันหลังรออยู่', 'งั้นเทสต์ต้องแยกสองสถานะ', 'ใช่ เดี๋ยวเพิ่มตารางนิยามให้']],
    'qal>dev': [['test plan ผ่าน Gate 2 แล้ว หยิบได้เลย', 'รับ เขียนเทสต์ก่อนตามแผนนะ', 'ใช่ ทุก AC ต้องมีเทสต์'],
      ['เคส E2E ข้อห้าขอ data-testid หน่อย', 'ได้ เดี๋ยวเติมให้ที่ปุ่มนั้น', 'ขอบคุณ จะได้ไม่ผูกกับข้อความ'],
      ['รอบนี้ unit test ครอบ AC ครบไหม', 'ครบ ยกเว้นข้อสี่ กำลังเขียน', 'โอเค เสร็จแล้วบอกนะ', 'ได้ ก่อนเปิด PR แน่นอน']],
    'dev>qal': [['เคสนี้ใน test plan เทสต์ยังไงดี', 'ใช้ข้อมูลชุดสองท้ายแผนเลย', 'อ๋อ เจอแล้ว ขอบคุณ'],
      ['ถ้า AC เปลี่ยน test plan ต้องแก้ไหม', 'ต้องแก้ แล้วผ่าน Gate 2 ใหม่', 'เข้าใจละ ไม่แอบแก้แน่'],
      ['เทสต์ตัวนี้รันนานมาก ลดได้ไหม', 'ได้ ถ้ายังครอบ AC เดิม', 'งั้นแยกบางส่วนเป็น unit test', 'ดี เร็วขึ้นแต่ไม่หลุด']],
    'dev>tl': [['พี่ ช่วยดู PR ให้หน่อยได้ไหม', 'ได้เลย เดี๋ยวรีวิวให้ในชั่วโมงนี้', 'ขอบคุณมากพี่ ช่วยชีวิตเลย'],
      ['ตรงนี้ใช้ util เดิมหรือเขียนใหม่ดี', 'ใช้ตัวเดิม ห้ามมีสองสูตร', 'จริงด้วย จะได้ไม่ขัดกัน'],
      ['CI แดงที่ typecheck อะพี่', 'ดู log บรรทัดแรกที่แดงก่อน', 'เจอแล้ว type ผิดจริง', 'แก้ที่ต้นเหตุนะ ห้ามใส่ any'],
      ['ขอ merge ก่อนเที่ยงได้ไหม', 'CI เขียวครบเมื่อไหร่ merge ให้เลย', 'อีกห้านาทีน่าจะเขียว']],
    'tl>dev': [['test ตรงนี้ยังขาด edge case นะ', 'อ๋อ จริงด้วย เดี๋ยวเติมให้', 'โอเค ผ่านแล้วเดี๋ยว merge ให้'],
      ['PR นี้ใหญ่ไป แยกเป็นสองอันได้ไหม', 'ได้ แยกส่วน UI กับ logic', 'ดีเลย รีวิวง่ายขึ้นเยอะ'],
      ['ชื่อฟังก์ชันนี้สื่อไม่ตรงงาน', 'เปลี่ยนเป็นชื่อตามหน้าที่ดีไหม', 'ดีเลย อ่านแล้วรู้เรื่องทันที'],
      ['รีวิวผ่านแล้ว เก่งมากรอบนี้', 'เย้ ผ่านรอบเดียวครั้งแรก', 'เลี้ยงมัทฉะหนึ่งแก้วเลย']],
    'tl>qal': [['merge ครบสิบใบแล้ว รอบ release พร้อม', 'รับ เดี๋ยวตรวจรายการก่อนอนุมัติ', 'มีใบไหนแปลก ๆ บอกได้เลย'],
      ['ใบนี้แตะ rules ด้วยนะ', 'งั้นต้องรันเทสต์ security rules เพิ่ม', 'ใส่ไว้ในแผนแล้ว'],
      ['regression แดงเพราะโค้ดใหม่ไหม', 'ยังไม่รู้ ขอหาต้นเหตุก่อน', 'ได้ ไม่ rerun กลบนะ', 'แน่นอน หาเหตุจริงก่อน']],
    'qal>tl': [['รอบนี้ใบไหนเสี่ยงสุด', 'ใบที่แก้ตารางรายเดือน', 'งั้นเพิ่มเคส regression ตรงนั้น'],
      ['CI เขียวแต่ E2E ไม่ครอบ AC ข้อสอง', 'ขอบคุณที่จับได้ เดี๋ยวให้ Dev เติม', 'ยังไม่ปล่อยรอบนี้จนกว่าจะครบนะ'],
      ['ขึ้น staging แล้วมี warning ใน console', 'หน้าไหนเหรอ', 'หน้า Export อะ', 'เดี๋ยวไล่ต้นเหตุให้']],
    'qal>qa': [['รอบ release ครบเมื่อไหร่รัน regression เลยนะ', 'จัดไป รันทั้งชุดเลย', 'ผ่านแล้วส่งผลเข้า Slack ด้วยน้า'],
      ['วันนี้ช่วยเขียน test case OLS อีกชุด', 'ได้ ใบไหนก่อนดี', 'ใบที่ PO ดันขึ้นบนสุด', 'รับทราบ เริ่มเลย'],
      ['หลักฐานรอบที่แล้วครบไหม', 'ครบ มีภาพสามจอสองธีม', 'เยี่ยม อัดคลิปได้ด้วยยิ่งดี']],
    'qa>qal': [['regression ผ่านครบแล้ว', 'ดีมาก มีเคสไหนแปลกไหม', 'มีเคสนึงช้าผิดปกติ แนบไว้แล้ว', 'ขอบคุณ เดี๋ยวดูต่อ'],
      ['เจอของแปลก แต่ไม่แน่ใจว่าเป็น bug', 'เทียบกับ AC ก่อน', 'AC ไม่ได้เขียนเรื่องนี้', 'งั้นถามเจ้าของ ยังไม่เปิด bug นะ'],
      ['retest bug OLS ผ่านหมดแล้ว', 'เยี่ยม ปิดใบได้เลย', 'แนบหลักฐานก่อนปิดนะ']],
    'qa>dev': [['เจอ bug หน้า export อะ', 'ขอ step หน่อย เดี๋ยวแก้ให้', 'แนบไว้ใน ticket แล้วนะ'],
      ['ปุ่มบนจอ 375 กดยากนิดนึง', 'tap target ต่ำกว่า 44 ใช่ไหม', 'ใช่ วัดได้ 38', 'เดี๋ยวแก้ให้ถึงเกณฑ์'],
      ['แก้แล้วใช่ไหม ขอ retest เลย', 'ใช่ ขึ้น staging รอบนี้แล้ว', 'ผ่านแล้ว ขอบคุณมาก']],
    'dev>qa': [['ฝากเทสต์ตอนเน็ตช้าด้วยได้ไหม', 'ได้ จำลองเน็ตช้าให้เลย', 'ขอบคุณ อยากรู้ว่ามีอะไรหลุดไหม'],
      ['bug นั้นทำซ้ำได้ทุกครั้งไหม', 'ได้ทุกครั้ง เฉพาะโหมดมืด', 'อ๋อ สีไม่ได้มาจาก token แน่เลย'],
      ['ขึ้น staging แล้ว ลองดูได้เลย', 'รับ เดี๋ยวไล่สามจอสองธีม', 'เจออะไรบอกได้ตลอดนะ']],
    'po>dev': [['ฟีเจอร์นี้ผู้ใช้รออยู่นะ', 'test plan ผ่านแล้ว เริ่มได้เลย', 'ขอบคุณ ทำทีละขั้นก็พอ'],
      ['ถ้าตัดส่วนนี้ เร็วขึ้นไหม', 'เร็วขึ้นครึ่งวันเลย', 'งั้นตัดไปรอบหน้า'],
      ['ทำไมใบนี้ใช้เวลานาน', 'ติด edge case ที่ยังไม่มีกฎ', 'โอเค เดี๋ยวพาไปถามเจ้าของ']],
    'dev>po': [['ปุ่มนี้ควรอยู่บนหรือล่างดี', 'ตาม mock เลย ไม่เดาเอง', 'จริงด้วย mock เป็นตัวตั้ง'],
      ['ใบนี้ใหญ่กว่าที่คิด ขอซอยได้ไหม', 'ได้ ส่วนที่คนใช้เยอะก่อน', 'งั้นแยกเป็นสองใบนะ'],
      ['AC บอกว่าเร็ว เร็วแค่ไหนเหรอ', 'ภายในสองวินาที', 'ชัดเลย วัดได้แล้ว']],
    'po>qal': [['รอบ release นี้มีอะไรเสี่ยงไหม', 'มีใบแก้รายเดือน เพิ่มเคสไว้แล้ว', 'ดี ใบนั้นผู้ใช้สนใจมาก'],
      ['AC เขียวหมดแล้วใช่ไหม', 'ครบทุกข้อ มีหลักฐานแนบ', 'งั้นปิดรอบได้อย่างมั่นใจ'],
      ['ใบ OLS ต้องเทสต์ฝั่งไหนบ้าง', 'UI กับ API อย่างละชุด', 'ขอบคุณ เดี๋ยวแจ้งทีม OLS']],
    'qal>po': [['AC ข้อนี้วัดผลไม่ได้นะ', 'จริงด้วย เดี๋ยวเขียนใหม่ให้ชัด', 'ขอบคุณ จะได้เขียนเทสต์ได้'],
      ['ขอเลื่อนใบนี้ไปรอบหน้าได้ไหม', 'เพราะอะไรเหรอ', 'test plan ยังไม่ผ่าน Gate 2', 'โอเค ไม่รีบข้ามขั้น'],
      ['ผลรอบนี้ผ่านครบสิบใบ', 'เยี่ยมมาก ขอบคุณทีม QA', 'ขึ้น prod ตามขั้นเลย']],
    'po>qa': [['เทสต์หน้าที่ผู้ใช้บ่นยัง', 'เทสต์แล้ว เจอจุดเดียวที่ช้า', 'แนบไว้ใน ticket ด้วยนะ'],
      ['ลองในมุมมองผู้ใช้ใหม่หน่อย', 'ได้ เปิดแบบคนไม่เคยใช้เลย', 'ถ้างงตรงไหนบอกนะ'],
      ['วันนี้งาน OLS เยอะไหม', 'retest สามใบ เขียนเคสอีกชุด', 'สู้ ๆ นะ ขอบคุณมาก']],
    'qa>po': [['เจอจุดที่ใช้ยาก แต่ไม่ผิดสเปก', 'งั้นเปิดเป็น Improvement', 'ได้ เดี๋ยวแนบภาพให้ดู'],
      ['ข้อความเตือนนี้คนอาจงงนะ', 'ลองเขียนใหม่ให้สั้นลงไหม', 'ส่งร่างไปให้ดูแล้ว'],
      ['ใบนี้ผ่านแล้ว ใช้ได้จริง', 'ดีใจมาก ผู้ใช้รอนานแล้ว', 'ขอบคุณทีมเลย']],
    'po>tl': [['ฟีเจอร์นี้ทำได้ในรอบนี้ไหม', 'ได้ ถ้าไม่แตะ schema', 'งั้นทำแบบไม่แตะ schema'],
      ['ทำไมหน้า Admin โหลดช้า', 'ข้อมูลเยอะ ต้องแบ่งหน้า', 'ขอทำเป็นใบแยกนะ'],
      ['เรื่องความปลอดภัยรอบนี้โอเคไหม', 'โอเค ไม่มี secret หลุด', 'สบายใจละ ขอบคุณ']],
    'tl>po': [['ใบนี้ควรแยกเป็นสองใบนะ', 'ได้ แยกตามคุณค่าเลย', 'ส่วนแรกจะได้ไปก่อน'],
      ['เพิ่ม cache หน้านี้จะเร็วขึ้นมาก', 'มีค่าใช้จ่ายเพิ่มไหม', 'ไม่มี ใช้ของฟรีที่มีอยู่', 'งั้นจัดลำดับให้เลย'],
      ['ขอเวลาอัปเดต dependency หน่อย', 'มีความเสี่ยงไหม', 'มี เลยขอถามเจ้าของก่อน', 'ดี ทำตามขั้นนะ']],
    'ba>dev': [['กฎข้อนี้ต้องปัดเศษชั่วโมงนะ', 'ทศนิยมสองตำแหน่งใช่ไหม', 'ใช่ ตามตารางใน plan'],
      ['flow นี้มีสถานะ rejected ด้วยนะ', 'อ๋อ ลืมไปเลย ขอบคุณ', 'อยู่หน้าสามของ plan'],
      ['ข้อมูลมาไม่ครบ ระบบต้องเตือนนะ', 'ข้อความเตือนเอาตาม mock ไหม', 'ตาม mock เลย']],
    'dev>ba': [['เคสนี้ใน plan ไม่ได้บอกไว้', 'ตัวอย่างแบบไหนเหรอ', 'สัปดาห์ที่คร่อมสองเดือน', 'ขอเช็กสเปก แล้วตอบภายในวันนี้'],
      ['field นี้ต้องบังคับกรอกไหม', 'บังคับ ไม่กรอกส่งไม่ได้', 'รับทราบ ทำตามนั้น'],
      ['plan ชัดมาก เขียนง่ายเลย', 'ดีใจ มีอะไรงงถามได้ตลอด', 'ไม่งงเลย ขอบคุณ']],
    'ba>tl': [['flow นี้ต้องเก็บประวัติทุกครั้ง', 'งั้นต้องเขียน audit log', 'ใช่ ทุกการเปลี่ยนสถานะ'],
      ['ข้อมูลนี้ห้ามลบจริงนะ', 'ใช้ archive แทนได้', 'ตรงกับกฎเลย'],
      ['ถ้า approver ถูกปิดบัญชีจะเป็นไง', 'ต้องมีคนรับช่วงต่อ', 'งั้นเขียนกฎเพิ่มใน plan']],
    'tl>ba': [['plan นี้เปลี่ยน field ด้วยไหม', 'เพิ่มหนึ่ง field ไม่ลบอะไร', 'ดี จะได้ไม่กระทบของเดิม'],
      ['กฎนี้เขียนเป็นตารางได้ไหม', 'ได้ อ่านง่ายขึ้นด้วย', 'Dev จะได้ไม่ตีความเอง'],
      ['เคส timezone ระบุไว้ยัง', 'ใช้เวลาไทยทั้งระบบ', 'เยี่ยม ชัดเจนดี']],
    'ba>qa': [['ลองเทสต์ flow ถูกตีกลับให้หน่อย', 'ได้ ไล่ทุกทางแยกเลย', 'ขอบคุณ อยากรู้ว่าตรง plan ไหม'],
      ['ข้อมูลตัวอย่างพอไหม', 'พอ แต่ขอคนชื่อยาว ๆ เพิ่ม', 'เดี๋ยวเติมให้'],
      ['หน้าจอนี้ผู้ใช้กดตามลำดับไหม', 'ส่วนใหญ่ แต่บางคนกดข้าม', 'งั้นต้องมีกฎตอนกดข้ามด้วย']],
    'qa>ba': [['ข้อความ error นี้ตรง plan ไหม', 'ไม่ตรง plan เขียนอีกแบบ', 'งั้นเทียบกับ mock ก่อนเปิดใบ'],
      ['flow นี้กดย้อนกลับได้ไหม', 'plan ไม่ได้เขียนไว้', 'งั้นส่งเป็นคำถามดีกว่า', 'ใช่ ยังไม่ใช่ bug'],
      ['ขอบคุณสำหรับข้อมูลตัวอย่างนะ', 'ใช้ง่ายไหม', 'ง่ายมาก ครบทุกเคส']],
    'tl>qa': [['ใบนี้ช่วยเน้นจอ 430 หน่อย', 'ได้ มีอะไรเปลี่ยนเหรอ', 'เปลี่ยน layout ตาราง', 'งั้นลองข้อมูลยาว ๆ ด้วย'],
      ['เจอ error ใน console ไหม', 'ไม่เจอเลย สะอาดมาก', 'ดี ขอบคุณ'],
      ['ขอ smoke staging ก่อนเย็นนะ', 'จัดให้ เสร็จแล้วแจ้งใน Slack', 'ขอบคุณมาก']],
    'qa>tl': [['หน้าโหลดช้าตอนข้อมูลเยอะ', 'ช้าแค่ไหน', 'ห้าวินาทีได้', 'เดี๋ยวดู query ให้'],
      ['regression แดงหนึ่งเคส', 'โค้ดใหม่หรือเคสเก่า', 'เคสเก่า แต่เพิ่งแดง', 'งั้นหาต้นเหตุก่อน ห้าม rerun กลบ'],
      ['รีวิวละเอียดแบบนี้ bug น้อยลงมาก', 'ทีมช่วยกันทั้งนั้น', 'ทำต่อไปแบบนี้แหละ']],
    'dev>dev': [['เมื่อกี้แก้ conflict เหนื่อยมาก', 'pull main ก่อนเริ่มงานทุกครั้งนะ', 'จำแล้ว ไม่พลาดอีก'],
      ['hook ตัวนี้ใช้ยังไงอะ', 'ดูตัวอย่างในไฟล์ข้าง ๆ', 'เจอแล้ว ขอบคุณ'],
      ['ขอยืมเทสต์ helper หน่อย', 'อยู่ในโฟลเดอร์ lib เลย', 'สะดวกมาก ไม่ต้องเขียนใหม่'],
      ['ช่วย pair แป๊บได้ไหม', 'ได้ เปิดจอมาดูกัน', 'สองหัวดีกว่าหัวเดียวจริง']],
    'tl>tl': [['PR นี้ใครรีวิวดี', 'เดี๋ยวรับไป อีกคนรับใบถัดไป', 'แบ่งกันแบบนี้คิวไม่ค้าง'],
      ['เรื่องสถาปัตย์ใหม่ ขอความเห็นหน่อย', 'ดีนะ แต่ต้องเขียน ADR', 'จดไว้ใน DECISION_LOG ด้วย'],
      ['วันนี้ merge ไปกี่ใบแล้ว', 'สี่ใบ ไม่มีแดงเลย', 'ทีมเก่งขึ้นทุกวัน']],
    'dev>head': [['พี่ วันนี้เสร็จไปสองใบแล้ว', 'เก่งมาก พักบ้างนะ', 'ขอไปเติมมัทฉะก่อน'],
      ['ขอเวลาเพิ่มสำหรับใบใหญ่ได้ไหม', 'ได้ แค่บอกให้ชัดว่าเลื่อนเพราะอะไร', 'รับ เดี๋ยวแจ้งเป็นข้อความเลย'],
      ['token ใบนี้ใช้เกินไปนิด', 'ขอบคุณที่บอก รอบหน้าวางแผนก่อน', 'จะใช้ cache ให้มากขึ้น']],
    'po>head': [['มีเรื่องรอเจ้าของตัดสินสองเรื่อง', 'เดี๋ยวรวบส่งเป็นภาพก่อนหลังเลย', 'ขอบคุณ จะได้ตัดสินง่าย'],
      ['รอบนี้ขอดัน OLS ขึ้นก่อน', 'มีเหตุผลอะไร', 'ทีม OLS รอเทสต์อยู่', 'โอเค สมเหตุสมผล'],
      ['backlog ยาวขึ้นนะช่วงนี้', 'งั้นตัดใบที่ไม่คุ้มออกบ้าง', 'ได้ เดี๋ยวทบทวนให้']],
    'ba>head': [['เจอกฎที่สเปกไม่ได้เขียน', 'อย่าเดาเอง ส่งเป็นคำถามมา', 'ร่างคำถามไว้แล้ว'],
      ['plan ผ่าน Gate 1 แล้ว', 'เยี่ยม ส่งต่อ QA Lead เลย', 'ส่งแล้ว ขอบคุณ'],
      ['ขอเวลาวิเคราะห์อีกครึ่งวัน', 'ได้ ละเอียดดีกว่ารีบ', 'ขอบคุณที่เข้าใจ']],
    'tl>head': [['ขอ runner เพิ่มได้ไหม CI คิวยาว', 'มีค่าใช้จ่ายไหม', 'ไม่มี ใช้เครื่องที่มีอยู่', 'งั้นขอเจ้าของอนุมัติก่อน'],
      ['รอบนี้ merge ครบสิบใบ', 'เก่งมาก ส่งต่อรอบ release เลย', 'QA Lead รับไปแล้ว'],
      ['เจอความเสี่ยงด้าน security เล็ก ๆ', 'แก้ได้ในรอบนี้ไหม', 'ได้ เปิดใบแล้ว']],
    'qal>head': [['รอบ release พร้อมขึ้น staging', 'ผ่านทุก gate แล้วใช่ไหม', 'ครบทุกขั้น มีหลักฐาน', 'จัดไปเลย'],
      ['ขอให้ QA ช่วยงาน OLS วันนี้', 'ได้ แต่อย่าให้ล้นมือนะ', 'จัดคิวให้พอดีแล้ว'],
      ['test plan รอเจ้าของที่ Gate 2', 'เดี๋ยวตามให้ ไม่ให้ค้าง', 'ขอบคุณ']],
    'qa>head': [['วันนี้ retest ผ่านห้าใบ', 'สุดยอด เลี้ยงขนมเลย', 'ขอเป็นไอศกรีมได้ไหม'],
      ['staging ช้านิดนึงวันนี้', 'บอก Tech Lead ให้ดูยัง', 'บอกแล้ว กำลังหาเหตุ'],
      ['เขียน test case OLS เสร็จหนึ่งชุด', 'เยี่ยม ส่งให้ทีม OLS ดูเลย', 'ส่งแล้ว รอฟีดแบ็ก']],
    'head>dev': [['วันนี้เป็นไงบ้าง ไหวไหม', 'ไหว แต่ CI แดงหนึ่งรอบ', 'หาต้นเหตุเจอยัง', 'เจอแล้ว กำลังแก้'],
      ['ใบใหญ่นั้นถึงไหนแล้ว', 'ครึ่งทางแล้ว เทสต์เขียวไปครึ่ง', 'ดี ทำทีละขั้นนะ'],
      ['ใช้ token เยอะไปไหมช่วงนี้', 'อ่านเฉพาะช่วงที่ต้องใช้แล้ว', 'ดีมาก ค่าใช้จ่ายด้าน AI ลดลงจริง']],
    'head>po': [['รอบนี้อะไรสำคัญสุด', 'หน้าส่ง timesheet', 'งั้นทุกคนช่วยดันใบนั้นก่อน'],
      ['เจ้าของถามเรื่องลำดับงาน', 'เดี๋ยวสรุปเป็นภาพให้', 'ดีเลย ดูง่ายกว่าข้อความ'],
      ['ฟีดแบ็กผู้ใช้ช่วงนี้เป็นไง', 'ส่วนใหญ่ชม มีขอเพิ่มสองเรื่อง', 'เปิดเป็น Improvement ไว้นะ']],
    'head>ba': [['plan ไหนรอเจ้าของบ้าง', 'หนึ่งใบที่ Gate 1', 'เดี๋ยวตามให้'],
      ['วิเคราะห์ละเอียดดีมาก', 'ขอบคุณ ไม่อยากให้มีจุดหลุด', 'แบบนี้แหละที่ทีมต้องการ'],
      ['งาน OLS มี requirement ใหม่ไหม', 'มีสองข้อ กำลังสรุป', 'ไม่รีบ ขอให้ถูกต้อง']],
    'head>tl': [['CI วันนี้เป็นไง', 'เขียวเกือบหมด แดงหนึ่งตัว', 'หาเหตุจริงก่อนนะ', 'แน่นอน ไม่ rerun กลบ'],
      ['รีวิวทันไหม คิวเยอะ', 'แบ่งกับอีกคนแล้ว ทัน', 'เยี่ยม'],
      ['เรื่อง security ครบไหม', 'ครบ ไม่มี secret ใน repo', 'สบายใจเลย']],
    'head>qal': [['รอบ release ถึงไหนแล้ว', 'รอครบอีกสองใบ', 'ใกล้แล้ว สู้ ๆ'],
      ['ทีม QA งานล้นไหม', 'พอไหว แบ่งงาน OLS ดีแล้ว', 'บอกได้นะถ้าเกิน'],
      ['หลักฐานรอบที่แล้วเยี่ยมมาก', 'ขอบคุณ ทีมช่วยกันเต็มที่', 'เย็นนี้เลี้ยงชาบู']],
    'head>qa': [['วันนี้เจออะไรน่าสนใจไหม', 'จุดเล็ก ๆ บนจอ 375', 'ดี จับได้ก่อนผู้ใช้เจอ'],
      ['อย่าลืมพักสายตานะ', 'เดี๋ยวไปเดินที่สะพานแป๊บ', 'ดีเลย ลมเย็นสบาย'],
      ['retest OLS ไปกี่ใบแล้ว', 'สี่ใบ ผ่านหมด', 'เยี่ยมมาก']],
    'head>*': [['ทุกคนโอเคไหม งานเยอะเกินป่าว', 'ไหวอยู่ แต่ขอกาแฟเพิ่มหน่อย', 'จัดให้ เดี๋ยวเลี้ยงเอง'],
      ['เงินสนับสนุนทีมเข้าแล้วนะ', 'เย้ ขอบคุณทุกคน', 'ใช้ให้คุ้ม ทำงานให้ดีต่อ'],
      ['วันนี้ใครติดอะไรไหม', 'ไม่ติด ทุกอย่างลื่น', 'ดีมาก พักให้พอนะ'],
      ['ภารกิจวันนี้เหลืออีกนิด', 'ลุ้นโบนัสกันเถอะ', 'สู้ ๆ ทุกคน']],
    // small talk, the way people chat today
    '*': [['กินข้าวยัง', 'ยังเลย เที่ยงนี้ไปร้านใหม่กันไหม', 'ไปดิ เดี๋ยวจองโต๊ะไว้'],
      ['สั่งอาหารไหม ค่าส่งลดอยู่', 'เอา ข้าวมันไก่เจ้าประจำ', 'สั่งรวมกันจะได้คุ้ม', 'ฝากไข่ต้มเพิ่มด้วยนะ'],
      ['ไรเดอร์โทรมาบอกถึงแล้ว', 'เร็วมาก เพิ่งสั่งไปสิบนาที', 'ร้านใกล้นี่ดีจริง'],
      ['เจอคาเฟ่ใหม่แถวบ้าน', 'บรรยากาศเป็นไง', 'ต้นไม้เยอะ นั่งทำงานได้', 'เสาร์นี้พาไปหน่อย'],
      ['วันนี้กาแฟแก้วที่เท่าไหร่แล้ว', 'สามแล้ว แต่ใครนับ', 'ดื่มน้ำเปล่าด้วยนะ'],
      ['ลองดริปกาแฟเองที่บ้านยัง', 'ลองแล้ว ยากกว่าที่คิด', 'ฝึกบ่อย ๆ เดี๋ยวก็มือขึ้น'],
      ['เมื่อเช้ารถติดมาก', 'ฝนตกด้วย ยิ่งหนักเลย', 'ขึ้น BTS แทนดีกว่า', 'คนแน่นแต่ถึงไวจริง'],
      ['MRT สายใหม่ไปถึงแถวบ้านแล้วนะ', 'ดีจัง ไม่ต้องต่อรถหลายทอด', 'ประหยัดเวลาไปเยอะ'],
      ['ฝนตกทุกเย็นเลยช่วงนี้', 'พกร่มเล็กไว้ในกระเป๋าตลอด', 'ฉลาดมาก ของฉันลืมทุกวัน'],
      ['เสาร์อาทิตย์นี้ทำอะไร', 'นอนยาว ๆ แล้วไปตลาดนัด', 'ฟังดูดีที่สุดแล้ว'],
      ['สุดสัปดาห์ไปเขาใหญ่มา', 'อากาศดีไหม', 'เย็นสบาย หมอกเต็มเลย', 'อยากไปบ้างแล้ว'],
      ['วันหยุดยาวนี้ไปไหนดี', 'ทะเลใกล้ ๆ ก็พอ', 'หัวหินไหม ขับรถไม่ไกล'],
      ['ปลายปีจะไปญี่ปุ่น', 'ไปเมืองไหน', 'โอซาก้า ไปกินให้สุด', 'ฝากขนมด้วยน้า'],
      ['เกาหลีหน้าใบไม้ร่วงสวยมาก', 'ไปมาแล้วเหรอ', 'ไปปีที่แล้ว ถ่ายรูปไม่หยุดเลย'],
      ['เชียงใหม่ช่วงนี้หนาวยัง', 'เริ่มเย็นแล้ว ดอยสวยมาก', 'ขอไปนอนเต็นท์สักคืน'],
      ['เก็บเงินไปเที่ยวต่างประเทศอยู่', 'ตั้งเป้าไว้เท่าไหร่', 'เดือนละนิด ค่อย ๆ เก็บ', 'แบบนี้แหละยั่งยืน'],
      ['ดูซีรีส์เรื่องใหม่ยัง', 'ดูแล้ว ตอนจบช็อกมาก', 'อย่าสปอยล์นะ ยังดูไม่ถึง', 'โอเค ปิดปากแล้ว'],
      ['เมื่อคืนดูซีรีส์ถึงตีสอง', 'เลยตาปรือเลยสิ', 'ใช่ แต่คุ้มมาก'],
      ['หนังเรื่องใหม่เข้าโรงแล้วนะ', 'ไปดูรอบดึกกันไหม', 'ไปดิ ขอป๊อปคอร์นถังใหญ่'],
      ['หาซีรีส์ดูใหม่ แนะนำหน่อย', 'ชอบแนวไหน', 'สืบสวน ลุ้น ๆ', 'มีเรื่องนึงดีมาก เดี๋ยวส่งให้'],
      ['ได้บัตรคอนเสิร์ตยัง', 'ได้ กดทันพอดี', 'ดีใจด้วย ร้องจนเสียงหายแน่'],
      ['ฟังเพลงอะไรตอนทำงาน', 'เพลงบรรเลงเบา ๆ', 'ช่วยโฟกัสดีนะ เดี๋ยวลองบ้าง'],
      ['เพลงใหม่นี้ติดหูมาก', 'ฟังทั้งวันเลยใช่ไหม', 'ใช่ ติดไปถึงพรุ่งนี้แน่'],
      ['เมื่อคืนดูบอลป่าว', 'ดูดิ ลุ้นจนนอนไม่หลับ', 'วันนี้เลยตาปรือเลยอะ'],
      ['แมตช์เมื่อคืนมันมาก', 'ใช่ ประตูสุดท้ายคือสวย', 'ดูไฮไลต์ซ้ำสามรอบแล้ว'],
      ['เย็นนี้ไปตีแบดกันไหม', 'จองคอร์ตหรือยัง', 'จองแล้ว สองชั่วโมง', 'ไปแน่นอน ขอยืมไม้หน่อย'],
      ['ตีแบดเมื่อวาน ปวดแขนมาก', 'แสดงว่าตีหนักจริง', 'ทายาแล้ว พรุ่งนี้ตีต่อ'],
      ['เริ่มเข้ายิมแล้วนะ', 'ไปกี่วันต่ออาทิตย์', 'สามวัน เริ่มเบา ๆ ก่อน', 'สม่ำเสมอสำคัญสุด'],
      ['เสาร์นี้มีงานวิ่งมินิมาราธอน', 'ไปด้วยกันไหม', 'ไป แต่ขอวิ่งช้า ๆ นะ', 'ช้าแค่ไหนก็ถึงเส้นชัย'],
      ['ลองพิลาทิสแล้ว ปวดทั้งตัวเลย', 'แต่หลังดีขึ้นไหม', 'ดีขึ้นจริง นั่งทำงานสบายขึ้น'],
      ['นาฬิกาเตือนให้ลุกเดินแล้ว', 'เดินไปโซนเครื่องดื่มกัน', 'ได้ทั้งก้าวได้ทั้งน้ำ'],
      ['ช่วงนี้นอนไม่ค่อยหลับ', 'ลองวางมือถือก่อนนอนดู', 'ลองแล้ว หลับดีขึ้นนิดนึง', 'ค่อย ๆ ปรับนะ'],
      ['ดื่มน้ำวันละสองลิตรได้ไหม', 'ตั้งเตือนในมือถือไว้', 'ไอเดียดี เดี๋ยวตั้งบ้าง'],
      ['เป็นหวัดนิดหน่อย', 'ใส่หน้ากากด้วยนะ แล้วพักเยอะ ๆ', 'ขอบคุณ ดื่มน้ำขิงอยู่'],
      ['แมวที่บ้านชอบนอนบนคีย์บอร์ด', 'ของฉันชอบนั่งบังจอ', 'สงสัยแมวอยากช่วยทำงาน'],
      ['เพิ่งรับน้องหมามาเลี้ยง', 'ชื่ออะไรเหรอ', 'ชื่อข้าวตู', 'น่ารัก ขอดูรูปหน่อย'],
      ['หมาที่บ้านกลัวฟ้าร้อง', 'กอดไว้แน่น ๆ เลยไหม', 'ใช่ นอนด้วยกันทั้งคืน'],
      ['เสาร์นี้กลับบ้านต่างจังหวัด', 'ไปหาพ่อแม่เหรอ', 'ใช่ แม่จะทำแกงที่ชอบให้', 'อบอุ่นสุด ๆ เลย'],
      ['หลานเพิ่งเข้าอนุบาล', 'ร้องไห้ไหมวันแรก', 'ร้องนิดเดียว แล้ววิ่งไปเล่นเลย'],
      ['ลองทำต้มยำเองครั้งแรก', 'รสชาติเป็นไง', 'เปรี้ยวไปนิด แต่กินหมด', 'ครั้งหน้าลดมะนาวลง'],
      ['หม้อทอดไร้น้ำมันทำได้ทุกอย่างจริง', 'หมูกรอบด้วยไหม', 'กรอบมาก ไม่ต้องออกไปซื้อ'],
      ['เมนูเย็นนี้คิดไม่ออก', 'ไข่เจียวหมูสับ ง่ายสุด', 'จบเลย คำตอบนี้แหละ'],
      ['เปลี่ยนมือถือใหม่ยัง', 'ยัง เครื่องเก่ายังไหว', 'ใช้จนกว่าจะพัง คุ้มสุด'],
      ['หูฟังตัดเสียงช่วยชีวิตมาก', 'ใช้ตอนนั่ง BTS ด้วยไหม', 'ใช้ตลอด โลกเงียบสงบ'],
      ['นาฬิกาวัดการนอนบอกว่านอนน้อย', 'มันจับได้ด้วยเหรอ', 'ได้ แถมเตือนให้นอนเร็วด้วย'],
      ['เมื่อคืนเล่นเกมกับเพื่อนถึงดึก', 'เกมอะไร', 'เกมสร้างเมือง ชิลมาก', 'เหมือนออฟฟิศเราเลย'],
      ['เล่น PS5 ในห้องพักผ่อนยัง', 'เล่นแล้ว เกมแข่งรถมันมาก', 'เบรกหน้ามาแข่งกัน'],
      ['ใช้ AI ช่วยสรุปประชุมยัง', 'ใช้แล้ว ประหยัดเวลามาก', 'แต่ต้องอ่านทวนเองทุกครั้งนะ', 'แน่นอน เช็กก่อนส่ง'],
      ['ให้ AI ช่วยเขียนเทสต์ ไวขึ้นเยอะ', 'แต่ต้องรีวิวเองด้วยนะ', 'ใช่ ความรับผิดชอบยังเป็นของเรา'],
      ['ค่าใช้จ่ายด้าน AI เดือนนี้ลดลงนะ', 'เพราะใช้ cache เยอะขึ้น', 'ทีมเรียนรู้ไวมาก'],
      ['เริ่มเรียนภาษาญี่ปุ่นแล้ว', 'ไปถึงไหนแล้ว', 'อ่านฮิรางานะได้ครบ', 'เก่งมาก ไปญี่ปุ่นสั่งอาหารเองได้'],
      ['ลงคอร์สออนไลน์เรื่อง design', 'เรียนตอนไหน', 'ก่อนนอนวันละครึ่งชั่วโมง', 'สม่ำเสมอแบบนี้ได้ผลแน่'],
      ['อยากเก่ง SQL กว่านี้', 'ลองฝึกโจทย์วันละข้อ', 'ดีนะ เริ่มพรุ่งนี้เลย'],
      ['ทำแอปจดรายจ่ายเล่นอยู่', 'ใช้เองหรือแจกเพื่อน', 'ใช้เองก่อน ถ้าดีค่อยแจก', 'อยากลองใช้ด้วย'],
      ['ปลูกผักบนระเบียงคอนโด', 'รอดไหม', 'กะเพรางามมาก ใช้ทำกับข้าวได้'],
      ['เดือนนี้ตั้งงบค่ากินไว้', 'ทำได้ไหม', 'เกินไปนิดเพราะชานม', 'ชานมเป็นข้อยกเว้นได้'],
      ['ลองจดรายจ่ายทุกวันดูสิ', 'จดแล้วเห็นเลย ค่ากาแฟเยอะสุด', 'ชงเองที่ออฟฟิศช่วยได้เยอะ'],
      ['เห็นมีมแมวในกลุ่มแชตยัง', 'เห็นแล้ว ขำจนน้ำตาไหล', 'ส่งต่อให้ทุกคนแล้ว'],
      ['มีมใหม่ตรงกับชีวิต Dev มาก', 'CI แดงตอนเย็นวันศุกร์ใช่ไหม', 'ใช่ เจ็บแต่จริง'],
      ['พรุ่งนี้วันเกิดใครนะ', 'QA Lead ไง', 'เตรียมเค้กลับกันเถอะ', 'อย่าให้รู้ตัวนะ'],
      ['สุขสันต์วันเกิดนะ', 'ขอบคุณมาก ซึ้งเลย', 'ขอให้ CI เขียวตลอดปี', 'พรนี้ดีที่สุดแล้ว'],
      ['ลอยกระทงปีนี้ไปไหน', 'ริมแม่น้ำใกล้บ้าน', 'ทำกระทงขนมปังนะ ปลาได้กิน'],
      ['สงกรานต์ปีหน้ากลับบ้านไหม', 'กลับ ไปรดน้ำดำหัวยาย', 'อบอุ่นจัง'],
      ['ปีใหม่นี้ตั้งเป้าอะไร', 'ออกกำลังให้สม่ำเสมอ', 'เป้าเดียวกับปีที่แล้วเลย', 'ปีนี้ต้องได้'],
      ['11.11 ปีนี้จะซื้ออะไร', 'หม้อทอดไร้น้ำมันตัวใหม่', 'ใส่ตะกร้ารอเลย', 'อย่าลืมตั้งงบนะ'],
      ['ใกล้ 12.12 ตะกร้าเต็มอีกแล้ว', 'ซื้อของจำเป็นก่อนนะ', 'จริง ลบออกไปครึ่งนึงแล้ว'],
      ['ชอบ WFH หรือเข้าออฟฟิศมากกว่า', 'ผสมกันดีสุด', 'ใช่ ออฟฟิศได้เจอเพื่อน บ้านได้โฟกัส'],
      ['เมื่อวาน WFH ทั้งวันเลย', 'เหงาไหม', 'ไม่เลย แมวนั่งเป็นเพื่อนทั้งวัน'],
      ['เห็นห้องงีบใหม่ยัง', 'เห็นแล้ว เตียงนุ่มมาก', 'บ่ายนี้ขอไปงีบสักยี่สิบนาที'],
      ['วันนี้อากาศดีเนอะ', 'ใช่ เย็นนี้ไปปั่นจักรยานกัน', 'เอาดิ ยืม e-bike หน้าออฟฟิศเลย'],
      ['ไอศกรีมในตู้รสใหม่มาแล้ว', 'รสอะไร', 'ชาไทย', 'ไปก่อนหมดเลย'],
      ['สระว่ายน้ำวันนี้คนน้อย', 'เบรกหน้าไปว่ายกัน', 'จัดไป เอาผ้าเช็ดตัวด้วย']]
  };
  // small talk that fits the moment: time of day and weather
  const TALK_CTX = {
    rain: [['ฝนตกหนักเลย กลับบ้านยังไง', 'รอให้ซาก่อน กินขนมรอ', 'ไอเดียดี ไปโซนเครื่องดื่มกัน'],
      ['ลืมร่มอีกแล้ว', 'ที่ออฟฟิศมีร่มกลางให้ยืมนะ', 'ช่วยชีวิตเลย'],
      ['ฝนตกแบบนี้อยากกินหมูกระทะ', 'เย็นนี้ไปกันไหม', 'ไปดิ รอฝนหยุดก่อน']],
    snow: [['หิมะตกจริงเหรอเนี่ย', 'สวยมาก เหมือนอยู่ญี่ปุ่น', 'ไปปั้นตุ๊กตาหิมะกัน'],
      ['หนาวจนมือชา', 'โกโก้ร้อนไหม', 'ขอสองแก้วเลย'],
      ['หิมะแบบนี้ระวังลื่นนะ', 'เดินช้า ๆ ทุกคน', 'ใส่รองเท้ากันลื่นแล้ว']],
    autumn: [['ใบไม้ร่วงสวยมาก', 'ถ่ายรูปกันไหม', 'ไป แสงตอนนี้ดีสุด'],
      ['ลมเย็นแบบนี้อยากไปเที่ยว', 'ไปเกาหลีหน้าใบไม้ร่วงสิ', 'เก็บเงินก่อนนะ'],
      ['ใบไม้เต็มทางเดินเลย', 'หุ่นยนต์ดูดฝุ่นทำงานหนัก', 'ปรบมือให้มันหน่อย']],
    clear: [['แดดแรงมาก', 'อยู่ในแอร์ดีที่สุด', 'หรือไปลงสระดี'],
      ['ฟ้าใสแบบนี้ไปพายเรือไหม', 'เบรกหน้าไปกัน', 'จองเรือไว้เลย'],
      ['ร้อนจนอยากกินน้ำแข็งใส', 'ตู้ไอศกรีมมีนะ', 'ไปเลย ตอนนี้']],
    morning: [['อรุณสวัสดิ์ วันนี้เป็นไงบ้าง', 'ง่วงนิดหน่อย แต่พร้อมลุย', 'กาแฟก่อนเลยไหม'],
      ['เมื่อเช้ากินอะไรมา', 'โจ๊กหน้าปากซอย', 'อร่อยไหม พรุ่งนี้ลองบ้าง'],
      ['วันนี้มีประชุมไหม', 'สั้น ๆ สิบห้านาที', 'ดี จะได้มีเวลาทำงานยาว ๆ']],
    lunch: [['เที่ยงแล้ว กินอะไรดี', 'ทำกับข้าวในครัวกันไหม', 'ผัดกะเพราไข่ดาวเลย'],
      ['สั่งข้าวรวมไหม', 'เอา ขอข้าวขาหมู', 'ได้ เดี๋ยวสั่งให้'],
      ['กินเสร็จเดินเล่นที่สะพานกัน', 'ดี ย่อยด้วย', 'ได้วิวด้วย']],
    slump: [['ง่วงมาก ตาจะปิด', 'ไปชงกาแฟกัน', 'ขอแบบเข้ม ๆ'],
      ['บ่ายนี้เหนื่อยจัง', 'พักห้านาทีที่เก้าอี้นวดไหม', 'ไปดิ ชาร์จแบตแป๊บ'],
      ['ใครมีขนมบ้าง', 'ชั้นขนมเพิ่งเติม', 'ไปก่อนหมด']],
    evening: [['เย็นนี้มีแผนอะไร', 'ไปวิ่งสวนสาธารณะ', 'ไปด้วยคน'],
      ['เลิกงานแล้วรีบกลับไหม', 'รอรถไม่ติดก่อน', 'งั้นกินข้าวเย็นด้วยกัน'],
      ['วันนี้ปิดงานได้กี่ใบ', 'สองใบ ภูมิใจมาก', 'เก่งมาก พักผ่อนนะ']],
    night: [['ดึกแล้ว ยังไม่กลับเหรอ', 'ขอปิดชิ้นนี้ก่อน', 'อย่าดึกมากนะ'],
      ['หิวรอบดึก', 'ในครัวมีมาม่า', 'ใส่ไข่ด้วยนะ'],
      ['คืนนี้ดูซีรีส์ไหม', 'ตอนเดียวพอ พรุ่งนี้ตื่นเช้า', 'ตอนเดียวจริงนะ']],
    latenight: [['ตีหนึ่งแล้วนะ', 'ใช่ ไปพักกันเถอะ', 'เซฟงานแล้วปิดเครื่อง'],
      ['ทำไมยังตื่นอยู่', 'ใจยังลุ้นงานอยู่', 'พรุ่งนี้ค่อยลุ้นต่อนะ'],
      ['ดึกขนาดนี้เงียบดีจัง', 'เงียบจนได้ยินเสียงน้ำพุ', 'บรรยากาศดีแต่ต้องนอนแล้ว']]
  };
  // passers-by: a talk that opens with "ขอโทษ" or "ทำงาน" is the passer-by speaking first (chatWithNpc reads that)
  const NPC_LIST = [
    ['ทำงานที่นี่เหรอ บรรยากาศดีมาก', 'ใช่ มีห้องงีบด้วยนะ', 'ว้าว อยากทำงานที่นี่บ้างจัง'],
    ['ขอโทษนะ ร้านกาแฟไปทางไหน', 'ตรงไปเลย ร้านอยู่ริมสะพาน', 'ขอบคุณมาก'],
    ['ขอโทษนะ แถวนี้จอดจักรยานได้ไหม', 'ได้ ตรงจุดยืมจักรยานหน้าออฟฟิศ', 'สะดวกจัง ขอบคุณ'],
    ['ขอโทษนะ ป้ายรถเมล์อยู่ตรงไหน', 'เดินไปสุดทางแล้วเลี้ยวซ้าย', 'ขอบคุณ ช่วยได้เยอะ'],
    ['ทำงานที่นี่สนุกไหม', 'สนุกนะ ทีมน่ารัก', 'ดูออกเลย ทุกคนยิ้มแย้ม'],
    ['ขอโทษนะ ถ่ายรูปกับบึงบัวได้ไหม', 'ได้เลย มุมสะพานสวยสุด', 'ขอบคุณ แสงตอนนี้ดีมาก'],
    ['ทำงานที่นี่มีสระว่ายน้ำด้วยเหรอ', 'มี เบรกแล้วไปว่ายได้', 'อิจฉาเลย ที่ทำงานเรามีแต่แอร์'],
    ['ขอโทษนะ แถวนี้ร้านข้าวร้านไหนอร่อย', 'ร้านข้าวมันไก่หัวมุม', 'เดี๋ยวลองไปกินเลย', 'คิวยาวนิดนึงนะ'],
    ['ทำงานกันดึกไหมที่นี่', 'ไม่ค่อย ทีมเน้นพักให้พอ', 'ดีจัง สุขภาพสำคัญ'],
    ['ขอโทษนะ วันนี้ฝนจะตกไหม', 'พยากรณ์บอกว่าเย็นนี้', 'งั้นรีบกลับก่อนดีกว่า'],
    ['ทำงานด้านไหนกันเหรอ', 'ทำระบบบันทึกเวลาทำงาน', 'ฟังดูมีประโยชน์มาก'],
    ['ขอโทษนะ เฮลิคอปเตอร์นั่นของที่นี่เหรอ', 'ใช่ ไว้บินชมเมือง', 'เท่มากเลย'],
    ['ขอโทษนะ น้ำพุนี่โยนเหรียญได้ไหม', 'ได้ อธิษฐานด้วยนะ', 'งั้นขอให้ได้งานดี ๆ'],
    ['ทำงานที่นี่เลี้ยงปลาด้วยเหรอ', 'ใช่ ปลาในบึงตัวโตมาก', 'น่ารักดี ขอดูแป๊บ'],
    ['ขอโทษนะ ตลาดนัดเปิดวันไหน', 'เสาร์อาทิตย์ตอนเย็น', 'ขอบคุณ ไว้ไปเดินเล่น'],
    ['ขอโทษนะ วิ่งรอบบึงได้กี่กิโล', 'ประมาณสองกิโล', 'กำลังดีเลย พรุ่งนี้มาวิ่ง'],
    ['ทำงานที่นี่ทำกับข้าวเองได้ด้วยเหรอ', 'ได้ มีครัวใหญ่เลย', 'ดีจัง ไม่ต้องคิดว่ากินอะไร'],
    ['ขอโทษนะ ห้องน้ำสาธารณะไปทางไหน', 'เดินตรงไปทางลานจอด', 'ขอบคุณมาก']
  ];
  // other code reads NPC_TALKS[Math.floor(Math.random() * NPC_TALKS.length)]: any index read draws the next talk of the bag
  const NPC_TALKS = new Proxy(NPC_LIST, { get: (t, k) => (typeof k === 'string' && /^\d+$/.test(k) ? dlgDraw(t) : t[k]) });
  function linesFor(a, b) {
    const pair = TALKS[`${a.role}>${b.role}`] || (a.role === 'head' ? TALKS['head>*'] : null);
    const ctx = Math.random() < .5 ? TALK_CTX[dlgSlot()] : TALK_CTX[weather];
    const tiers = [[pair, .55], [a.role === 'head' ? TALKS['head>*'] : null, .2], [ctx, .3], [TALKS['*'], 1]].filter(x => x[0] && x[0].length);
    const key = ex => 'talk:' + ex[0];
    const avoid = ex => dlgRecent(a.id, key(ex)) || dlgRecent(b.id, key(ex));
    let ex = null;
    for (const [pool, chance] of tiers) if (Math.random() < chance && (ex = dlgDraw(pool, avoid))) break;
    if (!ex) for (const [pool] of tiers) if ((ex = dlgDraw(pool, avoid))) break;
    if (!ex) ex = dlgDraw(TALKS['*']);
    dlgKeep(a.id, key(ex)); dlgKeep(b.id, key(ex));
    return ex;
  }
  // ---------- passers-by talk and think on their own (owner, 14 Oct 2026: "คน NPC สมจริงเหมือนคนในออฟฟิศเราหน่อย ...
  // เอาแบบพูดมีคำนึกออกมาได้เหมือนกัน") ----------
  // An NPC's type is n.type when it names a key of NPC_LINES; otherwise it comes from the collection it lives in
  // (DLG_NPC_SETS), and a walker who runs is a jogger. A new kind of NPC only needs n.type set to one of these keys.
  const NPC_LINES = {
    walker: ['เดินเล่นตอนเย็นนี่ดีที่สุด', 'ออฟฟิศนี้สวยทุกครั้งที่เดินผ่าน', 'วันนี้เดินครบหมื่นก้าวแน่', 'แวะซื้อกาแฟร้านริมสะพานดีกว่า',
      'ลมเย็นสบาย เดินได้อีกยาว', 'ร้านดอกไม้ข้างหน้าเปิดยังน้า', 'เดินฟังพอดแคสต์เพลินเลย', 'เดี๋ยวแวะมินิมาร์ทซื้อน้ำ',
      'ถนนนี้ร่มรื่นดีจัง', 'ไปเยี่ยมเพื่อนที่อพาร์ตเมนต์ก่อน', 'ต้นไม้แถวนี้สวยมาก ขอถ่ายรูป'],
    jogger: ['อีกหนึ่งกิโล สู้ ๆ', 'หายใจเข้าลึก ๆ ออกยาว ๆ', 'วิ่งแบบนี้สดชื่นทั้งวัน', 'เพซวันนี้ดีกว่าเมื่อวาน',
      'เหงื่อออกเต็มที่ ฟินมาก', 'ขอแซงหน่อยนะ', 'วิ่งรอบบึงอีกรอบดีไหม', 'นาฬิกาบอกว่าหัวใจเต้นพอดี',
      'เดือนหน้ามีงานวิ่ง ต้องซ้อม', 'วิ่งเสร็จแล้วกินโจ๊กสักชาม'],
    cyclist: ['ทางจักรยานนี้ปั่นสบายมาก', 'ขอทางหน่อยนะ', 'e-bike นี่ขึ้นสะพานสบายเลย', 'ปั่นไปทำงาน ไม่ต้องรถติด',
      'ลมตีหน้าเย็นดี', 'ใส่หมวกกันน็อกทุกครั้งนะ', 'แวะคาเฟ่หน้าโน้นก่อนดีกว่า', 'ปั่นอีกนิดถึงบ้านแล้ว',
      'ระวังทางเปียกตรงโค้ง', 'วันนี้ปั่นได้สิบกิโลแล้ว'],
    dogwalker: ['เดินช้า ๆ นะ ไม่ต้องรีบ', 'ดมทุกต้นไม้เลยเหรอ', 'เก่งมาก นั่งรอข้างทางนะ', 'พกถุงเก็บมูลมาด้วย เรียบร้อย',
      'ทักทายเพื่อนหมาหน่อยไหม', 'เดินครบรอบแล้ว กลับบ้านกินข้าว', 'อย่าเพิ่งวิ่งตามนกสิ', 'ขนสวยมากวันนี้ เพิ่งอาบน้ำ',
      'ใครเห็นก็ชมว่าน่ารัก', 'ร้อนแล้ว ไปเดินใต้ร่มไม้กัน'],
    rider: ['อีกสองออร์เดอร์ เสร็จแล้วพัก', 'ตึกนี้ทางเข้าอยู่ไหนน้า', 'ขอโทรหาลูกค้าแป๊บ', 'ข้าวมันไก่ยังร้อนอยู่ รีบส่ง',
      'ฝนตกต้องห่อของดี ๆ', 'ส่งตรงเวลา ลูกค้าให้ดาวเต็มแน่', 'ถนนนี้ไม่ติด ส่งไวดี', 'แวะเติมน้ำก่อนรอบต่อไป',
      'ถึงแล้ว รอรับที่หน้าตึกนะ', 'วันนี้ออร์เดอร์เยอะดีจัง'],
    family: ['ลูกอยากดูเรือ ไปริมน้ำกัน', 'จับมือกันไว้นะ ถนนรถเยอะ', 'เดี๋ยวแวะซื้อไอศกรีมให้', 'ถ่ายรูปครอบครัวตรงสะพานกัน',
      'เหนื่อยไหมลูก ขี่คอพ่อไหม', 'วันหยุดได้เดินเล่นด้วยกัน ดีจัง', 'ยายรอกินข้าวที่บ้านนะ', 'ดูปลาในบึงสิ ตัวโตมากเลย',
      'เดินช้า ๆ รอน้องด้วย', 'เย็นนี้กินข้าวนอกบ้านกัน'],
    tourist: ['ตึกนี้สวยมาก ถ่ายรูปก่อน', 'แผนที่บอกว่าเลี้ยวซ้าย', 'ร้านกาแฟนี้รีวิวดีมาก', 'แดดเมืองไทยแรงจริง ๆ',
      'อยากลองต้มยำของแท้', 'สะพานไม้นี่ถ่ายรูปสวยมาก', 'ขึ้น BTS ไปต่อได้ไหมนะ', 'ซื้อของฝากที่ไหนดี',
      'เดินเที่ยวแบบนี้ได้เห็นเมืองจริง', 'ขอถามทางคนแถวนี้ดีกว่า'],
    boatman: ['น้ำนิ่งดี วันนี้พายสบาย', 'ระวังนะ ก้าวลงเรือช้า ๆ', 'ใส่เสื้อชูชีพก่อนออกเรือ', 'รอบนี้ไปถึงสะพานแล้วกลับ',
      'ลมเริ่มแรง ขอเลียบฝั่ง', 'ปลาโผล่มาดูเราด้วย', 'พายเรือมาหลายปี ไม่เคยเบื่อ', 'ฝนตั้งเค้าแล้ว รีบกลับฝั่ง',
      'ผู้โดยสารวันนี้อารมณ์ดีทุกคน', 'ผูกเรือให้แน่นก่อนขึ้นฝั่ง'],
    passenger: ['วิวจากในเรือสวยกว่าที่คิด', 'เรือโคลงนิดนึง ตื่นเต้นดี', 'ถ่ายวิดีโอเก็บไว้ดีกว่า', 'ลมเย็นมาก ไม่อยากขึ้นฝั่งเลย',
      'บัวบานเต็มบึงเลย', 'ขอบคุณที่พาเที่ยวนะ', 'นั่งเรือแล้วหายเครียดเลย', 'จับขอบเรือไว้แน่น ๆ',
      'มองเห็นออฟฟิศริมน้ำด้วย', 'รอบหน้าพาเพื่อนมาด้วยดีกว่า'],
    driver: ['ถนนโล่ง ขับสบาย', 'ไฟแดงนี้นานจัง', 'เปิดเพลงฟังไปเพลิน ๆ', 'รถติดนิดหน่อย ใจเย็นไว้',
      'ขับช้า ๆ แถวนี้คนเดินเยอะ', 'ให้คนข้ามถนนก่อนนะ', 'น้ำมันใกล้หมด แวะเติมก่อน', 'ฝนตกต้องเปิดไฟหน้า',
      'กลับบ้านไปกินข้าวกับครอบครัว', 'ที่จอดรถแถวนี้หายากจัง'],
    police: ['ตรวจรอบนี้เรียบร้อยดี', 'ขับช้า ๆ นะ เขตชุมชน', 'ช่วยคุณป้าข้ามถนนก่อน', 'วันนี้ถนนปลอดภัยดี',
      'มีอะไรให้ช่วย เรียกได้เลย', 'สวมหมวกกันน็อกทุกคนนะ', 'ตรงนี้ห้ามจอด ขอบคุณที่เข้าใจ', 'จราจรคล่องตัว ดีมาก',
      'เดินตรวจรอบตลาดต่อ', 'ขอให้ทุกคนกลับบ้านปลอดภัย'],
    ambulance: ['ขอทางหน่อยนะ ขอบคุณที่หลบให้', 'ไปโรงพยาบาลให้ไวที่สุด', 'ทุกคนช่วยหลบทาง ใจดีมาก', 'ใกล้ถึงแล้ว อดทนนิดนึงนะ',
      'เช็กอุปกรณ์ครบ พร้อมออก', 'ภารกิจเสร็จ กลับฐาน', 'ขับเร็วแต่ต้องปลอดภัย', 'ขอบคุณรถทุกคันที่ชิดซ้าย',
      'วันนี้เคสไม่เยอะ ดีแล้ว', 'พักแป๊บ แล้วพร้อมออกใหม่'],
    icecream: ['ไอศกรีมมาแล้วจ้า', 'รสชาไทยขายดีสุดวันนี้', 'ร้อนแบบนี้ ไอศกรีมหมดไวแน่', 'เด็ก ๆ วิ่งมาแล้ว',
      'มีโคนกับถ้วย เลือกได้เลย', 'แวะจอดหน้าสวนดีกว่า', 'ไอศกรีมกะทิสูตรยาย', 'เพลงรถไอศกรีมติดหูตัวเองด้วย',
      'ขายหมดถังนึงแล้ว', 'เย็นนี้จะไปจอดหน้าโรงเรียน'],
    parcel: ['พัสดุอีกสิบกล่อง สู้ ๆ', 'บ้านเลขที่นี้อยู่ตรงไหนน้า', 'ขอลายเซ็นรับของด้วยนะ', 'กล่องนี้หนักมาก ยกระวัง ๆ',
      'ฝนตก ห่อพลาสติกกันเปียกแล้ว', 'ช่วง 11.11 ของเยอะสุด ๆ', 'วางไว้หน้าห้องให้นะ', 'ส่งครบรอบเช้าแล้ว',
      'จอดแป๊บเดียว ขอโทษที่ขวางนะ', 'เส้นทางวันนี้ไม่ติดเลย']
  };
  const NPC_CTX = {
    morning: ['เช้านี้อากาศดีจัง', 'รีบไปทำงานก่อนรถติด', 'ซื้อกาแฟก่อนเข้างาน', 'เช้าแบบนี้ต้องโจ๊กร้อน ๆ'],
    lunch: ['หิวแล้ว ไปกินข้าวร้านริมน้ำ', 'เที่ยงแล้ว แดดแรงจัง', 'เดินหาร้านข้าวอยู่', 'ข้าวกล่องวันนี้อร่อย'],
    slump: ['บ่ายนี้ง่วงจัง', 'ขอชาเย็นสักแก้ว', 'แดดบ่ายแรงมาก หลบร่มก่อน', 'เดินช้า ๆ ไม่รีบ'],
    evening: ['เลิกงานแล้ว ไปตลาดนัดกัน', 'ฟ้าตอนเย็นสวยมาก', 'รีบกลับก่อนมืด', 'แวะซื้อกับข้าวกลับบ้าน'],
    night: ['ดึกแล้ว รีบกลับบ้านดีกว่า', 'ไฟถนนเปิดครบ เดินสบายใจ', 'กลางคืนเมืองนี้สวยมาก', 'หิวรอบดึก แวะมินิมาร์ท'],
    latenight: ['ดึกขนาดนี้ถนนเงียบมาก', 'เพิ่งเลิกกะ เหนื่อยแต่ไหว', 'รีบกลับไปนอนดีกว่า', 'ร้านยังเปิดอยู่ไหมน้า'],
    clear: ['แดดแรงจริง ๆ', 'ฟ้าใสเหมาะเดินเล่น', 'ลืมทาครีมกันแดด', 'ร้อนจัง อยากกินน้ำแข็งใส'],
    rain: ['ฝนตกอีกแล้ว ลืมร่ม', 'รองเท้าเปียกหมดเลย', 'หลบฝนใต้กันสาดก่อน', 'ฝนตกถนนลื่น ระวังนะ'],
    snow: ['หิมะตก ไม่น่าเชื่อเลย', 'หนาวจนมือชา', 'ถ่ายรูปหิมะส่งให้แม่ดู', 'ระวังลื่นนะทุกคน'],
    autumn: ['ใบไม้ร่วงสวยจัง', 'เดินเตะใบไม้เพลินดี', 'ลมเย็นสบาย ฟีลต่างประเทศ', 'ถ่ายรูปกับใบไม้สีส้ม']
  };
  // NPC to NPC: neighbours who meet on the street
  const NPC_PAIR_TALKS = [
    ['สวัสดี ไปไหนมาเหรอ', 'ไปตลาดมา ได้ผลไม้สด ๆ', 'ดีจัง ไว้ไปด้วยกันนะ'],
    ['เดินออกกำลังทุกวันเลยเหรอ', 'ทุกเย็น ช่วยให้นอนหลับดี', 'ต้องลองบ้างแล้ว'],
    ['ร้านกาแฟริมสะพานเปิดยัง', 'เปิดแล้ว คิวไม่ยาวด้วย', 'งั้นไปกันเลย'],
    ['ฝนจะตกไหมเนี่ย', 'ฟ้าครึ้มแล้ว รีบกลับดีกว่า', 'เดินด้วยกันไปถึงหัวมุมนะ'],
    ['เห็นออฟฟิศริมน้ำนี่ยัง', 'เห็น มีสระว่ายน้ำด้วย', 'อยากทำงานแบบนั้นบ้าง'],
    ['ลูกสอบเป็นไงบ้าง', 'ผ่านแล้ว ดีใจมาก', 'ยินดีด้วยนะ'],
    ['หมาน่ารักจัง ชื่ออะไร', 'ชื่อโมจิ ชอบคนมาก', 'ขอลูบหัวหน่อยได้ไหม', 'ได้เลย เชื่องมาก'],
    ['วิ่งเร็วขึ้นเยอะเลยนะ', 'ซ้อมทุกเช้า', 'เดือนหน้าไปงานวิ่งด้วยกัน'],
    ['ร้านอาหารใหม่หัวมุมอร่อยไหม', 'อร่อย ราคาไม่แรง', 'เย็นนี้ลองไปดีกว่า'],
    ['ซื้อดอกไม้ให้ใครเหรอ', 'วันเกิดแม่', 'น่ารักจัง แม่ต้องชอบแน่'],
    ['ช่วงนี้รถติดไหม', 'เช้าติดมาก บ่ายโล่ง', 'งั้นออกบ้านสายหน่อย'],
    ['เห็นเฮลิคอปเตอร์บินผ่านไหม', 'เห็น บินชมเมืองแน่เลย', 'เท่มาก อยากลองบ้าง'],
    ['ตลาดนัดเย็นนี้มีไหม', 'มี เปิดถึงสามทุ่ม', 'ไปหาของกินกัน'],
    ['ปั่นจักรยานไปทำงานเหรอ', 'ใช่ ไม่ต้องหาที่จอดรถ', 'สุขภาพดีด้วย'],
    ['ไอศกรีมรถนี้อร่อยมาก', 'รสไหนดี', 'กะทิ ห้ามพลาด'],
    ['ลอยกระทงปีนี้ไปไหน', 'ริมบึงนี้แหละ', 'ไปด้วยกันนะ'],
    ['ไปเที่ยวไหนมา ผิวแทนเลย', 'ทะเลมา สามวัน', 'อิจฉาจัง'],
    ['มินิมาร์ทลดราคาอยู่นะ', 'ลดอะไรบ้าง', 'น้ำดื่มกับขนม', 'เดี๋ยวแวะดู'],
    ['เดินข้ามสะพานไหวไหม', 'ไหว ชันนิดเดียว', 'วิวบนนั้นสวยมาก'],
    ['เรือรอบหน้าออกกี่โมง', 'อีกสิบห้านาที', 'งั้นนั่งรอที่ม้านั่งกัน'],
    ['ส่งของแถวนี้ทุกวันเลยเหรอ', 'ทุกวัน คนสั่งเยอะ', 'เหนื่อยหน่อยแต่สนุก'],
    ['เห็นแมวส้มตัวนั้นไหม', 'เห็น มันมานอนหน้าร้านทุกวัน', 'เจ้าของร้านใจดีมาก']
  ];
  NPC_LIST.push(
    ['ขอโทษนะ ส่งของให้ตึกนี้ เข้าทางไหน', 'ทางประตูหน้า มีคนรับที่โต๊ะ', 'ขอบคุณมาก ไปก่อนนะ'],
    ['ขอโทษนะ ร้านดอกไม้ยังเปิดอยู่ไหม', 'เปิดถึงหนึ่งทุ่ม', 'ทันพอดี ขอบคุณ'],
    ['ทำงานที่นี่มีจักรยานให้ยืมด้วยเหรอ', 'มี ปั่นรอบบึงได้', 'น่าอิจฉามาก'],
    ['ขอโทษนะ เรือเที่ยวบึงนั่งได้ไหม', 'ได้ ไปที่ท่าเรือเลย', 'เดี๋ยวพาลูกไปนั่ง', 'สนุกแน่นอน'],
    ['ทำงานที่นี่ใช้ AI ด้วยไหม', 'ใช้ แต่คนตรวจทุกอย่าง', 'ดีจัง ไวแต่ไม่พลาด'],
    ['ขอโทษนะ รถไอศกรีมมาแถวนี้ทุกวันไหม', 'เกือบทุกวัน ช่วงบ่าย', 'พรุ่งนี้มาดักรอ'],
    ['ทำงานกันกี่คนเหรอ', 'สิบคน หลายตำแหน่ง', 'ทีมกำลังดีเลย'],
    ['ขอโทษนะ พาหมาเข้าไปเดินในสวนได้ไหม', 'ได้ แค่ใส่สายจูงนะ', 'ขอบคุณ เดี๋ยวเก็บมูลให้เรียบร้อย'],
    ['ขอโทษนะ แถวนี้มีที่ชาร์จรถไฟฟ้าไหม', 'มีที่ลานจอดฝั่งโน้น', 'ช่วยได้เยอะเลย']
  );
  // thoughts ("คำนึก"): what someone thinks, shown in a cloud, never said out loud
  const THINK = {
    staff: ['ข้าวเที่ยงกินอะไรดีน้า', 'เมื่อกี้ save ไฟล์ยังนะ', 'ลืมตอบแชตแม่หรือเปล่า', 'อยากกินชาไข่มุกจัง', 'ทำไมเพลงนี้ติดหู',
      'เย็นนี้ดูซีรีส์ตอนต่อดีกว่า', 'อีกนิดเดียว อดทนไว้', 'เดี๋ยวพักแล้วไปยืดเส้นดีกว่า', 'วันศุกร์มาเร็ว ๆ ที', 'อยากไปทะเลจัง',
      'ค่าไฟเดือนนี้จะเท่าไหร่น้า', 'แมวที่บ้านกินข้าวยังนะ', 'เมื่อเช้าล็อกประตูบ้านยังนะ', 'พรุ่งนี้ต้องตื่นกี่โมงนะ',
      'ไอเดียนี้ดีนะ จดไว้ก่อน', 'อยากได้หูฟังใหม่', 'ลืมดื่มน้ำอีกแล้ว', 'ทำไมง่วงจัง นอนตั้งแปดชั่วโมง', 'วันหยุดจะไปไหนดีน้า',
      'เมื่อวานพูดอะไรแปลก ๆ ไปหรือเปล่า'],
    role: {
      dev: ['ถ้าเทสต์นี้ผ่าน ขอกาแฟรางวัล', 'ตัวแปรนี้ตั้งชื่อว่าอะไรดี', 'CI อย่าแดงนะ ขอร้อง', 'โค้ดใครเขียนเนี่ย อ้าว ของเราเอง'],
      po: ['อันไหนสำคัญกว่ากันนะ', 'ผู้ใช้จะชอบไหมน้า', 'ตัดอะไรออกได้อีก'],
      ba: ['ถ้าผู้ใช้กดย้อนกลับล่ะ', 'กฎข้อนี้มีข้อยกเว้นไหมนะ', 'flow นี้ยังขาดอะไรอยู่'],
      tl: ['โค้ดนี้อีกปียังอ่านรู้เรื่องไหม', 'merge ก่อนเที่ยงทันไหมน้า', 'ตรงนี้เสี่ยงหรือเปล่า'],
      qal: ['AC ข้อไหนยังไม่มีเทสต์', 'รอบนี้จะครบสิบใบเมื่อไหร่', 'เคสนี้ซ้ำไหมนะ'],
      qa: ['ถ้ากดสองครั้งจะเป็นไงนะ', 'จอเล็กจะล้นไหมเนี่ย', 'อันนี้ bug หรือตั้งใจให้เป็นแบบนี้นะ'],
      head: ['ค่าใช้จ่ายด้าน AI วันนี้โอเคไหม', 'ทุกคนไหวไหมนะ', 'เย็นนี้เลี้ยงอะไรทีมดี']
    },
    state: {
      blocked: ['ติดตรงไหนกันแน่นะ', 'ลองอีกทางดีไหม', 'ใครพอช่วยได้บ้างนะ'],
      waiting: ['เจ้าของจะว่ายังไงนะ', 'ลุ้นจัง ผ่านไหมน้า', 'เตรียมคำตอบไว้ครบยัง'],
      idle: ['พักแป๊บเดียวพอ', 'กาแฟหรือมัทฉะดีน้า', 'ไปว่ายน้ำสักรอบดีไหม'],
      sweeping: ['มุมไหนยังไม่มีใครดูนะ', 'ใบนี้ซ้ำของเก่าหรือเปล่า'],
      focus: ['อย่าเพิ่งมีใครทักนะ', 'อีกนิดเดียว ใกล้แล้ว']
    },
    time: {
      morning: ['ตื่นยังไม่เต็มตาเลย', 'กาแฟแก้วแรกอยู่ไหน'], lunch: ['ข้าวเที่ยงวันนี้เอาอะไรดี', 'คิวร้านข้าวจะยาวไหม'],
      slump: ['ตาจะปิดแล้ว', 'ขอกาแฟอีกแก้วได้ไหมนะ'], evening: ['รถจะติดไหมเย็นนี้', 'เย็นนี้กินอะไรดี'],
      night: ['ควรกลับบ้านได้แล้วมั้ง', 'นอนดึกอีกแล้วเรา'], latenight: ['ทำไมยังไม่ง่วงเลย', 'พรุ่งนี้ตื่นไหวไหมเนี่ย']
    },
    weather: {
      rain: ['ฝนจะตกไหมเนี่ย ลืมเอาร่มมา', 'ฝนแบบนี้กลับบ้านยังไงดี'], clear: ['ร้อนจัง อยากลงสระ', 'แดดแรงขนาดนี้ ไม่ออกไปแล้ว'],
      snow: ['หิมะตกจริงเหรอเนี่ย', 'มือเย็นเฉียบเลย'], autumn: ['ใบไม้สีสวยจัง', 'อากาศแบบนี้อยากไปเกาหลี']
    },
    npc: ['ลืมปิดไฟที่บ้านหรือเปล่านะ', 'ออฟฟิศนี้ทำงานอะไรกันนะ', 'เย็นนี้กินอะไรดีน้า', 'อยากมีสระแบบนั้นบ้าง', 'เดินอีกนิดก็ถึงแล้ว',
      'ร้านกาแฟคิวยาวไหมน้า', 'ลืมซื้อไข่อีกแล้ว', 'เมื่อกี้ทักผิดคนหรือเปล่า', 'วันนี้เดินได้กี่ก้าวแล้วนะ', 'พรุ่งนี้วันหยุดแล้ว เย้'],
    npcType: {
      walker: ['เดินทางนี้ถูกไหมนะ', 'ซื้อดอกไม้ไปฝากใครดี'], jogger: ['เหนื่อยแล้ว แต่ห้ามหยุด', 'อีกนิดถึงต้นไม้ต้นนั้น'],
      cyclist: ['ขาเริ่มล้าแล้ว', 'ทางลงเนินมาแล้ว เย้'], rider: ['ลูกค้ารอนานหรือยังนะ', 'ออร์เดอร์ถัดไปอยู่ไกลไหม'],
      dogwalker: ['เจ้าตัวเล็กหิวหรือยังนะ', 'เก็บถุงมาพอไหมเนี่ย'], family: ['ลูกจะงอแงไหมวันนี้', 'ซื้อไอศกรีมให้ดีไหมน้า'],
      tourist: ['ทางนี้ถูกหรือเปล่านะ', 'รูปนี้ลงโซเชียลได้เลย'], boatman: ['ลมจะแรงขึ้นไหมนะ', 'รอบนี้ผู้โดยสารเยอะดี'],
      passenger: ['เรือจะคว่ำไหมเนี่ย', 'วิวสวยจนลืมถ่ายรูป'], driver: ['ไฟเขียวเร็ว ๆ หน่อย', 'ลืมซื้อของเข้าบ้าน'],
      police: ['ทุกอย่างเรียบร้อยดี', 'วันนี้ไม่มีอุบัติเหตุ ดีมาก'], ambulance: ['ขอให้ทันนะ', 'ทุกคนหลบทางให้ ใจดีจัง'],
      icecream: ['วันนี้ขายหมดแน่', 'รสไหนจะหมดก่อนนะ'], parcel: ['กล่องนี้ข้างในคืออะไรนะ', 'อีกกี่บ้านจะหมดรถ']
    }
  };
  const DLG_NPC_SETS = [['npcs', null], ['cyclists', 'cyclist'], ['cars', 'driver'], ['boats', 'boatman'], ['riders', 'rider'], ['dogs', 'dogwalker'], ['vans', 'parcel']];
  function dlgNpcType(n) { return n && NPC_LINES[n.type] ? n.type : n && NPC_LINES[n._dlgType] ? n._dlgType : n && n.run ? 'jogger' : 'walker'; }
  const dlgIsNpc = x => !!x && !x.role;
  const dlgNpcOf = x => (x && x.npc) || x;
  // one line for a passer-by: its own kind first, then the moment (time of day or weather)
  function npcLineFor(x) {
    const n = dlgNpcOf(x), avoid = t => dlgRecent(n, t);
    const own = NPC_LINES[dlgNpcType(n)], ctx = Math.random() < .5 ? NPC_CTX[dlgSlot()] : NPC_CTX[weather];
    const tiers = [[own, .65], [ctx, .6], [NPC_LINES.walker, 1]];
    let t = null;
    for (const [pool, chance] of tiers) if (pool && Math.random() < chance && (t = dlgDraw(pool, avoid))) break;
    if (!t) for (const [pool] of tiers) if (pool && (t = dlgDraw(pool, avoid))) break;
    if (!t) t = dlgDraw(own);
    dlgKeep(n, t);
    return t;
  }
  function npcPairLines(a, b) {
    const na = dlgNpcOf(a), nb = dlgNpcOf(b), key = ex => 'talk:' + ex[0];
    const ex = dlgDraw(NPC_PAIR_TALKS, e => dlgRecent(na, key(e)) || dlgRecent(nb, key(e))) || dlgDraw(NPC_PAIR_TALKS);
    dlgKeep(na, key(ex)); dlgKeep(nb, key(ex));
    return ex;
  }
  // one inner thought for a person or a passer-by, by context
  function thinkFor(x) {
    const npc = dlgIsNpc(x), who = npc ? dlgNpcOf(x) : x.id, avoid = t => dlgRecent(who, 'think:' + t);
    const tiers = [];
    const add = (pool, chance) => { if (pool && pool.length) tiers[tiers.length] = [pool, chance]; };
    if (npc) add(THINK.npcType[dlgNpcType(dlgNpcOf(x))], .5);
    else { add(THINK.state[x._room === 'ห้องสมาธิ' ? 'focus' : x.state], .5); add(THINK.role[x.role], .4); }
    add(THINK.weather[weather], .25);
    add(THINK.time[dlgSlot()], .25);
    add(npc ? THINK.npc : THINK.staff, 1);
    let t = null;
    for (const [pool, chance] of tiers) if (Math.random() < chance && (t = dlgDraw(pool, avoid))) break;
    if (!t) for (const [pool] of tiers) if ((t = dlgDraw(pool, avoid))) break;
    if (!t) t = dlgDraw(npc ? THINK.npc : THINK.staff);
    dlgKeep(who, 'think:' + t);
    return t;
  }
  // a cloud-style thought bubble (class .thought); a person is anchored by id, a passer-by, a car or a bike by its object
  function think(x, text) {
    if (!three.ok || !x) return;
    const line = text || thinkFor(x);
    if (!isFlavourSafe(line) || !bubbleRoom(0)) return;
    const box = document.getElementById('bubbles'); if (!box) return;
    const npc = dlgIsNpc(x), n = dlgNpcOf(x), obj = npc ? (n.f || n.g || (n.isObject3D ? n : null)) : null;
    if (npc && !obj) return;
    if (!npc) [...box.children].forEach(c => { if (c.dataset.tid === String(x.id)) c.remove(); });
    const b = document.createElement('div'); b.className = 'thought'; if (!npc) b.dataset.tid = x.id;
    b.textContent = line; box.appendChild(b);
    const anchor = npc ? { el: b, obj, y: 2.75 } : { el: b, pid: x.id, y: 2.75 }; three.bubbles[three.bubbles.length] = anchor;
    if (hasGsap) gsap.from(b, { scale: .6, opacity: 0, duration: .35, ease: 'back.out(2)', clearProps: 'opacity,transform' });
    setTimeout(() => { b.remove(); three.bubbles = three.bubbles.filter(a => a !== anchor); }, 4200);
  }
  // passers-by speak and think on their own, two who meet on the street chat, and staff now and then think
  const dlgNpcRefs = new WeakMap();
  const dlgNpcRef = n => { let r = dlgNpcRefs.get(n); if (!r) { r = { npc: n }; dlgNpcRefs.set(n, r); } return r; };
  function dlgAmbient() {
    if (!three.ok || document.hidden) return;
    const all = [];
    DLG_NPC_SETS.forEach(([k, def]) => (three[k] || []).forEach(n => { if (n && (n.f || n.g)) { if (def && !NPC_LINES[n.type]) n._dlgType = def; all[all.length] = n; } }));
    if (all.length && Math.random() < .6) {
      const n = all[Math.floor(Math.random() * all.length)];
      if (!busyTalking(dlgNpcRef(n))) { if (Math.random() < .3) think(n); else sayObj(n.f || n.g, npcLineFor(n)); }
    }
    const walkers = (three.npcs || []).filter(n => n.f && !(n.pause > performance.now()) && !busyTalking(dlgNpcRef(n)));
    if (Math.random() < .5) for (let i = 0; i < walkers.length; i++) for (let j = i + 1; j < walkers.length; j++) {
      const a = walkers[i], b = walkers[j], pa = a.f.getWorldPosition(new THREE.Vector3()), pb = b.f.getWorldPosition(new THREE.Vector3());
      if (pa.distanceTo(pb) > 2.5) continue;
      const lines = npcPairLines(a, b), hold = performance.now() + lines.length * 1900 + 1500;
      a.pause = hold; b.pause = hold; a.face = { x: pb.x, z: pb.z }; b.face = { x: pa.x, z: pa.z };
      converse(dlgNpcRef(a), dlgNpcRef(b), lines);
      return;
    }
    if (people.length && Math.random() < .35) { const p = people[Math.floor(Math.random() * people.length)]; if (!busyTalking(p)) think(p); }
  }
  setInterval(dlgAmbient, 6500);
  // ---------- cooking, step by step ----------
  const DISHES = [
    { th: 'ผัดกะเพราไข่ดาว', top: 0x6b3a22, egg: true, lines: ['หยิบหมูสับ ใบกะเพรา พริกกระเทียม', 'สับกระเทียมพริก หอมแล้ว', 'ไฟแรง ๆ ผัดให้หอม', 'ไข่ดาวกรอบ ๆ จัดจาน'] },
    { th: 'ต้มยำกุ้ง', top: 0xd9622b, egg: false, lines: ['หยิบกุ้ง ตะไคร้ ข่า ใบมะกรูด', 'หั่นตะไคร้ ทุบพริก', 'ต้มน้ำซุปให้เดือด ใส่กุ้ง', 'บีบมะนาว ตักใส่ชาม'] },
    { th: 'ข้าวผัดปู', top: 0xe8b84a, egg: false, lines: ['หยิบข้าว ไข่ เนื้อปู', 'ซอยต้นหอม หั่นมะนาว', 'ผัดข้าวกับไข่ให้ร่วน', 'โรยต้นหอม จัดจาน'] },
    { th: 'แพนเค้กฮันนี่', top: 0xc98a3c, egg: false, lines: ['หยิบแป้ง ไข่ นม เนย', 'ตีแป้งให้เนียน', 'ทอดในกระทะไฟอ่อน', 'ราดน้ำผึ้ง เสิร์ฟ'] }
  ];
  let cooking = null;
  function sizzle(sec) {
    if (!audio.on) return;
    const c = audio.ctx, n = Math.floor(c.sampleRate * sec), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (.6 + .4 * Math.sin(i / 900));
    const src = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain(); src.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = 5200; bp.Q.value = .7;
    g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(.05, c.currentTime + .3); g.gain.linearRampToValueAtTime(0, c.currentTime + sec);
    src.connect(bp); bp.connect(g); g.connect(audio.master); src.start();
  }
  function cookDish(dish) {
    const K3 = three.kitchen, who = actorFor(); if (!K3 || !who) return;
    if (cooking) { toast([['กำลังทำ ', false], [cooking.th, true], [' อยู่ รอเสร็จก่อนนะ', false]]); return; }
    if (!useStock('food', K3.settings.length, who)) return;
    const d = dish || DISHES[Math.floor(Math.random() * DISHES.length)];
    cooking = d;
    const steps = [[K3.fridge, 'หยิบวัตถุดิบจากตู้เย็น'], [K3.island, 'เตรียมวัตถุดิบ'], [K3.hob, 'ทำบนเตา'], [K3.island, 'จัดจาน']];
    const STEP_MS = 9000;
    steps.forEach(([obj, label], k) => setTimeout(() => {
      who.act = { k: 'ix', ix: obj.userData.ix, a: 0, until: Date.now() + STEP_MS + 2000 }; render(false);
      say(who, d.lines[k]); babble(who.role);
      toast([['🍳 ' + d.th + ' ', true], [`${k + 1}/4 · ${label}`, false]]);
      if (k === 2) { useWater('เตาและเครื่องดูดควัน');
        K3.burners.forEach(b => { b.material.emissiveIntensity = .9; });
        three.steam.until = performance.now() + STEP_MS; sizzle(STEP_MS / 1000);
        setTimeout(() => K3.burners.forEach(b => { b.material.emissiveIntensity = 0; }), STEP_MS);
      }
    }, k * STEP_MS));
    setTimeout(() => {
      K3.settings.forEach(pl => { pl.visible = true; }); useWater('เครื่องล้างจาน');
      K3.food.forEach(f => { f.top.material = std(d.top, { roughness: .7 }); f.egg.visible = d.egg; f.egg.children.forEach(c => { c.visible = d.egg; }); f.fg.visible = true; });
      who.act = null; cooking = null;
      say(who, d.th + ' เสร็จแล้ว มากินข้าวกัน!'); sfx.pop();
      toast([['อาหารพร้อม ', true], [d.th + ' · เรียกทุกคนมากินข้าวแล้ว', false]]);
      const eat = IX[K3.dining.userData.ix].acts[1]; if (eat && eat.fx) eat.fx();
      setTimeout(() => { K3.food.forEach(f => { f.fg.visible = false; }); K3.settings.forEach(pl => { pl.visible = false; }); }, ACT_MS);
    }, steps.length * STEP_MS);
  }
  // ---------- conversations: colleagues talk to each other, and staff talk with passers-by ----------
  let talking = new Set();
  const figPos = p => { const f = three.figures.get(p.id); return f ? f.getWorldPosition(new THREE.Vector3()) : null; };
  const busyTalking = x => talking.has(x);
  function speak(who, text) { CHARS.speaking(who); if (who.npc) { sayObj(who.npc.f, text); babble('ba'); } else { say(who, text); babble(who.role); } }
  function converse(a, b, lines) {
    if (busyTalking(a) || busyTalking(b)) return false;
    talking.add(a); talking.add(b); CHARS.chat(a, b, lines.length * 1900 + 1500);
    lines.forEach((t, k) => setTimeout(() => speak(k % 2 ? b : a, t), k * 1900));
    setTimeout(() => { talking.delete(a); talking.delete(b); }, lines.length * 1900 + 1500);
    return true;
  }
  // walk a person to stand beside a target, then call back once they arrive
  function walkBeside(p, target, room, label, then) {
    const me = figPos(p); if (!me) return;
    const dx = me.x - target.x, dz = me.z - target.z, d = Math.hypot(dx, dz) || 1;
    const spot = { x: target.x + dx / d * .95, y: target.z + dz / d * .95, dy: 0, pose: 'stand', look: { x: target.x, y: target.z }, room, act: label };
    p.act = { k: 'spot', spot, until: Date.now() + ACT_MS }; render(false);
    const t0 = Date.now(), iv = setInterval(() => {
      const f = three.figures.get(p.id), here = figPos(p);
      if (f && !f.userData.walk && here && Math.hypot(here.x - spot.x, here.z - spot.y) < .6) { clearInterval(iv); then(); }
      else if (Date.now() - t0 > 40000) clearInterval(iv);
    }, 400);
  }
  function chatWithColleague(p) {
    const me = figPos(p); if (!me) return;
    const others = people.filter(x => x !== p && x._room !== 'ห้องสมาธิ' && !busyTalking(x)).map(x => ({ x, at: figPos(x) })).filter(o => o.at);
    if (!others.length) { toast([['ตอนนี้ทุกคนกำลังทำงาน ยังคุยไม่ได้', false]]); return; }
    others.sort((u, v) => u.at.distanceTo(me) - v.at.distanceTo(me));
    const o = others[0];
    toast([[labelOf(p), true], [' เดินไปคุยกับ ' + labelOf(o.x), false]]);
    walkBeside(p, o.at, o.x._room || 'ออฟฟิศ', 'คุยกับ ' + labelOf(o.x), () => converse(p, o.x, linesFor(p, o.x)));
  }
  function nearestNpc(at) {
    let best = null, bd = 1e9; (three.npcs || []).forEach(n => { const wp = n.f.getWorldPosition(new THREE.Vector3()), d = wp.distanceTo(at); if (d < bd) { bd = d; best = n; } });
    return best;
  }
  function chatWithNpc(p, n) {
    const me = figPos(p); if (!me) return;
    n = n || nearestNpc(me); if (!n) return;
    const at = n.f.getWorldPosition(new THREE.Vector3());
    n.pause = performance.now() + 60000; n.face = { x: me.x, z: me.z };
    toast([[labelOf(p), true], [' ออกไปทักคนเดินผ่าน', false]]);
    walkBeside(p, at, 'หน้าออฟฟิศ', 'คุยกับคนเดินผ่าน', () => {
      const here = figPos(p); if (here) n.face = { x: here.x, z: here.z };
      const lines = NPC_TALKS[Math.floor(Math.random() * NPC_TALKS.length)], who = { npc: n };
      const first = lines[0].startsWith('ขอโทษ') || lines[0].startsWith('ทำงาน') ? [who, p] : [p, who];
      converse(first[0], first[1], lines);
      n.pause = performance.now() + lines.length * 1900 + 2500;
      setTimeout(() => { if (p.act && p.act.k === 'spot') { p.act = null; render(false); } }, lines.length * 1900 + 3000);
    });
  }
  // on their own: colleagues near each other strike up a chat, and a passer-by greets staff who are outside
  function autoTalk() {
    if (!three.ok || document.hidden) return;
    const pos = people.map(p => ({ p, at: figPos(p) })).filter(o => o.at && !busyTalking(o.p) && o.p._room !== 'ห้องสมาธิ' && !(three.figures.get(o.p.id) || {}).userData?.walk);
    const pairs = [];
    pos.forEach((u, i) => pos.slice(i + 1).forEach(v => { const d = u.at.distanceTo(v.at); if (d < 3.2) pairs.push([u.p, v.p, d]); }));
    if (pairs.length && Math.random() < .7) { const [a, b] = pairs[Math.floor(Math.random() * pairs.length)]; converse(a, b, linesFor(a, b)); }
    pos.forEach(o => { if (o.at.z < 12 * K + .5) return; const n = nearestNpc(o.at); if (!n) return; const wp = n.f.getWorldPosition(new THREE.Vector3()); if (wp.distanceTo(o.at) < 4 && !busyTalking(o.p) && Math.random() < .5) { n.pause = performance.now() + 8000; n.face = { x: o.at.x, z: o.at.z }; converse({ npc: n }, o.p, NPC_TALKS[Math.floor(Math.random() * NPC_TALKS.length)]); } });
  }
  setInterval(autoTalk, 9000);
  const keysDown = new Set();
  const MOVE_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'q', 'Q', 'e', 'E'];
  window.addEventListener('keydown', e => {
    const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (typing || !three.ok) return;
    if (e.key === 'Shift') { keysDown.add('Shift'); return; }
    if (!MOVE_KEYS.includes(e.key)) return;
    const r = document.getElementById('stage').getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
    keysDown.add(e.key); e.preventDefault();
  });
  window.addEventListener('keyup', e => { keysDown.delete(e.key); if (e.key.length === 1) { keysDown.delete(e.key.toLowerCase()); keysDown.delete(e.key.toUpperCase()); } });
  window.addEventListener('blur', () => keysDown.clear());
  // full screen: the browser's own full screen when allowed, otherwise the stage fills the window; Esc leaves both
  const stageEl = document.getElementById('stage'), fullBtn = document.getElementById('fullBtn');
  function setFull(on) {
    stageEl.classList.toggle('full', on); fullBtn.setAttribute('aria-pressed', String(on)); fullBtn.textContent = on ? '✕ ออกจากเต็มจอ' : '⛶ เต็มจอ';
    document.body.style.overflow = on ? 'hidden' : ''; drawHud();
  }
  function drawHud() {
    if (!stageEl.classList.contains('full')) return;
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('hudClock', document.getElementById('clock').textContent);
    const c = { working: 0, sweeping: 0, waiting: 0, blocked: 0, idle: 0 }; people.forEach(p => { c[p.state]++; }); set('hudTeam', live.state ? `ทำงาน ${c.working + c.sweeping} · รอ ${c.waiting} · ติด ${c.blocked} · พัก ${c.idle}` : ''); putSrc(document.getElementById('hudTeam'), live.state ? boardLines(live.state).hudTeam : null);
  }
  setInterval(drawHud, 1000);
  fullBtn.addEventListener('click', async () => {
    const on = !stageEl.classList.contains('full');
    if (on) { setFull(true); try { if (stageEl.requestFullscreen) await stageEl.requestFullscreen(); } catch { /* the frame may not allow it; the fixed stage still fills the window */ } }
    else { setFull(false); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
  });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && stageEl.classList.contains('full')) setFull(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && stageEl.classList.contains('full') && !document.fullscreenElement) setFull(false); });
  if (/[?&]test/.test(location.search)) window.__ao = { wallClash: () => wallClash(), batch: () => batchInfo(), ixNames: () => IX.map(x => x.name), ready: () => three.assetsReady !== false, envK: k => { ENV_SKY_K = k; applyScene(); return !!three.envSky; }, projector: on => { if (three.proj) three.proj.force = on === undefined ? null : !!on; return three.proj && { on: three.proj.on, k: +three.proj.k.toFixed(2) }; }, lockQuality: on => { if (three.post) three.post.locked = !!on; }, passes: o => { const P = three.post; if (!P) return; ['gtao', 'bloom', 'grade', 'smaa'].forEach(k => { if (o && k in o) P[k].enabled = !!o[k]; }); }, quality: () => three.post ? { level: three.post.level, calls: three.renderer.info.render.calls, tris: three.renderer.info.render.triangles, casters: (() => { let n = 0, m = 0; const small = { '.05': 0, '.08': 0, '.12': 0 }; three.scene.traverseVisible(o => { if (!o.isMesh) return; m++; if (!o.castShadow) return; n++; if (o.isInstancedMesh) return; const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); const r = g.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis(); Object.keys(small).forEach(k => { if (r < +k) small[k]++; }); }); return { casters: n, meshes: m, smallerThan: small }; })(), steps: perfWin.log.slice(), pixelRatio: three.renderer.getPixelRatio(), canvas: [three.renderer.domElement.width, three.renderer.domElement.height], css: [three.renderer.domElement.clientWidth, three.renderer.domElement.clientHeight], aniso: MAX_ANISO, shadow: three.sun.shadow.mapSize.x, gtao: three.post.gtao.enabled, bloom: three.post.bloom.enabled, env: three.scene.environmentIntensity } : null, cookDish, chatWithNpc, chatWithColleague, get three() { return three; }, navPath, NAV, get people() { return people; }, ...useHooks() }; // ?test exposes hooks for browser checks only
  function say(p, text, fact) {
    if (!three.ok || !p) return;
    const line = text || lineFor(p);
    if (!fact && !isFlavourSafe(line)) return;
    const box = document.getElementById('bubbles'); if (!box) return;
    [...box.children].forEach(c => { if (c.dataset.pid === String(p.id)) c.remove(); });
    if (!bubbleRoom(text ? 2 : 0)) return;
    const b = document.createElement('div'); b.className = 'bubble'; b.dataset.pid = p.id; b.textContent = line;
    box.appendChild(b);
    const anchor = { el: b, pid: p.id, y: 2.35 }; three.bubbles.push(anchor);
    // v59: the anchor offset stays a percentage of the bubble during the entry; GSAP otherwise holds translate(-50%, -100%)
    // as the one-line size in px, so a bubble the layout then places near an edge wraps and hangs ~100 px below its anchor
    // for the 0.3 s of the tween, over the bubble laid out below it (bubbles.cjs, 390 px; tools/bubble-entry.cjs)
    if (hasGsap) { gsap.set(b, { x: 0, y: 0, xPercent: -50, yPercent: -100 }); gsap.from(b, { scale: .6, opacity: 0, duration: .3, ease: 'back.out(2)', clearProps: 'opacity,transform' }); }
    setTimeout(() => { b.remove(); three.bubbles = three.bubbles.filter(x => x !== anchor); }, 4200);
  }

  // ---------- command wheel: tap a person, pick what they do (owner, 14 Oct 2026, like The Sims 4) ----------
  const pie = document.getElementById('pie'); let pieReturn = null;
  function screenOf(pid) {
    const f = three.figures.get(pid); if (!f || !three.ok) return null;
    const st = document.getElementById('stage'), v = new THREE.Vector3().copy(f.position); v.y += 1.1; v.project(three.camera);
    return { x: (v.x + 1) / 2 * st.clientWidth, y: (1 - v.y) / 2 * st.clientHeight };
  }
  function closeMenu() { if (pie.hidden) return; pie.hidden = true; pie.innerHTML = ''; if (pieReturn && pieReturn.isConnected) pieReturn.focus(); pieReturn = null; }
  function openMenu(pid, returnFocus) {
    const p = people.find(x => x.id === pid); if (!p) return;
    closeMenu(); pieReturn = returnFocus || null; selectedPid = pid; babble(p.role);
    const st = document.getElementById('stage'), w = st.clientWidth, h = st.clientHeight, R = w < 560 ? 86 : 110;
    const c = screenOf(pid) || { x: w / 2, y: h / 2 };
    const clamp = (v, lo, hi) => lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
    c.x = clamp(c.x, R * 1.25 + 70, w - R * 1.25 - 70); c.y = clamp(c.y, R + 30, h - R - 30);
    pie.style.left = c.x + 'px'; pie.style.top = c.y + 'px';
    const opts = [];
    if (p.issue) opts.push(['ดูงาน ' + issueKey(p.issue), () => { closeMenu(); if (p.issue && p.issue.url) window.open(p.issue.url, '_blank', 'noopener'); }]);
    Object.entries(ACTS).forEach(([k, a]) => opts.push([a.th, () => { if (a.fx) a.fx(); p.act = { k, until: Date.now() + ACT_MS }; closeMenu(); render(false); babble(p.role); say(p); toast([[labelOf(p), true], [' ' + a.th, false]]); }]));
    opts.push(['ชวนเพื่อนคุย', () => { closeMenu(); chatWithColleague(p); }]);
    opts.push(['ออกไปทักคนเดินผ่าน', () => { closeMenu(); chatWithNpc(p); }]);
    if (p.act) opts.push(['กลับไปทำงาน', () => { p.act = null; closeMenu(); render(false); toast([[labelOf(p), true], [' กลับไปทำงาน', false]]); }]);
    const center = document.createElement('button'); center.type = 'button'; center.className = 'pie-center'; center.textContent = labelOf(p) + ' ✕';
    center.setAttribute('aria-label', 'ปิดเมนูของ ' + labelOf(p)); center.addEventListener('click', e => { e.stopPropagation(); closeMenu(); });
    pie.appendChild(center);
    opts.forEach(([t, fn], i) => {
      const a = -Math.PI / 2 + i / opts.length * Math.PI * 2, b = document.createElement('button');
      b.type = 'button'; b.className = 'pie-opt'; b.textContent = t; b.setAttribute('role', 'menuitem');
      b.style.left = (Math.cos(a) * R * 1.25).toFixed(1) + 'px'; b.style.top = (Math.sin(a) * R).toFixed(1) + 'px';
      b.addEventListener('click', e => { e.stopPropagation(); fn(); });
      pie.appendChild(b);
    });
    pie.setAttribute('role', 'menu'); pie.setAttribute('aria-label', 'สั่ง ' + labelOf(p));
    pie.hidden = false;
    const first = pie.querySelector('.pie-opt'); if (first) first.focus({ preventScroll: true });
    sfx.pop();
    if (hasGsap) gsap.from(pie.children, { scale: .5, opacity: 0, duration: .28, stagger: .025, ease: 'back.out(1.7)', clearProps: 'opacity,transform' });
  }
  function wheel(x, y, centerText, centerLabel, opts, R = 88) {
    closeMenu();
    const st = document.getElementById('stage'), w = st.clientWidth, h = st.clientHeight;
    const clamp = (v, lo, hi) => lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
    pie.style.left = clamp(x, R * 1.3 + 70, w - R * 1.3 - 70) + 'px'; pie.style.top = clamp(y, R + 30, h - R - 30) + 'px';
    const center = document.createElement('button'); center.type = 'button'; center.className = 'pie-center'; center.textContent = centerText;
    center.setAttribute('aria-label', centerLabel); center.addEventListener('click', e => { e.stopPropagation(); closeMenu(); }); pie.appendChild(center);
    opts.forEach(([t, fn, keep], k) => {
      const a = -Math.PI / 2 + k / opts.length * Math.PI * 2, b = document.createElement('button');
      b.type = 'button'; b.className = 'pie-opt'; b.setAttribute('role', 'menuitem'); b.textContent = t;
      b.style.left = (Math.cos(a) * R * 1.3).toFixed(1) + 'px'; b.style.top = (Math.sin(a) * R).toFixed(1) + 'px';
      b.addEventListener('click', e => { e.stopPropagation(); if (!keep) closeMenu(); fn(); });
      pie.appendChild(b);
    });
    pie.setAttribute('role', 'menu'); pie.setAttribute('aria-label', centerLabel); pie.hidden = false;
    const f = pie.querySelector('.pie-opt'); if (f) f.focus({ preventScroll: true });
    sfx.pop();
    if (hasGsap) gsap.from(pie.children, { scale: .5, opacity: 0, duration: .28, stagger: .025, ease: 'back.out(1.7)', clearProps: 'opacity,transform' });
  }
  function openObjectMenu(ixIdx, x, y) {
    const ix = IX[ixIdx], who = actorFor(); if (!ix || !who) return;
    const opts = ix.acts.map((a, k) => [a.th, () => {
      if (a.fx) a.fx(ix); if (a.how) useWater(ix.name);
      if (a.how) { who.act = { k: 'ix', ix: ixIdx, a: k, until: Date.now() + ACT_MS }; render(false); babble(who.role); say(who); toast([[labelOf(who), true], [' ' + a.th, false]]); }
      else toast([[ix.name + ' ', true], [a.done || a.th, false]]);
    }]);
    opts.push(['เปลี่ยนคน: ' + labelOf(who), () => { const i = people.indexOf(who); selectedPid = people[(i + 1) % people.length].id; openObjectMenu(ixIdx, x, y); }, true]);
    wheel(x, y, ix.name + ' ✕', 'ตัวเลือกของ ' + ix.name, opts);
  }

  // Lamp colours (owner, 14 Oct 2026, "เหมือนใน the sims 4 ที่กดที่โคมไฟ"): tap a lamp, pick a colour or switch it off.
  const LAMP_COLORS = [['ขาวอุ่น', 0xffd9a0], ['ขาวนวล', 0xfff4e0], ['ส้มอำพัน', 0xffa040], ['ชมพู', 0xff8fb0], ['ลาเวนเดอร์', 0xb9a3ff], ['ฟ้าเย็น', 0x9fd3ff]];
  function setLamp(i, color) {
    const l = three.lamps[i]; if (!l) return;
    if (color === null) { l.off = true; l.color = null; }
    else { l.off = false; l.color = color; l.bulb.material.emissive.copy(lin(color)); if (l.light) l.light.color.copy(lin(color)); }
    applyScene();
  }
  function openLampMenu(i, x, y) {
    closeMenu();
    const st = document.getElementById('stage'), w = st.clientWidth, h = st.clientHeight, R = 84;
    const clamp = (v, lo, hi) => lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
    pie.style.left = clamp(x, R + 60, w - R - 60) + 'px'; pie.style.top = clamp(y, R + 30, h - R - 30) + 'px';
    const center = document.createElement('button'); center.type = 'button'; center.className = 'pie-center'; center.textContent = 'โคมไฟ ✕';
    center.addEventListener('click', e => { e.stopPropagation(); closeMenu(); }); pie.appendChild(center);
    const opts = LAMP_COLORS.map(([t, c]) => [t, c]).concat([['ปิดไฟ', null]]);
    opts.forEach(([t, c], k) => {
      const a = -Math.PI / 2 + k / opts.length * Math.PI * 2, b = document.createElement('button');
      b.type = 'button'; b.className = 'pie-opt swatch-opt'; b.setAttribute('role', 'menuitem');
      b.innerHTML = '<i></i><span></span>'; b.querySelector('span').textContent = t;
      b.querySelector('i').style.background = c === null ? '#1f1d1c' : '#' + c.toString(16).padStart(6, '0');
      b.style.left = (Math.cos(a) * R * 1.3).toFixed(1) + 'px'; b.style.top = (Math.sin(a) * R).toFixed(1) + 'px';
      b.addEventListener('click', e => { e.stopPropagation(); sfx.click(); setLamp(i, c); closeMenu(); toast([['โคมไฟ ', false], [c === null ? 'ปิดแล้ว' : 'เป็นสี' + t, true]]); });
      pie.appendChild(b);
    });
    pie.setAttribute('role', 'menu'); pie.setAttribute('aria-label', 'เลือกสีโคมไฟ');
    pie.hidden = false; const f = pie.querySelector('.pie-opt'); if (f) f.focus({ preventScroll: true });
    sfx.pop();
    if (hasGsap) gsap.from(pie.children, { scale: .5, opacity: 0, duration: .28, stagger: .025, ease: 'back.out(1.7)', clearProps: 'opacity,transform' });
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  document.addEventListener('click', e => { if (!pie.hidden && !pie.contains(e.target) && !e.target.closest('.cmd') && !e.target.closest('.tag')) closeMenu(); });
  (() => {
    const cv = document.getElementById('scene3d'); let down = null, raf = 0, last = null;
    const hoverAt = () => {
      raf = 0; if (!three.ok || !last) return;
      const r = cv.getBoundingClientRect(), ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((last.x - r.left) / r.width * 2 - 1, -((last.y - r.top) / r.height) * 2 + 1), three.camera);
      const hit = ray.intersectObjects(three.people.children, true)[0];
      let o = hit && hit.object; while (o && o.userData.pid === undefined) o = o.parent;
      const pid = o ? o.userData.pid : null; if (pid === hoverPid) return;
      hoverPid = pid; cv.style.cursor = pid === null ? '' : 'pointer';
      document.querySelectorAll('#tags .tag').forEach(t => t.classList.toggle('show', Number(t.dataset.pid) === pid));
    };
    cv.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; last = { x: e.clientX, y: e.clientY }; if (!raf) raf = requestAnimationFrame(hoverAt); });
    cv.addEventListener('pointerleave', () => { last = null; hoverPid = null; cv.style.cursor = ''; document.querySelectorAll('#tags .tag.show').forEach(t => t.classList.remove('show')); });
    cv.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
    cv.addEventListener('pointerup', e => {
      if (!down || !three.ok) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
      if (moved > 6) return;
      const r = cv.getBoundingClientRect(), ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), three.camera);
      const hit = ray.intersectObjects(three.people.children, true)[0];
      let o = hit && hit.object; while (o && o.userData.pid === undefined) o = o.parent;
      if (o) { e.stopPropagation(); openMenu(o.userData.pid); return; }
      const lampHit = ray.intersectObjects(three.lamps.map(l => l.bulb), false)[0];
      if (lampHit) { e.stopPropagation(); openLampMenu(three.lamps.findIndex(l => l.bulb === lampHit.object), e.clientX - r.left, e.clientY - r.top); return; }
      const objHit = ray.intersectObjects(IX.map(x => x.obj), true)[0];
      let ob = objHit && objHit.object; while (ob && ob.userData.ix === undefined) ob = ob.parent;
      if (ob) { e.stopPropagation(); openObjectMenu(ob.userData.ix, e.clientX - r.left, e.clientY - r.top); return; }
      closeMenu();
    });
  })();

  // ---------- boot ----------
  const ok = init3D();
  if (ok) { collectSeats(); buildNav(); plantEmptyLand(); patchFoliage(); buildVehicles(); useBootLate(); staticBatch(); if (three.natWater) { initMirror(three.natWater, WATER_Y); sizeMirror(); } buildGround(); buildPools(); CHARS.boot(); }
  if (ok && /[?&]test/.test(location.search)) { const clash = wallClash(); if (clash.length) console.error('WALL CLASH', JSON.stringify(clash)); }
  if (!ok) { document.getElementById('fallback').hidden = false; document.querySelector('.stage-tools').hidden = true; }
  drawChoices(); render(true); applyScene(); tick();
  if (ok && /[?&]test/.test(location.search)) setTimeout(() => { const r = usageCycle(); USE.cycle = r; r.unused.forEach(n => console.error('UNUSED OBJECT', n)); console.info('USE CYCLE ' + JSON.stringify(Object.assign({}, r, { unused: r.unused.length }))); }, 0);
  function drawFx() {
    putCell('fxVal', viewOf(live.state, fx).fxVal);
    const w = document.getElementById('fxWhen'); if (w) w.textContent = fx ? 'ณ ' + fmtBangkok(fx.at).replace(/^[A-Za-z]+ /, '') : '';
  }
  async function refreshFx() {
    try {
      const r = await fetch('https://open.er-api.com/v6/latest/USD'); if (!r.ok) return;
      const j = await r.json(), rate = j && j.rates && Number(j.rates.THB);
      if (!(rate > 0)) return;
      fx = { rate, at: (j.time_last_update_unix || Date.now() / 1000) * 1000 }; drawFx(); drawMoney();
    } catch { /* offline or blocked: the rate card keeps "ยังอ่านอัตราไม่ได้" or the last rate with its own time */ }
  }
  drawFx(); refreshFx(); setInterval(refreshFx, 3600000);

  // ---------- live state (R10, R11, R21, R24, R45) ----------
  const tip = document.getElementById('srcTip'); let tipT = 0;
  document.addEventListener('click', e => { // R58: tap shows the source line at 1024 px and below
    const el = e.target && e.target.closest ? e.target.closest('[data-src]') : null;
    if (!el || !matchMedia('(max-width: 1024px)').matches) { if (!el) tip.hidden = true; return; }
    tip.textContent = el.dataset.src; tip.hidden = false; clearTimeout(tipT); tipT = setTimeout(() => { tip.hidden = true; }, 6000);
  });
  function drawLiveLines() {
    const off = document.getElementById('agentOff'); off.hidden = !live.state || live.state.agentEnabled === true;
    document.getElementById('fresh').textContent = live.state ? freshText(live.state.readAt, live.failed) : '';
  }
  const keyOfState = i => i.key || String(i.n);
  function onState(state) {
    const prev = live.state; live.state = state; live.failed = false;
    PROJECTS_LIVE = projectsOf(state);
    PROJECT_KEY = Object.fromEntries(PROJECTS_LIVE.map(p => [p.name, true]));
    issues = issuesOf(state);
    const rebuilt = applyPeople((state.people || []).filter(x => ROLES[x.role]));
    render(rebuilt); drawMoney(); drawFx(); drawLiveLines(); drawHud();
    const ev = workEvents(prev, state, slot => { const p = people.find(x => x.slot === slot); return p ? labelOf(p) : ''; }, keyOfState);
    ev.bubbles.forEach(b => { const p = people.find(x => x.slot === b.slot); if (p) setTimeout(() => say(p, b.text, true), 700); });
    ev.toasts.forEach((t, k) => setTimeout(() => toast(t), k * 4000));
  }
  function clearLive() { shownFund = null; live.state = null; live.failed = false; PROJECTS_LIVE = []; PROJECT_KEY = {}; issues = []; applyPeople([]); render(true); drawLiveLines(); }
  const signin = document.getElementById('signin'), signinBtn = document.getElementById('signinBtn'), signinMsg = document.getElementById('signinMsg');
  const ctl = startLive({
    onState,
    onFail: () => { live.failed = true; drawLiveLines(); },
    // R42: a pending, deactivated or unknown account gets 403; that is no permission, not a failed read
    onForbidden: () => { clearLive(); live.forbidden = true; signin.hidden = false; signinBtn.disabled = false; signinBtn.textContent = 'เข้าสู่ระบบด้วยบัญชีอื่น'; signinMsg.textContent = 'บัญชีนี้ไม่มีสิทธิ์ดูหน้านี้ ต้องเป็นบัญชีที่ใช้งานอยู่ (active) ใน Taskfolio'; },
    onSignedOut: () => { clearLive(); signin.hidden = false; signinBtn.disabled = false; signinBtn.textContent = 'เข้าสู่ระบบด้วย Google'; if (!live.forbidden) signinMsg.textContent = ''; },
    onSignedIn: () => { signin.hidden = true; },
    onConfigMissing: () => { signin.hidden = false; signinBtn.disabled = true; signinMsg.textContent = 'environment นี้ยังไม่ได้ตั้งค่าการเข้าสู่ระบบ'; }
  });
  signinBtn.addEventListener('click', async () => {
    const other = live.forbidden; live.forbidden = false; signinMsg.textContent = '';
    try { if (other) await ctl.signOut(); await ctl.signIn(); } catch { signinMsg.textContent = 'เข้าสู่ระบบไม่สำเร็จ ลองอีกครั้ง'; }
  });
  signin.hidden = false;

  // ---------- ambient life (R49a): the mock's 4 s step loop without its work, its breaks and its chatter ----------
  // An idle person changes idle spot and walks there, or takes a break at the least-used object of the map (pickUse,
  // as the mock's breakActivity), so every object gets its turn. Nobody's state, issue or money changes here (R49).
  setInterval(() => {
    if (!three.ok || document.hidden || !people.length) return;
    ambientStep(people, { now: Date.now(), rand: Math.random, pickUse, actMs: ACT_MS }).forEach(e => {
      if (e.kind !== 'break') return;
      const ix = IX[e.pick.ix], a = ix && ix.acts[e.pick.a]; if (!a) return;
      breakUse[ix.name] = (breakUse[ix.name] || 0) + 1;
      setTimeout(() => say(e.p, `ขอไป${a.th}ก่อนนะ`), 400); // as the mock's breakActivity, without its work reason
    });
    render(false);
  }, AMBIENT.stepMs);
  // someone says something every few seconds (mock); a line that would state a work fact is redrawn or dropped (R21)
  setInterval(() => {
    if (!three.ok || document.hidden) return;
    const p = pickSpeaker(people, Math.random); if (!p) return;
    const line = safeLine(() => lineFor(p)); if (line && bubbleRoom(0)) say(p, line); // the room the mock's say(p) had
  }, AMBIENT.chatMs);
  setInterval(tick, 30000);
  if (hasGsap) gsap.from('.stage', { opacity: 0, y: 10, duration: .7, ease: 'power2.out', clearProps: 'opacity,transform' });
})();
