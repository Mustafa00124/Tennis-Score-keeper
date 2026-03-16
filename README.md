# Tennis Scorekeeper

A mobile tennis match tracking app built with **React Native (Expo)** and **SQLite**. No backend required—everything is stored locally.

## Features

- **Players**: Create and manage player profiles.
- **Record match**: Pick two players, set the date, and enter set scores (e.g. 6–3, 4–6, 7–5). The winner is determined automatically and the match is stored for both players.
- **Player profile**: View total matches, wins/losses, and full match history with opponent names and dates.
- **Statistics**: See total games won, total sets won, win percentage, and head-to-head records between players.

## Setup

```bash
npm install
npx expo start
```

Then open in the Expo Go app (iOS/Android) or use a simulator.

## Tech stack

- **Expo** (~52) with React Native
- **expo-sqlite** for local database
- **React Navigation** (bottom tabs + native stack)

Data is stored in SQLite on device. The structure (players, matches, set_scores) is ready for future expansion (e.g. cloud sync or more advanced stats).

## Project structure

- `App.js` – Entry, wraps app in navigation and safe area.
- `src/db/database.js` – SQLite schema, init, and all queries (players, matches, stats, head-to-head).
- `src/navigation/AppNavigator.js` – Bottom tabs (Players, Record Match, Statistics) and stack for player detail.
- `src/screens/` – PlayersScreen, PlayerDetailScreen, RecordMatchScreen, StatsScreen.
