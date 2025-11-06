$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Get-Content "$ScriptDir\..\.env" | ForEach-Object { if ($_ -match "^([^=]+)=(.*)$") { Set-Variable -Name $matches[1] -Value $matches[2] } }

if (-not $ACCESS_NUM) { throw "ACCESS_NUM variable not set" }

"user,CP,Workers" | Out-File -FilePath "user-instances.csv" -Encoding UTF8

for ($x = 1; $x -le $ACCESS_NUM; $x++) {
    $user = "user$x"
    $cp = aws ec2 describe-instances --filters "Name=tag:USER,Values=$user" "Name=tag:Name,Values=k8s-cp$x" --query "Reservations[].Instances[].PrivateIpAddress" --output text
    $workers = (aws ec2 describe-instances --filters "Name=tag:USER,Values=$user" "Name=tag:Name,Values=k8s-w$x-*" --query "Reservations[].Instances[].PrivateIpAddress" --output text) -replace "`t", " "
    "$user,$cp,$workers" | Add-Content -Path "user-instances.csv"
}

# Generate key.pem
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& ${ScriptDir}/get-ssh-key.ps1
# Upload user-instances.csv to accss VM using scp
$PUBLIC_IP = aws ec2 describe-instances --filters "Name=tag:Name,Values=CKA-access-vm" "Name=instance-state-name,Values=running" --query "Reservations[].Instances[].PublicIpAddress" --output text
scp -o "StrictHostKeyChecking no" -i key.pem user-instances.csv ec2-user@${PUBLIC_IP}:/public/user-instances.csv