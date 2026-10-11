# Auto-Scaling Simulator for Dynamic Cloud Resource Allocation

**Course:** CSI3001 – Cloud Computing Methodologies
**Student:** Varshini (24MID0257)

A web-based dashboard that simulates cloud auto-scaling. It accepts traffic values, calculates simulated resource utilisation, and decides whether to **Scale Out**, **Scale In** or **Maintain** the number of servers. A cloud adapter mirrors every scaling decision as EC2 launch and terminate calls through the AWS SDK (boto3).

> **Important:** this is a functional **simulation**. CPU, memory, latency, throughput and network values are calculated by formulas. The EC2 calls are made against **moto, a local AWS emulator**, so no real AWS resources are created and no AWS account or keys are used.

## How it works

```
Traffic -> Utilisation (CPU, memory, latency) -> Threshold comparison
        -> Scale Out / Maintain / Scale In -> Server count updated
        -> Cloud adapter: EC2 instances launched / terminated (emulator)
        -> Stored in SQLite -> Statistics, history and charts on the dashboard
```

## Scaling policy

| Setting | Value |
|---|---|
| Minimum / maximum servers | 1 / 10 |
| Capacity per server | 200 traffic units |
| **Scale Out** | CPU > 75% **OR** Memory > 75% **OR** Latency > 250 ms |
| **Scale In** | CPU < 30% **AND** Memory < 45% **AND** Latency < 130 ms (and servers > 1) |
| **Maintain** | Otherwise (including when the 10-server maximum is reached) |
| Cost | 0.05 per server per step |

## Features

- Manual simulation and automatic simulation with selectable workload patterns (default, sudden spike, gradual increase, daily pattern, random)
- Latest scaling decision panel (action, servers before and after, reason)
- Auto-scaling vs fixed-servers comparison (cost, latency, SLA violations)
- Eight performance charts with policy limit lines (CPU, memory, latency, servers, traffic vs capacity, cost, throughput, network)
- Cloud Instances panel: EC2 instances launched and terminated by the scaling decisions, with an event log
- Statistics cards, simulation history table and CSV export
- The server count is restored from the database after a backend restart

## Cloud integration

The scaling engine calls a small adapter (`backend/services/cloud_adapter.py`) after every decision. The adapter keeps the number of running EC2 instances equal to the simulated server count:

- **Scale Out** calls `run_instances` (launch)
- **Scale In** calls `terminate_instances` (terminate)

The calls use the real AWS SDK for Python (boto3). By default they run against **moto**, a local AWS emulator, which needs no account, keys or internet. If the adapter fails for any reason, the simulation keeps running and the error is shown in the status.

Set the environment variable `CLOUD_MODE=off` to disable the adapter.

Pointing the adapter at real AWS is future work. It would need an AWS account, limited IAM credentials and safety limits on the number of instances.

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, JavaScript, Chart.js |
| Backend | Python, Flask, Flask-CORS |
| Database | SQLite |
| Cloud API layer | boto3 with moto (local AWS emulator) |
| Communication | REST API, JSON, Fetch API |

## Architecture

```
User -> Web dashboard (HTML/CSS/JS) -> Fetch API -> Flask REST API
     -> Python scaling engine -> Cloud adapter (boto3 -> moto emulator)
     -> SQLite database -> Statistics and history -> Dashboard
```

The frontend never connects to SQLite directly. It talks only to the Flask REST API.

## REST API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Backend status |
| GET | `/api/state` | Current server count and limits |
| POST | `/api/simulate` | Run one simulation, body: `{"traffic": 500}` |
| GET | `/api/simulations` | Stored simulation history |
| GET |