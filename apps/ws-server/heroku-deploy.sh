#!/bin/bash

# PokerWars WebSocket Server - Docker Deployment Script for Heroku
# This script deploys the server using git subtree and Docker via heroku.yml

set -e  # Exit on any error
set -o pipefail  # Exit on pipe failures

# Deployment configuration
DEPLOYMENT_TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "🚀 Deploying PokerWars WebSocket Server to Heroku using Docker..."
echo "📅 Deployment started at: $DEPLOYMENT_TIMESTAMP"

# Check if we're in the server directory
if [ ! -f "Dockerfile" ]; then
    echo "❌ Error: Run this script from the server directory"
    echo "   cd packages/nextjs/server && ./heroku-deploy.sh"
    exit 1
fi

# Check if Heroku CLI is installed
if ! command -v heroku &> /dev/null; then
    echo "❌ Error: Heroku CLI is not installed"
    echo "   Install it from: https://devcenter.heroku.com/articles/heroku-cli"
    exit 1
fi

# Check if logged in to Heroku
if ! heroku whoami &> /dev/null; then
    echo "❌ Error: Not logged in to Heroku"
    echo "   Run: heroku login"
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed"
    echo "   Install it from: https://docs.docker.com/get-docker/"
    exit 1
fi

# Get or create Heroku app (default: pokernfts-server)
read -p "Enter your Heroku app name [pokernfts-server]: " APP_NAME
APP_NAME=${APP_NAME:-pokernfts-server}

# Check if app exists, create if not
if ! heroku apps:info "$APP_NAME" &> /dev/null; then
    echo "📱 Creating Heroku app: $APP_NAME"
    heroku create "$APP_NAME"
    echo "✅ App created successfully"
else
    echo "📱 Using existing Heroku app: $APP_NAME"
fi


# Set the app to use container stack
echo "🐳 Setting Heroku stack to container..."
heroku stack:set container -a "$APP_NAME"

# Set essential environment variables
echo "🔧 Setting environment variables..."
heroku config:set NODE_ENV=production -a "$APP_NAME" --app "$APP_NAME"

# Ask if user wants to add Redis
read -p "Do you want to add Redis addon? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "📊 Adding Redis addon..."
    if ! heroku addons:info heroku-redis -a "$APP_NAME" &> /dev/null; then
        heroku addons:create heroku-redis:mini -a "$APP_NAME"
        echo "✅ Redis addon added"
    else
        echo "ℹ️  Redis addon already exists"
    fi
fi

# Ask for frontend URL for CORS
read -p "Enter your frontend URL (e.g., https://www.pokernfts.com): " FRONTEND_URL
if [ ! -z "$FRONTEND_URL" ]; then
    heroku config:set ALLOWED_WS_ORIGINS="$FRONTEND_URL" -a "$APP_NAME"
    echo "✅ WebSocket origins configured for: $FRONTEND_URL"
fi

# Deploy using git subtree (Heroku will use heroku.yml to build with Docker)
echo "📦 Deploying to Heroku..."
cd ../../../  # Go to repo root

# Add heroku remote if it doesn't exist
if ! git remote | grep -q heroku; then
    echo "🔗 Adding heroku git remote..."
    heroku git:remote -a "$APP_NAME"
fi

# Commit current changes if there are any
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "⚠️  There are uncommitted changes. Committing them now..."
    git add packages/nextjs/server/
    git commit -m "Deploy: Update server configuration for Docker deployment" || true
fi

# Check if we need to force push due to divergent histories
echo "🔍 Checking deployment status..."
HEROKU_HEAD=$(git rev-parse heroku/main 2>/dev/null || echo "none")
LOCAL_SUBTREE_HEAD=$(git subtree split --prefix=packages/nextjs/server HEAD 2>/dev/null || echo "none")

echo "📊 Current heroku/main: $HEROKU_HEAD"
echo "📊 Local subtree HEAD: $LOCAL_SUBTREE_HEAD"

if [ "$HEROKU_HEAD" != "$LOCAL_SUBTREE_HEAD" ] && [ "$HEROKU_HEAD" != "none" ]; then
    echo "🔄 Branches have diverged. Using force push to update heroku branch..."
    
    # Try subtree split and force push approach first
    echo "🚀 Force pushing subtree to Heroku..."
    SUBTREE_COMMIT=$(git subtree split --prefix=packages/nextjs/server HEAD)
    if git push heroku $SUBTREE_COMMIT:main --force; then
        echo "✅ Force push successful"
        PUSH_SUCCESS=true
    else
        echo "❌ Force push failed"
        PUSH_SUCCESS=false
    fi
else
    echo "🚀 Pushing to Heroku using subtree..."
    # Try normal subtree push first
    if git subtree push --prefix=packages/nextjs/server heroku main 2>&1; then
        echo "✅ Subtree push successful"
        PUSH_SUCCESS=true
    else
        echo "⚠️  Subtree push failed, trying force push approach..."
        SUBTREE_COMMIT=$(git subtree split --prefix=packages/nextjs/server HEAD)
        if git push heroku $SUBTREE_COMMIT:main --force; then
            echo "✅ Force push successful"
            PUSH_SUCCESS=true
        else
            echo "❌ Both push methods failed"
            PUSH_SUCCESS=false
        fi
    fi
fi

# Validate the push was successful
if [ "$PUSH_SUCCESS" != "true" ]; then
    echo "❌ Deployment failed: Unable to push to Heroku"
    echo "💡 Troubleshooting steps:"
    echo "   1. Check your Heroku app name: $APP_NAME"
    echo "   2. Verify you have push access: heroku access -a $APP_NAME"
    echo "   3. Check git remotes: git remote -v"
    exit 1
fi

# Wait a moment and verify deployment
echo "⏳ Waiting for deployment to complete..."
sleep 5

# Check if deployment actually happened
echo "🔍 Verifying deployment status..."

# Fetch latest from heroku to confirm push
git fetch heroku --quiet
NEW_HEROKU_HEAD=$(git rev-parse heroku/main 2>/dev/null || echo "none")
if [ "$NEW_HEROKU_HEAD" = "$LOCAL_SUBTREE_HEAD" ]; then
    echo "✅ Git push verified: heroku branch updated successfully"
    DEPLOYMENT_VERIFIED=true
else
    echo "❌ Git push verification failed: heroku branch not updated"
    echo "   Expected: $LOCAL_SUBTREE_HEAD"
    echo "   Actual:   $NEW_HEROKU_HEAD"
    DEPLOYMENT_VERIFIED=false
fi

# Check Heroku app status and build
echo "🔍 Checking Heroku app status..."
if heroku ps -a "$APP_NAME" --quiet; then
    echo "✅ Heroku app accessible"
else
    echo "❌ Heroku app not accessible"
    DEPLOYMENT_VERIFIED=false
fi

# Wait a bit more for build to complete
if [ "$DEPLOYMENT_VERIFIED" = "true" ]; then
    echo "⏳ Waiting for build to complete..."
    sleep 10
    
    # Check for recent releases
    echo "🔍 Checking recent releases..."
    LATEST_RELEASE=$(heroku releases -a "$APP_NAME" --limit 1 2>/dev/null | tail -n 1 | awk '{print $1}' || echo "none")
    if [ "$LATEST_RELEASE" != "none" ] && [ "$LATEST_RELEASE" != "Version" ]; then
        echo "✅ Latest release: $LATEST_RELEASE"
        
        # Check if build was successful
        RELEASE_STATUS=$(heroku releases -a "$APP_NAME" --limit 1 2>/dev/null | tail -n 1 | awk '{print $3}' || echo "unknown")
        if [ "$RELEASE_STATUS" = "succeeded" ]; then
            echo "✅ Build completed successfully"
        elif [ "$RELEASE_STATUS" = "failed" ]; then
            echo "❌ Build failed"
            DEPLOYMENT_VERIFIED=false
        else
            echo "⏳ Build status: $RELEASE_STATUS (may still be building)"
        fi
    else
        echo "⚠️  No recent releases found - build may still be in progress"
    fi
fi

# Show dyno status
echo "🔍 Checking dyno status..."
DYNO_STATUS=$(heroku ps -a "$APP_NAME" 2>/dev/null | grep web | awk '{print $2}' || echo "none")
if [ "$DYNO_STATUS" = "up" ]; then
    echo "✅ Web dyno is running"
elif [ "$DYNO_STATUS" = "crashed" ]; then
    echo "❌ Web dyno crashed"
    DEPLOYMENT_VERIFIED=false
elif [ "$DYNO_STATUS" = "none" ]; then
    echo "⚠️  No web dynos found"
else
    echo "⏳ Dyno status: $DYNO_STATUS"
fi

# Show recent logs for troubleshooting
echo "📝 Recent deployment logs:"
heroku logs --tail --num 30 -a "$APP_NAME" 2>/dev/null || echo "⚠️  Could not fetch logs"

# Start log monitoring with proper signal handling
if [ "$DEPLOYMENT_VERIFIED" = "true" ]; then
    echo ""
    echo "🔍 Starting live log monitoring..."
    echo "   Press Ctrl+C to stop log monitoring (deployment will continue running)"
    echo "   Logs will be shown for 60 seconds, then auto-stop"
    echo ""
    
    # Function to handle cleanup on script exit
    cleanup_logs() {
        if [ ! -z "$LOGS_PID" ]; then
            echo ""
            echo "⏹️  Stopping log monitoring..."
            kill $LOGS_PID 2>/dev/null || true
            wait $LOGS_PID 2>/dev/null || true
        fi
    }
    
    # Set up signal handlers
    trap cleanup_logs INT TERM EXIT
    
    # Start log monitoring in background
    heroku logs --tail -a "$APP_NAME" 2>/dev/null &
    LOGS_PID=$!
    
    # Wait for either user interrupt or timeout
    ( sleep 60; kill $LOGS_PID 2>/dev/null ) &
    TIMEOUT_PID=$!
    
    # Wait for logs process to finish (either from Ctrl+C or timeout)
    wait $LOGS_PID 2>/dev/null || true
    
    # Clean up timeout process
    kill $TIMEOUT_PID 2>/dev/null || true
    
    echo ""
    echo "📝 Log monitoring stopped."
fi

echo ""
if [ "$DEPLOYMENT_VERIFIED" = "true" ]; then
    echo "✅ Deployment completed successfully!"
    echo "🌐 Your WebSocket server is available at: https://$APP_NAME.herokuapp.com"
    echo "🔗 WebSocket URL for frontend: wss://$APP_NAME.herokuapp.com"
    echo ""
    echo "📋 Next steps:"
    echo "  1. Test your WebSocket connection"
    echo "  2. Update your frontend's NEXT_PUBLIC_WS_URL environment variable"
    echo "  3. Deploy your frontend to Vercel"
    echo ""
    echo "🔧 Useful commands:"
    echo "  heroku logs --tail -a $APP_NAME        # View live logs"
    echo "  heroku ps -a $APP_NAME                 # Check dyno status" 
    echo "  heroku config -a $APP_NAME             # View environment variables"
    echo "  heroku releases -a $APP_NAME           # View release history"
else
    echo "❌ Deployment completed but verification failed!"
    echo "🔍 Please check the following:"
    echo "  1. Build logs: heroku logs -a $APP_NAME"
    echo "  2. Release status: heroku releases -a $APP_NAME"
    echo "  3. Dyno status: heroku ps -a $APP_NAME"
    echo "  4. App configuration: heroku config -a $APP_NAME"
    echo ""
    echo "💡 If build failed, common issues:"
    echo "  • Missing dependencies in package.json"
    echo "  • Docker build errors (check heroku.yml)"
    echo "  • Environment variables not set"
    echo "  • Port binding issues (ensure PORT env var is used)"
    
    # Exit with error code to indicate deployment issues
    exit 1
fi
