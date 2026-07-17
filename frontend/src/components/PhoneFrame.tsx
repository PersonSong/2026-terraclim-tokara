import type { ReactNode } from 'react'
import './PhoneFrame.css'

function SignalIcon() {
  return (
    <svg width="17" height="12" viewBox="0 0 17 12" fill="none" aria-hidden="true">
      <rect x="0" y="7" width="3" height="5" rx="0.5" fill="currentColor" />
      <rect x="4.5" y="4.5" width="3" height="7.5" rx="0.5" fill="currentColor" />
      <rect x="9" y="2" width="3" height="10" rx="0.5" fill="currentColor" />
      <rect x="13.5" y="0" width="3" height="12" rx="0.5" fill="currentColor" />
    </svg>
  )
}

function WifiIcon() {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" fill="none" aria-hidden="true">
      <circle cx="8" cy="10.5" r="1.25" fill="currentColor" />
      <path
        d="M4.8 8C5.8 7 6.9 6.5 8 6.5s2.2.5 3.2 1.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M2 5.5C3.8 3.7 5.8 2.75 8 2.75s4.2.95 6 2.75"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function BatteryIcon() {
  return (
    <svg width="24" height="12" viewBox="0 0 24 12" fill="none" aria-hidden="true">
      <rect x="0.75" y="0.75" width="20.5" height="10.5" rx="2.5" stroke="currentColor" strokeWidth="1" />
      <rect x="2.5" y="2.5" width="16.5" height="7" rx="1" fill="currentColor" />
      <rect x="22" y="4" width="1.5" height="4" rx="0.75" fill="currentColor" />
    </svg>
  )
}

interface PhoneFrameProps {
  children: ReactNode
}

function PhoneFrame({ children }: PhoneFrameProps) {
  return (
    <div className="phone-frame-backdrop">
      <div className="phone-frame">
        <div className="phone-frame__screen">
          <div className="phone-frame__status-bar">
            <span className="phone-frame__time">9:41</span>
            <div className="phone-frame__notch" />
            <div className="phone-frame__status-icons">
              <SignalIcon />
              <WifiIcon />
              <BatteryIcon />
            </div>
          </div>

          <div className="phone-frame__content">{children}</div>

          <div className="phone-frame__home-indicator" />
        </div>
      </div>
    </div>
  )
}

export default PhoneFrame
