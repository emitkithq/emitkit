# Contributing to EmitKit

Thank you for your interest in contributing to EmitKit! We welcome contributions from the community.

## Development Setup

1. **Fork and Clone**

   ```bash
   git fork https://github.com/yourusername/blip.git
   cd blip
   ```

2. **Install Dependencies**

   ```bash
   pnpm install
   ```

3. **Set Up Environment**

   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

4. **Set Up Database**

   ```bash
   pnpm run db:push
   ```

5. **Run Development Server**
   ```bash
   pnpm run dev
   ```

## Development Workflow

### Creating a Pull Request

1. Create a feature branch from `main`:

   ```bash
   git checkout -b feature/amazing-feature
   ```

2. Make your changes following our [Code Standards](#code-standards)

3. Test your changes:

   ```bash
   pnpm run check  # TypeScript type checking (must pass with 0 errors)
   pnpm run lint   # Linting
   pnpm run build  # Production build
   ```

4. Commit your changes:

   ```bash
   git commit -m "Add amazing feature"
   ```

5. Push to your fork:

   ```bash
   git push origin feature/amazing-feature
   ```

6. Open a Pull Request on GitHub

### Pull Request Guidelines

- **Descriptive Title**: Clearly describe what the PR does
- **Description**: Explain the problem you're solving and your approach
- **Link Issues**: Reference any related issues
- **Tests**: Add tests if applicable
- **Documentation**: Update documentation if needed

## Code Standards

### TypeScript

- **Zero TypeScript errors required** - Run `pnpm run check` before committing
- **No `any` types** - If absolutely necessary, justify with an inline comment
- **Proper type inference** - Let TypeScript infer types where possible

### Code Organization

- **Feature-first architecture** - Keep all code for a feature in `src/lib/features/<feature>/`
- **Separation of concerns**:
  - `repository.ts` - Database operations only
  - `service.ts` - Business logic
  - `*.remote.ts` - Client-callable mutations/queries
  - `validators.ts` - Zod schemas
  - `types.ts` - TypeScript type definitions

### Validation

- **All mutations must use Zod validation**
- Define schemas in `validators.ts`
- Validate on both client and server

### Naming Conventions

- **Variables/Functions**: camelCase
- **Types/Interfaces**: PascalCase
- **Components**: PascalCase (e.g., `ChannelModal.svelte`)
- **Files**: kebab-case (except components)

### Svelte 5 Best Practices

- Use runes: `$state`, `$derived`, `$effect`, `$props`
- No Svelte 4 stores unless necessary for compatibility
- Proper TypeScript typing for component props
- Use `onclick` instead of legacy `on:click`

### Comments

- Avoid redundant comments that restate code
- Comment **WHY**, not **WHAT**
- Document complex algorithms or non-obvious business logic
- Use JSDoc for public API functions

### Code Style

- Format with Prettier: `pnpm run format`
- Follow existing patterns in the codebase
- Keep functions small and focused
- Avoid deep nesting (max 3 levels)

## Testing

While we're building out our test suite, please ensure:

1. Your code doesn't break existing functionality
2. TypeScript compilation succeeds
3. The app builds successfully
4. Manual testing of affected features

## Commit Messages

Use clear, descriptive commit messages:

```bash
# Good
git commit -m "Add webhook SSRF validation"
git commit -m "Fix N+1 query in event batch creation"
git commit -m "Update README with setup instructions"

# Bad
git commit -m "fix bug"
git commit -m "updates"
git commit -m "wip"
```

## Documentation

- Update README.md if you add features or change setup
- Add/update documentation in `docs/` for architectural changes
- Update `.env.example` if you add environment variables

## Need Help?

- **Questions**: Open a [Discussion](https://github.com/yourusername/blip/discussions)
- **Bugs**: Open an [Issue](https://github.com/yourusername/blip/issues)
- **Security**: See [SECURITY.md](./SECURITY.md)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
