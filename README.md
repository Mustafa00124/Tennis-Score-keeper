# Tennis Statbot

**Tennis Statbot** — a mobile tennis match tracking app built with **React Native (Expo)** and **SQLite**. No backend required—everything is stored locally.

## Features

- **Players**: Create and manage player profiles.
- **Match ups**: Create match-ups between two players; add match days and enter set scores (e.g. 6–3, 4–6, 7–5). The winner is determined automatically and stored for both players.
- **Player profile**: View total matches, wins/losses, and full match history with opponent names and dates.
- **Matchup stats**: Head-to-head stats, sets/games won, win percentage, and detailed stats per pair.
- **Tournaments**: Create knockout or round-robin tournaments with brackets and league tables.

## Setup

```bash
npm install
npx expo start
```

Then open in the Expo Go app (iOS/Android) or use a simulator.

## Building the APK

To build an installable Android APK (e.g. for sideloading or testing on device/emulator), use [EAS Build](https://docs.expo.dev/build/introduction). The steps below assume you have Node.js and npm installed.

### 1. Install EAS CLI

```bash
npm install -g eas-cli
```

### 2. Log in to Expo

```bash
eas login
```

Create an [Expo account](https://expo.dev/signup) if you don’t have one.

### 3. Configure the project for EAS Build (first time only)

From the project root, run:

```bash
eas build:configure
```

This creates `eas.json`. To produce an **APK** (instead of an AAB), ensure a build profile outputs APK. For example, in `eas.json`:

```json
{
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      }
    },
    "production": {}
  }
}
```

Use the `preview` profile for APK builds.

### Before each Android build (sanity check)

Standalone APKs include **native code** from your dependencies. **Expo Go** already ships many native modules, so mismatches often only show up in a release build.

1. **Align Expo packages with your SDK** (always use this for Expo-owned packages):

   ```bash
   npx expo install expo-linear-gradient expo-image-picker expo-sqlite expo-asset expo-status-bar
   ```

   Or run `npx expo install --fix` to fix anything out of range.

2. **Run the project health check:**

   ```bash
   npx expo-doctor
   ```

   Fix any reported issues (e.g. wrong package versions, invalid `app.json` assets).

3. **Native modules used in this app** (must be in `package.json` and compatible with your Expo SDK): `expo-sqlite`, `expo-linear-gradient`, `expo-image-picker`, `expo-asset`, `react-native-screens`, `react-native-safe-area-context`.

4. **Config plugins in `app.json`** – Standalone builds use `expo prebuild` under the hood. This project lists `expo-asset`, `expo-sqlite`, and **`expo-image-picker`** (photo library permission strings / Android permission wiring). If you add another native library (camera, maps, notifications, etc.), add its Expo config plugin there too.

5. **App icon** – `expo-doctor` expects a **square PNG** for `expo.icon`. Using a non-square JPG can warn or cause store/build quirks. Prefer e.g. `1024×1024` `icon.png` and point `icon` at it when you can.

6. **Quick scripts** (from project root):

   ```bash
   npm run expo:fix   # align Expo package versions to the installed SDK
   npm run doctor     # same as npx expo-doctor
   ```

### Common “Expo Go works, APK doesn’t” causes

| Area | What to watch |
|------|----------------|
| **Native version skew** | Always use `npx expo install <pkg>` for Expo packages so native + JS match the SDK (e.g. `expo-linear-gradient` for SDK 54). |
| **SQLite init race** | The DB must finish opening + migrations before any query. This app uses a single init promise and preloads the DB in `App.js` before navigation. |
| **Permissions** | Gallery flows need `expo-image-picker` in `plugins` for reliable standalone behavior. |
| **Hermes / release** | Test a release-style build (`eas build` preview APK) before wide distribution; dev/Expo Go timing can hide races. |

### 4. Build the APK

```bash
eas build -p android --profile preview
```

EAS will build in the cloud. When it finishes, you get a link to download the `.apk` file.

### 5. Install the build

**On an Android emulator (after the build completes):**

```bash
eas build:run -p android
```

To install the latest build without choosing from a list:

```bash
eas build:run -p android --latest
```

**On a physical device:**

- Download the APK from the build page (link shown when the build completes) and open it on your device, or  
- Download the APK to your computer, connect the device with USB (with USB debugging enabled), then run:

```bash
adb install path/to/the/file.apk
```

### Commands summary

| Step              | Command |
|-------------------|--------|
| Install EAS CLI   | `npm install -g eas-cli` |
| Log in            | `eas login` |
| Configure (1x)    | `eas build:configure` |
| Build APK         | `eas build -p android --profile preview` |
| Install on emulator | `eas build:run -p android --latest` |
| Install via ADB   | `adb install path/to/the/file.apk` |

## Tech stack

- **Expo** (~54) with React Native
- **expo-sqlite** for local database
- **React Navigation** (bottom tabs + native stack)

Data is stored in SQLite on device. The structure (players, matches, set_scores) is ready for future expansion (e.g. cloud sync or more advanced stats).

**Stats and deletes:** All stats (wins, losses, H2H, matchup stats, tournament standings) are computed from the database when a screen loads. There is no separate stats cache. So when you delete a player, match, or tournament, or edit/remove a set and save, the next time you open or return to Home, Player detail, Matchup stats, or Tournament detail, that screen runs `load()` again (via `useFocusEffect`) and shows updated data. Stats will reflect the new state immediately after you navigate back.

## Project identifiers

- **Expo slug:** `tennis-scorekeeper` (must match the project linked in `app.json` → `extra.eas.projectId`; Expo dashboard URL uses this even though the app display name is **Tennis Statbot**)
- **npm package name:** `tennis-statbot`
- **Android application ID / iOS bundle ID:** `com.tennis.statbot`

If you previously published under `com.tennis.scorekeeper`, this is a **different app ID** for the stores (you cannot ship an update to the old listing with the new ID without transferring/using the same package name).

## Project structure

- `App.js` – Entry, wraps app in navigation and safe area.
- `src/db/database.native.js` / `database.web.js` – SQLite (native) or localStorage (web); same API for players, matches, stats, tournaments.
- `src/navigation/AppNavigator.js` – Native stack (Home, MatchDetail, MatchupStats, PlayerDetail, NewTournament, TournamentDetail).
- `src/screens/` – HomeScreen, MatchDetailScreen, MatchupStatsScreen, MatchViewScreen, PlayerDetailScreen, NewTournamentScreen, TournamentDetailScreen.
