// ── 100+ Built-in Skills ──────────────────────────────────────────────────

import { Skill } from './registry';
import { DESIGN_SKILLS } from './design-skills';

export function loadBuiltinSkills(): Skill[] {
  return [
    // ═══════════════════════════════════════════════════════════════════════
    //  Frontend (15)
    // ═══════════════════════════════════════════════════════════════════════
    {
      id: 'react-expert', name: 'React Expert', description: 'React 开发最佳实践',
      category: 'Frontend', icon: '⚛️',
      triggers: ['react', 'jsx', 'tsx', 'hooks', 'usestate', 'useeffect', 'redux', 'next.js', 'nextjs'],
      systemPrompt: 'Use functional components with hooks exclusively. Prefer custom hooks for reusable logic. Use React.memo/useMemo/useCallback for performance. Avoid inline object/function props. Use TypeScript interfaces for props. Prefer useReducer over useState for complex state. Use Suspense + lazy for code splitting. Test with React Testing Library, not Enzyme.',
      priority: 9,
    },
    {
      id: 'vue-expert', name: 'Vue Expert', description: 'Vue.js 开发专家',
      category: 'Frontend', icon: '💚',
      triggers: ['vue', 'vuex', 'pinia', 'nuxt', 'vue3', 'composition api', 'vite'],
      systemPrompt: 'Use Composition API with <script setup>. Prefer Pinia over Vuex. Use computed() for derived state. Use defineProps/defineEmits for type safety. Prefer provide/inject over deep prop drilling. Use v-memo for expensive renders. Always define reactive types explicitly.',
      priority: 9,
    },
    {
      id: 'svelte-expert', name: 'Svelte Expert', description: 'Svelte/SvelteKit 开发',
      category: 'Frontend', icon: '🔥',
      triggers: ['svelte', 'sveltekit', 'svelte store', 'runes'],
      systemPrompt: 'Use Svelte 5 runes ($state, $derived, $effect) when available. Prefer stores for cross-component state. Use {#await} for async rendering. Use transitions for UI polish. Prefer SvelteKit for full-stack apps. Keep components small and focused.',
      priority: 8,
    },
    {
      id: 'angular-expert', name: 'Angular Expert', description: 'Angular 框架开发',
      category: 'Frontend', icon: '🅰️',
      triggers: ['angular', 'typescript decorator', 'rxjs', 'ngrx', 'angular cli'],
      systemPrompt: 'Use standalone components. Prefer signals over RxJS for simple state. Use OnPush change detection. Use inject() function instead of constructor injection. Use lazy loading with loadComponent. Keep modules minimal. Use Angular Material for UI consistency.',
      priority: 8,
    },
    {
      id: 'nextjs-expert', name: 'Next.js Expert', description: 'Next.js 全栈框架',
      category: 'Frontend', icon: '▲',
      triggers: ['nextjs', 'next.js', 'app router', 'server component', 'server action', 'api route'],
      systemPrompt: 'Use App Router with Server Components by default. Mark "use client" only when needed. Use Server Actions for mutations. Prefer generateStaticParams for static pages. Use Route Handlers for API. Implement proper loading.tsx and error.tsx boundaries. Use Image component for optimization.',
      priority: 9,
    },
    {
      id: 'tailwind-expert', name: 'Tailwind Expert', description: 'Tailwind CSS 开发',
      category: 'Frontend', icon: '🎨',
      triggers: ['tailwind', 'tailwindcss', 'utility-first', 'postcss'],
      systemPrompt: 'Use Tailwind v4 utilities. Prefer @apply for repeated patterns. Use design tokens via CSS variables. Avoid arbitrary values — extend theme instead. Use responsive prefixes (sm:, md:, lg:). Group related utilities. Use cn() or clsx for conditional classes.',
      priority: 7,
    },
    {
      id: 'css-architecture', name: 'CSS Architecture', description: 'CSS 架构与方法论',
      category: 'Frontend', icon: '🎯',
      triggers: ['css', 'scss', 'sass', 'styled-components', 'css modules', 'css-in-js', 'bem'],
      systemPrompt: 'Use CSS custom properties for theming. Prefer CSS Grid for 2D layouts, Flexbox for 1D. Use container queries over media queries when possible. Avoid !important. Use logical properties (margin-inline vs margin-left). Scope styles with CSS Modules or BEM.',
      priority: 6,
    },
    {
      id: 'web-performance', name: 'Web Performance', description: 'Web 性能优化',
      category: 'Frontend', icon: '⚡',
      triggers: ['performance', 'lighthouse', 'core web vitals', 'LCP', 'FID', 'CLS', 'lazy load', 'bundle size'],
      systemPrompt: 'Target LCP < 2.5s, FID < 100ms, CLS < 0.1. Use dynamic imports for code splitting. Implement image lazy loading with native loading="lazy". Use Web Vitals library for monitoring. Preload critical resources. Minimize main thread work. Use Web Workers for heavy computation.',
      priority: 8,
    },
    {
      id: 'web-accessibility', name: 'Web Accessibility', description: 'Web 无障碍 (a11y)',
      category: 'Frontend', icon: '♿',
      triggers: ['accessibility', 'a11y', 'aria', 'screen reader', 'wcag', 'keyboard navigation'],
      systemPrompt: 'Follow WCAG 2.1 AA guidelines. Use semantic HTML (button, nav, main, article). Add ARIA labels when semantic HTML is insufficient. Ensure keyboard navigation works for all interactive elements. Maintain 4.5:1 contrast ratio minimum. Test with screen readers. Use skip-navigation links.',
      priority: 8,
    },
    {
      id: 'web-animation', name: 'Web Animation', description: 'Web 动画开发',
      category: 'Frontend', icon: '✨',
      triggers: ['animation', 'transition', 'motion', 'framer-motion', 'gsap', 'css animation', 'keyframe'],
      systemPrompt: 'Prefer CSS transitions for simple state changes. Use CSS @keyframes for looping animations. Use Web Animations API or GSAP for complex sequences. Prefer transform/opacity (GPU-accelerated) over layout properties. Use prefers-reduced-motion media query. Use Framer Motion for React animations.',
      priority: 6,
    },
    {
      id: 'responsive-design', name: 'Responsive Design', description: '响应式设计',
      category: 'Frontend', icon: '📱',
      triggers: ['responsive', 'mobile-first', 'breakpoint', 'media query', 'viewport'],
      systemPrompt: 'Design mobile-first with progressive enhancement. Use relative units (rem, em, vw, vh). Use container queries for component-level responsiveness. Test at 320px, 768px, 1024px, 1440px breakpoints. Use fluid typography with clamp(). Avoid fixed-width layouts.',
      priority: 7,
    },
    {
      id: 'micro-frontends', name: 'Micro Frontends', description: '微前端架构',
      category: 'Frontend', icon: '🏗️',
      triggers: ['micro-frontend', 'module federation', 'single-spa', 'qiankun'],
      systemPrompt: 'Use Module Federation for Webpack 5 sharing. Define clear contracts between shells and remotes. Share dependencies (React, Vue) to avoid duplication. Handle routing at shell level. Use events for cross-app communication. Each micro frontend should be independently deployable.',
      priority: 6,
    },
    {
      id: 'html-expert', name: 'HTML Expert', description: '语义化 HTML',
      category: 'Frontend', icon: '📄',
      triggers: ['html', 'semantic', 'html5', 'markup'],
      systemPrompt: 'Use semantic elements (header, nav, main, section, article, aside, footer). Use proper heading hierarchy (h1-h6). Add alt text to all images. Use figure/figcaption for images with captions. Use details/summary for collapsible content. Validate HTML.',
      priority: 5,
    },
    {
      id: 'frontend-testing', name: 'Frontend Testing', description: '前端测试策略',
      category: 'Frontend', icon: '🧪',
      triggers: ['frontend test', 'component test', 'vitest', 'jest', 'testing library', 'cypress', 'e2e'],
      systemPrompt: 'Use Testing Library for component tests (test behavior, not implementation). Use Vitest for unit tests. Use Cypress or Playwright for E2E. Mock API calls at network level (MSW). Test accessibility with axe-core. Aim for >80% coverage on critical paths.',
      priority: 7,
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  Backend (15)
    // ═══════════════════════════════════════════════════════════════════════
    {
      id: 'nodejs-expert', name: 'Node.js Expert', description: 'Node.js 后端开发',
      category: 'Backend', icon: '🟢',
      triggers: ['node', 'nodejs', 'express', 'fastify', 'nestjs', 'koa', 'hono'],
      systemPrompt: 'Use ESM modules. Handle errors with try/catch, not callbacks. Use structured logging (pino/winston). Implement graceful shutdown. Use connection pooling for databases. Prefer Fastify over Express for performance. Use native fetch over axios. Set NODE_ENV properly.',
      priority: 9,
    },
    {
      id: 'python-backend', name: 'Python Backend', description: 'Python 后端开发',
      category: 'Backend', icon: '🐍',
      triggers: ['python', 'django', 'flask', 'fastapi', 'uvicorn', 'pydantic', 'asyncio'],
      systemPrompt: 'Use type hints everywhere. Prefer FastAPI for new APIs. Use Pydantic for validation. Use async/await for I/O-bound operations. Use context managers for resource cleanup. Prefer dataclasses/Pydantic models over dicts. Use ruff for linting/formatting.',
      priority: 9,
    },
    {
      id: 'go-expert', name: 'Go Expert', description: 'Go 语言开发',
      category: 'Backend', icon: '🔵',
      triggers: ['golang', 'go', 'gin', 'fiber', 'goroutine', 'channel'],
      systemPrompt: 'Handle errors explicitly — never ignore. Use context for cancellation/timeouts. Prefer channels over mutexes for coordination. Use table-driven tests. Keep interfaces small. Use go:embed for static assets. Profile before optimizing. Use sync.Pool for frequent allocations.',
      priority: 9,
    },
    {
      id: 'rust-backend', name: 'Rust Backend', description: 'Rust 后端开发',
      category: 'Backend', icon: '🦀',
      triggers: ['rust', 'actix', 'axum', 'tokio', 'serde', 'cargo'],
      systemPrompt: 'Use Result<T, E> for error handling, not unwrap(). Use thiserror for library errors, anyhow for applications. Prefer owned types in APIs. Use Arc<Mutex<T>> for shared state. Use #[derive] liberally. Profile with cargo-flamegraph. Use clippy and rustfmt.',
      priority: 9,
    },
    {
      id: 'java-spring', name: 'Java Spring', description: 'Java Spring Boot 开发',
      category: 'Backend', icon: '☕',
      triggers: ['java', 'spring', 'springboot', 'spring boot', 'jpa', 'hibernate', 'maven', 'gradle'],
      systemPrompt: 'Use Spring Boot 3.x with Java 17+. Prefer constructor injection. Use records for DTOs. Use @Transactional at service layer. Use Flyway for migrations. Use Testcontainers for integration tests. Use virtual threads (Java 21) for I/O concurrency.',
      priority: 8,
    },
    {
      id: 'csharp-aspnet', name: 'C# ASP.NET', description: 'C# ASP.NET Core 开发',
      category: 'Backend', icon: '💜',
      triggers: ['csharp', 'c#', 'aspnet', 'asp.net', 'dotnet', 'entity framework'],
      systemPrompt: 'Use minimal APIs for simple endpoints. Use MediatR for CQRS. Use FluentValidation. Prefer record types for immutable data. Use EF Core with code-first migrations. Use dependency injection built into ASP.NET. Use structured logging with Serilog.',
      priority: 8,
    },
    {
      id: 'laravel-expert', name: 'Laravel Expert', description: 'Laravel PHP 开发',
      category: 'Backend', icon: '🔺',
      triggers: ['laravel', 'php', 'eloquent', 'artisan', 'blade'],
      systemPrompt: 'Use Eloquent relationships properly (avoid N+1 with eager loading). Use Form Requests for validation. Use API Resources for serialization. Use Jobs for async work. Use Events/Listeners for decoupling. Use Laravel Pint for code style. Use Pest for testing.',
      priority: 8,
    },
    {
      id: 'ruby-rails', name: 'Ruby on Rails', description: 'Rails 开发',
      category: 'Backend', icon: '💎',
      triggers: ['ruby', 'rails', 'activerecord', 'rspec', 'bundler'],
      systemPrompt: 'Follow Rails conventions (fat model, skinny controller). Use ActiveRecord callbacks sparingly. Use service objects for complex business logic. Use RSpec with FactoryBot. Use Strong Parameters. Use database-level constraints. Use background jobs (Sidekiq) for slow tasks.',
      priority: 8,
    },
    {
      id: 'rest-api-design', name: 'REST API Design', description: 'RESTful API 设计',
      category: 'Backend', icon: '🔌',
      triggers: ['rest', 'api', 'endpoint', 'restful', 'http api', 'crud'],
      systemPrompt: 'Use plural nouns for resources (/users, not /user). Use HTTP methods correctly (GET=read, POST=create, PUT=replace, PATCH=update, DELETE=delete). Return proper status codes (201 for create, 204 for delete). Use pagination (cursor-based preferred). Version APIs via URL path. Use HATEOAS when appropriate.',
      priority: 7,
    },
    {
      id: 'graphql-expert', name: 'GraphQL Expert', description: 'GraphQL API 开发',
      category: 'Backend', icon: '◆',
      triggers: ['graphql', 'apollo', 'relay', 'schema', 'resolver', 'mutation', 'subscription'],
      systemPrompt: 'Use code-first approach (TypeGraphQL/Pothos). Implement DataLoader for N+1 prevention. Use fragments for reusable field sets. Limit query depth/complexity. Use persisted queries in production. Implement proper error handling with union types. Use subscriptions sparingly.',
      priority: 7,
    },
    {
      id: 'grpc-expert', name: 'gRPC Expert', description: 'gRPC 服务开发',
      category: 'Backend', icon: '📡',
      triggers: ['grpc', 'protobuf', 'proto', 'rpc', 'protocol buffer'],
      systemPrompt: 'Use proto3 syntax. Define clear service contracts. Use streaming for real-time data. Implement health checks. Use interceptors for cross-cutting concerns. Handle deadlines/timeouts. Use gRPC-Web for browser clients. Version your protos.',
      priority: 6,
    },
    {
      id: 'websocket-expert', name: 'WebSocket Expert', description: 'WebSocket 实时通信',
      category: 'Backend', icon: '🔗',
      triggers: ['websocket', 'ws', 'socket.io', 'real-time', 'realtime', 'sse', 'server-sent'],
      systemPrompt: 'Use ws over socket.io for lightweight needs. Implement heartbeat/ping-pong for connection health. Handle reconnection on client side. Use rooms/namespaces for message routing. Consider SSE for server-to-client only. Scale with Redis Pub/Sub for multi-instance.',
      priority: 7,
    },
    {
      id: 'api-security-expert', name: 'API Security', description: 'API 安全最佳实践',
      category: 'Backend', icon: '🔒',
      triggers: ['api security', 'rate limit', 'cors', 'csrf', 'authentication', 'authorization', 'jwt'],
      systemPrompt: 'Use rate limiting per endpoint. Implement CORS properly (not *). Use CSRF tokens for state-changing requests. Validate all input server-side. Use short-lived JWTs with refresh tokens. Implement proper RBAC. Use HTTPS everywhere. Log security events.',
      priority: 8,
    },
    {
      id: 'api-versioning', name: 'API Versioning', description: 'API 版本管理',
      category: 'Backend', icon: '🔖',
      triggers: ['api version', 'versioning', 'breaking change', 'deprecation'],
      systemPrompt: 'Use URL path versioning (/v1/, /v2/) for simplicity. Use headers for content negotiation. Deprecate with sunset headers. Maintain backward compatibility. Document breaking changes. Support at least 2 major versions concurrently.',
      priority: 5,
    },
    {
      id: 'serverless', name: 'Serverless', description: '无服务器架构',
      category: 'Backend', icon: '☁️',
      triggers: ['serverless', 'lambda', 'cloud function', 'vercel', 'netlify', 'edge function', 'edge computing'],
      systemPrompt: 'Keep functions small and focused. Minimize cold starts (avoid heavy dependencies). Use environment variables for config. Implement idempotency. Use provisioned concurrency for latency-critical paths. Monitor with X-Ray or equivalent. Use Step Functions for orchestration.',
      priority: 7,
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  Mobile (10)
    // ═══════════════════════════════════════════════════════════════════════
    {
      id: 'react-native-expert', name: 'React Native', description: 'React Native 移动开发',
      category: 'Mobile', icon: '📱',
      triggers: ['react native', 'react-native', 'expo', 'rn', 'mobile app'],
      systemPrompt: 'Use Expo for managed workflow. Use Hermes engine for performance. Use FlatList with keyExtractor for lists. Avoid inline functions in renderItem. Use react-native-reanimated for animations. Test on real devices. Use Flipper for debugging.',
      priority: 9,
    },
    {
      id: 'flutter-expert', name: 'Flutter Expert', description: 'Flutter 跨平台开发',
      category: 'Mobile', icon: '🐦',
      triggers: ['flutter', 'dart', 'widget', 'riverpod', 'bloc', 'material design'],
      systemPrompt: 'Use const constructors where possible. Prefer composition over inheritance for widgets. Use Riverpod or BLoC for state management. Use ListView.builder for long lists. Implement responsive layouts with MediaQuery. Use Dart analysis tools. Write widget tests.',
      priority: 9,
    },
    {
      id: 'ios-native', name: 'iOS Native', description: 'iOS 原生开发',
      category: 'Mobile', icon: '🍎',
      triggers: ['ios', 'swift', 'swiftui', 'uikit', 'xcode', 'cocoapods', 'spm'],
      systemPrompt: 'Use SwiftUI for new views. Use async/await for concurrency. Use Combine for reactive streams. Follow HIG for design. Use SF Symbols for icons. Implement proper state management with @State, @Binding, @Environment. Use Instruments for profiling.',
      priority: 8,
    },
    {
      id: 'android-native', name: 'Android Native', description: 'Android 原生开发',
      category: 'Mobile', icon: '🤖',
      triggers: ['android', 'kotlin', 'jetpack compose', 'gradle', 'material design'],
      systemPrompt: 'Use Jetpack Compose for new UIs. Use Kotlin Coroutines for async. Use Hilt for DI. Use Room for local database. Follow Material Design 3 guidelines. Use Kotlin Flow for reactive data. Implement proper lifecycle awareness.',
      priority: 8,
    },
    {
      id: 'expo-expert', name: 'Expo Expert', description: 'Expo 框架开发',
      category: 'Mobile', icon: '📦',
      triggers: ['expo', 'eas', 'expo router', 'expo go'],
      systemPrompt: 'Use Expo Router for file-based routing. Use EAS Build for CI/CD. Use expo-secure-store for sensitive data. Use expo-notifications for push. Use expo-camera, expo-image-picker as needed. Prefer managed workflow over bare.',
      priority: 7,
    },
    {
      id: 'jetpack-compose-expert', name: 'Jetpack Compose', description: 'Jetpack Compose UI',
      category: 'Mobile', icon: '🧱',
      triggers: ['compose', 'jetpack compose', 'composable'],
      systemPrompt: 'Use remember/rememberSaveable for state. Use LaunchedEffect for side effects. Use derivedStateOf for computed values. Prefer Modifier chaining for styling. Use LazyColumn/LazyRow for lists. Use Navigation Compose for navigation. Preview with @Preview.',
      priority: 8,
    },
    {
      id: 'swiftui-expert', name: 'SwiftUI Expert', description: 'SwiftUI 开发',
      category: 'Mobile', icon: '🔶',
      triggers: ['swiftui', 'swift ui', 'viewmodel', 'navigationstack'],
      systemPrompt: 'Use @State for local state, @Binding for child communication. Use @Observable (iOS 17+) over ObservableObject. Use NavigationStack for routing. Use .task modifier for async work. Use SF Symbols. Support Dynamic Type and Dark Mode.',
      priority: 8,
    },
    {
      id: 'mobile-testing', name: 'Mobile Testing', description: '移动端测试',
      category: 'Mobile', icon: '🧪',
      triggers: ['mobile test', 'appium', 'detox', 'xcuitest', 'espresso'],
      systemPrompt: 'Use Detox for React Native E2E tests. Use XCTest/XCUITest for iOS. Use Espresso for Android. Mock network calls in unit tests. Test on multiple screen sizes. Test offline scenarios. Use snapshot testing for UI regression.',
      priority: 6,
    },
    {
      id: 'mobile-performance', name: 'Mobile Performance', description: '移动端性能优化',
      category: 'Mobile', icon: '⚡',
      triggers: ['mobile performance', 'app performance', 'jank', 'frame drop', 'memory leak'],
      systemPrompt: 'Target 60fps consistently. Reduce bridge calls in React Native. Use native driver for animations. Implement list virtualization. Optimize image loading (downsampling, caching). Profile memory usage. Reduce app startup time. Use bundle splitting.',
      priority: 7,
    },
    {
      id: 'push-notifications', name: 'Push Notifications', description: '推送通知',
      category: 'Mobile', icon: '🔔',
      triggers: ['push notification', 'firebase messaging', 'fcm', 'apns', 'notification'],
      systemPrompt: 'Use FCM for cross-platform push. Handle notification permissions gracefully. Use notification channels (Android). Implement deep linking from notifications. Handle background/foreground/killed states. Use rich notifications with images/actions. Implement notification grouping.',
      priority: 5,
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  Database (8)
    // ═══════════════════════════════════════════════════════════════════════
    {
      id: 'postgresql-expert', name: 'PostgreSQL Expert', description: 'PostgreSQL 数据库',
      category: 'Database', icon: '🐘',
      triggers: ['postgres', 'postgresql', 'pg', 'psql', 'plpgsql'],
      systemPrompt: 'Use EXPLAIN ANALYZE for query optimization. Use partial indexes for filtered queries. Use CTEs for readability. Use JSONB for flexible schema. Use connection pooling (PgBouncer). Use pg_stat_statements for monitoring. Use row-level security for multi-tenancy.',
      priority: 9,
    },
    {
      id: 'mongodb-expert', name: 'MongoDB Expert', description: 'MongoDB 文档数据库',
      category: 'Database', icon: '🍃',
      triggers: ['mongodb', 'mongo', 'mongoose', 'nosql', 'document database'],
      systemPrompt: 'Design schema for query patterns, not normalization. Use compound indexes. Use aggregation pipeline for complex queries. Use change streams for real-time. Implement proper sharding strategy. Use transactions for multi-document consistency. Monitor with Atlas or mongostat.',
      priority: 8,
    },
    {
      id: 'redis-expert', name: 'Redis Expert', description: 'Redis 缓存/数据结构',
      category: 'Database', icon: '🔴',
      triggers: ['redis', 'cache', 'caching', 'pubsub', 'session store', 'rate limit'],
      systemPrompt: 'Use Redis for caching (TTL-based), session storage, rate limiting, pub/sub. Use data structures appropriately (sorted sets for leaderboards, streams for event logs). Implement cache invalidation strategy. Use pipelines for batch operations. Use Lua scripts for atomic operations.',
      priority: 8,
    },
    {
      id: 'elasticsearch-expert', name: 'Elasticsearch Expert', description: 'Elasticsearch 搜索引擎',
      category: 'Database', icon: '🔍',
      triggers: ['elasticsearch', 'elastic', 'kibana', 'lucene', 'full-text search', 'search engine'],
      systemPrompt: 'Design mappings explicitly (don\'t rely on dynamic mapping). Use analyzers for text search. Use aggregations for analytics. Implement proper index lifecycle management. Use bulk API for batch operations. Monitor cluster health. Use aliases for zero-downtime reindexing.',
      priority: 7,
    },
    {
      id: 'sqlite-expert', name: 'SQLite Expert', description: 'SQLite 嵌入式数据库',
      category: 'Database', icon: '💾',
      triggers: ['sqlite', 'sqlite3', 'better-sqlite3', 'drizzle'],
      systemPrompt: 'Use WAL mode for concurrent reads. Use prepared statements for performance. Use STRICT tables for type safety. Keep database files on local filesystem. Use FTS5 for full-text search. Use JSON functions for flexible columns. Back up with .backup command.',
      priority: 6,
    },
    {
      id: 'database-migration', name: 'Database Migration', description: '数据库迁移策略',
      category: 'Database', icon: '🔄',
      triggers: ['migration', 'flyway', 'alembic', 'prisma migrate', 'knex', 'schema change'],
      systemPrompt: 'Use forward-only migrations. Always backup before migration. Test migrations on staging first. Make migrations idempotent. Add columns as nullable first, backfill, then add NOT NULL constraint. Use online schema change tools for large tables (gh-ost, pt-online-schema-change).',
      priority: 7,
    },
    {
      id: 'sql-optimization', name: 'SQL Optimization', description: 'SQL 查询优化',
      category: 'Database', icon: '📊',
      triggers: ['sql', 'query optimization', 'slow query', 'explain plan', 'index optimization'],
      systemPrompt: 'Use EXPLAIN ANALYZE to understand query plans. Create indexes for WHERE/JOIN/ORDER BY columns. Avoid SELECT *. Use covering indexes for frequent queries. Avoid N+1 queries with JOINs or eager loading. Partition large tables. Use connection pooling.',
      priority: 8,
    },
    {
      id: 'vector-database', name: 'Vector Database', description: '向量数据库',
      category: 'Database', icon: '🧬',
      triggers: ['vector database', 'pinecone', 'weaviate', 'qdrant', 'chromadb', 'embedding', 'similarity search'],
      systemPrompt: 'Use HNSW index for approximate nearest neighbor search. Normalize vectors for cosine similarity. Use metadata filtering to narrow search space. Batch insert for performance. Choose dimension based on embedding model. Use hybrid search (vector + keyword) for best results.',
      priority: 7,
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  DevOps (12)
    // ═══════════════════════════════════════════════════════════════════════
    {
      id: 'docker-expert', name: 'Docker Expert', description: 'Docker 容器化',
      category: 'DevOps', icon: '🐳',
      triggers: ['docker', 'dockerfile', 'container', 'docker compose', 'image', 'containerize'],
      systemPrompt: 'Use multi-stage builds to minimize image size. Use alpine base images. Don\'t run as root. Use .dockerignore. Pin base image versions. Use health checks. Minimize layers. Use BuildKit cache mounts for dependencies. Use docker compose for local dev.',
      priority: 9,
    },
    {
      id: 'kubernetes-expert', name: 'Kubernetes Expert', description: 'Kubernetes 编排',
      category: 'DevOps', icon: '☸️',
      triggers: ['kubernetes', 'k8s', 'kubectl', 'helm', 'pod', 'deployment', 'ingress', 'istio'],
      systemPrompt: 'Use declarative YAML manifests. Set resource requests/limits. Use namespaces for isolation. Implement readiness/liveness probes. Use HPA for autoscaling. Use NetworkPolicy for security. Use Helm for templating. Monitor with Prometheus/Grafana.',
      priority: 9,
    },
    {
      id: 'terraform-expert', name: 'Terraform Expert', description: 'Terraform IaC',
      category: 'DevOps', icon: '🏗️',
      triggers: ['terraform', 'iac', 'infrastructure', 'tf', 'hcl', 'terragrunt'],
      systemPrompt: 'Use remote state (S3/GCS + DynamoDB/Consul for locking). Use modules for reuse. Use workspaces for environments. Run plan before apply. Use variables.tf/outputs.tf pattern. Import existing resources. Use terraform-docs for documentation. Use Terratest for testing.',
      priority: 8,
    },
    {
      id: 'ci-cd-pipeline', name: 'CI/CD Pipeline', description: 'CI/CD 流水线',
      category: 'DevOps', icon: '🔧',
      triggers: ['ci', 'cd', 'pipeline', 'github actions', 'gitlab ci', 'jenkins', 'build', 'deploy'],
      systemPrompt: 'Use GitHub Actions or GitLab CI. Cache dependencies between runs. Run tests in parallel. Use matrix builds for multi-platform. Implement branch protection. Use semantic versioning. Implement rollback strategy. Use OIDC for cloud auth (no long-lived secrets).',
      priority: 8,
    },
    {
      id: 'aws-devops', name: 'AWS DevOps', description: 'AWS 云服务',
      category: 'DevOps', icon: '☁️',
      triggers: ['aws', 'ec2', 's3', 'lambda', 'rds', 'ecs', 'cloudformation', 'iam'],
      systemPrompt: 'Use IAM roles, not access keys. Use S3 for static assets with CloudFront. Use RDS with Multi-AZ for databases. Use ECS Fargate over EC2 for containers. Implement proper VPC/security group design. Use CloudFormation or CDK for IaC. Enable CloudTrail for audit.',
      priority: 8,
    },
    {
      id: 'nginx-expert', name: 'Nginx Expert', description: 'Nginx 服务器配置',
      category: 'DevOps', icon: '🌐',
      triggers: ['nginx', 'reverse proxy', 'load balancer', 'web server'],
      systemPrompt: 'Use upstream blocks for load balancing. Enable gzip compression. Set proper cache headers. Use proxy_pass for reverse proxy. Configure SSL/TLS properly (TLS 1.3). Use rate limiting (limit_req). Implement proper security headers. Use server blocks for virtual hosting.',
      priority: 7,
    },
    {
      id: 'monitoring', name: 'Monitoring', description: '监控与可观测性',
      category: 'DevOps', icon: '📈',
      triggers: ['monitoring', 'observability', 'logging', 'tracing', 'metrics', 'alerting', 'grafana'],
      systemPrompt: 'Implement the three pillars: logs, metrics, traces. Use structured logging (JSON). Use OpenTelemetry for distributed tracing. Set up alerts with meaningful thresholds. Use dashboards for visualization. Implement SLOs/SLIs. Use correlation IDs across services.',
      priority: 7,
    },
    {
      id: 'sre-expert', name: 'SRE Expert', description: '站点可靠性工程',
      category: 'DevOps', icon: '🛡️',
      triggers: ['sre', 'reliability', 'slo', 'sli', 'error budget', 'incident', 'oncall'],
      systemPrompt: 'Define SLOs with error budgets. Use toil reduction for automation. Implement blameless postmortems. Use runbooks for common incidents. Practice chaos engineering. Implement progressive rollouts. Use feature flags for safe deployments. Maintain operational readiness.',
      priority: 7,
    },
    {
      id: 'git-expert', name: 'Git Expert', description: 'Git 版本控制',
      category: 'DevOps', icon: '🔀',
      triggers: ['git', 'branch', 'merge', 'rebase', 'commit', 'gitflow'],
      systemPrompt: 'Use conventional commits (feat:, fix:, chore:). Prefer rebase for clean history. Use interactive rebase to squash. Use git bisect for bug hunting. Use worktrees for parallel work. Use reflog for recovery. Write meaningful commit messages.',
      priority: 7,
    },
    {
      id: 'linux-systems', name: 'Linux Systems', description: 'Linux 系统管理',
      category: 'DevOps', icon: '🐧',
      triggers: ['linux', 'bash', 'shell', 'systemd', 'cron', 'ssh', 'permissions'],
      systemPrompt: 'Use shellcheck for bash scripts. Use set -euo pipefail. Use systemd for service management. Use journalctl for logs. Set proper file permissions (principle of least privilege). Use SSH keys, not passwords. Use cron/systemd timers for scheduled tasks.',
      priority: 7,
    },
    {
      id: 'prometheus-expert', name: 'Prometheus Expert', description: 'Prometheus 监控',
      category: 'DevOps', icon: '🔥',
      triggers: ['prometheus', 'promql', 'alertmanager', 'metrics'],
      systemPrompt: 'Use labels wisely (high cardinality kills Prometheus). Use recording rules for expensive queries. Implement proper alerting rules with for clause. Use Pushgateway for batch jobs. Use exporters for third-party services. Use histograms for latency metrics.',
      priority: 6,
    },
    {
      id: 'grafana-expert', name: 'Grafana Expert', description: 'Grafana 可视化',
      category: 'DevOps', icon: '📊',
      triggers: ['grafana', 'dashboard', 'visualization', 'panel'],
      systemPrompt: 'Use variables for dynamic dashboards. Use row-level permissions. Provision dashboards as code (JSON/YAML). Use alerting with proper routing. Use annotations for deployments. Use template variables for environment filtering. Export/import dashboards as JSON.',
      priority: 6,
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  Testing (8)
    // ═══════════════════════════════════════════════════════════════════════
    {
      id: 'playwright-expert', name: 'Playwright Expert', description: 'Playwright E2E 测试',
      category: 'Testing', icon: '🎭',
      triggers: ['playwright', 'e2e', 'end-to-end', 'browser test', 'ui test'],
      systemPrompt: 'Use locators (getByRole, getByText) over CSS selectors. Use auto-waiting (no manual waits). Use fixtures for test setup. Use codegen for test recording. Use trace viewer for debugging. Run tests in parallel. Use API testing for backend. Use visual comparison for screenshots.',
      priority: 8,
    },
    {
      id: 'unit-testing', name: 'Unit Testing', description: '单元测试策略',
      category: 'Testing', icon: '🔬',
      triggers: ['unit test', 'unittest', 'jest', 'vitest', 'mocha', 'pytest', 'xunit'],
      systemPrompt: 'Follow AAA pattern (Arrange, Act, Assert). One assertion per test ideally. Use descriptive test names. Mock external dependencies only. Test edge cases and error paths. Keep tests fast (< 100ms each). Use test factories for data generation. Measure coverage but don\'t chase 100%.',
      priority: 8,
    },
    {
      id: 'e2e-testing', name: 'E2E Testing', description: '端到端测试',
      category: 'Testing', icon: '🔄',
      triggers: ['e2e test', 'integration test', 'cypress', 'system test'],
      systemPrompt: 'Test critical user journeys. Use page object pattern. Avoid testing implementation details. Use data-testid for stable selectors. Clean up test data after each test. Run E2E tests in CI on every PR. Use parallel test execution. Record failures with screenshots/video.',
      priority: 7,
    },
    {
      id: 'performance-profiling', name: 'Performance Profiling', description: '性能分析',
      category: 'Testing', icon: '⚡',
      triggers: ['performance', 'profiling', 'benchmark', 'latency', 'throughput', 'bottleneck'],
      systemPrompt: 'Profile before optimizing (don\'t guess). Use flame graphs for CPU profiling. Use memory profilers for leak detection. Benchmark with realistic data volumes. Measure p50, p95, p99 latencies (not just averages). Use load testing tools (k6, artillery). Establish baselines before changes.',
      priority: 8,
    },
    {
      id: 'load-testing', name: 'Load Testing', description: '负载测试',
      category: 'Testing', icon: '🏋️',
      triggers: ['load test', 'stress test', 'k6', 'artillery', 'jmeter', 'concurrent', 'capacity'],
      systemPrompt: 'Use k6 or Artillery for modern load testing. Model realistic user behavior (think time, navigation patterns). Ramp up gradually. Test at 2x expected peak. Monitor server resources during tests. Identify breaking points. Test database connection pool limits. Test with production-like data.',
      priority: 7,
    },
    {
      id: 'security-testing', name: 'Security Testing', description: '安全测试',
      category: 'Testing', icon: '🛡️',
      triggers: ['security test', 'penetration test', 'pentest', 'vulnerability', 'pen test'],
      systemPrompt: 'Run SAST tools (Semgrep, CodeQL) in CI. Use DAST tools (OWASP ZAP) against staging. Test for OWASP Top 10. Use dependency scanning (Snyk, npm audit). Test authentication/authorization thoroughly. Test input validation at all boundaries. Use fuzzing for input testing.',
      priority: 8,
    },
    {
      id: 'mutation-testing', name: 'Mutation Testing', description: '变异测试',
      category: 'Testing', icon: '🧬',
      triggers: ['mutation test', 'stryker', 'mutant', 'test quality'],
      systemPrompt: 'Use StrykerJS or similar. Target mutation score > 80%. Focus on surviving mutants (they reveal test gaps). Run on changed files only for speed. Use equivalent mutant detection. Integrate with CI for regression prevention.',
      priority: 5,
    },
    {
      id: 'test-architecture', name: 'Test Architecture', description: '测试架构设计',
      category: 'Testing', icon: '🏛️',
      triggers: ['test architecture', 'test strategy', 'test pyramid', 'test coverage', 'testing strategy'],
      systemPrompt: 'Follow the test pyramid (many unit, fewer integration, fewest E2E). Separate test types with tags. Use shared test utilities/fixtures. Implement contract tests for APIs. Use snapshot testing judiciously. Maintain test environments as code. Track flaky tests and fix them.',
      priority: 6,
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  Security (8)
    // ═══════════════════════════════════════════════════════════════════════
    {
      id: 'owasp-top10', name: 'OWASP Top 10', description: 'OWASP 安全防护',
      category: 'Security', icon: '🛡️',
      triggers: ['owasp', 'xss', 'csrf', 'sqli', 'injection', 'security vulnerability'],
      systemPrompt: 'Prevent injection: use parameterized queries, validate/sanitize all input. Prevent XSS: encode output, use CSP headers. Prevent CSRF: use anti-CSRF tokens. Implement proper auth: bcrypt for passwords, MFA support. Use security headers (CSP, HSTS, X-Frame-Options).',
      priority: 9,
    },
    {
      id: 'api-security-audit', name: 'API Security Audit', description: 'API 安全审计',
      category: 'Security', icon: '🔍',
      triggers: ['api audit', 'security audit', 'api vulnerability', 'endpoint security'],
      systemPrompt: 'Check for broken authentication. Verify rate limiting. Check for mass assignment vulnerabilities. Verify input validation on all endpoints. Check for information disclosure in errors. Verify CORS configuration. Check for BOLA/IDOR vulnerabilities. Audit API key management.',
      priority: 8,
    },
    {
      id: 'sql-injection', name: 'SQL Injection', description: 'SQL 注入防护',
      category: 'Security', icon: '💉',
      triggers: ['sql injection', 'sqli', 'parameterized query', 'prepared statement'],
      systemPrompt: 'NEVER concatenate user input into SQL strings. Use parameterized queries/prepared statements exclusively. Use ORM query builders. Implement input validation (type, length, format). Use stored procedures with parameters. Apply least-privilege database user permissions. Use WAF as defense-in-depth.',
      priority: 9,
    },
    {
      id: 'xss-expert', name: 'XSS Prevention', description: 'XSS 防护',
      category: 'Security', icon: '🧹',
      triggers: ['xss', 'cross-site scripting', 'content security policy', 'csp', 'sanitize', 'escape'],
      systemPrompt: 'Encode all output context-appropriately (HTML, JS, URL, CSS). Use CSP headers (nonce-based). Use DOMPurify for rich HTML input. Never use innerHTML with user data. Use textContent over innerHTML. Use framework auto-escaping (React JSX, Vue templates). Implement Trusted Types.',
      priority: 9,
    },
    {
      id: 'auth-system', name: 'Auth System', description: '认证系统设计',
      category: 'Security', icon: '🔑',
      triggers: ['authentication', 'auth', 'login', 'session', 'oauth', 'oidc', 'sso', 'mfa'],
      systemPrompt: 'Use bcrypt/argon2 for password hashing. Implement account lockout after failed attempts. Use short-lived JWTs + refresh tokens. Support MFA (TOTP, WebAuthn). Implement proper session management. Use OAuth 2.0/OIDC for third-party auth. Implement PKCE for SPAs.',
      priority: 8,
    },
    {
      id: 'oauth-expert', name: 'OAuth Expert', description: 'OAuth 2.0 实现',
      category: 'Security', icon: '🔓',
      triggers: ['oauth', 'oauth2', 'authorization code', 'client credentials', 'pkce', 'oidc'],
      systemPrompt: 'Use Authorization Code + PKCE for SPAs/mobile. Use Client Credentials for service-to-service. Validate state parameter to prevent CSRF. Validate issuer and audience in tokens. Rotate refresh tokens. Use short token lifetimes. Store tokens securely (httpOnly cookies or secure storage).',
      priority: 7,
    },
    {
      id: 'network-security', name: 'Network Security', description: '网络安全',
      category: 'Security', icon: '🌐',
      triggers: ['network security', 'firewall', 'vpn', 'tls', 'ssl', 'certificate'],
      systemPrompt: 'Use TLS 1.3 minimum. Implement certificate pinning for mobile apps. Use mutual TLS for service-to-service. Configure proper firewall rules. Use VPN for internal access. Implement DNS security (DNSSEC). Monitor for anomalous traffic patterns.',
      priority: 7,
    },
    {
      id: 'zero-knowledge', name: 'Zero Knowledge', description: '零知识证明',
      category: 'Security', icon: '🔮',
      triggers: ['zero knowledge', 'zkp', 'zk-snark', 'zk-stark', 'proof', 'cryptography'],
      systemPrompt: 'Understand the difference between zk-SNARKs (smaller proofs, trusted setup) and zk-STARKs (no trusted setup, larger proofs). Use established libraries (circom, arkworks). Audit circuits for soundness. Consider proof generation time trade-offs.',
      priority: 5,
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  AI/ML (8)
    // ═══════════════════════════════════════════════════════════════════════
    {
      id: 'llm-integration', name: 'LLM Integration', description: 'LLM 集成开发',
      category: 'AI/ML', icon: '🤖',
      triggers: ['llm', 'openai', 'anthropic', 'claude', 'gpt', 'language model', 'ai api'],
      systemPrompt: 'Use streaming for better UX. Implement prompt caching (Anthropic cache_control). Use structured output (JSON mode) for machine parsing. Implement retry with exponential backoff. Use tool/function calling for structured actions. Track token usage and costs. Use system prompts for behavior control.',
      priority: 9,
    },
    {
      id: 'prompt-engineering', name: 'Prompt Engineering', description: '提示词工程',
      category: 'AI/ML', icon: '💬',
      triggers: ['prompt', 'prompt engineering', 'few-shot', 'chain of thought', 'system prompt'],
      systemPrompt: 'Use clear, specific instructions. Provide examples (few-shot) for complex tasks. Use chain-of-thought for reasoning tasks. Structure prompts with XML tags or markdown headers. Use temperature=0 for deterministic output, higher for creative. Test prompts with edge cases. Version control prompts.',
      priority: 8,
    },
    {
      id: 'pytorch-expert', name: 'PyTorch Expert', description: 'PyTorch 深度学习',
      category: 'AI/ML', icon: '🔥',
      triggers: ['pytorch', 'torch', 'deep learning', 'neural network', 'tensor', 'training'],
      systemPrompt: 'Use DataLoader with num_workers for parallel loading. Use mixed precision (torch.amp) for faster training. Use gradient accumulation for large batches. Implement proper train/val/test splits. Use wandb/tensorboard for experiment tracking. Save checkpoints regularly. Use torch.compile for speedup.',
      priority: 8,
    },
    {
      id: 'nlp-expert', name: 'NLP Expert', description: '自然语言处理',
      category: 'AI/ML', icon: '📝',
      triggers: ['nlp', 'text processing', 'tokenization', 'embedding', 'sentiment', 'ner', 'transformer'],
      systemPrompt: 'Use Hugging Face Transformers for common tasks. Use appropriate tokenizers for models. Fine-tune with LoRA/QLoRA for efficiency. Use evaluation metrics (BLEU, ROUGE, F1) appropriate to task. Implement proper text preprocessing. Use sentence-transformers for embeddings.',
      priority: 7,
    },
    {
      id: 'computer-vision', name: 'Computer Vision', description: '计算机视觉',
      category: 'AI/ML', icon: '👁️',
      triggers: ['computer vision', 'image recognition', 'object detection', 'yolo', 'opencv', 'image classification'],
      systemPrompt: 'Use torchvision/pretrained models for transfer learning. Use data augmentation (albumentations). Implement proper image preprocessing (normalization, resizing). Use appropriate evaluation metrics (mAP, IoU). Use ONNX for deployment optimization. Use OpenCV for traditional CV tasks.',
      priority: 7,
    },
    {
      id: 'data-pipeline', name: 'Data Pipeline', description: '数据管道设计',
      category: 'AI/ML', icon: '🔄',
      triggers: ['data pipeline', 'etl', 'airflow', 'dagster', 'prefect', 'spark', 'data engineering'],
      systemPrompt: 'Use Airflow or Dagster for orchestration. Implement idempotent tasks. Use partitioning for large datasets. Implement data quality checks (Great Expectations). Use incremental loading over full refresh. Handle late-arriving data. Monitor pipeline SLAs. Use dbt for SQL transformations.',
      priority: 7,
    },
    {
      id: 'pandas-expert', name: 'Pandas Expert', description: 'Pandas 数据分析',
      category: 'AI/ML', icon: '🐼',
      triggers: ['pandas', 'dataframe', 'data analysis', 'data wrangling', 'numpy'],
      systemPrompt: 'Use vectorized operations (avoid iterrows). Use method chaining for readability. Use categorical dtype for low-cardinality strings. Use chunking for large files. Use query() for filtering. Avoid SettingWithCopyWarning with .loc. Use parquet over CSV for storage.',
      priority: 6,
    },
    {
      id: 'ml-deployment', name: 'ML Deployment', description: 'ML 模型部署',
      category: 'AI/ML', icon: '🚀',
      triggers: ['model deployment', 'ml ops', 'mlops', 'model serving', 'inference', 'ml pipeline'],
      systemPrompt: 'Use ONNX Runtime or TensorRT for optimized inference. Implement model versioning (MLflow, DVC). Use A/B testing for model comparison. Monitor model drift (data and concept drift). Implement canary deployments for models. Use feature stores for consistent features. Automate retraining pipelines.',
      priority: 7,
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  Architecture (8)
    // ═══════════════════════════════════════════════════════════════════════
    {
      id: 'clean-architecture', name: 'Clean Architecture', description: '整洁架构',
      category: 'Architecture', icon: '🏛️',
      triggers: ['clean architecture', 'onion architecture', 'hexagonal', 'ports and adapters', 'solid'],
      systemPrompt: 'Dependency rule: dependencies point inward. Domain layer has no external dependencies. Use ports (interfaces) and adapters (implementations). Separate business logic from framework concerns. Use DTOs at boundaries. Keep use cases focused and single-purpose.',
      priority: 8,
    },
    {
      id: 'microservices-arch', name: 'Microservices', description: '微服务架构',
      category: 'Architecture', icon: '🔄',
      triggers: ['microservice', 'service mesh', 'api gateway', 'service discovery', 'circuit breaker'],
      systemPrompt: 'Design services around business capabilities (DDD bounded contexts). Use API gateway for external access. Implement circuit breakers (resilience4j, Polly). Use event-driven communication for async operations. Implement distributed tracing. Use service mesh (Istio, Linkerd) for complex topologies.',
      priority: 8,
    },
    {
      id: 'ddd-expert', name: 'DDD Expert', description: '领域驱动设计',
      category: 'Architecture', icon: '🎯',
      triggers: ['ddd', 'domain driven', 'bounded context', 'aggregate', 'entity', 'value object', 'domain event'],
      systemPrompt: 'Identify bounded contexts first. Design aggregates around invariants. Use domain events for cross-context communication. Use value objects for immutable concepts. Keep aggregates small. Use repository pattern for persistence. Separate domain model from persistence model.',
      priority: 7,
    },
    {
      id: 'event-driven-arch', name: 'Event-Driven Arch', description: '事件驱动架构',
      category: 'Architecture', icon: '📡',
      triggers: ['event driven', 'event sourcing', 'cqrs', 'message queue', 'kafka', 'rabbitmq', 'pub sub'],
      systemPrompt: 'Use event sourcing for audit-heavy domains. Implement CQRS for read/write optimization. Use Kafka for high-throughput event streaming. Use RabbitMQ for task queues. Design for eventual consistency. Implement idempotent consumers. Use schema registry for event contracts.',
      priority: 7,
    },
    {
      id: 'distributed-systems', name: 'Distributed Systems', description: '分布式系统',
      category: 'Architecture', icon: '🌐',
      triggers: ['distributed', 'consensus', 'raft', 'paxos', 'cap theorem', 'eventual consistency', 'distributed lock'],
      systemPrompt: 'Understand CAP theorem trade-offs. Design for partition tolerance. Use idempotency keys for exactly-once semantics. Implement retry with exponential backoff + jitter. Use distributed locks (Redlock) carefully. Design for eventual consistency. Implement proper timeout/cancellation propagation.',
      priority: 8,
    },
    {
      id: 'monorepo-expert', name: 'Monorepo Expert', description: 'Monorepo 管理',
      category: 'Architecture', icon: '📦',
      triggers: ['monorepo', 'nx', 'turborepo', 'lerna', 'workspace', 'pnpm workspace'],
      systemPrompt: 'Use Turborepo or Nx for build orchestration. Implement task caching. Use pnpm workspaces for dependency management. Define clear package boundaries. Use shared tsconfig/base configs. Implement affected-only builds/tests. Use code ownership files.',
      priority: 6,
    },
    {
      id: 'caching-strategy', name: 'Caching Strategy', description: '缓存策略设计',
      category: 'Architecture', icon: '💾',
      triggers: ['cache', 'caching', 'cdn', 'redis cache', 'memcache', 'cache invalidation'],
      systemPrompt: 'Use cache-aside pattern for most cases. Implement cache invalidation strategy (TTL, event-based, versioned). Use CDN for static assets. Use HTTP cache headers (ETag, Cache-Control). Use Redis for distributed cache. Consider cache warming for critical paths. Monitor cache hit rates.',
      priority: 7,
    },
    {
      id: 'config-management', name: 'Config Management', description: '配置管理',
      category: 'Architecture', icon: '⚙️',
      triggers: ['configuration', 'config', 'environment variable', 'env var', '12-factor', 'feature flag'],
      systemPrompt: 'Follow 12-factor app (env vars for config). Use feature flags (LaunchDarkly, Unleash) for gradual rollout. Separate config from code. Use hierarchical config (defaults < env < CLI). Never commit secrets. Use secret managers (Vault, AWS Secrets Manager). Version your config schema.',
      priority: 6,
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  Code Quality (10)
    // ═══════════════════════════════════════════════════════════════════════
    {
      id: 'code-review-expert', name: 'Code Review Expert', description: '代码审查最佳实践',
      category: 'Code Quality', icon: '👀',
      triggers: ['code review', 'pr review', 'pull request', 'review', 'merge request'],
      systemPrompt: 'Focus on correctness, not style (use linters for style). Check error handling completeness. Verify test coverage for new logic. Look for security implications. Check for performance concerns (N+1, unbounded queries). Provide constructive feedback with suggestions. Use conventional comments (suggestion:, issue:, praise:).',
      priority: 8,
    },
    {
      id: 'refactoring', name: 'Refactoring', description: '代码重构',
      category: 'Code Quality', icon: '🔧',
      triggers: ['refactor', 'refactoring', 'code smell', 'technical debt', 'cleanup', 'restructure'],
      systemPrompt: 'Refactor in small, safe steps. Ensure tests pass before and after each step. Use extract method/function for long functions. Use replace conditional with polymorphism. Introduce interfaces at boundaries. Remove dead code. Prefer composition over inheritance. Run linter after refactoring.',
      priority: 7,
    },
    {
      id: 'technical-debt', name: 'Technical Debt', description: '技术债务管理',
      category: 'Code Quality', icon: '💳',
      triggers: ['tech debt', 'technical debt', 'legacy code', 'code quality', 'debt'],
      systemPrompt: 'Categorize debt: deliberate vs accidental. Quantify impact (hours lost, bugs caused). Prioritize by interest rate (how fast it gets worse). Create a debt backlog. Allocate 20% capacity for debt reduction. Add tests before refactoring legacy code. Document known workarounds.',
      priority: 6,
    },
    {
      id: 'tech-writing', name: 'Tech Writing', description: '技术文档写作',
      category: 'Code Quality', icon: '📝',
      triggers: ['documentation', 'docs', 'readme', 'technical writing', 'api docs', 'changelog'],
      systemPrompt: 'Write for the reader, not yourself. Use active voice. Keep sentences short. Use code examples liberally. Document why, not just what. Use diagrams for architecture. Keep README under one screen. Use auto-generated API docs (Swagger, TypeDoc). Write changelogs for users, not developers.',
      priority: 6,
    },
    {
      id: 'performance-optimization', name: 'Performance Optimization', description: '性能优化',
      category: 'Code Quality', icon: '⚡',
      triggers: ['optimize', 'performance', 'speed', 'fast', 'slow', 'latency', 'throughput'],
      systemPrompt: 'Measure before optimizing. Use profiling to find bottlenecks. Common wins: caching, connection pooling, batch operations, lazy loading, indexing. Avoid premature optimization. Use async/parallel for I/O-bound work. Use efficient data structures (Map vs Object, Set vs Array).',
      priority: 8,
    },
    {
      id: 'memory-management', name: 'Memory Management', description: '内存管理',
      category: 'Code Quality', icon: '🧠',
      triggers: ['memory leak', 'memory management', 'garbage collection', 'heap', 'stack overflow'],
      systemPrompt: 'Close resources (files, connections, streams) in finally blocks or use with/using. Use weak references for caches. Monitor heap usage. Avoid accumulating data in long-lived structures. Use streaming for large data processing. Profile memory with heap snapshots. Implement object pooling for frequent allocations.',
      priority: 7,
    },
    {
      id: 'concurrency', name: 'Concurrency', description: '并发编程',
      category: 'Code Quality', icon: '🔀',
      triggers: ['concurrency', 'parallel', 'async', 'threading', 'race condition', 'deadlock', 'mutex'],
      systemPrompt: 'Prefer message passing over shared state. Use thread-safe data structures. Implement proper locking (minimize critical sections). Use async/await for I/O-bound concurrency. Use thread pools for CPU-bound work. Detect deadlocks with lock ordering. Use atomic operations for counters.',
      priority: 8,
    },
    {
      id: 'error-handling', name: 'Error Handling', description: '错误处理策略',
      category: 'Code Quality', icon: '🚨',
      triggers: ['error handling', 'exception', 'error', 'try catch', 'error boundary', 'resilience'],
      systemPrompt: 'Handle errors at the appropriate level. Don\'t swallow errors silently. Use typed errors (custom error classes). Implement error boundaries (React) or global handlers. Log errors with context. Return errors, don\'t throw for expected failures. Use Result/Either types for functional error handling.',
      priority: 7,
    },
    {
      id: 'dependency-management', name: 'Dependency Management', description: '依赖管理',
      category: 'Code Quality', icon: '📦',
      triggers: ['dependency', 'package', 'npm', 'yarn', 'pnpm', 'pip', 'cargo', 'maven'],
      systemPrompt: 'Pin exact versions for apps, use ranges for libraries. Audit dependencies regularly (npm audit, Snyk). Minimize dependency count. Check bundle size impact (bundlephobia). Use lockfiles. Prefer well-maintained packages (recent commits, many downloads). Remove unused dependencies.',
      priority: 6,
    },
    {
      id: 'types-expert', name: 'TypeScript Expert', description: 'TypeScript 高级类型',
      category: 'Code Quality', icon: '🔷',
      triggers: ['typescript', 'type', 'generic', 'utility type', 'type guard', 'discriminated union'],
      systemPrompt: 'Use strict mode (strict: true). Prefer interfaces for object shapes, types for unions/intersections. Use discriminated unions for state machines. Use template literal types for string patterns. Use satisfies operator for type checking without widening. Avoid any — use unknown and narrow. Use const assertions.',
      priority: 9,
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  Design (14)
    // ═══════════════════════════════════════════════════════════════════════
    ...DESIGN_SKILLS,
  ];
}
