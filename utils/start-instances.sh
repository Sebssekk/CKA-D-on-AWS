#!/bin/bash
instance_ids=$(aws ec2 describe-instances --filters "Name=tag:Name,Values=k8s*,CKA-access-vm" "Name=instance-state-name,Values=stopped" --query "Reservations[].Instances[].InstanceId" --output text)

for instance_id in $instance_ids; do
    aws ec2 start-instances --instance-ids "$instance_id"
done

# Wait for CKA-access-vm to be in the running state
echo "Waiting for CKA-access-vm to be running..."
aws ec2 wait instance-running --filters "Name=tag:Name,Values=CKA-access-vm"

echo "Restart code-server"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../.env"

bash $SCRIPT_DIR/get-ssh-key.sh
# Upload start-code-server to accss VM using scp
PUBLIC_IP=$(aws ec2 describe-instances --filters "Name=tag:Name,Values=CKA-access-vm" "Name=instance-state-name,Values=running" --query "Reservations[].Instances[].PublicIpAddress" --output text)
scp -o "StrictHostKeyChecking no" -i key.pem ./utils/start-code-server.sh ec2-user@${PUBLIC_IP}:/public/start-code-server.sh

# Run start-code-server
ssh -o "StrictHostKeyChecking no" -i key.pem ec2-user@${PUBLIC_IP} "export ACCESS_NUM=$ACCESS_NUM;export ACCESS_PSW=$ACCESS_PSW;  chmod 700 /public/start-code-server.sh && /public/start-code-server.sh; exit"