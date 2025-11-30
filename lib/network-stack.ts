import { Stack, StackProps, Tags } from "aws-cdk-lib";
import { IpAddresses, ISubnet, KeyPair, KeyPairFormat, KeyPairType, Peer, Port, SecurityGroup, Subnet, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { NetworkStackProps } from "./types";

export class NetworkStack extends Stack {
  public vpc: Vpc
  public sg: SecurityGroup
  public keyPair: KeyPair

  constructor(scope: Construct, id: string, props: NetworkStackProps ) {
    super(scope, id, props);
    this.vpc = new Vpc(this, 'CKAVPC', {
      vpcName: "CKA-vpc",
      ipAddresses: IpAddresses.cidr('192.168.0.0/20'),
      maxAzs: 3,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 26,
          name: 'CKA-access',
          subnetType: SubnetType.PUBLIC
        },
        {
          cidrMask: 26,
          name: 'CKA-clusters',
          subnetType: SubnetType.PRIVATE_WITH_EGRESS
        }
      ]
    })
    this.vpc.publicSubnets.forEach((sub:ISubnet) => 
      Tags.of(sub as Subnet).add("Name", "CKA-access")
    )

    this.sg = new SecurityGroup(this, "CKAsg", {
      securityGroupName: "CKA-sg",
      vpc: this.vpc,
      allowAllOutbound: true,
    })
    this.sg.addIngressRule(Peer.anyIpv4(), Port.HTTP)
    this.sg.addIngressRule(Peer.anyIpv4(), Port.HTTPS)
    this.sg.addIngressRule(Peer.anyIpv4(), Port.SSH)
    this.sg.addIngressRule(this.sg,Port.allTraffic())

    for (let port = 1; port <= props.ACCESS_NUM; port++){
      this.sg.addIngressRule(Peer.anyIpv4(), Port.tcp(8080 + port))
    }

    this.keyPair = new KeyPair(this, 'CKAAccessKey', {
      keyPairName: 'CKA-access-keypair',
      format: KeyPairFormat.PEM,
      type: KeyPairType.ED25519,
    })
  }
}