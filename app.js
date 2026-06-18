// FatLoss PWA - App Logic v2.0
(function() {
'use strict';

let supabase = null;
const charts = {};
let currentForm = 'weight';
let selectedMeal = 'breakfast';
let selectedTraining = 'boxing_strength';

// ============ AUTH GATE ============
async function sha256(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function checkAuth() {
  if (sessionStorage.getItem('fatloss_auth') === 'true') {
    init();
    return;
  }

  const overlay = document.getElementById('authOverlay');
  overlay.style.display = 'flex';
  const input = document.getElementById('authPassword');
  const error = document.getElementById('authError');
  const btn = document.getElementById('authBtn');

  async function doLogin() {
    const pw = input.value.trim();
    if (!pw) return;
    btn.disabled = true;
    btn.textContent = '验证中...';
    try {
      const hash = await sha256(pw);
      if (hash === AUTH_HASH) {
        sessionStorage.setItem('fatloss_auth', 'true');
        overlay.style.display = 'none';
        init();
      } else {
        error.textContent = '密码错误';
        error.style.display = 'block';
        input.value = '';
        input.focus();
        overlay.querySelector('.auth-card').style.animation = 'none';
        overlay.querySelector('.auth-card').offsetHeight;
        overlay.querySelector('.auth-card').style.animation = 'shake 0.4s ease';
      }
    } catch (err) {
      error.textContent = '验证失败，请重试';
      error.style.display = 'block';
    }
    btn.disabled = false;
    btn.textContent = '解锁';
  }

  btn.addEventListener('click', doLogin);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  setTimeout(() => input.focus(), 200);
}

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
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

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

  document.querySelectorAll('#mealTypeTabs .meal-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#mealTypeTabs .meal-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedMeal = btn.dataset.meal;
    });
  });

  document.querySelectorAll('#trainingTypeTabs .type-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#trainingTypeTabs .type-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedTraining = btn.dataset.type;
    });
  });

  document.querySelectorAll('.quick-meal').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('dCal').value = btn.dataset.cal;
      document.getElementById('dPro').value = btn.dataset.pro;
      document.getElementById('dCarbs').value = btn.dataset.carbs;
      document.getElementById('dFat').value = btn.dataset.fat;
      showToast('已填入 ' + btn.textContent.trim().split(' ')[0], 'success');
    });
  });

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

// ============ DASHBOARD v2.0 (整合 dashboard.py 所有优化) ============
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
  const firstWeight = weights.length ? weights[0] : null;
  const targetW = config.target_weight_kg || 65;
  const targetBf = config.target_bodyfat_pct || 15;
  const calTarget = config.daily_cal_target || 1650;
  const proTarget = config.protein_target_g || 150;
  const fatTarget = config.fat_target_g || 60;
  const carbsTarget = config.carbs_target_g || 125;

  // Today's data
  const today = new Date().toISOString().split('T')[0];
  const todayDiets = diets.filter(d => d.date === today && d.meal_type !== 'summary');
  const todayCal = todayDiets.reduce((s, d) => s + (d.calories || 0), 0);
  const todayPro = todayDiets.reduce((s, d) => s + (d.protein_g || 0), 0);
  const todayCarbs = todayDiets.reduce((s, d) => s + (d.carbs_g || 0), 0);
  const todayFat = todayDiets.reduce((s, d) => s + (d.fat_g || 0), 0);

  // Training data
  const todayTrain = trainings.filter(t => t.date === today);
  const todayTrainCal = todayTrain.reduce((s, t) => s + (t.estimated_calories || 0), 0);

  // ======== 计算统计指标 ========
  const startW = config.start_weight_kg || firstWeight?.weight_kg || latestWeight?.weight_kg || 74;
  const totalLost = latestWeight ? (startW - latestWeight.weight_kg) : 0;
  const remaining = latestWeight ? (latestWeight.weight_kg - targetW) : 0;
  const totalToLose = startW - targetW;
  const progressPct = totalToLose > 0 ? Math.min(100, Math.max(0, Math.round(totalLost / totalToLose * 100))) : 0;

  // Weekly loss rate
  let weekRate = 0;
  if (weights.length >= 2) {
    const firstDate = new Date(weights[0].date);
    const lastDate = new Date(weights[weights.length - 1].date);
    const daysDiff = Math.max(1, (lastDate - firstDate) / (1000 * 60 * 60 * 24));
    weekRate = totalLost / daysDiff * 7;
  }

  // 7-day averages
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const recentDiets = diets.filter(d => d.date >= sevenDaysAgo && d.meal_type !== 'summary');
  const recentCals = recentDiets.length ? recentDiets.reduce((s, d) => s + (d.calories || 0), 0) / 7 : 0;
  const recentPros = recentDiets.length ? recentDiets.reduce((s, d) => s + (d.protein_g || 0), 0) / 7 : 0;

  // Training days
  const trainingDays = new Set(trainings.map(t => t.date)).size;

  // Estimated weeks to goal
  const estWeeks = weekRate > 0 ? remaining / weekRate : 0;

  // Calorie gap
  const calGap = calTarget - todayCal;

  // Status badge
  const statusBadge = document.getElementById('statusBadge');
  if (progressPct > 80) {
    statusBadge.textContent = '冲刺中 ' + progressPct + '%';
    statusBadge.style.background = '#34c759';
  } else if (progressPct > 40) {
    statusBadge.textContent = '进行中 ' + progressPct + '%';
    statusBadge.style.background = '#0071e3';
  } else if (progressPct > 0) {
    statusBadge.textContent = '刚起步 ' + progressPct + '%';
    statusBadge.style.background = '#ff9500';
  }

  let html = '';

  // ======== 1. 体重概览卡片（含进度条）========
  html += '<div class="card" style="text-align:center">';
  html += '<h2>' + (latestWeight ? latestWeight.weight_kg.toFixed(1) : '--') + ' <span class="unit">kg</span></h2>';
  html += '<div class="sub-row" style="justify-content:center;gap:24px;flex-wrap:wrap">';
  html += '<span>已减 <span style="color:#34c759;font-weight:600">' + totalLost.toFixed(1) + '</span> kg</span>';
  html += '<span>距目标 <span style="color:#ff9500;font-weight:600">' + remaining.toFixed(1) + '</span> kg</span>';
  if (latestWeight?.bodyfat_pct) html += '<span>体脂 <span style="color:#0071e3;font-weight:600">' + latestWeight.bodyfat_pct.toFixed(1) + '</span>%</span>';
  html += '</div>';
  // Progress bar
  html += '<div style="margin-top:14px;background:#e9ecef;border-radius:8px;height:10px;overflow:hidden">';
  html += '<div style="height:100%;border-radius:8px;width:' + progressPct + '%;background:linear-gradient(90deg,#34c759,#0071e3);transition:width 0.8s ease"></div>';
  html += '</div>';
  html += '<div style="font-size:12px;color:#6e6e73;margin-top:4px">完成 ' + progressPct + '% | 约 ' + estWeeks.toFixed(0) + ' 周达标</div>';
  html += '</div>';

  // ======== 2. 统计卡片网格（2x4 = 8 张）========
  html += '<div class="stat-grid">';
  // Row 1
  html += '<div class="stat-card"><div class="value">' + (latestWeight ? latestWeight.weight_kg.toFixed(1) : '--') + '</div><div class="label">当前体重 kg</div><div class="delta good">目标 ' + targetW + ' kg</div></div>';
  html += '<div class="stat-card"><div class="value" style="color:#34c759">' + totalLost.toFixed(1) + '</div><div class="label">累计已减 kg</div><div class="delta good">还剩 ' + remaining.toFixed(1) + ' kg</div></div>';
  html += '<div class="stat-card"><div class="value" style="color:#8e44ad">' + progressPct + '</div><div class="label">完成进度 %</div><div class="delta good">记录 ' + weights.length + ' 天</div></div>';
  html += '<div class="stat-card"><div class="value" style="color:#ff9500">' + weekRate.toFixed(2) + '</div><div class="label">周均减重 kg</div><div class="delta ' + (weekRate > 0.8 ? 'warn' : 'good') + '">预计 ' + estWeeks.toFixed(0) + ' 周达标</div></div>';
  // Row 2
  html += '<div class="stat-card"><div class="value">' + todayCal + '</div><div class="label">今日摄入 kcal</div><div class="delta ' + (calGap >= 0 ? 'good' : 'bad') + '">目标 ' + calTarget + '</div></div>';
  html += '<div class="stat-card"><div class="value">' + todayTrainCal + '</div><div class="label">今日消耗 kcal</div><div class="delta ' + (todayTrainCal > 200 ? 'good' : 'warn') + '">训练日 ' + trainingDays + ' 天</div></div>';
  html += '<div class="stat-card"><div class="value" style="color:#ff6b6b">' + recentCals.toFixed(0) + '</div><div class="label">7日均摄入 kcal</div><div class="delta ' + (recentCals <= calTarget ? 'good' : 'bad') + '">目标 ' + calTarget + '</div></div>';
  html += '<div class="stat-card"><div class="value" style="color:#af52de">' + todayPro.toFixed(0) + '</div><div class="label">蛋白质 g</div><div class="delta ' + (todayPro >= proTarget ? 'good' : 'warn') + '">目标 ' + proTarget + 'g</div></div>';
  html += '</div>';

  // ======== 3. 今日宏营养素卡 ========
  if (todayCal > 0) {
    html += '<div class="card"><h3>今日宏营养素</h3>';
    html += '<div style="display:flex;gap:8px;text-align:center;margin-top:8px">';
    const macros = [
      { label: '蛋白质', val: todayPro, target: proTarget, color: '#ff6b6b' },
      { label: '碳水', val: todayCarbs, target: carbsTarget, color: '#ffd93d' },
      { label: '脂肪', val: todayFat, target: fatTarget, color: '#6bcb77' },
      { label: '热量', val: todayCal, target: calTarget, color: '#0071e3' }
    ];
    macros.forEach(m => {
      const pct = m.target > 0 ? Math.min(100, m.val / m.target * 100) : 0;
      html += '<div style="flex:1;background:var(--bg);border-radius:var(--radius-sm);padding:10px 6px">';
      html += '<div style="font-size:16px;font-weight:700;color:' + m.color + '">' + m.val.toFixed(0) + '</div>';
      html += '<div style="font-size:10px;color:var(--sub);margin-top:2px">' + m.label + '</div>';
      html += '<div style="margin-top:4px;background:var(--border);border-radius:3px;height:4px;overflow:hidden">';
      html += '<div style="height:100%;border-radius:3px;width:' + pct + '%;background:' + m.color + '"></div></div>';
      html += '<div style="font-size:9px;color:var(--sub);margin-top:2px">' + pct.toFixed(0) + '%</div>';
      html += '</div>';
    });
    html += '</div></div>';
  }

  // ======== 4. 体成分概览 ========
  if (latestWeight && (latestWeight.bodyfat_pct || latestWeight.muscle_rate_pct)) {
    html += '<div class="card"><h3>体成分概览</h3>';
    html += '<div class="bf-gauge">';
    const gauges = [
      { label: '体脂', val: latestWeight.bodyfat_pct, unit: '%', max: 35, color: '#ff6b6b', good: 15 },
      { label: '肌肉率', val: latestWeight.muscle_rate_pct, unit: '%', max: 90, color: '#0071e3', good: 70 },
      { label: '骨骼肌', val: latestWeight.skeletal_muscle_rate, unit: '%', max: 55, color: '#af52de', good: 40 },
      { label: '水分', val: latestWeight.body_water_rate, unit: '%', max: 70, color: '#5ac8fa', good: 55 },
      { label: '蛋白', val: latestWeight.protein_rate, unit: '%', max: 22, color: '#ff9500', good: 16 },
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

    // 内脏脂肪 + 身体年龄
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

  // ======== 5. 图表区 ========
  // 体重趋势（全宽）
  html += '<div class="card"><h3>体重趋势 & 体脂率</h3><div class="chart-wrap"><canvas id="chartWeight"></canvas></div></div>';
  // 热量 + 蛋白质 （两列）
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">';
  html += '<div class="card"><h3>热量摄入 vs 消耗</h3><div class="chart-wrap"><canvas id="chartCalories"></canvas></div></div>';
  html += '<div class="card"><h3>蛋白质追踪</h3><div class="chart-wrap"><canvas id="chartProtein"></canvas></div></div>';
  html += '</div>';
  // 热量缺口 + 体成分趋势 （两列）
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">';
  html += '<div class="card"><h3>热量缺口 (摄入-消耗)</h3><div class="chart-wrap"><canvas id="chartDeficit"></canvas></div></div>';
  html += '<div class="card"><h3>体成分趋势</h3><div class="chart-wrap"><canvas id="chartBodyComp"></canvas></div></div>';
  html += '</div>';

  // ======== 6. AI 个性建议 ========
  const suggestions = generateSuggestions(weights, diets, trainings, config);
  html += '<div class="card"><h3>AI 个性化建议</h3>';
  suggestions.forEach(s => {
    html += '<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;line-height:1.6">' + s + '</div>';
  });
  html += '</div>';

  // ======== 7. 数据表格 ========
  if (weights.length > 0) {
    html += '<div class="card"><h3>详细记录（最近10条）</h3>';
    html += '<div style="overflow-x:auto"><table style="width:100%;font-size:12px;border-collapse:collapse">';
    html += '<thead><tr style="background:var(--bg)">';
    html += '<th style="padding:8px 6px;text-align:left;font-weight:600;color:var(--sub)">日期</th>';
    html += '<th style="padding:8px 6px;text-align:right;font-weight:600;color:var(--sub)">体重</th>';
    html += '<th style="padding:8px 6px;text-align:right;font-weight:600;color:var(--sub)">体脂</th>';
    html += '<th style="padding:8px 6px;text-align:right;font-weight:600;color:var(--sub)">摄入</th>';
    html += '<th style="padding:8px 6px;text-align:right;font-weight:600;color:var(--sub)">消耗</th>';
    html += '<th style="padding:8px 6px;text-align:right;font-weight:600;color:var(--sub)">蛋白质</th>';
    html += '<th style="padding:8px 6px;text-align:left;font-weight:600;color:var(--sub)">训练</th>';
    html += '</tr></thead><tbody>';

    // Build daily summary map
    const dailyDiet = {};
    diets.forEach(d => {
      if (d.meal_type === 'summary') return;
      if (!dailyDiet[d.date]) dailyDiet[d.date] = { cal: 0, pro: 0 };
      dailyDiet[d.date].cal += d.calories || 0;
      dailyDiet[d.date].pro += d.protein_g || 0;
    });
    const dailyTrain = {};
    trainings.forEach(t => {
      if (!dailyTrain[t.date]) dailyTrain[t.date] = { cal: 0, types: [] };
      dailyTrain[t.date].cal += t.estimated_calories || 0;
      const typeLabel = { boxing: '打拳', strength: '力量', boxing_strength: '拳+力', strength_cardio: '力+有氧', cardio: '有氧', rest: '休息', apple_watch: 'Watch' };
      dailyTrain[t.date].types.push(typeLabel[t.training_type] || t.training_type);
    });

    const recent = weights.slice(-10).reverse();
    recent.forEach(w => {
      const d = dailyDiet[w.date] || { cal: 0, pro: 0 };
      const t = dailyTrain[w.date] || { cal: 0, types: [] };
      html += '<tr style="border-bottom:1px solid var(--border)">';
      html += '<td style="padding:6px;font-weight:500">' + w.date + '</td>';
      html += '<td style="padding:6px;text-align:right;font-weight:600">' + w.weight_kg + '</td>';
      html += '<td style="padding:6px;text-align:right">' + (w.bodyfat_pct ? w.bodyfat_pct.toFixed(1) + '%' : '--') + '</td>';
      html += '<td style="padding:6px;text-align:right">' + (d.cal > 0 ? d.cal : '--') + '</td>';
      html += '<td style="padding:6px;text-align:right">' + (t.cal > 0 ? t.cal : '--') + '</td>';
      html += '<td style="padding:6px;text-align:right">' + (d.pro > 0 ? d.pro.toFixed(0) + 'g' : '--') + '</td>';
      html += '<td style="padding:6px">' + (t.types.length ? t.types.join('·') : '休息') + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div></div>';
  }

  // ======== 8. 起点 → 当前 → 目标时间线 ========
  html += '<div class="card" style="text-align:center">';
  html += '<div style="display:flex;align-items:center;justify-content:center;gap:20px;flex-wrap:wrap;padding:10px 0">';
  html += '<div style="text-align:center">';
  html += '<div style="font-size:11px;color:var(--sub);margin-bottom:2px">起点</div>';
  html += '<div style="font-size:20px;font-weight:700">' + startW.toFixed(1) + '<span style="font-size:13px">kg</span></div>';
  html += '<div style="font-size:10px;color:var(--sub)">' + (firstWeight?.date || '--') + '</div>';
  html += '</div>';
  html += '<div style="font-size:28px;opacity:.2;color:var(--green)">→</div>';
  html += '<div style="text-align:center">';
  html += '<div style="font-size:11px;color:var(--sub);margin-bottom:2px">当前</div>';
  html += '<div style="font-size:26px;font-weight:700;color:#0071e3">' + (latestWeight ? latestWeight.weight_kg.toFixed(1) : '--') + '<span style="font-size:15px">kg</span></div>';
  html += '<div style="font-size:11px;color:#34c759">-' + totalLost.toFixed(1) + 'kg</div>';
  html += '</div>';
  html += '<div style="font-size:28px;opacity:.2;color:var(--green)">→</div>';
  html += '<div style="text-align:center;border:2px dashed #34c759;border-radius:var(--radius);padding:12px 20px">';
  html += '<div style="font-size:11px;color:#34c759;margin-bottom:2px">目标</div>';
  html += '<div style="font-size:26px;font-weight:700;color:#34c759">' + targetW.toFixed(1) + '<span style="font-size:15px">kg</span></div>';
  html += '<div style="font-size:10px;color:var(--sub)">约 ' + estWeeks.toFixed(0) + ' 周后</div>';
  html += '</div>';
  html += '</div></div>';

  container.innerHTML = html;

  // Render charts
  requestAnimationFrame(() => {
    renderWeightChart(weights, targetW);
    renderCaloriesChart(diets, trainings, calTarget);
    renderProteinChart(diets, proTarget);
    renderDeficitChart(diets, trainings);
    renderBodyCompChart(weights);
  });
}

// ============ AI SUGGESTIONS ============
function generateSuggestions(weights, diets, trainings, config) {
  const s = [];
  if (!weights.length) return ['暂无数据，请先录入体重。'];

  const latest = weights[weights.length - 1];
  const first = weights[0];
  const targetW = config.target_weight_kg || 65;
  const remaining = latest.weight_kg - targetW;

  // 进度
  if (weights.length >= 2) {
    const totalLost = first.weight_kg - latest.weight_kg;
    const daysDiff = Math.max(1, (new Date(latest.date) - new Date(first.date)) / (1000 * 60 * 60 * 24));
    const rate = totalLost / daysDiff * 7;

    if (daysDiff >= 7) {
      if (rate > 1.0) {
        s.push('⚡ 当前周减重速度 ' + rate.toFixed(1) + 'kg，偏快，注意保肌。建议蛋白质不低于 ' + (config.protein_target_g || 150) + 'g/天。');
      } else if (rate < 0.3) {
        s.push('🐢 当前周减重速度 ' + rate.toFixed(1) + 'kg，偏慢。检查是否有额外摄入，或考虑进餐时间窗口调整。');
      } else {
        s.push('✅ 减重节奏合理，周均 ' + rate.toFixed(1) + 'kg。继续坚持当前方案。');
      }
    }
  }

  // 剩余目标
  const estWeeks = remaining / 0.7;
  s.push('🎯 距目标还差 ' + remaining.toFixed(1) + 'kg，按标准速度预计 ' + Math.round(estWeeks) + ' 周（约 ' + (estWeeks / 4.3).toFixed(1) + ' 个月）达标。');

  // 饮食建议（7日均值）
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const recent = diets.filter(d => d.date >= sevenDaysAgo && d.meal_type !== 'summary');
  if (recent.length > 5) {
    const avgCal = recent.reduce((sum, d) => sum + (d.calories || 0), 0) / 7;
    const avgPro = recent.reduce((sum, d) => sum + (d.protein_g || 0), 0) / 7;
    const calTarget = config.daily_cal_target || 1650;
    const proTarget = config.protein_target_g || 150;

    if (avgCal > calTarget + 150) {
      s.push('⚠️ 近7日平均摄入 ' + avgCal.toFixed(0) + ' kcal，超出目标。建议控制晚餐碳水和油脂摄入。');
    } else if (avgCal < calTarget - 200) {
      s.push('💡 近7日平均摄入 ' + avgCal.toFixed(0) + ' kcal，偏低。若训练强度不变可适当增加碳水保证训练质量。');
    }

    if (avgPro < proTarget * 0.85) {
      s.push('🥩 近7日蛋白质平均 ' + avgPro.toFixed(0) + 'g（目标 ' + proTarget + 'g），需增加。建议每餐保证一掌大小瘦肉，训练后30分钟内补充蛋白。');
    }
  }

  // 训练建议
  const trainingDays = new Set(trainings.map(t => t.date)).size;
  const totalDays = weights.length;
  if (totalDays > 0 && trainingDays / totalDays < 0.4) {
    s.push('🏃 训练频率偏低（' + trainingDays + '/' + totalDays + '天），建议保持每周至少4天运动。');
  }

  s.push('🏋️ 训练日蛋白质保证150g+，训练前后补充碳水（香蕉/燕麦/米饭）。打拳日可适当增加碳水。');

  if (remaining < 5 && remaining > 0) {
    s.push('🔥 已进入减脂冲刺阶段！最后5kg最难减，坚持住。如有平台期考虑调整训练结构或周碳水循环。');
  }

  return s;
}

// ============ CHARTS ============
function renderWeightChart(weights, targetW) {
  destroyChart('chartWeight');
  const ctx = document.getElementById('chartWeight');
  if (!ctx || weights.length < 1) return;

  const labels = weights.map(w => w.date);
  const values = weights.map(w => w.weight_kg);
  const bfValues = weights.filter(w => w.bodyfat_pct != null).length > 1
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
      label: '体脂率 (%)',
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
        y1: { position: 'right', beginAtZero: false, grid: { drawOnChartArea: false }, ticks: { callback: v => v + '%', font: { size: 10 } } },
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
    if (!dateMap[d.date]) dateMap[d.date] = 0;
    dateMap[d.date] += d.calories || 0;
  });

  const trainMap = {};
  trainings.forEach(t => {
    if (!trainMap[t.date]) trainMap[t.date] = 0;
    trainMap[t.date] += t.estimated_calories || 0;
  });

  const dates = Object.keys({...dateMap, ...trainMap}).sort();
  if (dates.length === 0) return;

  charts.chartCalories = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dates,
      datasets: [
        { label: '摄入 (kcal)', data: dates.map(d => dateMap[d] || 0), backgroundColor: '#ff6b6b', borderRadius: 6 },
        { label: '运动消耗 (kcal)', data: dates.map(d => trainMap[d] || 0), backgroundColor: '#34c759', borderRadius: 6 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12, font: { size: 10 } } },
        annotation: {
          annotations: {
            targetLine: {
              type: 'line', yMin: targetCal, yMax: targetCal,
              borderColor: '#0071e3', borderWidth: 1.5, borderDash: [6, 4],
              label: { content: '目标 ' + targetCal, enabled: true, position: 'end',
                font: { size: 9 }, backgroundColor: 'rgba(0,113,227,0.1)', color: '#0071e3' }
            }
          }
        }
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => v + ' kcal' } },
        x: { ticks: { maxTicksLimit: 10, font: { size: 9 } } }
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
              label: { content: '目标 ' + proTarget + 'g', enabled: true, position: 'end',
                font: { size: 9 }, backgroundColor: 'rgba(0,113,227,0.1)', color: '#0071e3' }
            }
          }
        }
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => v + ' g' } },
        x: { ticks: { maxTicksLimit: 10, font: { size: 9 } } }
      }
    }
  });
}

// ============ NEW: 热量缺口图 ============
function renderDeficitChart(diets, trainings) {
  destroyChart('chartDeficit');
  const ctx = document.getElementById('chartDeficit');
  if (!ctx) return;

  const dateMap = {};
  diets.forEach(d => {
    if (d.meal_type === 'summary') return;
    if (!dateMap[d.date]) dateMap[d.date] = { cal: 0, train: 0 };
    dateMap[d.date].cal += d.calories || 0;
  });
  trainings.forEach(t => {
    if (!dateMap[t.date]) dateMap[t.date] = { cal: 0, train: 0 };
    dateMap[t.date].train += t.estimated_calories || 0;
  });

  const dates = Object.keys(dateMap).sort();
  if (dates.length === 0) return;

  const netData = dates.map(d => dateMap[d].cal - dateMap[d].train);
  const bgColors = netData.map(v => v > 0 ? 'rgba(231,76,60,0.6)' : 'rgba(39,174,96,0.6)');
  const bColors = netData.map(v => v > 0 ? '#e74c3c' : '#27ae60');

  charts.chartDeficit = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dates,
      datasets: [{
        label: '热量缺口 (正=盈余, 负=缺口)',
        data: netData,
        backgroundColor: bgColors,
        borderColor: bColors,
        borderWidth: 1,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ctx.raw + ' kcal' } }
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => v + ' kcal' } },
        x: { ticks: { maxTicksLimit: 10, font: { size: 9 } } }
      }
    }
  });
}

function renderBodyCompChart(weights) {
  destroyChart('chartBodyComp');
  const ctx = document.getElementById('chartBodyComp');
  if (!ctx || weights.length < 1) return;

  const labels = weights.map(w => w.date);
  const datasets = [];

  if (weights.some(w => w.bodyfat_pct != null)) datasets.push({
    label: '体脂率 (%)', data: weights.map(w => w.bodyfat_pct), borderColor: '#ff6b6b', tension: 0.3, pointRadius: 2, borderWidth: 2
  });
  if (weights.some(w => w.muscle_rate_pct != null)) datasets.push({
    label: '肌肉率 (%)', data: weights.map(w => w.muscle_rate_pct), borderColor: '#0071e3', tension: 0.3, pointRadius: 2, borderWidth: 2
  });
  if (weights.some(w => w.body_water_rate != null)) datasets.push({
    label: '水分率 (%)', data: weights.map(w => w.body_water_rate), borderColor: '#5ac8fa', tension: 0.3, pointRadius: 2, borderWidth: 2, borderDash: [4, 3]
  });
  if (weights.some(w => w.protein_rate != null)) datasets.push({
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

// ============ START ============
document.addEventListener('DOMContentLoaded', checkAuth);

})();
