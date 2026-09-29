using './main.bicep'

// Non-secret settings. Secrets are read from the shell environment at deploy time so they never
// land in source control:  export ADPULSE_PG_PASSWORD=... ADPULSE_JWT_ACCESS=... etc.
param prefix = 'adpulse'
param environmentName = 'prod'
param imageTag = readEnvironmentVariable('IMAGE_TAG', 'latest')
param integrationMode = 'google'
param googleClientId = readEnvironmentVariable('GOOGLE_CLIENT_ID', '')
param googleAdsLoginCustomerId = readEnvironmentVariable('GOOGLE_ADS_LOGIN_CUSTOMER_ID', '')
param emailProvider = 'smtp'
param smtpHost = readEnvironmentVariable('SMTP_HOST', '')
param smtpUser = readEnvironmentVariable('SMTP_USER', '')

param postgresAdminPassword = readEnvironmentVariable('ADPULSE_PG_PASSWORD')
param jwtAccessSecret = readEnvironmentVariable('ADPULSE_JWT_ACCESS_SECRET')
param jwtRefreshSecret = readEnvironmentVariable('ADPULSE_JWT_REFRESH_SECRET')
param encryptionKey = readEnvironmentVariable('ADPULSE_ENCRYPTION_KEY')
param googleClientSecret = readEnvironmentVariable('GOOGLE_CLIENT_SECRET', '')
param googleAdsDeveloperToken = readEnvironmentVariable('GOOGLE_ADS_DEVELOPER_TOKEN', '')
param smtpPassword = readEnvironmentVariable('SMTP_PASSWORD', '')
