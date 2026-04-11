# Project Documentation

# Project Standards

## Package Manager

- Use `pnpm` as package manager

## Git

- Do not commit and push for the user. Instead, provide the user with the necessary git commands to run on their side.
- Before pushing, ensure `pnpm run check` (svelte-check) and `pnpm lint` (prettier + eslint) both pass with zero errors. If the user hasn't access about committing and pushing yet, it's not needed to run `pnpm lint` in between changes.

## TypeScript

- Use `pnpm run check` to run check for Typescript errors
- It's mandatory to have zero errors, and no use of `any` unless absolutely necessary (in which case justify it in a comment)

## Icons

`lucide-svelte` does NOT exist, use `@lucide/svelte` instead. Always import the full path, e.g.:

```typescript
import ZapIcon from '@lucide/svelte/icons/zap';
```

## Quick Links

### For Self-Hosting

- **[Configuration Guide](./docs/configuration.md)** - Environment variables, secrets
- **[Installation Guide](./docs/installation.md)** - Step-by-step setup instructions
- **[Deployment Guide](./docs/deployment.md)** - Production deployment to Vercel
- **[GitHub Auto-Deploy](./docs/github-auto-deploy.md)** - Webhook and GitHub Action deployment paths
- **[Tinybird Setup](./docs/tinybird.md)** - Render tracking and billing analytics
- **[Troubleshooting](./docs/troubleshooting.md)** - Common issues and solutions

### For Development

- **[Backend Architecture](#backend-architecture-patterns)** - Server-side patterns (below)
- **[oRPC + TanStack Query](./docs/orpc-tanstack-query.md)** - Dashboard data fetching & mutations
- **[Type System Template](#type-system-template)** - Creating types for new features (below)
- **[Modal Stack](#modal-stack-system)** - Modal management (below)
- **[Logging System](#logging-system-architecture)** - Structured logging (below)
- **[SEO Architecture](./docs/seo-architecture.md)** - SEO meta tags implementation

# SVelte

1. If you get this `state_referenced_locally` issue when linting for SVelteKit, it could be to reference the variable such that it is lazily evaluated.

## Svelte MCP Server

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available MCP Tools

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.

## Architecture Overview

### Core Technologies

- **Framework**: SvelteKit with Svelte 5
- **Database**: PostgreSQL with Drizzle ORM
- **API Layer**: oRPC (typed RPC) + TanStack Query Svelte v6 (caching & mutations)
- **Usage Tracking**: Tinybird (ClickHouse) for render events and billing analytics
- **Styling**: shadcn-svelte + Tailwind CSS
- **Package Manager**: pnpm

### Key Architectural Patterns

1. **Feature-First Organization** - All code for a feature lives in one directory
2. **Type Safety** - End-to-end TypeScript with Zod validation
3. **Data Flow**: oRPC + TanStack Query Svelte (see [docs/orpc-tanstack-query.md](./docs/orpc-tanstack-query.md))
4. **DRY SEO** - Three-layer SEO configuration system
5. **Centralized Modals** - Promise-based modal stack

## Documentation Index

### Getting Started

- **Backend Architecture**: See [Backend Architecture Patterns](#backend-architecture-patterns) below

### Development

- **Type System**: See [Type System Template](#type-system-template) below

### Usage Tracking (Tinybird)

- **Tinybird Setup**: See [docs/tinybird.md](./docs/tinybird.md) for complete setup guide
- **Tinybird CLI**: See [tinybird/README.md](./tinybird/README.md) for CLI quick reference

### UI Components

- **Modal Stack**: See [Modal Stack System](#modal-stack-system) below
- **Tiptap Editor**: See [docs/tiptap-editor.md](./docs/tiptap-editor.md) for rich text editing
- **shadcn-svelte**: Use context7 MCP to check documentation

### SEO & Meta Tags

- **SEO Architecture**: See [docs/seo-architecture.md](./docs/seo-architecture.md)

### Svelte Development

- **Svelte MCP**: See [docs/svelte-mcp.md](./docs/svelte-mcp.md) for MCP tools

### Logging

- **Logging System**: See [Logging System Architecture](#logging-system-architecture) below

## Quick Reference

### Adding a New Feature

1. Create feature folder: `src/lib/features/<feature-name>/`
2. Add database schema: `src/lib/server/db/schema/<feature>.ts`
3. Generate migration: `pnpm run db:generate`
4. Create repository, types, validators
5. Create oRPC router: `src/lib/features/<name>/server/router.ts`
6. Register router in `src/lib/server/rpc/router.ts`
7. Use `api.<feature>.*` in components with `createQuery`/`createMutation`
8. See [oRPC + TanStack Query](./docs/orpc-tanstack-query.md) and [Type System Template](#type-system-template) below

### Adding SEO to a Page

```typescript
// In +page.server.ts
export const load: PageServerLoad = async ({ params, url }) => {
	const data = await fetchData(params.id);

	return {
		data,
		seo: {
			title: data.title,
			description: data.description
		}
	};
};
```

See [docs/seo-architecture.md](./docs/seo-architecture.md) for details.

### Using Modals

```typescript
const modals = useModals();
const result = await modals.push('confirm', { props: {...} }).resolution;
```

See [Modal Stack System](#modal-stack-system) below for details.

## Development Workflow

```bash
# Start development
pnpm run dev

# Database operations
pnpm run db:studio    # Open Drizzle Studio
pnpm run db:generate  # Generate migrations
pnpm run db:push      # Push schema changes

# Type checking
pnpm run check        # Must have zero errors
```

## Need Help?

- Check the relevant documentation file in [./docs/](./docs/)
- For detailed backend patterns, see [Backend Architecture Patterns](#backend-architecture-patterns) below
- For type system questions, see [Type System Template](#type-system-template) below

---

## Backend Architecture Patterns

## Overview

This document outlines the backend architecture using SvelteKit, Drizzle ORM, and PostgreSQL. We follow a pragmatic approach that balances clean architecture principles with simplicity, avoiding unnecessary complexity while maintaining maintainability and scalability.

## Core Principles

1. **Start Simple, Evolve When Needed**: Begin with straightforward implementations and add abstractions only when complexity demands it
2. **Feature-First Organization**: Group related code by feature rather than technical layers
3. **Type Safety Throughout**: Leverage TypeScript and Zod for end-to-end type safety
4. **Testability Without Overhead**: Structure code to be testable without complex dependency injection
5. **Performance by Default**: Optimize for read-heavy operations

## Table of Contents

1. [Project Structure](#project-structure)
2. [Layer Definitions](#layer-definitions)
3. [Data Flow Architecture](#data-flow-architecture)
4. [Error Handling](#error-handling)
5. [Pagination Strategy](#pagination-strategy)
6. [Development Workflow](#development-workflow)

For detailed information on:

- **Modal Stack System**: See [Modal Stack System](#modal-stack-system) below
- **Type System Template**: See [Type System Template](#type-system-template) below
- **ShadCN Svelte**: Use context7 MCP to check the shadcn-svelte documentation

---

## Project Structure

This architecture uses a **feature-first** approach, where each feature contains all related code (server logic, components, validators, types) in a single directory.

```
src/
├── lib/
│   ├── features/                    # Feature-based organization
│   │   ├── stores/
│   │   │   ├── server/              # Server-only code (SvelteKit protected)
│   │   │   │   ├── repository.ts    # Data access layer
│   │   │   │   └── router.ts        # oRPC procedures for this feature
│   │   │   ├── components/          # Feature-specific UI components
│   │   │   ├── validators.ts        # Shared (client + server)
│   │   │   └── types.ts             # Shared (client + server)
│   │   │
│   │   ├── renders/
│   │   │   ├── server/
│   │   │   │   ├── repository.ts    # Data access
│   │   │   │   ├── service.ts       # Business logic (optional)
│   │   │   │   └── tinybird.service.ts
│   │   │   └── ...
│   │   │
│   │   └── [other-features]/
│   │
│   ├── config/
│   │   └── rpc-client.ts            # oRPC client + TanStack Query utils
│   │
│   ├── server/                      # Global server-only utilities
│   │   ├── db/
│   │   │   ├── schema/              # Drizzle schema definitions
│   │   │   ├── migrations/          # SQL migrations
│   │   │   ├── utils.ts             # Pagination, conflict resolution
│   │   │   └── index.ts             # Database connection
│   │   │
│   │   ├── rpc/
│   │   │   ├── index.ts             # Base procedure, auth/admin middleware
│   │   │   └── router.ts            # Root router (assembles feature routers)
│   │   │
│   │   ├── logger/                  # Centralized logging
│   │   ├── cache.ts                 # Redis caching utilities
│   │   └── tinybird.ts              # Tinybird client
│   │
│   └── components/                  # Global shared UI components
│       └── ui/                      # ShadCN components
│
├── routes/
│   └── api/rpc/[...rest]/+server.ts # SvelteKit handler for oRPC
```

### Key Organizational Principles

**Feature Directory Structure:**

```
lib/features/<feature-name>/
├── server/           # Server-only code (protected by SvelteKit)
│   ├── repository.ts # Data access layer
│   ├── router.ts     # oRPC procedures (queries + mutations)
│   └── service.ts    # Business logic (optional)
├── components/       # Feature-specific UI components
├── validators.ts     # SHARED - Use on client AND server
├── types.ts          # SHARED - Use on client AND server
└── index.ts          # Optional - Clean public API exports
```

**Why This Works:**

1. **SvelteKit Native Protection**: Any `server/` folder is automatically protected from client imports
2. **True Feature Cohesion**: Everything related to a feature lives in one place
3. **Clear Boundaries**: `server/` = server-only, `components/` = client-only, root level = shared
4. **Easy Refactoring**: Want to delete/extract a feature? Just move/delete its folder

### Import Path Conventions

**Always use absolute paths with the `$lib` alias:**

```typescript
// ✅ CORRECT
import { storeRepository } from '$lib/features/stores/server/repository';
import { insertStoreSchema } from '$lib/features/stores/validators';

// ❌ AVOID: Relative paths
import { storeRepository } from './repository';
```

**Benefits:**

- Consistency
- Better IDE support
- Easy to search/refactor
- No `../../../` issues

---

## Layer Definitions

### 1. Database Schema Layer

Drizzle schema definitions that serve as the single source of truth for database structure.

Located in: `lib/server/db/schema/`

```typescript
// lib/server/db/schema/stores.ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

export const stores = pgTable('stores', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	domain: text('domain').unique().notNull()
	// ... other fields
});

// Auto-generate Zod schemas
export const insertStoreSchema = createInsertSchema(stores);
export const selectStoreSchema = createSelectSchema(stores);
```

### 2. Repository Layer (Required)

Lightweight data access layer that encapsulates database queries. Every feature should have a repository.

Located in: `lib/features/*/server/repository.ts`

```typescript
// lib/features/stores/server/repository.ts
export async function createStore(store: StoreInsert): Promise<Store> {
	const [created] = await db.insert(schema.store).values(store).returning();
	if (!created) throw new Error('Failed to create store');
	return created;
}

export async function getStore(id: string): Promise<Store | null> {
	const store = await db.query.store.findFirst({
		where: eq(schema.store.id, id)
	});
	return store ?? null;
}

export async function listStores(
	orgId: string,
	pagination?: PaginationParams
): Promise<PaginatedQueryResult<Store>> {
	// ... pagination logic
}
```

**Guidelines:**

- Pure data access - no business logic
- Use `?? null` for consistent null returns
- Keep logging minimal (errors and mutations only)
- Use `PaginationParams` for list operations

### 3. Service Layer (Optional)

Business logic and orchestration when needed. Add only when repository logic becomes too complex.

Located in: `lib/features/*/server/service.ts`

```typescript
// lib/features/stores/server/service.ts
export async function createStoreWithApiKey(
	orgId: string,
	data: StoreInput
): Promise<{ store: Store; apiKey: string }> {
	// Complex business logic involving multiple operations
	const store = await createStore({ ...data, organizationId: orgId });
	const apiKey = await generateApiKey(store.id);
	return { store, apiKey };
}
```

**When to use:**

- Multiple repository operations need coordination
- Complex business rules that don't belong in repository
- API key generation, external service calls, etc.

### 4. Mutations Layer (Rare)

Side-effect orchestration for complex workflows. Only add when you have fire-and-forget operations.

Located in: `lib/features/*/server/mutations.ts`

```typescript
// lib/features/renders/server/mutations.ts
export async function createRenderAndTrack(render: RenderInsert): Promise<Render> {
	// Create the render record
	const createdRender = await createRender(render);

	// Fire-and-forget side effects
	Promise.all([trackRenderInTinybird(createdRender), invalidateStoreCache(render.storeId)]).catch(
		(error) => logger.error('Side effects failed', error)
	);

	return createdRender;
}
```

**When to use:**

- Multiple async side effects (caching, analytics, webhooks)
- Fire-and-forget operations that shouldn't block the response
- Complex workflows

---

## Data Flow Architecture

The project uses **two data flow patterns** depending on the context:

### 1. Dashboard: oRPC + TanStack Query Svelte

All authenticated dashboard pages use oRPC for the API layer and TanStack Query for client-side data fetching, caching, and mutations.

**For full documentation, see [docs/orpc-tanstack-query.md](./docs/orpc-tanstack-query.md).**

**Quick reference:**

```svelte
<script lang="ts">
	import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
	import { api } from '$lib/config/rpc-client';
	import { toast } from 'svelte-sonner';

	// Query — pass a thunk for reactive inputs
	const storeQuery = createQuery(() => api.stores.get.queryOptions({ input: { storeId } }));

	// Mutation — fire-and-forget, error-only toasts, invalidate on settle
	const queryClient = useQueryClient();
	const updateMutation = createMutation(() =>
		api.stores.updateSettings.mutationOptions({
			onError: (error) => toast.error(error.message || 'Failed to save'),
			onSettled: () => {
				queryClient.invalidateQueries({ queryKey: api.stores.get.key({ input: { storeId } }) });
			}
		})
	);
</script>
```

**Adding a new endpoint:**

1. Add procedure to `src/lib/features/<name>/server/router.ts`
2. Register in `src/lib/server/rpc/router.ts`
3. Use `api.<feature>.<procedure>.queryOptions()` or `.mutationOptions()` in components

### Page Server Loads

`+page.server.ts` files still handle auth redirects and provide `orgId` to the page. They do NOT fetch data for the dashboard (that's done client-side via TanStack Query).

```typescript
// routes/(session)/stores/[storeId]/+page.server.ts
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || !locals.activeOrganization) redirect(302, '/sign-in');
	return { orgId: locals.activeOrganization.id };
};
```

---

## Error Handling

Centralized error handling with custom error classes.

```typescript
// lib/server/utils/errors.ts
export class AppError extends Error {
	constructor(
		message: string,
		public statusCode: number = 500,
		public code?: string
	) {
		super(message);
		this.name = 'AppError';
	}
}

export class NotFoundError extends AppError {
	constructor(resource: string) {
		super(`${resource} not found`, 404, 'NOT_FOUND');
	}
}
```

---

## Pagination Strategy

Standardized pagination approach for all list queries with type-safe helpers.

See CLAUDE.md for detailed pagination implementation including:

- Pagination schemas and types
- Helper functions
- Usage in repositories
- Usage in components

### Quick Example

```typescript
import { buildPaginatedQuery, type PaginationParams } from '$lib/server/db/utils';

export async function listStores(
	orgId: string,
	pagination?: PaginationParams
): Promise<PaginatedQueryResult<Store>> {
	const page = pagination?.page ?? 1;
	const limit = pagination?.limit ?? 20;
	const offset = (page - 1) * limit;

	const query = db.query.store.findMany({
		where: eq(schema.store.organizationId, orgId),
		limit,
		offset
	});

	const countQuery = db
		.select({ count: sql<number>`count(*)` })
		.from(schema.store)
		.where(eq(schema.store.organizationId, orgId));

	return await buildPaginatedQuery(query, countQuery, { page, limit });
}
```

---

## Development Workflow

1. **Local Development:**

   ```bash
   pnpm run dev        # Start SvelteKit dev server
   pnpm run db:studio  # Open Drizzle Studio
   ```

2. **Adding New Features:**
   - Create feature folder under `lib/features/` (use kebab-case)
   - Add schema to `lib/server/db/schema/`
   - Generate migration: `pnpm run db:generate`
   - Implement repository (required)
   - Add service layer only if needed (optional)
   - Create validators and types
   - Create oRPC router at `lib/features/<name>/server/router.ts`
   - Register in `lib/server/rpc/router.ts`
   - Use `api.<feature>.*` in components with TanStack Query

3. **Database Changes:**
   ```bash
   pnpm run db:generate  # Generate migration files
   pnpm run db:migrate   # Apply migrations
   pnpm run db:push      # Push schema changes (dev only)
   ```

---

## Summary

This architecture provides:

- **Simplicity**: No unnecessary abstractions
- **Scalability**: Easy to add complexity where needed
- **Maintainability**: Clear separation of concerns
- **Type Safety**: End-to-end type safety
- **Performance**: Optimized for read-heavy operations

### Recommended Approach

1. **oRPC + TanStack Query for Dashboard**: Use `createQuery`/`createMutation` with `api.*` for all dashboard data
2. **Feature-First Organization**: Co-locate all feature code including `server/router.ts`
3. **Kebab-Case File Names**: Use kebab-case for files/folders
4. **Start with Repository**: Always create a repository, add service/mutations only when needed
5. **Linear-Style Mutations**: Fire-and-forget, no spinners, error-only toasts, `useFlash` for save indicators
6. **Minimal Logging**: Log errors and mutations, not simple getters
7. **Consistent Null Handling**: Use `?? null` for all nullable returns
8. **Pagination**: Use `PaginationParams` and `buildPaginatedQuery` from `$lib/server/db/utils`
9. **Self-Documenting Code**: Avoid file header comments, let code speak for itself

---

## Type System Template

This template demonstrates the **scalable, DRY** approach to creating types for new features.

## Key Principles

1. **Single Source of Truth**: Types derive from database schema
2. **No Manual Duplication**: Use Drizzle's `InferSelectModel`
3. **Reusable Utilities**: Use patterns from `type-helpers.ts`
4. **Clear Naming Convention**: Base → List → Detail
5. **Nullable at Repository, Non-null at Component**: Type narrowing at boundaries

## Quick Template

### 1. Define Database Schema

```typescript
// src/lib/server/db/schema/[feature].ts
export const articles = pgTable('articles', {
	id: serial('id').primaryKey(),
	title: varchar('title', { length: 200 }).notNull(),
	slug: varchar('slug', { length: 200 }).unique().notNull()
	// ... other fields
});
```

### 2. Create Feature Types

```typescript
// src/lib/features/[feature]/types.ts
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import type { InferSelectModel } from 'drizzle-orm';

// Zod Schemas
export const selectArticleSchema = createSelectSchema(articles);
export const insertArticleSchema = createInsertSchema(articles);

// Base Types (Single Source of Truth)
export type Article = z.infer<typeof selectArticleSchema>;
export type NewArticle = z.infer<typeof insertArticleSchema>;

// List View Types (minimal relations)
export type ArticleWithAuthor = Article & {
	author: AuthorListItem | null;
};

// Detail View Types (all relations)
export type ArticleWithAllRelations = DetailItemWithRelations<
	Article,
	{
		author: Author | null;
		comments: Comment[];
		commentCount: number;
	}
>;

// Non-null version for components
export type ArticleDetailData = NonNullable<ArticleWithAllRelations>;
```

### 3. Repository with Explicit Return Types

```typescript
// src/lib/features/[feature]/server/repository.ts
export const articleRepository = {
	async findAllWithAuthor(): Promise<PaginatedResult<ArticleWithAuthor>> {
		// ... implementation
	},

	async findBySlugWithRelations(slug: string): Promise<ArticleWithAllRelations | null> {
		// ... returns null if not found
	}
};
```

### 4. Page Load with Type Narrowing

```typescript
// src/routes/articles/[slug]/+page.server.ts
export const load: PageServerLoad = async ({ params }) => {
	const articleResult = await articleRepository.findBySlugWithRelations(params.slug);

	if (!articleResult) {
		error(404, 'Article not found');
	}

	// Type narrowing: now guaranteed non-null
	const article: ArticleDetailData = articleResult;

	return { article };
};
```

### 5. Component with Non-Null Props

```svelte
<script lang="ts">
	import type { PageData } from './$types';
	import type { ArticleDetailData } from '$lib/features/articles/types';

	let { data }: { data: PageData } = $props();

	// article is guaranteed non-null here
	const article: ArticleDetailData = data.article;
</script>

<h1>{article.title}</h1>
```

## Checklist for New Feature

- [ ] Define database schema in `src/lib/server/db/schema/[feature].ts`
- [ ] Create `types.ts` using this template pattern
- [ ] Use `InferSelectModel` for related entities
- [ ] Create Zod schemas for validation
- [ ] Define List types (minimal relations)
- [ ] Define Detail types (all relations)
- [ ] Add explicit return types to repository methods
- [ ] Use type narrowing in page loads (after `error(404)`)
- [ ] Component props use non-null types
- [ ] Run `pnpm run check` to verify

## Benefits

- **Scalability**: Reusable pattern across all features
- **Maintainability**: Schema changes propagate automatically
- **Type Safety**: Null safety and compiler help
- **Performance**: Only fetch what's needed

For detailed examples and flow diagrams, see CLAUDE.md.

---

## Modal Stack System

## Overview

The modal stack system is built on `@svelte-put/async-stack`, providing a centralized, type-safe way to manage modals. It uses a promise-based architecture that allows components to push modals onto a stack and await their resolution.

## Architecture

### Stack Configuration

Located in: `src/lib/components/modal-stack/config.ts`

```typescript
import { stack } from '@svelte-put/async-stack';

export const modalStack = stack()
	.addVariant('confirm', ConfirmationModal)
	.addVariant('addStore', AddStoreModal)
	// ... other variants
	.build();
```

### Provider Component

Located in: `src/lib/components/modal-stack/modal-stack-provider.svelte`

- Sets up the modal stack in Svelte context
- Renders active modals
- Provides the `useModals()` hook
- Automatically clears modals on navigation

## Usage

### Setup

Wrap your app in the root layout:

```svelte
<script>
	import { ModalStackProvider } from '$lib/components/modal-stack';
</script>

<ModalStackProvider>
	<!-- Your app content -->
</ModalStackProvider>
```

### Using Modals in Components

```svelte
<script lang="ts">
	import { useModals } from '$lib/components/modal-stack/modal-stack-provider.svelte';

	const modals = useModals();

	async function handleDelete() {
		const modal = modals.push('confirm', {
			props: {
				title: 'Delete Item',
				description: 'Are you sure?',
				type: 'delete'
			}
		});

		const result = await modal.resolution;
		if (result.confirmed) {
			// User confirmed
		}
	}
</script>
```

## Creating Modal Components

```svelte
<script lang="ts">
	import type { StackItemProps } from '@svelte-put/async-stack';

	let { item, title, description }: StackItemProps<{ confirmed: boolean }> & Props = $props();

	function handleConfirm() {
		item.resolve({ confirmed: true });
	}

	function handleCancel() {
		item.resolve({ confirmed: false });
	}
</script>

<dialog>
	<h2>{title}</h2>
	<p>{description}</p>
	<button onclick={handleConfirm}>Confirm</button>
	<button onclick={handleCancel}>Cancel</button>
</dialog>
```

## Adding New Modals

1. Create the modal component in `src/lib/components/modal-stack/[modal-name]/`
2. Export it from an index file
3. Add it to the stack configuration in `config.ts`
4. Use it: `modals.push('myNewModal', { props: {...} })`

## Benefits

- **Centralized Management**: All modals in one stack
- **Type Safety**: Full TypeScript support
- **Promise-Based**: Async/await pattern for results
- **Navigation Aware**: Auto-cleanup on navigation
- **Flexible**: Easy to add new modal variants

For detailed examples and best practices, see CLAUDE.md.

---

## Logging System Architecture

This project includes a production-ready logging system with environment-aware formatting, OpenTelemetry span support, and Sentry integration.

## Features

- **Environment-Aware Formatting** - Beautiful console output locally, structured JSON in production
- **OpenTelemetry Spans** - Automatic distributed tracing support
- **Sentry Integration** - Automatic error capture in production
- **Request Tracking** - Unique request IDs throughout the entire request lifecycle
- **Performance Timing** - Automatic timing for all operations
- **Structured Metadata** - Add contextual data to all log entries
- **Context Propagation** - Request ID and user ID automatically included
- **Production-Ready** - Clean JSON logs for Vercel and other log aggregators

## Quick Start

### Basic Usage

```typescript
import { createContextLogger } from '$lib/server/logger';

// Create a logger with context
const logger = createContextLogger('feature-name');

// Simple logging
logger.info('User logged in', { userId: '123', email: 'user@example.com' });
logger.warn('Rate limit approaching', { current: 95, max: 100 });
logger.error('Database query failed', error, { query: 'SELECT...' });
logger.success('Render completed', { renderId: 'abc', storeId: 'store-123' });
```

### Operation Tracking

Use operations to track multi-step processes with timing:

```typescript
import { createContextLogger } from '$lib/server/logger';

const logger = createContextLogger('render-service');
const operation = logger.start('Process render request', {
	productId: 'prod-123',
	type: 'room'
});

try {
	// Log steps in the operation
	operation.step('Validating image');
	await validateImage(data);

	operation.step('Calling AI service');
	const result = await aiService.render(data);

	operation.step('Saving result');
	const render = await db.renders.create(result);

	// End successfully with timing
	operation.end({ renderId: render.id });

	return render;
} catch (error) {
	// End with error (includes timing and captures in Sentry)
	operation.error('Failed to process render', error, { productId: data.productId });
	throw error;
}
```

### Output Examples

#### Development (Local)

Clean, professional span-style output:

```
render-service       a1b2c3d4 │ ┌ Process render request · productId=prod-123, type=room
render-service       a1b2c3d4 │ ├ Validating image
render-service       a1b2c3d4 │ ├ Calling AI service
render-service       a1b2c3d4 │ ├ Saving result
render-service       a1b2c3d4 │ └ Process render request ✓ 2450ms · renderId=rnd-456
```

Error example:

```
render-service       a1b2c3d4 │ ┌ Process render request · productId=prod-123
render-service       a1b2c3d4 │ ├ Validating image
render-service       a1b2c3d4 │ └ Process render request ✗ 120ms
    ↳ ValidationError: Image must be at least 800x600 pixels
```

#### Production (Vercel, Log Aggregators)

Structured JSON output for easy parsing and filtering:

```json
{"timestamp":"2025-12-02T20:34:26.862Z","level":"info","context":"render-service","message":"Process render request","requestId":"a1b2c3d4","userId":"user_123","productId":"prod-123","type":"room"}
{"timestamp":"2025-12-02T20:34:26.895Z","level":"info","context":"render-service","message":"Validating image","requestId":"a1b2c3d4","userId":"user_123"}
{"timestamp":"2025-12-02T20:34:29.312Z","level":"info","context":"render-service","message":"Process render request 2450ms","requestId":"a1b2c3d4","userId":"user_123","renderId":"rnd-456"}
```

## API Reference

### createContextLogger(context, metadata?)

Creates a logger instance with automatic request/user context.

```typescript
const logger = createContextLogger('auth', { component: 'oauth' });
```

**Parameters:**

- `context` (string) - Context name for this logger (e.g., 'auth', 'renders', 'billing')
- `metadata` (object, optional) - Additional metadata to include in all logs

**Returns:** `Logger` instance

### Logger Methods

#### logger.start(operation, metadata?)

Start a tracked operation with timing and OpenTelemetry span.

```typescript
const operation = logger.start('Process render', {
	storeId: 'store-123',
	productId: 'prod-456'
});
```

**Returns:** `OperationLogger` instance

#### logger.info(message, metadata?)

Log informational message.

```typescript
logger.info('User profile updated', { userId: '123', fields: ['name', 'email'] });
```

#### logger.success(message, metadata?)

Log success message.

```typescript
logger.success('Render completed', { renderId: 'rnd-123', duration: 2500 });
```

#### logger.warn(message, metadata?)

Log warning message.

```typescript
logger.warn('Cache miss', { key: 'store:123', ttl: 3600 });
```

#### logger.error(message, error?, metadata?)

Log error message and capture in Sentry (production only).

```typescript
logger.error('Render failed', error, {
	storeId: 'store-123',
	productId: 'prod-456'
});
```

### OperationLogger Methods

#### operation.step(message, metadata?)

Log a step in this operation and add event to OpenTelemetry span.

```typescript
operation.step('Validating input', { fieldCount: 10 });
```

#### operation.end(metadata?)

End operation successfully with timing.

```typescript
operation.end({ recordsProcessed: 100 });
```

#### operation.error(message, error?, metadata?)

End operation with error, including timing and Sentry capture.

```typescript
operation.error('Database connection failed', error, {
	host: 'db.example.com',
	port: 5432
});
```

## Integration Points

### Automatic Request Context

The logging system automatically tracks request IDs and user IDs through middleware:

```typescript
// In hooks.server.ts (already configured)
const requestContextHandler: Handle = async ({ event, resolve }) => {
	const requestId = randomUUID();
	setRequestId(requestId);
	event.locals.requestId = requestId;
	return resolve(event);
};
```

All loggers created with `createContextLogger()` will automatically include the request ID.

### Sentry Integration

Errors are automatically captured in Sentry in production:

```typescript
logger.error('Render processing failed', error, {
	renderId: 'rnd-123',
	storeId: 'store-456'
});
// Automatically sent to Sentry with full context
```

### OpenTelemetry Spans

All operations create OpenTelemetry spans:

```typescript
const operation = logger.start('Database query');
// Creates span: 'Database query'
// Attributes: context, requestId, userId, metadata

operation.step('Executing query');
// Adds event to span

operation.end();
// Closes span with timing
```

## Best Practices

### 1. Use Descriptive Contexts

```typescript
// Good
const logger = createContextLogger('render-service');
const logger = createContextLogger('billing-webhook');
const logger = createContextLogger('widget-api');

// Bad
const logger = createContextLogger('service');
const logger = createContextLogger('handler');
```

### 2. Track Important Operations

Wrap multi-step processes with operations:

```typescript
const operation = logger.start('Process render', {
	storeId: store.id,
	productId: product.id
});

try {
	operation.step('Validating image');
	const validated = await validateImage(image);

	operation.step('Calling AI service');
	const result = await aiService.render(validated);

	operation.end({ renderId: result.id });
} catch (error) {
	operation.error('Failed to process render', error);
	throw error;
}
```

### 3. Include Relevant Metadata

Add context that helps debugging:

```typescript
// Good - includes identifiers and relevant data
logger.error('Render failed', error, {
	renderId: 'rnd-123',
	storeId: 'store-456',
	productId: 'prod-789'
});

// Bad - missing context
logger.error('Failed', error);
```

### 4. Don't Bloat Logs

Avoid logging every minor step:

```typescript
// Good - logs important steps
operation.step('Validating image');
operation.step('Calling AI service');
operation.step('Saving result');

// Bad - too much noise
operation.step('Creating variable');
operation.step('Calling function');
operation.step('Returning value');
```

### 5. Use Appropriate Log Levels

```typescript
// Info - normal operation
logger.info('Render started', { renderId: '123' });

// Success - important positive outcome
logger.success('Render completed', { renderId: '123', duration: 2500 });

// Warn - potential issue, but not critical
logger.warn('High latency detected', { duration: 5000, threshold: 3000 });

// Error - actual error requiring attention
logger.error('AI service connection failed', error);
```

### 6. Child Loggers for Related Operations

```typescript
const logger = createContextLogger('render-system');

// Create child logger for specific store
const storeLogger = logger.child('store-webhook', {
	storeId: store.id,
	platform: store.platform
});

storeLogger.info('Processing webhook');
storeLogger.success('Webhook processed');
```
