const API =
  location.port === "5500"
    ? "http://127.0.0.1:5000/api"
    : "/api";

let autoTimer = null;
let autoIndex = 0;

const workloadPatterns = {
  default: [100, 180, 300, 450, 600, 800, 650, 400, 220, 120],
  spike: [100, 100, 150, 200, 900, 900, 900, 300, 150, 100],
  gradual: [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000],
  daily: [100, 150, 250, 400, 600, 800, 900, 700, 450, 250, 150, 100]
};

function getNextWorkload() {

  const pattern = document.getElementById("pattern").value;

  if (pattern === "random") {
    return Math.floor(Math.random() * 851) + 50;
  }

  const list = workloadPatterns[pattern];

  const value = list[autoIndex % list.length];

  autoIndex++;

  return value;
}

async function api(path, options = {}) {
  const response = await fetch(API + path, options);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}


// -----------------------------
// Check Backend Connection
// -----------------------------
async function checkBackend() {
  try {
    await api("/health");

    document.getElementById("status").textContent = "Backend: connected";
    document.getElementById("status").className = "status online";

  } catch {
    document.getElementById("status").textContent = "Backend: offline";
    document.getElementById("status").className = "status";
  }
}


// -----------------------------
// Update Main Dashboard Cards
// -----------------------------
function updateCards(row) {

  if (!row) return;

  document.getElementById("servers").textContent = row.servers;
  document.getElementById("cpu").textContent = row.cpu + "%";
  document.getElementById("memory").textContent = row.memory + "%";
  document.getElementById("latency").textContent = row.latency + " ms";
  document.getElementById("throughput").textContent = row.throughput;
  document.getElementById("network").textContent = row.network + "%";
}


// -----------------------------
// Load Statistics
// -----------------------------
async function loadStats() {

  try {

    const stats = await api("/stats");

    document.getElementById("totalRuns").textContent = stats.total_runs;

    document.getElementById("avgCpu").textContent =
      Number(stats.avg_cpu).toFixed(2) + "%";

    document.getElementById("avgMemory").textContent =
      Number(stats.avg_memory).toFixed(2) + "%";

    document.getElementById("avgLatency").textContent =
      Number(stats.avg_latency).toFixed(2) + " ms";

    document.getElementById("maxServers").textContent = stats.max_servers;

    document.getElementById("totalCost").textContent =
      Number(stats.total_cost).toFixed(2);

  } catch (error) {

    console.error("Statistics error:", error);

  }
}


// -----------------------------
// Show Latest Scaling Decision
// -----------------------------
function showDecision(latest, previous) {

  const box = document.getElementById("decisionBox");

  if (!latest) {
    box.textContent = "No decision yet. Run a simulation.";
    return;
  }

  const before = previous ? previous.servers : 2;

  let cls = "maintain";
  if (latest.action === "Scale Out") cls = "out";
  if (latest.action === "Scale In") cls = "in";

  box.innerHTML = `
    <div class="badge ${cls}">${latest.action}</div>
    <div class="decision-item">
      <span>Servers</span>
      <strong>${before} → ${latest.servers}</strong>
    </div>
    <div class="decision-item">
      <span>Traffic</span>
      <strong>${latest.traffic}</strong>
    </div>
    <div class="decision-item">
      <span>Reason</span>
      <strong>${latest.reason}</strong>
    </div>
  `;
}


// -----------------------------
// Charts
// -----------------------------
const charts = {};

const ACTION_COLORS = {
  "Scale Out": "#dc2626",
  "Scale In": "#16a34a",
  "Maintain": "#64748b"
};

function makeLine(label, data, color, extra = {}) {
  return Object.assign({
    label: label,
    data: data,
    borderColor: color,
    backgroundColor: color,
    borderWidth: 2,
    tension: 0.25,
    pointRadius: 3
  }, extra);
}

function limitLine(label, value, count, color) {
  return {
    label: label,
    data: Array(count).fill(value),
    borderColor: color,
    borderWidth: 1.5,
    borderDash: [6, 4],
    pointRadius: 0,
    fill: false
  };
}

function drawChart(canvasId, title, labels, datasets, yOptions = {}) {

  if (charts[canvasId]) {
    charts[canvasId].destroy();
  }

  charts[canvasId] = new Chart(
    document.getElementById(canvasId),
    {
      type: "line",

      data: {
        labels: labels,
        datasets: datasets
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: "index", intersect: false },

        plugins: {
          title: {
            display: true,
            text: title,
            font: { size: 14, weight: "bold" },
            color: "#16263d"
          },
          legend: {
            labels: { boxWidth: 12, font: { size: 11 } }
          }
        },

        scales: {
          x: {
            ticks: { maxTicksLimit: 6, maxRotation: 0, font: { size: 10 } },
            grid: { display: false }
          },
          y: Object.assign({ beginAtZero: true }, yOptions)
        }
      }
    }
  );
}

function renderCharts(rows) {

  const data = [...rows].reverse();

  const labels = data.map(r => r.timestamp.slice(11));

  const n = data.length;

  const dotColors = data.map(
    r => ACTION_COLORS[r.action] || "#64748b"
  );

  const dots = {
    pointBackgroundColor: dotColors,
    pointBorderColor: dotColors,
    pointRadius: 4
  };

  drawChart("chartCpu", "CPU Utilization (%)", labels, [
    makeLine("CPU %", data.map(r => r.cpu), "#2f6f9f", dots),
    limitLine("Scale-out limit 75%", 75, n, "#dc2626"),
    limitLine("Scale-in limit 30%", 30, n, "#16a34a")
  ], { max: 100 });

  drawChart("chartMemory", "Memory Utilization (%)", labels, [
    makeLine("Memory %", data.map(r => r.memory), "#3d86b8", dots),
    limitLine("Scale-out limit 75%", 75, n, "#dc2626"),
    limitLine("Scale-in limit 45%", 45, n, "#16a34a")
  ], { max: 100 });

  drawChart("chartLatency", "Latency (ms)", labels, [
    makeLine("Latency ms", data.map(r => r.latency), "#1f3556", dots),
    limitLine("SLA / scale-out limit 250 ms", 250, n, "#dc2626"),
    limitLine("Scale-in limit 130 ms", 130, n, "#16a34a")
  ]);

  drawChart("chartServers", "Active Servers (after scaling)", labels, [
    makeLine("Servers", data.map(r => r.servers), "#1f3556",
      Object.assign({ stepped: true }, dots))
  ], { min: 0, max: 10, ticks: { stepSize: 1 } });

  drawChart("chartTraffic", "Traffic vs Capacity", labels, [
    makeLine("Traffic", data.map(r => r.traffic), "#2aa198"),
    makeLine(
      "Capacity before scaling (servers x 200)",
      data.map((r, i) => (i > 0 ? data[i - 1].servers : 2) * 200),
      "#1f3556",
      { stepped: true, borderDash: [6, 4], pointRadius: 0 }
    )
  ]);

  let runningCost = 0;

  drawChart("chartCost", "Cumulative Cost", labels, [
    makeLine(
      "Total cost",
      data.map(r => {
        runningCost += r.cost;
        return Math.round(runningCost * 100) / 100;
      }),
      "#7b8aa0"
    )
  ]);

  drawChart("chartThroughput", "Throughput", labels, [
    makeLine("Throughput", data.map(r => r.throughput), "#3d86b8")
  ]);

  drawChart("chartNetwork", "Network Utilization (%)", labels, [
    makeLine("Network %", data.map(r => r.network), "#2aa198")
  ], { max: 100 });
}

// -----------------------------
// Cloud Instances Panel
// -----------------------------
function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function loadCloud() {

  const box = document.getElementById("cloudBox");

  if (!box) return;

  try {

    const c = await api("/cloud");

    if (c.mode !== "emulator") {

      box.innerHTML =
        `<div class="cloud-note">Cloud adapter is off.${
          c.error ? " Reason: " + esc(c.error) : ""
        }</div>`;

      return;
    }

    const chips = c.instances
      .map(id => `<span class="chip">${esc(id)}</span>`)
      .join("");

    const eventRows = c.events.length
      ? c.events.map(e => `
          <tr>
            <td>${esc(e.time)}</td>
            <td><b>${e.action === "launch" ? "Launched" : "Terminated"}</b></td>
            <td>${e.instances.map(esc).join(", ")}</td>
          </tr>`).join("")
      : `<tr><td colspan="3">No events yet.</td></tr>`;

    box.innerHTML = `
      <div class="cloud-meta">
        <div class="decision-item">
          <span>Provider</span><strong>${esc(c.provider)}</strong>
        </div>
        <div class="decision-item">
          <span>Region</span><strong>${esc(c.region)}</strong>
        </div>
        <div class="decision-item">
          <span>Running instances</span><strong>${c.instances.length}</strong>
        </div>
      </div>

      <div class="chip-row">${chips}</div>

      <table class="compare-table cloud-events">
        <thead>
          <tr><th>Time</th><th>Action</th><th>Instances</th></tr>
        </thead>
        <tbody>${eventRows}</tbody>
      </table>

      <p class="cloud-note">
        Scale Out launches an instance and Scale In terminates one through the
        AWS EC2 API (boto3). The instances live in a local AWS emulator, so no
        real AWS resources are created.
      </p>
    `;

  } catch (error) {

    box.textContent = "Cloud status unavailable: " + error.message;

  }
}
// -----------------------------
// Display History
// -----------------------------
function renderHistory(rows) {

  const body = document.getElementById("history");

  body.innerHTML = rows.map(r => `
    <tr>
      <td>${r.timestamp}</td>
      <td>${r.traffic}</td>
      <td>${r.cpu}</td>
      <td>${r.memory}</td>
      <td>${r.latency}</td>
      <td>${r.response_time}</td>
      <td>${r.throughput}</td>
      <td>${r.network}</td>
      <td>${r.servers}</td>
      <td>$${r.cost}</td>
      <td><b>${r.action}</b></td>
    </tr>
  `).join("");

  if (rows.length) {
    updateCards(rows[0]);
    showDecision(rows[0], rows[1]);
  } else {
    showDecision(null, null);
  }

  renderCharts(rows);
}


// -----------------------------
// Load History
// -----------------------------
async function loadHistory() {

  try {

    const rows = await api("/simulations?limit=50");

    renderHistory(rows);

    await loadStats();
    
    await loadCloud();

  } catch (error) {

    console.error("History error:", error);

  }
}


// -----------------------------
// Manual Simulation
// -----------------------------
document
  .getElementById("simulationForm")
  .addEventListener("submit", async (e) => {

    e.preventDefault();

    const traffic = Number(document.getElementById("traffic").value);

    try {

      const result = await api("/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traffic: traffic })
      });

      updateCards(result);

      document.getElementById("result").innerHTML =
        `<b>${result.action}</b> — ${result.reason}`;

      await loadHistory();

    } catch (error) {

      document.getElementById("result").textContent =
        "Error: " + error.message;

    }

  });


// -----------------------------
// Refresh Button
// -----------------------------
document
  .getElementById("refreshBtn")
  .addEventListener("click", loadHistory);


// -----------------------------
// Clear History
// -----------------------------
document
  .getElementById("clearBtn")
  .addEventListener("click", async () => {

    try {

      await api("/simulations", { method: "DELETE" });

      document.getElementById("result").textContent =
        "History cleared. Server count reset to 2.";

      await loadHistory();

    } catch (error) {

      document.getElementById("result").textContent =
        "Error: " + error.message;

    }

  });


// -----------------------------
// Automatic Simulation
// -----------------------------
async function runAutomaticSimulation() {

  if (autoTimer) return;

  document.getElementById("result").textContent =
    "Automatic workload simulation is running...";

  const run = async () => {

    const traffic = getNextWorkload();

    document.getElementById("traffic").value = traffic;

    try {

      const result = await api("/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traffic: traffic })
      });

      updateCards(result);

      document.getElementById("result").innerHTML =
        `<b>Automatic Simulation:</b> ${result.action} — ${result.reason}`;

      await loadHistory();

    } catch (error) {

      document.getElementById("result").textContent =
        "Error: " + error.message;

      stopAutomaticSimulation();

    }

  };

  await run();

  autoTimer = setInterval(run, 3000);
}


// -----------------------------
// Stop Automatic Simulation
// -----------------------------
function stopAutomaticSimulation() {

  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }

  document.getElementById("result").textContent =
    "Automatic simulation stopped.";
}

document
  .getElementById("startBtn")
  .addEventListener("click", runAutomaticSimulation);

document
  .getElementById("stopBtn")
  .addEventListener("click", stopAutomaticSimulation);


// -----------------------------
// Auto-Scaling vs Fixed Servers
// -----------------------------
function getPatternWorkloads() {

  const pattern = document.getElementById("pattern").value;

  if (pattern === "random") {
    return Array.from(
      { length: 10 },
      () => Math.floor(Math.random() * 851) + 50
    );
  }

  return workloadPatterns[pattern];
}

async function runComparison() {

  const box = document.getElementById("compareResult");

  const fixed = Number(document.getElementById("fixedServers").value);

  const workloads = getPatternWorkloads();

  try {

    const r = await api("/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workloads: workloads,
        fixed_servers: fixed
      })
    });

    const a = r.auto;
    const f = r.fixed;

    const saving = f.total_cost > 0
      ? ((f.total_cost - a.total_cost) / f.total_cost) * 100
      : 0;

    box.innerHTML = `
      <div><b>Workload:</b> ${r.workloads.join(", ")}</div>
      <table class="compare-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Auto-Scaling</th>
            <th>Fixed (${r.fixed_servers} servers)</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Total Cost</td><td>${a.total_cost}</td><td>${f.total_cost}</td></tr>
          <tr><td>Average Servers</td><td>${a.avg_servers}</td><td>${f.avg_servers}</td></tr>
          <tr><td>Maximum Servers</td><td>${a.max_servers}</td><td>${f.max_servers}</td></tr>
          <tr><td>Average CPU %</td><td>${a.avg_cpu}</td><td>${f.avg_cpu}</td></tr>
          <tr><td>Average Latency (ms)</td><td>${a.avg_latency}</td><td>${f.avg_latency}</td></tr>
          <tr><td>Maximum Latency (ms)</td><td>${a.max_latency}</td><td>${f.max_latency}</td></tr>
          <tr><td>SLA Violations (latency &gt; 250 ms)</td><td>${a.sla_violations}</td><td>${f.sla_violations}</td></tr>
        </tbody>
      </table>
      <div class="verdict">
        Auto-scaling cost ${Math.abs(saving).toFixed(1)}%
        ${saving >= 0 ? "less" : "more"} than ${r.fixed_servers} fixed servers,
        with ${a.sla_violations} vs ${f.sla_violations} SLA violations.
      </div>
    `;

  } catch (error) {

    box.textContent = "Error: " + error.message;

  }
}

document
  .getElementById("compareBtn")
  .addEventListener("click", runComparison);


// -----------------------------
// Pattern Selector
// -----------------------------
document
  .getElementById("pattern")
  .addEventListener("change", () => {
    autoIndex = 0;
  });


// -----------------------------
// Start Application
// -----------------------------
checkBackend();
loadHistory();
