# Asana Clone - Project Management Application

A production-grade, full-featured Asana-like project management application built with PERN stack (PostgreSQL, Express, React, Node.js) with Prisma ORM.

## 🛠️ Tech Stack

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: JWT (Access + Refresh tokens)
- **Validation**: express-validator
- **Logging**: Pino
- **Password Hashing**: bcryptjs

### Frontend
- **Framework**: React (Vite)
- **State Management**: Redux Toolkit
- **Styling**: Tailwind CSS
- **Routing**: React Router DOM
- **Drag & Drop**: @hello-pangea/dnd
- **HTTP Client**: Axios

## 📁 Project Structure

```
asana-clone/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── core/
│   │   │   ├── config/
│   │   │   ├── database/
│   │   │   ├── logger/
│   │   │   ├── middlewares/
│   │   │   └── utils/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── workspace/
│   │   │   ├── projects/
│   │   │   ├── boards/
│   │   │   ├── lists/
│   │   │   ├── tasks/
│   │   │   ├── comments/
│   │   │   └── activity/
│   │   └── index.js
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── board/
│   │   │   ├── dashboard/
│   │   │   ├── tasks/
│   │   │   └── workspace/
│   │   ├── services/
│   │   ├── store/
│   │   │   └── slices/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
├── package.json
└── README.md
```

## 🚀 Setup Instructions

### Prerequisites
- Node.js (v18+)
- PostgreSQL (v14+)
- npm or yarn

### 1. Clone and Install Dependencies

```bash
# Clone the repository
cd asana-clone

# Install root dependencies
npm install

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Database Setup

```bash
# Navigate to backend
cd backend

# Copy environment file
copy .env.example .env

# Update .env with your database credentials
# DATABASE_URL="postgresql://postgres:password@localhost:5432/asana_clone?schema=public"

# Generate Prisma Client
npx prisma generate

# Push schema to database
npx prisma db push

# (Optional) Create migration
npx prisma migrate dev --name init
```

### 3. Start the Application

**Development Mode (both backend and frontend):**

```bash
# From root directory
npm run dev
```

Or separately:

```bash
# Terminal 1 - Backend (port 5000)
cd backend
npm run dev

# Terminal 2 - Frontend (port 3000)
cd frontend
npm run dev
```

### 4. Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## 🎯 Features Implemented

### Authentication
- ✅ User registration & login
- ✅ JWT access + refresh tokens
- ✅ Logout
- ✅ Protected routes
- ✅ Password hashing (bcrypt)

### Workspace System
- ✅ Create workspace
- ✅ Invite users (email simulation)
- ✅ Assign roles (OWNER/ADMIN/MEMBER/GUEST)
- ✅ Switch workspace

### Project Management
- ✅ Create/update/delete projects
- ✅ Assign members to projects
- ✅ Project visibility (PUBLIC/PRIVATE)

### Board & List System
- ✅ Kanban board per project
- ✅ Lists (columns)
- ✅ Reorder lists

### Task Management
- ✅ Create/update/delete tasks
- ✅ Drag & drop tasks between lists
- ✅ Assign users to tasks
- ✅ Due dates
- ✅ Status tracking (TODO/IN_PROGRESS/REVIEW/DONE)

### Comments & Activity
- ✅ Add comments on tasks
- ✅ Activity logs (task updates, moves, edits)

### Search & Filter
- ✅ Search tasks
- ✅ Filter by status

## 📝 API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh-token` - Refresh token
- `POST /api/v1/auth/logout` - Logout
- `GET /api/v1/auth/me` - Get current user

### Users
- `GET /api/v1/users` - Get all users
- `PUT /api/v1/users/profile` - Update profile

### Workspaces
- `POST /api/v1/workspaces` - Create workspace
- `GET /api/v1/workspaces` - Get all workspaces
- `GET /api/v1/workspaces/:id` - Get workspace by ID
- `PUT /api/v1/workspaces/:id` - Update workspace
- `DELETE /api/v1/workspaces/:id` - Delete workspace
- `POST /api/v1/workspaces/:id/invite` - Invite user

### Projects
- `POST /api/v1/projects/workspace/:workspaceId` - Create project
- `GET /api/v1/projects/workspace/:workspaceId` - Get all projects
- `GET /api/v1/projects/:id` - Get project by ID
- `PUT /api/v1/projects/:id` - Update project
- `DELETE /api/v1/projects/:id` - Delete project

### Lists
- `POST /api/v1/lists/board/:boardId` - Create list
- `GET /api/v1/lists/board/:boardId` - Get all lists
- `PUT /api/v1/lists/:id` - Update list
- `DELETE /api/v1/lists/:id` - Delete list
- `PUT /api/v1/lists/board/:boardId/reorder` - Reorder lists

### Tasks
- `POST /api/v1/tasks/list/:listId` - Create task
- `GET /api/v1/tasks/:id` - Get task by ID
- `PUT /api/v1/tasks/:id` - Update task
- `DELETE /api/v1/tasks/:id` - Delete task
- `PUT /api/v1/tasks/:id/move` - Move task
- `POST /api/v1/tasks/:id/assignees` - Assign user
- `GET /api/v1/tasks/workspace/:workspaceId/search` - Search tasks

### Comments
- `POST /api/v1/comments/task/:taskId` - Create comment
- `GET /api/v1/comments/task/:taskId` - Get comments
- `PUT /api/v1/comments/:id` - Update comment
- `DELETE /api/v1/comments/:id` - Delete comment

### Activity
- `GET /api/v1/activities/task/:taskId` - Get activity logs

## 🔐 Environment Variables

### Backend (.env)
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/asana_clone?schema=public"
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_REFRESH_SECRET="your-super-secret-refresh-token-key-change-in-production"
JWT_EXPIRE="15m"
JWT_REFRESH_EXPIRE="7d"
PORT=5000
NODE_ENV=development
```

## 🧪 Testing

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

## 📄 License

MIT
