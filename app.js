// EcoSense Dashboard - Clean Working Version
// This version is specifically designed for your Firebase format

const CONFIG = {
    demoMode: false,
    updateInterval: 60000, // 1 minute in milliseconds (60 seconds)
    firebaseUrl: "https://ecosense-b00a7-default-rtdb.asia-southeast1.firebasedatabase.app/readings.json"
};

let chart;
let historicalData = [];
let firebaseInterval;
let lastProcessedTimestamp = 0; // Track last processed data

// Get all DOM elements
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

// Start when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 EcoSense Dashboard Starting...');
    
    initChart();
    
    const savedDemo = localStorage.getItem('demoMode') === 'true';
    els.demoToggle.checked = savedDemo;
    CONFIG.demoMode = savedDemo;
    
    if (CONFIG.demoMode) {
        startSimulation();
    } else {
        startFirebaseFetching();
    }
    
    els.demoToggle.addEventListener('change', (e) => {
        CONFIG.demoMode = e.target.checked;
        localStorage.setItem('demoMode', CONFIG.demoMode);
        location.reload(); // Simple reload for mode change
    });
});

// ========== FIREBASE FUNCTIONS ==========
async function startFirebaseFetching() {
    console.log('📡 Starting Firebase data fetching...');
    els.status.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connecting...';
    
    // First load: get initial history (last 50 readings)
    await fetchInitialHistory();
    
    // Then start regular updates (every 1 minute, averaging new data)
    firebaseInterval = setInterval(fetchFirebaseData, CONFIG.updateInterval);
}

function stopFirebaseFetching() {
    if (firebaseInterval) {
        clearInterval(firebaseInterval);
    }
}

async function fetchInitialHistory() {
    console.log('📚 Loading initial history...');
    
    try {
        const response = await fetch(CONFIG.firebaseUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data || Object.keys(data).length === 0) {
            console.log('⚠️ No data in Firebase yet');
            els.status.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> No Data';
            return;
        }
        
        // Convert to array
        const allReadings = Object.entries(data).map(([key, value]) => ({
            id: key,
            ...value
        }));
        
        // Filter valid readings
        const validReadings = allReadings.filter(r => 
            r.temperature !== undefined && 
            r.humidity !== undefined &&
            r.temperature !== 0 &&
            r.humidity !== 0
        );
        
        // Sort by timestamp (newest first)
        validReadings.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        
        // Take last 50 readings
        const recentReadings = validReadings.slice(0, 50);
        
        // Convert to our format
        historicalData = recentReadings.map(r => {
            let ts;
            if (r.timestamp < 946684800000) {
                ts = new Date(r.timestamp * 1000);
            } else {
                ts = new Date(r.timestamp);
            }
            
            return {
                t: r.temperature,
                h: r.humidity,
                v: 3300,
                ts: ts,
                rssi: r.rssi || 0,
                count: 1
            };
        });
        
        // Sort by time (oldest to newest)
        historicalData.sort((a, b) => a.ts - b.ts);
        
        console.log('✅ Loaded', historicalData.length, 'historical readings');
        
        if (historicalData.length > 0) {
            const latest = historicalData[historicalData.length - 1];
            
            // Set lastProcessedTimestamp to the latest reading
            if (validReadings[0].timestamp) {
                lastProcessedTimestamp = validReadings[0].timestamp;
            }
            
            console.log('🌡️ Latest historical reading:', {
                temp: latest.t.toFixed(1),
                hum: latest.h.toFixed(1),
                time: latest.ts.toLocaleString()
            });
            
            // Update UI
            const lastTime = latest.ts.toLocaleTimeString();
            els.status.innerHTML = `<i class="fa-solid fa-circle-check"></i> Live | ${lastTime}`;
            
            updateUI(latest);
            updateChart();
            
            console.log('✅ Initial display ready!');
        }
        
    } catch (error) {
        console.error('❌ Initial load error:', error);
        els.status.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Error';
    }
}

async function fetchFirebaseData() {
    console.log('⬇️ Checking for new data...');
    
    try {
        const response = await fetch(CONFIG.firebaseUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data || Object.keys(data).length === 0) {
            console.log('⚠️ No data in Firebase yet');
            return;
        }
        
        console.log('✅ Data received! Processing new readings...');
        processData(data);
        
    } catch (error) {
        console.error('❌ Fetch error:', error);
        els.status.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Error';
    }
}

function processData(firebaseData) {
    // Convert Firebase object to array
    const allReadings = Object.entries(firebaseData).map(([key, value]) => ({
        id: key,
        ...value
    }));
    
    console.log('📊 Total readings in Firebase:', allReadings.length);
    
    // Filter: only keep readings with temperature and humidity
    const validReadings = allReadings.filter(r => 
        r.temperature !== undefined && 
        r.humidity !== undefined &&
        r.temperature !== 0 &&
        r.humidity !== 0 &&
        r.timestamp > lastProcessedTimestamp // Only new readings
    );
    
    console.log('✅ Valid NEW readings since last check:', validReadings.length);
    
    if (validReadings.length === 0) {
        console.log('⚠️ No new readings since last update');
        return;
    }
    
    // Calculate AVERAGE of all new readings
    let sumTemp = 0;
    let sumHum = 0;
    let sumRssi = 0;
    let maxTimestamp = 0;
    
    validReadings.forEach(r => {
        sumTemp += r.temperature;
        sumHum += r.humidity;
        sumRssi += (r.rssi || 0);
        if (r.timestamp > maxTimestamp) {
            maxTimestamp = r.timestamp;
        }
    });
    
    const avgTemp = sumTemp / validReadings.length;
    const avgHum = sumHum / validReadings.length;
    const avgRssi = sumRssi / validReadings.length;
    
    console.log('📈 Average of', validReadings.length, 'readings:');
    console.log('   Temp:', avgTemp.toFixed(2), '°C');
    console.log('   Humidity:', avgHum.toFixed(2), '%');
    
    // Update last processed timestamp
    lastProcessedTimestamp = maxTimestamp;
    
    // Fix timestamp: convert from seconds to milliseconds if needed
    let ts;
    if (maxTimestamp < 946684800000) {
        ts = new Date(maxTimestamp * 1000);
    } else {
        ts = new Date(maxTimestamp);
    }
    
    // Create averaged data point
    const averagedReading = {
        t: avgTemp,
        h: avgHum,
        v: 3300,
        ts: ts,
        rssi: avgRssi,
        count: validReadings.length // How many readings were averaged
    };
    
    // Add to historical data
    historicalData.push(averagedReading);
    
    // Keep only last 50 data points
    if (historicalData.length > 50) {
        historicalData.shift();
    }
    
    // Sort by time (oldest to newest for chart)
    historicalData.sort((a, b) => a.ts - b.ts);
    
    console.log('📊 Total data points in history:', historicalData.length);
    console.log('🌡️ Latest averaged reading:', {
        temp: averagedReading.t.toFixed(1),
        hum: averagedReading.h.toFixed(1),
        samples: averagedReading.count,
        time: ts.toLocaleString()
    });
    
    // Update the status bar
    const lastTime = ts.toLocaleTimeString();
    els.status.innerHTML = `<i class="fa-solid fa-circle-check"></i> Live | ${lastTime} (avg of ${averagedReading.count})`;
    
    // Update UI and chart
    updateUI(averagedReading);
    updateChart();
    
    console.log('✅ Website updated with averaged data!');
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

// ========== UI UPDATE ==========
function updateUI(data) {
    // Main values
    els.temp.textContent = data.t.toFixed(1);
    els.hum.textContent = data.h.toFixed(1);
    
    // Battery (fake calculation for now)
    const pct = Math.max(0, Math.min(100, (data.v - 3300) / (4200 - 3300) * 100));
    els.batt.textContent = Math.round(pct);
    els.voltage.textContent = Math.round(data.v);
    els.days.textContent = Math.round(pct * 5);
    
    // Calculated values
    const dewPoint = calculateDewPoint(data.t, data.h);
    els.dew.textContent = dewPoint.toFixed(1);
    
    const heatIndex = calculateHeatIndex(data.t, data.h);
    els.feelsLike.textContent = heatIndex.toFixed(1);
    
    const absHumidity = calculateAbsoluteHumidity(data.t, data.h);
    els.absHum.textContent = absHumidity.toFixed(1) + " g/m³";
    
    // Mold risk
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
    
    // Rain alert
    checkRainAlert(data);
}

// ========== CHART INITIALIZATION ==========
function initChart() {
    const ctx = document.getElementById('mainChart').getContext('2d');
    
    const gradientTemp = ctx.createLinearGradient(0, 0, 0, 400);
    gradientTemp.addColorStop(0, 'rgba(244, 63, 94, 0.5)');
    gradientTemp.addColorStop(1, 'rgba(244, 63, 94, 0)');
    
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
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#cbd5e1' } }
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

// ========== DEMO MODE ==========
let simInterval;
function startSimulation() {
    if (simInterval) clearInterval(simInterval);
    
    els.status.innerHTML = '<i class="fa-solid fa-circle-check"></i> Demo Mode';
    
    const now = new Date();
    historicalData = [];
    for (let i = 20; i > 0; i--) {
        historicalData.push({
            t: 22 + Math.sin(i) * 2 + Math.random(),
            h: 50 + Math.cos(i) * 5 + Math.random(),
            v: 4100 - (i * 2),
            ts: new Date(now.getTime() - i * 30 * 60000)
        });
    }
    
    updateUI(historicalData[historicalData.length - 1]);
    updateChart();
    
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

// ========== RAIN ALERT ==========
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
            
            const rainText = forecastRain ? "Rain Predicted" : "Clear";
            document.getElementById('insight-rain-sub').textContent = `Forecast: ${rainText}`;
            lastWeatherCheck = now;
        } catch (e) {
            console.error("Weather API Error", e);
        }
    }
    
    const alertCard = document.getElementById('alert-card');
    const alertVal = document.getElementById('insight-rain');
    
    if (forecastRain) {
        alertVal.textContent = "Moderate Risk";
        alertVal.style.color = "#f59e0b";
        alertCard.classList.remove('alert-active');
    } else {
        alertVal.textContent = "Low Risk";
        alertVal.style.color = "#10b981";
        alertCard.classList.remove('alert-active');
    }
}

// ========== CALCULATIONS ==========
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
    return c1 + c2*T + c3*RH + c4*T*RH + c5*T*T + c6*RH*RH + c7*T*T*RH + c8*T*RH*RH + c9*T*T*RH*RH;
}

function calculateAbsoluteHumidity(T, RH) {
    return (6.112 * Math.exp((17.67 * T) / (T + 243.5)) * RH * 2.1674) / (273.15 + T);
}

function setRange(range) {
    console.log('Range changed to:', range);
}
