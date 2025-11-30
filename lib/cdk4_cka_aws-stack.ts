import { Stack, StackProps, Tags } from 'aws-cdk-lib';
import { Vpc, IpAddresses, SubnetType, Subnet, ISubnet, SecurityGroup, Peer, Port, KeyPair, KeyPairType,  KeyPairFormat, } from 'aws-cdk-lib/aws-ec2';
import { ManagedPolicy, PolicyDocument, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { AccessStack } from './access-stack';
import { K8sStack } from './k8s-stack';
import { NetworkStack } from './network-stack';

export class Cdk4CkaAwsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    
    const ACCESS_NUM : number = Number(process.env.ACCESS_NUM) 
    const CLUSTERS_NUM : number = Number(process.env.CLUSTERS_NUM) || ACCESS_NUM
    const WORKERS_NUM : number = Number(process.env.WORKERS_NUM) || 1
    const REGION: string = this.region
    const K8S_VERSION : string = process.env.K8S_VERSION || "1.33"
    const ETCD_VERSION : string = process.env.ETCD_VERSION || "v3.6.6"
    const ACCESS_PSW : string = process.env.ACCESS_PSW || "lab123"

    const netStack = new NetworkStack(this, "CKANetworkStack", {
      ACCESS_NUM: ACCESS_NUM
    })

    if (ACCESS_NUM > 0){
        new AccessStack(this, "CKAAccessStack", {
          vpc: netStack.vpc,
          keyPair: netStack.keyPair,
          sg: netStack.sg,
          REGION: REGION,
          ACCESS_NUM: ACCESS_NUM,
          ACCESS_PSW: ACCESS_PSW,
          CLUSTERS_NUM: CLUSTERS_NUM
        })
    }

    new K8sStack(this, "CKAK8sStack", {
      vpc: netStack.vpc,
      keyPair: netStack.keyPair,
      sg: netStack.sg,
      K8S_VERSION: K8S_VERSION,
      ETCD_VERSION: ETCD_VERSION,
      CLUSTERS_NUM: CLUSTERS_NUM,
      WORKERS_NUM: WORKERS_NUM
    })
  }
}
