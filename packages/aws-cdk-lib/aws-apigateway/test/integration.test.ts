import { Match, Template } from '../../assertions';
import * as ec2 from '../../aws-ec2';
import * as elbv2 from '../../aws-elasticloadbalancingv2';
import * as iam from '../../aws-iam';
import * as cdk from '../../core';
import * as apigw from '../lib';

describe('integration', () => {
  test('integration "credentialsRole" and "credentialsPassthrough" are mutually exclusive', () => {
    // GIVEN
    const stack = new cdk.Stack();
    const role = new iam.Role(stack, 'MyRole', { assumedBy: new iam.ServicePrincipal('foo') });

    // THEN
    expect(() => new apigw.Integration({
      type: apigw.IntegrationType.AWS_PROXY,
      integrationHttpMethod: 'ANY',
      options: {
        credentialsPassthrough: true,
        credentialsRole: role,
      },
    })).toThrow(/'credentialsPassthrough' and 'credentialsRole' are mutually exclusive/);
  });

  test('integration connectionType VpcLink requires vpcLink to be set', () => {
    expect(() => new apigw.Integration({
      type: apigw.IntegrationType.HTTP_PROXY,
      integrationHttpMethod: 'ANY',
      options: {
        connectionType: apigw.ConnectionType.VPC_LINK,
      },
    })).toThrow(/'connectionType' of VPC_LINK requires 'vpcLink' prop to be set/);
  });

  test('uri is self determined from the NLB', () => {
    const stack = new cdk.Stack();
    const vpc = new ec2.Vpc(stack, 'VPC');
    const nlb = new elbv2.NetworkLoadBalancer(stack, 'NLB', { vpc });
    const link = new apigw.VpcLink(stack, 'link', {
      targets: [nlb],
    });
    const api = new apigw.RestApi(stack, 'restapi');
    const integration = new apigw.Integration({
      type: apigw.IntegrationType.HTTP_PROXY,
      integrationHttpMethod: 'ANY',
      options: {
        connectionType: apigw.ConnectionType.VPC_LINK,
        vpcLink: link,
      },
    });
    api.root.addMethod('GET', integration);

    Template.fromStack(stack).hasResourceProperties('AWS::ApiGateway::Method', {
      Integration: {
        Uri: {
          'Fn::Join': [
            '',
            [
              'http://',
              {
                'Fn::GetAtt': [
                  'NLB55158F82',
                  'DNSName',
                ],
              },
            ],
          ],
        },
      },
    });
  });

  test('uri must be set for VpcLink with multiple NLBs', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app);
    const vpc = new ec2.Vpc(stack, 'VPC');
    const nlb1 = new elbv2.NetworkLoadBalancer(stack, 'NLB1', { vpc });
    const nlb2 = new elbv2.NetworkLoadBalancer(stack, 'NLB2', { vpc });
    const link = new apigw.VpcLink(stack, 'link', {
      targets: [nlb1, nlb2],
    });
    const api = new apigw.RestApi(stack, 'restapi');
    const integration = new apigw.Integration({
      type: apigw.IntegrationType.HTTP_PROXY,
      integrationHttpMethod: 'ANY',
      options: {
        connectionType: apigw.ConnectionType.VPC_LINK,
        vpcLink: link,
      },
    });
    api.root.addMethod('GET', integration);
    expect(() => app.synth()).toThrow(/'uri' is required when there are more than one NLBs in the VPC Link/);
  });

  test('uri must be set when using an imported VpcLink', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app);
    const link = apigw.VpcLink.fromVpcLinkId(stack, 'link', 'vpclinkid');
    const api = new apigw.RestApi(stack, 'restapi');
    const integration = new apigw.Integration({
      type: apigw.IntegrationType.HTTP_PROXY,
      integrationHttpMethod: 'ANY',
      options: {
        connectionType: apigw.ConnectionType.VPC_LINK,
        vpcLink: link,
      },
    });
    api.root.addMethod('GET', integration);
    expect(() => app.synth()).toThrow(/'uri' is required when the 'connectionType' is VPC_LINK/);
  });

  test('connectionType of INTERNET and vpcLink are mutually exclusive', () => {
    // GIVEN
    const stack = new cdk.Stack();
    const vpc = new ec2.Vpc(stack, 'VPC');
    const nlb = new elbv2.NetworkLoadBalancer(stack, 'NLB', {
      vpc,
    });
    const link = new apigw.VpcLink(stack, 'link', {
      targets: [nlb],
    });

    // THEN
    expect(() => new apigw.Integration({
      type: apigw.IntegrationType.HTTP_PROXY,
      integrationHttpMethod: 'ANY',
      options: {
        connectionType: apigw.ConnectionType.INTERNET,
        vpcLink: link,
      },
    })).toThrow(/cannot set 'vpcLink' where 'connectionType' is INTERNET/);
  });

  test('connectionType is Match.absent() when vpcLink is not specified', () => {
    // GIVEN
    const stack = new cdk.Stack();
    const api = new apigw.RestApi(stack, 'restapi');

    // WHEN
    const integration = new apigw.Integration({
      type: apigw.IntegrationType.HTTP_PROXY,
      integrationHttpMethod: 'ANY',
    });
    api.root.addMethod('ANY', integration);

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'ANY',
      Integration: {
        ConnectionType: Match.absent(),
      },
    });
  });

  test('connectionType defaults to VPC_LINK if vpcLink is configured', () => {
    // GIVEN
    const stack = new cdk.Stack();
    const vpc = new ec2.Vpc(stack, 'VPC');
    const nlb = new elbv2.NetworkLoadBalancer(stack, 'NLB', {
      vpc,
    });
    const link = new apigw.VpcLink(stack, 'link', {
      targets: [nlb],
    });
    const api = new apigw.RestApi(stack, 'restapi');

    // WHEN
    const integration = new apigw.Integration({
      type: apigw.IntegrationType.HTTP_PROXY,
      integrationHttpMethod: 'ANY',
      options: {
        vpcLink: link,
      },
    });
    api.root.addMethod('ANY', integration);

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'ANY',
      Integration: {
        ConnectionType: 'VPC_LINK',
      },
    });
  });

  test('validates timeout is valid', () => {
    expect(() => new apigw.Integration({
      type: apigw.IntegrationType.HTTP_PROXY,
      integrationHttpMethod: 'ANY',
      options: {
        timeout: cdk.Duration.millis(2),
      },
    })).toThrow(/Integration timeout must be greater than 50 milliseconds/);

    expect(() => new apigw.Integration({
      type: apigw.IntegrationType.HTTP_PROXY,
      integrationHttpMethod: 'ANY',
      options: {
        timeout: cdk.Duration.seconds(50),
      },
    })).not.toThrow();
  });

  test('sets timeout', () => {
    // GIVEN
    const stack = new cdk.Stack();
    const api = new apigw.RestApi(stack, 'restapi');

    // WHEN
    const integration = new apigw.Integration({
      type: apigw.IntegrationType.HTTP_PROXY,
      integrationHttpMethod: 'ANY',
      options: {
        timeout: cdk.Duration.seconds(1),
      },
    });
    api.root.addMethod('ANY', integration);

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'ANY',
      Integration: {
        TimeoutInMillis: 1000,
      },
    });
  });

  test('validates integrationHttpMethod is required for non-MOCK integration types', () => {
    expect(() => new apigw.Integration({
      type: apigw.IntegrationType.HTTP_PROXY,
      options: {
        timeout: cdk.Duration.seconds(15),
      },
    })).toThrow(/integrationHttpMethod is required for non-mock integration types/);
  });

  test('integrationHttpMethod can be omitted for MOCK integration type', () => {
    expect(() => new apigw.Integration({
      type: apigw.IntegrationType.MOCK,
      options: {
        timeout: cdk.Duration.seconds(15),
      },
    })).not.toThrow();
  });
});
