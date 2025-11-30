#!/bin/bash
instance_ids=$(aws ec2 describe-instances --filters "Name=tag:Name,Values=k8s*,CKA-access-vm" "Name=instance-state-name,Values=stopped" --query "Reservations[].Instances[].InstanceId" --output text)

for instance_id in $instance_ids; do
    aws ec2 start-instances --instance-ids "$instance_id"
done

# Wait for CKA-access-vm to be in the running state
echo "Waiting for CKA-access-vm to be running..."
aws ec2 wait instance-running --filters "Name=tag:Name,Values=CKA-access-vm"

echo "[>] Editor starting at $PUBLIC_IP"