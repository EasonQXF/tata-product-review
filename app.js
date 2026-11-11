const PAGE_SIZE = 48;
const STORAGE_KEY = "tata-product-review-v1";
const REVIEWER_KEY = "tata-product-reviewer";
const STATUS_LABELS = {
  pending: "待判断",
  approved: "确认上架",
  needs_changes: "需补充",
  rejected: "不上架",
};
const CATEGORY_LABELS = { Bags: "包袋", Footwear: "鞋履", Jewelry: "珠宝首饰", Watches: "腕表" };

const state = {
  products: [],
  filtered: [],
  decisions: loadDecisions(),
  page: 1,
  lastChange: null,
  toastTimer: null,
};

const ids = [
  "reviewerButton", "downloadButton", "progressText", "progressBar", "pendingCount", "approvedCount",
  "needsCount", "rejectedCount", "searchInput", "categoryFilter", "brandFilter", "statusFilter",
  "clearFilters", "resultCount", "saveHint", "productGrid", "previousPage", "nextPage", "pageInfo",
  "reviewerDialog", "reviewerForm", "reviewerInput", "toast", "toastText", "undoButton",
];
const el = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

function loadDecisions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
}

function saveDecisions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.decisions));
}

function reviewerName() {
  return localStorage.getItem(REVIEWER_KEY) || "";
}

function setReviewer(name) {
  localStorage.setItem(REVIEWER_KEY, name.trim());
  el.reviewerButton.textContent = name.trim() || "填写审核人";
  el.saveHint.textContent = name.trim() ? `审核人：${name.trim()} · 结果保存在当前设备` : "判断结果会保存在当前设备";
}

function productStatus(product) {
  return state.decisions[product.slug]?.status || "pending";
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value || 0);
}

function escapeCsv(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function showToast(message, allowUndo = false) {
  clearTimeout(state.toastTimer);
  el.toastText.textContent = message;
  el.undoButton.hidden = !allowUndo;
  el.toast.classList.add("show");
  state.toastTimer = setTimeout(() => el.toast.classList.remove("show"), allowUndo ? 5000 : 2600);
}

function ensureReviewer() {
  if (reviewerName()) return true;
  el.reviewerInput.value = "";
  el.reviewerDialog.showModal();
  setTimeout(() => el.reviewerInput.focus(), 80);
  return false;
}

function counts() {
  const result = { pending: 0, approved: 0, needs_changes: 0, rejected: 0 };
  for (const product of state.products) result[productStatus(product)] += 1;
  return result;
}

function updateProgress() {
  const result = counts();
  const reviewed = result.approved + result.needs_changes + result.rejected;
  const percent = state.products.length ? Math.round((reviewed / state.products.length) * 100) : 0;
  el.pendingCount.textContent = result.pending.toLocaleString();
  el.approvedCount.textContent = result.approved.toLocaleString();
  el.needsCount.textContent = result.needs_changes.toLocaleString();
  el.rejectedCount.textContent = result.rejected.toLocaleString();
  el.progressText.textContent = `${reviewed.toLocaleString()} / ${state.products.length.toLocaleString()} 已完成（${percent}%）`;
  el.progressBar.style.width = `${percent}%`;
  document.querySelectorAll("[data-quick-status]").forEach((button) => {
    button.classList.toggle("active", button.dataset.quickStatus === el.statusFilter.value);
  });
}

function syncBrands() {
  const selected = el.brandFilter.value;
  const category = el.categoryFilter.value;
  const brands = [...new Set(state.products.filter((p) => !category || p.category === category).map((p) => p.brand).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "en"));
  el.brandFilter.replaceChildren(new Option("全部品牌", ""), ...brands.map((brand) => new Option(brand, brand)));
  if (brands.includes(selected)) el.brandFilter.value = selected;
}

function applyFilters(resetPage = true) {
  const query = el.searchInput.value.trim().toLowerCase();
  const category = el.categoryFilter.value;
  const brand = el.brandFilter.value;
  const status = el.statusFilter.value;
  state.filtered = state.products.filter((product) => {
    const haystack = `${product.sku} ${product.style_name} ${product.brand}`.toLowerCase();
    return (!query || haystack.includes(query))
      && (!category || product.category === category)
      && (!brand || product.brand === brand)
      && (status === "all" || productStatus(product) === status);
  });
  if (resetPage) state.page = 1;
  const pageCount = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
  state.page = Math.min(state.page, pageCount);
  renderProducts();
  updateProgress();
}

function imageElement(product) {
  const wrap = document.createElement("div");
  wrap.className = "image-wrap";
  const fallback = document.createElement("span");
  fallback.className = "image-fallback";
  fallback.textContent = "暂无参考图";
  wrap.appendChild(fallback);
  if (product.image_url) {
    const image = new Image();
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.alt = `${product.brand || ""} ${product.style_name || product.sku || "商品"}`.trim();
    image.addEventListener("load", () => fallback.remove());
    image.addEventListener("error", () => image.remove());
    image.src = product.image_url;
    wrap.appendChild(image);
  }
  const badge = document.createElement("span");
  const status = productStatus(product);
  badge.className = `status-badge ${status}`;
  badge.textContent = STATUS_LABELS[status];
  wrap.appendChild(badge);
  return wrap;
}

function decisionButton(text, className, status, product, note, card) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  button.addEventListener("click", () => saveDecision(product, status, note.value, card));
  return button;
}

function productCard(product) {
  const card = document.createElement("article");
  card.className = "product-card";
  card.dataset.slug = product.slug;
  card.appendChild(imageElement(product));

  const content = document.createElement("div");
  content.className = "product-content";
  const brand = document.createElement("div");
  brand.className = "product-brand";
  brand.textContent = product.brand || "未标注品牌";
  content.appendChild(brand);
  const title = document.createElement("h2");
  title.textContent = [product.sku, product.style_name].filter(Boolean).join(" · ") || "未命名商品";
  content.appendChild(title);
  const meta = document.createElement("div");
  meta.className = "product-meta";
  meta.textContent = [CATEGORY_LABELS[product.category] || product.category, formatMoney(product.price_usd)].filter(Boolean).join(" · ");
  content.appendChild(meta);
  if (product.source_url) {
    const source = document.createElement("a");
    source.className = "source-link";
    source.href = product.source_url;
    source.target = "_blank";
    source.rel = "noreferrer noopener";
    source.textContent = "查看原商品页 ↗";
    content.appendChild(source);
  }
  const noteToggle = document.createElement("button");
  noteToggle.type = "button";
  noteToggle.className = "note-toggle";
  noteToggle.textContent = "添加备注（选填）";
  const note = document.createElement("textarea");
  note.className = "note-area";
  note.maxLength = 500;
  note.placeholder = "例如：缺少尺寸、需要重新拍图";
  note.value = state.decisions[product.slug]?.note || "";
  if (note.value) { note.classList.add("open"); noteToggle.classList.add("open"); }
  noteToggle.addEventListener("click", () => {
    note.classList.toggle("open");
    noteToggle.classList.toggle("open");
    if (note.classList.contains("open")) note.focus();
  });
  content.append(noteToggle, note);

  const actions = document.createElement("div");
  actions.className = "decision-actions";
  actions.append(
    decisionButton("确认上架", "approve-button", "approved", product, note, card),
    decisionButton("需补充", "needs-button", "needs_changes", product, note, card),
    decisionButton("不上架", "reject-button", "rejected", product, note, card),
  );
  if (productStatus(product) !== "pending") actions.append(decisionButton("恢复为待判断", "reset-button", "pending", product, note, card));
  content.appendChild(actions);
  card.appendChild(content);
  return card;
}

function renderProducts() {
  const pageCount = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
  const start = (state.page - 1) * PAGE_SIZE;
  const items = state.filtered.slice(start, start + PAGE_SIZE);
  if (items.length) {
    el.productGrid.replaceChildren(...items.map(productCard));
  } else {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<div><strong>没有符合条件的商品</strong><br><span>可以清空筛选后再查看</span></div>";
    el.productGrid.replaceChildren(empty);
  }
  el.resultCount.textContent = state.filtered.length.toLocaleString();
  el.pageInfo.textContent = `第 ${state.page} / ${pageCount} 页`;
  el.previousPage.disabled = state.page <= 1;
  el.nextPage.disabled = state.page >= pageCount;
}

function saveDecision(product, status, note, card) {
  if (!ensureReviewer()) return;
  const previous = state.decisions[product.slug] ? { ...state.decisions[product.slug] } : null;
  state.decisions[product.slug] = {
    status,
    note: note.trim(),
    reviewer: reviewerName(),
    reviewed_at: new Date().toISOString(),
  };
  if (status === "pending" && !note.trim()) delete state.decisions[product.slug];
  saveDecisions();
  state.lastChange = { slug: product.slug, previous };
  showToast(`已保存：${STATUS_LABELS[status]}`, true);
  if (el.statusFilter.value !== "all" && el.statusFilter.value !== status) {
    card.classList.add("removing");
    setTimeout(() => applyFilters(false), 180);
  } else {
    applyFilters(false);
  }
}

function undoLastChange() {
  if (!state.lastChange) return;
  const { slug, previous } = state.lastChange;
  if (previous) state.decisions[slug] = previous;
  else delete state.decisions[slug];
  state.lastChange = null;
  saveDecisions();
  showToast("已撤销上一步");
  applyFilters(false);
}

function downloadResults() {
  const reviewed = state.products.filter((product) => productStatus(product) !== "pending");
  if (!reviewed.length) { showToast("还没有已完成的审核结果"); return; }
  const headers = ["货号", "品牌", "品类", "款式名称", "审核结果", "审核备注", "审核人", "审核时间", "来源页面"];
  const lines = [headers.map(escapeCsv).join(",")];
  for (const product of reviewed) {
    const decision = state.decisions[product.slug];
    lines.push([
      product.sku, product.brand, CATEGORY_LABELS[product.category] || product.category, product.style_name,
      STATUS_LABELS[decision.status], decision.note, decision.reviewer, decision.reviewed_at, product.source_url,
    ].map(escapeCsv).join(","));
  }
  const blob = new Blob(["\uFEFF", lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `TaTa-商品审核结果-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  showToast(`已下载 ${reviewed.length} 条审核结果`);
}

function scrollToProducts() {
  const top = document.querySelector(".controls").getBoundingClientRect().top + scrollY - 92;
  scrollTo({ top, behavior: "smooth" });
}

async function start() {
  setReviewer(reviewerName());
  try {
    const response = await fetch("./data/products.json", { cache: "force-cache" });
    if (!response.ok) throw new Error("商品数据载入失败");
    state.products = await response.json();
    const categories = [...new Set(state.products.map((p) => p.category).filter(Boolean))];
    el.categoryFilter.append(...categories.map((category) => new Option(CATEGORY_LABELS[category] || category, category)));
    syncBrands();
    applyFilters();
    if (!reviewerName()) ensureReviewer();
  } catch (error) {
    el.productGrid.innerHTML = `<div class="empty-state"><div><strong>${error.message}</strong><br><span>请稍后刷新页面</span></div></div>`;
    el.progressText.textContent = "暂时无法载入商品";
  }
}

let searchTimer;
el.searchInput.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => applyFilters(), 180); });
el.categoryFilter.addEventListener("change", () => { syncBrands(); applyFilters(); });
el.brandFilter.addEventListener("change", () => applyFilters());
el.statusFilter.addEventListener("change", () => applyFilters());
el.clearFilters.addEventListener("click", () => {
  el.searchInput.value = ""; el.categoryFilter.value = ""; syncBrands(); el.brandFilter.value = ""; el.statusFilter.value = "pending"; applyFilters();
});
document.querySelectorAll("[data-quick-status]").forEach((button) => button.addEventListener("click", () => {
  el.statusFilter.value = button.dataset.quickStatus; applyFilters(); scrollToProducts();
}));
el.previousPage.addEventListener("click", () => { if (state.page > 1) { state.page -= 1; renderProducts(); scrollToProducts(); } });
el.nextPage.addEventListener("click", () => { if (state.page < Math.ceil(state.filtered.length / PAGE_SIZE)) { state.page += 1; renderProducts(); scrollToProducts(); } });
el.reviewerButton.addEventListener("click", () => { el.reviewerInput.value = reviewerName(); el.reviewerDialog.showModal(); });
el.reviewerForm.addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const name = el.reviewerInput.value.trim();
  if (!name) { el.reviewerInput.focus(); return; }
  setReviewer(name); el.reviewerDialog.close(); showToast(`审核人已设置为 ${name}`);
});
el.downloadButton.addEventListener("click", downloadResults);
el.undoButton.addEventListener("click", undoLastChange);

start();
