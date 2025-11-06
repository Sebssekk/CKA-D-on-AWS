$instanceIds = aws ec2 describe-instances --filters "Name=tag:Name,Values=k8s*,CKA-access-vm" "Name=instance-state-name,Values=stopped" --query "Reservations[].Instances[].InstanceId" --output text
$instanceIds -split "`t" | ForEach-Object { aws ec2 start-instances --instance-ids $_ }

# Wait for CKA-access-vm to be in the running state
Write-Host "Waiting for CKA-access-vm to be running..."
aws ec2 wait instance-running --filters "Name=tag:Name,Values=CKA-access-vm"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Get-Content "$ScriptDir\..\.env" | ForEach-Object { if ($_ -match "^([^=]+)=(.*)$") { Set-Variable -Name $matches[1] -Value $matches[2] } }
if (-not $ACCESS_NUM) { throw "ACCESS_NUM variable not set" }

# Restart code-server
Write-Host "Restarting code-server..."

# Generate key.pem
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& ${ScriptDir}/get-ssh-key.ps1
# Upload start-code-server to accss VM using scp
$PUBLIC_IP = aws ec2 describe-instances --filters "Name=tag:Name,Values=CKA-access-vm" "Name=instance-state-name,Values=running" --query "Reservations[].Instances[].PublicIpAddress" --output text
scp -o "StrictHostKeyChecking no" -i key.pem ./utils/start-code-server.sh ec2-user@${PUBLIC_IP}:/public/start-code-server.sh
# Run start-code-server
ssh -o "StrictHostKeyChecking no" -i key.pem ec2-user@${PUBLIC_IP} "export ACCESS_NUM=$ACCESS_NUM;export ACCESS_PSW=$ACCESS_PSW;  chmod 700 /public/start-code-server.sh && /public/start-code-server.sh; exit"