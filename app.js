// App.js for EcoSense Dashboard - FIXED VERSION

// Configuration
const CONFIG = {
    demoMode: false,
    updateInterval: 10000, // Check Firebase every 10 seconds
    firebaseUrl: "https://ecosense-b00a7-default-rtdb.asia-southeast1.firebasedatabase.app/readings.json"
};

// State
let chart;
let historicalData = [];
let firebaseInterval;

// DOM Elements
const els = {
    temp: document.getElementById('val-temp'),
    hum: document.getElementById('val-hum'),
    batt: document.getElementById('val-batt'),
    voltage: document.getElementById('val-voltage'),
    days: document.getElementById('val-days'),
    feelsLike: document.getElementById('val-feels-like'),
    dew: document.getElementById('val-dew'),
    mold: document.getElementById('insight-mold'),
    comfort: document.getElementById('insight-comfort'),
    absHum: document.getElementById('insight-abs-hum'),
    status: document.getElementById('connection-status'),
    demoToggle: document.getElementById('demo-mode-toggle')
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    initChart();

    // Check for Demo Mode preference
    const savedDemo = localStorage.getItem('demoMode') === 'true';
    els.demoToggle.checked = savedDemo;
    CONFIG.demoMode = savedDemo;

    if (CONFIG.demoMode) {
        startSimulation();
    } else {
        // FIXED: Start real Firebase data fetching
        startFirebaseFetching();
    }

    els.demoToggle.addEventListener('change', (e) => {
        CONFIG.demoMode = e.target.checked;
        localStorage.setItem('demoMode', CONFIG.demoMode);
        if (CONFIG.demoMode) {
            stopFirebaseFetching();
            startSimulation();
        } else {
            stopSimulation();
            startFirebaseFetching();
        }
    });
});

// ================= FIREBASE DATA FETCHING =================
async function startFirebaseFetching() {
    els.status.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Connecting to Firebase...';
    
    // Fetch immediately
    await fetchFirebaseData();
    
    // Then fetch every 10 seconds
    firebaseInterval = setInterval(fetchFirebaseData, CONFIG.updateInterval);
}

function stopFirebaseFetching() {
    if (firebaseInterval) {
        clearInterval(firebaseInterval);
        firebaseInterval = null;
    }
}

async function fetchFirebaseData() {
    try {
        const response = await fetch(CONFIG.firebaseUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data || Object.keys(data).length === 0) {
            els.status.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> No Data Yet';
            console.log('Waiting for sensor data...');
            return;
        }
        
        // Convert Firebase object to array and sort by timestamp
        const readings = Object.entries(data)
            .map(([key, value]) => ({
                id: key,
                ...value
            }))
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        
        // Update status
        els.status.innerHTML = '<i class="fa-solid fa-circle-check"></i> Live from Firebase';
        
        // Process readings into our historicalData format
        processFirebaseReadings(readings);
        
    } catch (error) {
        console.error('Firebase fetch error:', error);
        els.status.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Connection Error';
        
        // Show error details in console for debugging
        console.log('Error details:', error.message);
    }
}

function processFirebaseReadings(readings) {
    // Clear historical data
    historicalData = [];
    
    // Process each reading
    readings.forEach(reading => {
        if (reading.data && Array.isArray(reading.data)) {
            // Batched data format from ESP8266
            reading.data.forEach((dataPoint, index) => {
                const timestamp = reading.timestamp ? 
                    new Date(reading.timestamp + (index * 1000)) : // Spread batched readings over time
                    new Date();
                
                historicalData.push({
                    t: dataPoint.t || 0,
                    h: dataPoint.h || 0,
                    v: dataPoint.v || 3300,
                    ts: timestamp
                });
            });
        } else if (reading.temperature !== undefined) {
            // Single reading format
            const timestamp = reading.timestamp ? new Date(reading.timestamp) : new Date();
            
            historicalData.push({
                t: reading.temperature,
                h: reading.humidity,
                v: reading.rssi ? 3700 : 3300, // Default voltage if not provided
                ts: timestamp
            });
        }
    });
    
    // Sort by timestamp
    historicalData.sort((a, b) => a.ts - b.ts);
    
    // Keep only last 50 readings for performance
    if (historicalData.length > 50) {
        historicalData = historicalData.slice(-50);
    }
    
    // Update UI with latest reading
    if (historicalData.length > 0) {
        const latest = historicalData[historicalData.length - 1];
        updateUI(latest);
        updateChart();
    }
}

function updateChart() {
    const labels = historicalData.map(d => 
        d.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
    const temps = historicalData.map(d => d.t);
    const hums = historicalData.map(d => d.h);

    chart.data.labels = labels;
    chart.data.datasets[0].data = temps;
    chart.data.datasets[1].data = hums;
    chart.update('none');
}

// ================= CHART.JS =================
function initChart() {
    const ctx = document.getElementById('mainChart').getContext('2d');

    // Gradient for Temperature
    const gradientTemp = ctx.createLinearGradient(0, 0, 0, 400);
    gradientTemp.addColorStop(0, 'rgba(244, 63, 94, 0.5)');
    gradientTemp.addColorStop(1, 'rgba(244, 63, 94, 0)');

    // Gradient for Humidity
    const gradientHum = ctx.createLinearGradient(0, 0, 0, 400);
    gradientHum.addColorStop(0, 'rgba(59, 130, 246, 0.5)');
    gradientHum.addColorStop(1, 'rgba(59, 130, 246, 0)');

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Temperature (°C)',
                    data: [],
                    borderColor: '#f43f5e',
                    backgroundColor: gradientTemp,
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y'
                },
                {
                    label: 'Humidity (%)',
                    data: [],
                    borderColor: '#3b82f6',
                    backgroundColor: gradientHum,
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    labels: { color: '#cbd5e1' }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8' }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#f43f5e' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#3b82f6' }
                }
            }
        }
    });
}

// ================= SIMULATION =================
let simInterval;
function startSimulation() {
    if (simInterval) clearInterval(simInterval);

    els.status.innerHTML = '<i class="fa-solid fa-circle-check"></i> Live (Simulated)';

    // Generate initial history
    const now = new Date();
    historicalData = [];
    for (let i = 20; i > 0; i--) {
        const t = new Date(now.getTime() - i * 30 * 60000);
        historicalData.push({
            t: 22 + Math.sin(i) * 2 + Math.random(),
            h: 50 + Math.cos(i) * 5 + Math.random(),
            v: 4100 - (i * 2),
            ts: t
        });
    }

    // Update UI with initial data
    updateUI(historicalData[historicalData.length - 1]);
    updateChart();

    // Live updates
    simInterval = setInterval(() => {
        const last = historicalData[historicalData.length - 1];
        const newReading = {
            t: last.t + (Math.random() - 0.5),
            h: last.h + (Math.random() - 0.5) * 2,
            v: last.v - 0.1,
            ts: new Date()
        };

        if (historicalData.length > 50) historicalData.shift();
        historicalData.push(newReading);

        updateUI(newReading);
        updateChart();
    }, 2000);
}

function stopSimulation() {
    if (simInterval) {
        clearInterval(simInterval);
        simInterval = null;
    }
}

function updateUI(data) {
    els.temp.textContent = data.t.toFixed(1);
    els.hum.textContent = data.h.toFixed(1);

    // Battery Logic (Li-ion: 4.2V to 3.3V)
    const pct = Math.max(0, Math.min(100, (data.v - 3300) / (4200 - 3300) * 100));
    els.batt.textContent = Math.round(pct);
    els.voltage.textContent = Math.round(data.v);
    els.days.textContent = Math.round(pct * 5);

    // Derived Metrics
    const dp = calculateDewPoint(data.t, data.h);
    els.dew.textContent = dp.toFixed(1);

    const hi = calculateHeatIndex(data.t, data.h);
    els.feelsLike.textContent = hi.toFixed(1);

    const absHum = calculateAbsoluteHumidity(data.t, data.h);
    els.absHum.textContent = absHum.toFixed(1) + " g/m³";

    // Mold Risk
    let risk = "Low";
    let riskColor = "#10b981";
    if (data.h > 60 && data.t > 20) { risk = "Medium"; riskColor = "#f59e0b"; }
    if (data.h > 75 && data.t > 25) { risk = "High"; riskColor = "#ef4444"; }
    els.mold.textContent = risk;
    els.mold.style.color = riskColor;

    // Comfort
    let comfort = "Comfortable";
    if (data.t < 18) comfort = "Chilly";
    if (data.t > 26) comfort = "Warm";
    if (data.h > 65) comfort += " & Humid";
    els.comfort.textContent = comfort;

    // Rain Alert
    checkRainAlert(data);
}

// ================= RAIN ALERT SYSTEM =================
const WEATHER_API = "https://api.open-meteo.com/v1/forecast?latitude=12.76&longitude=75.20&current_weather=true";
let forecastRain = false;
let lastWeatherCheck = 0;

async function checkRainAlert(currentData) {
    const now = Date.now();

    if (now - lastWeatherCheck > 15 * 60 * 1000) {
        try {
            const res = await fetch(WEATHER_API);
            const data = await res.json();
            const code = data.current_weather.weathercode;
            forecastRain = (code >= 50 && code <= 67) || (code >= 80 && code <= 99);

            const rainText = forecastRain ? "Rain Predicted" : "No Rain Predicted";
            document.getElementById('insight-rain-sub').textContent = `Forecast: ${rainText}`;
            lastWeatherCheck = now;
        } catch (e) {
            console.error("Weather API Error", e);
        }
    }

    const thirtyMinsAgo = new Date(currentData.ts.getTime() - 30 * 60000);
    const oldData = historicalData.find(d => d.ts >= thirtyMinsAgo);

    let localTrend = false;
    if (oldData) {
        const humRise = currentData.h - oldData.h;
        const tempDrop = oldData.t - currentData.t;
        if (humRise > 5 && tempDrop > 0.5) {
            localTrend = true;
        }
    }

    const alertCard = document.getElementById('alert-card');
    const alertVal = document.getElementById('insight-rain');

    if (forecastRain && localTrend) {
        alertVal.textContent = "HIGH RISK";
        alertVal.style.color = "#ef4444";
        alertCard.classList.add('alert-active');
    } else if (forecastRain) {
        alertVal.textContent = "Moderate Risk";
        alertVal.style.color = "#f59e0b";
        alertCard.classList.remove('alert-active');
    } else if (localTrend) {
        alertVal.textContent = "Local Spike";
        alertVal.style.color = "#f59e0b";
        alertCard.classList.remove('alert-active');
    } else {
        alertVal.textContent = "Low Risk";
        alertVal.style.color = "#10b981";
        alertCard.classList.remove('alert-active');
    }
}

// ================= PHYSICS FORMULAS =================
function calculateDewPoint(T, RH) {
    const a = 17.27;
    const b = 237.7;
    const alpha = ((a * T) / (b + T)) + Math.log(RH / 100.0);
    return (b * alpha) / (a - alpha);
}

function calculateHeatIndex(T, RH) {
    if (T < 20) return T;
    const c1 = -8.78469475556;
    const c2 = 1.61139411;
    const c3 = 2.33854883889;
    const c4 = -0.14611605;
    const c5 = -0.012308094;
    const c6 = -0.0164248277778;
    const c7 = 0.002211732;
    const c8 = 0.00072546;
    const c9 = -0.000003582;
    return c1 + c2 * T + c3 * RH + c4 * T * RH + c5 * T * T + c6 * RH * RH + c7 * T * T * RH + c8 * T * RH * RH + c9 * T * T * RH * RH;
}

function calculateAbsoluteHumidity(T, RH) {
    return (6.112 * Math.exp((17.67 * T) / (T + 243.5)) * RH * 2.1674) / (273.15 + T);
}

// Chart range controls (placeholder functions)
function setRange(range) {
    console.log('Set range to:', range);
    // You can implement filtering of historicalData here
}