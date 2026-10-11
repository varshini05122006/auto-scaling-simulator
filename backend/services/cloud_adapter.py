"""
Cloud adapter: keeps a set of EC2 instances in step with the simulated server count.

Mode "emulator" (default): uses the real AWS SDK (boto3) against moto, a local AWS
emulator. No AWS account, keys or internet are used and nothing real is created.
Mode "off": the adapter does nothing (set environment variable CLOUD_MODE=off).

The adapter never raises errors into the simulation: if anything fails, the
simulation continues and the error is reported in the status.
"""

import os
from datetime import datetime

CLOUD_MODE = os.environ.get("CLOUD_MODE", "emulator")
REGION = "ap-south-1"
MAX_INSTANCES = 10

_mock = None
_ec2 = None
_ami = None
_error = None
_events = []


def _init():
    global _mock, _ec2, _ami, _error

    if CLOUD_MODE != "emulator":
        return

    try:
        import boto3
        from moto import mock_aws

        _mock = mock_aws()
        _mock.start()

        _ec2 = boto3.client("ec2", region_name=REGION)
        _ami = _ec2.describe_images()["Images"][0]["ImageId"]

    except Exception as error:
        _ec2 = None
        _error = str(error)


def _running_ids():
    result = _ec2.describe_instances(
        Filters=[{"Name": "instance-state-name", "Values": ["running"]}]
    )

    found = []

    for reservation in result["Reservations"]:
        for instance in reservation["Instances"]:
            found.append((instance["LaunchTime"], instance["InstanceId"]))

    found.sort()

    return [item[1] for item in found]


def _log(action, ids):
    _events.append({
        "time": datetime.now().strftime("%H:%M:%S"),
        "action": action,
        "instances": ids
    })

    del _events[:-20]


def sync_instances(target):
    """Launch or terminate instances so that the running count equals target."""

    target = max(0, min(int(target), MAX_INSTANCES))

    result = {
        "mode": "emulator" if _ec2 is not None else "off",
        "running": 0,
        "launched": [],
        "terminated": [],
        "error": _error
    }

    if _ec2 is None:
        return result

    try:
        ids = _running_ids()

        if len(ids) < target:
            need = target - len(ids)

            response = _ec2.run_instances(
                ImageId=_ami,
                MinCount=need,
                MaxCount=need,
                InstanceType="t2.micro"
            )

            new_ids = [i["InstanceId"] for i in response["Instances"]]

            ids.extend(new_ids)
            result["launched"] = new_ids
            _log("launch", new_ids)

        elif len(ids) > target:
            extra = ids[target:]

            _ec2.terminate_instances(InstanceIds=extra)

            ids = ids[:target]
            result["terminated"] = extra
            _log("terminate", extra)

        result["running"] = len(ids)

    except Exception as error:
        result["error"] = str(error)

    return result


def cloud_status():
    info = {
        "mode": "emulator" if _ec2 is not None else "off",
        "provider": "AWS EC2 API via boto3 (local emulator: moto)",
        "region": REGION,
        "instances": [],
        "events": list(reversed(_events[-10:])),
        "error": _error
    }

    if _ec2 is not None:
        try:
            info["instances"] = _running_ids()
        except Exception as error:
            info["error"] = str(error)

    return info


_init()