#!/bin/bash

echo "vm-name,private-ip,machine-id,region,zone,instance-type" > k8s-instances.csv

aws ec2 describe-instances --filters "Name=tag:Name,Values=k8s*" --query "Reservations[].Instances[].[Tags[?Key=='Name'].Value|[0],PrivateIpAddress,InstanceId,Placement.AvailabilityZone,InstanceType]" --output text | while read -r name ip id zone type; do
    region=${zone%?}
    echo "$name,$ip,$id,$region,$zone,$type" >> k8s-instances.csv
done

# Generate key.pem
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash $SCRIPT_DIR/get-ssh-key.sh
# Upload k8s-instances.csv to accss VM using scp
PUBLIC_IP=$(aws ec2 describe-instances --filters "Name=tag:Name,Values=CKA-access-vm" "Name=instance-state-name,Values=running" --query "Reservations[].Instances[].PublicIpAddress" --output text)
scp -o "StrictHostKeyChecking no" -i key.pem k8s-instances.csv ec2-user@${PUBLIC_IP}:/public/k8s-instances.csv