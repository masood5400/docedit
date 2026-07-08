@echo off
title DocEdit - local server
cd /d "%~dp0"

echo Starting DocEdit...

where python >nul 2>nul
if %errorlevel%==0 (
    start "" http://localhost:8321/index.html
    python -m http.server 8321
    goto :eof
)

where py >nul 2>nul
if %errorlevel%==0 (
    start "" http://localhost:8321/index.html
    py -m http.server 8321
    goto :eof
)

where node >nul 2>nul
if %errorlevel%==0 (
    start "" http://localhost:8321/index.html
    node -e "const h=require('http'),f=require('fs'),p=require('path');const m={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon'};h.createServer((q,s)=>{let u=decodeURIComponent(q.url.split('?')[0]);if(u==='/')u='/index.html';const fp=p.join(__dirname,u);f.readFile(fp,(e,d)=>{if(e){s.writeHead(404);s.end('Not found');return}s.writeHead(200,{'Content-Type':m[p.extname(fp)]||'application/octet-stream'});s.end(d)})}).listen(8321,()=>console.log('DocEdit running at http://localhost:8321'))"
    goto :eof
)

echo No Python or Node found - opening directly in the browser (file mode).
start "" "%~dp0index.html"
