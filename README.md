# Dokyuu

> Real-time collaborative whiteboard platform — Angular 17 frontend + NestJS backend, powered by MongoDB, Socket.IO, and Cloudinary.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Repository Structure](#repository-structure)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
- [Environment Variables](#environment-variables)
- [Backend API Reference](#backend-api-reference)
- [WebSocket Events](#websocket-events)
- [Roles & Permissions](#roles--permissions)
- [Frontend Feature Map](#frontend-feature-map)
- [Theme System](#theme-system)
- [Deployment](#deployment)
- [Project Structure](#project-structure)

---

## Overview

Dokyuu is a full-stack collaborative whiteboard application. Multiple users can work simultaneously on infinite canvases, seeing each other's cursors and edits in real time. Boards are accessed via invite code with three distinct permission levels, and any image can be uploaded and pinned directly to the canvas via Cloudinary.

Key features at a glance:

- JWT authentication with per-user cursor color and display name
- Infinite panning and zooming canvas (10%–400%)
- Sticky notes, freeform shapes (square, circle, triangle, arrow, line), and Cloudinary-hosted images
- Live cursor tracking and canvas sync via Socket.IO
- Role-based access: Host, Member, and Reader
- Host can kick users from active sessions in real time
- Four switchable UI themes (Dark, Light, Roses, Ponci) persisted to localStorage
- Docker-ready backend with multi-stage build

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                          Browser                             │
│                                                              │
│   Angular 17 SPA (Vercel)                                    │
│   ┌─────────────┐  ┌───────────────┐  ┌──────────────────┐  │
│   │  AuthModule │  │ DashboardMod  │  │   BoardModule    │  │
│   │  (signals)  │  │ (boards mgmt) │  │ (infinite canvas)│  │
│   └──────┬──────┘  └──────┬────────┘  └────────┬─────────┘  │
│          │  HTTP + JWT    │                    │ WebSocket   │
└──────────┼────────────────┼────────────────────┼────────────┘
           │                │                    │
           ▼                ▼                    ▼
┌──────────────────────────────────────────────────────────────┐
│               NestJS API (Render / Docker)                   │
│                                                              │
│  AuthModule  BoardsModule  CanvasModule  FilesModule         │
│  MembersModule             SocketModule (Socket.IO Gateway)  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                     MongoDB Atlas                      │  │
│  │  users · boards · board_members · board_elements       │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─────────────┐                                             │
│  │  Cloudinary │  ← image upload & CDN delivery             │
│  └─────────────┘                                             │
└──────────────────────────────────────────────────────────────┘
```

**Data model relationships:**

```
User ──< BoardMember >── Board ──< BoardElement
               role: host | member | reader
```

---

## Repository Structure

```
dokyuu/
├── dokyuu-backend/        # NestJS REST API + WebSocket gateway
└── dokyuu-frontend/       # Angular 17 standalone SPA
```

---

## Tech Stack

### Backend

| Layer | Technology |
|---|---|
| Framework | NestJS 11 |
| Database | MongoDB via Mongoose 9 |
| Authentication | Passport.js + JWT |
| Real-time | Socket.IO 4 |
| File Storage | Cloudinary SDK v2 |
| Validation | class-validator + class-transformer |
| Runtime | Node.js 20 |
| Containerization | Docker (multi-stage) |

### Frontend

| Layer | Technology |
|---|---|
| Framework | Angular 17 (standalone components) |
| Reactivity | Angular Signals |
| Styling | Tailwind CSS 3 + CSS custom properties |
| Real-time | socket.io-client 4 |
| HTTP | Angular HttpClient + functional interceptor |
| Deployment | Vercel |

---

## Getting Started

### Prerequisites

- Node.js 20+
- A running MongoDB instance (local or Atlas)
- A Cloudinary account (free tier is sufficient)

### Backend Setup

```bash
cd dokyuu-backend
npm install

# Create your environment file
cp .env.example .env   # then fill in the values shown below

npm run start:dev      # http://localhost:3000
```

```bash
# Other useful commands
npm run build          # compile to dist/
npm run start:prod     # run compiled output
npm run test           # unit tests
npm run test:cov       # with coverage report
npm run test:e2e       # end-to-end tests
```

### Frontend Setup

```bash
cd dokyuu-frontend
npm install

# Point at your local backend — edit src/environments/environment.ts:
# apiUrl: 'http://localhost:3000'

npm start              # ng serve — http://localhost:4200
npm run build          # production build → dist/dokyuu-frontend/browser
npm test               # karma unit tests
```

---

## Environment Variables

Create a `.env` file inside `dokyuu-backend/`:

```env
# Server
PORT=3000

# MongoDB
MONGODB_URI=mongodb://localhost:27017/dokyuu

# JWT
JWT_SECRET=your_super_secret_key_here

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

The frontend reads its API URL from `src/environments/environment.ts`:

```ts
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000'   // or your deployed backend URL
};
```

---

## Backend API Reference

All protected routes require the `Authorization: Bearer <token>` header, which the Angular HTTP interceptor attaches automatically from `localStorage`.

### Auth — `/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/register` | No | Create a new account |
| `POST` | `/auth/login` | No | Login and receive a JWT (6 h expiry) |
| `PUT` | `/auth/profile` | Yes | Update display name and cursor color |

**Register / Login request body:**

```json
{
  "email": "user@example.com",
  "displayName": "Jane Doe",
  "password": "securepassword"
}
```

**Response (all auth endpoints):**

```json
{
  "access_token": "<jwt>",
  "user": {
    "_id": "...",
    "email": "user@example.com",
    "displayName": "Jane Doe",
    "cursorColor": "#A3F1B2"
  }
}
```

---

### Boards — `/boards`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/boards` | Yes | Create a board (auto-generates `memberCode` and `readerCode`) |
| `GET` | `/boards` | Yes | List all boards the current user belongs to, each with `myRole` |
| `PUT` | `/boards/:id` | Yes (host) | Rename or update description |
| `DELETE` | `/boards/:id` | Yes (host) | Delete board and all related elements |

Invite codes are formatted as `XXX-XXX` using nanoid.

---

### Members — `/members`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/members/join` | Yes | Join a board using an invite code |

```json
{ "code": "ABC-XYZ" }
```

The assigned role (`member` or `reader`) is derived automatically from which code was submitted.

---

### Canvas — `/canvas`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/canvas/:boardId/elements` | Yes (any member) | Fetch all elements |
| `PUT` | `/canvas/:boardId/elements` | Yes (host or member) | Bulk-replace all elements |

Canvas saves are debounced 2 seconds on the client to reduce write frequency.

---

### Files — `/files`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/files/upload` | Yes | Upload an image to Cloudinary |

Send as `multipart/form-data` with the field name `image`. Accepted formats: JPG, PNG, GIF, WEBP, SVG. Maximum file size: 8 MB.

```json
{
  "message": "Imagen subida exitosamente",
  "url": "https://res.cloudinary.com/...",
  "publicId": "dokyuu/abc123",
  "width": 1920,
  "height": 1080
}
```

---

## WebSocket Events

Connect with the JWT in the Socket.IO handshake:

```js
const socket = io('http://localhost:3000', {
  auth: { token: 'Bearer <jwt>' },
  transports: ['websocket']
});
```

### Emitted by client

| Event | Payload | Guard | Description |
|-------|---------|-------|-------------|
| `joinBoard` | `{ boardId }` | Auth | Join a board room and receive the current user list |
| `canvas:update` | `{ boardId, elements[] }` | Auth + Role | Broadcast canvas state to all peers |
| `cursor:move` | `{ boardId, position: {x, y} }` | Auth | Broadcast cursor position |
| `kick:user` | `{ boardId, targetUserId }` | Auth | Remove a user from the room (host only) |

### Emitted by server

| Event | Payload | Description |
|-------|---------|-------------|
| `room:users` | `ConnectedUser[]` | Full updated user list for the room |
| `user:joined` | `{ userId, email, displayName, cursorColor }` | A user entered the room |
| `user:left` | `{ userId, email, displayName }` | A user left or disconnected |
| `canvas:update` | `elements[]` | Canvas was updated by another user |
| `cursor:move` | `{ userId, displayName, cursorColor, position }` | Another user's cursor moved |
| `kicked` | `{ boardId, message }` | The current client was kicked by the host |

---

## Roles & Permissions

| Action | Host | Member | Reader |
|--------|:----:|:------:|:------:|
| View canvas elements | ✅ | ✅ | ✅ |
| Add / edit / delete elements | ✅ | ✅ | ❌ |
| Emit `canvas:update` via WebSocket | ✅ | ✅ | ❌ |
| Upload images to Cloudinary | ✅ | ✅ | ❌ |
| Rename / update board metadata | ✅ | ❌ | ❌ |
| Delete board | ✅ | ❌ | ❌ |
| Kick users from live session | ✅ | ❌ | ❌ |

---

## Frontend Feature Map

### Auth (`/auth`)

Split-panel login/register screen with reactive form validation. On success the JWT and user profile are stored in `localStorage` and loaded into an Angular Signal (`currentUser`). The HTTP interceptor automatically attaches the token as a `Bearer` header to every subsequent request.

### Dashboard (`/dashboard`)

Sidebar layout with two tabs:

**Pizarras** — shows boards the user hosts (with invite codes visible) and boards they have joined as a guest, separated into two grids. From here users can create boards, join via invite code, edit or delete their own boards, and open any board.

**Configuración** — live theme switcher with visual mini-previews of each theme. Selecting one applies CSS custom properties to `:root` instantly and persists the choice to `localStorage`.

The sidebar footer includes a profile modal where users can update their display name and cursor color through a palette picker, hex input field, or native color picker — all synced in real time.

### Board (`/board/:id`)

Infinite canvas with animated dot-grid background. Supports:

**Navigation** — click-drag on empty canvas to pan; scroll wheel or side buttons to zoom between 10 % and 400 % anchored to the cursor position.

**Elements:**
- Sticky notes — draggable text areas with per-note rotation handle
- Shapes — square, circle, triangle (filled SVG); arrow and line (stroked SVG). A selected shape shows a contextual toolbar for color, rotation (+45°), axis resize, and delete
- Images — uploaded to Cloudinary and rendered as pinned canvas elements; displayed with actual pixel dimensions scaled to fit within a 400×300 envelope

**Collaboration:**
- All other users' cursors rendered live with their accent color and display name
- Users panel (slide-in sidebar) shows every connected socket with online indicator; hosts see a per-user kick button that appears on hover

**Persistence** — every mutation (add, move, edit, resize, rotate, delete) is applied optimistically to the local Signal, broadcast to the room via `canvas:update`, and flushed to MongoDB after a 2-second debounce.

### Loading screen

Animated SVG pencil drawing on a whiteboard with rotating status messages. Fades out with a 0.8 s CSS transition once the initial canvas fetch completes, then unmounts from the DOM.

---

## Theme System

Four themes ship out of the box, each defined as a palette of CSS custom properties applied via `[data-theme]` on `<html>`:

| Theme | Background | Surface | Accent |
|-------|-----------|---------|--------|
| Dark | `#0A0A0C` | `#121215` | `#00F0FF` |
| Light | `#F4F4F6` | `#FFFFFF` | `#0066CC` |
| Roses | `#120A12` | `#1A0D1A` | `#EC4899` |
| Ponci | `#120A06` | `#1A0F0A` | `#C2622D` |

Tailwind aliases like `bg-darkBg` and `text-neonBlue` resolve to `var(--color-bg)` and `var(--color-accent)`, so every component repaints instantly on theme switch without a page reload. The active theme is stored under the key `dokyuu_theme` in `localStorage`.

---

## Deployment

### Backend — Docker

```bash
# Multi-stage build: compiles TypeScript then copies only dist/ and prod node_modules
docker build -t dokyuu-backend .

docker run -p 3000:3000 --env-file .env dokyuu-backend
```

For Render, set the Start Command to `node dist/main` and add all environment variables through the Render dashboard.

### Frontend — Vercel

`vercel.json` is already configured with the correct output directory and SPA rewrite rule:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist/dokyuu-frontend/browser",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Before deploying, set `apiUrl` in `src/environments/environment.ts` to your live backend URL.

---

## Project Structure

### Backend

```
dokyuu-backend/
├── src/
│   ├── auth/
│   │   ├── dto/                  # RegisterDto, LoginDto
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── jwt.strategy.ts       # validates token, populates req.user
│   │   ├── jwt-auth.guard.ts     # HTTP guard
│   │   └── ws-auth.guard.ts      # WebSocket guard
│   ├── boards/
│   │   ├── dto/                  # CreateBoardDto, UpdateBoardDto
│   │   ├── boards.controller.ts
│   │   └── boards.service.ts     # nanoid invite-code generation
│   ├── canvas/
│   │   ├── canvas.controller.ts
│   │   └── canvas.service.ts     # bulk-save preserving createdBy
│   ├── files/
│   │   ├── files.controller.ts
│   │   ├── files.service.ts      # streamifier → Cloudinary upload stream
│   │   └── cloudinary.provider.ts
│   ├── members/
│   │   ├── members.controller.ts
│   │   └── members.service.ts    # code lookup + role assignment
│   ├── schemas/
│   │   ├── user.schema.ts
│   │   ├── board.schema.ts
│   │   ├── board-member.schema.ts   # compound unique index (boardId + userId)
│   │   ├── board-element.schema.ts  # strict: false for canvas flexibility
│   │   └── invitation.schema.ts
│   ├── socket/
│   │   ├── socket.gateway.ts     # joinBoard, canvas:update, cursor:move, kick:user
│   │   ├── socket.module.ts
│   │   └── ws-role.guard.ts      # blocks readers from editing canvas
│   ├── app.module.ts
│   └── main.ts
├── dockerfile
└── package.json
```

### Frontend

```
dokyuu-frontend/
├── src/
│   ├── app/
│   │   ├── core/
│   │   │   ├── auth/
│   │   │   │   ├── auth.service.ts      # Signal-based session, localStorage
│   │   │   │   ├── auth.guard.ts        # functional route guard
│   │   │   │   └── auth.interceptor.ts  # auto-attach Bearer token
│   │   │   ├── boards/
│   │   │   │   └── boards.service.ts
│   │   │   ├── canvas/
│   │   │   │   └── canvas.service.ts    # Socket.IO client + HTTP + Signals
│   │   │   └── theme/
│   │   │       └── theme.service.ts     # CSS var injection + localStorage
│   │   ├── features/
│   │   │   ├── auth/                    # Login/Register split panel
│   │   │   ├── dashboard/               # Board grid + theme picker + profile modal
│   │   │   ├── board/                   # Infinite canvas + real-time collaboration
│   │   │   └── loading/                 # SVG pencil splash with fade-out
│   │   ├── app.routes.ts
│   │   └── app.config.ts
│   ├── environments/
│   │   └── environment.ts
│   └── styles.css                       # Tailwind + CSS theme variable definitions
├── tailwind.config.js
├── vercel.json
└── package.json
```

---

## License

Private and unlicensed — all rights reserved.
