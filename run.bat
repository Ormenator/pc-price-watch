@echo off
cd /d "%~dp0"
if not exist .venv (
  "C:\Users\hohar\AppData\Local\Programs\Python\Python311\python.exe" -m venv .venv
)
call .venv\Scripts\activate.bat
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8787
