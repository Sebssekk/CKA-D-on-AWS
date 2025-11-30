#!/bin/bash
# Exit immediately if a command exits with a non-zero status.
set -e

# --- 1. Fetch Dynamic Metadata ---
# Get the current public IP address
TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
if [ -z "$TOKEN" ]; then
    echo "Error: Could not retrieve Metadata Token."
    exit 1
fi
IP=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)
if [ -z "$IP" ]; then
    echo "Error: Could not retrieve public IP."
    exit 1
fi

# Get the current public hostname/DNS name
DNS=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-hostname)
if [ -z "$DNS" ]; then
    echo "Error: Could not retrieve public DNS name."
    exit 1
fi

# Define output paths
KEY_PATH="/public/code.key"
CRT_PATH="/public/code.crt"
PUBLIC_DIR="/public"

# --- 2. Create the Public Directory (if needed) ---
if [ ! -d "$PUBLIC_DIR" ]; then
    sudo mkdir -p "$PUBLIC_DIR"
fi

# --- 3. Generate Certificate and Key ---
echo "Generating self-signed certificate for IP: $IP and DNS: $DNS..."

# Generate the self-signed certificate using the fetched data
openssl req -x509 -newkey rsa:4096 -days 365 -nodes \
-keyout "$KEY_PATH" -out "$CRT_PATH" \
-subj "/C=US/ST=SomeState/L=SomeCity/O=MyOrganization/OU=MyUnit/CN=ip-$(echo $IP | tr '.' '-')" \
-addext "subjectAltName=DNS:$DNS,IP:$IP"

# --- 4. Set Permissions ---
echo "Setting permissions on certificate files..."
chmod 777 "$KEY_PATH" "$CRT_PATH"

echo "Certificate setup complete."