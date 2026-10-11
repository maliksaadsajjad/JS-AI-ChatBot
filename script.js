/* ============================================
   PC Builder Chatbot
   Keyword + rule-based logic (no AI API)
   ============================================ */

// ----- Conversation state -----
function createState() {
  return {
    useCase: null,          // gaming | programming | editing | office | school | streaming
    budget: null,           // number in USD
    resolution: null,       // 1080p | 1440p | 4k
    budgetIsMinimum: false, // true when user said e.g. "1200+" / "$1200+"
    cpuBrand: null,         // AMD | Intel | null (any)
    gpuBrand: null,         // NVIDIA | AMD | null (any)
    brandsConfirmed: false, // whether the user answered the brand question
    awaiting: null,         // budget | brands | resolution | useCase | null
    awaitingPart: null,     // gpu | cpu — set when recommending a single part
    awaitingConfirm: null,  // buildAroundPart | anotherPart | makeCheaper | null
    lastSuggestedPart: null,// { kind, id, name }
    lockedGpuId: null,      // force this GPU into the next full build
    lockedCpuId: null,
    recentGpuIds: [],       // avoid repeating the same GPU suggestion
    recentCpuIds: [],
    lastBuild: null,        // last recommended build object
    selectedComponents: {}
  };
}

let state = createState();
let isBotBusy = false;
let currentSession = null;
let skipSessionLog = false; // true while restoring a saved chat
let emptySendStrikes = 0;
let sendLockedForEmpty = false;

const RECENT_STORAGE_KEY = "pcBuilderRecentChats";
const MAX_RECENT_CHATS = 8;
const MIN_USABLE_BUDGET = 101;   // 0–100 → too low
const IGPU_BUDGET_MAX = 399;     // 101–399 → iGPU only (no discrete GPU)
const MIN_4K_BUDGET = 1600;      // 4K gaming needs ~$1600+ (matches build engine floor)
const ABSURD_BUDGET = 20000;     // $20k+ → flagship part / dream rig
const MAX_BUDGET = 100000000;    // hard cap (e.g. $100M)

// ----- DOM refs -----
const chatWindow = document.getElementById("chatWindow");
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const suggestionBar = document.getElementById("suggestionBar");
const resetBtn = document.getElementById("resetBtn");
const prefsBtn = document.getElementById("prefsBtn");
const recentBtn = document.getElementById("recentBtn");
const recentPanel = document.getElementById("recentPanel");
const recentList = document.getElementById("recentList");
const clearRecentBtn = document.getElementById("clearRecentBtn");

const SUGGESTIONS = [
  "Build me a gaming PC",
  "I need a PC for programming",
  "Recommend a GPU",
  "Recommend a CPU",
  "Check compatibility",
  "Build within my budget"
];

const GREETING_REPLIES = [
  "Hey! Ready to build something? Tell me what kind of PC you need.",
  "Hello! I can help with parts, budgets, compatibility, or a full build. Where should we start?",
  "Hi there! Looking for a gaming rig, a work PC, or just part advice?",
  "Hey! Ask me about CPUs, GPUs, RAM, or say “build me a gaming PC” to get started.",
  "Hi! Budget, brands, or a full build — I’m game. What do you want to tackle?"
];

const CASUAL_GREETING_REPLIES = [
  "Yo! What’s the move — gaming rig, work PC, or just vibing with part questions?",
  "Wassup! Tell me a budget and I’ll cook up a build.",
  "Hey bro! CPUs, GPUs, full PCs — I got you. What are we building?",
  "Yo brodi! Ready when you are. Gaming PC? Upgrade? Spill it.",
  "Ayyy what’s good! Hit me with a use case or a dollar amount.",
  "Broooo — say the word and we’ll theorycraft a PC."
];

const INTRO_REPLIES = [
  "I’m PC Builder — a local browser chatbot that helps you pick PC parts, check compatibility, and put together complete builds. No cloud AI API — just rules, catalogs, and solid PC advice. What are you building?",
  "Name’s PC Builder. I help with CPUs, GPUs, RAM, motherboards, PSUs, budgets, and full rigs. Ask me to recommend parts, check if two parts fit, or build a PC around your budget.",
  "I’m a PC building assistant running right here in your browser. I can explain components, compare brands, check socket/RAM compatibility, and recommend a full build. Where should we start?",
  "Think of me as your local PC parts buddy. I remember your prefs in this chat, suggest builds by budget, and flag incompatibilities (like AMD CPUs on Intel sockets). What do you need?"
];

const HOW_ARE_YOU_REPLIES = [
  "Doing great — fans spun up and ready to talk PCs. What are we building?",
  "All good here! Want a part suggestion, a compatibility check, or a full build?",
  "Running smoothly, thanks for asking. Hit me with a budget, a CPU/GPU question, or “build me a gaming PC.”",
  "Can’t complain! I’m here for parts, budgets, and builds whenever you are."
];

const COMPONENT_INFO = {
  cpu: "A CPU (Central Processing Unit) is the brain of your PC. It runs your operating system, apps, games logic, and heavy productivity tasks. More cores/threads help with multitasking, editing, and streaming.",
  gpu: "A GPU (Graphics Processing Unit) handles graphics rendering. It is especially important for gaming, 3D applications, video editing, and other graphics-heavy workloads.",
  ram: "For a general-purpose PC, 16GB is a good starting point. 32GB is useful for heavier multitasking, editing, development, and some demanding games.",
  storage: "An SSD is strongly recommended because it provides much faster loading and boot times than a traditional HDD. NVMe SSDs are usually the best choice for your main drive.",
  ssd: "An SSD is strongly recommended because it provides much faster loading and boot times than a traditional HDD.",
  hdd: "An HDD is cheaper per GB and good for bulk storage (media archives), but it is much slower than an SSD for games and boot drives.",
  motherboard: "The motherboard connects all your parts. The most important rule is socket compatibility with your CPU, plus the correct RAM type (DDR4 or DDR5).",
  psu: "The PSU (Power Supply Unit) delivers power to every component. Choose a reliable unit with enough wattage for your GPU, plus some headroom for upgrades.",
  case: "The case holds your build and affects cooling/cable management. Good airflow helps temperatures and noise.",
  cooler: "A CPU cooler keeps your processor at safe temperatures. Hotter/higher-end CPUs usually need a better tower cooler or AIO liquid cooler."
};

// ----- Helpers -----
function nowTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\$/g, " ")
    .replace(/[^a-z0-9.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findById(list, id) {
  return list.find(function (item) { return item.id === id; }) || null;
}

function formatMoney(n) {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function pickRandom(list) {
  if (!list || !list.length) return "";
  return list[Math.floor(Math.random() * list.length)];
}

function getBudgetTier(budget, isMinimum) {
  if (budget == null) return "mid";
  // "1200+" means aim at high-end builds, not mid-range underspend
  if (isMinimum && budget >= 1200) return "high";
  if (budget < 800) return "low";
  if (budget <= 1200 && !isMinimum) return "mid";
  if (budget <= 1200 && isMinimum) return "high";
  return "high";
}

function estimatePerf4k(gpu) {
  if (!gpu) return 1;
  if (typeof gpu.perf4k === "number") return gpu.perf4k;

  // Explicit 4K beasts
  if (/rtx-5090|rtx-4090/.test(gpu.id)) return 5;
  if (/rtx-5080|rtx-4080|rx-7900-xtx/.test(gpu.id)) return 5;
  if (/rtx-5070-ti|rtx-4070-ti|rx-7900-xt|rx-6950|rx-6900/.test(gpu.id)) return 4;
  if (/rtx-3090|rtx-3080|rx-7800|rx-6800|rx-9070/.test(gpu.id)) return 4;

  let score = (gpu.perf1440p || 1) - 1;
  if (gpu.vram >= 24) score += 2;
  else if (gpu.vram >= 16) score += 1;
  if (gpu.isFlagship) score += 1;
  if (gpu.price >= 1500) score += 1;
  else if (gpu.price >= 900) score += 0.5;
  return Math.max(1, Math.min(5, Math.round(score)));
}

function getPerfKey(resolution) {
  if (resolution === "4k") return "perf4k";
  if (resolution === "1440p") return "perf1440p";
  return "perf1080p";
}

function getGpuPerf(gpu, resolution) {
  if (resolution === "4k") return estimatePerf4k(gpu);
  if (resolution === "1440p") return gpu.perf1440p || 1;
  return gpu.perf1080p || 1;
}

function minPerfForResolution(resolution) {
  if (resolution === "4k") return 4;
  if (resolution === "1440p") return 3;
  return 2;
}

function tierRank(tier) {
  if (tier === "low") return 1;
  if (tier === "mid") return 2;
  return 3;
}

function caseFitsBoard(caseItem, board) {
  // E-ATX / ATX cases fit ATX + mATX boards; mATX case only fits mATX boards.
  if (caseItem.formFactor === "mATX") return board.formFactor === "mATX";
  return true;
}

function scorePartForUse(part, useCase) {
  if (!useCase || !part.goodFor) return 0;
  return part.goodFor.indexOf(useCase) !== -1 ? 2 : 0;
}

// ----- UI: messages -----
function addUserMessage(text) {
  const stamp = nowTime();
  const wrap = document.createElement("div");
  wrap.className = "message user";
  wrap.innerHTML =
    '<div class="bubble"></div><div class="meta"></div>';
  wrap.querySelector(".bubble").textContent = text;
  wrap.querySelector(".meta").textContent = "You · " + stamp;
  chatWindow.appendChild(wrap);
  scrollChat();
  logSessionMessage({ role: "user", text: text, time: stamp });
}

function addBotMessage(text, extraNode, buildData) {
  const stamp = nowTime();
  const wrap = document.createElement("div");
  wrap.className = "message bot";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  wrap.appendChild(bubble);

  if (extraNode) wrap.appendChild(extraNode);

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = "PC Builder · " + stamp;
  wrap.appendChild(meta);

  chatWindow.appendChild(wrap);
  scrollChat();
  logSessionMessage({
    role: "bot",
    text: text,
    time: stamp,
    build: buildData ? serializeBuild(buildData) : null
  });
  return wrap;
}

function showTyping() {
  const wrap = document.createElement("div");
  wrap.className = "message bot typing";
  wrap.id = "typingIndicator";
  wrap.innerHTML = '<div class="bubble">PC Builder is typing...</div>';
  chatWindow.appendChild(wrap);
  scrollChat();
}

function hideTyping() {
  const el = document.getElementById("typingIndicator");
  if (el) el.remove();
}

function scrollChat() {
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function renderSuggestions(items) {
  suggestionBar.innerHTML = "";
  (items || []).forEach(function (label) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = label;
    btn.addEventListener("click", function () {
      if (isBotBusy) return;
      userInput.value = label;
      handleSend();
    });
    suggestionBar.appendChild(btn);
  });
}

function createBuildCard(build) {
  const card = document.createElement("div");
  card.className = "build-card";

  const gpuPart = build.gpu || { name: "Integrated graphics (iGPU)", price: 0 };
  const rows = [
    ["CPU", build.cpu],
    ["GPU", gpuPart],
    ["RAM", build.ram],
    ["Storage", build.storage],
    ["Motherboard", build.motherboard],
    ["PSU", build.psu],
    ["Case", build.case],
    ["Cooler", build.cooler]
  ];

  let rowsHtml = "";
  rows.forEach(function (pair) {
    const part = pair[1];
    if (!part) return;
    const priceLabel = pair[0] === "GPU" && !build.gpu ? "included" : formatMoney(part.price);
    rowsHtml +=
      '<div class="build-row">' +
      '<span class="label">' + pair[0] + "</span>" +
      '<span class="value">' + part.name + "</span>" +
      '<span class="price">' + priceLabel + "</span>" +
      "</div>";
  });

  const remain = build.budget != null ? build.budget - build.total : null;
  let remainHtml = "";
  if (remain != null) {
    const over = remain < 0;
    remainHtml =
      '<span class="remain' + (over ? " over" : "") + '">' +
      (over
        ? "Over budget by " + formatMoney(Math.abs(remain))
        : "Remaining: " + formatMoney(remain)) +
      "</span>";
  }

  card.innerHTML =
    '<div class="build-card-header">YOUR PC BUILD</div>' +
    '<div class="build-rows">' + rowsHtml + "</div>" +
    '<div class="build-total"><span>Estimated total · ' + formatMoney(build.total) +
    "</span>" + remainHtml + "</div>" +
    '<div class="build-why"><strong>Why this build?</strong><br />' +
    escapeHtml(build.reason) + "</div>" +
    '<div class="build-actions">' +
    '<button type="button" data-action="copy">Copy build</button>' +
    '<button type="button" data-action="cheaper">Make it cheaper</button>' +
    '<button type="button" data-action="upgrade">Upgrade GPU</button>' +
    "</div>";

  card.querySelector('[data-action="copy"]').addEventListener("click", function () {
    copyBuildText(build);
  });
  card.querySelector('[data-action="cheaper"]').addEventListener("click", function () {
    if (isBotBusy) return;
    userInput.value = "Make this build cheaper";
    handleSend();
  });
  card.querySelector('[data-action="upgrade"]').addEventListener("click", function () {
    if (isBotBusy) return;
    userInput.value = "Upgrade the GPU";
    handleSend();
  });

  return card;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function copyBuildText(build) {
  const lines = [
    "PC Builder — Recommended Build",
    "CPU: " + build.cpu.name + " (" + formatMoney(build.cpu.price) + ")",
    "GPU: " + (build.gpu ? build.gpu.name + " (" + formatMoney(build.gpu.price) + ")" : "iGPU / none"),
    "RAM: " + build.ram.name + " (" + formatMoney(build.ram.price) + ")",
    "Storage: " + build.storage.name + " (" + formatMoney(build.storage.price) + ")",
    "Motherboard: " + build.motherboard.name + " (" + formatMoney(build.motherboard.price) + ")",
    "PSU: " + build.psu.name + " (" + formatMoney(build.psu.price) + ")",
    "Case: " + build.case.name + " (" + formatMoney(build.case.price) + ")",
    "Cooler: " + build.cooler.name + " (" + formatMoney(build.cooler.price) + ")",
    "Estimated total: " + formatMoney(build.total)
  ];
  const text = lines.join("\n");

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      addBotMessage("Copied your build list to the clipboard.");
    }).catch(function () {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const area = document.createElement("textarea");
  area.value = text;
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand("copy");
    addBotMessage("Copied your build list to the clipboard.");
  } catch (e) {
    addBotMessage("Couldn't copy automatically. Here is the build:\n\n" + text);
  }
  area.remove();
}

// ----- Detection -----
function parseBudgetDetails(text) {
  const raw = String(text || "").trim();
  const n = normalize(text);

  // Resolution answers must never be treated as money (e.g. "1440p")
  if (state.awaiting === "resolution") return null;
  if (/^(1080p?|1440p?|2160p?|4k|qhd|fhd|2k)$/i.test(raw.replace(/\s+/g, ""))) {
    return null;
  }

  // Strip GPU/CPU model codes so "4090" / "5090" are never read as budgets
  const stripped = n
    .replace(/\b(rtx|gtx|gt)\s*-?\s*\d{3,5}(\s*(ti|super))?\b/g, " ")
    .replace(/\b(rx)\s*-?\s*\d{3,5}(\s*(xt|xtx|gre|xt\s*16gb|xt\s*8gb))?\b/g, " ")
    .replace(/\b(ryzen|core)\s*\d?\s*\d{3,5}\w*\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Word / shorthand amounts: 1 million, 1m, 100k, 2 mil
  let m = raw.match(/(\d+(?:\.\d+)?)\s*(million|mil)\b/i) ||
    stripped.match(/(\d+(?:\.\d+)?)\s*(million|mil)\b/) ||
    stripped.match(/\b(\d+(?:\.\d+)?)million\b/) ||
    stripped.match(/\b(\d+(?:\.\d+)?)\s*m\b/);
  if (m) {
    return { value: Math.round(parseFloat(m[1]) * 1000000), isMinimum: false };
  }
  m = raw.match(/(\d+(?:\.\d+)?)\s*k\b/i) || stripped.match(/\b(\d+(?:\.\d+)?)\s*k\b/);
  if (m) {
    return { value: Math.round(parseFloat(m[1]) * 1000), isMinimum: false };
  }

  // Comma-formatted: $100,000 / 1,000,000
  m = raw.match(/\$?\s*(\d{1,3}(?:,\d{3})+)\s*\$?/);
  if (m) {
    return { value: parseInt(m[1].replace(/,/g, ""), 10), isMinimum: false };
  }

  // Minimum budgets: 1200+, $1200+, 1200$+, 1200 +
  m = raw.match(/\$?\s*(\d{3,7})\s*\$?\s*\+/) ||
    stripped.match(/\b(\d{3,7})\s*\+\s*(?:usd|dollars?|bucks)?\b/) ||
    stripped.match(/(?:over|above|more than|at least|minimum)\s*\$?\s*(\d{3,7})/);
  if (m) {
    return { value: parseInt(m[1], 10), isMinimum: true };
  }

  // Negative amounts: -$200, $-200, -200 dollars
  m = raw.match(/-\s*\$\s*(\d{1,9})/) || raw.match(/\$\s*-\s*(\d{1,9})/);
  if (m) return { value: -parseInt(m[1], 10), isMinimum: false };

  // $250 / 250$ / $100000 / 1000000$
  m = raw.match(/\$\s*(\d{1,9})/) || raw.match(/(\d{1,9})\s*\$/);
  if (m) return { value: parseInt(m[1], 10), isMinimum: false };

  const cleaned = stripped
    .replace(/\b(1080p|1440p|2160p|1080|1440|2160|4k|qhd|fhd|2k)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // “budget 800”, “budget is 800”, “my new budget is 1200”, “around 900”
  m = cleaned.match(/(?:budget|around|about|under|below|max|upto|up to|for)(?:\s*(?:is|of|to|:))?\s*(-?\d{1,9})(?:\s*(?:dollars?|usd))?/);
  if (m) return { value: parseInt(m[1], 10), isMinimum: false };

  m = cleaned.match(/\b(?:my\s+(?:new\s+)?)?budget\b[\w\s]{0,12}?\b(-?\d{1,9})\b/);
  if (m) return { value: parseInt(m[1], 10), isMinimum: false };

  m = cleaned.match(/(-?\d{1,9})\s*(?:dollars?|usd|bucks)/);
  if (m) return { value: parseInt(m[1], 10), isMinimum: false };

  m = cleaned.match(/\b(-?\d{2,9})\s*(?:gaming|pc|computer|build)\b/);
  if (m) return { value: parseInt(m[1], 10), isMinimum: false };

  m = cleaned.match(/\b(?:gaming|pc|computer|build).{0,40}?\b(-?\d{2,9})\b/);
  if (m) return { value: parseInt(m[1], 10), isMinimum: false };

  // bare number when awaiting budget (including negatives / huge values)
  if (state.awaiting === "budget") {
    m = cleaned.match(/^(-?\d{1,9})\+?$/);
    if (m) {
      const isMin = /\+$/.test(cleaned) || /\+$/.test(raw.replace(/\s/g, ""));
      return { value: parseInt(m[1], 10), isMinimum: isMin };
    }
  }

  return null;
}

function parseBudgetCandidate(text) {
  const details = parseBudgetDetails(text);
  return details ? details.value : null;
}

function evaluateBudgetInput(text) {
  const details = parseBudgetDetails(text);
  if (!details || details.value == null || isNaN(details.value)) {
    return { status: "missing", value: null, isMinimum: false, absurd: false };
  }
  const value = details.value;
  if (value < 0 || value > MAX_BUDGET) {
    return { status: "invalid", value: value, isMinimum: false, absurd: false };
  }
  if (value <= 100) {
    return { status: "too_low", value: value, isMinimum: false, absurd: false };
  }
  return {
    status: "ok",
    value: value,
    isMinimum: !!details.isMinimum,
    absurd: value >= ABSURD_BUDGET,
    igpuOnly: value <= IGPU_BUDGET_MAX && !details.isMinimum
  };
}

// Single-part budgets (CPU/GPU only) — lower floor than a full PC
function evaluatePartBudget(text) {
  const details = parseBudgetDetails(text);
  if (!details || details.value == null || isNaN(details.value)) {
    return { status: "missing", value: null, isMinimum: false, absurd: false };
  }
  const value = details.value;
  if (value < 0 || value > MAX_BUDGET) {
    return { status: "invalid", value: value, isMinimum: false, absurd: false };
  }
  if (value < 50) {
    return { status: "too_low", value: value, isMinimum: false, absurd: false };
  }
  return {
    status: "ok",
    value: value,
    isMinimum: !!details.isMinimum,
    absurd: value >= ABSURD_BUDGET
  };
}

// Returns an accepted budget number, or null (invalid / too low / missing)
function extractBudget(text) {
  const result = evaluateBudgetInput(text);
  return result.status === "ok" ? result.value : null;
}

function isAbsurdBudget(value) {
  return value != null && value >= ABSURD_BUDGET;
}

function isExplicitBudgetUpdate(text) {
  const t = normalize(text);
  return /\b(my (new )?budget|new budget|budget is( now)?|change (my )?budget|update (my )?budget|set (my )?budget|revise (my )?budget|budget of)\b/.test(t);
}

function canAfford4k(budget) {
  return budget != null && budget >= MIN_4K_BUDGET;
}

function replyFourKNeedsBudget(budget) {
  const money = budget != null ? formatMoney(budget) : "that budget";
  return {
    text: pickRandom([
      "4K gaming isn’t realistic at " + money + ".",
      "At " + money + ", I’d skip 4K — you won’t get a satisfying experience.",
      money + " is too tight for proper 4K gaming."
    ]) +
      " Plan on about $1600+ (ideally more) for a real 4K GPU and supporting parts. " +
      "For now, pick 1080p or 1440p, or raise your budget.",
    suggest: ["1080p", "1440p", "$1600", "$1600+", "$2000"]
  };
}

function isUnlimitedBudgetAsk(text) {
  const t = normalize(text);
  return /(don t care about (money|budget|price|cost)|dont care about (money|budget|price|cost)|i don t care about money|money isn t a problem|money isnt a problem|money is no (issue|object|problem)|money s no (issue|object|problem)|moneys no (issue|object|problem)|budget is no (issue|object|problem)|price is no (issue|object|problem)|cost is no (issue|object|problem)|no budget|unlimited budget|money no object|no expense spared|sky s the limit|skys the limit|build the (absolute )?best|best (pc|computer|build) possible|most expensive (pc|computer|build)|build the most expensive|all out (pc|build)|no limit on (budget|money|price))/.test(t);
}

function pickMostExpensivePart(list, brand) {
  let candidates = list.slice();
  if (brand) {
    const filtered = candidates.filter(function (p) {
      return normalize(p.brand) === normalize(brand);
    });
    if (filtered.length) candidates = filtered;
  }
  candidates.sort(function (a, b) {
    // Prefer higher price; for GPUs also lean on 4K/1440p performance
    const perfA = (typeof a.perf4k === "number" ? a.perf4k : 0) * 100 +
      (a.perf1440p || 0) * 10 + (a.vram || 0);
    const perfB = (typeof b.perf4k === "number" ? b.perf4k : 0) * 100 +
      (b.perf1440p || 0) * 10 + (b.vram || 0);
    if (a.price !== b.price) return b.price - a.price;
    return perfB - perfA;
  });
  return candidates[0] || null;
}

function getTopGpu(brand) {
  const top = pickMostExpensivePart(PC_DATA.GPUs, brand || state.gpuBrand);
  if (top) return top;
  return findById(PC_DATA.GPUs, PC_DATA.BEST_PICKS.gpu);
}

function getTopCpu(brand) {
  const top = pickMostExpensivePart(PC_DATA.CPUs, brand || state.cpuBrand);
  if (top) return top;
  return findById(PC_DATA.CPUs, PC_DATA.BEST_PICKS.cpu);
}

function isTopGpu(part, brand) {
  if (!part) return false;
  const top = getTopGpu(brand);
  return !!(top && part.id === top.id);
}

function isTopCpu(part, brand) {
  if (!part) return false;
  const top = getTopCpu(brand);
  return !!(top && part.id === top.id);
}

function isStrictlyBetterGpu(candidate, current) {
  if (!candidate || !current) return !!candidate;
  if (candidate.id === current.id) return false;
  const betterPrice = candidate.price > current.price;
  const betterPerf = estimatePerf4k(candidate) > estimatePerf4k(current) ||
    (candidate.perf1440p || 0) > (current.perf1440p || 0) ||
    (candidate.vram || 0) > (current.vram || 0);
  // Must not be a downgrade on both price and performance
  if (candidate.price < current.price && !betterPerf) return false;
  if (estimatePerf4k(candidate) < estimatePerf4k(current) &&
      (candidate.perf1440p || 0) < (current.perf1440p || 0) &&
      candidate.price <= current.price) {
    return false;
  }
  return betterPrice || betterPerf;
}

function replyAlreadyMaxed(kind, part) {
  const label = kind === "gpu" ? "GPU" : "CPU";
  const name = part ? part.name : ("top " + label);
  return {
    text: pickRandom([
      "You’re already on the " + name + " — that’s the top " + label + " in my catalog, so I can’t upgrade it further.",
      "No upgrade path from here: the " + name + " is already maxed out in this catalog.",
      "That’s as high as it goes — " + name + " is the strongest " + label + " I can recommend."
    ]) + " If you want to spend less instead, ask me to make the build cheaper.",
    suggest: ["Make it cheaper", kind === "gpu" ? "Suggest a CPU" : "Suggest a GPU", "Build me a gaming PC"]
  };
}

function isIgpuBudget(budget) {
  return budget != null && budget >= MIN_USABLE_BUDGET && budget <= IGPU_BUDGET_MAX;
}

function awaitingInvalidReply(field) {
  const labels = {
    budget: "budget (example: $800)",
    brands: "brand preference (example: AMD + NVIDIA, or “no preference”)",
    resolution: "resolution (1080p, 1440p, or 4K)",
    useCase: "use case (gaming, programming, editing, streaming, office, or school)",
    confirm: "yes/no answer (example: “yes please” or “no thanks”)"
  };
  return (
    "That's outside my scope for this step. Please provide a valid value for " +
    (labels[field] || "the required input") +
    "."
  );
}

function detectAffirmative(text) {
  const t = normalize(text);
  if (!t) return false;

  // Short / clear yes-style answers
  if (/^(y|yes|yeah|yep|yup|ya|yea|ok|okay|k|kk|sure|fine|alright|all right|please|go ahead|continue|proceed|do it|bet|absolutely|definitely|of course|why not)$/.test(t)) {
    return true;
  }

  // Longer natural confirmations
  if (/\b(yes please|yeah please|ok please|okay please|sure thing|sounds good|sounds great|that works|that would be great|that d be great|thatll be great|i would love that|i d love that|id love that|love that|go for it|build it|lets go|let s go|lets do it|let s do it|please do|count me in|i m in|im in|affirmative|gladly)\b/.test(t)) {
    return true;
  }

  // “yes …” / “ok …” openers
  if (/^(yes|yeah|yep|yup|ok|okay|sure|fine|alright)\b/.test(t) && t.length <= 48) {
    return true;
  }

  return false;
}

function detectNegative(text) {
  const t = normalize(text);
  if (!t) return false;

  if (/^(n|no|nope|nah|nay|no thanks|no thank you|not really|not now|skip|cancel|nevermind|never mind|dont|don t|do not)$/.test(t)) {
    return true;
  }

  if (/\b(no thanks|no thank you|not really|not now|maybe later|don t|dont|do not|skip it|cancel that)\b/.test(t)) {
    return true;
  }

  if (/^(no|nope|nah)\b/.test(t) && t.length <= 40) {
    return true;
  }

  return false;
}

function detectUseCase(text) {
  const t = normalize(text);

  if (/(video editing|editing|premiere|davinci|after effects)/.test(t)) return "editing";
  if (/(streaming|streamer|twitch|youtube streaming)/.test(t)) return "streaming";
  if (/(programming|coding|development|software development|web development|coding pc)/.test(t)) {
    return "programming";
  }
  if (/(office|documents|browsing|homework)/.test(t)) return "office";
  if (/(school|study)/.test(t)) return "school";
  if (/(gaming|games|gaming pc|play games|\bfps\b|gta|minecraft|valorant|fortnite|cyberpunk)/.test(t)) {
    return "gaming";
  }
  return null;
}

function detectResolution(text) {
  const t = normalize(text);
  // Check 4K first so "4k gaming" / "2160p" win over other matches
  if (/(4k|2160|2160p|uhd|ultra hd)/.test(t)) return "4k";
  if (/(1440|1440p|2k|qhd)/.test(t)) return "1440p";
  if (/(1080|1080p|fhd|full hd)/.test(t)) return "1080p";
  if (state.awaiting === "resolution") {
    if (/\b4k\b|\b2160\b/.test(t)) return "4k";
    if (/\b1440\b/.test(t)) return "1440p";
    if (/\b1080\b/.test(t)) return "1080p";
  }
  return null;
}

function looksLikeBrandPreference(text) {
  const t = normalize(text);
  if (state.awaiting === "brands") return true;
  if (/(no preference|any brand|doesn t matter|dont care|don't care|either|team red|all amd)/.test(t)) {
    return true;
  }
  if (/\b(prefer|preference|brands?)\b/.test(t)) return true;
  // “I want NVIDIA” / “go with AMD” — but not “is the RTX 5060 enough…”
  if (/\b(want|need|go with|pick|choose)\b.{0,24}\b(nvidia|amd|intel)\b/.test(t) &&
      !/\b(rtx|gtx|radeon|ryzen|core)\s*\d/.test(t)) {
    return true;
  }
  // “AMD + NVIDIA”, “Intel and NVIDIA”, “AMD CPU and NVIDIA GPU”
  if (/(amd|intel|nvidia).{0,20}(and|&|\+|with|plus).{0,20}(amd|intel|nvidia)/.test(t)) {
    return true;
  }
  if (/(amd|intel)\s*(cpu|processor)|(cpu|processor)\s*(amd|intel)/.test(t)) return true;
  if (/(nvidia|amd)\s*(gpu|graphics)|(gpu|graphics)\s*(nvidia|amd|radeon)/.test(t)) return true;
  return false;
}

function detectBrands(text) {
  const t = normalize(text);
  const result = { cpuBrand: null, gpuBrand: null, mentioned: false };

  if (/(no preference|any brand|doesn t matter|dont care|don't care|either)/.test(t)) {
    result.mentioned = true;
    result.cpuBrand = null;
    result.gpuBrand = null;
    return result;
  }

  // Product mentions like “RTX 5060” / “Ryzen 5 7600” are NOT brand prefs by themselves
  if (!looksLikeBrandPreference(text)) {
    return result;
  }

  // Explicit role / product-line cues
  if (/amd\s*cpu/.test(t) || (/\bamd\b/.test(t) && /\b(cpu|processor)\b/.test(t)) || /ryzen/.test(t)) {
    result.cpuBrand = "AMD";
    result.mentioned = true;
  }
  if (/intel\s*cpu/.test(t) || (/\bintel\b/.test(t) && /\b(cpu|processor)\b/.test(t))) {
    result.cpuBrand = "Intel";
    result.mentioned = true;
  }
  if (/\bnvidia\b|\bgeforce\b|\brtx\b/.test(t)) {
    result.gpuBrand = "NVIDIA";
    result.mentioned = true;
  }
  if (/amd\s*gpu|radeon/.test(t) || (/\bamd\b/.test(t) && /\b(gpu|graphics)\b/.test(t))) {
    result.gpuBrand = "AMD";
    result.mentioned = true;
  }

  // Broad brand-only answers (“AMD”, “Intel + NVIDIA”, chips, etc.)
  if (/\bamd\b/.test(t) && !/\bintel\b/.test(t) && !/\bnvidia\b/.test(t) && !/\brtx\b/.test(t)) {
    if (!result.cpuBrand) result.cpuBrand = "AMD";
    if (!result.gpuBrand && !/\b(cpu|processor)\b/.test(t)) result.gpuBrand = "AMD";
    result.mentioned = true;
  }
  if (/\bintel\b/.test(t) && !/\bamd\b/.test(t)) {
    result.cpuBrand = "Intel";
    result.mentioned = true;
  }
  if (/\bnvidia\b|\brtx\b|\bgeforce\b/.test(t) && /\bamd\b/.test(t)) {
    result.cpuBrand = "AMD";
    result.gpuBrand = "NVIDIA";
    result.mentioned = true;
  }
  if (/\bintel\b/.test(t) && (/\bnvidia\b|\brtx\b|\bgeforce\b/.test(t))) {
    result.cpuBrand = "Intel";
    result.gpuBrand = "NVIDIA";
    result.mentioned = true;
  }
  if (/team red|all amd/.test(t)) {
    result.cpuBrand = "AMD";
    result.gpuBrand = "AMD";
    result.mentioned = true;
  }

  return result;
}

function needsResolution(useCase) {
  return useCase === "gaming" || useCase === "streaming" || useCase === "editing";
}

function isPcRelated(text) {
  const t = normalize(text);
  const keys = [
    "pc", "computer", "build", "cpu", "gpu", "ram", "ssd", "hdd", "storage",
    "motherboard", "psu", "power supply", "case", "cooler", "budget", "gaming",
    "programming", "editing", "streaming", "office", "school", "amd", "intel",
    "nvidia", "radeon", "ryzen", "core i", "rtx", "gtx", "compatibility", "compatible",
    "1080", "1440", "4k", "watt", "ddr4", "ddr5", "component", "upgrade", "cheaper",
    "recommend", "suggest", "suggestion", "propose", "pick", "choose", "best", "better",
    "parts", "prefs", "preference", "versus", " vs ",
    "explain", "list", "difference", "nvidia", "intel", "amd",
    "introduce", "introduction", "who are you", "what are you", "compatible", "socket"
  ];
  return keys.some(function (k) { return t.indexOf(k.toLowerCase()) !== -1; });
}

function detectIntent(text) {
  const t = normalize(text);

  if (!t) return "empty";

  if (/(reset|new build|start over|clear chat)/.test(t)) return "reset";
  if (/(my prefs|preferences|what do you remember|current settings)/.test(t)) return "prefs";
  if (/(recent chats?|chat history|previous chats?)/.test(t)) return "recent";
  if (/continue (this |my )?build/.test(t)) return "continue";
  if (/build (a |the )?pc around|build around (it|that|this)/.test(t)) return "build_around";

  // Intro / identity
  if (/^(intro|introduction)$/.test(t) ||
      /(introduce yourself|give (me )?(your |an )?intro(duction)?|\bintro\b|tell me about yourself|who are you|what are you|what do you do|what s your (name|purpose)|whats your (name|purpose)|your introduction)/.test(t)) {
    return "intro";
  }

  // Simple / casual greetings (hi bro, wassup, brooooo, yo brodi, hiiiiiii, …)
  if (isGreetingPhrase(t)) {
    return "greeting";
  }
  if (/^(how are you|how r you|how are ya|hows it going|how s it going|how you doing|how are you doing)(\s+today)?[!?.]*$/.test(t)) {
    return "how_are_you";
  }

  if (/(capital of france|weather|joke|recipe|what time)/.test(t)) return "out_of_scope";

  // Price / cost questions (before generic "how much RAM do I need" explainers)
  if (/(how much (does|is|for|would)|price of|cost of|what s the (price|cost)|whats the (price|cost)|how much for a)/.test(t) ||
      (/^(price|cost)\b/.test(t) && /(cpu|gpu|ram|ssd|pc|computer|ryzen|rtx|radeon|intel|core)/.test(t))) {
    return "price_check";
  }

  // Compatibility questions
  if (/(can i use|compatible|compatibility|work with|pair .* with|fit (on|with|in)|will .+ work|does .+ work|compatible with)/.test(t)) {
    return "compatibility";
  }

  // FAQ / education (companies, parts list, use-case differences, “does X make Y?”)
  if (isFaqQuestion(t)) {
    return "faq";
  }

  // Component explainers
  if (/(what does a? |what is an? |what is a |whats a |whats an |what s a |do i need|how much ram do|how much .* need)/.test(t)) {
    return "component_info";
  }
  if (/(explain|tell me about).*(cpu|gpu|ram|ssd|hdd|motherboard|psu|cooler|case)/.test(t)) {
    return "component_info";
  }
  if (/^(whats|what is|what s)\s+(a |an )?(cpu|gpu|psu|ram|ssd|hdd|motherboard|mobo|cooler|case|power supply)\b/.test(t)) {
    return "component_info";
  }

  // Direct part comparisons: "which is better, RTX 4090 or RTX 5090?"
  if (findComparedParts(text)) {
    return "compare_parts";
  }

  // Best-of questions
  if (/(best|fastest|top|strongest).*(gpu|graphics|cpu|processor|ram|ssd)/.test(t) ||
      /(which|what).*(gpu|cpu).*(best|better)/.test(t) ||
      (/which is better/.test(t) && /(gpu|cpu|rtx|radeon|ryzen|intel)/.test(t))) {
    return "best_pick";
  }

  // Brand prefs while answering the build’s brand question (before compare)
  // e.g. chip “Intel + NVIDIA” / “AMD + NVIDIA” must set prefs, not compare companies
  if (state.awaiting === "brands" && detectBrands(text).mentioned) {
    return "brands";
  }

  // Brand comparisons: "intel or nvidia", "nvidia vs amd", "nvidia or nvidia"
  // Do NOT treat preference pairs (“Intel and NVIDIA”, “AMD + NVIDIA”) as compares
  const brandMentions = extractBrandMentions(text);
  const isBrandCompareWording =
    /(better|best|vs|versus|\bor\b|compared|compare|which|who wins)/.test(t);
  const isBrandPrefPair =
    brandMentions.length >= 2 &&
    /(and|&|\+|with|plus)/.test(t) &&
    !isBrandCompareWording;
  if (!isBrandPrefPair && brandMentions.length >= 2 &&
      (isBrandCompareWording || brandMentions[0] === brandMentions[1] ||
        /(amd|intel|nvidia).*(better|vs|versus|\bor\b)/.test(t) ||
        /(better|vs|versus|\bor\b).*(amd|intel|nvidia)/.test(t))) {
    return "brand_compare";
  }
  if (isBrandPrefPair || (brandMentions.length >= 2 && detectBrands(text).mentioned &&
      /(and|&|\+|with|plus|prefer|brand)/.test(t))) {
    return "brands";
  }

  // Unlimited / no-budget “best PC money can buy”
  if (isUnlimitedBudgetAsk(t)) {
    return "dream_build";
  }

  // Single-part recommendation / suggestion
  if (/\b(recommend|suggest|propose|pick|choose|give me|show me)\b.{0,24}\b(gpu|graphics card)\b/.test(t) ||
      /which gpu|gpu should|what gpu/.test(t)) {
    return "recommend_gpu";
  }
  if (/\b(recommend|suggest|propose|pick|choose|give me|show me)\b.{0,24}\b(cpu|processor)\b/.test(t) ||
      /which cpu|cpu should|what cpu/.test(t)) {
    return "recommend_cpu";
  }

  // "$400 GPU" / "300 cpu" chips — part-only budget, not a full-PC budget
  if (/\$?\s*\d{2,5}\s*\$?\s*(gpu|graphics cards?)\b/.test(t) ||
      /\b(gpu|graphics cards?)\b.{0,16}\$?\s*\d{2,5}/.test(t)) {
    return "recommend_gpu";
  }
  if (/\$?\s*\d{2,5}\s*\$?\s*(cpu|processors?)\b/.test(t) ||
      /\b(cpu|processors?)\b.{0,16}\$?\s*\d{2,5}/.test(t)) {
    return "recommend_cpu";
  }

  // Build tweaks
  if (/make .* cheaper|cheaper build|lower the price|budget cut/.test(t)) return "make_cheaper";
  if (/upgrade (the )?gpu|better gpu|stronger gpu/.test(t)) return "upgrade_gpu";
  if (/upgrade (the )?cpu|better cpu|stronger cpu|better processor/.test(t)) return "upgrade_cpu";

  // Build request
  if (/(build|recommend|suggest).*(pc|computer)|i (want|need) a (pc|computer)|gaming pc|complete build|within my budget/.test(t) ||
      detectUseCase(t)) {
    return "build";
  }

  if (parseBudgetCandidate(text) != null) return "budget";
  if (detectResolution(text)) return "resolution";
  if (detectBrands(text).mentioned) return "brands";

  if (isPcRelated(t)) return "unsure_pc";
  return "out_of_scope";
}

// ----- Compatibility -----
function partMatchAliases(part, opts) {
  opts = opts || {};
  const aliases = [];
  const name = normalize(part.name);
  const id = normalize(part.id.replace(/-/g, " "));
  if (name) aliases.push(name);
  if (id) aliases.push(id);
  // Short model tokens: "4090", "5090", "7600"
  const idTail = part.id.split("-").pop();
  const bare = idTail && /^\d{3,5}[a-z]*$/i.test(idTail) && idTail.length >= 3
    ? normalize(idTail)
    : null;
  if (bare && !opts.skipBareNumeric) {
    aliases.push(bare);
  }
  const nameTail = part.name.match(/\b(\d{3,5}\s*(?:ti|super|xtx|xt)?)\b/i);
  if (nameTail) {
    const tail = normalize(nameTail[1]);
    if (!opts.skipBareNumeric || /[a-z]/.test(tail)) {
      aliases.push(tail);
    }
  }
  return aliases;
}

function bareTokenSharedByCpuAndGpu(token) {
  const n = normalize(token);
  if (!n || !/^\d{3,5}[a-z]*$/.test(n)) return false;
  const onCpu = PC_DATA.CPUs.some(function (c) {
    return c.id.split("-").pop() === n || normalize(c.name).indexOf(n) !== -1;
  });
  const onGpu = PC_DATA.GPUs.some(function (g) {
    return g.id.split("-").pop() === n || normalize(g.name).indexOf(n) !== -1;
  });
  return onCpu && onGpu;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nameMentionedInText(text, name) {
  const t = normalize(text);
  const n = normalize(name);
  if (!n) return false;
  const re = new RegExp("(?:^|[^a-z0-9])" + escapeRegExp(n) + "(?:[^a-z0-9]|$)");
  return re.test(t);
}

function findAllPartMentions(text, list, opts) {
  opts = opts || {};
  const t = normalize(text);
  const scored = [];
  list.forEach(function (part) {
    const aliases = partMatchAliases(part, opts);
    let bestAliasLen = 0;
    for (let i = 0; i < aliases.length; i++) {
      const alias = aliases[i];
      if (!alias || alias.length < 3) continue;
      const re = new RegExp("(?:^|[^a-z0-9])" + escapeRegExp(alias) + "(?:[^a-z0-9]|$)");
      if (re.test(t) && alias.length > bestAliasLen) bestAliasLen = alias.length;
    }
    if (bestAliasLen > 0) {
      scored.push({ part: part, aliasLen: bestAliasLen });
    }
  });
  // Prefer full name hits, then longer aliases; avoid “7600” winning as “7600X”
  scored.sort(function (a, b) {
    const aFull = nameMentionedInText(text, a.part.name);
    const bFull = nameMentionedInText(text, b.part.name);
    if (aFull !== bFull) return aFull ? -1 : 1;
    if (aFull && bFull) return normalize(b.part.name).length - normalize(a.part.name).length;
    if (a.aliasLen !== b.aliasLen) return b.aliasLen - a.aliasLen;
    return normalize(a.part.name).length - normalize(b.part.name).length;
  });
  return scored.map(function (s) { return s.part; });
}

function findPartMention(text, list) {
  const all = findAllPartMentions(text, list);
  if (all.length) return all[0];

  const t = normalize(text);
  let best = null;
  list.forEach(function (part) {
    if (part.chipset && t.indexOf(normalize(part.chipset)) !== -1) {
      best = part;
    }
  });
  return best;
}

function findComparedParts(text) {
  const t = normalize(text);
  if (!/(better|best|vs|versus|\bor\b|compared|compare|which)/.test(t)) return null;

  const hasGpuCue = /\b(rtx|gtx|gt|radeon|\brx\b|geforce|gpu|graphics)\b/.test(t);
  const hasCpuCue = /\b(ryzen|core\s*i?[3579]?|cpu|processor)\b/.test(t);

  // Shared bare codes (7600/7700) without a GPU cue → don't match as Radeon
  const bareTokens = t.match(/\b\d{3,5}[a-z]*\b/g) || [];
  const skipGpuBare = !hasGpuCue && bareTokens.some(bareTokenSharedByCpuAndGpu);

  const gpus = findAllPartMentions(text, PC_DATA.GPUs, {
    skipBareNumeric: skipGpuBare
  });
  const cpus = findAllPartMentions(text, PC_DATA.CPUs);

  // When both families match, prefer the one the user named
  if (gpus.length >= 2 && cpus.length >= 2) {
    if (hasGpuCue && !hasCpuCue) return { type: "gpu", a: gpus[0], b: gpus[1] };
    if (hasCpuCue && !hasGpuCue) return { type: "cpu", a: cpus[0], b: cpus[1] };
    return { type: "cpu", a: cpus[0], b: cpus[1] };
  }
  if (cpus.length >= 2 && (!hasGpuCue || hasCpuCue)) {
    return { type: "cpu", a: cpus[0], b: cpus[1] };
  }
  if (gpus.length >= 2) {
    return { type: "gpu", a: gpus[0], b: gpus[1] };
  }
  if (cpus.length >= 2) {
    return { type: "cpu", a: cpus[0], b: cpus[1] };
  }

  return null;
}

function comparePartsAnswer(text) {
  const pair = findComparedParts(text);
  if (!pair) {
    return {
      text: "Tell me two parts to compare, like “Which is better, RTX 4090 or RTX 5090?”"
    };
  }

  const a = pair.a;
  const b = pair.b;

  if (pair.type === "gpu") {
    const scoreA = estimatePerf4k(a) * 2 + (a.perf1440p || 0) + a.vram / 8;
    const scoreB = estimatePerf4k(b) * 2 + (b.perf1440p || 0) + b.vram / 8;
    const winner = scoreB > scoreA ? b : scoreA > scoreB ? a : null;
    const loser = winner ? (winner.id === a.id ? b : a) : null;

    let verdict;
    if (!winner) {
      verdict = "They're very close overall — pick based on price and features you care about.";
    } else {
      verdict = "I'd pick the " + winner.name + " over the " + loser.name + " for raw performance.";
      state.lastSuggestedPart = { kind: "gpu", id: winner.id, name: winner.name };
      state.awaitingConfirm = "buildAroundPart";
    }

    return {
      text: "Comparing " + a.name + " vs " + b.name + ":\n\n" +
        a.name + "\n" +
        "• ~" + formatMoney(a.price) + " · " + a.vram + "GB VRAM\n" +
        "• 1440p: " + (a.perf1440p || "?") + "/5 · 4K: " + estimatePerf4k(a) + "/5\n" +
        "• " + a.notes + "\n\n" +
        b.name + "\n" +
        "• ~" + formatMoney(b.price) + " · " + b.vram + "GB VRAM\n" +
        "• 1440p: " + (b.perf1440p || "?") + "/5 · 4K: " + estimatePerf4k(b) + "/5\n" +
        "• " + b.notes + "\n\n" +
        verdict +
        (winner ? "\n\nDo you want a full PC built around the " + winner.name + "?" : ""),
      suggest: winner
        ? ["Yes please", "No thanks", "Recommend a GPU"]
        : ["Recommend a GPU", "How much for a PC?"]
    };
  }

  // CPU compare
  const winner = b.price !== a.price
    ? (b.cores !== a.cores ? (b.cores >= a.cores && b.threads >= a.threads ? b : a) : (b.price > a.price ? b : a))
    : (b.cores >= a.cores ? b : a);
  const loser = winner.id === a.id ? b : a;

  return {
    text: "Comparing " + a.name + " vs " + b.name + ":\n\n" +
      a.name + " — " + a.cores + "C/" + a.threads + "T · " + a.socket + " · ~" + formatMoney(a.price) + "\n• " + a.notes + "\n\n" +
      b.name + " — " + b.cores + "C/" + b.threads + "T · " + b.socket + " · ~" + formatMoney(b.price) + "\n• " + b.notes + "\n\n" +
      "For most people I'd lean toward the " + winner.name +
      (winner.socket !== loser.socket ? " (note: different sockets — " + winner.socket + " vs " + loser.socket + ")." : "."),
    suggest: ["Recommend a CPU", "Build me a gaming PC"]
  };
}

function pickAdequatePsu(minWatt, maxPrice) {
  let candidates = PC_DATA.PSUs.filter(function (p) {
    return p.wattage >= minWatt;
  });
  if (!candidates.length) {
    candidates = PC_DATA.PSUs.slice().sort(function (a, b) { return b.wattage - a.wattage; });
    return candidates[0] || null;
  }

  if (maxPrice != null) {
    const affordable = candidates.filter(function (p) { return p.price <= maxPrice; });
    if (affordable.length) candidates = affordable;
  }

  // Smallest wattage that still covers the need, then cheapest
  candidates.sort(function (a, b) {
    if (a.wattage !== b.wattage) return a.wattage - b.wattage;
    return a.price - b.price;
  });
  return candidates[0];
}

function detectSocketMention(text) {
  const t = normalize(text);
  if (/\blga\s*1700\b|\blga1700\b/.test(t)) return "LGA1700";
  if (/\blga\s*1200\b|\blga1200\b/.test(t)) return "LGA1200";
  if (/\bam5\b/.test(t)) return "AM5";
  if (/\bam4\b/.test(t)) return "AM4";
  return null;
}

function detectRamTypeMention(text) {
  const t = normalize(text);
  if (/\bddr\s*5\b|\bddr5\b/.test(t)) return "DDR5";
  if (/\bddr\s*4\b|\bddr4\b/.test(t)) return "DDR4";
  return null;
}

function socketCamp(socket) {
  if (socket === "AM4" || socket === "AM5") return "AMD";
  if (socket === "LGA1700" || socket === "LGA1200") return "Intel";
  return null;
}

function exampleBoardForSocket(socket) {
  if (socket === "AM5") return "B650 or X870";
  if (socket === "AM4") return "B550 or X570";
  if (socket === "LGA1700") return "B760 or Z790";
  if (socket === "LGA1200") return "B560 or Z590";
  return "a matching motherboard";
}

function compatibilityReply(ok, lines, suggestions) {
  return {
    text: lines.join(" "),
    suggest: suggestions || (ok
      ? ["Recommend a CPU", "Build me a gaming PC", "What is a motherboard?"]
      : ["Suggest a compatible board", "Recommend a CPU", "List all the parts"])
  };
}

function checkCompatibility(text) {
  const cpu = findPartMention(text, PC_DATA.CPUs);
  const board = findPartMention(text, PC_DATA.Motherboards);
  const gpu = findPartMention(text, PC_DATA.GPUs);
  const psu = findPartMention(text, PC_DATA.PSUs);
  const ram = findPartMention(text, PC_DATA.RAM);
  const socketMention = detectSocketMention(text);
  const ramTypeMention = detectRamTypeMention(text);

  // CPU + motherboard (socket)
  if (cpu && board) {
    if (cpu.socket === board.socket) {
      // Also warn if user dragged RAM type into the same question incorrectly
      if (ram && ram.type !== board.ramType) {
        return compatibilityReply(false, [
          pickRandom([
            "Socket-wise you’re fine, but the RAM isn’t.",
            "The CPU fits that board, but the memory type doesn’t.",
            "Half yes, half no — CPU socket matches, RAM does not."
          ]),
          cpu.name + " uses " + cpu.socket + ", which matches " + board.name + ".",
          "However " + ram.name + " is " + ram.type + " while that board wants " + board.ramType + ".",
          "Use " + board.ramType + " memory with that motherboard."
        ], ["Suggest DDR5 RAM", "Recommend a CPU", "Build me a gaming PC"]);
      }
      return compatibilityReply(true, [
        pickRandom([
          "Yes — that’s compatible.",
          "Yep, those two work together.",
          "Good news: that’s a valid pairing.",
          "Yes, you’re in the clear."
        ]),
        cpu.name + " and " + board.name + " both use the " + cpu.socket + " platform" +
          (board.ramType ? " (" + board.ramType + " board)" : "") + "."
      ]);
    }
    const cpuCamp = socketCamp(cpu.socket);
    const boardCamp = socketCamp(board.socket);
    const crossBrand = cpuCamp && boardCamp && cpuCamp !== boardCamp;
    return compatibilityReply(false, [
      pickRandom([
        "No — that’s not compatible.",
        "Nope, those don’t go together.",
        "That combo won’t work.",
        "Hard no on compatibility there."
      ]),
      cpu.name + " is a " + (cpu.brand || cpuCamp || "CPU") + " chip on " + cpu.socket + ", while " +
        board.name + " is " + board.socket +
        (crossBrand ? " (" + boardCamp + " platform)." : "."),
      crossBrand
        ? pickRandom([
            "AMD CPUs need AMD sockets (AM4/AM5); Intel CPUs need Intel sockets (LGA1200/LGA1700).",
            "You can’t drop an AMD Ryzen into an Intel LGA board, or the other way around.",
            "Different brands, different sockets — they physically won’t fit."
          ])
        : ("Pick a " + cpu.socket + " board such as " + exampleBoardForSocket(cpu.socket) + ".")
    ]);
  }

  // CPU + bare socket name (e.g. “Ryzen 5 7600 with LGA1700”)
  if (cpu && socketMention) {
    if (cpu.socket === socketMention) {
      return compatibilityReply(true, [
        pickRandom([
          "Yes — that socket matches.",
          "Yep, that’s the right platform.",
          "Correct: that CPU belongs on " + socketMention + "."
        ]),
        cpu.name + " uses " + cpu.socket + ". Look for boards like " + exampleBoardForSocket(cpu.socket) + "."
      ]);
    }
    const cpuCamp = socketCamp(cpu.socket);
    const sockCamp = socketCamp(socketMention);
    return compatibilityReply(false, [
      pickRandom([
        "No — that’s not compatible.",
        "Nope, wrong socket family.",
        "That won’t work — socket mismatch."
      ]),
      cpu.name + " needs " + cpu.socket +
        (cpuCamp ? " (" + cpuCamp + ")" : "") + ", not " + socketMention +
        (sockCamp ? " (" + sockCamp + ")" : "") + ".",
      cpuCamp && sockCamp && cpuCamp !== sockCamp
        ? pickRandom([
            "AMD chips don’t fit Intel LGA sockets, and Intel chips don’t fit AM4/AM5.",
            "That’s a cross-brand socket mix — physically incompatible.",
            "Stick to " + cpu.socket + " motherboards for that CPU."
          ])
        : ("Use a " + cpu.socket + " motherboard instead (e.g. " + exampleBoardForSocket(cpu.socket) + ").")
    ], ["Recommend a CPU", "What is a motherboard?", "Build me a gaming PC"]);
  }

  // RAM stick + motherboard
  if (ram && board) {
    if (ram.type === board.ramType) {
      return compatibilityReply(true, [
        pickRandom([
          "Yes — memory type matches.",
          "Yep, that RAM works with that board.",
          "Good pairing on the memory side."
        ]),
        ram.name + " is " + ram.type + ", and " + board.name + " supports " + board.ramType + "."
      ], ["Recommend a CPU", "Build me a gaming PC", "What is RAM?"]);
    }
    return compatibilityReply(false, [
      pickRandom([
        "No — that’s not compatible.",
        "Nope, DDR generation mismatch.",
        "That RAM won’t work in that board."
      ]),
      ram.name + " is " + ram.type + ", but " + board.name + " takes " + board.ramType + ".",
      pickRandom([
        "DDR4 and DDR5 are not interchangeable — the slots are different.",
        "You need " + board.ramType + " kits for that motherboard.",
        "Don’t mix DDR4 sticks with a DDR5 board (or the reverse)."
      ])
    ], ["What is RAM?", "Recommend a CPU", "Build me a gaming PC"]);
  }

  // Bare DDR4/DDR5 vs motherboard
  if (ramTypeMention && board) {
    if (ramTypeMention === board.ramType) {
      return compatibilityReply(true, [
        pickRandom(["Yes — that board wants " + ramTypeMention + ".", "Correct: " + board.name + " is a " + ramTypeMention + " board."]),
        "Pair it with a " + ramTypeMention + " kit."
      ]);
    }
    return compatibilityReply(false, [
      pickRandom(["No — wrong memory type.", "Nope, that board doesn’t take " + ramTypeMention + "."]),
      board.name + " supports " + board.ramType + ", not " + ramTypeMention + ".",
      "DDR4 and DDR5 modules are not cross-compatible."
    ]);
  }

  // RAM type vs CPU platform hints (AM5 = DDR5 only in our catalog)
  if (cpu && ramTypeMention && !board) {
    if (cpu.socket === "AM5" && ramTypeMention === "DDR4") {
      return compatibilityReply(false, [
        pickRandom(["No — AM5 doesn’t use DDR4.", "That won’t work with this CPU’s platform."]),
        cpu.name + " is AM5, which pairs with DDR5 motherboards only in typical desktop builds.",
        "Use DDR5 RAM (and an AM5 board like B650)."
      ]);
    }
    if ((cpu.socket === "AM4" || cpu.socket === "LGA1200") && ramTypeMention === "DDR5") {
      return compatibilityReply(false, [
        pickRandom(["No — that platform is DDR4 territory.", "That CPU’s common boards take DDR4, not DDR5."]),
        cpu.name + " (" + cpu.socket + ") is normally paired with DDR4 motherboards in this catalog.",
        "Grab DDR4 RAM instead, or move to a DDR5 platform (AM5 / many LGA1700 boards)."
      ]);
    }
  }

  if (gpu && psu) {
    if (psu.wattage >= gpu.recommendedPsu) {
      return compatibilityReply(true, [
        pickRandom(["Yes — that PSU should cover it.", "Wattage looks fine for that card.", "You’re good on power headroom."]),
        psu.name + " (" + psu.wattage + "W) meets the ~" + gpu.recommendedPsu + "W suggestion for " + gpu.name + "."
      ], ["Recommend a GPU", "Build me a gaming PC", "What is a PSU?"]);
    }
    return compatibilityReply(false, [
      pickRandom(["I’d be careful — that PSU looks light.", "Warning: wattage may be too low.", "That pairing is risky."]),
      psu.name + " is " + psu.wattage + "W, but " + gpu.name + " is usually paired with around " +
        gpu.recommendedPsu + "W.",
      "Step up to a higher-capacity PSU for safety."
    ], ["What is a PSU?", "Recommend a GPU", "Build me a gaming PC"]);
  }

  if (cpu && psu) {
    return {
      text: pickRandom([
        "CPU + PSU is rarely the bottleneck — total system draw (especially the GPU) matters more.",
        "A CPU alone won’t tell us much about PSU fit; the GPU usually sets the wattage target."
      ]) + " For a clear yes/no, ask about a GPU + PSU or a CPU + motherboard/socket " +
        "(example: “Can I use Ryzen 5 7600 with LGA1700?”).",
      suggest: ["Can I use Ryzen 5 7600 with LGA1700?", "Recommend a GPU", "What is a PSU?"]
    };
  }

  if (cpu && !board && !socketMention) {
    return {
      text: pickRandom([
        "I found " + cpu.name + " (" + cpu.socket + "). Tell me a motherboard, socket, or RAM type to check against.",
        cpu.name + " uses " + cpu.socket + ". Ask something like “with B650?” or “with LGA1700?”."
      ]),
      suggest: [
        "Can I use " + cpu.name + " with LGA1700?",
        "Can I use " + cpu.name + " with B650?",
        "What is a motherboard?"
      ]
    };
  }

  return {
    text: pickRandom([
      "I can check sockets, RAM types, and PSU wattage — try a specific pair.",
      "Give me two things to compare, like a CPU + socket or RAM + motherboard."
    ]) + " Examples: “Can I use Ryzen 5 7600 with LGA1700?”, “Will DDR4 work on a B650?”, or “RTX 4070 with a 650W PSU?”.",
    suggest: [
      "Can I use Ryzen 5 7600 with LGA1700?",
      "Will DDR4 work with B650?",
      "Recommend a CPU"
    ]
  };
}

// ----- Component info / best picks -----
function getComponentInfo(text) {
  const t = normalize(text);
  if (/gpu|graphics/.test(t)) return COMPONENT_INFO.gpu;
  if (/cpu|processor/.test(t)) return COMPONENT_INFO.cpu;
  if (/ram|memory/.test(t)) return COMPONENT_INFO.ram;
  if (/\bssd\b/.test(t)) return COMPONENT_INFO.ssd;
  if (/\bhdd\b/.test(t)) return COMPONENT_INFO.hdd;
  if (/storage|nvme/.test(t)) return COMPONENT_INFO.storage;
  if (/motherboard|mobo|chipset/.test(t)) return COMPONENT_INFO.motherboard;
  if (/psu|power supply/.test(t)) return COMPONENT_INFO.psu;
  if (/cooler|cooling/.test(t)) return COMPONENT_INFO.cooler;
  if (/case|chassis/.test(t)) return COMPONENT_INFO.case;
  return "I can explain CPUs, GPUs, RAM, storage, motherboards, PSUs, cases, and coolers. Which one do you want to know about?";
}

function isFaqQuestion(t) {
  if (/does\s+(nvidia|amd|intel)\s+make/.test(t)) return true;
  if (/do\s+(nvidia|amd|intel)\s+make/.test(t)) return true;
  if (/^(whats|what is|what s)\s+(nvidia|intel|amd)\b/.test(t)) return true;
  if (/who (is|are)\s+(nvidia|intel|amd)\b/.test(t)) return true;
  if (/(explain|list)\s+all\s+(the\s+)?parts/.test(t)) return true;
  if (/all the parts (for|of) a (pc|computer)/.test(t)) return true;
  if (/parts (for|of) a (pc|computer)/.test(t) && /(list|explain|what|all)/.test(t)) return true;
  if (/difference between|diff between|\bvs\b|\bversus\b/.test(t) &&
      /(gaming|streaming|programming|editing|office)/.test(t)) {
    return true;
  }
  if (/why\s+(does\s+|is\s+)?(amd|intel).*(better|faster|worse)/.test(t)) return true;
  if (/why\s+(does\s+|is\s+)?(nvidia|amd).*(better|faster|worse)/.test(t)) return true;
  return false;
}

function extractBrandMentions(text) {
  const t = normalize(text);
  const found = [];
  const patterns = [
    { re: /\bnvidia\b/g, brand: "NVIDIA" },
    { re: /\bamd\b/g, brand: "AMD" },
    { re: /\bintel\b/g, brand: "INTEL" }
  ];
  patterns.forEach(function (p) {
    let m;
    while ((m = p.re.exec(t)) !== null) {
      found.push({ brand: p.brand, index: m.index });
    }
  });
  found.sort(function (a, b) { return a.index - b.index; });
  return found.map(function (x) { return x.brand; });
}

function answerFaq(text) {
  const t = normalize(text);

  // Does Brand make CPUs/GPUs?
  const makes = t.match(/do(?:es)?\s+(nvidia|amd|intel)\s+make\s+(cpus?|gpus?|graphics cards?|processors?)/);
  if (makes) {
    const brand = makes[1];
    const product = makes[2];
    const wantsGpu = /gpu|graphics/.test(product);
    const wantsCpu = /cpu|processor/.test(product);

    if (brand === "nvidia") {
      if (wantsCpu) {
        return {
          text: "NVIDIA is mainly a GPU company (GeForce graphics cards). They don’t sell mainstream desktop CPUs like AMD or Intel. They do make specialized processors (for example data-center / AI chips), but for a normal PC build you’ll pair an Intel or AMD CPU with an NVIDIA GPU.",
          suggest: ["What is a GPU?", "Intel vs AMD", "Recommend a GPU"]
        };
      }
      return {
        text: "Yes — NVIDIA is best known for GPUs (GeForce RTX cards). That’s their main consumer product for gaming and creative PCs.",
        suggest: ["NVIDIA vs AMD", "Recommend a GPU", "What is a GPU?"]
      };
    }

    if (brand === "intel") {
      if (wantsGpu) {
        return {
          text: "Yes, Intel does make GPUs — mostly integrated graphics inside many of their CPUs, plus some discrete Arc GPUs. That said, NVIDIA still dominates the dedicated GPU market for gaming performance and features (DLSS, strong encoders, etc.).",
          suggest: ["Intel vs NVIDIA", "Does NVIDIA make CPUs?", "Recommend a GPU"]
        };
      }
      return {
        text: "Yes — Intel is primarily a CPU company (Core i3/i5/i7/i9). They’re one of the two big desktop CPU brands alongside AMD.",
        suggest: ["Intel vs AMD", "What is a CPU?", "Recommend a CPU"]
      };
    }

    if (brand === "amd") {
      if (wantsGpu) {
        return {
          text: "Yes — AMD makes both CPUs (Ryzen) and GPUs (Radeon). They’re the main alternative to NVIDIA for graphics cards and to Intel for processors.",
          suggest: ["AMD vs NVIDIA", "AMD vs Intel", "Recommend a GPU"]
        };
      }
      return {
        text: "Yes — AMD makes Ryzen CPUs (and also Radeon GPUs). They’re Intel’s main rival on the CPU side.",
        suggest: ["AMD vs Intel", "What is a CPU?", "Recommend a CPU"]
      };
    }
  }

  // What is NVIDIA / Intel / AMD?
  if (/^(whats|what is|what s|who is|who are)\s+(nvidia|intel|amd)\b/.test(t) ||
      /\bwhat is\s+(nvidia|intel|amd)\b/.test(t)) {
    if (/nvidia/.test(t)) {
      return {
        text: "NVIDIA is a tech company best known for GeForce GPUs. In PC building, “NVIDIA” usually means the graphics card brand (RTX 4060, 4070, 5090, etc.). They’re especially strong for gaming features like DLSS and for video encoding/streaming.",
        suggest: ["Does NVIDIA make CPUs?", "NVIDIA vs AMD", "Recommend a GPU"]
      };
    }
    if (/intel/.test(t)) {
      return {
        text: "Intel is a major CPU company. In PC building, “Intel” usually means processors like Core i5 / i7 / i9. Many Intel CPUs also include basic integrated graphics, though serious gaming still usually wants a discrete GPU.",
        suggest: ["Does Intel make GPUs?", "Intel vs AMD", "Recommend a CPU"]
      };
    }
    if (/\bamd\b/.test(t)) {
      return {
        text: "AMD (Advanced Micro Devices) makes both Ryzen CPUs and Radeon GPUs. They’re the main competitor to Intel on CPUs and to NVIDIA on graphics cards, and they’re popular for value and strong multi-core performance.",
        suggest: ["AMD vs Intel", "AMD vs NVIDIA", "Recommend a CPU"]
      };
    }
  }

  // List / explain all parts
  if (/(explain|list)\s+all\s+(the\s+)?parts/.test(t) ||
      /all the parts (for|of) a (pc|computer)/.test(t) ||
      (/parts (for|of) a (pc|computer)/.test(t) && /(list|explain|what|all)/.test(t))) {
    return {
      text: "Here are the main parts of a typical desktop PC:\n\n" +
        "1. CPU — the brain; runs programs and game logic\n" +
        "2. GPU — graphics card; handles games, 3D, and heavy video work\n" +
        "3. Motherboard — connects everything; must match the CPU socket\n" +
        "4. RAM — fast short-term memory for open apps/games\n" +
        "5. Storage (SSD/HDD) — where Windows, games, and files live\n" +
        "6. PSU — power supply; feeds electricity to all parts\n" +
        "7. Case — the chassis that holds the build\n" +
        "8. CPU cooler — keeps the processor from overheating\n\n" +
        "Optional extras: case fans, Wi‑Fi card, extra drives.\n\n" +
        "Ask about any one part (like “What is a PSU?”) or tell me a budget for a full build.",
      suggest: ["What is a CPU?", "What is a GPU?", "What is a PSU?", "Build me a gaming PC"]
    };
  }

  // Gaming vs streaming vs programming
  if (/(difference between|diff between|\bvs\b|\bversus\b)/.test(t) &&
      /(gaming|streaming|programming|editing|office)/.test(t)) {
    return {
      text: "Quick differences between common PC types:\n\n" +
        "• Gaming PC — prioritizes a strong GPU (and a solid CPU). Resolution/FPS matter a lot.\n" +
        "• Streaming PC — needs a good GPU and a stronger CPU (or NVIDIA encoder features) so you can play and encode video at the same time.\n" +
        "• Programming PC — usually cares more about CPU, RAM (32GB is nice), and fast SSD storage; a high-end GPU is optional unless you do ML/3D.\n" +
        "• Editing PC — likes more CPU cores, plenty of RAM, a capable GPU, and large fast storage.\n\n" +
        "Tell me which one you want and your budget, and I’ll recommend a build.",
      suggest: ["Build me a gaming PC", "I need a PC for programming", "Build within my budget"]
    };
  }

  // Why AMD/Intel/NVIDIA better
  if (/why\s+(does\s+|is\s+)?amd.*better/.test(t)) {
    return {
      text: "AMD isn’t always better — it depends on the workload. Ryzen (especially X3D chips) often leads in gaming efficiency and can offer great multi-core value. Intel can still win in some productivity tasks and high clock-speed scenarios. The “better” CPU is the one that fits your games/apps and budget.",
      suggest: ["Intel vs AMD", "Recommend a CPU", "Build me a gaming PC"]
    };
  }
  if (/why\s+(does\s+|is\s+)?intel.*better/.test(t)) {
    return {
      text: "Intel isn’t automatically better either. They can be excellent for productivity and some high-frequency workloads, while AMD often competes hard (or leads) in gaming and multi-core value. Compare specific CPUs for your use case instead of the brand alone.",
      suggest: ["Intel vs AMD", "Recommend a CPU", "What is a CPU?"]
    };
  }
  if (/why\s+(does\s+|is\s+)?nvidia.*better/.test(t)) {
    return {
      text: "NVIDIA often feels “better” for many gamers because of features like DLSS, strong ray tracing, and excellent encoders for streaming. AMD can still be great value for raw frames. Again: compare specific cards in your budget.",
      suggest: ["NVIDIA vs AMD", "Recommend a GPU", "What is a GPU?"]
    };
  }

  return {
    text: "I can help with PC parts, brands (NVIDIA / AMD / Intel), budgets, and full builds. Try asking something like “What is a GPU?” or “Does Intel make GPUs?”",
    suggest: ["List all the parts", "What is NVIDIA?", "Intel vs AMD"]
  };
}

function answerBestPick(text) {
  const t = normalize(text);
  const use = detectUseCase(t) || "gaming";
  const brands = detectBrands(text);

  if (/gpu|graphics/.test(t)) {
    let id = BEST_PICKS.gpu;
    if (brands.gpuBrand === "AMD" || (/\bamd\b/.test(t) && !/nvidia/.test(t))) id = BEST_PICKS.gpuAmd;
    if (brands.gpuBrand === "NVIDIA" || /nvidia/.test(t)) id = BEST_PICKS.gpuNvidia;
    const gpu = findById(PC_DATA.GPUs, id);
    return "For " + use + ", I'd point to the " + gpu.name + ".\n\n" +
      "• VRAM: " + gpu.vram + "GB\n" +
      "• Approx. price: " + formatMoney(gpu.price) + "\n" +
      "• Suggested PSU: ~" + gpu.recommendedPsu + "W\n" +
      "• " + gpu.notes + "\n\n" +
      "If your budget is lower, tell me a number and I'll recommend a realistic card.";
  }

  if (/cpu|processor/.test(t)) {
    let id = BEST_PICKS.cpu;
    if (use === "editing" || use === "programming" || use === "streaming") {
      id = BEST_PICKS.cpuProductivity;
    }
    if (brands.cpuBrand === "Intel" || (/\bintel\b/.test(t) && !/\bamd\b/.test(t))) {
      id = BEST_PICKS.cpuIntel;
    }
    if (brands.cpuBrand === "AMD" || (/\bamd\b/.test(t) && !/\bintel\b/.test(t))) {
      id = use === "gaming" ? BEST_PICKS.cpuAmd : BEST_PICKS.cpuProductivity;
    }
    const cpu = findById(PC_DATA.CPUs, id);
    return "For " + use + ", a top pick from the catalog is the " + cpu.name + ".\n\n" +
      "• " + cpu.cores + " cores / " + cpu.threads + " threads\n" +
      "• Socket: " + cpu.socket + "\n" +
      "• Approx. price: " + formatMoney(cpu.price) + "\n" +
      "• " + cpu.notes;
  }

  if (/ram|memory/.test(t)) {
    const ram = findById(PC_DATA.RAM, BEST_PICKS.ram);
    return "A strong all-round RAM kit is " + ram.name + " (~" + formatMoney(ram.price) + "). " + ram.notes;
  }

  if (/ssd|storage/.test(t)) {
    const ssd = findById(PC_DATA.Storage, BEST_PICKS.storage);
    return "A great default storage drive is the " + ssd.name + " (~" + formatMoney(ssd.price) + "). " + ssd.notes;
  }

  return "I can suggest best picks for CPU, GPU, RAM, or storage. What are you asking about?";
}

function brandCompareAnswer(text) {
  const t = normalize(text);
  const brands = extractBrandMentions(text);
  const a = brands[0] || null;
  const b = brands[1] || null;

  const suggestions = [
    "NVIDIA vs AMD",
    "Intel vs AMD",
    "Intel vs NVIDIA",
    "Which is better RTX 4090 or RTX 5090?"
  ];

  // Same brand twice: "nvidia or nvidia"
  if (a && b && a === b) {
    return {
      text: "Both are the same — please choose a valid comparison.\n\n" +
        "Try comparing different brands or products, for example:\n" +
        "• NVIDIA vs AMD (GPUs)\n" +
        "• Intel vs AMD (CPUs)\n" +
        "• Intel vs NVIDIA (GPUs)\n" +
        "• RTX 4090 vs RTX 5090 (specific cards)",
      suggest: suggestions
    };
  }

  if (a && b) {
    const pair = [a, b].sort().join(":");
    let body;

    if (pair === "INTEL:NVIDIA") {
      body = "Even though Intel makes GPUs (integrated graphics, plus some Arc cards), NVIDIA dominates the dedicated GPU market for gaming performance and features like DLSS and strong video encoders.\n\n" +
        "• Choose NVIDIA when you want a discrete gaming/creator GPU\n" +
        "• Choose Intel mainly for CPUs (and light iGPU use)\n\n" +
        "If you meant CPUs, compare Intel vs AMD instead.";
    } else if (pair === "AMD:NVIDIA") {
      body = "For GPUs, NVIDIA vs AMD (Radeon) is the real fight:\n\n" +
        "• NVIDIA — usually stronger feature set (DLSS, ray tracing, encoders); great for gaming + streaming\n" +
        "• AMD — often strong raster performance and value for the money\n\n" +
        "Neither wins every price point — tell me your budget and I’ll recommend a card.";
    } else if (pair === "AMD:INTEL") {
      body = "For CPUs, Intel vs AMD is the classic matchup:\n\n" +
        "• AMD Ryzen — often excellent gaming value (especially X3D) and strong multi-core performance\n" +
        "• Intel Core — great productivity options and competitive gaming chips depending on the generation\n\n" +
        "There isn’t one forever-winner; it depends on your games/apps and budget.";
    } else {
      body = "I can compare NVIDIA, AMD, and Intel for you. Ask about GPUs (NVIDIA vs AMD) or CPUs (Intel vs AMD).";
    }

    return {
      text: body,
      suggest: suggestions
    };
  }

  // Fallback if only one brand / vague compare
  if (/gpu|graphics|nvidia|radeon/.test(t)) {
    return {
      text: "For GPUs: NVIDIA often leads in features like DLSS and encoders (great for gaming + streaming). AMD can offer strong raster performance and value. If you care about streaming features, NVIDIA is usually safer; if you want max FPS per dollar, compare specific cards in your budget.",
      suggest: suggestions
    };
  }

  return {
    text: "For CPUs: AMD Ryzen often shines in gaming (especially X3D chips) and multi-core value. Intel can be excellent for productivity and high clock speeds. Neither brand is always “best” — it depends on your budget and whether you care more about gaming or creation work.",
    suggest: suggestions
  };
}

function answerPriceCheck(text) {
  const cpu = findPartMention(text, PC_DATA.CPUs);
  const gpu = findPartMention(text, PC_DATA.GPUs);
  const ram = findPartMention(text, PC_DATA.RAM);
  const storage = findPartMention(text, PC_DATA.Storage);
  const board = findPartMention(text, PC_DATA.Motherboards);
  const psu = findPartMention(text, PC_DATA.PSUs);
  const cooler = findPartMention(text, PC_DATA.Coolers);
  const pcCase = findPartMention(text, PC_DATA.Cases);
  const t = normalize(text);

  const part = cpu || gpu || ram || storage || board || psu || cooler || pcCase;
  if (part) {
    let extra = "";
    if (gpu) {
      state.lastSuggestedPart = { kind: "gpu", id: gpu.id, name: gpu.name };
      extra = "\n• VRAM: " + gpu.vram + "GB" +
        "\n• 4K suitability: " + estimatePerf4k(gpu) + "/5" +
        (estimatePerf4k(gpu) >= 5 ? " (excellent for 4K)" : estimatePerf4k(gpu) >= 4 ? " (good 4K option)" : " (better for 1080p/1440p)");
    }
    if (cpu) {
      state.lastSuggestedPart = { kind: "cpu", id: cpu.id, name: cpu.name };
      extra = "\n• " + cpu.cores + "C/" + cpu.threads + "T · Socket " + cpu.socket;
    }
    if (gpu || cpu) state.awaitingConfirm = "buildAroundPart";
    return {
      text: part.name + " is about " + formatMoney(part.price) + " in this catalog." + extra +
        "\n\nDo you want me to build a whole PC around it?",
      suggest: ["Yes please", "No thanks", "Recommend a GPU"]
    };
  }

  if (/(pc|computer|system|build|rig)/.test(t) || /how much for a/.test(t)) {
    return {
      text: "Rough complete-PC budget guide (USD, parts only):\n" +
        "• $400–$700 — office/school or very light use (often iGPU)\n" +
        "• $800–$1200 — solid 1080p / entry 1440p gaming\n" +
        "• $1200–$1800 — strong 1440p gaming & creators\n" +
        "• $1800–$3000+ — high-end / 4K (RTX 4080–5090 class territory)\n\n" +
        "Tell me your use case and a budget (or something like 1200+), and I’ll recommend a build.",
      suggest: ["Build me a gaming PC", "4K gaming", "$1200+", "Recommend a GPU"]
    };
  }

  return {
    text: "Tell me which part you mean (for example “How much does the RTX 5090 cost?”) or ask “How much for a PC?” for budget ranges."
  };
}

// ----- Recommendation engine -----
function pickFromList(list, options) {
  options = options || {};
  const budget = options.budget;
  const brand = options.brand;
  const tier = options.tier;
  const useCase = options.useCase;
  const maxPrice = options.maxPrice;
  const preferPerfKey = options.preferPerfKey; // perf1080p | perf1440p
  const minPerf = options.minPerf || 0;
  const filterFn = options.filterFn;

  let candidates = list.slice();

  if (filterFn) candidates = candidates.filter(filterFn);
  if (brand) {
    candidates = candidates.filter(function (p) {
      return normalize(p.brand) === normalize(brand);
    });
  }
  if (maxPrice != null) {
    candidates = candidates.filter(function (p) { return p.price <= maxPrice; });
  }

  if (!candidates.length) return null;

  candidates.sort(function (a, b) {
    let scoreA = 0;
    let scoreB = 0;

    // Prefer matching tier
    if (tier) {
      scoreA -= Math.abs(tierRank(a.tier) - tierRank(tier)) * 5;
      scoreB -= Math.abs(tierRank(b.tier) - tierRank(tier)) * 5;
    }

    scoreA += scorePartForUse(a, useCase);
    scoreB += scorePartForUse(b, useCase);

    if (preferPerfKey) {
      const perfA = preferPerfKey === "perf4k" ? getGpuPerf(a, "4k") : (a[preferPerfKey] != null ? a[preferPerfKey] : 0);
      const perfB = preferPerfKey === "perf4k" ? getGpuPerf(b, "4k") : (b[preferPerfKey] != null ? b[preferPerfKey] : 0);
      scoreA += perfA;
      scoreB += perfB;
      if (perfA < minPerf) scoreA -= 10;
      if (perfB < minPerf) scoreB -= 10;
    }

    // Prefer spending closer to a target slice of budget
    if (budget && options.targetShare) {
      const target = budget * options.targetShare;
      scoreA -= Math.abs(a.price - target) / 50;
      scoreB -= Math.abs(b.price - target) / 50;
    }

    // For "1200+" style budgets, prefer not going cheap
    if (options.minSpend) {
      if (a.price >= options.minSpend) scoreA += 3;
      if (b.price >= options.minSpend) scoreB += 3;
    }

    if (scoreA !== scoreB) return scoreB - scoreA;
    return b.price - a.price;
  });

  return candidates[0];
}

// Like pickFromList, but rotates among top matches and skips recently suggested ids
function pickVariedFromList(list, options, excludeIds, topN) {
  options = options || {};
  excludeIds = excludeIds || [];
  topN = topN || 5;

  function collect(exclude) {
    const ranked = rankCandidates(list, options);
    if (!ranked.length) return [];
    const fresh = ranked.filter(function (p) {
      return exclude.indexOf(p.id) === -1;
    });
    return (fresh.length ? fresh : ranked).slice(0, topN);
  }

  let pool = collect(excludeIds);
  if (!pool.length) pool = collect([]);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function rankCandidates(list, options) {
  options = options || {};
  const budget = options.budget;
  const brand = options.brand;
  const tier = options.tier;
  const useCase = options.useCase;
  const maxPrice = options.maxPrice;
  const preferPerfKey = options.preferPerfKey;
  const minPerf = options.minPerf || 0;
  const filterFn = options.filterFn;

  let candidates = list.slice();
  if (filterFn) candidates = candidates.filter(filterFn);
  if (brand) {
    candidates = candidates.filter(function (p) {
      return normalize(p.brand) === normalize(brand);
    });
  }
  if (maxPrice != null) {
    candidates = candidates.filter(function (p) { return p.price <= maxPrice; });
  }
  if (!candidates.length) return [];

  candidates.sort(function (a, b) {
    let scoreA = 0;
    let scoreB = 0;
    if (tier) {
      scoreA -= Math.abs(tierRank(a.tier) - tierRank(tier)) * 5;
      scoreB -= Math.abs(tierRank(b.tier) - tierRank(tier)) * 5;
    }
    scoreA += scorePartForUse(a, useCase);
    scoreB += scorePartForUse(b, useCase);
    if (preferPerfKey) {
      const perfA = preferPerfKey === "perf4k" ? getGpuPerf(a, "4k") : (a[preferPerfKey] != null ? a[preferPerfKey] : 0);
      const perfB = preferPerfKey === "perf4k" ? getGpuPerf(b, "4k") : (b[preferPerfKey] != null ? b[preferPerfKey] : 0);
      scoreA += perfA;
      scoreB += perfB;
      if (perfA < minPerf) scoreA -= 10;
      if (perfB < minPerf) scoreB -= 10;
    }
    if (budget && options.targetShare) {
      const target = budget * options.targetShare;
      scoreA -= Math.abs(a.price - target) / 50;
      scoreB -= Math.abs(b.price - target) / 50;
    }
    if (options.minSpend) {
      if (a.price >= options.minSpend) scoreA += 3;
      if (b.price >= options.minSpend) scoreB += 3;
    }
    if (scoreA !== scoreB) return scoreB - scoreA;
    return b.price - a.price;
  });

  return candidates;
}

function rememberRecentPart(kind, id) {
  if (!id) return;
  const key = kind === "gpu" ? "recentGpuIds" : "recentCpuIds";
  if (!state[key]) state[key] = [];
  state[key] = state[key].filter(function (x) { return x !== id; });
  state[key].unshift(id);
  if (state[key].length > 6) state[key].length = 6;
}

function recommendSinglePart(kind, opts) {
  opts = opts || {};
  const useCase = state.useCase || "gaming";
  // Part-only budget — does not have to match a full-PC floor
  const budget = opts.budget != null ? opts.budget : state.budget;
  const budgetIsMinimum = opts.budgetIsMinimum != null ? !!opts.budgetIsMinimum : !!state.budgetIsMinimum;
  const tier = getBudgetTier(Math.max(budget, MIN_USABLE_BUDGET), budgetIsMinimum);
  const res = state.resolution || "1080p";
  const perfKey = getPerfKey(res);
  const spendFloor = budgetIsMinimum ? budget * 0.55 : 0;
  const absurd = isAbsurdBudget(budget);

  if (kind === "gpu") {
    if (!absurd && budget < 150) {
      return {
        text: "At around " + formatMoney(budget) + ", a discrete GPU usually isn't affordable. " +
          "I'd suggest raising your GPU budget to about $150–$400+, or ask for an iGPU CPU instead.",
        suggest: ["Suggest a CPU", "$400 GPU", "Build me a gaming PC"]
      };
    }

    const gpu = absurd
      ? pickMostExpensivePart(PC_DATA.GPUs, state.gpuBrand)
      : pickVariedFromList(PC_DATA.GPUs, {
          brand: state.gpuBrand,
          tier: tier,
          useCase: useCase,
          maxPrice: budgetIsMinimum
            ? Math.max(budget * 1.5, budget + 400)
            : Math.max(budget, 150),
          budget: budget,
          targetShare: 0.95,
          preferPerfKey: perfKey,
          minPerf: minPerfForResolution(res),
          minSpend: spendFloor
        }, state.recentGpuIds || [], 6);

    if (!gpu) {
      return { text: "I couldn't find a GPU in that budget. Try a higher amount or say “no preference” on brands." };
    }

    rememberRecentPart("gpu", gpu.id);
    state.lastSuggestedPart = { kind: "gpu", id: gpu.id, name: gpu.name };
    state.awaitingConfirm = "buildAroundPart";
    const lead = absurd
      ? "At " + formatMoney(budget) + " for a GPU, you’ve blown past every card in the catalog — so here’s the top performer: "
      : "For about " + formatMoney(budget) + " on the GPU alone, I'd recommend the ";
    return {
      text: lead + gpu.name + " (~" + formatMoney(gpu.price) + ").\n" +
        "• VRAM: " + gpu.vram + "GB\n" +
        "• Suggested PSU: ~" + gpu.recommendedPsu + "W\n" +
        "• " + gpu.notes +
        "\n\nDo you want me to build a whole PC around it?",
      suggest: ["Yes please", "No thanks", absurd ? "Build the best PC possible" : "Another option"]
    };
  }

  // CPU — spend up to the part budget (not a full-PC slice)
  const cpu = absurd
    ? pickMostExpensivePart(PC_DATA.CPUs, state.cpuBrand)
    : pickVariedFromList(PC_DATA.CPUs, {
        brand: state.cpuBrand,
        tier: tier,
        useCase: useCase,
        maxPrice: budgetIsMinimum
          ? Math.max(budget * 1.4, budget + 200)
          : Math.max(budget, 80),
        budget: budget,
        targetShare: 0.95,
        minSpend: spendFloor,
        filterFn: null
      }, state.recentCpuIds || [], 6);

  if (!cpu) {
    return {
      text: "I couldn't find a CPU around " + formatMoney(budget) +
        ". Try a bit more (many solid options start near $100–$150), or say “no preference” on brands."
    };
  }

  rememberRecentPart("cpu", cpu.id);
  state.lastSuggestedPart = { kind: "cpu", id: cpu.id, name: cpu.name };
  state.awaitingConfirm = "buildAroundPart";
  const lead = absurd
    ? "At " + formatMoney(budget) + " for a CPU, price isn’t the limiter — here’s the strongest option in the catalog: "
    : "For about " + formatMoney(budget) + " on the CPU alone, I'd recommend the ";
  return {
    text: lead + cpu.name + " (~" + formatMoney(cpu.price) + ").\n" +
      "• " + cpu.cores + " cores / " + cpu.threads + " threads\n" +
      "• Socket: " + cpu.socket +
      (cpu.hasIgpu ? "\n• Has integrated graphics (iGPU)" : "\n• Needs a discrete GPU") +
      "\n• " + cpu.notes +
      "\n\nDo you want me to build a whole PC around it?",
    suggest: ["Yes please", "No thanks", absurd ? "Build the best PC possible" : "Another option"]
  };
}

function flagshipPartsTotal() {
  // Sum of the catalog’s default no-compromise stack (used as the “best PC” threshold)
  const ids = [
    ["CPUs", "r7-9800x3d"],
    ["GPUs", "rtx-5090"],
    ["RAM", "ram-64-ddr5-6000"],
    ["Storage", "nvme-2x2tb"],
    ["Motherboards", "x870e-atx"],
    ["PSUs", "psu-1600-platinum"],
    ["Cases", "case-hyte-y70-touch"],
    ["Coolers", "cooler-360-aio"]
  ];
  let total = 0;
  ids.forEach(function (pair) {
    const part = findById(PC_DATA[pair[0]], pair[1]);
    if (part) total += part.price;
  });
  return total;
}

function canAffordFlagshipBuild(budget) {
  return budget != null && budget >= flagshipPartsTotal();
}

function buildDreamBuild(opts) {
  opts = opts || {};
  let cpu = findById(PC_DATA.CPUs, "r7-9800x3d") || findById(PC_DATA.CPUs, PC_DATA.BEST_PICKS.cpu);
  let gpu = findById(PC_DATA.GPUs, "rtx-5090") || findById(PC_DATA.GPUs, PC_DATA.BEST_PICKS.gpu);
  const ram = findById(PC_DATA.RAM, "ram-64-ddr5-6000");
  const storage = findById(PC_DATA.Storage, "nvme-2x2tb");
  let motherboard = findById(PC_DATA.Motherboards, "x870e-atx");
  const psu = findById(PC_DATA.PSUs, "psu-1600-platinum");
  const pcCase = findById(PC_DATA.Cases, "case-hyte-y70-touch");
  const cooler = findById(PC_DATA.Coolers, "cooler-360-aio") || findById(PC_DATA.Coolers, "cooler-420-aio");

  // Honor brand prefs with the strongest matching parts
  if (opts.cpuBrand) {
    cpu = pickMostExpensivePart(PC_DATA.CPUs, opts.cpuBrand) || cpu;
  }
  if (opts.gpuBrand) {
    gpu = pickMostExpensivePart(PC_DATA.GPUs, opts.gpuBrand) || gpu;
  }
  if (cpu) {
    const boards = PC_DATA.Motherboards.filter(function (m) { return m.socket === cpu.socket; });
    motherboard = pickMostExpensivePart(boards, null) || motherboard;
  }

  const budget = opts.budget != null ? opts.budget : null;
  const reason = budget != null
    ? "Your budget (" + formatMoney(budget) + ") covers the catalog’s top-tier parts, so this is the no-compromise flagship stack: " +
      (gpu ? gpu.name : "flagship GPU") + ", " + (cpu ? cpu.name : "flagship CPU") +
      ", 64GB DDR5, dual 2TB NVMe, 1600W PSU, HYTE Y70 Touch, and a 360mm AIO."
    : "No budget limit — this is an all-out flagship stack: RTX 5090, Ryzen 7 9800X3D, 64GB DDR5, dual 2TB NVMe, 1600W PSU, HYTE Y70 Touch, and a 360mm AIO.";

  const build = {
    cpu: cpu,
    gpu: gpu,
    ram: ram,
    storage: storage,
    motherboard: motherboard,
    psu: psu,
    case: pcCase,
    cooler: cooler,
    total: 0,
    budget: budget,
    useCase: opts.useCase || state.useCase || "gaming",
    resolution: opts.resolution || state.resolution || "4k",
    reason: reason
  };

  build.total =
    (cpu ? cpu.price : 0) +
    (gpu ? gpu.price : 0) +
    (ram ? ram.price : 0) +
    (storage ? storage.price : 0) +
    (motherboard ? motherboard.price : 0) +
    (psu ? psu.price : 0) +
    (pcCase ? pcCase.price : 0) +
    (cooler ? cooler.price : 0);

  return build;
}

function replyDreamBuild(intro, budget) {
  state.awaiting = null;
  state.awaitingPart = null;
  state.budget = budget != null ? budget : state.budget;
  state.budgetIsMinimum = false;
  state.useCase = state.useCase || "gaming";
  state.resolution = state.resolution || "4k";
  const dream = buildDreamBuild({
    budget: budget != null ? budget : state.budget,
    cpuBrand: state.cpuBrand,
    gpuBrand: state.gpuBrand,
    useCase: state.useCase,
    resolution: state.resolution
  });
  state.lastBuild = dream;
  state.selectedComponents = dream;
  state.awaitingConfirm = "makeCheaper";
  return {
    text: intro,
    build: dream,
    suggest: ["Make it cheaper", "Upgrade the GPU", "Suggest a GPU"]
  };
}

function recommendGpuUpgrade(opts) {
  opts = opts || {};
  const budget = opts.budget != null ? opts.budget : state.budget;
  const budgetIsMinimum = opts.budgetIsMinimum != null ? !!opts.budgetIsMinimum : !!state.budgetIsMinimum;
  const current = state.lastBuild && state.lastBuild.gpu ? state.lastBuild.gpu : null;
  const res = state.resolution || "1440p";
  const useCase = state.useCase || "gaming";
  const absurd = isAbsurdBudget(budget) || canAffordFlagshipBuild(budget);

  if (current && isTopGpu(current, state.gpuBrand)) {
    return replyAlreadyMaxed("gpu", current);
  }

  if (!absurd && budget < 150 && (!current || budget <= current.price)) {
    return {
      text: "That GPU budget is still too low for a meaningful upgrade. Try something like $400+."
    };
  }

  const minPrice = current ? current.price + 20 : 0;
  let gpu = absurd
    ? pickMostExpensivePart(PC_DATA.GPUs, state.gpuBrand)
    : pickVariedFromList(PC_DATA.GPUs, {
        brand: state.gpuBrand,
        useCase: useCase,
        maxPrice: budgetIsMinimum ? budget * 1.5 : budget,
        budget: budget,
        targetShare: 0.9,
        preferPerfKey: getPerfKey(res),
        minPerf: minPerfForResolution(res),
        minSpend: Math.max(minPrice, budgetIsMinimum ? budget * 0.5 : 0),
        filterFn: function (g) {
          if (current && g.id === current.id) return false;
          return isStrictlyBetterGpu(g, current);
        }
      }, state.recentGpuIds || [], 6);

  // Never accept a weaker/cheaper card as an “upgrade”
  if (gpu && current && !isStrictlyBetterGpu(gpu, current)) {
    gpu = null;
  }
  if (gpu && current && gpu.id === current.id) {
    return replyAlreadyMaxed("gpu", current);
  }

  if (!gpu) {
    if (current && isTopGpu(current, state.gpuBrand)) {
      return replyAlreadyMaxed("gpu", current);
    }
    return {
      text: pickRandom([
        "I couldn’t find a stronger GPU within " + formatMoney(budget) +
          (current ? " than your " + current.name : "") + ".",
        "Nothing in that GPU budget beats" +
          (current ? " the " + current.name : " your current card") + "."
      ]) +
        " I won’t downgrade you on an upgrade request — try a higher GPU budget, or say “Make it cheaper” if you want a less expensive card on purpose.",
      suggest: ["$800", "$1000+", "Make it cheaper", "Build the best PC possible"]
    };
  }

  rememberRecentPart("gpu", gpu.id);
  state.lastSuggestedPart = { kind: "gpu", id: gpu.id, name: gpu.name };
  state.lockedGpuId = gpu.id;
  state.awaitingConfirm = "buildAroundPart";

  let delta = "";
  if (current) {
    delta = "\n\nUpgrade from " + current.name + " (~" + formatMoney(current.price) +
      ") → " + gpu.name + " (~" + formatMoney(gpu.price) + ").";
  }

  return {
    text: "For a GPU budget of about " + formatMoney(budget) +
      (budgetIsMinimum ? "+" : "") + ", I'd upgrade you to the " + gpu.name +
      " (~" + formatMoney(gpu.price) + ").\n" +
      "• VRAM: " + gpu.vram + "GB\n" +
      "• 1440p: " + (gpu.perf1440p || "?") + "/5 · 4K: " + estimatePerf4k(gpu) + "/5\n" +
      "• Suggested PSU: ~" + gpu.recommendedPsu + "W\n" +
      "• " + gpu.notes + delta +
      "\n\nWant me to rebuild the full PC around this GPU?",
    suggest: ["Yes please", "No thanks", "Another option"]
  };
}

function handleConfirmation(userText) {
  const confirmType = state.awaitingConfirm;
  if (!confirmType) return null;

  const t = normalize(userText);

  // “Build a PC around it” counts as yes for that confirm prompt
  if (confirmType === "buildAroundPart" && /build (a |the )?pc around|build around (it|that|this)/.test(t)) {
    return handleConfirmation("yes please");
  }

  // Let dedicated actions interrupt a yes/no prompt
  if (
    /\bupgrade( the)? gpu\b/.test(t) ||
    /\bupgrade( the)? cpu\b/.test(t) ||
    /\bmake\b.*\bcheaper\b/.test(t) ||
    /\b(recommend|suggest|propose|pick|choose)\b.{0,24}\b(gpu|cpu|processor|graphics card)\b/.test(t) ||
    /\b(reset|new build|start over)\b/.test(t) ||
    isUnlimitedBudgetAsk(t) ||
    isExplicitBudgetUpdate(t) ||
    (/\bbudget\b/.test(t) && evaluateBudgetInput(userText).status === "ok")
  ) {
    state.awaitingConfirm = null;
    return null;
  }

  const wantsAnother =
    /\b(another|different|other|else|new one|something else)\b/.test(t);

  if (wantsAnother && (confirmType === "buildAroundPart" || confirmType === "anotherPart")) {
    state.awaitingConfirm = null;
    const kind = (state.lastSuggestedPart && state.lastSuggestedPart.kind) || "gpu";
    // If we were upgrading a GPU, offer another upgrade pick
    if (state.lastBuild && state.lastBuild.gpu && kind === "gpu") {
      if (isTopGpu(state.lastBuild.gpu, state.gpuBrand) ||
          (state.lastSuggestedPart && isTopGpu(findById(PC_DATA.GPUs, state.lastSuggestedPart.id), state.gpuBrand))) {
        const maxGpu = findById(PC_DATA.GPUs, state.lastSuggestedPart && state.lastSuggestedPart.id) ||
          state.lastBuild.gpu;
        return replyAlreadyMaxed("gpu", maxGpu);
      }
      if (state.budget == null) {
        state.awaiting = "budget";
        state.awaitingPart = "gpuUpgrade";
        return {
          text: "Okay — what's your GPU budget for another option?",
          suggest: ["$400", "$600", "$800", "$1000+"]
        };
      }
      return recommendGpuUpgrade();
    }
    if (kind === "cpu" && state.lastBuild && state.lastBuild.cpu &&
        isTopCpu(state.lastBuild.cpu, state.cpuBrand)) {
      return replyAlreadyMaxed("cpu", state.lastBuild.cpu);
    }
    if (state.budget == null) {
      state.awaiting = "budget";
      state.awaitingPart = kind;
      return {
        text: "Okay — what's your budget for the " + kind.toUpperCase() + "?",
        suggest: ["$300", "$500", "$700"]
      };
    }
    return recommendSinglePart(kind);
  }

  if (detectAffirmative(userText)) {
    if (confirmType === "buildAroundPart") {
      state.awaitingConfirm = null;
      const suggested = state.lastSuggestedPart;
      if (suggested && suggested.kind === "gpu") {
        state.lockedGpuId = suggested.id;
        state.lockedCpuId = null;
      } else if (suggested && suggested.kind === "cpu") {
        state.lockedCpuId = suggested.id;
        state.lockedGpuId = null;
      }

      // Full PC usually needs more than a single-part budget
      if (state.budget != null && suggested) {
        const part = suggested.kind === "gpu"
          ? findById(PC_DATA.GPUs, suggested.id)
          : findById(PC_DATA.CPUs, suggested.id);
        if (part && state.budget < part.price * 2) {
          state.budget = Math.round(Math.max(state.budget + part.price, part.price * 2.2));
        }
      }

      if (!state.useCase) state.useCase = "gaming";

      const missing = nextBuildQuestion();
      if (missing) {
        return {
          text: "Awesome — let's build a full PC around the " +
            (suggested ? suggested.name : "part") + ".\n\n" + missing
        };
      }

      const build = recommendBuild();
      state.lastBuild = build;
      state.selectedComponents = build;
      state.lockedGpuId = null;
      state.lockedCpuId = null;
      return {
        text: "Here's a full PC built around the " +
          (suggested ? suggested.name : "recommended part") + ":",
        build: build
      };
    }

    if (confirmType === "makeCheaper") {
      state.awaitingConfirm = null;
      if (state.budget != null) state.budget = Math.max(400, Math.round(state.budget * 0.85));
      const build = recommendBuild({ preferCheaper: true });
      state.lastBuild = build;
      state.selectedComponents = build;
      return { text: "Here's a more budget-friendly take:", build: build };
    }

    state.awaitingConfirm = null;
    return { text: "Great — what would you like to do next?" };
  }

  if (detectNegative(userText)) {
    state.awaitingConfirm = null;
    if (confirmType === "buildAroundPart") {
      return {
        text: "No problem. You can ask for another option, or come back anytime for a full build.",
        suggest: ["Recommend a GPU", "Recommend a CPU", "Build me a gaming PC"]
      };
    }
    if (confirmType === "makeCheaper" || confirmType === "upgradeGpu") {
      return {
        text: "Okay, I'll leave this build as-is. Want anything else?",
        suggest: ["My prefs", "Recommend a GPU", "Reset chat"]
      };
    }
    return { text: "Okay — tell me what you'd like to do instead." };
  }

  return { text: awaitingInvalidReply("confirm"), suggest: ["Yes please", "No thanks"] };
}

function buildReason(build) {
  const use = build.useCase || "general use";
  const res = build.resolution ? " at " + build.resolution : "";
  const tier = getBudgetTier(build.budget);
  if (!build.gpu) {
    return "At this budget a discrete GPU usually isn't affordable, so this build uses a CPU with integrated graphics for " +
      use + ". It's best for light tasks; raise the budget if you want a dedicated GPU.";
  }
  return "This configuration is balanced for " + use + res +
    " in the " + tier + "-budget range, with compatible parts and room for future upgrades.";
}

function recommendBuild(opts) {
  opts = opts || {};
  const budget = opts.budget != null ? opts.budget : state.budget;
  const useCase = opts.useCase || state.useCase || "gaming";
  let resolution = opts.resolution || state.resolution ||
    (needsResolution(useCase) ? "1080p" : null);
  const cpuBrand = opts.cpuBrand !== undefined ? opts.cpuBrand : state.cpuBrand;
  const gpuBrand = opts.gpuBrand !== undefined ? opts.gpuBrand : state.gpuBrand;
  const preferCheaper = !!opts.preferCheaper;
  const upgradeGpu = !!opts.upgradeGpu;
  const igpuOnly = isIgpuBudget(budget) || !!opts.forceIgpu;

  // Budget covers the full flagship stack → always give the best PC
  if (!preferCheaper && !igpuOnly && !upgradeGpu &&
      !state.lockedGpuId && !state.lockedCpuId &&
      canAffordFlagshipBuild(budget)) {
    return buildDreamBuild({
      budget: budget,
      cpuBrand: cpuBrand,
      gpuBrand: gpuBrand,
      useCase: useCase,
      resolution: resolution || "4k"
    });
  }

  const isMin = opts.budgetIsMinimum != null ? opts.budgetIsMinimum : !!state.budgetIsMinimum;
  const tier = igpuOnly ? "low" : getBudgetTier(budget, isMin);
  // "1200+" → spend at/above that floor (headroom for a real high-end build)
  let effectiveBudget = budget || (tier === "low" ? 700 : tier === "mid" ? 1000 : 1500);
  if (budget != null && isMin) {
    effectiveBudget = Math.round(Math.max(budget * 1.35, budget + 350));
  }
  // Never build a “4K” rig below the 4K floor — fall back
  if (resolution === "4k" && budget != null && !canAfford4k(budget) && !isMin) {
    resolution = budget < 800 ? "1080p" : "1440p";
  }
  if (resolution === "4k" && effectiveBudget < MIN_4K_BUDGET) {
    effectiveBudget = Math.max(effectiveBudget, Math.round(MIN_4K_BUDGET * 1.125)); // ~$1800
  }

  // Budget slices
  let gpuShare = useCase === "gaming" || useCase === "streaming" ? 0.38 : 0.28;
  if (resolution === "4k") gpuShare = 0.45;
  let cpuShare = useCase === "editing" || useCase === "programming" ? 0.28 : 0.22;
  if (preferCheaper || igpuOnly) {
    gpuShare *= 0.85;
    cpuShare *= igpuOnly ? 0.35 : 0.9;
  }

  const perfKey = getPerfKey(resolution);
  const minPerf = minPerfForResolution(resolution);
  const gpuMinSpend = isMin && budget != null ? budget * 0.4 : (resolution === "4k" ? 700 : 0);

  let cpu = null;
  if (state.lockedCpuId) {
    cpu = findById(PC_DATA.CPUs, state.lockedCpuId);
  }
  if (!cpu) {
    const cpuOpts = {
      brand: cpuBrand,
      tier: preferCheaper || igpuOnly ? "low" : tier,
      useCase: useCase,
      maxPrice: effectiveBudget * (cpuShare + 0.08),
      budget: effectiveBudget,
      targetShare: cpuShare,
      filterFn: igpuOnly ? function (c) { return c.hasIgpu; } : null
    };
    cpu = pickVariedFromList(PC_DATA.CPUs, cpuOpts, state.recentCpuIds || [], 5) ||
      pickFromList(PC_DATA.CPUs, cpuOpts);
  }

  // Office/school can use iGPU builds; very low budgets always skip discrete GPUs
  const wantDiscreteGpu = !igpuOnly &&
    (!(useCase === "office" || useCase === "school") || effectiveBudget >= 700);

  let gpu = null;
  if (state.lockedGpuId && !igpuOnly) {
    gpu = findById(PC_DATA.GPUs, state.lockedGpuId);
  }
  if (!gpu && !igpuOnly && (wantDiscreteGpu || !cpu || !cpu.hasIgpu)) {
    let gpuMax = effectiveBudget * (gpuShare + 0.1);
    if (upgradeGpu && state.lastBuild && state.lastBuild.gpu) {
      gpuMax = Math.min(effectiveBudget * 0.55, state.lastBuild.gpu.price + 250);
    }
    // Leave room when a locked CPU already took part of the budget
    if (state.lockedCpuId && cpu) {
      gpuMax = Math.min(gpuMax, Math.max(150, effectiveBudget - cpu.price - 250));
    }
    if (isMin && budget != null) {
      gpuMax = Math.max(gpuMax, budget * 0.55);
    }
    if (resolution === "4k") {
      gpuMax = Math.max(gpuMax, 900);
    }
    const gpuOpts = {
      brand: gpuBrand,
      tier: preferCheaper ? "low" : tier,
      useCase: useCase,
      maxPrice: gpuMax,
      budget: effectiveBudget,
      targetShare: gpuShare,
      preferPerfKey: perfKey,
      minPerf: minPerf,
      minSpend: gpuMinSpend,
      filterFn: upgradeGpu && state.lastBuild && state.lastBuild.gpu
        ? function (g) { return g.price > state.lastBuild.gpu.price; }
        : null
    };
    gpu = pickVariedFromList(PC_DATA.GPUs, gpuOpts, state.recentGpuIds || [], 6) ||
      pickFromList(PC_DATA.GPUs, gpuOpts);
  }

  // If CPU missing, loosen filters (still prefer iGPU when required)
  if (!cpu) {
    cpu = pickFromList(PC_DATA.CPUs, {
      brand: cpuBrand,
      useCase: useCase,
      maxPrice: effectiveBudget * 0.45,
      budget: effectiveBudget,
      targetShare: cpuShare,
      filterFn: igpuOnly ? function (c) { return c.hasIgpu; } : null
    });
  }
  if (!cpu && igpuOnly) {
    cpu = pickFromList(PC_DATA.CPUs, {
      filterFn: function (c) { return c.hasIgpu; },
      maxPrice: effectiveBudget * 0.5
    });
  }
  if (!cpu) cpu = PC_DATA.CPUs[0];

  if (wantDiscreteGpu && !gpu) {
    gpu = pickFromList(PC_DATA.GPUs, {
      brand: gpuBrand,
      useCase: useCase,
      maxPrice: effectiveBudget * 0.5,
      preferPerfKey: perfKey
    });
  }

  // Low-budget path: never attach a discrete GPU
  if (igpuOnly) gpu = null;

  if (cpu) rememberRecentPart("cpu", cpu.id);
  if (gpu) rememberRecentPart("gpu", gpu.id);

  let board = pickFromList(PC_DATA.Motherboards, {
    tier: tier,
    maxPrice: effectiveBudget * 0.18,
    filterFn: function (m) { return m.socket === cpu.socket; },
    budget: effectiveBudget,
    targetShare: 0.12
  }) || pickFromList(PC_DATA.Motherboards, {
    filterFn: function (m) { return m.socket === cpu.socket; }
  });

  let ram = pickFromList(PC_DATA.RAM, {
    tier: preferCheaper ? "low" : tier,
    useCase: useCase,
    maxPrice: effectiveBudget * 0.12,
    filterFn: function (r) { return r.type === board.ramType; },
    budget: effectiveBudget,
    targetShare: 0.08
  }) || pickFromList(PC_DATA.RAM, {
    filterFn: function (r) { return r.type === board.ramType; }
  });

  let storage = pickFromList(PC_DATA.Storage, {
    tier: preferCheaper ? "low" : tier,
    useCase: useCase,
    maxPrice: effectiveBudget * 0.12,
    filterFn: function (s) { return s.type.indexOf("SSD") !== -1; },
    budget: effectiveBudget,
    targetShare: 0.07
  });

  const minWatt = gpu ? gpu.recommendedPsu : 450;
  const psuBudgetCap = Math.max(45, Math.min(effectiveBudget * 0.15, igpuOnly ? 70 : 200));
  let psu = pickAdequatePsu(minWatt, psuBudgetCap);

  let cooler = pickFromList(PC_DATA.Coolers, {
    tier: igpuOnly || preferCheaper ? "low" : tier,
    maxPrice: Math.max(0, Math.min(effectiveBudget * 0.1, igpuOnly ? 40 : 140)),
    filterFn: function (c) { return c.tdpSupport >= cpu.tdp; },
    budget: effectiveBudget,
    targetShare: 0.05
  }) || pickFromList(PC_DATA.Coolers, {
    filterFn: function (c) { return c.tdpSupport >= cpu.tdp; }
  });

  let pcCase = pickFromList(PC_DATA.Cases, {
    tier: igpuOnly || preferCheaper ? "low" : tier,
    maxPrice: Math.max(45, Math.min(effectiveBudget * 0.12, igpuOnly ? 70 : 160)),
    filterFn: function (c) { return caseFitsBoard(c, board); },
    budget: effectiveBudget,
    targetShare: 0.07
  }) || pickFromList(PC_DATA.Cases, {
    filterFn: function (c) { return caseFitsBoard(c, board); }
  });

  function calcTotal() {
    return cpu.price +
      (gpu ? gpu.price : 0) +
      ram.price +
      storage.price +
      board.price +
      psu.price +
      pcCase.price +
      cooler.price;
  }

  // If over budget, downgrade expensive parts until we fit (or get as close as possible)
  if (budget != null) {
    let guard = 0;
    while (calcTotal() > budget && guard < 40) {
      guard += 1;
      let reduced = false;

      if (gpu) {
        const cheaperGpu = pickFromList(PC_DATA.GPUs, {
          brand: gpuBrand,
          useCase: useCase,
          maxPrice: gpu.price - 1,
          preferPerfKey: perfKey
        });
        if (cheaperGpu && cheaperGpu.price < gpu.price) {
          gpu = cheaperGpu;
          psu = pickAdequatePsu(gpu.recommendedPsu, Math.max(psu.price, 80)) || psu;
          reduced = true;
        }
      }

      if (!reduced && calcTotal() > budget) {
        const cheaperCpu = pickFromList(PC_DATA.CPUs, {
          brand: cpuBrand,
          useCase: useCase,
          maxPrice: cpu.price - 1
        });
        if (cheaperCpu && cheaperCpu.price < cpu.price) {
          cpu = cheaperCpu;
          board = pickFromList(PC_DATA.Motherboards, {
            filterFn: function (m) { return m.socket === cpu.socket; },
            maxPrice: board.price
          }) || board;
          ram = pickFromList(PC_DATA.RAM, {
            filterFn: function (r) { return r.type === board.ramType; },
            maxPrice: ram.price
          }) || ram;
          cooler = pickFromList(PC_DATA.Coolers, {
            filterFn: function (c) { return c.tdpSupport >= cpu.tdp; },
            maxPrice: cooler.price
          }) || cooler;
          reduced = true;
        }
      }

      if (!reduced && calcTotal() > budget && ram.capacityGb > 16) {
        const cheaperRam = pickFromList(PC_DATA.RAM, {
          filterFn: function (r) {
            return r.type === board.ramType && r.price < ram.price;
          }
        });
        if (cheaperRam) { ram = cheaperRam; reduced = true; }
      }

      if (!reduced && calcTotal() > budget && storage.capacityGb > 500) {
        const cheaperStorage = pickFromList(PC_DATA.Storage, {
          filterFn: function (s) {
            return s.type.indexOf("SSD") !== -1 && s.price < storage.price;
          }
        });
        if (cheaperStorage) { storage = cheaperStorage; reduced = true; }
      }

      if (!reduced && calcTotal() > budget) {
        const cheaperBoard = pickFromList(PC_DATA.Motherboards, {
          filterFn: function (m) {
            return m.socket === cpu.socket && m.ramType === board.ramType && m.price < board.price;
          }
        });
        if (cheaperBoard) { board = cheaperBoard; reduced = true; }
      }

      if (!reduced && calcTotal() > budget) {
        const cheaperCase = pickFromList(PC_DATA.Cases, {
          filterFn: function (c) {
            return caseFitsBoard(c, board) && c.price < pcCase.price;
          }
        });
        if (cheaperCase) { pcCase = cheaperCase; reduced = true; }
      }

      if (!reduced && calcTotal() > budget) {
        const cheaperCooler = pickFromList(PC_DATA.Coolers, {
          filterFn: function (c) {
            return c.tdpSupport >= cpu.tdp && c.price < cooler.price;
          }
        });
        if (cheaperCooler) { cooler = cheaperCooler; reduced = true; }
      }

      if (!reduced) break;
    }
  }

  const build = {
    cpu: cpu,
    gpu: gpu,
    ram: ram,
    storage: storage,
    motherboard: board,
    psu: psu,
    case: pcCase,
    cooler: cooler,
    total: calcTotal(),
    budget: budget,
    useCase: useCase,
    resolution: resolution,
    reason: ""
  };

  build.reason = buildReason(build);
  return build;
}

function hasAnyPreferences() {
  return !!(
    state.useCase ||
    state.budget != null ||
    state.resolution ||
    state.brandsConfirmed ||
    state.lastBuild
  );
}

function prefsSummary() {
  if (!hasAnyPreferences()) {
    return "You don't have any preferences saved yet. Start a build or tell me your use case, budget, or brand picks, and I'll remember them for this chat.";
  }

  return (
    "Here's what I currently remember:\n" +
    "• Use case: " + (state.useCase || "not set") + "\n" +
    "• Budget: " + (state.budget != null
      ? formatMoney(state.budget) + (state.budgetIsMinimum ? "+" : "")
      : "not set") + "\n" +
    "• Resolution: " + (state.resolution || "not set") + "\n" +
    "• CPU brand: " + (state.brandsConfirmed ? (state.cpuBrand || "any") : "not set") + "\n" +
    "• GPU brand: " + (state.brandsConfirmed ? (state.gpuBrand || "any") : "not set") + "\n\n" +
    "Tell me what to change, or ask me to build a PC."
  );
}

function isGreetingPhrase(t) {
  // t should already be normalize()'d
  const s = String(t || "").replace(/[!?.]+$/g, "").trim();
  if (!s) return false;

  // Classic + stretched hellos
  if (/^(h+i+|h+e+l+o+|h+e+y+|hiya+|y+o+|su+p+|howdy+|good morning|good afternoon|good evening|whats up|what s up|wassup|wass+u+p+|wazzup|sup)(\s+there)?$/.test(s)) {
    return true;
  }

  // Bro / buddy energy: “hi bro”, “hey bro”, “yo brodi”, “brooooo”
  if (/^(h+i+|h+e+y+|h+e+l+o+|y+o+|su+p+|wassup|wass+u+p+|wazzup)\s+(bro+|br+o+|brodi+|brodie+|brother|dude+|man+|fam+|homie+)s?$/.test(s)) {
    return true;
  }
  if (/^(bro+|br+o+|brodi+|brodie+|brother)s?$/.test(s)) {
    return true;
  }
  if (/^yo\s+brodi+$/.test(s) || /^yo\s+bro+$/.test(s)) {
    return true;
  }

  return false;
}

function isCasualGreeting(text) {
  const t = normalize(text).replace(/[!?.]+$/g, "").trim();
  return /\b(bro|brodi|brodie|wassup|wazzup|dude|fam|homie|ayy)\b/.test(t) ||
    /^y+o+$/.test(t) ||
    /^su+p+$/.test(t);
}

function isStretchedHello(text) {
  const t = normalize(text)
    .replace(/[!?.]+$/g, "")
    .replace(/\s+there$/, "")
    .trim();
  // Longer than a normal “hi” / “hey” / “hello” / “bro”
  if (/^h+i+$/.test(t)) return t.length >= 3;
  if (/^h+e+y+$/.test(t)) return t.length >= 4;
  if (/^h+e+l+o+$/.test(t)) return t.length >= 6;
  if (/^bro+$/.test(t) || /^br+o+$/.test(t)) return t.length >= 5; // brooooo
  if (/^(h+i+|h+e+y+|y+o+)\s+bro+$/.test(t)) {
    const bro = t.split(/\s+/).pop() || "";
    return bro.length >= 5; // “hey brooooo”
  }
  return false;
}

function greetingReply(userText) {
  const casual = userText && isCasualGreeting(userText);
  let msg = pickRandom(casual ? CASUAL_GREETING_REPLIES : GREETING_REPLIES);
  if (userText && isStretchedHello(userText)) {
    // Swap the opening for the fun line
    msg = msg.replace(/^(yo|ayyy+|hey bro|hey|hello|hi there|hi|wassup|broo+)\b[\s!?,.]*/i, "Hello Gay Boy — ");
    if (!/^hello gay boy/i.test(msg)) {
      msg = "Hello Gay Boy — " + msg;
    }
  }
  return msg;
}

function introReply() {
  return pickRandom(INTRO_REPLIES);
}

function howAreYouReply() {
  return pickRandom(HOW_ARE_YOU_REPLIES);
}

// ----- Recent chats (localStorage) -----
function createSession() {
  return {
    id: "chat-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
    title: "New chat",
    updatedAt: Date.now(),
    messages: [],
    state: null
  };
}

function serializeBuild(build) {
  if (!build) return null;
  function part(p) {
    return p ? { id: p.id, name: p.name, price: p.price } : null;
  }
  return {
    cpu: part(build.cpu),
    gpu: part(build.gpu),
    ram: part(build.ram),
    storage: part(build.storage),
    motherboard: part(build.motherboard),
    psu: part(build.psu),
    case: part(build.case),
    cooler: part(build.cooler),
    total: build.total,
    budget: build.budget,
    useCase: build.useCase,
    resolution: build.resolution,
    reason: build.reason
  };
}

function hydrateBuild(data) {
  if (!data) return null;
  // Rebuild full catalog objects when possible (for upgrade/cheaper actions)
  function full(part, list) {
    if (!part) return null;
    return findById(list, part.id) || part;
  }
  return {
    cpu: full(data.cpu, PC_DATA.CPUs),
    gpu: full(data.gpu, PC_DATA.GPUs),
    ram: full(data.ram, PC_DATA.RAM),
    storage: full(data.storage, PC_DATA.Storage),
    motherboard: full(data.motherboard, PC_DATA.Motherboards),
    psu: full(data.psu, PC_DATA.PSUs),
    case: full(data.case, PC_DATA.Cases),
    cooler: full(data.cooler, PC_DATA.Coolers),
    total: data.total,
    budget: data.budget,
    useCase: data.useCase,
    resolution: data.resolution,
    reason: data.reason
  };
}

function sessionHasUserMessages(session) {
  return !!(session && session.messages.some(function (m) { return m.role === "user"; }));
}

function updateSessionTitle() {
  if (!currentSession) return;
  if (state.useCase && state.budget != null) {
    currentSession.title = state.useCase + " · " + formatMoney(state.budget);
  } else if (state.useCase) {
    currentSession.title = state.useCase + " PC chat";
  } else if (state.lastBuild && state.lastBuild.cpu) {
    currentSession.title = "Build · " + state.lastBuild.cpu.name;
  } else {
    const firstUser = currentSession.messages.find(function (m) { return m.role === "user"; });
    if (firstUser) {
      currentSession.title = firstUser.text.length > 36
        ? firstUser.text.slice(0, 36) + "…"
        : firstUser.text;
    }
  }
}

function logSessionMessage(entry) {
  if (skipSessionLog || !currentSession) return;
  currentSession.messages.push(entry);
  currentSession.updatedAt = Date.now();
  updateSessionTitle();
}

function loadRecentChats() {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveRecentChats(list) {
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(list.slice(0, MAX_RECENT_CHATS)));
  } catch (e) {
    // Ignore quota / private mode errors
  }
}

function serializeSessionState() {
  return {
    useCase: state.useCase,
    budget: state.budget,
    resolution: state.resolution,
    budgetIsMinimum: !!state.budgetIsMinimum,
    cpuBrand: state.cpuBrand,
    gpuBrand: state.gpuBrand,
    brandsConfirmed: !!state.brandsConfirmed,
    awaiting: state.awaiting,
    awaitingPart: state.awaitingPart,
    awaitingConfirm: state.awaitingConfirm,
    lastSuggestedPart: state.lastSuggestedPart
      ? {
          kind: state.lastSuggestedPart.kind,
          id: state.lastSuggestedPart.id,
          name: state.lastSuggestedPart.name
        }
      : null,
    lockedGpuId: state.lockedGpuId,
    lockedCpuId: state.lockedCpuId,
    recentGpuIds: (state.recentGpuIds || []).slice(),
    recentCpuIds: (state.recentCpuIds || []).slice(),
    lastBuild: serializeBuild(state.lastBuild)
  };
}

function restoreSessionState(saved) {
  if (!saved) return;
  state.useCase = saved.useCase || null;
  state.budget = saved.budget != null ? saved.budget : null;
  state.resolution = saved.resolution || null;
  state.budgetIsMinimum = !!saved.budgetIsMinimum;
  state.cpuBrand = saved.cpuBrand || null;
  state.gpuBrand = saved.gpuBrand || null;
  state.brandsConfirmed = !!saved.brandsConfirmed;
  state.awaiting = saved.awaiting || null;
  state.awaitingPart = saved.awaitingPart || null;
  state.awaitingConfirm = saved.awaitingConfirm || null;
  state.lastSuggestedPart = saved.lastSuggestedPart
    ? {
        kind: saved.lastSuggestedPart.kind,
        id: saved.lastSuggestedPart.id,
        name: saved.lastSuggestedPart.name
      }
    : null;
  state.lockedGpuId = saved.lockedGpuId || null;
  state.lockedCpuId = saved.lockedCpuId || null;
  state.recentGpuIds = Array.isArray(saved.recentGpuIds) ? saved.recentGpuIds.slice() : [];
  state.recentCpuIds = Array.isArray(saved.recentCpuIds) ? saved.recentCpuIds.slice() : [];
  state.lastBuild = hydrateBuild(saved.lastBuild);
  state.selectedComponents = state.lastBuild || {};
}

function archiveCurrentSession() {
  if (!sessionHasUserMessages(currentSession)) return;
  updateSessionTitle();
  currentSession.state = serializeSessionState();
  currentSession.updatedAt = Date.now();

  const list = loadRecentChats().filter(function (c) { return c.id !== currentSession.id; });
  list.unshift(currentSession);
  saveRecentChats(list);
}

function formatRecentWhen(ts) {
  try {
    return new Date(ts).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch (e) {
    return "";
  }
}

function renderRecentPanel() {
  const list = loadRecentChats();
  recentList.innerHTML = "";

  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "recent-empty";
    empty.textContent = "No recent chats yet. Start a conversation, then reset or come back later to find it here.";
    recentList.appendChild(empty);
    return;
  }

  list.forEach(function (chat) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "recent-item";
    btn.innerHTML =
      '<span class="recent-item-title"></span>' +
      '<span class="recent-item-meta"></span>';
    btn.querySelector(".recent-item-title").textContent = chat.title || "Untitled chat";
    const count = (chat.messages || []).length;
    btn.querySelector(".recent-item-meta").textContent =
      formatRecentWhen(chat.updatedAt) + " · " + count + " messages";
    btn.addEventListener("click", function () {
      restoreRecentChat(chat.id);
    });
    recentList.appendChild(btn);
  });
}

function toggleRecentPanel(forceOpen) {
  const willOpen = forceOpen === true || recentPanel.classList.contains("hidden");
  if (willOpen) {
    renderRecentPanel();
    recentPanel.classList.remove("hidden");
  } else {
    recentPanel.classList.add("hidden");
  }
}

function closeRecentPanel() {
  recentPanel.classList.add("hidden");
}

function restoreRecentChat(chatId) {
  const chat = loadRecentChats().find(function (c) { return c.id === chatId; });
  if (!chat) return;

  // Save whatever the user was doing first
  archiveCurrentSession();

  closeRecentPanel();
  skipSessionLog = true;
  chatWindow.innerHTML = "";
  state = createState();
  restoreSessionState(chat.state);

  currentSession = {
    id: chat.id,
    title: chat.title,
    updatedAt: Date.now(),
    messages: [],
    state: null
  };

  (chat.messages || []).forEach(function (msg) {
    if (msg.role === "user") {
      addUserMessage(msg.text);
    } else {
      const build = hydrateBuild(msg.build);
      if (build) {
        addBotMessage(msg.text, createBuildCard(build), build);
      } else {
        addBotMessage(msg.text);
      }
    }
  });

  // Keep an accurate copy of restored messages (add* already logged while skip was true... wait we skip logging)
  // So assign messages from the saved chat:
  currentSession.messages = (chat.messages || []).slice();
  skipSessionLog = false;

  let restoreChips = ["My prefs", "Continue this build", "Reset chat"];
  let restoreNote = "Restored this chat. You can keep going from here.";
  if (state.awaitingConfirm) {
    restoreChips = ["Yes please", "No thanks", "Another option"];
    restoreNote = "Restored this chat — I was waiting on a yes/no from you.";
  } else if (state.awaitingPart && state.awaiting === "budget") {
    restoreChips = state.awaitingPart === "cpu"
      ? ["$100", "$200", "$350"]
      : ["$400", "$600", "$800", "$1000+"];
    restoreNote = "Restored this chat — still need your " +
      (state.awaitingPart === "gpuUpgrade" ? "GPU upgrade" : state.awaitingPart.toUpperCase()) +
      " budget.";
  } else if (state.awaiting === "budget") {
    restoreChips = ["$250", "$700", "$1200", "$1200+"];
    restoreNote = "Restored this chat — what’s your budget?";
  } else if (state.awaiting === "brands") {
    restoreChips = ["AMD + NVIDIA", "Intel + NVIDIA", "All AMD", "No preference"];
    restoreNote = "Restored this chat — which brands do you prefer?";
  } else if (state.awaiting === "resolution") {
    restoreChips = canAfford4k(state.budget) ? ["1080p", "1440p", "4K"] : ["1080p", "1440p"];
    restoreNote = "Restored this chat — which resolution are we targeting?";
  } else if (state.awaiting === "useCase") {
    restoreChips = ["Gaming", "Programming", "Editing", "Office"];
    restoreNote = "Restored this chat — what will you mainly use the PC for?";
  } else if (state.budgetIsMinimum && state.budget != null) {
    restoreNote = "Restored this chat (budget " + formatMoney(state.budget) + "+). You can keep going from here.";
  }

  renderSuggestions(restoreChips);
  addBotMessage(restoreNote);
}

function nextBuildQuestion() {
  if (!state.useCase) {
    state.awaiting = "useCase";
    return "What will you mainly use the PC for — gaming, programming, editing, streaming, office, or school?";
  }
  if (state.budget == null) {
    state.awaiting = "budget";
    return "Great! What's your approximate budget? (Example: $800, 1200, or 1200+)";
  }
  if (!state.brandsConfirmed) {
    state.awaiting = "brands";
    return "Which brands do you prefer?\n" +
      "You can say things like “AMD CPU and NVIDIA GPU”, “Intel and NVIDIA”, “all AMD”, or “no preference”.";
  }
  // Skip resolution prompts for iGPU-only budgets (discrete GPU gaming targets don't apply)
  if (needsResolution(state.useCase) && !state.resolution && !isIgpuBudget(state.budget)) {
    state.awaiting = "resolution";
    if (!canAfford4k(state.budget)) {
      return "Nice. At " + formatMoney(state.budget) +
        ", 4K isn’t realistic ($1600+ recommended). Do you want to target 1080p or 1440p?";
    }
    return "Nice. Do you want to target 1080p, 1440p, or 4K? (4K really wants a $1600+ system.)";
  }
  // If 4K was saved earlier but budget is too low, force a new resolution pick
  if (state.resolution === "4k" && state.budget != null && !canAfford4k(state.budget) &&
      needsResolution(state.useCase) && !isIgpuBudget(state.budget)) {
    state.resolution = null;
    state.awaiting = "resolution";
    return "Your budget is under $1600, so 4K is off the table. Pick 1080p or 1440p instead — or raise the budget.";
  }
  state.awaiting = null;
  return null;
}

// ----- Main reply builder -----
function sillyBodyEasterEgg(text) {
  const raw = String(text || "").trim();
  const t = normalize(text);
  if (!t) return null;

  const hasBody = /\b(boobs?|tits?|ass|thighs?)\b/.test(t);
  if (!hasBody) return null;

  const asky = /\b(prefer|rather|would you|do you like|if you had to|pick one|which (one|do)|what about|vs|versus|\bor\b)\b/.test(t);
  const bareOnly = /^(boobs?|tits?|ass|thighs?)[!?.]*$/.test(t);

  // Lone word: “ass” → still thighs; “boobs/tits/thighs” → hungry emojis
  if (bareOnly) {
    if (/^ass[!?.]*$/.test(t)) {
      return { text: "I still choose thighs" };
    }
    return { text: "🤤😋" };
  }

  // Need a question-style cue, or an “X or Y” comparison
  if (!asky && !/\bor\b/.test(t)) return null;

  const mentions = [];
  const re = /\b(tits?|boobs?|thighs?|ass)\b/gi;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const word = m[1];
    const key = /^ass$/i.test(word) ? "ass"
      : /^thigh/i.test(word) ? "thighs"
      : /^tit/i.test(word) ? "tits"
      : "boobs";
    mentions.push({ key: key, word: word });
  }
  if (!mentions.length) return null;

  const keys = mentions.map(function (x) { return x.key; });
  const unique = keys.filter(function (k, i) { return keys.indexOf(k) === i; });

  // “ass or ass” / “boobs or boobs” — same pick twice
  if (mentions.length >= 2 && unique.length === 1) {
    if (unique[0] === "ass") {
      return {
        text: pickRandom([
          "Both are the same — please choose a valid comparison. I still choose thighs.",
          "ass or ass? Bold. Invalid comparison though… I still choose thighs."
        ])
      };
    }
    return {
      text: pickRandom([
        "Both are the same — please choose a valid comparison. Still gonna say " + mentions[0].word + ".",
        "That’s the same option twice. I’m sticking with " + mentions[0].word + "."
      ])
    };
  }

  // “Do you like ass?” / prefer ass alone in a question
  if (unique.length === 1 && unique[0] === "ass") {
    return { text: "I still choose thighs" };
  }
  if (unique.length === 1) {
    return { text: "🤤😋" };
  }

  const hasThighs = unique.indexOf("thighs") !== -1;
  const hasAss = unique.indexOf("ass") !== -1;
  const chest = mentions.find(function (x) { return x.key === "tits" || x.key === "boobs"; });

  // Thighs + boobs/tits
  if (hasThighs && chest) {
    return { text: "That's a really tough one, so imma go with both 😋" };
  }

  // Thighs + ass
  if (hasThighs && hasAss) {
    return { text: "thighs" };
  }

  // Tits/boobs + ass → echo their chest word
  if (chest && hasAss) {
    return { text: chest.word };
  }

  return null;
}

function generateReply(userText) {
  // Special Easter egg / exact match
  if (String(userText || "").trim().toLowerCase().includes("fuck you")) {
    return { text: "Go fuck yourself with a cactus" };
  }

  const bodyEgg = sillyBodyEasterEgg(userText);
  if (bodyEgg) return bodyEgg;

  if (String(userText || "").trim().toLowerCase().includes("fuck")) {
    return { text: "Mind your language, you rude fuck." };
  }

  // Extra curse-word filter (same reply as the check above)
  if (/\b(shit|asshole|bitch|bastard|dick|cunt|motherfucker|\bmf\b|wtf|stfu|bullshit|dumbass|jackass)\b/i.test(userText)) {
    return { text: "Mind your language, you rude fuck." };
  }

  const intent = detectIntent(userText);
  const partBudgetEval = evaluatePartBudget(userText);
  const partFlow = intent === "recommend_gpu" || intent === "recommend_cpu" ||
    (!!state.awaitingPart && partBudgetEval.status !== "missing");
  const budgetEval = partFlow ? partBudgetEval : evaluateBudgetInput(userText);
  const budget = budgetEval.status === "ok" ? budgetEval.value : null;
  const useCase = detectUseCase(userText);
  const resolution = detectResolution(userText);
  const brands = detectBrands(userText);

  if (intent === "empty") {
    return { text: "Please enter a message first." };
  }

  if (intent === "reset") {
    resetChat();
    return null; // resetChat already shows the welcome message
  }

  // Still allow these utilities while a question is pending
  if (intent === "prefs") {
    return { text: prefsSummary() };
  }

  if (intent === "recent") {
    toggleRecentPanel(true);
    const count = loadRecentChats().length;
    return {
      text: count
        ? "I opened your recent chats. Click one to restore it."
        : "You don't have any recent chats yet. After you talk to me, use Reset Chat or come back later — I'll keep the last few here."
    };
  }

  if (intent === "continue") {
    if (state.lastBuild) {
      return {
        text: "Picking up from your last build:",
        build: state.lastBuild
      };
    }
    const missing = nextBuildQuestion();
    if (missing) return { text: "Let's continue.\n\n" + missing };
    return { text: "Tell me what you want to change, or ask for a new build." };
  }

  // Greetings / intro should work even mid-flow (not blocked by “select a budget”)
  if (intent === "greeting") {
    return {
      text: greetingReply(userText),
      suggest: ["Build me a gaming PC", "Recommend a GPU", "Who are you?"]
    };
  }
  if (intent === "how_are_you") {
    return { text: howAreYouReply(), suggest: ["Introduce yourself", "Build me a gaming PC", "Recommend a CPU"] };
  }
  if (intent === "intro") {
    return { text: introReply(), suggest: ["Build me a gaming PC", "Check compatibility", "Recommend a GPU"] };
  }

  if (intent === "compare_parts") {
    return comparePartsAnswer(userText);
  }
  if (intent === "faq") {
    return answerFaq(userText);
  }
  if (intent === "component_info") {
    return { text: getComponentInfo(userText) };
  }
  if (intent === "brand_compare") {
    // Mid brand-preference step: answer the tangent, then keep asking for build prefs
    if (state.awaiting === "brands") {
      const brandReply = brandCompareAnswer(userText);
      const compareText = typeof brandReply === "string" ? brandReply : (brandReply && brandReply.text) || "";
      return {
        text: compareText +
          "\n\nFor your build, that was a comparison — I still need your brand prefs.\n" +
          "Say “AMD + NVIDIA”, “Intel + NVIDIA”, “all AMD”, or “no preference”.",
        suggest: ["AMD + NVIDIA", "Intel + NVIDIA", "All AMD", "No preference"]
      };
    }
    const brandReply = brandCompareAnswer(userText);
    if (typeof brandReply === "string") return { text: brandReply };
    return brandReply;
  }
  if (intent === "compatibility") {
    const compat = checkCompatibility(userText);
    if (typeof compat === "string") return { text: compat };
    return compat;
  }

  if (intent === "dream_build") {
    return replyDreamBuild("Money’s no object — here’s a no-compromise flagship build:");
  }

  // Single-part asks (suggest/recommend CPU/GPU) — budget applies to that part only
  if (intent === "recommend_gpu" || intent === "recommend_cpu") {
    const kind = intent === "recommend_gpu" ? "gpu" : "cpu";
    if (budgetEval.status === "invalid") {
      return { text: "Please enter a valid budget for the " + kind.toUpperCase() + "." };
    }
    if (budgetEval.status === "too_low") {
      return {
        text: "That " + kind.toUpperCase() + " budget is too low. Try at least around $50–$100 for a CPU, or $150+ for a GPU."
      };
    }
    if (budget == null) {
      state.awaiting = "budget";
      state.awaitingPart = kind;
      return {
        text: "Sure — what's your approximate budget for the " + kind.toUpperCase() +
          " only? (Example: $150 or 300)",
        suggest: kind === "gpu" ? ["$300", "$500", "$800"] : ["$100", "$200", "$350"]
      };
    }
    state.awaiting = null;
    state.awaitingPart = null;
    return recommendSinglePart(kind, {
      budget: budget,
      budgetIsMinimum: !!budgetEval.isMinimum
    });
  }

  // Explicit budget changes always win over a pending yes/no
  if (state.awaitingConfirm && budgetEval.status === "ok" &&
      (isExplicitBudgetUpdate(userText) || /\bbudget\b/.test(normalize(userText)))) {
    state.awaitingConfirm = null;
    state.lockedGpuId = null;
    state.lockedCpuId = null;
  }

  // Yes / no follow-ups ("yes please", "ok", "that would be great", ...)
  if (state.awaitingConfirm) {
    const confirmReply = handleConfirmation(userText);
    if (confirmReply) return confirmReply;
    // null → user picked a different action; keep going through normal intents
  }

  // Allow switching topics away from a pending part-budget ask
  if (state.awaitingPart && partBudgetEval.status === "missing" &&
      intent !== "recommend_gpu" && intent !== "recommend_cpu" && intent !== "budget") {
    state.awaitingPart = null;
    if (state.awaiting === "budget") state.awaiting = null;
  }

  // Finish a pending part-only budget (do not treat it as a full-PC budget)
  if (state.awaitingPart && state.awaiting === "budget") {
    if (budgetEval.status === "invalid") {
      return { text: "Please enter a valid budget for that part." };
    }
    if (budgetEval.status === "too_low") {
      return {
        text: "That part budget is too low. For a CPU try ~$50+, for a GPU try ~$150+."
      };
    }
    if (budgetEval.status === "missing") {
      return { text: awaitingInvalidReply("budget") };
    }
    const kind = state.awaitingPart;
    state.awaitingPart = null;
    state.awaiting = null;
    if (kind === "gpuUpgrade") {
      return recommendGpuUpgrade({
        budget: budget,
        budgetIsMinimum: !!budgetEval.isMinimum
      });
    }
    return recommendSinglePart(kind, {
      budget: budget,
      budgetIsMinimum: !!budgetEval.isMinimum
    });
  }

  // Budget validation for full-PC flow (negative / too low / accepted)
  if (budgetEval.status === "invalid") {
    return { text: "Please enter a valid budget." };
  }
  if (budgetEval.status === "too_low") {
    return {
      text: "That budget is too low to build a usable PC. Please enter a higher amount — around $200–$300 can only cover a very basic iGPU system, and $400+ is more practical."
    };
  }

  // Required-field guard — but accept useful updates (budget/brands/resolution/use case)
  // so “my budget is $800” isn’t rejected while awaiting use case, etc.
  const offeredBudget = budgetEval.status === "ok";
  const offeredUseCase = !!useCase;
  const offeredResolution = !!resolution;
  const offeredBrands = !!(brands && brands.mentioned);

  if (state.awaiting === "budget" && budgetEval.status === "missing" &&
      !offeredUseCase && !offeredResolution && !offeredBrands) {
    return { text: awaitingInvalidReply("budget") };
  }
  if (state.awaiting === "brands" && !offeredBrands &&
      !offeredBudget && !offeredUseCase && !offeredResolution) {
    return { text: awaitingInvalidReply("brands") };
  }
  if (state.awaiting === "resolution" && !offeredResolution &&
      !offeredBudget && !offeredUseCase && !offeredBrands) {
    return { text: awaitingInvalidReply("resolution") };
  }
  if (state.awaiting === "useCase" && !offeredUseCase &&
      !offeredBudget && !offeredResolution && !offeredBrands) {
    return { text: awaitingInvalidReply("useCase") };
  }

  // Merge any extracted facts early (full-PC budget only)
  if (budget != null) {
    state.budget = budget;
    state.budgetIsMinimum = !!budgetEval.isMinimum;
    state.awaitingConfirm = null;
    // New/changed budget → don't force the previous locked part into the next build
    if (isExplicitBudgetUpdate(userText) || /\bbudget\b/.test(normalize(userText))) {
      state.lockedGpuId = null;
      state.lockedCpuId = null;
    }
  }
  if (useCase) {
    state.useCase = useCase;
    if (state.awaiting === "useCase") state.awaiting = null;
  }

  // 4K is reserved for ~$1600+ systems
  if (resolution === "4k") {
    if (state.useCase == null) state.useCase = "gaming";
    if (state.budget != null && !canAfford4k(state.budget)) {
      return replyFourKNeedsBudget(state.budget);
    }
    state.resolution = "4k";
    if (state.awaiting === "resolution") state.awaiting = null;
  } else if (resolution) {
    state.resolution = resolution;
    if (state.awaiting === "resolution") state.awaiting = null;
  }

  if (brands.mentioned) {
    state.cpuBrand = brands.cpuBrand;
    state.gpuBrand = brands.gpuBrand;
    state.brandsConfirmed = true;
    if (state.awaiting === "brands") state.awaiting = null;
  }
  if (budget != null && state.awaiting === "budget") state.awaiting = null;

  // Budget came in after a 4K preference — drop 4K if it’s unaffordable
  if (budget != null && state.resolution === "4k" && !canAfford4k(state.budget)) {
    state.resolution = null;
    if (needsResolution(state.useCase || "gaming") && !isIgpuBudget(state.budget)) {
      state.awaiting = "resolution";
    }
    return {
      text: "Got your budget (" + formatMoney(state.budget) +
        "), but that’s below what’s needed for 4K ($1600+). I’ve cleared the 4K target — choose 1080p or 1440p, or bump the budget.",
      suggest: ["1080p", "1440p", "$1600", "$1600+", "$2000"]
    };
  }

  // Budget covers (or blows past) the flagship parts total → best PC in the catalog
  if (budget != null && (canAffordFlagshipBuild(budget) || isAbsurdBudget(budget))) {
    const flagshipCost = flagshipPartsTotal();
    const intro = isAbsurdBudget(budget)
      ? "With " + formatMoney(budget) + " you could buy a car — here’s the most extreme PC build in the catalog:"
      : "Your " + formatMoney(budget) + " budget covers the full flagship stack (~" +
        formatMoney(flagshipCost) + ") — here’s the best PC I can build:";
    return replyDreamBuild(intro, budget);
  }
  if (intent === "build" && (canAffordFlagshipBuild(state.budget) || isAbsurdBudget(state.budget))) {
    return replyDreamBuild(
      "Your budget covers the catalog’s top-end parts — here’s the best PC I can build:",
      state.budget
    );
  }

  if (intent === "out_of_scope") {
    return {
      text: "That's outside my scope. I'm a PC building assistant. I can help with CPUs, GPUs, RAM, storage, motherboards, PSUs, compatibility, budgets, and complete PC builds."
    };
  }

  if (intent === "price_check") {
    return answerPriceCheck(userText);
  }

  if (intent === "build_around") {
    if (state.lastSuggestedPart) {
      state.awaitingConfirm = "buildAroundPart";
      return handleConfirmation("yes please");
    }
    return {
      text: "Tell me which CPU or GPU to build around (or ask “How much does the RTX 5090 cost?” first).",
      suggest: ["Recommend a GPU", "Recommend a CPU", "How much for a PC?"]
    };
  }

  if (intent === "best_pick") {
    return { text: answerBestPick(userText) };
  }

  if (intent === "make_cheaper") {
    if (!state.lastBuild && state.budget == null) {
      return { text: "Tell me your budget first, and I'll build a cheaper configuration." };
    }
    if (state.budget != null) state.budget = Math.max(400, Math.round(state.budget * 0.85));
    const build = recommendBuild({ preferCheaper: true });
    state.lastBuild = build;
    state.selectedComponents = build;
    return {
      text: "Here's a more budget-friendly take:",
      build: build
    };
  }

  if (intent === "upgrade_gpu") {
    state.awaitingConfirm = null;
    const current = state.lastBuild && state.lastBuild.gpu;
    if (current && isTopGpu(current, state.gpuBrand)) {
      state.awaiting = null;
      state.awaitingPart = null;
      return replyAlreadyMaxed("gpu", current);
    }
    state.awaiting = "budget";
    state.awaitingPart = "gpuUpgrade";
    return {
      text: current
        ? "You're on the " + current.name + " (~" + formatMoney(current.price) +
          "). What's your new budget for the GPU only? (Example: $500 or 800+)"
        : "What's your budget for the upgraded GPU only? (Example: $500 or 800+)",
      suggest: ["$400", "$600", "$800", "$1000+"]
    };
  }

  if (intent === "upgrade_cpu") {
    state.awaitingConfirm = null;
    const currentCpu = state.lastBuild && state.lastBuild.cpu;
    if (currentCpu && isTopCpu(currentCpu, state.cpuBrand)) {
      state.awaiting = null;
      state.awaitingPart = null;
      return replyAlreadyMaxed("cpu", currentCpu);
    }
    if (!currentCpu) {
      return {
        text: "I don’t have a current build CPU to upgrade from. Ask me to recommend a CPU or build a PC first.",
        suggest: ["Suggest a CPU", "Build me a gaming PC", "Recommend a GPU"]
      };
    }
    // Offer a stronger CPU within catalog (no silent downgrade)
    const better = pickMostExpensivePart(
      PC_DATA.CPUs.filter(function (c) {
        if (c.id === currentCpu.id) return false;
        if (state.cpuBrand && normalize(c.brand) !== normalize(state.cpuBrand)) return false;
        return c.price > currentCpu.price ||
          (c.cores || 0) > (currentCpu.cores || 0) ||
          (c.threads || 0) > (currentCpu.threads || 0);
      }),
      state.cpuBrand
    );
    if (!better) {
      if (isTopCpu(currentCpu, state.cpuBrand)) {
        return replyAlreadyMaxed("cpu", currentCpu);
      }
      return {
        text: "I couldn’t find a clearly stronger CPU than the " + currentCpu.name +
          " with your current preferences. I won’t downgrade on an upgrade request — try “Make it cheaper” if you want a less expensive chip.",
        suggest: ["Make it cheaper", "Suggest a CPU", "No preference"]
      };
    }
    state.lastSuggestedPart = { kind: "cpu", id: better.id, name: better.name };
    state.lockedCpuId = better.id;
    state.awaitingConfirm = "buildAroundPart";
    return {
      text: "Upgrade from " + currentCpu.name + " (~" + formatMoney(currentCpu.price) +
        ") → " + better.name + " (~" + formatMoney(better.price) + ").\n" +
        "• " + better.cores + " cores / " + better.threads + " threads\n" +
        "• Socket: " + better.socket + "\n" +
        "• " + better.notes +
        "\n\nWant me to rebuild the full PC around this CPU?",
      suggest: ["Yes please", "No thanks", "Make it cheaper"]
    };
  }

  if (intent === "budget" || intent === "brands" || intent === "resolution" || intent === "build" ||
      (intent === "brand_compare" && state.brandsConfirmed) ||
      (budget != null && (isExplicitBudgetUpdate(userText) || /\bbudget\b/.test(normalize(userText))))) {
    // Continue guided build flow
    if (intent === "build" && !state.useCase) {
      // "Build within my budget" without use case
      if (/budget/.test(normalize(userText)) && !useCase) {
        state.awaiting = state.budget == null ? "budget" : "useCase";
        if (state.budget == null) {
          return { text: "Sure — what's your approximate budget, and what will you use the PC for?" };
        }
        return { text: "Got your budget (" + formatMoney(state.budget) + "). What will you mainly use the PC for?" };
      }
    }

    if (useCase && !state.useCase) state.useCase = useCase;

    // If user said "I want a gaming PC" — ask budget next
    const missing = nextBuildQuestion();
    if (missing) {
      const prefix = budget != null
        ? "Got your budget (" + formatMoney(state.budget) +
          (state.budgetIsMinimum ? "+" : "") + ").\n\n"
        : "";
      return { text: prefix + missing };
    }

    const build = recommendBuild();
    state.lastBuild = build;
    state.selectedComponents = build;
    state.lockedGpuId = null;
    state.lockedCpuId = null;
    let intro;
    if (!build.gpu) {
      intro = "Your budget is too tight for a discrete GPU, so here's an integrated-graphics (iGPU) build instead:";
    } else if (budget != null) {
      intro = "Updated for your " + formatMoney(state.budget) +
        (state.budgetIsMinimum ? "+" : "") + " budget" +
        (state.resolution ? " at " + state.resolution : "") + ":";
    } else {
      intro = "Got it. Here's a build optimized for your budget" +
        (state.resolution ? " and " + state.resolution : "") + ":";
    }
    state.awaitingConfirm = "makeCheaper";
    return {
      text: intro + "\n\nWant me to try a cheaper version of this build?",
      build: build,
      suggest: ["Yes please", "No thanks", "Upgrade the GPU"]
    };
  }

  if (intent === "unsure_pc") {
    return {
      text: "I'm not completely sure what you mean. You can ask me about CPUs, GPUs, RAM, storage, motherboards, PSUs, compatibility, or complete PC builds."
    };
  }

  return {
    text: "That's outside my scope. I'm a PC Builder chatbot, so I can help with PC components, compatibility, budgets, and complete PC builds."
  };
}

// ----- Send / reset -----
function handleSend() {
  const text = userInput.value.trim();

  if (!text) {
    if (sendLockedForEmpty) return;
    emptySendStrikes += 1;
    addBotMessage("Please enter a message first.");
    if (emptySendStrikes >= 2) {
      sendLockedForEmpty = true;
      sendBtn.disabled = true;
      addBotMessage("Send is disabled until you type a real message.");
    }
    return;
  }

  if (isBotBusy) return;

  // Lock clears only after a real message is sent (not merely typed)
  sendLockedForEmpty = false;
  emptySendStrikes = 0;
  addUserMessage(text);
  userInput.value = "";
  renderSuggestions([]); // clear chips after the user engages
  isBotBusy = true;
  sendBtn.disabled = true;
  showTyping();

  const delay = 500 + Math.floor(Math.random() * 500);

  setTimeout(function () {
    hideTyping();
    const reply = generateReply(text);
    if (reply) {
      if (reply.build) {
        addBotMessage(reply.text, createBuildCard(reply.build), reply.build);
        if (reply.suggest) {
          renderSuggestions(reply.suggest);
        } else {
          const afterBuildChips = ["Make this build cheaper", "My prefs", "Recent chats"];
          if (reply.build.gpu) afterBuildChips.splice(1, 0, "Upgrade the GPU");
          renderSuggestions(afterBuildChips);
        }
        archiveCurrentSession(); // keep a snapshot once a build exists
      } else {
        addBotMessage(reply.text);
        if (reply.suggest) {
          renderSuggestions(reply.suggest);
        } else if (state.awaitingConfirm) {
          renderSuggestions(["Yes please", "No thanks", "Another option"]);
        } else if (state.awaiting === "budget") {
          renderSuggestions(["$250", "$700", "$1200", "$1200+"]);
        } else if (state.awaiting === "brands") {
          renderSuggestions(["AMD + NVIDIA", "Intel + NVIDIA", "All AMD", "No preference"]);
        } else if (state.awaiting === "resolution") {
          renderSuggestions(["1080p", "1440p", "4K"]);
        } else if (state.awaiting === "useCase") {
          renderSuggestions(["Gaming", "Programming", "Editing", "Office"]);
        } else if (intentLooksLikeGreeting(text)) {
          renderSuggestions(SUGGESTIONS);
        }
      }
    }
    isBotBusy = false;
    if (!sendLockedForEmpty) sendBtn.disabled = false;
    userInput.focus();
  }, delay);
}

function intentLooksLikeGreeting(text) {
  const intent = detectIntent(text);
  return intent === "greeting" || intent === "how_are_you" || intent === "intro";
}

function resetChat() {
  archiveCurrentSession();
  state = createState();
  currentSession = createSession();
  chatWindow.innerHTML = "";
  isBotBusy = false;
  emptySendStrikes = 0;
  sendLockedForEmpty = false;
  sendBtn.disabled = false;
  closeRecentPanel();
  showWelcome();
  renderRecentPanel();
}

function showWelcome() {
  addBotMessage(
    "Hi! I'm PC Builder. I can help you choose PC components, check basic compatibility, and create a complete PC build. What kind of computer are you looking to build?"
  );
  renderSuggestions(SUGGESTIONS);
}

// ----- Events -----
chatForm.addEventListener("submit", function (e) {
  e.preventDefault();
  handleSend();
});

userInput.addEventListener("input", function () {
  if (!sendLockedForEmpty || isBotBusy) return;
  // While locked: enable only when there is text; clearing the field locks again
  sendBtn.disabled = !userInput.value.trim();
});

resetBtn.addEventListener("click", function () {
  resetChat();
});

prefsBtn.addEventListener("click", function () {
  if (isBotBusy) return;
  closeRecentPanel();
  addBotMessage(prefsSummary());
});

recentBtn.addEventListener("click", function (e) {
  e.stopPropagation();
  toggleRecentPanel();
});

clearRecentBtn.addEventListener("click", function (e) {
  e.stopPropagation();
  saveRecentChats([]);
  renderRecentPanel();
});

document.addEventListener("click", function (e) {
  if (!recentPanel.classList.contains("hidden")) {
    if (!recentPanel.contains(e.target) && e.target !== recentBtn) {
      closeRecentPanel();
    }
  }
});

window.addEventListener("beforeunload", function () {
  archiveCurrentSession();
});

// Boot
currentSession = createSession();
showWelcome();
