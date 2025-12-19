# Online Judge - 在线评测系统

<p align="center">
  <strong>一个现代化的在线编程评测系统，支持多语言代码提交、自动评测和比赛功能</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Go-1.24-00ADD8?style=flat-square&logo=go" alt="Go Version">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" alt="React Version">
  <img src="https://img.shields.io/badge/PostgreSQL-15-336791?style=flat-square&logo=postgresql" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker" alt="Docker">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License">
</p>

---

## 📋 目录

- [功能特性](#-功能特性)
- [技术栈](#-技术栈)
- [系统架构](#-系统架构)
- [快速开始](#-快速开始)
- [项目结构](#-项目结构)
- [API 文档](#-api-文档)
- [配置说明](#-配置说明)
- [开发指南](#-开发指南)
- [部署](#-部署)
- [贡献指南](#-贡献指南)
- [许可证](#-许可证)

---

## ✨ 功能特性

### 核心功能

- **🔐 用户系统**
  - 用户注册与登录（JWT 认证）
  - 角色权限管理（管理员/学生）
  - 可配置的注册开关

- **📝 题目管理**
  - Markdown 格式题目描述
  - 数学公式支持（KaTeX）
  - 7 级难度分级
  - 标签分类系统
  - 测试用例管理
  - 题目可见性控制
  - 题目克隆功能

- **⚡ 代码评测**
  - 支持 **C++** (C++23, GCC) 和 **Python** (Python 3)
  - Docker 容器化沙箱环境
  - 时间/内存限制
  - 多测试用例评测
  - 实时评测状态
  - 详细的评测结果反馈

- **🏆 比赛系统**
  - 支持多种比赛规则：**OI / IOI / ACM**
  - 密码保护比赛
  - 实时排行榜
  - 比赛时间控制
  - 语言限制
  - 附件管理
  - 提交导出功能

- **🌐 国际化**
  - 支持中文和英文
  - 基于 i18next 的多语言框架

### 评测状态

| 状态 | 说明 |
|------|------|
| `Pending` | 等待评测 |
| `Accepted` | 答案正确 |
| `Wrong Answer` | 答案错误 |
| `Time Limit Exceeded` | 超时 |
| `Memory Limit Exceeded` | 内存超限 |
| `Compilation Error` | 编译错误 |
| `Runtime Error` | 运行时错误 |
| `System Error` | 系统错误 |

---

## 🛠 技术栈

### 后端 (server-go)

| 技术 | 说明 |
|------|------|
| **Go 1.24** | 主要编程语言 |
| **Chi v5** | 轻量级 HTTP 路由器 |
| **PostgreSQL 15** | 关系型数据库 |
| **Prisma** | 数据库 ORM 和迁移工具 |
| **Docker SDK** | 容器化评测沙箱 |
| **JWT** | 用户认证 |
| **bcrypt** | 密码加密 |

### 前端 (client)

| 技术 | 说明 |
|------|------|
| **React 19** | UI 框架 |
| **Vite 7** | 构建工具 |
| **TypeScript** | 类型安全 |
| **TailwindCSS 3** | CSS 框架 |
| **React Router 7** | 路由管理 |
| **CodeMirror 6** | 代码编辑器 |
| **react-markdown** | Markdown 渲染 |
| **KaTeX** | 数学公式渲染 |
| **i18next** | 国际化 |
| **Axios** | HTTP 客户端 |
| **Vitest** | 单元测试 |

### 基础设施

| 技术 | 说明 |
|------|------|
| **Docker** | 容器化 |
| **Docker Compose** | 多容器编排 |
| **Nginx** | 前端静态资源服务 |

---

## 🏗 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户浏览器                               │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Nginx (端口 80)                             │
│                    前端静态资源服务器                             │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Go API 服务器 (端口 3000)                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │   认证模块   │  │   题目管理   │  │      比赛系统          │  │
│  └─────────────┘  └──────────────┘  └────────────────────────┘  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │  提交管理   │  │   评测调度   │  │      设置管理          │  │
│  └─────────────┘  └──────────────┘  └────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
          │                                       │
          ▼                                       ▼
┌──────────────────────┐              ┌──────────────────────────┐
│  PostgreSQL (5432)   │              │   Docker 评测容器        │
│    数据持久化         │              │  (judge-runner:latest)  │
└──────────────────────┘              │   - C++ (GCC)           │
                                      │   - Python 3            │
                                      └──────────────────────────┘
```

---

## 🚀 快速开始

### 前置要求

- [Docker](https://www.docker.com/) >= 20.10
- [Docker Compose](https://docs.docker.com/compose/) >= 2.0
- [Node.js](https://nodejs.org/) >= 18 (仅开发时需要)
- [Go](https://golang.org/) >= 1.24 (仅开发时需要)

### 使用 Docker Compose 部署

1. **克隆仓库**

```bash
git clone https://github.com/programming666/online-judge.git
cd online-judge
```

2. **构建前端资源**

```bash
cd client
npm install
npm run build
cd ..
```

3. **启动所有服务**

```bash
docker-compose up -d --build
```

4. **访问系统**

- 前端界面: http://localhost
- API 服务: http://localhost:3000

5. **创建管理员账户**

注册时选择 `ADMIN` 角色（首次部署时建议先禁用公开注册）

### 本地开发

#### 启动后端

```bash
cd server-go

# 安装依赖
go mod download

# 设置环境变量
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/onlinejudge?schema=public"
export JWT_SECRET="your-secret-key"
export JUDGE_IMAGE="judge-runner:latest"

# 运行数据库迁移
npx prisma migrate deploy

# 启动服务器
go run ./cmd/server
```

#### 启动前端

```bash
cd client

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

#### 构建评测镜像

```bash
cd server-go
docker build -t judge-runner:latest -f internal/judger/Dockerfile-runner .
```

---

## 📁 项目结构

```
online-judge/
├── docker-compose.yml          # Docker Compose 配置
├── README.md                   # 项目文档
│
├── client/                     # 前端项目
│   ├── src/
│   │   ├── components/         # 可复用组件
│   │   │   ├── LanguageSwitcher.jsx
│   │   │   └── MarkdownEditorWithPreview.jsx
│   │   ├── context/            # React Context
│   │   │   └── AuthContext.jsx
│   │   ├── locales/            # 国际化文件
│   │   │   ├── en-US.json
│   │   │   └── zh-CN.json
│   │   ├── pages/              # 页面组件
│   │   │   ├── AdminAddProblem.jsx
│   │   │   ├── AdminContestCreate.jsx
│   │   │   ├── AdminContestList.jsx
│   │   │   ├── AdminDashboard.jsx
│   │   │   ├── AdminEditProblem.jsx
│   │   │   ├── AdminProblemList.jsx
│   │   │   ├── AdminSettings.jsx
│   │   │   ├── ContestDetail.jsx
│   │   │   ├── ContestLeaderboard.jsx
│   │   │   ├── ContestList.jsx
│   │   │   ├── ContestProblem.jsx
│   │   │   ├── ContestSubmissionList.jsx
│   │   │   ├── Login.jsx
│   │   │   ├── ProblemDetail.jsx
│   │   │   ├── ProblemList.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── SubmissionDetail.jsx
│   │   │   └── SubmissionList.jsx
│   │   ├── utils/              # 工具函数
│   │   │   └── axiosConfig.js
│   │   ├── App.jsx             # 主应用组件
│   │   ├── i18n.js             # i18n 配置
│   │   └── main.tsx            # 入口文件
│   ├── public/                 # 静态资源
│   ├── Dockerfile              # 前端 Docker 配置
│   ├── nginx.conf              # Nginx 配置
│   ├── package.json            # 依赖配置
│   ├── tailwind.config.js      # TailwindCSS 配置
│   ├── vite.config.ts          # Vite 配置
│   └── tsconfig.json           # TypeScript 配置
│
└── server-go/                  # 后端项目
    ├── cmd/
    │   └── server/
    │       └── main.go         # 入口文件
    ├── internal/
    │   ├── app/
    │   │   └── app.go          # 应用核心和路由
    │   ├── judger/
    │   │   ├── docker_runner.go    # Docker 评测器
    │   │   └── Dockerfile-runner   # 评测容器镜像
    │   └── store/              # 数据访问层
    │       ├── contests.go
    │       ├── helpers.go
    │       ├── problems.go
    │       ├── settings.go
    │       ├── store.go
    │       ├── submissions.go
    │       └── users.go
    ├── prisma/
    │   ├── schema.prisma       # 数据库模型
    │   └── migrations/         # 数据库迁移
    ├── Dockerfile              # 后端 Docker 配置
    ├── Dockerfile.migrate      # 迁移 Docker 配置
    ├── go.mod                  # Go 模块配置
    └── go.sum                  # 依赖锁定
```

---

## 📖 API 文档

### 认证接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/auth/register` | 用户注册 |
| `POST` | `/api/auth/login` | 用户登录 |

### 题目接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/problems` | 获取题目列表 | 公开 |
| `GET` | `/api/problems/{id}` | 获取题目详情 | 公开 |
| `GET` | `/api/problems/admin` | 管理员题目列表 | 管理员 |
| `GET` | `/api/problems/{id}/admin` | 管理员题目详情 | 管理员 |
| `POST` | `/api/problems` | 创建题目 | 管理员 |
| `PUT` | `/api/problems/{id}` | 更新题目 | 管理员 |
| `PATCH` | `/api/problems/{id}/visibility` | 切换可见性 | 管理员 |
| `DELETE` | `/api/problems/{id}` | 删除题目 | 管理员 |
| `POST` | `/api/problems/{id}/clone` | 克隆题目 | 管理员 |

### 提交接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/submissions` | 获取提交列表 | 登录用户 |
| `GET` | `/api/submissions/{id}` | 获取提交详情 | 登录用户 |
| `POST` | `/api/submissions` | 提交代码 | 登录用户 |

### 比赛接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/contests/public` | 公开比赛列表 | 公开 |
| `GET` | `/api/contests/public/{id}` | 比赛详情 | 公开 |
| `GET` | `/api/contests/public/{id}/leaderboard` | 排行榜 | 公开 |
| `GET` | `/api/contests/public/{id}/problem/{order}` | 比赛题目 | 公开 |
| `POST` | `/api/contests/{id}/join` | 加入比赛 | 登录用户 |
| `GET` | `/api/contests` | 管理员比赛列表 | 管理员 |
| `GET` | `/api/contests/{id}` | 管理员比赛详情 | 管理员 |
| `POST` | `/api/contests` | 创建比赛 | 管理员 |
| `PUT` | `/api/contests/{id}` | 更新比赛 | 管理员 |
| `GET` | `/api/contests/{id}/export` | 导出提交 | 管理员 |

### 设置接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/settings/registration` | 获取注册状态 | 公开 |
| `PUT` | `/api/settings/registration` | 设置注册状态 | 管理员 |

---

## ⚙️ 配置说明

### 环境变量

#### 后端 (server-go)

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | 必填 |
| `PORT` | 服务端口 | `3000` |
| `JWT_SECRET` | JWT 签名密钥 | `your-secret-key` |
| `JUDGE_IMAGE` | 评测容器镜像名称 | `judge-runner:latest` |

#### 前端 (client)

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `VITE_API_URL` | 后端 API 地址 | `/api` |

### 数据库模型

#### Problem（题目）

```prisma
model Problem {
  id                    Int        @id @default(autoincrement())
  title                 String
  description           String     // Markdown
  timeLimit             Int        // 毫秒
  memoryLimit           Int        // MB
  difficulty            Difficulty // LEVEL1-LEVEL7
  tags                  String[]
  visible               Boolean    @default(true)
  config                Json?      // 语言特定配置
  defaultCompileOptions String     @default("-O2")
}
```

#### User（用户）

```prisma
model User {
  id       Int    @id @default(autoincrement())
  username String @unique
  password String // bcrypt 加密
  role     Role   // ADMIN | STUDENT
}
```

#### Contest（比赛）

```prisma
model Contest {
  id           Int         @id @default(autoincrement())
  name         String
  description  String?
  startTime    DateTime
  endTime      DateTime
  rule         ContestRule // OI | IOI | ACM
  passwordHash String?
  isPublished  Boolean     @default(false)
  languages    String[]    // 允许的语言
}
```

---

## 💻 开发指南

### 添加新语言支持

1. 修改 `server-go/internal/judger/Dockerfile-runner` 添加语言运行时
2. 更新 `server-go/internal/judger/docker_runner.go` 中的 `Judge` 方法
3. 前端添加语言选项到代码编辑器

### 添加新的评测状态

1. 更新 `server-go/internal/judger/docker_runner.go`
2. 更新前端状态显示组件
3. 更新国际化文件

### 代码风格

- **Go**: 遵循官方 Go 代码规范，使用 `gofmt`
- **TypeScript/React**: 使用 ESLint 配置
- **提交信息**: 使用语义化提交信息

### 运行测试

```bash
# 前端测试
cd client
npm test

# 后端测试
cd server-go
go test ./...
```

---

## 🚢 部署

### 使用 Docker Compose（推荐）

```bash
# 生产环境部署
docker-compose -f docker-compose.yml up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 手动部署

1. **数据库**: 部署 PostgreSQL 15
2. **后端**: 编译 Go 二进制并运行
3. **前端**: 构建静态资源并使用 Nginx 部署
4. **评测器**: 构建并加载 judge-runner 镜像

### 生产环境建议

- 使用反向代理（Nginx）处理 HTTPS
- 配置数据库连接池
- 设置日志轮转
- 配置资源限制
- 使用持久化存储卷
- 定期备份数据库

---

## 🤝 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

### 问题报告

请使用 GitHub Issues 报告问题，并提供：

- 问题描述
- 复现步骤
- 期望行为
- 实际行为
- 环境信息

---

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

---

## 🙏 致谢

- [Chi](https://github.com/go-chi/chi) - Go HTTP 路由
- [Prisma](https://www.prisma.io/) - 数据库 ORM
- [React](https://reactjs.org/) - UI 框架
- [Vite](https://vitejs.dev/) - 构建工具
- [TailwindCSS](https://tailwindcss.com/) - CSS 框架
- [CodeMirror](https://codemirror.net/) - 代码编辑器

---

<p align="center">
  Made with ❤️ for competitive programming
</p>