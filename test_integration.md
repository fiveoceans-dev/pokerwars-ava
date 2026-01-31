# PokerWars Full Stack Integration Test

## ✅ Database Deployment Confirmed
- 22 tables created successfully
- Core tables: User, Account, Tournament*, Ledger*, GameTemplate
- Database connectivity verified

## 🧪 Integration Test Steps

### 1. WebSocket Server Health Check
```bash
# Test WS server health endpoint
curl https://poker-ws-[hash].us-central1.run.app/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-31T16:30:00.000Z",
  "websocket": {
    "connections": 0,
    "tables": 0
  },
  "database": {
    "connected": true,
    "tableCount": 22,
    "userCount": 0,
    "timestamp": "2026-01-31T16:30:00.000Z"
  }
}
```

### 2. WebSocket API Endpoints
```bash
# Test WS API endpoints
curl https://poker-ws-[hash].us-central1.run.app/api/tables
curl https://poker-ws-[hash].us-central1.run.app/api/tournaments
```

### 3. Web Application Test
1. Open web app in browser: `https://poker-web-[hash].us-central1.run.app`
2. Check browser console for WebSocket connection attempts
3. Look for successful WS connection: `ws://poker-ws-[hash].us-central1.run.app`

### 4. End-to-End User Flow
1. **Register/Login**: Try creating a user account
2. **Check Database**: Verify user appears in DB
   ```sql
   SELECT * FROM "User" ORDER BY "createdAt" DESC LIMIT 1;
   ```

3. **Create Tournament**: Try creating a tournament
4. **Check Database**: Verify tournament data
   ```sql
   SELECT * FROM "Tournament" ORDER BY "createdAt" DESC LIMIT 1;
   SELECT * FROM "TournamentTable" ORDER BY "createdAt" DESC LIMIT 1;
   ```

5. **Wallet Connection**: Test wallet integration
6. **Check Database**: Verify wallet address stored
   ```sql
   SELECT "walletAddress" FROM "User" WHERE "walletAddress" IS NOT NULL;
   ```

### 5. Real-time Features Test
1. Open two browser tabs with the web app
2. Create/join a game in one tab
3. Verify real-time updates appear in the other tab
4. Check WebSocket connection status in browser dev tools

## 📊 Monitoring Commands

### Check Service Status
```bash
# WS Server
gcloud run services describe poker-ws --region=us-central1 --format="value(status.url)"

# Web App
gcloud run services describe poker-web --region=us-central1 --format="value(status.url)"
```

### Monitor Logs
```bash
# WS Server logs (real-time)
gcloud run services logs read poker-ws --region=us-central1 --follow

# Web App logs (real-time)
gcloud run services logs read poker-web --region=us-central1 --follow
```

### Database Queries
```bash
# Connect to database
gcloud sql connect pokerwars-instance --user=pokerwars-admin

# Check tables
\d

# Check recent users
SELECT id, "walletAddress", "createdAt" FROM "User" ORDER BY "createdAt" DESC LIMIT 5;

# Check active tournaments
SELECT id, name, status, "createdAt" FROM "Tournament" ORDER BY "createdAt" DESC LIMIT 5;

# Check ledger transactions
SELECT type, "asset", amount, "createdAt" FROM "LedgerTransaction" ORDER BY "createdAt" DESC LIMIT 10;
```

## 🚨 Troubleshooting

### WS Server Issues
- **Health endpoint fails**: Check DATABASE_URL environment variable
- **Database connection fails**: Verify VPC connector and permissions
- **WebSocket connections fail**: Check CORS configuration

### Web App Issues
- **Page doesn't load**: Check NEXT_PUBLIC_WS_URL environment variable
- **WebSocket connection fails**: Verify WS server is running and accessible
- **Wallet connection fails**: Check wallet configuration and network settings

### Database Issues
- **Connection timeout**: Check VPC connector configuration
- **Permission denied**: Verify database user permissions
- **Data not persisting**: Check transaction commits and error handling

## 🎯 Success Criteria

- [ ] WS server health endpoint returns `status: "healthy"`
- [ ] Database connectivity confirmed (`connected: true`)
- [ ] Web app loads successfully
- [ ] WebSocket connection established (no console errors)
- [ ] User registration works and data appears in database
- [ ] Tournament creation works
- [ ] Wallet integration functional
- [ ] Real-time updates working between browser tabs

## 🚀 Production Readiness

Once all tests pass:
1. Set up monitoring alerts for service health
2. Configure log exports for analysis
3. Set up database backups
4. Test under load conditions
5. Document API endpoints and usage

## 📞 Support

If any test fails, check:
1. Cloud Run service logs for error details
2. Database connection and permissions
3. Environment variable configuration
4. Network connectivity and VPC settings
