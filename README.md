# Tennis Scorekeeper

A mobile tennis match tracking app built with **React Native (Expo)** and **SQLite**. No backend required—everything is stored locally.

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

## Tech stack

- **Expo** (~52) with React Native
- **expo-sqlite** for local database
- **React Navigation** (bottom tabs + native stack)

Data is stored in SQLite on device. The structure (players, matches, set_scores) is ready for future expansion (e.g. cloud sync or more advanced stats).

## Project structure

- `App.js` – Entry, wraps app in navigation and safe area.
- `src/db/database.native.js` / `database.web.js` – SQLite (native) or localStorage (web); same API for players, matches, stats, tournaments.
- `src/navigation/AppNavigator.js` – Native stack (Home, MatchDetail, MatchupStats, PlayerDetail, NewTournament, TournamentDetail).
- `src/screens/` – HomeScreen, MatchDetailScreen, MatchupStatsScreen, PlayerDetailScreen, PlayersScreen, NewTournamentScreen, TournamentDetailScreen.
