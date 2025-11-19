#!/bin/bash

# Get the key id
keyId=$(aws ec2 describe-key-pairs --filters Name=key-name,Values=CKA-access-keypair --query "KeyPairs[*].KeyPairId" --output text)

# Save the key to a .pem file
aws ssm get-parameter --name "/ec2/keypair/$keyId" --with-decryption --query "Parameter.Value" --output text > key.pem
chmod 400 key.pem
