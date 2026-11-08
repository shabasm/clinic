# Clinic Management System: Git Guide for the Team

Read this once before you write any code. All commands are for **Windows PowerShell**, run from the `clinic` folder (the repo root) unless stated otherwise.

## 1. Branches and who owns what

| Branch | Owner | Backend app | Frontend folder |
|---|---|---|---|
| `main` | nobody (stable releases only) | | |
| `develop` | shared (all finished work is merged here) | | |
| `dev/admin` | Member 1 | `apps/admin_module` | `src/pages/admin/` |
| `dev/reception` | Member 2 | `apps/reception` | `src/pages/reception/` |
| `dev/doctor` | Member 3 | `apps/doctor` | `src/pages/doctor/` |
| `dev/pharmacy` | Member 4 | `apps/pharmacy` | `src/pages/pharmacy/` |
| `dev/lab` | Member 5 | `apps/lab` | `src/pages/lab/` |

**Rules**

1. Never push directly to `main` or `develop`. Always work on your own `dev/...` branch and merge through a pull request.
2. Work only inside your own app and `pages/` folder. If you need something changed elsewhere, ask the owner.
3. **Only Member 1 changes `apps/admin_module/models.py` and creates migration files.** If you need a new field or model, tell Member 1. Two people creating migrations at the same time is the most common cause of broken Django projects.
4. Shared frontend code (`src/services/`, `src/components/`, `src/context/`) belongs to whoever builds it first. Before you add a new shared file, check that nobody else has already.
5. Never commit secrets. Your `.env` file stays on your computer.

## 2. First-time setup (do this once)

**Needs:** Python 3.10+, Node.js (LTS), Git, and MySQL running locally.

```powershell
git clone <repo-url>
cd clinic
git checkout dev/<your-module>
```

**Backend**
```powershell
cd backend
python -m venv venv
venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```
Open `backend\.env` and fill in your own MySQL details (`DB_PASSWORD` and so on). Create an empty MySQL database named `clinicms`, then:
```powershell
python manage.py migrate
python manage.py runserver
```

**Frontend** (in a second terminal)
```powershell
cd frontend
npm install
npm run dev
```

If PowerShell blocks `Activate.ps1`, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once and try again.

## 3. Daily workflow

**Start of every day, before you write anything:**
```powershell
git checkout dev/<your-module>
git pull origin develop
```
This brings your teammates' merged work into your branch. Then update your setup if needed:
```powershell
pip install -r requirements.txt      # if requirements.txt changed
python manage.py migrate             # if anyone changed the models
npm install                          # if package.json changed (run in frontend/)
```

**While you work:** commit small and often, so each commit is one clear piece of work.
```powershell
git status
git add .
git commit -m "Add lab result serializer"
```
Before you commit, read the `git status` list. If you see `venv`, `node_modules`, `.env` or `db.sqlite3`, stop and ask for help.

**End of the day (or when a piece is done):**
```powershell
git push -u origin dev/<your-module>
```
The `-u` is only needed the first time. After that, `git push` is enough.

## 4. Opening a pull request

1. Push your branch, then open the repo on GitHub.
2. Click **Compare & pull request**.
3. Set **base** to `develop` (not `main`) and **compare** to your branch.
4. Write a short description of what you added.
5. Open the **Files changed** tab and check that only your own files are listed.
6. Create the pull request and tell the team. Someone else should review it before it is merged.

After it is merged, everyone runs `git pull origin develop` on their branch.

## 5. Handling conflicts

A conflict means two people changed the same lines. Git stops the merge and names the files.

1. Open each named file and look for these markers:
   ```
   <<<<<<< HEAD
   your version
   =======
   incoming version
   >>>>>>> develop
   ```
2. Keep the right lines (often **both**), then delete the three marker lines.
3. Save, then run:
   ```powershell
   git add .
   git commit
   ```
4. Run the app to make sure it still works.

The file most likely to conflict is `backend/config/urls.py`, because each module adds its own `path(...)` line there. When it happens, keep **all** the lines. If you are unsure about any conflict, stop and ask. Don't guess.

## 6. Common problems

| Problem | Fix |
|---|---|
| `git push` is rejected | Run `git pull origin <your-branch>`, then push again. |
| "Your local changes would be overwritten" | Commit first, or run `git stash` and then `git stash pop` after pulling. |
| Committed a file by mistake (like `.env`) | Tell the team lead right away, before pushing. |
| `django.db.utils.OperationalError` | Check MySQL is running and your `.env` values are correct. |
| New model errors after pulling | Run `python manage.py migrate`. |
| Not sure which branch you're on | Run `git branch`; the current one has a star. |

## 7. Commit message tips

Start with a verb and say what changed: `Add lab bill serializer`, `Fix token number validation`, `Update reception patient form`. Avoid vague messages such as `changes` or `fix`.
