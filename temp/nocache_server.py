
import http.server, socketserver, os, sys, webbrowser

# Serve files from the folder where this script is located
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(SCRIPT_DIR)

PORT = int(os.environ.get("PORT", "8000"))
INDEX = os.environ.get("INDEX", "")  # e.g., "heys_modular_app_light.html"

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format, *args):
        sys.stderr.write("%s - - [%s] %s\n" % (self.client_address[0],
                          self.log_date_time_string(), format%args))

if __name__ == "__main__":
    url = f"http://127.0.0.1:{PORT}/" + (INDEX or "")
    print(f"Serving at {url}  (no-cache)")
    if INDEX:
        # Open browser tab automatically
        try:
            webbrowser.open(url, new=1)
        except Exception:
            pass
    with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            httpd.server_close()
