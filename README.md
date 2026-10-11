# Auto-Scaling Simulator for Dynamic Cloud Resource Allocation

**Course:** CSI3001 – Cloud Computing Methodologies
**Student:** Varshini (24MID0257)

A web-based dashboard that simulates cloud auto-scaling. It accepts traffic values, calculates simulated resource utilisation, and decides whether to **Scale Out**, **Scale In** or **Maintain** the number of servers.

> **Important:** this is a functional **simulation**. CPU, memory, latency, throughput and network values are calculated by formulas. The project does not currently create or delete servers on AWS, Azure or any other cloud provider.

## How it works

```
Traffic -> Utilisation (CPU, memory, latency) -> Threshold comparison
        -> Scale Out / Maintain / Scale In -> Server count updated
        -> Stored in SQLite -> Statistics, history and charts on the dashboard
```

## Scaling policy

| Setting | Value |
|---|---|
| Minimum / maximum servers | 1 / 10 |
| Capacity per server | 200 traffic units |
| **Scale Out** | CPU > 75% **OR** Memory > 75% **OR** Latency > 250 ms |
| **Scale In** | CPU < 30% **AND** Memory < 45% **AND** Latency < 130 ms (and servers > 1) |
| **Maintain** | Otherwise |
| Cost | 0.05 per server per step |

## Features

- Manual simulation and automatic simulation with selectable workload patterns (default, sudden spike, gradual increase, daily pattern, random)
- Latest scaling decision panel (action, servers before and after, reason)
- Auto-scaling vs fixed-servers comparison (cost, latency, SLA violations)
- Eight performance charts with policy limit lines (CPU, memory, latency, servers, traffic vs capacity, cost, throughput, network)
- Statistics cards, simulation history table and CSV export
- The server count is restored from the database after a backend restart

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, JavaScript, Chart.js |
| Backend | Python, Flask, Flask-CORS |
| Database | SQLite |
| Communication | REST API, JSON, Fetch API |

## Architecture

```
User -> Web dashboard (HTML/CSS/JS) -> Fetch API -> Flask REST API
     -> Python scaling engine -> SQLite database -> Statistics and history -> Dashboard
```

The frontend never connects to SQLite directly. It talks only to the Flask REST API.

## REST API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Backend status |
| GET | `/api/state` | Current server count and limits |
| POST | `/api/simulate` | Run one simulation, body: `{"traffic": 500}` |
| GET | `/api/simulations` | Stored simulation history |
| GET | `/api/stats` | Totals and averages |
| DELETE | `/api/simulations` | Clear history and reset servers to 2 |
| POST | `/api/compare` | Compare auto-scaling with a fixed server count |

## Project structure

```
backend/
  app.py                    Flask REST API
  database/db.py            SQLite connection and table creation
  services/scaling_engine.py  Metrics, scaling decisions, comparison
frontend/
  index.html, app.js, style.css
database/
requirements.txt
start_project.bat           Windows helper that starts both servers
```

## Run locally

1. Install the packages once: `py -m pip install -r requirements.txt` (use `python` if `py` is not available)
2. Start the backend:
```
   cd backend
   py app.py
```
3. Start the frontend in a second terminal:
```
   cd frontend
   py -m http.server 5500
```
4. Open http://127.0.0.1:5500

On Windows you can also double-click `start_project.bat`.

## Limitations

- Metrics are simulated, not measured from real servers.
- No real cloud resources are created or deleted.
- Scaling changes one server per step, so sudden spikes can cause temporary SLA violations.

## Future work

- Integrate the AWS EC2 API (launch on Scale Out, terminate on Scale In)
- Read real utilisation from cloud monitoring (for example CloudWatch)
- Predictive scaling using workload forecasting
- Editable scaling policy and cooldown period
- Cloud deployment