// ADPULSE on Azure Container Apps. Deploy with:
//   az deployment group create -g <rg> -f infrastructure/azure/main.bicep -p infrastructure/azure/main.bicepparam
// See docs/DEPLOYMENT.md for the full procedure, image publishing and migrations.
targetScope = 'resourceGroup'

@description('Short prefix for resource names (lowercase letters and digits).')
@minLength(3)
@maxLength(12)
param prefix string = 'adpulse'

@description('Deployment environment label, e.g. prod or staging.')
param environmentName string = 'prod'

param location string = resourceGroup().location

@description('Container image tag published to the registry by CI.')
param imageTag string

@description('Custom domain served by the web app (optional). When empty the Container Apps FQDN is used.')
param customDomain string = ''

@allowed(['mock', 'google'])
param integrationMode string = 'google'

param googleClientId string = ''

@secure()
param googleClientSecret string = ''

@secure()
param googleAdsDeveloperToken string = ''

param googleAdsLoginCustomerId string = ''

@allowed(['console', 'smtp'])
param emailProvider string = 'smtp'

param emailFrom string = 'ADPULSE <no-reply@example.com>'
param smtpHost string = ''
param smtpPort int = 587
param smtpUser string = ''

@secure()
param smtpPassword string = ''

param postgresAdminLogin string = 'adpulse_admin'

@secure()
param postgresAdminPassword string

@secure()
@description('openssl rand -base64 48')
param jwtAccessSecret string

@secure()
@description('openssl rand -base64 48 (must differ from jwtAccessSecret)')
param jwtRefreshSecret string

@secure()
@description('openssl rand -base64 32')
param encryptionKey string

@description('PostgreSQL Flexible Server SKU.')
param postgresSku string = 'Standard_B2s'

@allowed(['Burstable', 'GeneralPurpose', 'MemoryOptimized'])
param postgresTier string = 'Burstable'

param postgresBackupRetentionDays int = 14

@allowed(['Disabled', 'Enabled'])
param postgresGeoRedundantBackup string = 'Disabled'

param workerReplicas int = 1

@description('Set to false on the very first deployment: it creates the registry so images can be pushed before the apps reference them.')
param deployApps bool = true

var suffix = uniqueString(resourceGroup().id, prefix, environmentName)
var baseName = '${prefix}-${environmentName}'
var apiName = '${baseName}-api'
var webName = '${baseName}-web'
var workerName = '${baseName}-worker'
var migrateJobName = '${baseName}-migrate'
var vaultName = '${prefix}-kv-${take(suffix, 8)}'
var tags = { application: 'adpulse', environment: environmentName }

var roles = {
  acrPull: '7f951dda-4ed3-4680-a7ca-43fe172d538d'
  keyVaultSecretsUser: '4633458b-17de-408a-b874-0445c86b69e6'
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${baseName}-identity'
  location: location
  tags: tags
}

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${baseName}-logs'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${baseName}-insights'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: toLower('${prefix}${environmentName}${take(suffix, 6)}')
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, identity.id, roles.acrPull)
  scope: registry
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.acrPull)
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2022-12-01' = {
  name: '${baseName}-pg-${take(suffix, 6)}'
  location: location
  tags: tags
  sku: { name: postgresSku, tier: postgresTier }
  properties: {
    version: '16'
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    storage: { storageSizeGB: 32 }
    backup: { backupRetentionDays: postgresBackupRetentionDays, geoRedundantBackup: postgresGeoRedundantBackup }
    highAvailability: { mode: 'Disabled' }
  }
}

resource postgresDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2022-12-01' = {
  parent: postgres
  name: 'adpulse'
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

// Allows connections from Azure services (Container Apps egress). Use VNet integration for stricter isolation.
resource postgresAzureAccess 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2022-12-01' = {
  parent: postgres
  name: 'AllowAzureServices'
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

resource redis 'Microsoft.Cache/redis@2023-08-01' = {
  name: '${baseName}-redis-${take(suffix, 6)}'
  location: location
  tags: tags
  properties: {
    sku: { name: 'Standard', family: 'C', capacity: 1 }
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
    redisConfiguration: { 'maxmemory-policy': 'noeviction' }
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: toLower('${prefix}${take(suffix, 10)}')
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: { name: 'Standard_ZRS' }
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storage
  name: 'default'
  properties: {
    deleteRetentionPolicy: { enabled: true, days: 14 }
  }
}

resource reportsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'reports'
  properties: { publicAccess: 'None' }
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: vaultName
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 30
    enablePurgeProtection: true
  }
}

resource vaultSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, identity.id, roles.keyVaultSecretsUser)
  scope: vault
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.keyVaultSecretsUser)
  }
}

var databaseUrl = 'postgresql://${postgresAdminLogin}:${uriComponent(postgresAdminPassword)}@${postgres.properties.fullyQualifiedDomainName}:5432/${postgresDb.name}?schema=public&sslmode=require'
var redisUrl = 'rediss://:${uriComponent(redis.listKeys().primaryKey)}@${redis.properties.hostName}:6380'
var storageConnection = 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'

var secretValues = {
  'database-url': databaseUrl
  'redis-url': redisUrl
  'jwt-access-secret': jwtAccessSecret
  'jwt-refresh-secret': jwtRefreshSecret
  'encryption-key': encryptionKey
  'storage-connection-string': storageConnection
  'google-client-secret': empty(googleClientSecret) ? 'unset' : googleClientSecret
  'google-ads-developer-token': empty(googleAdsDeveloperToken) ? 'unset' : googleAdsDeveloperToken
  'smtp-password': empty(smtpPassword) ? 'unset' : smtpPassword
}

var secretNames = [
  'database-url'
  'redis-url'
  'jwt-access-secret'
  'jwt-refresh-secret'
  'encryption-key'
  'storage-connection-string'
  'google-client-secret'
  'google-ads-developer-token'
  'smtp-password'
]

resource vaultSecrets 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = [
  for name in secretNames: {
    parent: vault
    name: name
    properties: { value: secretValues[name] }
  }
]

resource appEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${baseName}-env'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

var publicUrl = empty(customDomain) ? 'https://${webName}.${appEnvironment.properties.defaultDomain}' : 'https://${customDomain}'

var containerSecrets = [
  for name in secretNames: {
    name: name
    keyVaultUrl: 'https://${vaultName}${environment().suffixes.keyvaultDns}/secrets/${name}'
    identity: identity.id
  }
]

var optionalSecretEnv = concat(
  empty(googleClientSecret) ? [] : [{ name: 'GOOGLE_CLIENT_SECRET', secretRef: 'google-client-secret' }],
  empty(googleAdsDeveloperToken) ? [] : [{ name: 'GOOGLE_ADS_DEVELOPER_TOKEN', secretRef: 'google-ads-developer-token' }],
  empty(smtpPassword) ? [] : [{ name: 'SMTP_PASSWORD', secretRef: 'smtp-password' }]
)

var sharedEnv = concat(
  [
    { name: 'NODE_ENV', value: 'production' }
    { name: 'LOG_LEVEL', value: 'info' }
    { name: 'APP_VERSION', value: imageTag }
    { name: 'WEB_URL', value: publicUrl }
    { name: 'API_URL', value: publicUrl }
    { name: 'TRUST_PROXY', value: 'true' }
    { name: 'COOKIE_SECURE', value: 'true' }
    { name: 'SWAGGER_ENABLED', value: 'false' }
    { name: 'DATABASE_URL', secretRef: 'database-url' }
    { name: 'REDIS_URL', secretRef: 'redis-url' }
    { name: 'JWT_ACCESS_SECRET', secretRef: 'jwt-access-secret' }
    { name: 'JWT_REFRESH_SECRET', secretRef: 'jwt-refresh-secret' }
    { name: 'ENCRYPTION_KEY', secretRef: 'encryption-key' }
    { name: 'STORAGE_PROVIDER', value: 'azure' }
    { name: 'AZURE_STORAGE_CONNECTION_STRING', secretRef: 'storage-connection-string' }
    { name: 'AZURE_STORAGE_CONTAINER', value: reportsContainer.name }
    { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insights.properties.ConnectionString }
    { name: 'INTEGRATION_MODE', value: integrationMode }
    { name: 'GOOGLE_CLIENT_ID', value: googleClientId }
    { name: 'GOOGLE_OAUTH_REDIRECT_URI', value: '${publicUrl}/api/v1/auth/google/callback' }
    { name: 'GOOGLE_INTEGRATION_REDIRECT_URI', value: '${publicUrl}/api/v1/integrations/google/callback' }
    { name: 'GOOGLE_ADS_LOGIN_CUSTOMER_ID', value: googleAdsLoginCustomerId }
    { name: 'EMAIL_PROVIDER', value: emailProvider }
    { name: 'EMAIL_FROM', value: emailFrom }
    { name: 'SMTP_HOST', value: smtpHost }
    { name: 'SMTP_PORT', value: string(smtpPort) }
    { name: 'SMTP_USER', value: smtpUser }
    { name: 'SMTP_SECURE', value: smtpPort == 465 ? 'true' : 'false' }
  ],
  optionalSecretEnv
)

var registryConfig = [{ server: registry.properties.loginServer, identity: identity.id }]
var identityConfig = {
  type: 'UserAssigned'
  userAssignedIdentities: { '${identity.id}': {} }
}

resource api 'Microsoft.App/containerApps@2024-03-01' = if (deployApps) {
  name: apiName
  location: location
  tags: tags
  identity: identityConfig
  dependsOn: [acrPull, vaultSecretsUser, vaultSecrets]
  properties: {
    managedEnvironmentId: appEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: { external: false, targetPort: 3000, transport: 'http', allowInsecure: true }
      registries: registryConfig
      secrets: containerSecrets
    }
    template: {
      containers: [
        {
          name: 'api'
          image: '${registry.properties.loginServer}/adpulse/api:${imageTag}'
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: concat(sharedEnv, [{ name: 'API_PORT', value: '3000' }])
          probes: [
            { type: 'Liveness', httpGet: { path: '/api/v1/health/live', port: 3000 }, periodSeconds: 30 }
            { type: 'Readiness', httpGet: { path: '/api/v1/health/ready', port: 3000 }, periodSeconds: 15 }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 5
        rules: [{ name: 'http', http: { metadata: { concurrentRequests: '50' } } }]
      }
    }
  }
}

resource worker 'Microsoft.App/containerApps@2024-03-01' = if (deployApps) {
  name: workerName
  location: location
  tags: tags
  identity: identityConfig
  dependsOn: [acrPull, vaultSecretsUser, vaultSecrets]
  properties: {
    managedEnvironmentId: appEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      registries: registryConfig
      secrets: containerSecrets
    }
    template: {
      containers: [
        {
          name: 'worker'
          image: '${registry.properties.loginServer}/adpulse/worker:${imageTag}'
          resources: { cpu: json('1.0'), memory: '2Gi' }
          env: concat(sharedEnv, [{ name: 'WORKER_HEALTH_PORT', value: '3001' }])
          probes: [{ type: 'Liveness', httpGet: { path: '/health/live', port: 3001 }, periodSeconds: 30 }]
        }
      ]
      scale: { minReplicas: workerReplicas, maxReplicas: workerReplicas }
    }
  }
}

resource web 'Microsoft.App/containerApps@2024-03-01' = if (deployApps) {
  name: webName
  location: location
  tags: tags
  identity: identityConfig
  dependsOn: [acrPull]
  properties: {
    managedEnvironmentId: appEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: { external: true, targetPort: 8080, transport: 'http', allowInsecure: false }
      registries: registryConfig
    }
    template: {
      containers: [
        {
          name: 'web'
          image: '${registry.properties.loginServer}/adpulse/web:${imageTag}'
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [{ name: 'API_UPSTREAM_HOST', value: apiName }]
          probes: [{ type: 'Liveness', httpGet: { path: '/healthz', port: 8080 }, periodSeconds: 30 }]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

// Run before each release: az containerapp job start -g <rg> -n <migrateJobName>
resource migrateJob 'Microsoft.App/jobs@2024-03-01' = if (deployApps) {
  name: migrateJobName
  location: location
  tags: tags
  identity: identityConfig
  dependsOn: [acrPull, vaultSecretsUser, vaultSecrets]
  properties: {
    environmentId: appEnvironment.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 900
      replicaRetryLimit: 0
      manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 }
      registries: registryConfig
      secrets: containerSecrets
    }
    template: {
      containers: [
        {
          name: 'migrate'
          image: '${registry.properties.loginServer}/adpulse/api:${imageTag}'
          command: ['node', 'node_modules/@adpulse/database/dist/migrate.js']
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [{ name: 'DATABASE_URL', secretRef: 'database-url' }]
        }
      ]
    }
  }
}

output publicUrl string = publicUrl
output registryLoginServer string = registry.properties.loginServer
output migrateJobName string = migrateJobName
output keyVaultName string = vault.name
output postgresHost string = postgres.properties.fullyQualifiedDomainName
