#!/bin/bash
sed -i 's*\r**' /public/*.csv
for user_dir in  /home/user*; do
    export KUBECONFIG=$user_dir/.kube/config
    nodes=$(sudo -E kubectl get node -o name | cut -d '/' -f 2)
    for node in $nodes; do
        private_ip=$(echo $node | sed -E 's#.*ip-##' | tr '-' '.')
        while IFS=, read -r vmname privateip machineid region zone instancetype
        do
            if [ $private_ip = $privateip ]; then
                echo "[*] Patching $vmname with "
                echo "*****************************"
                echo "* instance-type: $instancetype"
                echo "* region: $region"
                echo "* zone: $zone"
                echo "* id: $machineid"
                echo "*****************************"
                sudo -E kubectl patch node $node --type='merge' -p="{\"metadata\":{\"labels\":{\"topology.kubernetes.io/region\":\"$region\",\"topology.kubernetes.io/zone\":\"$zone\",\"node.kubernetes.io/instance-type\":\"$instancetype\"}}}"
                sudo -E kubectl patch node $node --type='merge' -p "{\"spec\":{\"providerID\":\"aws:///$region/$machineid\"}}"
                echo "[*] $vmname patch completed"
                echo "#"
                break
            fi
      done < /public/k8s-instances.csv
    done
done