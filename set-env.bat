@echo off
set GOOGLE_SERVICE_ACCOUNT_KEY=^<paste the single-line JSON from sample-service-account.json here^>
node -e "console.log('Loaded:', JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY).client_email)"

