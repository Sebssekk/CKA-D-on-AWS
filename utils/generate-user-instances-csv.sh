#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../.env"

ACCESS_NUM=${ACCESS_NUM:?Variable not set or empty}

echo "user,CP,Workers" > user-instances.csv

for x in $(seq 1 $ACCESS_NUM); do
    user="user$x"
    cp=$(aws ec2 describe-instances --filters "Name=tag:USER,Values=$user" "Name=tag:Name,Values=k8s-cp$x"  --query "Reservations[].Instances[].PrivateIpAddress" --output text)
    workers=$(aws ec2 describe-instances --filters "Name=tag:USER,Values=$user" "Name=tag:Name,Values=k8s-w$x-*" --query "Reservations[].Instances[].PrivateIpAddress" --output text | tr '\t' ' ')
    echo "$user,$cp,$workers" >> user-instances.csv
done

# Generate key.pem
bash $SCRIPT_DIR/get-ssh-key.sh
# Upload user-instances.csv to accss VM using scp
PUBLIC_IP=$(aws ec2 describe-instances --filters "Name=tag:Name,Values=CKA-access-vm" "Name=instance-state-name,Values=running" --query "Reservations[].Instances[].PublicIpAddress" --output text)
scp -o "StrictHostKeyChecking no" -i key.pem user-instances.csv ec2-user@${PUBLIC_IP}:/public/user-instances.csv