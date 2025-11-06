#!/bin/bash
set -e

# Get the public IP of the CKA access VM
PUBLIC_IP=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=CKA-access-vm" "Name=instance-state-name,Values=running" \
    --query "Reservations[].Instances[].PublicIpAddress" \
    --output text)

echo "[*] Copying node-patch.sh to remote host..."
scp -i key.pem $(dirname "$0")/node-patch.sh ec2-user@${PUBLIC_IP}:/tmp/node-patch.sh

echo "[*] Setting execute permissions and running patch script..."
ssh -i key.pem ec2-user@${PUBLIC_IP} "chmod +x /tmp/node-patch.sh && sudo /tmp/node-patch.sh"

echo "[*] Node patching completed"
