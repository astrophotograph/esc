# Documentation System

This directory contains the user documentation for the ALP Experimental telescope control application.

## Documentation Viewer

The documentation is accessible through an integrated viewer in the application:

- **Access**: Press `F1` or click the "Help" button in the header
- **Search**: Use the search bar to find specific topics
- **Navigation**: Browse by category or use internal links

## Files

- `index.md` - Main user manual and overview
- `getting-started.md` - Setup and connection guide
- `camera-controls.md` - Camera and live view features
- `telescope-control.md` - Movement and control systems
- `observation-management.md` - Session and data management
- `equipment-management.md` - Equipment tracking
- `planning-scheduling.md` - Session planning tools
- `advanced-features.md` - Multi-telescope and API features
- `keyboard-shortcuts.md` - Complete shortcut reference
- `troubleshooting.md` - Common issues and solutions
- `faq.md` - Frequently asked questions

## Technical Implementation

### Components

- **DocumentationViewer** (`components/telescope/modals/DocumentationViewer.tsx`)
  - Full-featured markdown viewer with search
  - Sidebar navigation and breadcrumbs
  - Responsive design with syntax highlighting

### API Route

- **`/api/docs/[...slug]`** - Serves markdown files securely
  - Prevents directory traversal attacks
  - Caches content for performance
  - Returns proper MIME types

### Features

- **Search**: Powered by Fuse.js for fuzzy search across all content
- **Navigation**: Table of contents with descriptions and tags
- **Rendering**: React Markdown with GitHub Flavored Markdown support
- **Syntax Highlighting**: Code blocks with proper highlighting
- **Cross-links**: Internal navigation between documentation pages
- **Responsive**: Works on desktop, tablet, and mobile

### Keyboard Shortcuts

- `F1` - Open/close documentation
- `Escape` - Close documentation
- `Ctrl+K` or `/` - Focus search (when viewer is open)

## Adding New Documentation

1. Create a new `.md` file in this directory
2. Add it to the `documentPages` array in `DocumentationViewer.tsx`
3. Include appropriate tags and description
4. Link to it from other relevant pages

## Markdown Features Supported

- Headers (H1-H6)
- Lists (ordered/unordered)
- Tables
- Code blocks with syntax highlighting
- Links (internal and external)
- Images
- Blockquotes
- Bold/italic text
- Strikethrough
- Task lists
- Horizontal rules

## Search

The search functionality indexes:
- Page titles (30% weight)
- Page descriptions (20% weight)
- Full content (40% weight)
- Tags (10% weight)

Search is fuzzy and will find approximate matches.