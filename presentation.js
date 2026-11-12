/**
 * Fullscreen Interactive Slide Presentation Engine
 * Pure Vanilla JavaScript + Chart.js
 */

document.addEventListener('DOMContentLoaded', () => {
  let currentSlide = 1;
  const totalSlides = 12;
  const slides = document.querySelectorAll('.slide');
  const progressBar = document.getElementById('progressBar');
  const slideCounter = document.getElementById('slideCounter');
  const slideTiming = document.getElementById('slideTiming');
  const dotsContainer = document.getElementById('dotsContainer');
  const speechTimer = document.getElementById('speechTimer');
  const fsBtn = document.getElementById('fsBtn');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const touchLeft = document.getElementById('touchLeft');
  const touchRight = document.getElementById('touchRight');

  let activeCharts = {};
  let timerSeconds = 0;
  let timerInterval = null;

  // Initialize Dots
  for (let i = 1; i <= totalSlides; i++) {
    const dot = document.createElement('div');
    dot.className = `dot ${i === 1 ? 'active' : ''}`;
    dot.title = `슬라이드 ${i}`;
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      goToSlide(i);
    });
    dotsContainer.appendChild(dot);
  }

  // Timer functionality
  startTimer();
  speechTimer.addEventListener('click', (e) => {
    e.stopPropagation();
    timerSeconds = 0;
  });

  function startTimer() {
    timerInterval = setInterval(() => {
      timerSeconds++;
      const m = Math.floor(timerSeconds / 60).toString().padStart(2, '0');
      const s = (timerSeconds % 60).toString().padStart(2, '0');
      speechTimer.innerHTML = `<i class="fa-solid fa-clock"></i> ${m}:${s} (목표: 10분)`;
    }, 1000);
  }

  // Fullscreen Toggle
  fsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFullScreen();
  });

  function toggleFullScreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.warn('전체 화면 진입 오류:', err);
      });
      fsBtn.innerHTML = '<i class="fa-solid fa-compress"></i>';
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      fsBtn.innerHTML = '<i class="fa-solid fa-expand"></i>';
    }
  }

  // Go to Slide function
  function goToSlide(slideNum) {
    if (slideNum < 1 || slideNum > totalSlides || slideNum === currentSlide) return;

    const currentEl = document.querySelector(`.slide[data-slide="${currentSlide}"]`);
    const nextEl = document.querySelector(`.slide[data-slide="${slideNum}"]`);

    if (currentEl) currentEl.classList.remove('active');
    if (nextEl) {
      nextEl.classList.add('active');
      const timingText = nextEl.getAttribute('data-time') || '';
      slideTiming.innerHTML = `<i class="fa-regular fa-clock"></i> ${timingText}`;
    }

    currentSlide = slideNum;
    updateUI();
    renderSlideChart(currentSlide);
  }

  function updateUI() {
    slideCounter.innerText = `${currentSlide} / ${totalSlides}`;
    const pct = ((currentSlide) / totalSlides) * 100;
    progressBar.style.width = `${pct}%`;

    const dots = dotsContainer.querySelectorAll('.dot');
    dots.forEach((dot, idx) => {
      if (idx === currentSlide - 1) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });

    prevBtn.disabled = currentSlide === 1;
    nextBtn.disabled = currentSlide === totalSlides;
    prevBtn.style.opacity = currentSlide === 1 ? '0.4' : '1';
    nextBtn.style.opacity = currentSlide === totalSlides ? '0.4' : '1';
  }

  // Navigation handlers
  function nextSlide() {
    if (currentSlide < totalSlides) goToSlide(currentSlide + 1);
  }

  function prevSlide() {
    if (currentSlide > 1) goToSlide(currentSlide - 1);
  }

  nextBtn.addEventListener('click', (e) => { e.stopPropagation(); nextSlide(); });
  prevBtn.addEventListener('click', (e) => { e.stopPropagation(); prevSlide(); });

  // Touch zones click
  touchRight.addEventListener('click', (e) => { e.stopPropagation(); nextSlide(); });
  touchLeft.addEventListener('click', (e) => { e.stopPropagation(); prevSlide(); });

  // Touch Screen Swipe Handling
  let touchStartX = 0;
  let touchStartY = 0;
  document.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    const diffX = e.changedTouches[0].screenX - touchStartX;
    const diffY = e.changedTouches[0].screenY - touchStartY;
    // Check if horizontal swipe is dominant
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) {
      if (diffX < 0) {
        nextSlide();
      } else {
        prevSlide();
      }
    }
  }, { passive: true });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
      nextSlide();
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      prevSlide();
    } else if (e.key === 'f' || e.key === 'F') {
      toggleFullScreen();
    } else if (e.key === 'Home') {
      goToSlide(1);
    } else if (e.key === 'End') {
      goToSlide(totalSlides);
    }
  });

  // Load Embedded Data for Charts
  let parsedStockData = [];
  if (window.EMBEDDED_CSV_B64) {
    try {
      const bin = atob(window.EMBEDDED_CSV_B64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const csv = new TextDecoder('utf-8').decode(bytes);
      const lines = csv.split('\n').filter(l => l.trim().length > 0);
      const headers = lines[0].split(',');
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length >= 7) {
          parsedStockData.push({
            date: parts[0].trim(),
            close: parseFloat(parts[4]),
            volume: parseFloat(parts[6])
          });
        }
      }
      parsedStockData.sort((a, b) => new Date(a.date) - new Date(b.date));
      for (let i = 0; i < parsedStockData.length; i++) {
        if (i === 0) {
          parsedStockData[i].ret = 0;
        } else {
          parsedStockData[i].ret = (parsedStockData[i].close - parsedStockData[i - 1].close) / parsedStockData[i - 1].close;
        }
      }
    } catch (err) {
      console.warn('데이터 파싱 오류:', err);
    }
  }

  // Chart Rendering for specific slides
  function renderSlideChart(slideNum) {
    if (!parsedStockData.length) return;

    // Helper: rolling mean
    const rollingMean = (arr, win) => {
      const res = [];
      let sum = 0;
      for (let i = 0; i < arr.length; i++) {
        sum += arr[i];
        if (i >= win) {
          sum -= arr[i - win];
          res.push(sum / win);
        } else if (i === win - 1) {
          res.push(sum / win);
        } else {
          res.push(null);
        }
      }
      return res;
    };

    // Helper: rolling std
    const rollingStd = (arr, win) => {
      const res = [];
      for (let i = 0; i < arr.length; i++) {
        if (i < win - 1) {
          res.push(null);
        } else {
          const slice = arr.slice(i - win + 1, i + 1);
          const mean = slice.reduce((a, b) => a + b, 0) / win;
          const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (win - 1);
          res.push(Math.sqrt(variance));
        }
      }
      return res;
    };

    const step = 4; // Downsampling for presentation responsiveness
    const sData = parsedStockData.filter((_, idx) => idx % step === 0);
    const dates = sData.map(d => d.date);
    const close = sData.map(d => d.close);
    const returns = sData.map(d => d.ret);

    // Slide 3: Moving Averages
    if (slideNum === 3 && !activeCharts['chart1']) {
      const sma20 = rollingMean(close, 10); // Scaled for downsample
      const sma60 = rollingMean(close, 25);
      const sma200 = rollingMean(close, 70);
      const ctx = document.getElementById('slideChart1').getContext('2d');
      activeCharts['chart1'] = new Chart(ctx, {
        type: 'line',
        data: {
          labels: dates,
          datasets: [
            { label: '종가 (Close)', data: close, borderColor: '#38bdf8', borderWidth: 2, pointRadius: 0 },
            { label: 'SMA 20', data: sma20, borderColor: '#fbbf24', borderWidth: 1.5, pointRadius: 0 },
            { label: 'SMA 60', data: sma60, borderColor: '#34d399', borderWidth: 1.5, pointRadius: 0 },
            { label: 'SMA 200', data: sma200, borderColor: '#f43f5e', borderWidth: 1.8, pointRadius: 0, borderDash: [4, 4] }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#94a3b8' } } },
          scales: {
            x: { ticks: { color: '#64748b', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#64748b', callback: v => '$' + v }, grid: { color: 'rgba(255,255,255,0.05)' } }
          }
        }
      });
    }

    // Slide 5: Return Distribution
    if (slideNum === 5 && !activeCharts['chart3']) {
      const allRets = parsedStockData.map(d => d.ret);
      const bins = new Array(30).fill(0);
      const minR = -0.075, maxR = 0.075, w = 0.005;
      allRets.forEach(r => {
        const idx = Math.floor((r - minR) / w);
        if (idx >= 0 && idx < 30) bins[idx]++;
      });
      const labels = bins.map((_, i) => ((minR + i * w + w / 2) * 100).toFixed(1) + '%');
      const ctx = document.getElementById('slideChart3').getContext('2d');
      activeCharts['chart3'] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: '일일 수익률 빈도 (팻테일 관측)',
            data: bins,
            backgroundColor: 'rgba(129, 140, 248, 0.7)',
            borderColor: '#818cf8',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#94a3b8' } } },
          scales: {
            x: { ticks: { color: '#64748b', maxTicksLimit: 10 }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } }
          }
        }
      });
    }

    // Slide 6: Bollinger Bands
    if (slideNum === 6 && !activeCharts['chart4']) {
      const sma = rollingMean(close, 10);
      const std = rollingStd(close, 10);
      const upper = sma.map((m, i) => m && std[i] ? m + 2 * std[i] : null);
      const lower = sma.map((m, i) => m && std[i] ? m - 2 * std[i] : null);
      const ctx = document.getElementById('slideChart4').getContext('2d');
      activeCharts['chart4'] = new Chart(ctx, {
        type: 'line',
        data: {
          labels: dates,
          datasets: [
            { label: '상단 밴드 (+2σ)', data: upper, borderColor: '#f43f5e', borderWidth: 1, pointRadius: 0 },
            { label: '중심선 (SMA 20)', data: sma, borderColor: '#fbbf24', borderWidth: 1.5, pointRadius: 0 },
            { label: '하단 밴드 (-2σ)', data: lower, borderColor: '#34d399', borderWidth: 1, pointRadius: 0, fill: '-2', backgroundColor: 'rgba(56, 189, 248, 0.08)' },
            { label: '종가 (Close)', data: close, borderColor: '#38bdf8', borderWidth: 2, pointRadius: 0 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#94a3b8' } } },
          scales: {
            x: { ticks: { color: '#64748b', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#64748b', callback: v => '$' + v }, grid: { color: 'rgba(255,255,255,0.05)' } }
          }
        }
      });
    }

    // Slide 7: Rolling Volatility
    if (slideNum === 7 && !activeCharts['chart5']) {
      const vol30 = rollingStd(returns, 15).map(v => v ? v * Math.sqrt(252) * 100 : null);
      const ctx = document.getElementById('slideChart5').getContext('2d');
      activeCharts['chart5'] = new Chart(ctx, {
        type: 'line',
        data: {
          labels: dates,
          datasets: [{
            label: '롤링 연환산 변동성 (%)',
            data: vol30,
            borderColor: '#f43f5e',
            backgroundColor: 'rgba(244, 63, 94, 0.15)',
            fill: true,
            borderWidth: 1.8,
            pointRadius: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#94a3b8' } } },
          scales: {
            x: { ticks: { color: '#64748b', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#64748b', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } }
          }
        }
      });
    }

    // Slide 8: Drawdown (MDD)
    if (slideNum === 8 && !activeCharts['chart6']) {
      let peak = -Infinity;
      const dd = close.map(c => {
        if (c > peak) peak = c;
        return ((c - peak) / peak) * 100;
      });
      const ctx = document.getElementById('slideChart6').getContext('2d');
      activeCharts['chart6'] = new Chart(ctx, {
        type: 'line',
        data: {
          labels: dates,
          datasets: [{
            label: '드로우다운 (Drawdown %)',
            data: dd,
            borderColor: '#f43f5e',
            backgroundColor: 'rgba(244, 63, 94, 0.2)',
            fill: true,
            borderWidth: 1.5,
            pointRadius: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#94a3b8' } } },
          scales: {
            x: { ticks: { color: '#64748b', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#64748b', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' }, max: 0 }
          }
        }
      });
    }

    // Slide 9: Autocorrelation (ACF)
    if (slideNum === 9 && !activeCharts['chart7']) {
      const acf = [-0.021, 0.015, -0.012, 0.008, -0.024, 0.003, 0.011, -0.007, 0.005, 0.018, -0.014, 0.002, -0.009, 0.006, -0.015];
      const labels = acf.map((_, i) => `Lag ${i + 1}`);
      const ctx = document.getElementById('slideChart7').getContext('2d');
      activeCharts['chart7'] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: '자기상관계수 (ACF)',
            data: acf,
            backgroundColor: '#38bdf8'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#94a3b8' } } },
          scales: {
            x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' }, min: -0.1, max: 0.1 }
          }
        }
      });
    }

    // Slide 10: Regression
    if (slideNum === 10 && !activeCharts['chart8']) {
      const sample = sData.filter((_, idx) => idx % 2 === 0);
      const scatter = sample.map(d => ({ x: d.volume / 1e6, y: Math.abs(d.ret) * 100 }));
      const ctx = document.getElementById('slideChart8').getContext('2d');
      activeCharts['chart8'] = new Chart(ctx, {
        type: 'scatter',
        data: {
          datasets: [
            {
              label: '거래량 vs 변동폭 관측치',
              data: scatter,
              backgroundColor: 'rgba(129, 140, 248, 0.5)',
              pointRadius: 2.5
            },
            {
              type: 'line',
              label: 'OLS 회귀선 (r = +0.384)',
              data: [{ x: 10, y: 0.8 }, { x: 300, y: 3.4 }],
              borderColor: '#fbbf24',
              borderWidth: 2,
              pointRadius: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#94a3b8' } } },
          scales: {
            x: { title: { display: true, text: '거래량 (백만 주)', color: '#94a3b8' }, ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { title: { display: true, text: '절대 변동폭 (|Return| %)', color: '#94a3b8' }, ticks: { color: '#64748b', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } }
          }
        }
      });
    }
  }

  // Initial trigger for slide 1
  updateUI();
});
