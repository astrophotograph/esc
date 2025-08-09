# Sentry Error Monitoring Setup

This application is configured with Sentry for comprehensive error tracking and performance monitoring.

## File Structure

The Sentry integration uses Next.js 15's instrumentation pattern:

- `instrumentation.ts` - Server and edge runtime initialization
- `instrumentation.client.ts` - Client-side browser initialization  
- `app/global-error.tsx` - Global error boundary for React errors
- `components/SentryErrorBoundary.tsx` - Component-level error boundary

## Features

- **Automatic Error Capture**: All unhandled errors are automatically captured and sent to Sentry
- **Console Error Tracking**: Console errors and warnings are captured
- **Network Error Monitoring**: Failed API calls and network errors are tracked
- **WebSocket Monitoring**: WebSocket connection issues are monitored
- **Performance Monitoring**: Long tasks and slow operations are tracked
- **Session Replay**: User sessions with errors can be replayed for debugging
- **Source Maps**: Stack traces show original source code (in production)
- **Custom Error Boundaries**: Graceful error handling with user-friendly error pages

## Setup Instructions

### 1. Create a Sentry Account

1. Go to [https://sentry.io](https://sentry.io) and create an account
2. Create a new project for your application
3. Select "Next.js" as the platform

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in your Sentry configuration:

```bash
# Required: Your Sentry DSN (Data Source Name)
NEXT_PUBLIC_SENTRY_DSN=https://your-key@sentry.io/your-project-id
SENTRY_DSN=https://your-key@sentry.io/your-project-id

# Optional: For source map uploads
SENTRY_AUTH_TOKEN=your-auth-token
SENTRY_ORG=your-org-slug
SENTRY_PROJECT=your-project-slug

# Optional: Debug mode
NEXT_PUBLIC_SENTRY_DEBUG=false
```

### 3. Get Your DSN

1. In Sentry, go to Settings → Projects → Your Project → Client Keys (DSN)
2. Copy the DSN and add it to your `.env.local` file

### 4. Create an Auth Token (Optional but Recommended)

For source map uploads in production:

1. Go to Settings → Account → API → Auth Tokens
2. Create a new token with these scopes:
   - `project:releases`
   - `org:read`
3. Add the token to your `.env.local` file

### 5. Update .sentryclirc (Optional)

If using source maps, update `.sentryclirc` with your organization and project:

```ini
[defaults]
org=your-org-slug
project=your-project-slug

[auth]
token=your-auth-token
```

## Usage

### Automatic Error Capture

Errors are automatically captured in these scenarios:

- Unhandled JavaScript errors
- Unhandled promise rejections
- Console.error() calls
- Network errors (500+ status codes)
- WebSocket connection failures

### Manual Error Capture

Use the `useSentryError` hook for manual error reporting:

```typescript
import { useSentryError } from '@/hooks/useSentryError'

function MyComponent() {
  const { captureError, captureMessage, addBreadcrumb } = useSentryError()
  
  const handleAction = async () => {
    try {
      // Add breadcrumb for tracking
      addBreadcrumb('User clicked button', 'user-action')
      
      // Your code here
      await doSomething()
    } catch (error) {
      // Capture error with context
      captureError(error, {
        component: 'MyComponent',
        action: 'handleAction',
        telescope: currentTelescope?.name
      })
    }
  }
  
  // Capture informational messages
  const logInfo = () => {
    captureMessage('Important event occurred', 'info', {
      component: 'MyComponent'
    })
  }
}
```

### Monitoring Utilities

Use monitoring utilities for specific operations:

```typescript
import { monitorTelescopeOperation, monitorApiCall } from '@/utils/monitoring'

// Monitor telescope operations
await monitorTelescopeOperation(telescopeName, 'connect', async () => {
  await connectToTelescope()
})

// Monitor API calls
const response = await monitorApiCall('/api/endpoint', 'POST', async () => {
  return fetch('/api/endpoint', { method: 'POST' })
})
```

## Error Filtering

The following errors are automatically filtered out:

- ResizeObserver loop errors (browser quirk)
- Expected telescope disconnection errors
- WebRTC connection failures (falls back to MJPEG)
- Browser extension errors
- Development environment errors (unless debug mode is enabled)

## Performance Monitoring

Performance is automatically monitored for:

- Page load times
- API call durations
- Long JavaScript tasks (>50ms)
- WebSocket connection latency
- Component render times

## Session Replay

When an error occurs, the user's session can be replayed to understand what led to the error:

1. Go to Sentry dashboard
2. Click on an error event
3. Click "Replay" to watch the user's session
4. See exact user interactions before the error

## Testing

### Test Error Capture

Add this temporary button to test error capture:

```typescript
<button onClick={() => {
  throw new Error('Test Sentry error capture')
}}>
  Test Sentry
</button>
```

### Verify Setup

1. Check browser console for "Sentry initialized" message
2. Trigger a test error
3. Check Sentry dashboard for the error
4. Verify source maps show original code

## Production Deployment

### Vercel

If deploying to Vercel, add these environment variables in the Vercel dashboard:

- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_DSN`
- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`

### Docker

Add environment variables to your Docker configuration:

```yaml
environment:
  - NEXT_PUBLIC_SENTRY_DSN=${SENTRY_DSN}
  - SENTRY_DSN=${SENTRY_DSN}
```

## Troubleshooting

### Errors Not Appearing in Sentry

1. Check that `NEXT_PUBLIC_SENTRY_DSN` is set correctly
2. Verify Sentry is enabled (not disabled in development)
3. Check browser console for Sentry initialization message
4. Ensure errors aren't being filtered out

### Source Maps Not Working

1. Verify `SENTRY_AUTH_TOKEN` is set
2. Check that `SENTRY_ORG` and `SENTRY_PROJECT` match your Sentry account
3. Ensure source maps are being uploaded during build

### Performance Issues

If Sentry is impacting performance:

1. Reduce `tracesSampleRate` in production (default 0.1 = 10%)
2. Reduce `replaysSessionSampleRate` (default 0.1 = 10%)
3. Disable console capture in production if needed

## Best Practices

1. **Add Context**: Always include relevant context when capturing errors
2. **Use Breadcrumbs**: Add breadcrumbs for important user actions
3. **Filter Noise**: Filter out expected or non-critical errors
4. **Monitor Performance**: Use transactions for critical operations
5. **Test in Production**: Verify error tracking works in production environment
6. **Review Regularly**: Check Sentry dashboard regularly for new issues
7. **Set Alerts**: Configure alerts for critical errors

## Security Considerations

- Never commit `.env.local` or `.sentryclirc` files
- Use environment variables for sensitive configuration
- Enable user privacy features (mask sensitive data)
- Review captured data to ensure no PII is exposed
- Use Sentry's data scrubbing features if needed