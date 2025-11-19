#!/bin/bash
aws ec2 describe-instances --filters "Name=tag:Name,Values=CKA-access-vm" "Name=instance-state-name,Values=running" --query "Reservations[].Instances[].PublicIpAddress" --output text
