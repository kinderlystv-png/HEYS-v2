#!/usr/bin/env python3
"""
Simple HTTP server for HEYS production testing
Usage: python serve.py [port]
Default port: 8080
"""

import http.server
import socketserver
import sys
import os

# Default port
PORT = 8080

# Get port from command line argument
if len(sys.argv) > 1:
    try:
        PORT = int(sys.argv[1])
    except ValueError:
        print(f"Invalid port: {sys.argv[1]}. Using default port {PORT}")

# Set up server
class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add CORS headers for development
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        # Disable caching for development
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

# Start server
with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
    print(f"🚀 HEYS Production Server running at:")
    print(f"   Local:  http://localhost:{PORT}/")
    print(f"   Network: http://127.0.0.1:{PORT}/")
    print("")
    print("📂 Serving files from current directory")
    print("🛑 Press Ctrl+C to stop the server")
    print("")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
        sys.exit(0)
