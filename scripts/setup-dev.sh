#!/bin/bash

# Setup script for local development
echo "Setting up FaultMaven Copilot for local development..."

# Create .env.local file with local API endpoint
cat > .env.local << EOF
# Local development API endpoint
# Uncomment the line below to use local development server
VITE_API_URL=http://api.faultmaven.local:8000
EOF

echo "✅ Created .env.local with local API endpoint"
echo "📝 API URL set to: http://api.faultmaven.local:8000"
echo ""
echo "🔧 Configuration Summary:"
echo "   - Development: http://api.faultmaven.local:8000"
echo "   - Production:  https://api.faultmaven.ai (default)"
echo ""
echo "🚀 To start development:"
echo "   pnpm dev"
echo ""
echo "🔄 To switch back to production API:"
echo "   rm .env.local"
echo "   pnpm dev"
echo ""
echo "📦 To build for production (always uses production API):"
echo "   rm .env.local  # Ensure no local config"
echo "   pnpm build" 