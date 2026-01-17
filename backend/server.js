const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { 
  SSOOIDCClient, 
  RegisterClientCommand, 
  StartDeviceAuthorizationCommand, 
  CreateTokenCommand 
} = require('@aws-sdk/client-sso-oidc');

const { 
  SSOClient, 
  GetRoleCredentialsCommand,
  ListAccountsCommand,
  ListAccountRolesCommand
} = require('@aws-sdk/client-sso');

const { 
  EC2Client, 
  DescribeInstancesCommand,
  DescribeRegionsCommand 
} = require('@aws-sdk/client-ec2');

const {
  CloudFormationClient,
  DescribeStacksCommand,
  ListStacksCommand
} = require('@aws-sdk/client-cloudformation');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Store active sessions (in production, use Redis or similar)
const sessions = new Map();

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Step 1: Start SSO authentication flow
app.post('/api/sso/start', async (req, res) => {
  const { ssoStartUrl, ssoRegion } = req.body;
  
  console.log('Starting SSO flow:', { ssoStartUrl, ssoRegion });
  
  try {
    const ssoOidcClient = new SSOOIDCClient({ region: ssoRegion });
    
    // Register the client
    const registerCommand = new RegisterClientCommand({
      clientName: 'AWS-SSO-Manager',
      clientType: 'public'
    });
    const registerResponse = await ssoOidcClient.send(registerCommand);
    
    console.log('Client registered:', registerResponse.clientId);
    
    // Start device authorization
    const authCommand = new StartDeviceAuthorizationCommand({
      clientId: registerResponse.clientId,
      clientSecret: registerResponse.clientSecret,
      startUrl: ssoStartUrl
    });
    const authResponse = await ssoOidcClient.send(authCommand);
    
    console.log('Device authorization started:', authResponse.userCode);
    
    // Store session data
    const sessionId = `session_${Date.now()}`;
    sessions.set(sessionId, {
      clientId: registerResponse.clientId,
      clientSecret: registerResponse.clientSecret,
      deviceCode: authResponse.deviceCode,
      ssoRegion,
      createdAt: Date.now()
    });
    
    res.json({
      sessionId,
      userCode: authResponse.userCode,
      verificationUri: authResponse.verificationUri,
      verificationUriComplete: authResponse.verificationUriComplete,
      expiresIn: authResponse.expiresIn,
      interval: authResponse.interval
    });
  } catch (error) {
    console.error('SSO start error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Step 2: Poll for access token
app.post('/api/sso/poll', async (req, res) => {
  const { sessionId } = req.body;
  
  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  try {
    const ssoOidcClient = new SSOOIDCClient({ region: session.ssoRegion });
    
    const tokenCommand = new CreateTokenCommand({
      clientId: session.clientId,
      clientSecret: session.clientSecret,
      grantType: 'urn:ietf:params:oauth:grant-type:device_code',
      deviceCode: session.deviceCode
    });
    
    const tokenResponse = await ssoOidcClient.send(tokenCommand);
    
    console.log('Token received successfully');
    
    // Store access token in session
    session.accessToken = tokenResponse.accessToken;
    session.tokenExpiresAt = Date.now() + (tokenResponse.expiresIn * 1000);
    
    res.json({
      status: 'success',
      accessToken: tokenResponse.accessToken,
      expiresIn: tokenResponse.expiresIn
    });
  } catch (error) {
    if (error.name === 'AuthorizationPendingException') {
      res.status(202).json({ status: 'pending' });
    } else if (error.name === 'SlowDownException') {
      res.status(429).json({ status: 'slow_down' });
    } else if (error.name === 'ExpiredTokenException') {
      sessions.delete(sessionId);
      res.status(401).json({ error: 'Session expired' });
    } else {
      console.error('Poll error:', error);
      res.status(500).json({ error: error.message });
    }
  }
});

// Step 3: List available accounts
app.post('/api/sso/accounts', async (req, res) => {
  const { sessionId } = req.body;
  
  const session = sessions.get(sessionId);
  if (!session || !session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    const ssoClient = new SSOClient({ region: session.ssoRegion });
    
    const listAccountsCommand = new ListAccountsCommand({
      accessToken: session.accessToken
    });
    const accountsResponse = await ssoClient.send(listAccountsCommand);
    
    res.json({
      accounts: accountsResponse.accountList || []
    });
  } catch (error) {
    console.error('List accounts error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Step 4: List available roles for an account
app.post('/api/sso/roles', async (req, res) => {
  const { sessionId, accountId } = req.body;
  
  const session = sessions.get(sessionId);
  if (!session || !session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    const ssoClient = new SSOClient({ region: session.ssoRegion });
    
    const listRolesCommand = new ListAccountRolesCommand({
      accessToken: session.accessToken,
      accountId
    });
    const rolesResponse = await ssoClient.send(listRolesCommand);
    
    res.json({
      roles: rolesResponse.roleList || []
    });
  } catch (error) {
    console.error('List roles error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Step 5: Get role credentials
app.post('/api/sso/credentials', async (req, res) => {
  const { sessionId, accountId, roleName } = req.body;
  
  const session = sessions.get(sessionId);
  if (!session || !session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    const ssoClient = new SSOClient({ region: session.ssoRegion });
    
    const credentialsCommand = new GetRoleCredentialsCommand({
      accessToken: session.accessToken,
      accountId,
      roleName
    });
    const credentialsResponse = await ssoClient.send(credentialsCommand);
    
    const credentials = credentialsResponse.roleCredentials;
    
    // Store credentials in session
    session.credentials = {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      expiration: credentials.expiration
    };
    
    res.json({
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      expiration: credentials.expiration
    });
  } catch (error) {
    console.error('Get credentials error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Step 6: List EC2 instances
app.post('/api/ec2/instances', async (req, res) => {
  const { sessionId, region } = req.body;
  
  const session = sessions.get(sessionId);
  if (!session || !session.credentials) {
    return res.status(401).json({ error: 'Not authenticated or no credentials' });
  }
  
  try {
    const ec2Client = new EC2Client({
      region: region || 'us-east-1',
      credentials: {
        accessKeyId: session.credentials.accessKeyId,
        secretAccessKey: session.credentials.secretAccessKey,
        sessionToken: session.credentials.sessionToken
      }
    });
    
    const command = new DescribeInstancesCommand({});
    const response = await ec2Client.send(command);
    
    const instances = [];
    
    if (response.Reservations) {
      for (const reservation of response.Reservations) {
        for (const instance of reservation.Instances) {
          const nameTag = instance.Tags?.find(tag => tag.Key === 'Name');
          
          instances.push({
            instanceId: instance.InstanceId,
            name: nameTag?.Value || 'N/A',
            instanceType: instance.InstanceType,
            state: instance.State.Name,
            privateIp: instance.PrivateIpAddress || 'N/A',
            publicIp: instance.PublicIpAddress || 'N/A',
            availabilityZone: instance.Placement.AvailabilityZone,
            launchTime: instance.LaunchTime,
            platform: instance.Platform || 'Linux',
            vpcId: instance.VpcId || 'N/A',
            subnetId: instance.SubnetId || 'N/A'
          });
        }
      }
    }
    
    console.log(`Found ${instances.length} EC2 instances in ${region}`);
    
    res.json({ instances });
  } catch (error) {
    console.error('List EC2 instances error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Step 7: Get available AWS regions
app.post('/api/ec2/regions', async (req, res) => {
  const { sessionId } = req.body;
  
  const session = sessions.get(sessionId);
  if (!session || !session.credentials) {
    return res.status(401).json({ error: 'Not authenticated or no credentials' });
  }
  
  try {
    const ec2Client = new EC2Client({
      region: 'us-east-1', // Use any region to get all regions
      credentials: {
        accessKeyId: session.credentials.accessKeyId,
        secretAccessKey: session.credentials.secretAccessKey,
        sessionToken: session.credentials.sessionToken
      }
    });
    
    const command = new DescribeRegionsCommand({});
    const response = await ec2Client.send(command);
    
    const regions = response.Regions.map(region => ({
      name: region.RegionName,
      endpoint: region.Endpoint,
      optInStatus: region.OptInStatus
    }));
    
    res.json({ regions });
  } catch (error) {
    console.error('List regions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Step 8: List CloudFormation stacks
app.post('/api/cloudformation/stacks', async (req, res) => {
  const { sessionId, region } = req.body;
  
  const session = sessions.get(sessionId);
  if (!session || !session.credentials) {
    return res.status(401).json({ error: 'Not authenticated or no credentials' });
  }
  
  try {
    const cfnClient = new CloudFormationClient({
      region: region || 'us-east-1',
      credentials: {
        accessKeyId: session.credentials.accessKeyId,
        secretAccessKey: session.credentials.secretAccessKey,
        sessionToken: session.credentials.sessionToken
      }
    });
    
    const command = new ListStacksCommand({
      StackStatusFilter: [
        'CREATE_IN_PROGRESS',
        'CREATE_COMPLETE',
        'ROLLBACK_IN_PROGRESS',
        'ROLLBACK_COMPLETE',
        'DELETE_IN_PROGRESS',
        'UPDATE_IN_PROGRESS',
        'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS',
        'UPDATE_COMPLETE',
        'UPDATE_ROLLBACK_IN_PROGRESS',
        'UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS',
        'UPDATE_ROLLBACK_COMPLETE',
        'REVIEW_IN_PROGRESS',
        'IMPORT_IN_PROGRESS',
        'IMPORT_COMPLETE',
        'IMPORT_ROLLBACK_IN_PROGRESS',
        'IMPORT_ROLLBACK_COMPLETE'
      ]
    });
    
    const response = await cfnClient.send(command);
    
    const stacks = (response.StackSummaries || []).map(stack => ({
      stackName: stack.StackName,
      stackId: stack.StackId,
      stackStatus: stack.StackStatus,
      creationTime: stack.CreationTime,
      lastUpdatedTime: stack.LastUpdatedTime,
      deletionTime: stack.DeletionTime,
      templateDescription: stack.TemplateDescription,
      driftInformation: stack.DriftInformation
    }));
    
    console.log(`Found ${stacks.length} CloudFormation stacks in ${region}`);
    
    res.json({ stacks });
  } catch (error) {
    console.error('List CloudFormation stacks error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Step 9: Get CloudFormation stack details
app.post('/api/cloudformation/stack-details', async (req, res) => {
  const { sessionId, region, stackName } = req.body;
  
  const session = sessions.get(sessionId);
  if (!session || !session.credentials) {
    return res.status(401).json({ error: 'Not authenticated or no credentials' });
  }
  
  try {
    const cfnClient = new CloudFormationClient({
      region: region || 'us-east-1',
      credentials: {
        accessKeyId: session.credentials.accessKeyId,
        secretAccessKey: session.credentials.secretAccessKey,
        sessionToken: session.credentials.sessionToken
      }
    });
    
    const command = new DescribeStacksCommand({
      StackName: stackName
    });
    
    const response = await cfnClient.send(command);
    
    if (response.Stacks && response.Stacks.length > 0) {
      const stack = response.Stacks[0];
      res.json({
        stack: {
          stackName: stack.StackName,
          stackId: stack.StackId,
          stackStatus: stack.StackStatus,
          creationTime: stack.CreationTime,
          lastUpdatedTime: stack.LastUpdatedTime,
          deletionTime: stack.DeletionTime,
          description: stack.Description,
          parameters: stack.Parameters,
          outputs: stack.Outputs,
          tags: stack.Tags,
          capabilities: stack.Capabilities,
          notificationARNs: stack.NotificationARNs,
          timeoutInMinutes: stack.TimeoutInMinutes,
          roleARN: stack.RoleARN
        }
      });
    } else {
      res.status(404).json({ error: 'Stack not found' });
    }
  } catch (error) {
    console.error('Get stack details error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clean up expired sessions every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    // Remove sessions older than 1 hour
    if (now - session.createdAt > 3600000) {
      sessions.delete(sessionId);
      console.log(`Cleaned up expired session: ${sessionId}`);
    }
  }
}, 600000);

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});