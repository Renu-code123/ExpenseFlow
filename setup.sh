#!/bin/bash

# ExpenseFlow Development Setup Script
# This script helps you set up the development environment

echo "🚀 ExpenseFlow Development Setup"
echo "================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo "✅ npm version: $(npm --version)"
echo ""

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
else
    echo "✅ Dependencies already installed"
    echo ""
fi

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your actual configuration values"
    echo ""
else
    echo "✅ .env file already exists"
    echo ""
fi

# Check if MongoDB is running
echo "🔍 Checking MongoDB connection..."
if command -v mongod &> /dev/null; then
    echo "✅ MongoDB is installed"
else
    echo "⚠️  MongoDB not found locally. Make sure you have:"
    echo "   - MongoDB installed locally, OR"
    echo "   - MongoDB Atlas connection string in .env"
fi
echo ""

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p logs
mkdir -p uploads
mkdir -p public/receipts
echo "✅ Directories created"
echo ""

# Show next steps
echo "🎉 Setup Complete!"
echo ""
echo "📋 Next Steps:"
echo "1. Edit .env file with your configuration"
echo "2. Make sure MongoDB is running"
echo "3. Run 'npm run dev' to start the development server"
echo "4. Open http://localhost:5000 in your browser"
echo ""
echo "📚 Useful Commands:"
echo "   npm run dev     - Start development server with auto-reload"
echo "   npm start       - Start production server"
echo ""
echo "📖 Documentation:"
echo "   README.md                - Project overview"
echo "   CONTRIBUTION_GUIDE.md    - How to contribute"
echo "   BACKEND.md              - Backend documentation"
echo "   DATABASE.md             - Database schema"
echo ""
echo "Happy coding! 🎉"
