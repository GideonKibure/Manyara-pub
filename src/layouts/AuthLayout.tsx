import { useEffect, useRef, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { BrandLogo } from '@/components/BrandLogo'
import { ToastViewport } from '@/components/ui/Feedback'
import { useApp } from '@/context/AppContext'
import { LanguageSwitch } from '@/i18n/LanguageContext'

const MOBILE_VIDEO = '/login-bg.mp4'
const DESKTOP_VIDEO = '/login-bg-desktop.mp4'
const MOBILE_POSTER = '/login-bg.jpg'
const DESKTOP_POSTER = '/login-bg-desktop.jpg'
const DESKTOP_QUERY = '(min-width: 768px)'

function useDesktopAuth() {
  const [desktop, setDesktop] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(DESKTOP_QUERY).matches))
  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY)
    const onChange = () => setDesktop(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return desktop
}

export function AuthLayout() {
  const { user, settings, toasts, dismissToast } = useApp()
  const videoRef = useRef<HTMLVideoElement>(null)
  const desktop = useDesktopAuth()
  const [desktopReady, setDesktopReady] = useState(true)
  const videoSrc = desktop && desktopReady ? DESKTOP_VIDEO : MOBILE_VIDEO
  const posterSrc = desktop ? DESKTOP_POSTER : MOBILE_POSTER

  useEffect(() => {
    setDesktopReady(true)
  }, [desktop])

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
  }, [videoSrc])

  if (user) return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/employee/dashboard'} replace />
  return (
    <div className="auth-shell">
      <img src={posterSrc} alt="" className="auth-video-fallback" onError={(event) => { event.currentTarget.src = MOBILE_POSTER }} />
      <video
        key={videoSrc}
        ref={videoRef}
        className="auth-video"
        autoPlay
        muted
        loop
        playsInline
        poster={posterSrc}
        onError={() => {
          if (videoSrc === DESKTOP_VIDEO) setDesktopReady(false)
        }}
      >
        <source src={videoSrc} type="video/mp4" />
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
