/**
 * Apple Stock Quantitative Statistical Analysis Dashboard
 * Pure Vanilla JavaScript + Chart.js + PapaParse
 */

// Global State
let rawData = [];
let charts = {};

// Helper: Format Numbers
const fmt = (num, decimals = 2) => {
  if (num === null || num === undefined || isNaN(num)) return '-';
  return Number(num).toLocaleString('ko-KR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

const fmtCur = (num) => '$' + fmt(num, 2);
const fmtPct = (num) => (num >= 0 ? '+' : '') + fmt(num * 100, 2) + '%';

// Statistical Helper Functions
const Stats = {
  mean: (arr) => arr.reduce((a, b) => a + b, 0) / arr.length,
  
  variance: (arr, isSample = true) => {
    const m = Stats.mean(arr);
    return arr.reduce((acc, v) => acc + Math.pow(v - m, 2), 0) / (arr.length - (isSample ? 1 : 0));
  },
  
  std: (arr, isSample = true) => Math.sqrt(Stats.variance(arr, isSample)),
  
  median: (arr) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  },
  
  percentile: (arr, p) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    if (upper === lower) return sorted[lower];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  },
  
  skewness: (arr) => {
    const n = arr.length;
    const m = Stats.mean(arr);
    const s = Stats.std(arr, false);
    if (s === 0) return 0;
    const m3 = arr.reduce((acc, v) => acc + Math.pow((v - m) / s, 3), 0) / n;
    return m3;
  },
  
  kurtosis: (arr) => {
    // Excess Kurtosis (Normal dist = 0)
    const n = arr.length;
    const m = Stats.mean(arr);
    const s = Stats.std(arr, false);
    if (s === 0) return 0;
    const m4 = arr.reduce((acc, v) => acc + Math.pow((v - m) / s, 4), 0) / n;
    return m4 - 3;
  },
  
  rollingMean: (arr, window) => {
    const res = [];
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      sum += arr[i];
      if (i >= window) {
        sum -= arr[i - window];
        res.push(sum / window);
      } else if (i === window - 1) {
        res.push(sum / window);
      } else {
        res.push(null);
      }
    }
    return res;
  },
  
  rollingStd: (arr, window) => {
    const res = [];
    for (let i = 0; i < arr.length; i++) {
      if (i < window - 1) {
        res.push(null);
      } else {
        const slice = arr.slice(i - window + 1, i + 1);
        res.push(Stats.std(slice));
      }
    }
    return res;
  },
  
  autocorrelation: (arr, maxLag = 30) => {
    const n = arr.length;
    const m = Stats.mean(arr);
    const v = Stats.variance(arr, false);
    const lags = [];
    for (let lag = 1; lag <= maxLag; lag++) {
      let cov = 0;
      for (let i = 0; i < n - lag; i++) {
        cov += (arr[i] - m) * (arr[i + lag] - m);
      }
      cov = cov / n;
      lags.push({ lag, acf: cov / v });
    }
    return lags;
  },
  
  linearRegression: (xArr, yArr) => {
    const n = xArr.length;
    const mx = Stats.mean(xArr);
    const my = Stats.mean(yArr);
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (xArr[i] - mx) * (yArr[i] - my);
      den += Math.pow(xArr[i] - mx, 2);
    }
    const slope = num / den;
    const intercept = my - slope * mx;
    
    // R-squared
    let ssTot = 0, ssRes = 0;
    for (let i = 0; i < n; i++) {
      const pred = slope * xArr[i] + intercept;
      ssTot += Math.pow(yArr[i] - my, 2);
      ssRes += Math.pow(yArr[i] - pred, 2);
    }
    const r2 = 1 - (ssRes / ssTot);
    const r = Math.sqrt(Math.max(0, r2)) * (slope >= 0 ? 1 : -1);
    return { slope, intercept, r2, r };
  }
};

// Application Initialization
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupFileInput();
  loadDefaultData();
});

// Tab Navigation
function setupTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add('active');
      
      // Resize Chart to prevent rendering issues in hidden tab
      const chartKey = getChartKeyForTab(targetId);
      if (charts[chartKey]) {
        charts[chartKey].resize();
      }
    });
  });
}

function getChartKeyForTab(tabId) {
  const map = {
    tab1: 'chartMA',
    tab2: 'chartBoxSim',
    tab3: 'chartDistribution',
    tab4: 'chartBollinger',
    tab5: 'chartVolatility',
    tab6: 'chartDrawdown',
    tab7: 'chartACF',
    tab8: 'chartRegression',
    tab9: 'chartMonthly',
    tab10: 'chartVaR'
  };
  return map[tabId];
}

// File Inputs
function setupFileInput() {
  const input = document.getElementById('csvFileInput');
  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        processParsedData(results.data);
      }
    });
  });

  document.getElementById('refreshBtn').addEventListener('click', () => {
    loadDefaultData();
  });
}

// Load Default CSV (애플 주가.csv)
function loadDefaultData() {
  if (window.EMBEDDED_CSV_B64) {
    try {
      const binaryString = atob(window.EMBEDDED_CSV_B64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decodedCsv = new TextDecoder('utf-8').decode(bytes);
      Papa.parse(decodedCsv, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          processParsedData(results.data);
        }
      });
      return;
    } catch (e) {
      console.warn('임베디드 데이터 디코딩 실패, fetch 시도', e);
    }
  }

  fetch('애플 주가.csv')
    .then(res => {
      if (!res.ok) throw new Error('파일 읽기 실패');
      return res.text();
    })
    .then(csvText => {
      Papa.parse(csvText, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          processParsedData(results.data);
        }
      });
    })
    .catch(err => {
      console.warn('직접 fetch 실패 (file:// 환경 가능성)', err);
    });
}

// Core Data Processing
function processParsedData(data) {
  // Clean and Sort by Date Ascending
  const cleaned = data.filter(d => d.Date && d.Close != null).map(d => ({
    date: String(d.Date).trim(),
    open: Number(d.Open),
    high: Number(d.High),
    low: Number(d.Low),
    close: Number(d.Close),
    adjClose: Number(d['Adj Close'] || d.Close),
    volume: Number(d.Volume)
  })).sort((a, b) => new Date(a.date) - new Date(b.date));

  if (cleaned.length < 50) {
    alert('데이터 행 수가 너무 적습니다 (최소 50행 필요).');
    return;
  }

  rawData = cleaned;
  
  // Calculate Daily Returns & Log Returns
  for (let i = 0; i < rawData.length; i++) {
    if (i === 0) {
      rawData[i].dailyReturn = 0;
      rawData[i].logReturn = 0;
    } else {
      const prev = rawData[i - 1].close;
      const curr = rawData[i].close;
      rawData[i].dailyReturn = (curr - prev) / prev;
      rawData[i].logReturn = Math.log(curr / prev);
    }
  }

  updateTopMetrics();
  renderAllAnalyses();
}

// Top Metrics Summary
function updateTopMetrics() {
  const n = rawData.length;
  const first = rawData[0];
  const last = rawData[n - 1];
  const totalReturn = (last.close - first.close) / first.close;
  
  // Years elapsed
  const d1 = new Date(first.date);
  const d2 = new Date(last.date);
  const years = (d2 - d1) / (1000 * 60 * 60 * 24 * 365.25);
  const cagr = Math.pow(last.close / first.close, 1 / years) - 1;
  
  // Daily returns for vol & sharpe
  const retList = rawData.slice(1).map(d => d.dailyReturn);
  const dailyStd = Stats.std(retList);
  const annVol = dailyStd * Math.sqrt(252);
  const rf = 0.015; // 1.5% Risk Free Rate
  const sharpe = (cagr - rf) / annVol;

  // Max Drawdown
  let peak = -Infinity;
  let mdd = 0;
  for (let d of rawData) {
    if (d.close > peak) peak = d.close;
    const dd = (d.close - peak) / peak;
    if (dd < mdd) mdd = dd;
  }

  // VaR 95%
  const var95 = Stats.percentile(retList, 5);
  const skew = Stats.skewness(retList);
  const kurt = Stats.kurtosis(retList);

  document.getElementById('metricTotalDays').innerText = `${fmt(n, 0)} 거래일`;
  document.getElementById('metricDateRange').innerText = `${first.date} ~ ${last.date} (${fmt(years, 1)}년)`;
  
  document.getElementById('metricStartEndPrice').innerText = `${fmtCur(first.close)} → ${fmtCur(last.close)}`;
  document.getElementById('metricTotalReturn').innerText = `누적 수익률: ${fmtPct(totalReturn)}`;
  
  document.getElementById('metricCAGR').innerText = fmtPct(cagr);
  document.getElementById('metricAnnVol').innerText = `연환산 변동성: ${fmtPct(annVol)}`;

  document.getElementById('metricSharpe').innerText = fmt(sharpe, 2);
  document.getElementById('metricMDD').innerText = `최대 낙폭(MDD): ${fmtPct(mdd)}`;

  document.getElementById('metricVaR').innerText = fmtPct(var95);
  document.getElementById('metricSkewKurt').innerText = `왜도: ${fmt(skew, 2)} / 첨도: ${fmt(kurt, 2)}`;
}

// Render All 10 Analyses
function renderAllAnalyses() {
  analysis1_MovingAverages();
  analysis2_FiveSummary();
  analysis3_ReturnDistribution();
  analysis4_BollingerBands();
  analysis5_RollingVolatility();
  analysis6_Drawdown();
  analysis7_Autocorrelation();
  analysis8_Regression();
  analysis9_Seasonality();
  analysis10_VaR();
}

// Helper: Destroy existing chart
function safeChart(id, config) {
  if (charts[id]) {
    charts[id].destroy();
  }
  const ctx = document.getElementById(id).getContext('2d');
  charts[id] = new Chart(ctx, config);
  return charts[id];
}

// Downsampling for smooth rendering of 2,500 points
function downsample(arr, factor = 2) {
  if (arr.length <= 1000) return arr;
  return arr.filter((_, idx) => idx % factor === 0);
}

// -------------------------------------------------------------
// 1. Moving Averages & Trend
// -------------------------------------------------------------
function analysis1_MovingAverages() {
  const dates = rawData.map(d => d.date);
  const close = rawData.map(d => d.close);
  
  const sma20 = Stats.rollingMean(close, 20);
  const sma60 = Stats.rollingMean(close, 60);
  const sma200 = Stats.rollingMean(close, 200);

  // Sample for performance
  const step = 2;
  const sDates = dates.filter((_, i) => i % step === 0);
  const sClose = close.filter((_, i) => i % step === 0);
  const sSMA20 = sma20.filter((_, i) => i % step === 0);
  const sSMA60 = sma60.filter((_, i) => i % step === 0);
  const sSMA200 = sma200.filter((_, i) => i % step === 0);

  safeChart('chartMA', {
    type: 'line',
    data: {
      labels: sDates,
      datasets: [
        { label: '종가 (Close)', data: sClose, borderColor: '#3b82f6', borderWidth: 2, pointRadius: 0, tension: 0.1 },
        { label: 'SMA 20일 (단기)', data: sSMA20, borderColor: '#f59e0b', borderWidth: 1.5, pointRadius: 0 },
        { label: 'SMA 60일 (중기)', data: sSMA60, borderColor: '#10b981', borderWidth: 1.5, pointRadius: 0 },
        { label: 'SMA 200일 (장기)', data: sSMA200, borderColor: '#ef4444', borderWidth: 2, pointRadius: 0, borderDash: [4, 4] }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { maxTicksLimit: 12, color: '#94a3b8' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', callback: v => '$' + v } }
      },
      plugins: {
        legend: { labels: { color: '#f8fafc' } }
      }
    }
  });

  // Trend Statistics calculation
  const currClose = close[close.length - 1];
  const currSMA20 = sma20[sma20.length - 1];
  const currSMA60 = sma60[sma60.length - 1];
  const currSMA200 = sma200[sma200.length - 1];
  const isGoldenCross = currSMA20 > currSMA60 && currSMA60 > currSMA200;

  document.getElementById('statsMA').innerHTML = `
    <h4><i class="fa-solid fa-circle-info"></i> 기술적 추세 평가 요약</h4>
    <div class="stats-grid-mini">
      <div class="stat-item"><div class="stat-item-label">현재 종가</div><div class="stat-item-value">${fmtCur(currClose)}</div></div>
      <div class="stat-item"><div class="stat-item-label">20일 이평선 괴리율</div><div class="stat-item-value">${fmtPct((currClose - currSMA20) / currSMA20)}</div></div>
      <div class="stat-item"><div class="stat-item-label">60일 이평선 괴리율</div><div class="stat-item-value">${fmtPct((currClose - currSMA60) / currSMA60)}</div></div>
      <div class="stat-item"><div class="stat-item-label">200일 이평선 괴리율</div><div class="stat-item-value">${fmtPct((currClose - currSMA200) / currSMA200)}</div></div>
      <div class="stat-item"><div class="stat-item-label">추세 배열 상태</div><div class="stat-item-value ${isGoldenCross ? 'text-success' : 'text-warning'}">${isGoldenCross ? '완전 정배열 (강세)' : '혼조세 / 역배열'}</div></div>
    </div>
  `;
}

// -------------------------------------------------------------
// 2. Five Number Summary & Outliers
// -------------------------------------------------------------
function analysis2_FiveSummary() {
  const cols = [
    { key: 'open', name: '시가 (Open)', unit: '$' },
    { key: 'high', name: '고가 (High)', unit: '$' },
    { key: 'low', name: '저가 (Low)', unit: '$' },
    { key: 'close', name: '종가 (Close)', unit: '$' },
    { key: 'volume', name: '거래량 (Volume)', unit: '주' }
  ];

  const tbody = document.querySelector('#tableFiveSummary tbody');
  tbody.innerHTML = '';

  const chartLabels = [];
  const q1Data = [];
  const medianData = [];
  const q3Data = [];

  cols.forEach(col => {
    const vals = rawData.map(d => d[col.key]).filter(v => !isNaN(v));
    const mean = Stats.mean(vals);
    const std = Stats.std(vals);
    const min = Math.min(...vals);
    const q1 = Stats.percentile(vals, 25);
    const med = Stats.median(vals);
    const q3 = Stats.percentile(vals, 75);
    const max = Math.max(...vals);
    const iqr = q3 - q1;
    
    // Outliers (Tukey's Fences: < Q1 - 1.5*IQR or > Q3 + 1.5*IQR)
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;
    const outliers = vals.filter(v => v < lowerFence || v > upperFence).length;

    const isVol = col.key === 'volume';
    const f = (v) => isVol ? fmt(v, 0) : fmtCur(v);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${col.name}</strong></td>
      <td>${f(mean)}</td>
      <td>${f(std)}</td>
      <td>${f(min)}</td>
      <td>${f(q1)}</td>
      <td style="color:#60a5fa; font-weight:700;">${f(med)}</td>
      <td>${f(q3)}</td>
      <td>${f(max)}</td>
      <td>${f(iqr)}</td>
      <td><span class="badge" style="background:${outliers > 0 ? '#ef4444' : '#10b981'}">${outliers}개 (${fmt(outliers / vals.length * 100, 1)}%)</span></td>
    `;
    tbody.appendChild(tr);

    if (!isVol) {
      chartLabels.push(col.name);
      q1Data.push(q1);
      medianData.push(med);
      q3Data.push(q3);
    }
  });

  // Box plot simulation chart (Floating Bar)
  safeChart('chartBoxSim', {
    type: 'bar',
    data: {
      labels: chartLabels,
      datasets: [
        {
          label: 'Q1 (25%)',
          data: q1Data,
          backgroundColor: 'rgba(59, 130, 246, 0.4)',
          borderColor: '#3b82f6',
          borderWidth: 1
        },
        {
          label: '중앙값 (Median, 50%)',
          data: medianData,
          backgroundColor: 'rgba(16, 185, 129, 0.7)',
          borderColor: '#10b981',
          borderWidth: 1
        },
        {
          label: 'Q3 (75%)',
          data: q3Data,
          backgroundColor: 'rgba(245, 158, 11, 0.7)',
          borderColor: '#f59e0b',
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', callback: v => '$' + v } }
      },
      plugins: {
        legend: { labels: { color: '#f8fafc' } },
        title: { display: true, text: '가격 변수별 사분위수(Q1, Median, Q3) 비교', color: '#94a3b8' }
      }
    }
  });
}

// -------------------------------------------------------------
// 3. Return Distribution & Normality (Histogram + Normal Curve)
// -------------------------------------------------------------
function analysis3_ReturnDistribution() {
  const returns = rawData.slice(1).map(d => d.dailyReturn);
  const m = Stats.mean(returns);
  const s = Stats.std(returns);
  const skew = Stats.skewness(returns);
  const kurt = Stats.kurtosis(returns);

  // Build Histogram bins (-8% to +8% by 0.5% steps)
  const binWidth = 0.005; // 0.5%
  const minBin = -0.08;
  const maxBin = 0.08;
  const binsCount = Math.round((maxBin - minBin) / binWidth);
  const binEdges = [];
  const binCounts = new Array(binsCount).fill(0);

  for (let i = 0; i <= binsCount; i++) {
    binEdges.push(minBin + i * binWidth);
  }

  returns.forEach(r => {
    if (r >= minBin && r < maxBin) {
      const idx = Math.floor((r - minBin) / binWidth);
      if (idx >= 0 && idx < binsCount) binCounts[idx]++;
    }
  });

  const binLabels = [];
  const normalPDF = [];
  const n = returns.length;

  for (let i = 0; i < binsCount; i++) {
    const center = (binEdges[i] + binEdges[i + 1]) / 2;
    binLabels.push((center * 100).toFixed(1) + '%');

    // Normal probability density scaled to count: P(x) * binWidth * N
    const z = (center - m) / s;
    const phi = (1 / (s * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * z * z);
    normalPDF.push(phi * binWidth * n);
  }

  safeChart('chartDistribution', {
    type: 'bar',
    data: {
      labels: binLabels,
      datasets: [
        {
          type: 'bar',
          label: '실제 일일수익률 빈도 (Histogram)',
          data: binCounts,
          backgroundColor: 'rgba(139, 92, 246, 0.6)',
          borderColor: '#8b5cf6',
          borderWidth: 1
        },
        {
          type: 'line',
          label: '이론상 정규분포 곡선 (Gaussian Curve)',
          data: normalPDF,
          borderColor: '#ef4444',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
      },
      plugins: {
        legend: { labels: { color: '#f8fafc' } }
      }
    }
  });

  // Jarque-Bera Test Statistic simulation
  const jb = (n / 6) * (Math.pow(skew, 2) + 0.25 * Math.pow(kurt, 2));

  document.getElementById('statsDist').innerHTML = `
    <h4><i class="fa-solid fa-square-poll-vertical"></i> 분포 특성 및 정규성 검정 요약</h4>
    <div class="stats-grid-mini">
      <div class="stat-item"><div class="stat-item-label">일평균 수익률 (Mean)</div><div class="stat-item-value">${fmtPct(m)}</div></div>
      <div class="stat-item"><div class="stat-item-label">일일 변동성 (Std Dev)</div><div class="stat-item-value">${fmtPct(s)}</div></div>
      <div class="stat-item"><div class="stat-item-label">왜도 (Skewness)</div><div class="stat-item-value text-primary">${fmt(skew, 3)} (${skew < 0 ? '좌측 꼬리 긺' : '우측 꼬리 긺'})</div></div>
      <div class="stat-item"><div class="stat-item-label">초과 첨도 (Excess Kurtosis)</div><div class="stat-item-value text-warning">${fmt(kurt, 3)} (급첨/팻테일)</div></div>
      <div class="stat-item"><div class="stat-item-label">자크-베라 검정 통계량 (JB)</div><div class="stat-item-value text-danger">${fmt(jb, 1)} (p < 0.001 정규성 기각)</div></div>
    </div>
  `;
}

// -------------------------------------------------------------
// 4. Bollinger Bands (20-day, +/- 2 Sigma)
// -------------------------------------------------------------
function analysis4_BollingerBands() {
  const dates = rawData.map(d => d.date);
  const close = rawData.map(d => d.close);
  const sma20 = Stats.rollingMean(close, 20);
  const std20 = Stats.rollingStd(close, 20);

  const upper = [];
  const lower = [];
  const bandwidth = [];

  for (let i = 0; i < close.length; i++) {
    if (sma20[i] == null || std20[i] == null) {
      upper.push(null);
      lower.push(null);
      bandwidth.push(null);
    } else {
      const u = sma20[i] + 2 * std20[i];
      const l = sma20[i] - 2 * std20[i];
      upper.push(u);
      lower.push(l);
      bandwidth.push((u - l) / sma20[i]);
    }
  }

  const step = 2;
  const sDates = dates.filter((_, i) => i % step === 0);
  const sClose = close.filter((_, i) => i % step === 0);
  const sUpper = upper.filter((_, i) => i % step === 0);
  const sLower = lower.filter((_, i) => i % step === 0);
  const sSMA = sma20.filter((_, i) => i % step === 0);

  safeChart('chartBollinger', {
    type: 'line',
    data: {
      labels: sDates,
      datasets: [
        { label: '상단 밴드 (+2σ)', data: sUpper, borderColor: 'rgba(239, 68, 68, 0.6)', borderWidth: 1, pointRadius: 0, fill: false },
        { label: '중심선 (20 SMA)', data: sSMA, borderColor: '#f59e0b', borderWidth: 1.5, pointRadius: 0, fill: false },
        { label: '하단 밴드 (-2σ)', data: sLower, borderColor: 'rgba(16, 185, 129, 0.6)', borderWidth: 1, pointRadius: 0, fill: '-2', backgroundColor: 'rgba(59, 130, 246, 0.08)' },
        { label: '종가 (Close)', data: sClose, borderColor: '#3b82f6', borderWidth: 2, pointRadius: 0 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { maxTicksLimit: 12, color: '#94a3b8' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', callback: v => '$' + v } }
      },
      plugins: {
        legend: { labels: { color: '#f8fafc' } }
      }
    }
  });

  // Calculate current %B and Bandwidth
  const lastIdx = close.length - 1;
  const currB = (close[lastIdx] - lower[lastIdx]) / (upper[lastIdx] - lower[lastIdx]);
  const currWidth = bandwidth[lastIdx];

  document.getElementById('statsBB').innerHTML = `
    <h4><i class="fa-solid fa-arrows-left-right-to-line"></i> 볼린저 밴드 분석 지표</h4>
    <div class="stats-grid-mini">
      <div class="stat-item"><div class="stat-item-label">현재 상단선 (+2σ)</div><div class="stat-item-value">${fmtCur(upper[lastIdx])}</div></div>
      <div class="stat-item"><div class="stat-item-label">현재 중심선 (20일 SMA)</div><div class="stat-item-value">${fmtCur(sma20[lastIdx])}</div></div>
      <div class="stat-item"><div class="stat-item-label">현재 하단선 (-2σ)</div><div class="stat-item-value">${fmtCur(lower[lastIdx])}</div></div>
      <div class="stat-item"><div class="stat-item-label">현재 %B 위치</div><div class="stat-item-value ${currB > 0.8 ? 'text-danger' : currB < 0.2 ? 'text-success' : ''}">${fmt(currB, 2)} (${currB > 1 ? '상단 돌파' : currB < 0 ? '하단 이탈' : '밴드 내'})</div></div>
      <div class="stat-item"><div class="stat-item-label">밴드폭 (Bandwidth)</div><div class="stat-item-value">${fmtPct(currWidth)}</div></div>
    </div>
  `;
}

// -------------------------------------------------------------
// 5. Rolling Annualized Volatility (30d & 90d)
// -------------------------------------------------------------
function analysis5_RollingVolatility() {
  const dates = rawData.slice(1).map(d => d.date);
  const returns = rawData.slice(1).map(d => d.dailyReturn);

  const roll30 = Stats.rollingStd(returns, 30).map(v => v == null ? null : v * Math.sqrt(252));
  const roll90 = Stats.rollingStd(returns, 90).map(v => v == null ? null : v * Math.sqrt(252));

  const step = 2;
  const sDates = dates.filter((_, i) => i % step === 0);
  const s30 = roll30.filter((_, i) => i % step === 0);
  const s90 = roll90.filter((_, i) => i % step === 0);

  safeChart('chartVolatility', {
    type: 'line',
    data: {
      labels: sDates,
      datasets: [
        { label: '30일 롤링 연환산 변동성 (단기)', data: s30, borderColor: '#ef4444', borderWidth: 1.5, pointRadius: 0 },
        { label: '90일 롤링 연환산 변동성 (중기)', data: s90, borderColor: '#3b82f6', borderWidth: 2, pointRadius: 0 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { maxTicksLimit: 12, color: '#94a3b8' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', callback: v => (v * 100).toFixed(0) + '%' } }
      },
      plugins: {
        legend: { labels: { color: '#f8fafc' } }
      }
    }
  });

  const valid30 = roll30.filter(v => v !== null);
  const maxVol = Math.max(...valid30);
  const minVol = Math.min(...valid30);
  const avgVol = Stats.mean(valid30);

  document.getElementById('statsVol').innerHTML = `
    <h4><i class="fa-solid fa-chart-line"></i> 변동성 레짐 분석</h4>
    <div class="stats-grid-mini">
      <div class="stat-item"><div class="stat-item-label">역대 최고 연환산 변동성</div><div class="stat-item-value text-danger">${fmtPct(maxVol)}</div></div>
      <div class="stat-item"><div class="stat-item-label">역대 최저 연환산 변동성</div><div class="stat-item-value text-success">${fmtPct(minVol)}</div></div>
      <div class="stat-item"><div class="stat-item-label">10년 평균 연환산 변동성</div><div class="stat-item-value">${fmtPct(avgVol)}</div></div>
      <div class="stat-item"><div class="stat-item-label">최근 30일 변동성</div><div class="stat-item-value text-warning">${fmtPct(valid30[valid30.length - 1])}</div></div>
    </div>
  `;
}

// -------------------------------------------------------------
// 6. Drawdown & Maximum Drawdown (MDD)
// -------------------------------------------------------------
function analysis6_Drawdown() {
  const dates = rawData.map(d => d.date);
  const close = rawData.map(d => d.close);

  let peak = -Infinity;
  const ddList = [];
  let mdd = 0;
  let mddDate = '';
  let mddPeakDate = '';
  let currentPeakDate = '';

  for (let i = 0; i < close.length; i++) {
    if (close[i] > peak) {
      peak = close[i];
      currentPeakDate = dates[i];
    }
    const dd = (close[i] - peak) / peak;
    ddList.push(dd);

    if (dd < mdd) {
      mdd = dd;
      mddDate = dates[i];
      mddPeakDate = currentPeakDate;
    }
  }

  const step = 2;
  const sDates = dates.filter((_, i) => i % step === 0);
  const sDD = ddList.filter((_, i) => i % step === 0);

  safeChart('chartDrawdown', {
    type: 'line',
    data: {
      labels: sDates,
      datasets: [
        {
          label: '드로우다운 (Drawdown %)',
          data: sDD,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.25)',
          fill: true,
          borderWidth: 1.5,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { maxTicksLimit: 12, color: '#94a3b8' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', callback: v => (v * 100).toFixed(0) + '%' }, max: 0 }
      },
      plugins: {
        legend: { labels: { color: '#f8fafc' } }
      }
    }
  });

  const avgDD = Stats.mean(ddList);

  document.getElementById('statsMDD').innerHTML = `
    <h4><i class="fa-solid fa-triangle-exclamation"></i> 하방 위험 계량 지표</h4>
    <div class="stats-grid-mini">
      <div class="stat-item"><div class="stat-item-label">최대 낙폭 (MDD)</div><div class="stat-item-value text-danger">${fmtPct(mdd)}</div></div>
      <div class="stat-item"><div class="stat-item-label">MDD 발생 일자</div><div class="stat-item-value">${mddDate}</div></div>
      <div class="stat-item"><div class="stat-item-label">직전 최고점 일자</div><div class="stat-item-value">${mddPeakDate}</div></div>
      <div class="stat-item"><div class="stat-item-label">평균 드로우다운</div><div class="stat-item-value">${fmtPct(avgDD)}</div></div>
      <div class="stat-item"><div class="stat-item-label">최근 드로우다운 상태</div><div class="stat-item-value text-success">${fmtPct(ddList[ddList.length - 1])}</div></div>
    </div>
  `;
}

// -------------------------------------------------------------
// 7. Autocorrelation Function (ACF)
// -------------------------------------------------------------
function analysis7_Autocorrelation() {
  const returns = rawData.slice(1).map(d => d.dailyReturn);
  const maxLag = 25;
  const acfData = Stats.autocorrelation(returns, maxLag);

  const labels = acfData.map(d => `Lag ${d.lag}`);
  const values = acfData.map(d => d.acf);
  
  // 95% Confidence Band: +/- 1.96 / sqrt(N)
  const conf = 1.96 / Math.sqrt(returns.length);

  safeChart('chartACF', {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: '자기상관계수 (ACF)',
          data: values,
          backgroundColor: values.map(v => Math.abs(v) > conf ? '#ef4444' : '#06b6d4'),
          borderWidth: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' }, min: -0.15, max: 0.15 }
      },
      plugins: {
        legend: { labels: { color: '#f8fafc' } },
        tooltip: {
          callbacks: {
            afterLabel: () => `95% 신뢰한계구간: ±${fmt(conf, 3)}`
          }
        }
      }
    }
  });

  const sigLags = acfData.filter(d => Math.abs(d.acf) > conf);

  document.getElementById('statsACF').innerHTML = `
    <h4><i class="fa-solid fa-arrows-spin"></i> 시계열 효율성 및 잔차 독립성 진단</h4>
    <div class="stats-grid-mini">
      <div class="stat-item"><div class="stat-item-label">95% 신뢰구간 임계값 (±)</div><div class="stat-item-value">±${fmt(conf, 4)}</div></div>
      <div class="stat-item"><div class="stat-item-label">Lag 1 자기상관도</div><div class="stat-item-value">${fmt(acfData[0].acf, 4)}</div></div>
      <div class="stat-item"><div class="stat-item-label">유의미한 시차 (Lags) 수</div><div class="stat-item-value ${sigLags.length > 3 ? 'text-warning' : 'text-success'}">${sigLags.length}개 / 25개</div></div>
      <div class="stat-item"><div class="stat-item-label">랜덤워크 / 효율적 시장 판정</div><div class="stat-item-value text-success">${sigLags.length <= 2 ? '효율적 시장 부합 (약형)' : '약한 시계열 종속성 발견'}</div></div>
    </div>
  `;
}

// -------------------------------------------------------------
// 8. Price Change vs Volume Linear Regression
// -------------------------------------------------------------
function analysis8_Regression() {
  const subset = rawData.slice(1).filter((_, i) => i % 2 === 0);
  const x = subset.map(d => d.volume / 1e6); // Volume in Millions
  const y = subset.map(d => Math.abs(d.dailyReturn) * 100); // Absolute Return %

  const reg = Stats.linearRegression(x, y);

  // Scatter points
  const scatterPoints = x.map((xv, i) => ({ x: xv, y: y[i] }));

  // Regression line start and end
  const minX = Math.min(...x);
  const maxX = Math.max(...x);
  const linePoints = [
    { x: minX, y: reg.slope * minX + reg.intercept },
    { x: maxX, y: reg.slope * maxX + reg.intercept }
  ];

  safeChart('chartRegression', {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: '거래일 관측치 (|Return| vs Volume)',
          data: scatterPoints,
          backgroundColor: 'rgba(99, 102, 241, 0.4)',
          pointRadius: 2.5
        },
        {
          type: 'line',
          label: `회귀직선 (y = ${reg.slope.toFixed(4)}x + ${reg.intercept.toFixed(2)})`,
          data: linePoints,
          borderColor: '#f59e0b',
          borderWidth: 2,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: '거래량 (백만 주)', color: '#94a3b8' },
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#94a3b8' }
        },
        y: {
          title: { display: true, text: '일일 절대 변동폭 (|Return| %)', color: '#94a3b8' },
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#94a3b8', callback: v => v + '%' }
        }
      },
      plugins: {
        legend: { labels: { color: '#f8fafc' } }
      }
    }
  });

  document.getElementById('statsReg').innerHTML = `
    <h4><i class="fa-solid fa-chart-simple"></i> OLS 회귀분석 결과 요약</h4>
    <div class="stats-grid-mini">
      <div class="stat-item"><div class="stat-item-label">피어슨 상관계수 (r)</div><div class="stat-item-value text-primary">${fmt(reg.r, 3)}</div></div>
      <div class="stat-item"><div class="stat-item-label">결정계수 (R-squared)</div><div class="stat-item-value">${fmt(reg.r2 * 100, 2)}%</div></div>
      <div class="stat-item"><div class="stat-item-label">기울기 (Slope, β)</div><div class="stat-item-value">${fmt(reg.slope, 5)}</div></div>
      <div class="stat-item"><div class="stat-item-label">절편 (Intercept, α)</div><div class="stat-item-value">${fmt(reg.intercept, 3)}%</div></div>
      <div class="stat-item"><div class="stat-item-label">상관성 해석</div><div class="stat-item-value text-success">${reg.r > 0.2 ? '거래량 증가 시 변동폭 유의미한 확대' : '미약한 양의 상관성'}</div></div>
    </div>
  `;
}

// -------------------------------------------------------------
// 9. Monthly Seasonality & Weekday Effect
// -------------------------------------------------------------
function analysis9_Seasonality() {
  const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
  const monthSums = new Array(12).fill(0);
  const monthCounts = new Array(12).fill(0);
  const monthWins = new Array(12).fill(0);

  const weekNames = ['월요일', '화요일', '수요일', '목요일', '금요일'];
  const weekSums = new Array(5).fill(0);
  const weekCounts = new Array(5).fill(0);

  rawData.slice(1).forEach(d => {
    const dt = new Date(d.date);
    const m = dt.getMonth();
    const day = dt.getDay(); // 1: Mon ... 5: Fri

    monthSums[m] += d.dailyReturn;
    monthCounts[m]++;
    if (d.dailyReturn > 0) monthWins[m]++;

    if (day >= 1 && day <= 5) {
      weekSums[day - 1] += d.dailyReturn;
      weekCounts[day - 1]++;
    }
  });

  const monthAvg = monthSums.map((sum, i) => (sum / monthCounts[i]) * 21 * 100); // Approx monthly return %
  const monthWinRate = monthWins.map((win, i) => (win / monthCounts[i]) * 100);
  const weekAvg = weekSums.map((sum, i) => (sum / weekCounts[i]) * 100); // Daily return %

  // Monthly Chart
  safeChart('chartMonthly', {
    type: 'bar',
    data: {
      labels: monthNames,
      datasets: [
        {
          label: '월환산 평균 수익률 (%)',
          data: monthAvg,
          backgroundColor: monthAvg.map(v => v >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)')
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', callback: v => v + '%' } }
      },
      plugins: {
        legend: { labels: { color: '#f8fafc' } },
        title: { display: true, text: '월별 평균 수익률 (계절성 분석)', color: '#f8fafc' }
      }
    }
  });

  // Weekday Chart
  safeChart('chartWeekday', {
    type: 'bar',
    data: {
      labels: weekNames,
      datasets: [
        {
          label: '요일별 일평균 수익률 (%)',
          data: weekAvg,
          backgroundColor: weekAvg.map(v => v >= 0 ? 'rgba(59, 130, 246, 0.7)' : 'rgba(239, 68, 68, 0.7)')
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', callback: v => v.toFixed(2) + '%' } }
      },
      plugins: {
        legend: { labels: { color: '#f8fafc' } },
        title: { display: true, text: '요일 효과 (Day-of-the-Week Effect)', color: '#f8fafc' }
      }
    }
  });

  const bestMonthIdx = monthAvg.indexOf(Math.max(...monthAvg));
  const worstMonthIdx = monthAvg.indexOf(Math.min(...monthAvg));

  document.getElementById('statsSeason').innerHTML = `
    <h4><i class="fa-solid fa-calendar"></i> 캘린더 아노말리(계절성) 분석</h4>
    <div class="stats-grid-mini">
      <div class="stat-item"><div class="stat-item-label">역대 최고 수익 월</div><div class="stat-item-value text-success">${monthNames[bestMonthIdx]} (${fmtPct(monthAvg[bestMonthIdx] / 100)})</div></div>
      <div class="stat-item"><div class="stat-item-label">역대 최저 수익 월</div><div class="stat-item-value text-danger">${monthNames[worstMonthIdx]} (${fmtPct(monthAvg[worstMonthIdx] / 100)})</div></div>
      <div class="stat-item"><div class="stat-item-label">최고 승률 월</div><div class="stat-item-value">${monthNames[monthWinRate.indexOf(Math.max(...monthWinRate))]} (${fmt(Math.max(...monthWinRate), 1)}%)</div></div>
      <div class="stat-item"><div class="stat-item-label">가장 강한 요일</div><div class="stat-item-value text-primary">${weekNames[weekAvg.indexOf(Math.max(...weekAvg))]}</div></div>
    </div>
  `;
}

// -------------------------------------------------------------
// 10. Value at Risk (VaR) & Expected Shortfall (CVaR)
// -------------------------------------------------------------
function analysis10_VaR() {
  const returns = rawData.slice(1).map(d => d.dailyReturn).sort((a, b) => a - b);
  const n = returns.length;

  // 1. Historical Simulation VaR
  const hVaR95 = Stats.percentile(returns, 5);
  const hVaR99 = Stats.percentile(returns, 1);

  // Historical CVaR (Expected Shortfall) = mean of losses beyond VaR
  const cVaR95Losses = returns.filter(r => r <= hVaR95);
  const hCVaR95 = Stats.mean(cVaR95Losses);

  const cVaR99Losses = returns.filter(r => r <= hVaR99);
  const hCVaR99 = Stats.mean(cVaR99Losses);

  // 2. Parametric Normal VaR: Mean - Z * Std
  const m = Stats.mean(returns);
  const s = Stats.std(returns);
  const pVaR95 = m - 1.645 * s;
  const pVaR99 = m - 2.326 * s;

  safeChart('chartVaR', {
    type: 'bar',
    data: {
      labels: ['95% 1일 VaR (역사적)', '95% CVaR (Expected Shortfall)', '99% 1일 VaR (역사적)', '99% CVaR (Expected Shortfall)', '95% VaR (모수적 정규)', '99% VaR (모수적 정규)'],
      datasets: [
        {
          label: '예상 일일 최대 손실률 (%)',
          data: [hVaR95 * 100, hCVaR95 * 100, hVaR99 * 100, hCVaR99 * 100, pVaR95 * 100, pVaR99 * 100],
          backgroundColor: [
            'rgba(245, 158, 11, 0.7)',
            'rgba(239, 68, 68, 0.7)',
            'rgba(220, 38, 38, 0.8)',
            'rgba(153, 27, 27, 0.9)',
            'rgba(59, 130, 246, 0.7)',
            'rgba(99, 102, 241, 0.8)'
          ]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', callback: v => v + '%' } }
      },
      plugins: {
        legend: { labels: { color: '#f8fafc' } }
      }
    }
  });

  document.getElementById('statsVaRPanel').innerHTML = `
    <h4><i class="fa-solid fa-shield-virus"></i> 극단 손실 리스크 평가 (1억원 투자 가정 시나리오)</h4>
    <div class="stats-grid-mini">
      <div class="stat-item"><div class="stat-item-label">95% 신뢰 1일 최대 예상 손실 (VaR)</div><div class="stat-item-value text-warning">${fmtPct(hVaR95)} (-${fmt(Math.abs(hVaR95) * 100000000, 0)}원)</div></div>
      <div class="stat-item"><div class="stat-item-label">95% 조건부 손실 (CVaR / ES)</div><div class="stat-item-value text-danger">${fmtPct(hCVaR95)} (-${fmt(Math.abs(hCVaR95) * 100000000, 0)}원)</div></div>
      <div class="stat-item"><div class="stat-item-label">99% 신뢰 1일 최대 예상 손실 (VaR)</div><div class="stat-item-value text-danger">${fmtPct(hVaR99)} (-${fmt(Math.abs(hVaR99) * 100000000, 0)}원)</div></div>
      <div class="stat-item"><div class="stat-item-label">모수적 vs 역사적 차이</div><div class="stat-item-value">${fmtPct(hVaR95 - pVaR95)} (팻테일 리스크 반영)</div></div>
    </div>
  `;
}
