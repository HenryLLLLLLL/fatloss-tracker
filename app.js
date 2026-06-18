// FatLoss PWA - App Logic
(function() {
'use strict';

let supabase = null;
const charts = {};
let currentForm = 'weight';
let selectedMeal = 'breakfast';
let selectedTraining = 'boxing_strength';

// ============ INIT ============
function init() {
  if (!SUPABASE_CONFIG.url || SUPABASE_CONFIG.url.includes('YOUR-PROJECT-ID')) {
    document.getElementById('dashboardContent').innerHTML =
      '<div class="card" style="text-align:center;padding:30px"><p style="font-size:18px;margin-bottom:10px">欢迎使用 FatLoss</p><p style="color:#6e6e73;font-size:14px;margin-bottom:16px">请先在 config.js 中配置 Supabase 连接信息</p><p style="font-size:12px;color:#6e6e73">1. 去 supabase.com 创建项目<br>2. 在 SQL Editor 运行 sql/schema.sql<br>3. 将 URL 和 anon key 填入 config.js</p></div>';
    document.getElementById('statusBadge').textContent = '未连接';
    document.getElementById('statusBadge').style.background = '#ff9500';
    return;
  }
  supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  setTodayDates();
  bindEvents();
  loadDashboard();
}

function setTodayDates() {
  const today = new Date().toISOString().split('T')[0];
  ['wDate','dDate','tDate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });
}

// ============ EVENTS ============
function bindEvents() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Form type switching inside record
  document.querySelectorAll('[data-form]').forEach(btn => {
    btn.addEventListener('click', () => {
      const form = btn.dataset.form;
      document.querySelectorAll('[data-form]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.form-section').forEach(f => f.style.display = 'none');
      if (form === 'weight') document.getElementById('weightForm').style.display = '';
      if (form === 'diet') document.getElementById('dietForm').style.display = '';
      if (form === 'training') document.getElementById('trainingForm').style.display = '';
      currentForm = form;
    });
  });

  // Meal type tabs
  document.querySelectorAll('#mealTypeTabs .meal-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#mealTypeTabs .meal-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedMeal = btn.dataset.meal;
    });
  });

  // Training type tabs
  document.querySelectorAll('#trainingTypeTabs .type-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#trainingTypeTabs .type-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedTraining = btn.dataset.type;
    });
  });

  // Quick meal fill
  document.querySelectorAll('.quick-meal').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('dCal').value = btn.dataset.cal;
      document.getElementById('dPro').value = btn.dataset.pro;
      document.getElementById('dCarbs').value = btn.dataset.carbs;
      document.getElementById('dFat').value = btn.dataset.fat;
      showToast('已填入 ' + btn.textContent.trim().split(' ')[0], 'success');
    });
  });

  // Form submissions
  document.getElementById('weightForm').addEventListener('submit', submitWeight);
  document.getElementById('dietForm').addEventListener('submit', submitDiet);
  document.getElementById('trainingForm').addEventListener('submit', submitTraining);
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(`section-${tab}`).classList.add('active');

  if (tab === 'dashboard') loadDashboard();
  if (tab === 'history') loadHistory();
}

// ============ TOAST ============
function showToast(msg, type) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast ' + (type || '') + ' show';
  setTimeout(() => toast.className = 'toast', 2000);
}

// ============ SUBMIT WEIGHT ============
function gv(id) { const el = document.getElementById(id); return el ? (el.value.trim() || null) : null; }
function gvf(id) { const v = gv(id); return v ? parseFloat(v) : null; }
function gvi(id) { const v = gv(id); return v ? parseInt(v) : null; }

async function submitWeight(e) {
  e.preventDefault();
  const date = gv('wDate');
  const weight = gvf('wWeight');
  if (!date || !weight) return showToast('请填写日期和体重', 'error');

  const { error } = await supabase.from('weight_log').upsert({
    date, weight_kg: weight,
    bmi: gvf('wBmi'),
    bodyfat_pct: gvf('wBodyfat'),
    bmr_kcal: gvi('wBmr'),
    fat_mass_kg: gvf('wFatMass'),
    lean_mass_kg: gvf('wLeanMass'),
    muscle_kg: gvf('wMuscle'),
    muscle_rate_pct: gvf('wMuscleRate'),
    skeletal_muscle_rate: gvf('wSkeletalMuscle'),
    bone_mass_kg: gvf('wBoneMass'),
    protein_rate: gvf('wProteinRate'),
    body_water_rate: gvf('wWaterRate'),
    body_water_kg: gvf('wWaterKg'),
    subcutaneous_fat_rate: gvf('wSubFat'),
    visceral_fat_level: gvi('wVisceral'),
    body_age: gvi('wBodyAge')
  }, { onConflict: 'date' });

  if (error) { showToast('保存失败: ' + error.message, 'error'); return; }
  showToast('体成分数据已保存 ' + weight + 'kg', 'success');
  // Clear all fields
  ['wWeight','wBmi','wBodyfat','wBmr','wFatMass','wLeanMass','wMuscle','wMuscleRate',
   'wSkeletalMuscle','wBoneMass','wProteinRate','wWaterRate','wWaterKg','wSubFat','wVisceral','wBodyAge']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  loadDashboard();
}

// ============ SUBMIT DIET ============
async function submitDiet(e) {
  e.preventDefault();
  const date = document.getElementById('dDate').value;
  const food = document.getElementById('dFood').value.trim();
  const cal = parseInt(document.getElementById('dCal').value) || 0;
  const pro = parseFloat(document.getElementById('dPro').value) || 0;
  const carbs = parseFloat(document.getElementById('dCarbs').value) || 0;
  const fat = parseFloat(document.getElementById('dFat').value) || 0;

  if (!date || !food) return showToast('请填写日期和食物', 'error');

  const { error } = await supabase.from('diet_log').insert({
    date, meal_type: selectedMeal, food, calories: cal, protein_g: pro, carbs_g: carbs, fat_g: fat
  });

  if (error) { showToast('保存失败: ' + error.message, 'error'); return; }
  showToast('饮食已保存', 'success');
  document.getElementById('dFood').value = '';
  document.getElementById('dCal').value = '';
  document.getElementById('dPro').value = '';
  document.getElementById('dCarbs').value = '';
  document.getElementById('dFat').value = '';
  loadDashboard();
}

// ============ SUBMIT TRAINING ============
async function submitTraining(e) {
  e.preventDefault();
  const date = document.getElementById('tDate').value;
  const duration = parseInt(document.getElementById('tDuration').value) || 0;
  const cal = parseInt(document.getElementById('tCal').value) || 0;
  const superset = parseInt(document.getElementById('tSuperset').value) || 0;
  const focus = document.getElementById('tFocus').value;

  if (!date) return showToast('请填写日期', 'error');

  const { error } = await supabase.from('training_log').insert({
    date, training_type: selectedTraining, focus_area: focus,
    duration_min: duration, estimated_calories: cal, superset_rounds: superset
  });

  if (error) { showToast('保存失败: ' + error.message, 'error'); return; }
  showToast('训练已保存', 'success');
  document.getElementById('tDuration').value = '';
  document.getElementById('tCal').value = '';
  loadDashboard();
}

// ============ DASHBOARD ============
async function loadDashboard() {
  if (!supabase) return;
  const container = document.getElementById('dashboardContent');
  container.innerHTML = '<div class="loading"><div class="spinner"></div>加载数据...</div>';

  try {
    const [weightData, dietData, trainData, configData] = await Promise.all([
      supabase.from('weight_log').select('*').order('date', { ascending: true }),
      supabase.from('diet_log').select('*').order('date', { ascending: true }),
      supabase.from('training_log').select('*').order('date', { ascending: true }),
      supabase.from('user_config').select('*').single()
    ]);

    const weights = weightData.data || [];
    const diets = dietData.data || [];
    const trainings = trainData.data || [];
    const config = configData.data || {};

    renderDashboard(container, weights, diets, trainings, config);
  } catch (err) {
    container.innerHTML = '<div class="empty"><p>加载失败，请检查网络连接</p></div>';
    console.error(err);
  }
}

function renderDashboard(container, weights, diets, trainings, config) {
  const latestWeight = weights.length ? weights[weights.length - 1] : null;
  const targetW = config.target_weight_kg || 65;
  const targetBf = config.target_bodyfat_pct || 15;
  const calTarget = config.daily_cal_target || 1650;
  const proTarget = config.protein_target_g || 150;

  // Calculate today's diet totals
  const today = new Date().toISOString().split('T')[0];
  const todayDiets = diets.filter(d => d.date === today && d.meal_type !== 'summary');
  const todayCal = todayDiets.reduce((s, d) => s + (d.calories || 0), 0);
  const todayPro = todayDiets.reduce((s, d) => s + (d.protein_g || 0), 0);
  const todayCarbs = todayDiets.reduce((s, d) => s + (d.carbs_g || 0), 0);
  const todayFat = todayDiets.reduce((s, d) => s + (d.fat_g || 0), 0);

  // Today's training
  const todayTrain = trainings.filter(t => t.date === today);
  const todayTrainCal = todayTrain.reduce((s, t) => s + (t.estimated_calories || 0), 0);

  // Weight delta from start
  const startW = config.start_weight_kg || weights[0]?.weight_kg || latestWeight?.weight_kg || 74;
  const deltaW = latestWeight ? (latestWeight.weight_kg - startW).toFixed(1) : 0;
  const remainingW = latestWeight ? (latestWeight.weight_kg - targetW).toFixed(1) : 0;

  // Calorie gap
  const calGap = calTarget - todayCal;

  let html = '';

  // Weight summary card
  html += '<div class="card" style="text-align:center">';
  html += '<h2>' + (latestWeight ? latestWeight.weight_kg.toFixed(1) : '--') + ' <span class="unit">kg</span></h2>';
  html += '<div class="sub-row" style="justify-content:center;gap:24px">';
  html += '<span>变化 ' + deltaW + ' kg</span>';
  html += '<span>距目标 ' + remainingW + ' kg</span>';
  if (latestWeight?.bodyfat_pct) html += '<span>体脂 ' + latestWeight.bodyfat_pct.toFixed(1) + '%</span>';
  html += '</div></div>';

  // Stat grid
  html += '<div class="stat-grid">';
  html += '<div class="stat-card"><div class="value">' + todayCal + '</div><div class="label">今日摄入 kcal</div><div class="delta ' + (calGap >= 0 ? 'good' : 'bad') + '">目标 ' + calTarget + '</div></div>';
  html += '<div class="stat-card"><div class="value">' + todayTrainCal + '</div><div class="label">运动消耗 kcal</div><div class="delta good">今日</div></div>';
  html += '<div class="stat-card"><div class="value">' + todayPro.toFixed(0) + '</div><div class="label">蛋白质 g</div><div class="delta ' + (todayPro >= proTarget ? 'good' : 'warn') + '">目标 ' + proTarget + 'g</div></div>';
  html += '<div class="stat-card"><div class="value">' + (calGap > 0 ? '+' + calGap : calGap) + '</div><div class="label">热量缺口 kcal</div><div class="delta ' + (calGap >= 0 ? 'good' : 'bad') + '">' + (calGap >= 0 ? '有缺口' : '超标') + '</div></div>';
  html += '</div>';

  // Body composition card
  if (latestWeight) {
    html += '<div class="card"><h3>体成分概览</h3>';
    html += '<div class="bf-gauge">';
    const gauges = [
      { label: '体脂', val: latestWeight.bodyfat_pct, unit: '%', max: 40, color: '#ff6b6b', good: 15 },
      { label: '肌肉率', val: latestWeight.muscle_rate_pct, unit: '%', max: 100, color: '#0071e3', good: 70 },
      { label: '骨骼肌', val: latestWeight.skeletal_muscle_rate, unit: '%', max: 60, color: '#af52de', good: 40 },
      { label: '水分', val: latestWeight.body_water_rate, unit: '%', max: 80, color: '#5ac8fa', good: 55 },
      { label: '蛋白', val: latestWeight.protein_rate, unit: '%', max: 25, color: '#ff9500', good: 16 },
      { label: '骨量', val: latestWeight.bone_mass_kg, unit: 'kg', max: 5, color: '#34c759', good: 3 }
    ];
    gauges.forEach(g => {
      const v = g.val || 0;
      const pct = Math.min(100, (v / g.max) * 100);
      html += '<div class="bf-item"><div class="bf-val">' + (g.val != null ? v.toFixed(1) : '--') + '</div>';
      html += '<div class="bf-label">' + g.label + ' ' + g.unit + '</div>';
      html += '<div class="bf-bar"><div class="bf-fill" style="width:' + pct + '%;background:' + g.color + '"></div></div></div>';
    });
    html += '</div>';

    // Visceral fat + body age row
    if (latestWeight.visceral_fat_level || latestWeight.body_age) {
      html += '<div class="form-row" style="margin-top:10px;gap:12px">';
      if (latestWeight.visceral_fat_level) {
        const vf = latestWeight.visceral_fat_level;
        const vfLabel = vf <= 4 ? '优秀' : vf <= 9 ? '标准' : vf <= 14 ? '偏高' : '⚠️ 危险';
        const vfColor = vf <= 4 ? '#34c759' : vf <= 9 ? '#0071e3' : vf <= 14 ? '#ff9500' : '#ff3b30';
        html += '<div style="flex:1;background:var(--bg);border-radius:var(--radius-sm);padding:10px;text-align:center">';
        html += '<div style="font-size:20px;font-weight:700">' + vf + '</div>';
        html += '<div style="font-size:10px;color:var(--sub)">内脏脂肪等级</div>';
        html += '<div style="font-size:12px;color:' + vfColor + ';font-weight:600;margin-top:2px">' + vfLabel + '</div></div>';
      }
      if (latestWeight.body_age) {
        html += '<div style="flex:1;background:var(--bg);border-radius:var(--radius-sm);padding:10px;text-align:center">';
        html += '<div style="font-size:20px;font-weight:700">' + latestWeight.body_age + '</div>';
        html += '<div style="font-size:10px;color:var(--sub)">身体年龄</div></div>';
      }
      html += '</div>';
    }
    html += '</div>';
  }

  // Charts
  html += '<div class="card"><h3>体重趋势</h3><div class="chart-wrap"><canvas id="chartWeight"></canvas></div></div>';
  html += '<div class="card"><h3>体成分趋势 (体脂/肌肉率/水分)</h3><div class="chart-wrap tall"><canvas id="chartBodyComp"></canvas></div></div>';
  html += '<div class="card"><h3>热量摄入 vs 目标</h3><div class="chart-wrap tall"><canvas id="chartCalories"></canvas></div></div>';
  html += '<div class="card"><h3>蛋白质追踪</h3><div class="chart-wrap"><canvas id="chartProtein"></canvas></div></div>';

  container.innerHTML = html;

  // Render charts after DOM update
  requestAnimationFrame(() => {
    renderWeightChart(weights, targetW);
    renderBodyCompChart(weights);
    renderCaloriesChart(diets, trainings, calTarget);
    renderProteinChart(diets, proTarget);
  });
}

function renderWeightChart(weights, targetW) {
  destroyChart('chartWeight');
  if (weights.length < 1) return;
  const ctx = document.getElementById('chartWeight');
  if (!ctx) return;

  const labels = weights.map(w => w.date);
  const values = weights.map(w => w.weight_kg);
  const bfValues = weights.filter(w => w.bodyfat_pct).length > 0
    ? weights.map(w => w.bodyfat_pct) : null;

  const datasets = [{
    label: '体重 (kg)',
    data: values,
    borderColor: '#0071e3',
    backgroundColor: 'rgba(0,113,227,0.08)',
    fill: true,
    tension: 0.3,
    pointRadius: 3,
    pointHoverRadius: 6
  }];

  if (bfValues) {
    datasets.push({
      label: '体脂 (%)',
      data: bfValues,
      borderColor: '#ff6b6b',
      backgroundColor: 'transparent',
      tension: 0.3,
      pointRadius: 3,
      yAxisID: 'y1',
      borderDash: [4, 3]
    });
  }

  charts.chartWeight = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12, font: { size: 11 } } },
        annotation: targetW ? {
          annotations: {
            targetLine: {
              type: 'line', yMin: targetW, yMax: targetW,
              borderColor: '#34c759', borderWidth: 1.5, borderDash: [6, 4],
              label: { content: '目标 ' + targetW + 'kg', enabled: true, position: 'end',
                font: { size: 10 }, backgroundColor: 'rgba(52,199,89,0.15)', color: '#34c759' }
            }
          }
        } : {}
      },
      scales: {
        y: { beginAtZero: false, ticks: { callback: v => v + ' kg' } },
        y1: yAxisConfig('体脂 %'),
        x: { ticks: { maxTicksLimit: 10, font: { size: 10 } } }
      }
    }
  });
}

function renderBodyCompChart(weights) {
  destroyChart('chartBodyComp');
  const ctx = document.getElementById('chartBodyComp');
  if (!ctx || weights.length < 1) return;

  // Only include dates with body comp data
  const hasData = weights.filter(w => w.muscle_rate_pct || w.body_water_rate || w.bodyfat_pct);
  if (hasData.length < 1) return;

  const labels = weights.map(w => w.date);
  const datasets = [];

  if (weights.some(w => w.bodyfat_pct)) datasets.push({
    label: '体脂率 (%)', data: weights.map(w => w.bodyfat_pct), borderColor: '#ff6b6b', tension: 0.3, pointRadius: 2, borderWidth: 2
  });
  if (weights.some(w => w.muscle_rate_pct)) datasets.push({
    label: '肌肉率 (%)', data: weights.map(w => w.muscle_rate_pct), borderColor: '#0071e3', tension: 0.3, pointRadius: 2, borderWidth: 2
  });
  if (weights.some(w => w.body_water_rate)) datasets.push({
    label: '水分率 (%)', data: weights.map(w => w.body_water_rate), borderColor: '#5ac8fa', tension: 0.3, pointRadius: 2, borderWidth: 2, borderDash: [4, 3]
  });
  if (weights.some(w => w.protein_rate)) datasets.push({
    label: '蛋白率 (%)', data: weights.map(w => w.protein_rate), borderColor: '#ff9500', tension: 0.3, pointRadius: 2, borderWidth: 2
  });

  if (datasets.length === 0) return;

  charts.chartBodyComp = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 10, font: { size: 10 } } } },
      scales: {
        y: { beginAtZero: false, ticks: { callback: v => v + '%' } },
        x: { ticks: { maxTicksLimit: 10, font: { size: 10 } } }
      }
    }
  });
}

function renderCaloriesChart(diets, trainings, targetCal) {
  destroyChart('chartCalories');
  const ctx = document.getElementById('chartCalories');
  if (!ctx) return;

  const dateMap = {};
  diets.forEach(d => {
    if (d.meal_type === 'summary') return;
    if (!dateMap[d.date]) dateMap[d.date] = { cal: 0, pro: 0, carbs: 0, fat: 0 };
    dateMap[d.date].cal += d.calories || 0;
    dateMap[d.date].pro += d.protein_g || 0;
    dateMap[d.date].carbs += d.carbs_g || 0;
    dateMap[d.date].fat += d.fat_g || 0;
  });

  const trainMap = {};
  trainings.forEach(t => {
    if (!trainMap[t.date]) trainMap[t.date] = 0;
    trainMap[t.date] += t.estimated_calories || 0;
  });

  const dates = Object.keys(dateMap).sort();
  if (dates.length === 0) return;

  charts.chartCalories = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dates,
      datasets: [
        { label: '摄入 (kcal)', data: dates.map(d => dateMap[d].cal), backgroundColor: '#ff6b6b', borderRadius: 6 },
        { label: '运动消耗 (kcal)', data: dates.map(d => trainMap[d] || 0), backgroundColor: '#34c759', borderRadius: 6 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12, font: { size: 11 } } },
        annotation: {
          annotations: {
            targetLine: {
              type: 'line', yMin: targetCal, yMax: targetCal,
              borderColor: '#0071e3', borderWidth: 1.5, borderDash: [6, 4],
              label: { content: '目标' + targetCal, enabled: true, position: 'end',
                font: { size: 10 }, backgroundColor: 'rgba(0,113,227,0.1)', color: '#0071e3' }
            }
          }
        }
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => v + ' kcal' } },
        x: { ticks: { maxTicksLimit: 10, font: { size: 10 } } }
      }
    }
  });
}

function renderProteinChart(diets, proTarget) {
  destroyChart('chartProtein');
  const ctx = document.getElementById('chartProtein');
  if (!ctx) return;

  const dateMap = {};
  diets.forEach(d => {
    if (d.meal_type === 'summary') return;
    if (!dateMap[d.date]) dateMap[d.date] = 0;
    dateMap[d.date] += d.protein_g || 0;
  });

  const dates = Object.keys(dateMap).sort();
  if (dates.length === 0) return;

  charts.chartProtein = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dates,
      datasets: [{
        label: '蛋白质 (g)',
        data: dates.map(d => dateMap[d]),
        backgroundColor: dates.map(d => dateMap[d] >= proTarget ? '#34c759' : '#ff9500'),
        borderRadius: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        annotation: {
          annotations: {
            targetLine: {
              type: 'line', yMin: proTarget, yMax: proTarget,
              borderColor: '#0071e3', borderWidth: 1.5, borderDash: [6, 4],
              label: { content: '目标' + proTarget + 'g', enabled: true, position: 'end',
                font: { size: 10 }, backgroundColor: 'rgba(0,113,227,0.1)', color: '#0071e3' }
            }
          }
        }
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => v + ' g' } },
        x: { ticks: { maxTicksLimit: 10, font: { size: 10 } } }
      }
    }
  });
}

// ============ HISTORY ============
async function loadHistory() {
  const container = document.getElementById('historyList');
  container.innerHTML = '<div class="loading"><div class="spinner"></div>加载中...</div>';

  try {
    const [weights, diets, trainings] = await Promise.all([
      supabase.from('weight_log').select('*').order('date', { ascending: false }).limit(30),
      supabase.from('diet_log').select('*').order('date', { ascending: false }).limit(50),
      supabase.from('training_log').select('*').order('date', { ascending: false }).limit(30)
    ]);

    const entries = [];
    (weights.data || []).forEach(w => entries.push({ ...w, _type: 'weight', _sort: w.date, _label: w.weight_kg + 'kg 体脂' + (w.bodyfat_pct || '?') + '%' }));
    (diets.data || []).forEach(d => entries.push({ ...d, _type: 'diet', _sort: d.date, _label: d.meal_type + ' ' + d.food + ' ' + d.calories + 'kcal' }));
    (trainings.data || []).forEach(t => entries.push({ ...t, _type: 'training', _sort: t.date, _label: t.training_type + ' ' + t.focus_area + ' ' + t.duration_min + 'min' }));

    entries.sort((a, b) => b._sort.localeCompare(a._sort) || (a._type === 'weight' ? -1 : 1));

    if (entries.length === 0) {
      container.innerHTML = '<div class="empty"><p>暂无数据，去记录页录入吧</p></div>';
      return;
    }

    const tagClass = { weight: 'tag-weight', diet: 'tag-diet', training: 'tag-training' };
    const tagText = { weight: '体重', diet: '饮食', training: '训练' };

    container.innerHTML = entries.map(e =>
      '<div class="history-item">' +
        '<div><span class="tag ' + (tagClass[e._type] || '') + '">' + (tagText[e._type] || '') + '</span></div>' +
        '<div class="detail">' + e._label + '</div>' +
        '<div class="date">' + e._sort + '</div>' +
      '</div>'
    ).join('');
  } catch (err) {
    container.innerHTML = '<div class="empty"><p>加载失败</p></div>';
  }
}

// ============ CHART HELPERS ============
function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function yAxisConfig(label) {
  return {
    position: 'right',
    beginAtZero: false,
    grid: { drawOnChartArea: false },
    ticks: { callback: v => v + '%', font: { size: 10 } }
  };
}

// ============ START ============
document.addEventListener('DOMContentLoaded', init);

})();
