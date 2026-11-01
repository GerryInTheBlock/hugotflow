# HugotFlow recommender (FastAPI)

The C4.5-style decision tree service from Chapter 3. In Iteration 0 it runs as a shell with
`/health`, `/model` and a `/recommend` stub; training and real predictions come in Iteration 4.

## Run it (Windows PowerShell)

```powershell
cd services/recommender
py -3.11 -m venv .venv          # any Python 3.10+
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000/docs to try the endpoints.
