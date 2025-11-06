#!/bin/bash
instance_ids=$(aws ec2 describe-instances --filters "Name=tag:Name,Values=k8s*,CKA-access-vm" "Name=instance-state-name,Values=running" --query "Reservations[].Instances[].InstanceId" --output text)

for instance_id in $instance_ids; do
    aws ec2 stop-instances --instance-ids "$instance_id"
done
