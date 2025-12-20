cd /d "%~dp0"

start "" brave --incognito "http://localhost:8000/index.html"

python -m http.server