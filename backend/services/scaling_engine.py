from datetime import datetime
from database.db import get_connection

MIN_SERVERS = 1
MAX_SERVERS = 10
CAPACITY_PER_SERVER = 200

CPU_HIGH = 75
MEMORY_HIGH = 75
LATENCY_HIGH = 250

CPU_LOW = 30
MEMORY_LOW = 45
LATENCY_LOW = 130

COST_PER_SERVER = 0.05

def _load_last_servers():
    try:
        con = get_connection()
        row = con.execute(
            "SELECT servers FROM simulations ORDER BY id DESC LIMIT 1"
        ).fetchone()
        con.close()
        if row:
            return int(row["servers"])
    except Exception:
        pass
    return 2


_state = {"servers": _load_last_servers()}


def calculate_metrics(traffic, servers):

    capacity = max(1, servers * CAPACITY_PER_SERVER)

    cpu = min(100, round((traffic / capacity) * 100, 2))

    memory = min(100, round(25 + (traffic / capacity) * 60, 2))

    latency = round(60 + (traffic / capacity) * 240, 2)

    response_time = round(latency + 20, 2)

    throughput = round(
        min(traffic, capacity) / max(response_time / 1000, 0.001),
        2
    )

    network = round(min(100, (traffic / capacity) * 70), 2)

    cost = round(servers * COST_PER_SERVER, 2)

    return {
        "cpu": cpu,
        "memory": memory,
        "latency": latency,
        "response_time": response_time,
        "throughput": throughput,
        "network": network,
        "cost": cost
    }


def decide_action(metrics, servers):

    reasons = []

    if metrics["cpu"] > CPU_HIGH:
        reasons.append("CPU utilization exceeded 75%")

    if metrics["memory"] > MEMORY_HIGH:
        reasons.append("memory utilization exceeded 75%")

    if metrics["latency"] > LATENCY_HIGH:
        reasons.append("latency exceeded 250 ms")

    if reasons and servers < MAX_SERVERS:
        return ("Scale Out", "; ".join(reasons), servers + 1)

    if (
        metrics["cpu"] < CPU_LOW
        and metrics["memory"] < MEMORY_LOW
        and metrics["latency"] < LATENCY_LOW
        and servers > MIN_SERVERS
    ):
        return (
            "Scale In",
            "CPU, memory and latency are all low",
            servers - 1
        )

    if reasons:
        return (
            "Maintain",
            f"Load is high but the maximum of {MAX_SERVERS} servers is already running",
            servers
        )
    return (
        "Maintain",
        "Metrics are within the configured operating range",
        servers
    )


def run_simulation(traffic):

    before = _state["servers"]

    metrics = calculate_metrics(traffic, before)

    action, reason, after = decide_action(metrics, before)

    _state["servers"] = after

    metrics["cost"] = round(after * COST_PER_SERVER, 2)

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    con = get_connection()

    cur = con.execute("""
        INSERT INTO simulations(
            timestamp, traffic, cpu, memory, latency, response_time,
            throughput, network, servers, cost, action, reason
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        timestamp,
        traffic,
        metrics["cpu"],
        metrics["memory"],
        metrics["latency"],
        metrics["response_time"],
        metrics["throughput"],
        metrics["network"],
        after,
        metrics["cost"],
        action,
        reason
    ))

    con.commit()

    simulation_id = cur.lastrowid

    con.close()

    return {
        "id": simulation_id,
        "timestamp": timestamp,
        "traffic": traffic,
        **metrics,
        "servers": after,
        "action": action,
        "reason": reason
    }


def get_current_state():

    return {
        "servers": _state["servers"],
        "limits": {
            "min_servers": MIN_SERVERS,
            "max_servers": MAX_SERVERS,
            "cpu_high": CPU_HIGH,
            "memory_high": MEMORY_HIGH,
            "latency_high": LATENCY_HIGH
        }
    }


def reset_state():
    _state["servers"] = 2


def compare_workloads(workloads, fixed_servers):

    def summarize(rows):
        n = len(rows)
        return {
            "total_cost": round(sum(r["cost"] for r in rows), 2),
            "avg_cpu": round(sum(r["cpu"] for r in rows) / n, 2),
            "avg_latency": round(sum(r["latency"] for r in rows) / n, 2),
            "max_latency": max(r["latency"] for r in rows),
            "sla_violations": sum(
                1 for r in rows if r["latency"] > LATENCY_HIGH
            ),
            "avg_servers": round(sum(r["servers"] for r in rows) / n, 2),
            "max_servers": max(r["servers"] for r in rows)
        }

    auto_rows = []
    fixed_rows = []
    servers = 2

    for traffic in workloads:

        m = calculate_metrics(traffic, servers)
        action, reason, after = decide_action(m, servers)

        auto_rows.append({
            "cpu": m["cpu"],
            "latency": m["latency"],
            "servers": after,
            "cost": round(after * COST_PER_SERVER, 2)
        })

        servers = after

        fm = calculate_metrics(traffic, fixed_servers)

        fixed_rows.append({
            "cpu": fm["cpu"],
            "latency": fm["latency"],
            "servers": fixed_servers,
            "cost": round(fixed_servers * COST_PER_SERVER, 2)
        })

    return {
        "workloads": workloads,
        "fixed_servers": fixed_servers,
        "auto": summarize(auto_rows),
        "fixed": summarize(fixed_rows)
    }
