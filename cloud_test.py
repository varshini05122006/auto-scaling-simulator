import boto3
from botocore.exceptions import ClientError
from moto import mock_aws


def count_running(ec2):
    result = ec2.describe_instances(
        Filters=[{"Name": "instance-state-name", "Values": ["running"]}]
    )
    return sum(len(r["Instances"]) for r in result["Reservations"])


@mock_aws
def main():
    ec2 = boto3.client("ec2", region_name="ap-south-1")

    ami = ec2.describe_images()["Images"][0]["ImageId"]
    print("Using test image:", ami)

    # Dry run: ask AWS "would this launch be allowed?" without creating anything
    try:
        ec2.run_instances(
            ImageId=ami, MinCount=1, MaxCount=1,
            InstanceType="t2.micro", DryRun=True
        )
    except ClientError as error:
        print("Dry run answer:", error.response["Error"]["Code"])

    print("Running instances before:", count_running(ec2))

    # Scale Out: launch an instance
    launched = ec2.run_instances(
        ImageId=ami, MinCount=1, MaxCount=1, InstanceType="t2.micro"
    )
    instance_id = launched["Instances"][0]["InstanceId"]
    print("Scale Out -> launched:", instance_id)
    print("Running instances after launch:", count_running(ec2))

    # Scale In: terminate it
    ec2.terminate_instances(InstanceIds=[instance_id])
    print("Scale In -> terminated:", instance_id)
    print("Running instances after terminate:", count_running(ec2))


main()