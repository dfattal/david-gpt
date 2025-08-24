# End-to-End Testing Suite

Comprehensive E2E testing for David-GPT using Playwright with accessibility, performance, and cross-browser testing.

## Test Coverage

### 🔐 Authentication (`auth.spec.ts`)
- Google OAuth login flow
- Session persistence and logout
- Route protection
- Error handling
- Mobile authentication
- Accessibility compliance

### 💬 Chat Streaming (`chat-stream.spec.ts`)
- Real-time message streaming
- David Fattal AI persona responses
- Error handling and timeouts
- Keyboard shortcuts (Enter, Shift+Enter)
- Auto-resize message input
- Message persistence
- Loading indicators
- Mobile chat interactions

### 📁 Conversation CRUD (`conversation-crud.spec.ts`)
- Create new conversations
- Switch between conversations
- Rename conversations
- Delete with confirmation
- Auto-generated titles
- Context switching
- Sidebar navigation
- Mobile conversation management

### 🏷️ Title Generation (`title-generation.spec.ts`)
- Automatic title generation after first exchange
- Contextually relevant titles
- Title format validation (3-6 words, Title Case)
- Background processing (non-blocking)
- Error handling and retries
- Rate limiting handling
- Manual title preservation

### ♿ Accessibility (`accessibility.spec.ts`)
- WCAG 2.1 AA compliance
- Screen reader compatibility
- Keyboard navigation
- Focus management
- Color contrast validation
- ARIA labels and roles
- Modal dialog accessibility
- Mobile accessibility
- Error message accessibility

### 📱 Responsive Design (`responsive.spec.ts`)
- Mobile (375px), Tablet (768px), Desktop (1024px+)
- Touch-friendly interfaces
- Adaptive layouts
- Message bubble responsiveness
- Navigation adaptation
- Orientation changes
- Performance across viewports

### 🚀 Full User Journey (`full-user-journey.spec.ts`)
- Complete end-to-end workflows
- Mobile user journey
- Accessibility compliance throughout
- Performance under load
- Memory leak detection

## Quick Start

### Prerequisites
- Node.js 20+
- pnpm 9+
- Environment variables configured (`.env.local`)

### Run All Tests
```bash
# Using the convenient script
./scripts/run-e2e-tests.sh

# Or directly with pnpm
pnpm test:e2e
```

### Run Specific Test Suites
```bash
# Authentication tests
pnpm playwright test auth.spec.ts

# Chat functionality
pnpm playwright test chat-stream.spec.ts

# Accessibility audit
pnpm playwright test accessibility.spec.ts

# Full user journey
pnpm playwright test full-user-journey.spec.ts
```

### Browser-Specific Testing
```bash
# Chrome/Chromium
pnpm playwright test --project=chromium

# Firefox
pnpm playwright test --project=firefox

# Safari/WebKit
pnpm playwright test --project=webkit

# Mobile Chrome
pnpm playwright test --project="Mobile Chrome"
```

### Development Mode
```bash
# Run tests in headed mode (visible browser)
./scripts/run-e2e-tests.sh --headed

# Debug specific test
pnpm playwright test auth.spec.ts --debug

# Run with specific browser
./scripts/run-e2e-tests.sh --browser=firefox --headed
```

## Test Configuration

### Playwright Config (`playwright.config.ts`)
- Multi-browser testing (Chromium, Firefox, WebKit)
- Mobile viewport testing
- Automatic server startup
- Screenshot and video on failure
- Trace collection for debugging

### Environment Variables
Required in `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key
NEXTAUTH_SECRET=your_nextauth_secret
```

## CI/CD Integration

### GitHub Actions (`.github/workflows/e2e-tests.yml`)
- Runs on push, PR, and scheduled
- Multi-browser matrix testing
- Responsive viewport testing
- Accessibility auditing
- Performance monitoring with Lighthouse
- Artifact collection (screenshots, reports)
- PR comments with results

### Lighthouse Performance (`.lighthouserc.json`)
- Performance budgets
- Accessibility scoring
- SEO validation
- Core Web Vitals monitoring

## Test Utilities

### Helper Functions (`e2e/helpers/test-utils.ts`)
- `mockApiResponses()` - Mock backend APIs
- `sendMessageAndWait()` - Send chat messages
- `waitForStreamingComplete()` - Wait for AI responses
- `checkAccessibility()` - Run axe-core audits
- `testResponsiveBreakpoints()` - Test across viewports
- `mockGoogleAuth()` - Mock authentication flow

### Mock Data
- David Fattal AI responses
- Conversation structures
- Error scenarios
- Loading states

## Debugging

### Test Failures
```bash
# View detailed report
pnpm playwright show-report

# Debug specific test
pnpm playwright test auth.spec.ts --debug

# Run in headed mode to see browser
pnpm playwright test --headed
```

### Screenshots and Videos
- Automatic capture on failure
- Stored in `test-results/`
- Available in CI artifacts

### Traces
```bash
# View trace for failed test
pnpm playwright show-trace test-results/[test-name]/trace.zip
```

## Best Practices

### Writing Tests
1. **Use data-testid attributes** for reliable selectors
2. **Mock API responses** for consistent testing
3. **Test user journeys**, not just individual features
4. **Include accessibility checks** in every test
5. **Test responsive behavior** across viewports
6. **Handle loading states** and async operations
7. **Verify error scenarios** and edge cases

### Test Organization
1. **Group related tests** in describe blocks
2. **Use beforeEach** for common setup
3. **Keep tests independent** and atomic
4. **Use descriptive test names** that explain behavior
5. **Add helpful console logs** for debugging

### Performance
1. **Use parallel execution** where possible
2. **Mock external services** to reduce flakiness
3. **Set appropriate timeouts** for operations
4. **Clean up resources** after tests

## Accessibility Standards

### WCAG 2.1 AA Compliance
- Color contrast ratios ≥ 4.5:1
- Keyboard navigation support
- Screen reader compatibility
- Focus indicators
- Semantic HTML structure
- ARIA labels and roles

### Testing Tools
- **axe-core** for automated accessibility testing
- **@axe-core/playwright** integration
- Manual keyboard navigation testing
- Color contrast validation

## Performance Budgets

### Core Web Vitals
- **First Contentful Paint**: < 2.0s
- **Largest Contentful Paint**: < 3.0s
- **Cumulative Layout Shift**: < 0.1
- **Total Blocking Time**: < 300ms
- **Speed Index**: < 2.5s

### Lighthouse Scores
- **Performance**: ≥ 80
- **Accessibility**: ≥ 90
- **Best Practices**: ≥ 80
- **SEO**: ≥ 80

## Troubleshooting

### Common Issues

**Tests timeout waiting for server**
```bash
# Check if port 3000 is available
lsof -ti:3000 | xargs kill -9

# Increase server start timeout in config
```

**Authentication tests fail**
```bash
# Verify environment variables
cat .env.local

# Check Supabase configuration
```

**Browser installation issues**
```bash
# Reinstall Playwright browsers
pnpm playwright install --force
```

**Flaky tests**
- Add explicit waits for async operations
- Use `waitForSelector` instead of `waitForTimeout`
- Mock time-dependent operations
- Increase timeouts for slow operations

### Getting Help

1. **Check test reports** in `playwright-report/`
2. **Review screenshots** in `test-results/`
3. **Examine traces** for detailed execution flows
4. **Run tests in headed mode** to observe behavior
5. **Check CI logs** for environment-specific issues

## Contributing

When adding new features, ensure you:

1. **Add corresponding E2E tests**
2. **Include accessibility testing**
3. **Test responsive behavior**
4. **Update test documentation**
5. **Verify CI pipeline passes**

### Test Checklist
- [ ] Authentication flows tested
- [ ] Core functionality covered
- [ ] Error scenarios handled
- [ ] Accessibility validated
- [ ] Responsive design verified
- [ ] Performance impact assessed
- [ ] Cross-browser compatibility confirmed

---

**Generated by Claude Code** 🤖

For more information, see the [Playwright documentation](https://playwright.dev/) and [Testing Best Practices](https://playwright.dev/docs/best-practices).
