# @arxhub/arx-router

A simple client-side router implemented as a Web Component.

## Installation

```bash
pnpm add @arxhub/arx-router
```

## Usage

There are two ways to register the component:

1.  **Automatic Registration (Recommended):** Import the `define` module. This is useful if you want the component to be available globally in your application.

    ```typescript
    import '@arxhub/arx-router/define';
    ```

2.  **Manual Registration:** Import the class directly if you need more control over when and how the component is defined.

    ```typescript
    import { ArxRouter } from '@arxhub/arx-router';

    customElements.define('arx-router', ArxRouter);
    ```

### HTML Structure

Define your routes within the `<arx-router>` element using `<arx-route>` tags. Place an `<arx-outlet>` tag where you want the matched component to be rendered.

```html
<arx-router>
  <!-- Define Routes -->
  <arx-route path="/" component="home-page" title="Home"></arx-route>
  <arx-route path="/users" component="user-list-page" title="Users"></arx-route>
  <arx-route path="/users/:userId" component="user-detail-page" title="User Details"></arx-route>
  <arx-route path="/about" component="about-page"></arx-route> <!-- Title is optional -->
  <arx-route path="/files/*" component="file-explorer-page"></arx-route> <!-- Wildcard route -->

  <!-- Outlet for rendering matched component -->
  <arx-outlet>
    <!-- Page will be renderer here -->
  </arx-outlet>
</arx-router>
```

### `<arx-route>` Attributes

*   `path`: (Required) The URL path pattern to match. Supports parameters (`:paramName`) and wildcards (`*`).
*   `component`: (Required) The tag name of the custom element to render when the path matches.
*   `title`: (Optional) The document title to set when the route becomes active.

### `<arx-outlet>`

This element acts as a placeholder. The router will clear its content and append the matched component element inside it.

### Parameter Passing

Matched URL parameters (e.g., `:userId` in `/users/:userId`) are passed as attributes to the rendered component.

```typescript
// Example: user-detail-page.ts
class UserDetailPage extends HTMLElement {
  connectedCallback() {
    const userId = this.getAttribute('userId');
    console.log('Displaying details for user:', userId);
    // Fetch and display user data...
  }
}
customElements.define('user-detail-page', UserDetailPage);
```

If the URL is `/users/123`, the `user-detail-page` component will be rendered inside the outlet like `<user-detail-page userId="123"></user-detail-page>`.

The wildcard parameter (`*`) is available as the `wildcard` attribute.

### Programmatic Navigation

Dispatch a custom event `arx-navigate` on the `window` object to trigger navigation programmatically.

```typescript
window.dispatchEvent(new CustomEvent('arx-navigate', {
  detail: { url }
}));

// Or use
import { navigate } from '@arxhub/arx-router';
navigate('/about');
```

## Development

*   **Build:** `pnpm build` (runs `tsc` and `vite build`)
*   **Test:** `pnpm test` (runs `vitest`)
