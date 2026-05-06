# GPA Calculator

A drag-and-drop GPA planner built with Next.js. It helps students organize courses by term, estimate cumulative GPA and major GPA, visualize grade trends, and move planner data between browsers with JSON import and export.

[Demo](https://test.chaosq3q.win/)

## Features

- Drag course cards between semester zones
- Track cumulative GPA and major GPA separately
- Visualize term GPA and cumulative GPA with a line chart
- Mark courses as major requirements
- Disable selected courses without deleting them
- Import and export planner data as JSON
- Persist planner state in `localStorage`

## Tech Stack

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS 4
- Recharts

## Run Locally

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm run build
```

## Project Structure

- `app/page.tsx`: main UI and GPA logic
- `app/layout.tsx`: metadata and shared layout
- `app/globals.css`: global styles and animations

## Data Handling

- Course and zone data live only in the browser unless you export them
- Import/export uses a JSON payload with the `gpa-counter` schema
- There is no backend database or account system in this repo

## License

[MIT](./LICENSE)
