# LEVEL/LIST — Free Hosting Guide

To host **LEVEL/LIST** on GitHub and make it publicly accessible with full server-side features (user accounts, persistent database, ListMaker admin controls), follow these steps.

---

## Why GitHub Pages Won't Work (And What To Use Instead)

> [!IMPORTANT]
> **GitHub Pages** only supports static HTML/CSS files. It **cannot** run Node.js servers, execute backend SQL databases, or securely handle login sessions/password hashing.

To host your full-stack app for **100% free** while saving all data permanently and keeping GitHub integration:

1. **GitHub Repository**: Store your source code on GitHub.
2. **Render.com / Railway.app / Glitch**: Connect your GitHub repository to a free hosting service that runs Node.js & SQLite.

---

## Step-by-Step Hosting Guide

### Step 1: Push Your Code to GitHub

Open your terminal in the project directory (`c:\Users\rando\Documents\antigravity\charming-faraday`) and run:

```bash
# 1. Initialize git (if not done)
git init

# 2. Add files and commit
git add .
git commit -m "Initial commit of LEVEL/LIST"

# 3. Create a repository on GitHub (github.com/new) and link it:
git remote add origin https://github.com/YOUR_USERNAME/level-list.git
git branch -M main
git push -u origin main
```

---

### Step 2: Deploy for Free on Render.com (Recommended)

1. Sign up for a free account at **[render.com](https://render.com/)**.
2. Click **New +** → **Web Service**.
3. Select **Build and deploy from a Git repository** and connect your GitHub repo `level-list`.
4. Fill in the deployment details:
   - **Name**: `level-list`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: `Free`
5. Click **Create Web Service**.

### How to Keep Levels & Users Saved Permanently Across Website Updates

By default, cloud servers like Render use **ephemeral disks**, which wipe local files whenever a new commit is pushed to GitHub. To make sure your added levels, player registrations, and points **NEVER get reset**:

#### On Render.com:
1. Go to your Render Dashboard (`dashboard.render.com`).
2. Click your web service (`thehardestgolflist`).
3. Click **Disks** on the left menu → Click **Add Disk**.
4. Set:
   - **Name**: `golflist-db-disk`
   - **Mount Path**: `/var/data`
   - **Size**: `1 GB`
5. Click **Environment** on the left menu → Click **Add Environment Variable**.
6. Set:
   - **Key**: `DB_PATH`
   - **Value**: `/var/data/levellist.db`
7. Click **Save Changes**.

> [!IMPORTANT]
> Once `/var/data/levellist.db` is configured as a Mounted Disk, all levels, players, and completions are stored on permanent cloud storage. They will **NEVER** reset, delete, or wipe when you push updates to GitHub or restart the server!

---

### Alternative: Deploy on Glitch (Instant & Easiest)

1. Go to **[glitch.com](https://glitch.com)** and create a free account.
2. Click **New Project** → **Import from GitHub**.
3. Paste your GitHub repository URL.
4. Glitch will instantly host your app with live editing and SQLite data persistence!

---

## Admin Account Credentials

Your prebuilt administrator account is automatically generated on the first database boot:

- **Username**: `listmaker`
- **Password**: `!ListMaker69$`
- **Admin Panel URL**: `/admin` (or click **Admin** in the top navigation bar when signed in)

*(The password is hashed using bcrypt server-side and is never displayed in the UI).*
