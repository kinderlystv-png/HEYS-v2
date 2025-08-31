#!/usr/bin/env python3
"""
Smart HTTP server for HEYS production with automatic port detection
Automatically finds free port and opens browser
"""

import http.server
import socketserver
import sys
import os
import webbrowser
import socket
from threading import Timer

def find_free_port(start_port=8080):
    """Find a free port starting from start_port"""
    port = start_port
    while port < start_port + 100:  # Try 100 ports
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('localhost', port))
                return port
        except socket.error:
            port += 1
    return None

def open_browser(url):
    """Open browser after a short delay"""
    print(f"🌍 Opening browser at {url}")
    webbrowser.open(url)

# Find free port
PORT = find_free_port(8080)
if not PORT:
    print("❌ Cannot find free port between 8080-8179")
    sys.exit(1)

# Set up server with CORS and no-cache headers
class SmartHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        # Disable caching for development
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
    
    def log_message(self, format, *args):
        # Suppress default logging for cleaner output
        pass

# Start server
try:
    with socketserver.TCPServer(("", PORT), SmartHTTPRequestHandler) as httpd:
        url = f"http://localhost:{PORT}/"
        
        print(f"🚀 HEYS Smart Server running!")
        print(f"📍 URL: {url}")
        print(f"📂 Serving: {os.getcwd()}")
        print("")
        print("🛑 Press Ctrl+C to stop")
        print("")
        
        # Open browser after 1 second delay
        Timer(1.0, open_browser, [url]).start()
        
        # Start serving
        httpd.serve_forever()
        
except KeyboardInterrupt:
    print("\n🛑 Server stopped by user")
    sys.exit(0)
except Exception as e:
    print(f"❌ Server error: {e}")
    sys.exit(1)
