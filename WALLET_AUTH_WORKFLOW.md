# Wallet Authentication & Coin Claim Workflow

## 🎯 Complete Working System Requirements

To have users claim 1000 coins with full ledger logging, the following must work:

### ✅ Backend (Implemented)
- [x] Database with tables (User, Account, LedgerTransaction, Treasury)
- [x] WS server with `/api/user/claim` endpoint
- [x] Ledger service that records all transactions
- [x] Treasury with 5B coin supply
- [x] Claim logic (1000 coins, 10-hour cooldown)

### ❌ Frontend (Missing)
- [ ] Wallet authentication flow
- [ ] Automatic wallet verification on connect
- [ ] Proper error handling for 401 responses
- [ ] User feedback for authentication states

### 🔄 Complete Workflow

```
1. User opens web app
2. User connects wallet
3. Frontend detects wallet connection
4. Frontend requests auth challenge from WS server
5. WS server returns nonce + message
6. Frontend requests wallet signature
7. User approves signature in wallet
8. Frontend sends signature to WS server for verification
9. WS server validates signature, adds wallet to verifiedWallets
10. Frontend shows "Authenticated" status
11. User can now claim coins
12. Frontend calls /api/user/claim
13. WS server processes claim, creates ledger transaction
14. Database records: CLAIM_FREE transaction
15. Treasury supply decreases by 1000
16. User account increases by 1000
17. Frontend shows success + updated balance
```

## 🚨 Current Issues

### **Issue 1: No Wallet Authentication**
```javascript
// Frontend currently does this (fails with 401):
fetch('/api/user/claim?wallet=0x...', { method: 'POST' })
```

**But needs authentication first:**
```javascript
// 1. Get challenge
const { nonce, message } = await fetch('/api/auth/challenge?wallet=...')

// 2. Sign message
const signature = await wallet.signMessage(message)

// 3. Verify signature
await fetch('/api/auth/verify', {
  method: 'POST',
  body: { wallet, signature }
})

// 4. Now claim works
await fetch('/api/user/claim?wallet=...')
```

### **Issue 2: No User Feedback**
- Users don't know they need to authenticate
- No indication of authentication status
- Errors aren't user-friendly

## 🛠️ Implementation Plan

### **Phase 1: Basic Authentication Hook**
```typescript
// hooks/useAuth.ts
export function useAuth() {
  const [authStatus, setAuthStatus] = useState<'none' | 'challenging' | 'signing' | 'verifying' | 'verified' | 'failed'>('none');

  const authenticate = async (walletAddress: string) => {
    try {
      setAuthStatus('challenging');

      // 1. Get challenge
      const challengeRes = await fetch(`${API_BASE}/api/auth/challenge?wallet=${walletAddress}`);
      const { nonce, message } = await challengeRes.json();

      setAuthStatus('signing');

      // 2. Sign message (requires wallet integration)
      const signature = await requestWalletSignature(message);

      setAuthStatus('verifying');

      // 3. Verify signature
      const verifyRes = await fetch(`${API_BASE}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: walletAddress, signature })
      });

      if (verifyRes.ok) {
        setAuthStatus('verified');
        return true;
      } else {
        setAuthStatus('failed');
        return false;
      }
    } catch (error) {
      setAuthStatus('failed');
      return false;
    }
  };

  return { authStatus, authenticate };
}
```

### **Phase 2: Wallet Provider Integration**
```typescript
// components/providers/WalletProvider.tsx
function WalletProvider({ children }: { children: ReactNode }) {
  const { address, status } = useWagmiWallet();
  const { authStatus, authenticate } = useAuth();

  // Auto-authenticate when wallet connects
  useEffect(() => {
    if (status === 'connected' && address && authStatus === 'none') {
      authenticate(address);
    }
  }, [status, address, authStatus, authenticate]);

  const contextValue = {
    // ... existing
    isAuthenticated: authStatus === 'verified',
    authStatus,
  };

  return (
    <WalletContext.Provider value={contextValue}>
      {children}
    </WalletContext.Provider>
  );
}
```

### **Phase 3: UI Authentication States**
```typescript
// components/WalletStatus.tsx
function WalletStatus() {
  const { address, status, isAuthenticated, authStatus } = useWallet();

  if (status !== 'connected') {
    return <div>Connect Wallet</div>;
  }

  if (authStatus === 'verified') {
    return <div>✅ Authenticated</div>;
  }

  if (authStatus === 'signing') {
    return <div>🔐 Sign authentication message...</div>;
  }

  if (authStatus === 'failed') {
    return <div>❌ Authentication failed</div>;
  }

  return <div>Authenticating...</div>;
}
```

### **Phase 4: Claim Button with Auth Check**
```typescript
// hooks/useBalances.ts
export function useBalances() {
  const { isAuthenticated } = useWallet();

  const claimFreeCoins = useCallback(async () => {
    if (!isAuthenticated) {
      return { ok: false, error: 'Wallet not authenticated' };
    }

    // ... existing claim logic
  }, [isAuthenticated]);

  return {
    // ... existing
    canClaim: hydrated && remainingMs === 0 && isAuthenticated,
  };
}
```

## 🧪 Testing the Complete Flow

### **Manual Test Steps:**
```bash
# 1. Start with ALLOW_UNVERIFIED_WALLETS=1 (for initial testing)
export ALLOW_UNVERIFIED_WALLETS=1
./scripts/gcp_deploy_ws.sh

# 2. Test claim directly
curl -X POST "https://ws.pokerwars.xyz/api/user/claim?wallet=0x742d35Cc6634C0532925a3b844Bc454e4438f44e"

# Expected: 200 OK, 1000 coins added, ledger transaction created

# 3. Check database
gcloud sql databases execute pokerwars-instance \
  --command="SELECT type, amount, \"referenceType\" FROM \"LedgerTransaction\" ORDER BY \"createdAt\" DESC LIMIT 1;"

# Expected: CLAIM_FREE, 1000, USER
```

### **Full User Journey:**
1. User visits web app
2. Clicks "Connect Wallet"
3. Signs authentication message
4. Sees "✅ Authenticated"
5. Clicks "Claim Free Coins"
6. Gets +1000 coins
7. Transaction logged in ledger

## 📊 Database Verification

After successful claim, check:

```sql
-- User account balance
SELECT coins FROM "Account"
WHERE "ownerType" = 'USER'
AND "ownerId" IN (
  SELECT id FROM "User" WHERE "walletAddress" = '0x...'
);

-- Ledger transaction
SELECT * FROM "LedgerTransaction"
WHERE type = 'CLAIM_FREE'
ORDER BY "createdAt" DESC LIMIT 1;

-- Treasury supply
SELECT coin_supply_remaining FROM "Treasury";
```

## 🎯 Current Status Summary

### **✅ Working:**
- Database tables and relationships
- WS server endpoints (`/api/user/claim`, `/api/auth/*`)
- Ledger transaction creation and logging
- Treasury supply management
- Claim logic (1000 coins, 10-hour cooldown)

### **❌ Missing:**
- Frontend wallet authentication flow
- Automatic auth on wallet connect
- User feedback for auth states
- Integration between wallet connect and API calls

### **🔄 Next Steps:**
1. Implement `useAuth` hook
2. Add authentication to wallet provider
3. Update UI to show auth status
4. Test complete user journey
5. Remove `ALLOW_UNVERIFIED_WALLETS=1` for production

**The backend is fully ready - just need frontend authentication integration!** 🔐✨
