# Contributing to HEYS v2

🎉 **Welcome to HEYS v2 development!** We're excited to have you contribute to
this modern productivity platform.

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+** with pnpm
- **Git** configured with your credentials
- **VS Code** (recommended) with our workspace settings

### Development Setup

```bash
# Clone the repository
git clone https://github.com/kinderlystv-png/HEYS-v2.git
cd HEYS-v2

# Install dependencies (uses pnpm workspaces)
pnpm install

# Run development servers
pnpm dev

# Run tests
pnpm test

# Build all packages
pnpm build
```

## 📋 Code Standards

### Code Quality

- **ESLint** - All code must pass linting (configured in `.eslintrc.js`)
- **Prettier** - Code formatting is automated via pre-commit hooks
- **TypeScript** - Strict typing required for new code
- **Testing** - New features require corresponding tests

### Git Workflow

- **Conventional Commits** - Use semantic commit messages
- **Pre-commit hooks** - Quality checks run automatically
- **Branch naming**: `feature/description`, `fix/issue-description`

### Example Commit Messages

```bash
feat(search): add advanced filtering capabilities
fix(storage): resolve Supabase connection timeout
docs(readme): update installation instructions
test(core): add unit tests for user authentication
```

## 🏗️ Project Structure

```
HEYS-v2/
├── apps/
│   ├── web/          # Main React web application
│   ├── mobile/       # React Native mobile app
│   └── desktop/      # Electron desktop app
├── packages/
│   ├── core/         # Core business logic
│   ├── search/       # Search functionality
│   ├── storage/      # Data persistence
│   ├── ui/           # Shared UI components
│   └── shared/       # Utilities and types
```

## 🎯 Development Guidelines

### TypeScript

- Use **strict typing** - avoid `any` types
- Define interfaces for all data structures
- Use proper error handling with Result types

### React Components

- **Functional components** with hooks
- **TypeScript interfaces** for all props
- **Accessibility** - proper ARIA labels and keyboard navigation
- **Performance** - use React.memo and useMemo where appropriate

### Testing

- **Unit tests** for utility functions
- **Integration tests** for components
- **E2E tests** for critical user flows
- **Coverage** - aim for 80%+ on new code

### Performance

- **Bundle optimization** - analyze bundle sizes
- **Lazy loading** for routes and components
- **Memoization** for expensive computations
- **Service Workers** for offline capabilities

## 🔧 Tools & Technologies

### Core Stack

- **React 18** with TypeScript
- **Vite** for build tooling
- **Vitest** for testing
- **Supabase** for backend services
- **Tailwind CSS** for styling

### Development Tools

- **pnpm** for package management
- **Turborepo** for monorepo orchestration
- **ESLint + Prettier** for code quality
- **Husky** for git hooks
- **Playwright** for E2E testing

## 🐛 Issue Reporting

### Bug Reports

Include:

- **Environment** (OS, browser, Node.js version)
- **Steps to reproduce**
- **Expected vs actual behavior**
- **Screenshots** (if applicable)
- **Error logs**

### Feature Requests

Include:

- **Use case** description
- **Proposed solution**
- **Alternative solutions** considered
- **Additional context**

## 🚦 Pull Request Process

1. **Fork** the repository
2. **Create** a feature branch
3. **Implement** your changes with tests
4. **Run** quality checks locally
5. **Submit** PR with clear description
6. **Address** review feedback
7. **Merge** after approval

### PR Checklist

- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No console errors/warnings
- [ ] Accessibility tested

## 📚 Documentation

### README Updates

- Keep installation instructions current
- Update feature descriptions
- Maintain API documentation

### Code Documentation

- **JSDoc** for public APIs
- **Inline comments** for complex logic
- **Type definitions** for all interfaces

## 🎨 Design System

### UI Components

- Follow existing component patterns
- Use design tokens from `packages/ui`
- Ensure mobile responsiveness
- Test in dark/light modes

### Accessibility

- **WCAG 2.1 AA** compliance
- **Keyboard navigation** support
- **Screen reader** compatibility
- **Color contrast** requirements

## 🚀 Release Process

### Versioning

- **Semantic versioning** (semver)
- **Changesets** for release notes
- **Automated** release pipeline

### Deployment

- **Staging** environment for testing
- **Production** deployment via CI/CD
- **Rollback** procedures documented

## 💡 Getting Help

### Resources

- **Documentation**: `/docs` folder
- **Examples**: Check existing implementations
- **Discussions**: GitHub Discussions for questions
- **Issues**: GitHub Issues for bugs/features

### Community

- Be **respectful** and **inclusive**
- **Help others** when you can
- **Share knowledge** through documentation
- **Collaborate** openly and transparently

## 🎖️ Recognition

Contributors who make significant improvements will be:

- **Listed** in our contributors section
- **Mentioned** in release notes
- **Invited** to join our core team

---

**Thank you for contributing to HEYS v2!** 🙏

_Together we're building the future of productivity tools._
