# AWS Windows EC2 Deployment

This app should be deployed on a Windows EC2 instance because certificate PDF generation depends on:

- Windows PowerShell
- Microsoft PowerPoint installed on the server

## Recommended Instance

- OS: Windows Server 2022 Base
- Instance type: `t3.large` for small traffic or `m6i.large` for safer headroom
- Storage: at least `50 GB`

## Open Ports

Allow these inbound rules in the EC2 security group:

- `3389` for RDP, restricted to your IP
- `80` for HTTP
- `443` for HTTPS
- `3000` only if you want to test Next.js directly before setting up a reverse proxy

## Server Setup

RDP into the instance, then install:

1. Node.js LTS
2. Git
3. Microsoft PowerPoint
4. PM2

Install PM2:

```powershell
npm install -g pm2
```

## App Setup

Clone or copy the project onto the server:

```powershell
git clone <your-repo-url>
cd ORIGIN-SF-CERTIFICATES
```

Install dependencies and build:

```powershell
npm install
npm run build
```

Create `.env.local` in the project root with:

```env
GOOGLE_SERVICE_ACCOUNT_KEY='...'
CERT_TEMP_FOLDER_ID='...'
```

## Start The App

Run:

```powershell
pm2 start ecosystem.config.cjs
pm2 save
```

Verify:

```powershell
pm2 status
curl http://localhost:3000
```

## Auto Start On Reboot

Run:

```powershell
pm2 startup
```

PM2 will print one extra command. Run that command in an elevated PowerShell window.

## Domain And HTTPS

Use one of these:

- IIS reverse proxy to `http://localhost:3000`
- Nginx for Windows reverse proxy to `http://localhost:3000`
- AWS Application Load Balancer in front of the instance

If you use a domain:

1. Point the domain to the EC2 public IP or Load Balancer
2. Terminate HTTPS at IIS, Nginx, or the ALB

## Deployment Updates

When you ship a new version:

```powershell
git pull
npm install
npm run build
pm2 restart origin-sf-certificates
```

## Important Note

Do not deploy this app to Vercel or Linux-only hosts in the current architecture. The local certificate fallback requires PowerPoint on Windows.
