import { Component, type ReactNode } from 'react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppRouter } from '@/app/router'
import { AppProvider } from '@/context/AppContext'
import { LanguageProvider } from '@/i18n/LanguageContext'
import '@/index.css'

class ErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null }

  static getDerivedStateFromError(error: Error) {
    return { message: error.message }
  }

  render() {
    if (this.state.message) {
      return (
        <div className="mx-auto max-w-lg p-8">
          <h1 className="text-2xl font-semibold">The app could not start</h1>
          <p className="mt-3 text-sm text-stone-600">{this.state.message}</p>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <LanguageProvider>
        <BrowserRouter>
          <AppProvider>
            <AppRouter />
          </AppProvider>
        </BrowserRouter>
      </LanguageProvider>
    </ErrorBoundary>
  </StrictMode>,
)
