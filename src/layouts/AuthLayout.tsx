import { useEffect, useRef } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { BrandLogo } from '@/components/BrandLogo'
import { ToastViewport } from '@/components/ui/Feedback'
import { useApp } from '@/context/AppContext'
import { LanguageSwitch } from '@/i18n/LanguageContext'

export function AuthLayout() {
  const { user, settings, toasts, dismissToast } = useApp()
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const slow = () => {
      video.playbackRate = 0.3
    }
    slow()
    video.addEventListener('play', slow)
    video.addEventListener('loadedmetadata', slow)
    void video.play().catch(() => undefined)
    return () => {
      video.removeEventListener('play', slow)
      video.removeEventListener('loadedmetadata', slow)
    }
  }, [])

  if (user) return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/employee/dashboard'} replace />
  return (
    <div className="auth-shell">
      <img src="/login-bg.jpg" alt="" className="auth-video-fallback" />
      <video ref={videoRef} className="auth-video" autoPlay muted loop playsInline poster="/login-bg.jpg">
        <source src="/login-bg.mp4" type="video/mp4" />
      </video>
      <div className="auth-veil" />
      <div className="auth-stage">
        <div className="auth-glass">
          <div className="mb-5 flex justify-end">
            <LanguageSwitch glass />
          </div>
          <BrandLogo className="auth-logo" alt={settings.businessName} />
          <div className="mt-5">
            <Outlet />
          </div>
        </div>
      </div>
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
