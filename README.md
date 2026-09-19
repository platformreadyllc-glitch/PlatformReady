# PlatformReady

PlatformReady is a real-time web app for running powerlifting meets. It connects to [LiftingCast](https://liftingcast.com) and provides dedicated screens for referee lights, scoring tables, and meet director controls — all updating live as decisions come in.

---

## What's in the box

| Folder | What it is |
|---|---|
| `backend/` | NestJS server — talks to LiftingCast and pushes live updates to all browsers |
| `frontend/` | React app — the UI you open in a browser |
| `firmware/` | ESP32 firmware for hardware referee remotes (optional) |

---

## Prerequisites

You'll need two free tools installed before you start. If you already have them, skip ahead to [Installation](#installation).

### 1. Node.js

Node.js is the runtime that powers the backend server and the frontend build tool.

1. Go to [nodejs.org](https://nodejs.org) and download the **LTS** version (the one labeled "Recommended For Most Users").
2. Run the installer and follow the prompts — the defaults are fine.
3. When it's done, open a terminal (search for **Terminal** or **PowerShell** on Windows / **Terminal** on Mac) and run:
   ```
   node --version
   ```
   You should see something like `v22.0.0`. Any version 18 or higher works.

### 2. Git

Git is used to download the code.

- **Windows**: Download and install from [git-scm.com](https://git-scm.com). Leave all settings on their defaults.
- **Mac**: Open Terminal and run `git --version`. If it's not installed, macOS will prompt you to install it.
- **Linux**: Run `sudo apt install git` (Ubuntu/Debian) or `sudo dnf install git` (Fedora).

---

## Installation

### Step 1 — Download the code

Open a terminal and run:

```bash
git clone https://github.com/platformreadyllc-glitch/PlatformReady.git
cd PlatformReady
```

This creates a `PlatformReady` folder with the full project inside.

### Step 2 — Install backend dependencies

```bash
cd backend
npm install
```

This downloads all the packages the server needs. It may take a minute.

### Step 3 — Install frontend dependencies

Open a **second terminal window** (keep the first one open), navigate to the project, and run:

```bash
cd PlatformReady/frontend
npm install
```

---

## Running the app

You need two terminal windows running at the same time — one for the backend server and one for the frontend. Both must be running for the app to work.

### Terminal 1 — Start the backend

```bash
cd PlatformReady/backend
npm run start:dev
```

You'll see log output ending with something like:
```
[NestApplication] Nest application successfully started
```
The backend is now running on **port 3000**.

### Terminal 2 — Start the frontend

```bash
cd PlatformReady/frontend
npm run dev
```

You'll see output like:
```
  VITE v6.x.x  ready in 300 ms

  ➜  Local:   http://localhost:5173/
```
The frontend is now running on **port 5173**.

---

## Opening the app

With both terminals running, open a browser and go to:

```
http://localhost:5173
```

You'll land on the **Meet Setup** page, where you configure your meet name, number of days, platforms, and LiftingCast credentials.

### App pages

| URL | What it's for |
|---|---|
| `http://localhost:5173/` | Meet Setup — configure your meet and connect to LiftingCast |
| `http://localhost:5173/platform/1` | Platform 1 display — full-screen view for a TV or monitor on the platform |
| `http://localhost:5173/platform/1/scoring` | Scoring table view for Platform 1 |
| `http://localhost:5173/controls` | Meet Director — overview and controls for all platforms |

If you have multiple platforms, replace `/platform/1` with `/platform/2`, `/platform/3`, etc.

---

## Using it from other computers on the same network

A real meet needs more than one screen — a platform display on a TV, a scoring
table, a director's laptop — usually each on its own computer. Only one
computer needs to run the backend and frontend servers (above); every other
computer just opens a browser to that computer's address instead of
`localhost`.

1. On the **host computer** (the one running both `npm run start:dev` and
   `npm run dev`), find its LAN IP address:
   - **Mac**: System Settings → Wi-Fi/Network → look for an address like
     `192.168.x.x`, or run `ifconfig | grep "inet "` in Terminal.
   - **Windows**: run `ipconfig` in Command Prompt and look for "IPv4
     Address".
2. On **any other computer** on the same network, open a browser to that
   address instead of `localhost`, e.g. `http://192.168.0.199:5173`.

That's it — no other configuration needed. The frontend automatically talks
back to the host computer's backend (port 3000), because it derives that
address from whatever host you used to reach the page in the first place,
rather than assuming `localhost`.

This only works on the same local network (e.g. the same venue's Wi-Fi) —
it doesn't expose the app to the internet. If the backend ever needs to run
on a different machine than the frontend, or on a non-standard port, set
`VITE_API_URL` in `frontend/.env` (copy `frontend/.env.example` to start) to
override the automatic address.

---

## Stopping the app

To stop either server, click into the terminal window running it and press **Ctrl + C**.

---

## Quick-start scripts reference

| Command | Run from | What it does |
|---|---|---|
| `npm run start:dev` | `backend/` | Start backend in watch mode (auto-restarts on file changes) |
| `npm run start` | `backend/` | Start backend (no auto-restart) |
| `npm run dev` | `frontend/` | Start frontend dev server |
| `npm run build` | `backend/` or `frontend/` | Compile for production |
| `npm test` | `backend/` | Run backend tests |

---

## Branch rules

- All pull requests targeting `main` must pass CI before merge.
- Direct commits to `main` are not allowed.
