import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { sendChatMessage } from '../api'
import './ChatWidget.css'

type MessageRole = 'user' | 'assistant' | 'error'

interface ChatMessage {
  role: MessageRole
  text: string
}

const GREETING: ChatMessage = {
  role: 'assistant',
  text: "Hi, I'm the Tokara Vineyard Watch assistant. Ask me about today's block status or irrigation recommendations.",
}

const DISCLAIMER =
  "Offers general guidance based on today's data — not a substitute for an on-site assessment."

interface ChatWidgetProps {
  date: string
}

function ChatWidget({ date }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [topOffset, setTopOffset] = useState<number | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([GREETING])
    }
  }, [isOpen, messages.length])

  useEffect(() => {
    // Scroll only the message list itself — scrollIntoView() on a sentinel
    // node can cascade up through ancestor scroll containers (including the
    // phone-frame's own scroll area), shifting the whole page and throwing
    // off the header-height measurement below.
    const container = messagesContainerRef.current
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }, [messages, isLoading])

  // Measure the dashboard header so the popup starts exactly below it and
  // covers everything beneath (map, toggles, etc.) — computed live rather
  // than hardcoded so it stays correct regardless of header content, and
  // relative to whichever element actually establishes the containing
  // block for `position: fixed` here (the phone-frame screen when wrapped
  // in the /demo/* mockup, the real viewport otherwise).
  useEffect(() => {
    if (!isOpen) return

    function measure() {
      const header = document.querySelector('.dashboard-header')
      if (!header) return
      const headerRect = header.getBoundingClientRect()
      const fixedContainer = header.closest('.phone-frame__screen')
      const containerTop = fixedContainer ? fixedContainer.getBoundingClientRect().top : 0
      setTopOffset(headerRect.bottom - containerTop)
    }

    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [isOpen])

  async function handleSend(event: SubmitEvent) {
    event.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    setMessages((prev) => [...prev, { role: 'user', text: trimmed }])
    setInput('')
    setIsLoading(true)

    try {
      const response = await sendChatMessage(trimmed, date)
      setMessages((prev) => [...prev, { role: 'assistant', text: response.reply }])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.'
      setMessages((prev) => [
        ...prev,
        { role: 'error', text: `Couldn't reach the assistant — ${message}` },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="chat-button"
        aria-label={isOpen ? 'Close vineyard assistant' : 'Open vineyard assistant'}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        {isOpen ? '×' : '🌿'}
      </button>

      {isOpen && (
        <div
          className="chat-widget"
          role="dialog"
          aria-label="Vineyard assistant chat"
          style={topOffset !== null ? { top: topOffset } : undefined}
        >
          <div className="chat-widget__header">
            <span className="chat-widget__title">Vineyard Assistant</span>
            <button
              type="button"
              className="chat-widget__close"
              aria-label="Close chat"
              onClick={() => setIsOpen(false)}
            >
              ×
            </button>
          </div>

          <p className="chat-widget__disclaimer">{DISCLAIMER}</p>

          <div className="chat-widget__messages" ref={messagesContainerRef}>
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`chat-widget__message chat-widget__message--${msg.role}`}
              >
                {msg.text}
              </div>
            ))}
            {isLoading && (
              <div className="chat-widget__message chat-widget__message--assistant chat-widget__message--loading">
                Thinking…
              </div>
            )}
          </div>

          <form className="chat-widget__input-row" onSubmit={handleSend}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about today's blocks…"
              className="chat-widget__input"
              disabled={isLoading}
            />
            <button
              type="submit"
              className="chat-widget__send"
              disabled={isLoading || !input.trim()}
              aria-label="Send message"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </>
  )
}

export default ChatWidget
