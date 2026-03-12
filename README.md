# ClassTrack – Attendance Manager
### Step-by-Step Deployment Guide (No Coding Experience Needed)

---

## PART 1 — Set Up Supabase (Cloud Database) [15 mins]

1. Go to https://supabase.com → Click "Start your project" → Sign up free
2. Click "New project" → Give it a name like "classtrack" → Set a password → Click "Create"
3. Wait ~2 minutes for it to set up
4. On the left sidebar click "SQL Editor"
5. Click "New query"
6. Open the file `supabase_setup.sql` from this folder → Copy ALL the text → Paste it into the SQL Editor
7. Click the green "Run" button
8. You should see "Success. No rows returned" — that means it worked ✅
9. Now click "Project Settings" (gear icon, bottom left) → Click "API"
10. You will see two things — copy them somewhere safe:
    - **Project URL** → looks like: `https://abcdefgh.supabase.co`
    - **anon public key** → a long text starting with `eyJ...`

---

## PART 2 — Add Your Supabase Keys to the App [2 mins]

1. Open the file `src/App.jsx` in any text editor (Notepad on Windows, TextEdit on Mac)
2. Find lines 8 and 9 near the top that say:
   ```
   const SB_URL  = "YOUR_SUPABASE_URL";
   const SB_KEY  = "YOUR_SUPABASE_ANON_KEY";
   ```
3. Replace `YOUR_SUPABASE_URL` with your Project URL (keep the quotes)
4. Replace `YOUR_SUPABASE_ANON_KEY` with your anon key (keep the quotes)
5. Save the file

Example of what it should look like after:
```
const SB_URL  = "https://abcdefgh.supabase.co";
const SB_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
```

---

## PART 3 — Upload to GitHub [5 mins]

1. Go to https://github.com → Sign up / Log in (free)
2. Click the "+" icon (top right) → "New repository"
3. Name it `classtrack` → Keep it Public → Click "Create repository"
4. On the next page, click "uploading an existing file"
5. Drag and drop the ENTIRE `classtrack` folder into the upload area
6. Scroll down → Click "Commit changes" (green button)

---

## PART 4 — Deploy on Vercel (Makes it Live!) [5 mins]

1. Go to https://vercel.com → Sign up with your GitHub account (free)
2. Click "Add New..." → "Project"
3. You'll see your `classtrack` repository → Click "Import"
4. Leave all settings as default → Click "Deploy"
5. Wait ~2 minutes → Vercel gives you a live link! 🎉
   Example: `https://classtrack-yourname.vercel.app`

---

## PART 5 — Install on Your Phone [1 min]

### Android (Chrome browser):
1. Open your Vercel link in Chrome
2. Tap the ⋮ menu (three dots, top right)
3. Tap "Add to Home screen"
4. Tap "Add"
5. ClassTrack icon appears on your home screen — tap it to open like a real app! 📱

### iPhone (Safari browser):
1. Open your Vercel link in Safari (must be Safari, not Chrome)
2. Tap the Share button (box with arrow pointing up)
3. Scroll down → Tap "Add to Home Screen"
4. Tap "Add"
5. ClassTrack icon appears on your home screen! 📱

---

## Share With Other Teachers

Just send them your Vercel link!
- Each teacher creates their own account in the app
- Their data is completely separate from yours
- Works on any phone, any browser

---

## Project File Structure

```
classtrack/
├── src/
│   ├── App.jsx          ← Main app (add your Supabase keys here)
│   └── main.jsx         ← Entry point (don't touch)
├── public/
│   ├── icons/           ← App icons
│   ├── favicon.svg      ← Browser tab icon
│   └── apple-touch-icon.png  ← iPhone icon
├── index.html           ← App shell (don't touch)
├── vite.config.js       ← Build config (don't touch)
├── vercel.json          ← Deployment config (don't touch)
├── package.json         ← Dependencies (don't touch)
├── supabase_setup.sql   ← Run this in Supabase SQL Editor
└── README.md            ← This file
```

---

## Need Help?

If anything goes wrong, the most common fixes are:
- **App shows blank screen** → Check that your Supabase keys are correct in App.jsx
- **Login not working** → Make sure you ran the SQL file in Supabase
- **Can't find "Add to Home Screen"** → Android: use Chrome | iPhone: use Safari

---

*Built with React + Vite + Supabase*
