# PokerWars Full Stack Verification Checklist

## ✅ Database Layer
- [x] Cloud SQL instance running
- [x] Database created (pokerwars-database)
- [x] All tables created (22 tables confirmed)
- [x] User permissions granted

## 🚀 WebSocket Server (WS)
- [ ] WS service deployed to Cloud Run
- [ ] WS health endpoint responding: `https://poker-ws-[hash].us-central1.run.app/health`
- [ ] WS can connect to database
- [ ] WS API endpoints working: `https://poker-ws-[hash].us-central1.run.app/api/*`

**Test Commands:**
```bash
# Check WS service status
gcloud run services describe poker-ws --region=us-central1

# Check WS logs
gcloud run services logs read poker-ws --region=us-central1 --limit=50
```

## 🌐 Web Application
- [ ] Web app deployed to Cloud Run
- [ ] Web app loads successfully: `https://poker-web-[hash].us-central1.run.app`
- [ ] Web app connects to WS server
- [ ] Wallet connection working
- [ ] User registration/login working

**Test Commands:**
```bash
# Check web service status
gcloud run services describe poker-web --region=us-central1

# Check web logs
gcloud run services logs read poker-web --region=us-central1 --limit=50
```

## 🔗 Integration Tests

### 1. WebSocket Connection Test
1. Open browser dev tools on web app
2. Check Network tab for WebSocket connections
3. Look for `ws://` or `wss://` connections
4. Verify no connection errors

### 2. Database Operations Test
1. Try creating a user account through web app
2. Check if user appears in database:
```sql
SELECT * FROM "User" LIMIT 5;
```

### 3. Tournament Creation Test
1. Create a tournament through web app
2. Check database:
```sql
SELECT * FROM "Tournament" ORDER BY "createdAt" DESC LIMIT 1;
SELECT * FROM "TournamentTable" ORDER BY "createdAt" DESC LIMIT 1;
```

### 4. Wallet Integration Test
1. Connect wallet to web app
2. Check if wallet address is stored:
```sql
SELECT "walletAddress" FROM "User" WHERE "walletAddress" IS NOT NULL;
```

## 📊 Monitoring & Logs

### Cloud Run Logs
```bash
# WS Server logs
gcloud run services logs read poker-ws --region=us-central1 --follow

# Web App logs
gcloud run services logs read poker-web --region=us-central1 --follow
```

### Database Monitoring
```bash
# Check active connections
gcloud sql instances describe pokerwars-instance --format="value(connectionName)"

# Query database directly
gcloud sql connect pokerwars-instance --user=pokerwars-admin
```

## 🔧 Troubleshooting

### WS Server Issues
- Check if DATABASE_URL is set correctly
- Verify VPC connector for private IP
- Check Cloud SQL IAM permissions

### Web App Issues
- Verify NEXT_PUBLIC_WS_URL is set
- Check CORS configuration
- Validate wallet configuration

### Connection Issues
- Test WebSocket connection manually
- Check firewall rules
- Verify service account permissions

## 🎯 Success Criteria

- [ ] Web app loads without errors
- [ ] WebSocket connection established
- [ ] User can register/login
- [ ] Tournament creation works
- [ ] Database operations successful
- [ ] Wallet integration functional
- [ ] Real-time game updates working

## 🚀 Go-Live Checklist

Once all tests pass:
1. Enable production domain
2. Set up monitoring alerts
3. Configure backup policies
4. Test load scenarios
5. Document known limitations
