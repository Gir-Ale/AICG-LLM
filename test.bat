cd /d "%~dp0"

start "" chrome --incognito "http://localhost:8000/index.html"

python -m http.server