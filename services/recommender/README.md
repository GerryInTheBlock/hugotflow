# HugotFlow recommender (FastAPI)

The C4.5-style decision tree service from Chapter 3 (Figures 17–19). It builds a member's safe plan for the day:

1. **Consent check:** members under 18 with a limitation need a verified guardian consent first.
2. **Severity gate:** a severe limitation, or pain reported today, logs a High-Risk Alert for the on-call instructor.
3. **Tree:** the feature row (`app/features.py`) goes through the trained `DecisionTreeClassifier(criterion="entropy")`,
   which predicts one of 7 program classes (`app/programs.json`); the decision path is kept for the Engine page.
4. **Routine:** the class becomes exercises from the catalogue (`ml/catalogue.json`, seeded by migration 0010), leaving
   out exercises that strain the member's limitation or need Out of Order equipment and using the Appendix 2 substitutes.
5. **Save:** through `record_recommendation()` (server key only), which also raises the alert.

| Endpoint | What |
| --- | --- |
| `GET /health` | status, uptime, model version |
| `GET /model` | model card: parameters, test metrics, IF-THEN rules |
| `POST /recommend` | `Authorization: Bearer <member's login token>`, body `{"user_id": optional}` (instructors and the owner may ask for any member) |

## Train the model (once, and after changing the rules)

```powershell
cd C:\Users\Gerry\Documents\HugotFlow
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r services/recommender/requirements-dev.txt
python ml/generate_dataset.py      # ml/data/training.csv (3,000 synthetic rows)
python ml/train.py                 # services/recommender/model/model.joblib + model_card.json
python ml/evaluate.py              # ml/report.md (metrics, confusion matrix, gain ratios, rules)
python -m pytest ml services/recommender
```

Commit `services/recommender/model/` after training: the server loads that file. Pin `scikit-learn` in
`requirements.txt` to the version in `model_card.json` (`sklearn_version`).

## Run it locally

```powershell
$env:SUPABASE_URL = "https://<project>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service role key>"   # never commit this
cd services/recommender
uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000/docs. The app reads the address from `EXPO_PUBLIC_RECOMMENDER_URL` in `client/.env`.

## Deploy on Render (free)

1. Push the repository to GitHub.
2. In Render: **New → Blueprint**, pick the repository. `render.yaml` at the root creates `hugotflow-recommender`.
3. In the service's **Environment** tab, set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `ALLOWED_ORIGINS`
   (the web console address, e.g. `https://hugotflow.example.com,http://localhost:8081`).
4. Put the Render URL in `client/.env` as `EXPO_PUBLIC_RECOMMENDER_URL`.

The free plan sleeps after 15 minutes without requests; the first request then takes about 30–60 seconds. The app
waits up to 90 seconds and says the engine is waking up. Note this for the ISO time-behaviour test, or use a paid
instance for the evaluation.
