"use client"

import { useState, useEffect, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Search, Book, Home, ChevronRight, ExternalLink, X } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
import rehypeRaw from "rehype-raw"
import Fuse from "fuse.js"

interface DocumentationViewerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface DocPage {
  id: string
  title: string
  path: string
  content: string
  description: string
  tags: string[]
}

const documentPages: DocPage[] = [
  {
    id: "index",
    title: "User Manual",
    path: "/api/docs/index.md",
    content: "",
    description: "Complete overview and navigation guide",
    tags: ["overview", "guide", "manual", "start"]
  },
  {
    id: "getting-started",
    title: "Getting Started",
    path: "/api/docs/getting-started.md",
    content: "",
    description: "Initial setup and telescope connection",
    tags: ["setup", "connection", "beginner", "installation"]
  },
  {
    id: "camera-controls",
    title: "Camera & Live View",
    path: "/api/docs/camera-controls.md",
    content: "",
    description: "Video feeds, camera settings, and overlays",
    tags: ["camera", "video", "settings", "exposure", "gain"]
  },
  {
    id: "telescope-control",
    title: "Telescope Control",
    path: "/api/docs/telescope-control.md",
    content: "",
    description: "Movement, GoTo, focus, and tracking",
    tags: ["movement", "goto", "focus", "tracking", "control"]
  },
  {
    id: "observation-management",
    title: "Observation Management",
    path: "/api/docs/observation-management.md",
    content: "",
    description: "Sessions, logging, and data management",
    tags: ["sessions", "logging", "observations", "data"]
  },
  {
    id: "equipment-management",
    title: "Equipment Management",
    path: "/api/docs/equipment-management.md",
    content: "",
    description: "Equipment tracking and maintenance",
    tags: ["equipment", "maintenance", "inventory", "sets"]
  },
  {
    id: "planning-scheduling",
    title: "Planning & Scheduling",
    path: "/api/docs/planning-scheduling.md",
    content: "",
    description: "Session planning and celestial events",
    tags: ["planning", "weather", "events", "scheduling"]
  },
  {
    id: "advanced-features",
    title: "Advanced Features",
    path: "/api/docs/advanced-features.md",
    content: "",
    description: "Multi-telescope, API, and automation",
    tags: ["advanced", "api", "automation", "multi-telescope"]
  },
  {
    id: "keyboard-shortcuts",
    title: "Keyboard Shortcuts",
    path: "/api/docs/keyboard-shortcuts.md",
    content: "",
    description: "Complete keyboard shortcut reference",
    tags: ["shortcuts", "keyboard", "reference", "hotkeys"]
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    path: "/api/docs/troubleshooting.md",
    content: "",
    description: "Common issues and solutions",
    tags: ["troubleshooting", "problems", "issues", "fixes"]
  },
  {
    id: "faq",
    title: "FAQ",
    path: "/api/docs/faq.md",
    content: "",
    description: "Frequently asked questions",
    tags: ["faq", "questions", "answers", "help"]
  }
]

export function DocumentationViewer({ open, onOpenChange }: DocumentationViewerProps) {
  const [currentPage, setCurrentPage] = useState<DocPage | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<DocPage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadedPages, setLoadedPages] = useState<Map<string, string>>(new Map())

  // Initialize search engine
  const fuse = useMemo(() => {
    const searchablePages = documentPages.map(page => ({
      ...page,
      content: loadedPages.get(page.id) || ""
    }))
    
    return new Fuse(searchablePages, {
      keys: [
        { name: "title", weight: 0.3 },
        { name: "description", weight: 0.2 },
        { name: "content", weight: 0.4 },
        { name: "tags", weight: 0.1 }
      ],
      threshold: 0.4,
      includeScore: true,
      includeMatches: true
    })
  }, [loadedPages])

  // Load documentation content
  const loadPage = async (page: DocPage) => {
    if (loadedPages.has(page.id)) {
      setCurrentPage({ ...page, content: loadedPages.get(page.id)! })
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Try to fetch from the docs directory
      const response = await fetch(page.path)
      if (!response.ok) {
        throw new Error(`Failed to load documentation: ${response.status}`)
      }
      
      const content = await response.text()
      
      // Cache the content
      setLoadedPages(prev => new Map(prev).set(page.id, content))
      setCurrentPage({ ...page, content })
    } catch (err) {
      console.error("Error loading documentation:", err)
      setError("Failed to load documentation page. The documentation files may not be available.")
      
      // Fallback content
      const fallbackContent = `# ${page.title}

Documentation for this section is being loaded...

## ${page.description}

This page covers: ${page.tags.join(", ")}

---

*Note: If you continue to see this message, the documentation files may need to be served from a web server.*`
      
      setCurrentPage({ ...page, content: fallbackContent })
    } finally {
      setLoading(false)
    }
  }

  // Search functionality
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    const results = fuse.search(searchQuery)
    setSearchResults(results.map(result => result.item))
  }, [searchQuery, fuse])

  // Load index page on open
  useEffect(() => {
    if (open && !currentPage) {
      const indexPage = documentPages.find(p => p.id === "index")
      if (indexPage) {
        loadPage(indexPage)
      }
    }
  }, [open, currentPage])

  const breadcrumb = currentPage ? [
    { title: "Documentation", onClick: () => setCurrentPage(null) },
    { title: currentPage.title }
  ] : [{ title: "Documentation" }]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[80vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Book className="h-5 w-5 text-blue-400" />
              <DialogTitle>Documentation</DialogTitle>
              {breadcrumb.length > 1 && (
                <div className="flex items-center gap-1 text-sm text-gray-400">
                  <ChevronRight className="h-4 w-4" />
                  {breadcrumb.map((item, index) => (
                    <div key={index} className="flex items-center gap-1">
                      {item.onClick ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={item.onClick}
                          className="h-auto p-0 text-blue-400 hover:text-blue-300"
                        >
                          {item.title}
                        </Button>
                      ) : (
                        <span>{item.title}</span>
                      )}
                      {index < breadcrumb.length - 1 && (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search documentation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </DialogHeader>

        <div className="flex-1 flex gap-4 min-h-0">
          {/* Sidebar */}
          <div className="w-80 flex-shrink-0 border-r border-gray-700 pr-4">
            <ScrollArea className="h-full">
              {/* Navigation */}
              {!searchQuery && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-4">
                    <Home className="h-4 w-4" />
                    <span className="font-medium">Table of Contents</span>
                  </div>
                  
                  {documentPages.map((page) => (
                    <Button
                      key={page.id}
                      variant="ghost"
                      className={`w-full justify-start h-auto py-3 px-3 ${
                        currentPage?.id === page.id ? "bg-blue-600/20 text-blue-400" : ""
                      }`}
                      onClick={() => loadPage(page)}
                    >
                      <div className="text-left">
                        <div className="font-medium">{page.title}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          {page.description}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {page.tags.slice(0, 3).map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="text-xs px-1 py-0"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              )}

              {/* Search Results */}
              {searchQuery && (
                <div className="space-y-2">
                  <div className="font-medium mb-4">
                    Search Results ({searchResults.length})
                  </div>
                  
                  {searchResults.map((page) => (
                    <Button
                      key={page.id}
                      variant="ghost"
                      className="w-full justify-start h-auto py-3 px-3"
                      onClick={() => {
                        loadPage(page)
                        setSearchQuery("")
                      }}
                    >
                      <div className="text-left">
                        <div className="font-medium">{page.title}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          {page.description}
                        </div>
                      </div>
                    </Button>
                  ))}
                  
                  {searchQuery && searchResults.length === 0 && (
                    <div className="text-center text-gray-400 py-8">
                      No results found for "{searchQuery}"
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            <ScrollArea className="h-full">
              {loading && (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full"></div>
                </div>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 m-4">
                  <div className="text-red-400 font-medium">Error Loading Documentation</div>
                  <div className="text-red-300 text-sm mt-1">{error}</div>
                </div>
              )}

              {currentPage && !loading && (
                <div className="prose prose-invert max-w-none p-6">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight, rehypeRaw]}
                    components={{
                      // Custom components for better styling
                      h1: ({ children }) => (
                        <h1 className="text-3xl font-bold text-blue-400 mb-6 pb-2 border-b border-gray-700">
                          {children}
                        </h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="text-2xl font-semibold text-blue-300 mt-8 mb-4">
                          {children}
                        </h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="text-xl font-medium text-blue-200 mt-6 mb-3">
                          {children}
                        </h3>
                      ),
                      table: ({ children }) => (
                        <div className="overflow-x-auto">
                          <table className="min-w-full border border-gray-600 rounded-lg">
                            {children}
                          </table>
                        </div>
                      ),
                      th: ({ children }) => (
                        <th className="bg-gray-700 border border-gray-600 px-4 py-2 text-left font-medium">
                          {children}
                        </th>
                      ),
                      td: ({ children }) => (
                        <td className="border border-gray-600 px-4 py-2">
                          {children}
                        </td>
                      ),
                      code: ({ className, children }) => (
                        <code className={`${className} bg-gray-800 px-1 py-0.5 rounded text-sm`}>
                          {children}
                        </code>
                      ),
                      pre: ({ children }) => (
                        <pre className="bg-gray-800 border border-gray-700 rounded-lg p-4 overflow-x-auto">
                          {children}
                        </pre>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-4 border-blue-400 pl-4 my-4 italic text-gray-300">
                          {children}
                        </blockquote>
                      ),
                      a: ({ href, children }) => {
                        // Handle internal links
                        if (href?.startsWith("./")) {
                          const pageId = href.replace("./", "").replace(".md", "")
                          const targetPage = documentPages.find(p => p.id === pageId)
                          if (targetPage) {
                            return (
                              <Button
                                variant="link"
                                className="h-auto p-0 text-blue-400 hover:text-blue-300 inline"
                                onClick={() => loadPage(targetPage)}
                              >
                                {children}
                              </Button>
                            )
                          }
                        }
                        
                        // External links
                        return (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
                          >
                            {children}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )
                      }
                    }}
                  >
                    {currentPage.content}
                  </ReactMarkdown>
                </div>
              )}

              {!currentPage && !loading && (
                <div className="p-6">
                  <div className="text-center">
                    <Book className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold mb-2">Welcome to the Documentation</h2>
                    <p className="text-gray-400 mb-6">
                      Select a topic from the sidebar to get started, or use the search bar to find specific information.
                    </p>
                    <Button
                      onClick={() => {
                        const indexPage = documentPages.find(p => p.id === "index")
                        if (indexPage) loadPage(indexPage)
                      }}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      View User Manual
                    </Button>
                  </div>
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}