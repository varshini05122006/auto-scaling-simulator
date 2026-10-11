from flask import Flask, jsonify, request
from flask_cors import CORS
from database.db import init_db, get_connection
from services.scaling_engine import (
    run_simulation, get_current_state, reset_state,
    compare_workloads, MAX_SERVERS
)

app = Flask(__name__)
CORS(app)
init_db()


@app.get("/api/health")
def health():
    return jsonify({"status": "running", "service": "auto-scaling-backend"})


@app.get("/api/state")
def state():
    return jsonify(get_current_state())


@app.post("/api/simulate")
def simulate():
    data = request.get_json(silent=True) or {}

    try:
        traffic = int(data.get("traffic", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "traffic must be an integer"}), 400

    if traffic < 0:
        return jsonify({"error": "traffic cannot be negative"}), 400

    result = run_simulation(traffic)
    return jsonify(result), 201


@app.get("/api/simulations")
def simulations():
    limit = min(int(request.args.get("limit", 50)), 200)

    con = get_connection()

    rows = con.execute("""
        SELECT id, timestamp, traffic, cpu, memory, latency, response_time,
               throughput, network, servers, cost, action, reason
        FROM simulations
        ORDER BY id DESC
        LIMIT ?
    """, (limit,)).fetchall()

    con.close()

    return jsonify([dict(row) for row in rows])


@app.get("/api/stats")
def stats():

    con = get_connection()

    row = con.execute("""
        SELECT
          COUNT(*) AS total_runs,
          COALESCE(AVG(cpu),0) AS avg_cpu,
          COALESCE(AVG(memory),0) AS avg_memory,
          COALESCE(AVG(latency),0) AS avg_latency,
          COALESCE(MAX(servers),0) AS max_servers,
          COALESCE(SUM(cost),0) AS total_cost
        FROM simulations
    """).fetchone()

    con.close()

    return jsonify(dict(row))


@app.delete("/api/simulations")
def clear_history():

    reset_state()

    con = get_connection()

    con.execute("DELETE FROM simulations")

    con.commit()
    con.close()

    return jsonify({
        "message": "Simulation history cleared",
        "servers": get_current_state()["servers"]
    })


@app.post("/api/compare")
def compare():
    data = request.get_json(silent=True) or {}

    try:
        workloads = [int(x) for x in data.get("workloads", [])]
        fixed = int(data.get("fixed_servers", 5))
    except (TypeError, ValueError):
        return jsonify({
            "error": "workloads must be a list of integers and fixed_servers an integer"
        }), 400

    if not workloads or len(workloads) > 100 or any(w < 0 for w in workloads):
        return jsonify({"error": "provide 1 to 100 non-negative workload values"}), 400

    if fixed < 1 or fixed > MAX_SERVERS:
        return jsonify({"error": f"fixed_servers must be between 1 and {MAX_SERVERS}"}), 400

    return jsonify(compare_workloads(workloads, fixed))


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )
