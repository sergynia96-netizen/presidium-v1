# PRESIDIUM Messenger

**Private Messenger with AI** — Next-generation private messenger with end-to-end encryption, local AI, and P2P capabilities.

![Version](https://img.shields.io/badge/version-0.9.0--beta-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-16.1.1-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwind-css)

## 🚀 Features

- **💬 Real-time Messaging** — Private and group chats with E2EE
- **🤖 AI Assistant** — Built-in AI for summaries, translations, smart replies
- **🛡️ OpenClaw Moderation** — Local AI content moderation for safety
- **📱 Cross-Platform** — Responsive design for mobile and desktop
- **🌐 i18n Support** — English and Russian languages
- **🎨 Modern UI** — Beautiful design with shadcn/ui components
- **🔒 Privacy First** — Local storage, optional P2P, no server storage

## 📋 Requirements

- Node.js 22 LTS (recommended) or Bun 1.0+
- SQLite (development) or PostgreSQL (production)
- GLM-4 API key (free): https://open.bigmodel.cn/

## 🛠️ Installation

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd Presidium
```

### 2. Install dependencies

```bash
# Using npm
npm install

# Or using Bun (recommended)
bun install
```

### 3. Set up environment variables

```bash
# Copy the example env file
cp .env.example .env.local
```

Edit `.env.local` and add your API keys:

```bash
# GLM-4 API (required for AI features)
GLM4_API_KEY="your-glm4-api-key-here"

# AI Provider
AI_PROVIDER="glm4"

# Database (SQLite for development)
DATABASE_URL="file:./dev.db"

# NextAuth (optional, for authentication)
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-with-openssl-rand--base64-32"
```

### 4. Set up the database

```bash
# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push
```

## 🚀 Development

### Start development server

```bash
# Using npm
npm run dev

# Using Bun
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Start for Local Network (LAN)

```bash
# Starts frontend + relay backend, binds for LAN access, writes logs to .zscripts/
npm run dev:lan

# Stop both services
npm run dev:lan:stop
```

`dev:lan` automatically prefers a project-local Node 22 runtime from `tools/node-v22.22.2-win-x64/node.exe` when present.

### Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint errors
npm run typecheck    # TypeScript type checking
npm run test         # Run tests
npm run test:ui      # Run tests with UI
npm run db:generate  # Generate Prisma client
npm run db:push      # Push Prisma schema to DB
npm run db:migrate   # Run Prisma migrations
npm run db:studio    # Open Prisma Studio
npm run clean        # Clean build artifacts
npm run relay:dev    # Start relay backend mini-service
npm run relay:typecheck # Typecheck relay backend
npm run dev:lan      # Start frontend + relay for LAN testing
npm run dev:lan:stop # Stop LAN services
```

### Relay Backend Integration

This project now includes an additional backend relay service from `backend.tar`:

- Path: `mini-services/relay-backend`
- HTTP: `http://localhost:3001`
- WS: `ws://localhost:3001/ws`

Set these variables in `.env.local` to connect frontend WebSocket to relay:

```bash
NEXT_PUBLIC_RELAY_WS_URL="ws://localhost:3001/ws"
NEXT_PUBLIC_RELAY_HTTP_URL="http://localhost:3001"
```

## 📁 Project Structure

```
Presidium/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API routes
│   │   │   ├── ai-chat/        # AI chat endpoint
│   │   │   └── openclaw/       # Content moderation
│   │   ├── globals.css         # Global styles
│   │   ├── layout.tsx          # Root layout
│   │   └── page.tsx            # Main page
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── messenger/          # Messenger components
│   │   ├── error-boundary.tsx  # Error boundary
│   │   └── skeleton-loaders.tsx # Loading skeletons
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Utilities and helpers
│   │   ├── db.ts               # Prisma client
│   │   ├── glm4.ts             # GLM-4 API client
│   │   ├── openclaw.ts         # OpenClaw utilities
│   │   ├── i18n.ts             # Internationalization
│   │   ├── sanitizer.ts        # Content sanitization
│   │   └── rate-limit.ts       # Rate limiting
│   ├── store/                  # Zustand state management
│   ├── types/                  # TypeScript types
│   └── data/                   # Mock data
├── prisma/
│   ├── schema.prisma           # Database schema
│   └── dev.db                  # SQLite database
├── public/                     # Static assets
├── .env.example                # Environment variables template
├── .gitignore                  # Git ignore rules
├── next.config.ts              # Next.js configuration
├── package.json                # Dependencies
├── tailwind.config.ts          # Tailwind configuration
├── tsconfig.json               # TypeScript configuration
└── eslint.config.mjs           # ESLint configuration
```

## 🔐 Security

### Important Security Notes

1. **Never commit `.env.local`** — Contains sensitive API keys
2. **Use HTTPS in production** — Required for secure communication
3. **Enable rate limiting** — Prevents API abuse
4. **Sanitize user input** — Prevents XSS attacks

### Security Checklist

- [ ] Generate unique `NEXTAUTH_SECRET`
- [ ] Use strong database passwords
- [ ] Enable HTTPS in production
- [ ] Configure CORS properly
- [ ] Set up security headers
- [ ] Enable rate limiting
- [ ] Regular dependency updates

### Open-Source Publish Checklist

Before pushing to a public GitHub repository:

1. Do not commit `.env`, `.env.local`, and `mini-services/relay-backend/.env`.
2. Use `.env.example` with placeholders only (no real tokens/passwords).
3. Rotate any API keys that were ever stored locally in plain text.
4. Verify docker compose uses environment variables for secrets (no hardcoded values).
5. Run a secret scan before each push (`rg`, `gitleaks`, or GitHub secret scanning).

See [SECURITY.md](./SECURITY.md) for detailed security guidelines.

## 🧪 Testing

```bash
# Run tests
npm run test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

## 📦 Building for Production

```bash
# Build the application
npm run build

# Start production server
npm run start
```

### Production Requirements

- PostgreSQL database (recommended over SQLite)
- Redis for rate limiting (optional but recommended)
- HTTPS certificate
- Environment variables set in hosting platform

## 🌍 Deployment

### Docker Compose (Recommended for Production)

The easiest way to deploy Presidium with all dependencies (PostgreSQL, Redis, MinIO, Relay).

#### Quick Start

```bash
# 1. Copy and configure environment variables
cp .env.production.example .env.production

# Edit .env.production with your production values:
# - Generate secure secrets with: openssl rand -base64 32
# - Set database passwords
# - Add your API keys

# 2. Start all services
docker compose up -d

# 3. Check logs
docker compose logs -f app

# 4. Stop services
docker compose down
```

#### Verified Local Run (App + Relay + PostgreSQL + Redis)

```bash
# Build and run core services
docker compose up -d --build app relay db redis

# Check status/health
docker compose ps

# App
http://localhost:3000

# Relay health
http://localhost:3001/health
```

**Services available at:**
- **App:** http://localhost:3000
- **Relay:** http://localhost:3001
- **MinIO Console:** http://localhost:9001
- **PostgreSQL:** localhost:5432
- **Redis:** localhost:6379

#### Docker Compose Commands

```bash
# Build and start
docker compose up --build -d

# View logs
docker compose logs -f app       # App logs
docker compose logs -f relay     # Relay logs
docker compose logs -f db        # Database logs

# Run database migrations manually
docker compose exec app npx prisma migrate status

# Restart a specific service
docker compose restart app

# Stop and remove containers (keep data)
docker compose down

# Stop and remove everything including volumes (WARNING: deletes data)
docker compose down -v
```

#### Production Environment Variables

Edit `.env.production` with your values:

```bash
# Required: Generate secure secrets
NEXTAUTH_SECRET=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 32)

# Required: Database passwords
DB_PASSWORD=your-secure-db-password
RELAY_DB_PASSWORD=your-relay-db-password

# Required: Your domain for production
NEXTAUTH_URL=https://yourdomain.com
CORS_ORIGINS=https://yourdomain.com

# Optional: AI Provider
GLM4_API_KEY=your-api-key
```

### Vercel (Frontend Only)

1. Push code to GitHub
2. Import project in Vercel
3. Set environment variables
4. Deploy

**Note:** You'll need to run relay backend separately and update `NEXT_PUBLIC_RELAY_*` URLs.

### Docker (Single Container)

```bash
# Build Docker image
docker build -t presidium .

# Run with environment file
docker run -d \
  -p 3000:3000 \
  --env-file .env.production \
  --name presidium-app \
  presidium
```

### Self-hosted

```bash
# Install dependencies
npm install --production

# Build
npm run build

# Start
NODE_ENV=production npm run start
```

### Architecture Overview

```
┌─────────────────────────────────────────────┐
│           Docker Compose Stack              │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────┐    ┌──────────┐              │
│  │   App    │───▶│  Relay   │              │
│  │  :3000   │    │  :3001   │              │
│  └────┬─────┘    └────┬─────┘              │
│       │               │                     │
│       ▼               ▼                     │
│  ┌─────────────────────────┐               │
│  │    PostgreSQL (:5432)   │               │
│  │  - presidium database   │               │
│  │  - relay database       │               │
│  └─────────────────────────┘               │
│       │               │                     │
│       ▼               ▼                     │
│  ┌──────────┐    ┌──────────┐              │
│  │  MinIO   │    │  Redis   │              │
│  │  :9000   │    │  :6379   │              │
│  └──────────┘    └──────────┘              │
│                                             │
└─────────────────────────────────────────────┘
```

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org/) — React framework
- [Tailwind CSS](https://tailwindcss.com/) — Styling
- [shadcn/ui](https://ui.shadcn.com/) — UI components
- [Prisma](https://www.prisma.io/) — Database ORM
- [GLM-4](https://open.bigmodel.cn/) — AI provider
- [Zhipu AI](https://www.zhipuai.cn/) — AI technology

## 📞 Support

- **Documentation:** [Wiki](https://github.com/your-repo/presidium/wiki)
- **Issues:** [GitHub Issues](https://github.com/your-repo/presidium/issues)
- **Discussions:** [GitHub Discussions](https://github.com/your-repo/presidium/discussions)

---

**Built with ❤️ by the PRESIDIUM Team**
