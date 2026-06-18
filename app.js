// ============================================================
// FatLoss PWA v2.0 - 完整仪表盘
// 整合 dashboard.py 的所有优化功能
// ============================================================

// --- Init Supabase ---
const sb = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

// --- Global State ---
let userConfig = null;
let weightData = [];
let dietData = [];
let trainingData = [];
let chartInstances = {};

// --- Auth ---
const AUTH_KEY = 'fatloss_auth';

async function sha256(msg) {
  const encoder = new TextEncoder();
  const data = encoder.encode(msg);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function checkAuth() {
  const stored = sessionStorage.getItem(AUTH_KEY);
  if (stored === 'ok') {
    document.getElementById('authOverlay').style.display = 'none';
    document.getElementById('appContent').style.display = '';
    initApp();
    return;
  }
  document.getElementById('authOverlay').style.display = 'flex';
  document.getElementById('appContent').style.display = 'none';
}

async function doUnlock() {
  const pw = document.getElementById('authPassword').value;
  const hash = await sha256(pw);
  if (hash === AUTH_HASH) {
    sessionStorage.setItem(AUTH_KEY, 'ok');
    document.getElementById('authOverlay').style.display = 'none';
    document.getElementById('appContent').style.display = '';
    document.getElementById('authError').style.display = 'none';
    initApp();
  } else {
    const el = document.getElementById('authError');
    el.textContent = '密码错误';
    el.style.display = 'block';
    document.getElementById('authPassword').value = '';
  }
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('authBtn').addEventListener('click', doUnlock);
  document.getElementById('authPassword').addEventListener('keydown', e => { if (e.key === 'Enter') doUnlock(); });
  checkAuth();
});

// --- Toast ---
function showToast(msg, type='success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + type + ' show';
  setTimeout(() => t.classList.remove('show'), 2500);
}

// --- Tab Switching ---
document.querySelectorAll('.tab-btn').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById('section-' + b.dataset.tab).classList.add('active');
    if (b.dataset.tab === 'dashboard') loadDashboard();
    if (b.dataset.tab === 'history') loadHistory();
  });
});

// --- Form type switching ---
document.querySelectorAll('.meal-tab[data-form]').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.meal-tab[data-form]').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    document.querySelectorAll('.form-section').forEach(f => f.style.display = 'none');
    const formId = b.dataset.form === 'weight' ? 'weightForm' : b.dataset.form === 'diet' ? 'dietForm' : 'trainingForm';
    document.getElementById(formId).style.display = '';
  });
});

// --- Quick meals ---
document.querySelectorAll('.quick-meal').forEach(b => {
  b.addEventListener('click', () => {
    document.getElementById('dCal').value = b.dataset.cal;
    document.getElementById('dPro').value = b.dataset.pro;
    document.getElementById('dCarbs').value = b.dataset.carbs;
    document.getElementById('dFat').value = b.dataset.fat;
    document.getElementById('dFood').value = b.textContent.trim();
  });
});

// --- Meal type tabs ---
document.querySelectorAll('#mealTypeTabs .meal-tab').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#mealTypeTabs .meal-tab').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
  });
});

// --- Training type tabs ---
document.querySelectorAll('#trainingTypeTabs .type-tab').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#trainingTypeTabs .type-tab').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
  });
});

// --- Set today's date on inputs ---
(function() {
  const today = new Date().toISOString().split('T')[0];
  ['wDate','dDate','tDate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });
})();

// ============================================================
// DATA LOADING
// ============================================================

async function loadAllData() {
  try {
    const [cfgRes, wRes, dRes, tRes] = await Promise.all([
      sb.from('user_config').select('*').eq('id', 1).single(),
      sb.from('weight_log').select('*').order('date', { ascending: true }),
      sb.from('diet_log').select('*').order('created_at', { ascending: true }),
      sb.from('training_log').select('*').order('date', { ascending: true })
    ]);
    if (cfgRes.error) throw cfgRes.error;
    userConfig = cfgRes.data;
    weightData = wRes.data || [];
    dietData = dRes.data || [];
    trainingData = tRes.data || [];
    return true;
  } catch (e) {
    console.error('Data load error:', e);
    return false;
  }
}

// ============================================================
// FORM HANDLERS
// ============================================================

// Weight form
document.getElementById('weightForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = {
    date: document.getElementById('wDate').value,
    weight_kg: parseFloat(document.getElementById('wWeight').value),
    bmi: parseFloat(document.getElementById('wBmi').value) || null,
    bodyfat_pct: parseFloat(document.getElementById('wBodyfat').value) || null,
    bmr_kcal: parseInt(document.getElementById('wBmr').value) || null,
    fat_mass_kg: parseFloat(document.getElementById('wFatMass').value) || null,
    lean_mass_kg: parseFloat(document.getElementById('wLeanMass').value) || null,
    muscle_kg: parseFloat(document.getElementById('wMuscle').value) || null,
    muscle_rate_pct: parseFloat(document.getElementById('wMuscleRate').value) || null,
    skeletal_muscle_rate: parseFloat(document.getElementById('wSkeletalMuscle').value) || null,
    bone_mass_kg: parseFloat(document.getElementById('wBoneMass').value) || null,
    body_water_rate: parseFloat(document.getElementById('wWaterRate').value) || null,
    body_water_kg: parseFloat(document.getElementById('wWaterKg').value) || null,
    protein_rate: parseFloat(document.getElementById('wProteinRate').value) || null,
    subcutaneous_fat_rate: parseFloat(document.getElementById('wSubFat').value) || null,
    visceral_fat_level: parseInt(document.getElementById('wVisceral').value) || null,
    body_age: parseInt(document.getElementById('wBodyAge').value) || null
  };
  const { error } = await sb.from('weight_log').upsert(data, { onConflict: 'date' });
  if (error) { showToast('保存失败: ' + error.message, 'error'); return; }
  showToast('体重数据已保存');
  document.getElementById('weightForm').reset();
  document.getElementById('wDate').value = new Date().toISOString().split('T')[0];
  loadDashboard();
});

// Diet form
document.getElementById('dietForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const activeMeal = document.querySelector('#mealTypeTabs .meal-tab.active')?.dataset?.meal || 'breakfast';
  const data = {
    date: document.getElementById('dDate').value,
    meal_type: activeMeal,
    food: document.getElementById('dFood').value,
    calories: parseInt(document.getElementById('dCal').value) || 0,
    protein_g: parseFloat(document.getElementById('dPro').value) || 0,
    carbs_g: parseFloat(document.getElementById('dCarbs').value) || 0,
    fat_g: parseFloat(document.getElementById('dFat').value) || 0
  };
  const { error } = await sb.from('diet_log').insert(data);
  if (error) { showToast('保存失败: ' + error.message, 'error'); return; }
  showToast('饮食已记录');
  document.getElementById('dietForm').reset();
  document.getElementById('dDate').value = new Date().toISOString().split('T')[0];
  loadDashboard();
});

// Training form
document.getElementById('trainingForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const activeType = document.querySelector('#trainingTypeTabs .type-tab.active')?.dataset?.type || 'boxing_strength';
  const data = {
    date: document.getElementById('tDate').value,
    training_type: activeType,
    focus_area: document.getElementById('tFocus').value,
    duration_min: parseInt(document.getElementById('tDuration').value) || 0,
    estimated_calories: parseInt(document.getElementById('tCal').value) || 0,
    superset_rounds: parseInt(document.getElementById('tSuperset').value) || 0
  };
  const { error } = await sb.from('training_log').upsert(data, { onConflict: 'date,training_type' });
  if (error) { showToast('保存失败: ' + error.message, 'error'); return; }
  showToast('训练已记录');
  document.getElementById('trainingForm').reset();
  document.getElementById('tDate').value = new Date().toISOString().split('T')[0];
  loadDashboard();
});

// ============================================================
// DASHBOARD RENDERING
// ============================================================

async function loadDashboard() {
  const container = document.getElementById('dashboardContent');
  container.innerHTML = '<div class="loading"><div class="spinner"></div>加载数据...</div>';
  
  const ok = await loadAllData();
  if (!ok || !userConfig) {
    container.innerHTML = '<div class="empty"><div class="icon">📭</div>暂无数据，请先录入体重</div>';
    return;
  }
  
  // Destroy old charts
  Object.values(chartInstances).forEach(c => c.destroy());
  chartInstances = {};
  
  // Compute stats
  const cfg = userConfig;
  const latestW = weightData.length > 0 ? weightData[weightData.length - 1] : null;
  const firstW = weightData.length > 0 ? weightData[0] : null;
  
  if (!latestW) {
    container.innerHTML = '<div class="empty"><div class="icon">⚖️</div>暂无体重数据</div>';
    return;
  }
  
  const totalLost = firstW ? (firstW.weight_kg - latestW.weight_kg) : 0;
  const remaining = latestW.weight_kg - cfg.target_weight_kg;
  const totalToLose = firstW ? (firstW.weight_kg - cfg.target_weight_kg) : 1;
  const progressPct = totalToLose > 0 ? Math.min(100, Math.max(0, (totalLost / totalToLose * 100))) : 0;
  
  // Weekly stats
  let weekRate = 0;
  if (weightData.length >= 2) {
    const days = Math.max(1, (new Date(latestW.date) - new Date(firstW.date)) / 86400000);
    weekRate = totalLost / days * 7;
  }
  const estWeeks = remaining > 0 ? remaining / 0.7 : 0;
  
  // Diet aggregates
  const dietByDate = {};
  dietData.forEach(d => {
    if (!dietByDate[d.date]) dietByDate[d.date] = { calories_in: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    dietByDate[d.date].calories_in += d.calories || 0;
    dietByDate[d.date].protein_g += d.protein_g || 0;
    dietByDate[d.date].carbs_g += d.carbs_g || 0;
    dietByDate[d.date].fat_g += d.fat_g || 0;
  });
  
  // Training aggregates
  const trainByDate = {};
  trainingData.forEach(t => {
    if (!trainByDate[t.date]) trainByDate[t.date] = { calories_out: 0, training_types: [] };
    const cal = parseFloat(t.estimated_calories) || 0;
    trainByDate[t.date].calories_out += cal;
    if (!trainByDate[t.date].training_types.includes(t.training_type)) {
      trainByDate[t.date].training_types.push(t.training_type);
    }
  });
  
  // BMR helper: get resting metabolic rate for a given date
  const getBMR = (date) => {
    // 1. Prefer BMR from weight record on that exact date
    const w = weightData.find(x => x.date === date);
    if (w && w.bmr_kcal) return w.bmr_kcal;
    // 2. Fall back to the most recent BMR measurement
    const latestWithBMR = [...weightData].reverse().find(x => x.bmr_kcal);
    if (latestWithBMR) return latestWithBMR.bmr_kcal;
    // 3. Estimate from latest weight (~22 kcal per kg per day)
    const latestW = w || weightData[weightData.length - 1];
    if (latestW && latestW.weight_kg) return Math.round(latestW.weight_kg * 22);
    // 4. Ultimate fallback
    return cfg.daily_cal_target + 500;
  };

  // Merge into daily summaries
  const allDates = [...new Set([...Object.keys(dietByDate), ...Object.keys(trainByDate)])].sort();
  const dailySummaries = allDates.map(date => {
    const w = weightData.find(x => x.date === date);
    const trainCal = trainByDate[date] ? Math.round(trainByDate[date].calories_out) : 0;
    const bmr = getBMR(date);
    return {
      date,
      weight_kg: w ? w.weight_kg : null,
      bodyfat_pct: w ? w.bodyfat_pct : null,
      calories_in: dietByDate[date] ? Math.round(dietByDate[date].calories_in) : 0,
      calories_out: trainCal + bmr,
      bmr_kcal: bmr,
      train_cal: trainCal,
      protein_g: dietByDate[date] ? Math.round(dietByDate[date].protein_g) : 0,
      carbs_g: dietByDate[date] ? Math.round(dietByDate[date].carbs_g) : 0,
      fat_g: dietByDate[date] ? Math.round(dietByDate[date].fat_g) : 0,
      training_types: trainByDate[date] ? trainByDate[date].training_types.join(',') : ''
    };
  }).filter(d => d.calories_in > 0 || d.calories_out > 0);
  
  // Last 7 days stats
  const recent7 = dailySummaries.filter(d => d.calories_in > 0).slice(-7);
  const avgCal = recent7.length > 0 ? recent7.reduce((s,d) => s + d.calories_in, 0) / recent7.length : 0;
  const avgPro = recent7.length > 0 ? recent7.reduce((s,d) => s + d.protein_g, 0) / recent7.length : 0;
  const trainingDays = trainingData.length > 0 ? [...new Set(trainingData.map(t => t.date))].length : 0;
  const daysCount = weightData.length;
  
  // AI Advice
  const advice = generateAdvice(cfg, weightData, recent7, totalLost, remaining, weekRate, avgCal, avgPro, estWeeks);
  
  // Render HTML
  let html = renderStatsGrid(cfg, latestW, totalLost, remaining, progressPct, weekRate, estWeeks, avgCal, avgPro, daysCount, trainingDays);
  html += renderMacroCard(cfg, avgCal, avgPro, recent7);
  html += renderCharts();
  html += renderAdviceSection(advice);
  html += renderDataTable(cfg, dailySummaries, weightData);
  html += renderTimeline(cfg, firstW, latestW, totalLost, estWeeks);
  
  container.innerHTML = html;
  
  // Draw charts
  drawCharts(weightData, dailySummaries, cfg);
  
  // Update badge
  document.getElementById('statusBadge').textContent = progressPct.toFixed(0) + '% 达标';
}

function renderStatsGrid(cfg, latestW, totalLost, remaining, progressPct, weekRate, estWeeks, avgCal, avgPro, daysCount, trainingDays) {
  const pctColor = progressPct > 30 ? 'var(--green)' : progressPct > 10 ? 'var(--orange)' : 'var(--red)';
  return `
  <div class="card" style="margin-bottom:14px">
    <h2>${latestW.weight_kg}<span class="unit"> kg</span></h2>
    <div class="sub-row">
      <span>已减 <strong>${totalLost.toFixed(1)} kg</strong></span>
      <span>目标 <strong>${cfg.target_weight_kg} kg</strong></span>
      ${latestW.bodyfat_pct ? `<span>体脂 <strong>${latestW.bodyfat_pct}%</strong></span>` : ''}
    </div>
    <div style="background:#e9ecef;border-radius:10px;height:8px;margin-top:10px;overflow:hidden">
      <div style="height:100%;border-radius:10px;width:${progressPct}%;background:linear-gradient(90deg,#27ae60,#2ecc71);transition:width .5s"></div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--sub);margin-top:4px">
      <span>0%</span><span style="color:${pctColor};font-weight:600">${progressPct.toFixed(1)}%</span><span>100%</span>
    </div>
  </div>
  <div class="stat-grid">
    <div class="stat-card">
      <div class="value" style="color:var(--green)">${totalLost.toFixed(1)}</div>
      <div class="label">已减 (kg)</div>
      <div class="delta good">剩 ${remaining.toFixed(1)} kg</div>
    </div>
    <div class="stat-card">
      <div class="value" style="color:var(--purple)">${progressPct.toFixed(1)}%</div>
      <div class="label">完成进度</div>
      <div class="delta good">目标 ${cfg.target_weight_kg}kg</div>
    </div>
    <div class="stat-card">
      <div class="value" style="color:var(--orange)">${weekRate >= 0 ? weekRate.toFixed(2) : '0.00'}</div>
      <div class="label">周均减重 (kg)</div>
      <div class="delta ${weekRate > 0.8 ? 'warn' : 'good'}">${weekRate > 0 ? '预计 ' + Math.round(estWeeks) + ' 周达标' : '--'}</div>
    </div>
    <div class="stat-card">
      <div class="value" style="color:${avgCal > cfg.daily_cal_target + 150 ? 'var(--red)' : 'var(--green)'}">${Math.round(avgCal)}</div>
      <div class="label">7日均摄入 (kcal)</div>
      <div class="delta ${avgCal > cfg.daily_cal_target + 150 ? 'bad' : 'good'}">目标 ${cfg.daily_cal_target}</div>
    </div>
    <div class="stat-card">
      <div class="value" style="color:${avgPro < cfg.protein_target_g * 0.85 ? 'var(--red)' : 'var(--purple)'}">${Math.round(avgPro)}</div>
      <div class="label">7日均蛋白 (g)</div>
      <div class="delta ${avgPro < cfg.protein_target_g * 0.85 ? 'bad' : 'good'}">目标 ${cfg.protein_target_g}</div>
    </div>
    <div class="stat-card">
      <div class="value">${daysCount}</div>
      <div class="label">记录天数</div>
      <div class="delta good">训练日 ${trainingDays}</div>
    </div>
    <div class="stat-card">
      <div class="value" style="color:var(--orange)">${latestW.bodyfat_pct || '--'}</div>
      <div class="label">体脂率 (%)</div>
      <div class="delta good">目标 15%</div>
    </div>
    <div class="stat-card">
      <div class="value" style="color:var(--accent)">${Math.round(estWeeks)}</div>
      <div class="label">预计达标 (周)</div>
      <div class="delta good">约 ${(estWeeks/4.3).toFixed(1)} 个月</div>
    </div>
  </div>`;
}

function renderMacroCard(cfg, avgCal, avgPro, recent7) {
  const avgCarbs = recent7.length > 0 ? recent7.reduce((s,d) => s + (d.carbs_g || 0), 0) / recent7.length : 0;
  const avgFat = recent7.length > 0 ? recent7.reduce((s,d) => s + (d.fat_g || 0), 0) / recent7.length : 0;
  
  const calRatio = Math.min(100, avgCal / cfg.daily_cal_target * 100);
  const proRatio = Math.min(100, avgPro / cfg.protein_target_g * 100);
  const carbsRatio = Math.min(100, avgCarbs / cfg.carbs_target_g * 100);
  const fatRatio = Math.min(100, avgFat / cfg.fat_target_g * 100);
  
  const barStyle = (pct, color) => {
    const bg = pct > 100 ? 'var(--red)' : color;
    return `<div style="background:#e9ecef;border-radius:5px;height:6px;margin-top:4px;overflow:hidden">
      <div style="height:100%;border-radius:5px;width:${Math.min(100,pct)}%;background:${bg};transition:width .5s"></div>
    </div>`;
  };
  
  return `
  <div class="card">
    <h3>宏营养素 · 7日均值 vs 目标</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px">
      <div>
        <div style="display:flex;justify-content:space-between;font-size:13px">
          <span>🔥 热量</span><span><strong>${Math.round(avgCal)}</strong> / ${cfg.daily_cal_target} kcal</span>
        </div>
        ${barStyle(calRatio, 'var(--red)')}
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;font-size:13px">
          <span>🥩 蛋白质</span><span><strong>${Math.round(avgPro)}</strong> / ${cfg.protein_target_g} g</span>
        </div>
        ${barStyle(proRatio, 'var(--purple)')}
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;font-size:13px">
          <span>🍚 碳水</span><span><strong>${Math.round(avgCarbs)}</strong> / ${cfg.carbs_target_g} g</span>
        </div>
        ${barStyle(carbsRatio, 'var(--orange)')}
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;font-size:13px">
          <span>🧈 脂肪</span><span><strong>${Math.round(avgFat)}</strong> / ${cfg.fat_target_g} g</span>
        </div>
        ${barStyle(fatRatio, '#6bcb77')}
      </div>
    </div>
  </div>`;
}

function renderCharts() {
  return `
  <div class="card"><h3>📈 体重趋势</h3><div class="chart-wrap tall"><canvas id="chartWeight"></canvas></div></div>
  <div class="card"><h3>🍽️ 热量摄入 vs 消耗</h3><div class="chart-wrap"><canvas id="chartCalorie"></canvas></div></div>
  <div class="card"><h3>📊 热量缺口 (负值=消耗>摄入)</h3><div class="chart-wrap"><canvas id="chartGap"></canvas></div></div>
  <div class="card"><h3>🥩 蛋白质摄入</h3><div class="chart-wrap"><canvas id="chartProtein"></canvas></div></div>
  <div class="card"><h3>⚖️ 体脂率趋势</h3><div class="chart-wrap"><canvas id="chartBf"></canvas></div></div>`;
}

function renderAdviceSection(advice) {
  return `
  <div class="card">
    <h3>🧠 AI 个性化建议</h3>
    ${advice.map(s => `<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:14px;line-height:1.6">${s}</div>`).join('')}
  </div>`;
}

function renderDataTable(cfg, dailySummaries, weightData) {
  const weightMap = {};
  weightData.forEach(w => { weightMap[w.date] = w; });
  const rows = dailySummaries.slice(-10).reverse();
  
  let tbody = '';
  rows.forEach(d => {
    const w = weightMap[d.date];
    const net = d.calories_in - d.calories_out;
    const netColor = net < 0 ? 'var(--green)' : 'var(--red)';
    const netSign = net < 0 ? '' : '+';
    tbody += `<tr>
      <td style="font-size:12px">${d.date}</td>
      <td>${w ? '<strong>' + w.weight_kg + '</strong> kg' : '--'}</td>
      <td>${w && w.bodyfat_pct ? w.bodyfat_pct + '%' : '--'}</td>
      <td>${d.calories_in} kcal</td>
      <td>${d.calories_out} kcal${d.train_cal > 0 ? ' (运动' + d.train_cal + ')' : ''}</td>
      <td style="color:${netColor}">${netSign}${net} kcal</td>
      <td>${d.protein_g}g</td>
      <td style="font-size:11px">${d.training_types || '--'}</td>
    </tr>`;
  });
  
  return `
  <div class="card">
    <h3>📋 详细记录 (最近10条)</h3>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f8f9fa">
          <th style="padding:8px 6px;text-align:left">日期</th>
          <th style="padding:8px 6px;text-align:left">体重</th>
          <th style="padding:8px 6px;text-align:left">体脂</th>
          <th style="padding:8px 6px;text-align:left">摄入</th>
          <th style="padding:8px 6px;text-align:left">消耗</th>
          <th style="padding:8px 6px;text-align:left">净热量</th>
          <th style="padding:8px 6px;text-align:left">蛋白</th>
          <th style="padding:8px 6px;text-align:left">训练</th>
        </tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
  </div>`;
}

function renderTimeline(cfg, firstW, latestW, totalLost, estWeeks) {
  if (!firstW) return '';
  return `
  <div class="card" style="text-align:center;padding:20px">
    <div style="display:flex;align-items:center;justify-content:center;gap:20px;flex-wrap:wrap">
      <div>
        <div style="font-size:11px;color:var(--sub)">起点</div>
        <div style="font-size:22px;font-weight:700">${firstW.weight_kg}<span style="font-size:13px">kg</span></div>
        <div style="font-size:10px;color:var(--sub)">${firstW.date}</div>
      </div>
      <div style="font-size:36px;opacity:.2">→</div>
      <div>
        <div style="font-size:11px;color:var(--sub)">当前</div>
        <div style="font-size:26px;font-weight:700;color:var(--accent)">${latestW.weight_kg}<span style="font-size:14px">kg</span></div>
        <div style="font-size:10px;color:var(--red)">-${totalLost.toFixed(1)}kg</div>
      </div>
      <div style="font-size:36px;opacity:.2">→</div>
      <div style="border:2px dashed var(--green);border-radius:12px;padding:12px 16px">
        <div style="font-size:11px;color:var(--green)">🎯 目标</div>
        <div style="font-size:26px;font-weight:700;color:var(--green)">${cfg.target_weight_kg}<span style="font-size:14px">kg</span></div>
        <div style="font-size:10px;color:var(--sub)">约 ${Math.round(estWeeks)} 周后</div>
      </div>
    </div>
  </div>`;
}

// ============================================================
// CHART DRAWING
// ============================================================

function drawCharts(weightData, dailySummaries, cfg) {
  Chart.defaults.font.family = "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
  Chart.defaults.font.size = 11;
  
  const weightDates = weightData.map(w => w.date);
  const weightVals = weightData.map(w => w.weight_kg);
  const targetLine = Array(weightDates.length).fill(cfg.target_weight_kg);
  
  // Weight trend
  const wCtx = document.getElementById('chartWeight')?.getContext('2d');
  if (wCtx) {
    chartInstances.weight = new Chart(wCtx, {
      type: 'line', data: { labels: weightDates, datasets: [
        { label: '体重 (kg)', data: weightVals, borderColor: '#2980b9', backgroundColor: 'rgba(41,128,185,0.08)', fill: true, tension: 0.3, pointRadius: 3 },
        { label: '目标 ' + cfg.target_weight_kg + 'kg', data: targetLine, borderColor: '#27ae60', borderDash: [6,4], pointRadius: 0, fill: false }
      ]},
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { boxWidth: 12 } } },
        scales: { y: { min: cfg.target_weight_kg - 3, max: (weightData[0]?.weight_kg || 75) + 2 } } }
    });
  }
  
  // Calorie chart
  const calDates = dailySummaries.filter(d => d.calories_in > 0).map(d => d.date);
  const calIn = dailySummaries.filter(d => d.calories_in > 0).map(d => d.calories_in);
  const calOut = dailySummaries.filter(d => d.calories_in > 0).map(d => d.calories_out);
  const calTarget = Array(calDates.length).fill(cfg.daily_cal_target);
  
  const calCtx = document.getElementById('chartCalorie')?.getContext('2d');
  if (calCtx && calDates.length > 0) {
    chartInstances.calorie = new Chart(calCtx, {
      type: 'bar', data: { labels: calDates, datasets: [
        { label: '摄入', data: calIn, backgroundColor: 'rgba(231,76,60,0.55)', borderColor: '#e74c3c', borderWidth: 1 },
        { label: '消耗', data: calOut, backgroundColor: 'rgba(39,174,96,0.35)', borderColor: '#27ae60', borderWidth: 1 },
        { label: '目标', data: calTarget, type: 'line', borderColor: '#e67e22', borderDash: [5,5], pointRadius: 0, fill: false }
      ]},
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { boxWidth: 12 } } } }
    });
  }
  
  // Gap chart
  const gapData = dailySummaries.filter(d => d.calories_in > 0).map(d => d.calories_in - d.calories_out);
  const gapLabels = dailySummaries.filter(d => d.calories_in > 0).map(d => d.date);
  const bgColors = gapData.map(v => v < 0 ? 'rgba(39,174,96,0.6)' : 'rgba(231,76,60,0.6)');
  const borderCols = gapData.map(v => v < 0 ? '#27ae60' : '#e74c3c');
  
  const gapCtx = document.getElementById('chartGap')?.getContext('2d');
  if (gapCtx && gapLabels.length > 0) {
    chartInstances.gap = new Chart(gapCtx, {
      type: 'bar', data: { labels: gapLabels, datasets: [
        { label: '净热量 (负值=缺口)', data: gapData, backgroundColor: bgColors, borderColor: borderCols, borderWidth: 1 }
      ]},
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { boxWidth: 12 } } } }
    });
  }
  
  // Protein chart
  const proVals = dailySummaries.filter(d => d.protein_g > 0).map(d => d.protein_g);
  const proTargetLine = Array(proVals.length).fill(cfg.protein_target_g);
  
  const proCtx = document.getElementById('chartProtein')?.getContext('2d');
  if (proCtx && proVals.length > 0) {
    chartInstances.protein = new Chart(proCtx, {
      type: 'bar', data: { labels: calDates, datasets: [
        { label: '蛋白质 (g)', data: proVals, backgroundColor: 'rgba(142,68,173,0.45)', borderColor: '#8e44ad', borderWidth: 1 },
        { label: '目标 ' + cfg.protein_target_g + 'g', data: proTargetLine, type: 'line', borderColor: '#e74c3c', borderDash: [5,5], pointRadius: 0 }
      ]},
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { boxWidth: 12 } } } }
    });
  }
  
  // Body fat chart
  const bfFiltered = weightData.filter(w => w.bodyfat_pct != null);
  const bfDates = bfFiltered.map(w => w.date);
  const bfVals = bfFiltered.map(w => w.bodyfat_pct);
  
  const bfCtx = document.getElementById('chartBf')?.getContext('2d');
  if (bfCtx && bfVals.length > 0) {
    chartInstances.bf = new Chart(bfCtx, {
      type: 'line', data: { labels: bfDates, datasets: [
        { label: '体脂率 (%)', data: bfVals, borderColor: '#f39c12', backgroundColor: 'rgba(243,156,18,0.08)', fill: true, tension: 0.3, pointRadius: 3 },
        { label: '目标 15%', data: Array(bfDates.length).fill(15), borderColor: '#e74c3c', borderDash: [6,4], pointRadius: 0, fill: false }
      ]},
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { boxWidth: 12 } } },
        scales: { y: { min: 10, max: 30 } } }
    });
  }
}

// ============================================================
// AI ADVICE
// ============================================================

function generateAdvice(cfg, weightData, recent7, totalLost, remaining, weekRate, avgCal, avgPro, estWeeks) {
  const advice = [];
  if (weightData.length < 1) return ['暂无数据，请录入第一笔体重数据。'];
  
  const latest = weightData[weightData.length - 1];
  
  // Progress advice
  if (weightData.length >= 2) {
    const days = Math.max(1, (new Date(latest.date) - new Date(weightData[0].date)) / 86400000);
    if (days >= 7) {
      if (weekRate > 1.0) {
        advice.push(`⚡ 当前周减重速度 ${weekRate.toFixed(1)}kg，偏快，注意保肌。建议蛋白质不低于 ${cfg.protein_target_g}g/天。`);
      } else if (weekRate < 0.3 && weekRate >= 0) {
        advice.push(`🐢 当前周减重速度 ${weekRate.toFixed(1)}kg，偏慢。检查是否有额外摄入，或考虑进餐时间窗口调整。`);
      } else if (weekRate >= 0.3) {
        advice.push(`✅ 减重节奏合理，周均 ${weekRate.toFixed(1)}kg。继续坚持当前方案。`);
      }
    }
  }
  
  // Remaining target
  if (remaining > 0) {
    advice.push(`🎯 距目标还差 ${remaining.toFixed(1)}kg，按标准速度预计 ${Math.round(estWeeks)} 周（约 ${(estWeeks/4.3).toFixed(1)} 个月）达标。`);
  } else {
    advice.push(`🎉 已达成目标体重 ${cfg.target_weight_kg}kg！继续保持。`);
  }
  
  // Diet advice
  if (recent7.length >= 3) {
    if (avgCal > cfg.daily_cal_target + 150) {
      advice.push(`⚠️ 近7日平均摄入 ${Math.round(avgCal)} kcal，超出目标 ${cfg.daily_cal_target} kcal。建议控制晚餐碳水和油脂摄入。`);
    } else if (avgCal < cfg.daily_cal_target - 200) {
      advice.push(`💡 近7日平均摄入 ${Math.round(avgCal)} kcal，偏低。若训练强度不变可适当增加碳水保证训练质量。`);
    }
    
    if (avgPro < cfg.protein_target_g * 0.85) {
      advice.push(`🥩 近7日蛋白质平均 ${Math.round(avgPro)}g（目标 ${cfg.protein_target_g}g），需增加。建议：每餐保证一掌大小瘦肉，训练后30分钟内补充蛋白。`);
    }
  }
  
  // Training advice
  advice.push('🏋️ 训练提醒：力量训练日保证蛋白质摄入150g+，训练前后补充碳水（香蕉/燕麦/米饭）。打拳日可适当增加碳水。');
  
  if (remaining > 0 && remaining < 5) {
    advice.push('🔥 已进入减脂冲刺阶段！最后5kg最难减，坚持住，如果有平台期考虑调整训练结构或安排1周碳水循环。');
  }
  
  return advice;
}

// ============================================================
// HISTORY
// ============================================================

async function loadHistory() {
  const container = document.getElementById('historyList');
  container.innerHTML = '<div class="loading"><div class="spinner"></div>加载中...</div>';
  
  const ok = await loadAllData();
  if (!ok) { container.innerHTML = '<div class="empty">加载失败</div>'; return; }
  
  let items = [];
  
  // Weight entries
  weightData.slice().reverse().forEach(w => {
    items.push({
      type: 'weight', date: w.date,
      detail: `${w.weight_kg} kg | 体脂 ${w.bodyfat_pct || '--'}% | BMI ${w.bmi || '--'}`,
      tag: 'weight'
    });
  });
  
  // Diet entries (grouped by date)
  const dietDates = {};
  dietData.forEach(d => {
    if (!dietDates[d.date]) dietDates[d.date] = [];
    dietDates[d.date].push(d);
  });
  Object.entries(dietDates).sort((a,b) => b[0].localeCompare(a[0])).forEach(([date, meals]) => {
    const totalCal = meals.reduce((s,m) => s + (m.calories || 0), 0);
    items.push({
      type: 'diet', date,
      detail: `${meals.length} 餐 共 ${totalCal} kcal`,
      tag: 'diet'
    });
  });
  
  // Training entries
  trainingData.slice().reverse().forEach(t => {
    const typeNames = { boxing: '🥊 打拳', strength: '🏋️ 力量', boxing_strength: '🥊+🏋️ 混合', strength_cardio: '🏋️+🏃 混合', cardio: '🏃 有氧', rest: '😴 休息', apple_watch: '⌚ Apple Watch' };
    items.push({
      type: 'training', date: t.date,
      detail: `${typeNames[t.training_type] || t.training_type} · ${t.duration_min || 0}min · ${Math.round(t.estimated_calories || 0)}kcal`,
      tag: 'training'
    });
  });
  
  // Sort by date desc
  items.sort((a,b) => b.date.localeCompare(a.date) || b.type.localeCompare(a.type));
  
  if (items.length === 0) {
    container.innerHTML = '<div class="empty"><div class="icon">📭</div>暂无记录</div>';
    return;
  }
  
  const tagClass = { weight: 'tag-weight', diet: 'tag-diet', training: 'tag-training' };
  const tagLabel = { weight: '体重', diet: '饮食', training: '训练' };
  
  container.innerHTML = items.map(i => `
    <div class="history-item">
      <div><div class="date">${i.date}</div><div class="detail">${i.detail}</div></div>
      <span class="tag ${tagClass[i.tag]}">${tagLabel[i.tag]}</span>
    </div>
  `).join('');
}

// ============================================================
// INIT
// ============================================================

async function initApp() {
  await loadDashboard();
}
