#!/bin/bash
cd "$(dirname "$0")"

echo ""
echo " ======================================="
echo "  DAREMAXXING - Starting Server..."
echo " ======================================="
echo ""

if ! command -v node &> /dev/null; then
    echo " ERROR: Node.js is not installed!"
    echo " Download from: https://nodejs.org"
    echo " Install it, then double-click this file again."
    read -p "Press Enter to exit..."
    exit 1
fi

echo " Installing dependencies..."
npm install

echo ""
echo " Starting server..."
echo " Opening browser at: http://localhost:3000"
echo ""
open "http://localhost:3000"
node server.js
