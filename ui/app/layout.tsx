import type {Metadata} from 'next'
import './globals.css'
import {ThemeProvider} from "@/components/theme-provider"
import {Toaster} from "@/components/ui/sonner"
import SentryErrorBoundary from "@/components/SentryErrorBoundary"

export const metadata: Metadata = {
  title: 'ESC',
  description: 'Experimental Scope Creep',
}

export default function RootLayout({
                                     children,
                                   }: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
    <body>
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      disableTransitionOnChange
    >
      <SentryErrorBoundary>
        {children}
      </SentryErrorBoundary>
      <Toaster />
    </ThemeProvider>
    </body>
    </html>
  )
}
